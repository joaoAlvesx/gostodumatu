// src/context/WishlistContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string | string[];
  description?: string;
  category?: string;
  originalPrice?: number;
  isNew?: boolean;
  producerId?: string;
}

interface WishlistContextType {
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  removeItem: (productId: string) => void;
  isOpen: boolean;
  openWishlist: () => void;
  closeWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    const saved = localStorage.getItem('@gostudumatu:wishlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('@gostudumatu:wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  const toggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) {
        return prev.filter((item) => item.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const removeItem = (productId: string) => {
    setWishlist((prev) => prev.filter((item) => item.id !== productId));
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some((item) => item.id === productId);
  };

  const openWishlist = () => setIsOpen(true);
  const closeWishlist = () => setIsOpen(false);

  return (
    <WishlistContext.Provider 
      value={{ 
        wishlist, 
        toggleWishlist, 
        isInWishlist, 
        removeItem, 
        isOpen, 
        openWishlist, 
        closeWishlist 
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist deve ser usado com WishlistProvider');
  return context;
};
