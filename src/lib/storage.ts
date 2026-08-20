import { supabase } from "@/integrations/supabase/client";

const BUCKET = "catalog-images";
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 1800;
const WEBP_QUALITY = 0.82;

export type PendingImage = { file: File; previewUrl: string };

export function validateImageFile(file: File): void {
  if (!file.type.startsWith("image/")) throw new Error("Selecione apenas arquivos de imagem.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Cada imagem deve ter no máximo 10 MB.");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(source);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error("Não foi possível processar a imagem."));
    };
    image.src = source;
  });
}

async function optimizeImage(file: File): Promise<Blob> {
  validateImageFile(file);
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu otimizar a imagem.");
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob) throw new Error("Não foi possível converter a imagem para WebP.");
  return blob;
}

async function uploadImage(file: File, path: string): Promise<string> {
  const optimized = await optimizeImage(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadProductImages(
  files: File[],
  productId: string,
  producerId: string | null,
): Promise<string[]> {
  const ownerFolder = producerId ?? "admin";
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      uploaded.push(
        await uploadImage(file, `products/${ownerFolder}/${productId}/${crypto.randomUUID()}.webp`),
      );
    }
    return uploaded;
  } catch (error) {
    try {
      await deleteCatalogImages(uploaded);
    } catch (cleanupError) {
      console.error("Não foi possível limpar uploads parciais:", cleanupError);
    }
    throw error;
  }
}

export function uploadProducerImage(file: File, producerId: string): Promise<string> {
  return uploadImage(file, `producers/${producerId}/${crypto.randomUUID()}.webp`);
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.slice(markerIndex + marker.length).split("?")[0]);
}

export async function deleteCatalogImages(urls: string[]): Promise<void> {
  const paths = urls.map(storagePathFromPublicUrl).filter((path): path is string => Boolean(path));
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
