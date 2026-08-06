import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'admin' | 'seller';

interface AuthState {
  isLoggedIn: boolean;
  uid: number | null;
  name: string;
  username: string;
  role: UserRole;
  isAdmin: boolean;
  allowedMenus: string[]; // empty = all allowed (for admin)
  login: (uid: number, name: string, username: string, role: UserRole, isAdmin: boolean) => void;
  logout: () => void;
  setAllowedMenus: (menus: string[]) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      uid: null,
      name: '',
      username: '',
      role: 'seller',
      isAdmin: false,
      allowedMenus: [],
      login: (uid, name, username, role, isAdmin) =>
        set({ isLoggedIn: true, uid, name, username, role, isAdmin }),
      logout: () =>
        set({ isLoggedIn: false, uid: null, name: '', username: '', role: 'seller', isAdmin: false }),
      setAllowedMenus: (menus) => set({ allowedMenus: menus }),
    }),
    { name: 'fmcg-auth' }
  )
);
