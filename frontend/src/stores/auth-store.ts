import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'admin' | 'seller';

interface AuthState {
  isLoggedIn: boolean;
  uid: number | null;
  name: string;
  username: string;
  role: UserRole;
  login: (uid: number, name: string, username: string, role: UserRole) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      uid: null,
      name: '',
      username: '',
      role: 'seller',
      login: (uid, name, username, role) =>
        set({ isLoggedIn: true, uid, name, username, role }),
      logout: () =>
        set({ isLoggedIn: false, uid: null, name: '', username: '', role: 'seller' }),
    }),
    { name: 'fmcg-auth' }
  )
);
