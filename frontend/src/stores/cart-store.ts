import { create } from 'zustand';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: { id: number; name: string; price: number }) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  updatePrice: (id: number, price: number) => void;
  updateAllPrices: (priceMap: Map<number, number>) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((item) => item.id === product.id);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return { items: [...state.items, { ...product, quantity: 1 }] };
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  updateQuantity: (id, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return { items: state.items.filter((item) => item.id !== id) };
      }
      return {
        items: state.items.map((item) =>
          item.id === id ? { ...item, quantity } : item
        ),
      };
    }),

  updatePrice: (id, price) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, price } : item
      ),
    })),

  updateAllPrices: (priceMap) =>
    set((state) => ({
      items: state.items.map((item) => {
        const newPrice = priceMap.get(item.id);
        return newPrice !== undefined ? { ...item, price: newPrice } : item;
      }),
    })),

  clearCart: () => set({ items: [] }),

  total: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
}));
