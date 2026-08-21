import { execFileSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";

const TARGET_PATH = "src/integrations/supabase/types.ts";
const TEMP_PATH = `${TARGET_PATH}.tmp`;

function runSupabase(args) {
  return execFileSync("npx", ["--yes", "supabase@latest", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 20 * 1024 * 1024,
  });
}

const status = JSON.parse(runSupabase(["status", "-o", "json"]));
if (!status.API_URL?.startsWith("http://127.0.0.1:")) {
  throw new Error("Proteção acionada: os tipos só podem ser gerados pelo Supabase local.");
}

const generatedTypes = runSupabase(["gen", "types", "typescript", "--local"]);
if (!generatedTypes.includes("export type Database") || generatedTypes.length < 1000) {
  throw new Error("A CLI retornou tipos incompletos; o arquivo atual foi preservado.");
}

writeFileSync(TEMP_PATH, `${generatedTypes.trimEnd()}\n`, { mode: 0o600 });
renameSync(TEMP_PATH, TARGET_PATH);
console.log(`Tipos locais atualizados em ${TARGET_PATH}.`);
