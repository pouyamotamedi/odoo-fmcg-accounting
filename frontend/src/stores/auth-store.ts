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
  allowedMenus: string[]; // seller-visible menu keys (loaded from the server; ignored for admins)
  simpleDashboard: boolean; // sellers see a simple dashboard instead of the main one (incentive settings)
  login: (uid: number, name: string, username: string, role: UserRole, isAdmin: boolean) => void;
  logout: () => void;
  setAllowedMenus: (menus: string[]) => void;
  setSimpleDashboard: (value: boolean) => void;
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
      simpleDashboard: false,
      login: (uid, name, username, role, isAdmin) =>
        set({ isLoggedIn: true, uid, name, username, role, isAdmin }),
      logout: () =>
        set({ isLoggedIn: false, uid: null, name: '', username: '', role: 'seller', isAdmin: false, allowedMenus: [], simpleDashboard: false }),
      setAllowedMenus: (menus) => set({ allowedMenus: menus }),
      setSimpleDashboard: (value) => set({ simpleDashboard: value }),
    }),
    { name: 'fmcg-auth' }
  )
);
