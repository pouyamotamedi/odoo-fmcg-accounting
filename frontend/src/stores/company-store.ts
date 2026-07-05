import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanyState {
  name: string;
  id: number;
  loaded: boolean;
  setCompany: (id: number, name: string) => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      name: '',
      id: 0,
      loaded: false,
      setCompany: (id, name) => set({ id, name, loaded: true }),
    }),
    { name: 'fmcg-company' }
  )
);
