'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/stores/auth-store';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isLoggedIn, role, isAdmin } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const persist = useAuthStore.persist;
    if (!persist) return;
    const unsubscribe = persist.onFinishHydration(() => setHasHydrated(true));
    if (persist.hasHydrated()) {
      const timer = window.setTimeout(() => setHasHydrated(true), 0);
      return () => {
        window.clearTimeout(timer);
        unsubscribe();
      };
    }
    return unsubscribe;
  }, []);

  const sellerHasNoMenus = (() => {
    if (!hasHydrated || role !== 'seller' || isAdmin) return false;
    try {
      const savedMenus = localStorage.getItem('seller_allowed_menus');
      return !savedMenus || JSON.parse(savedMenus).length === 0;
    } catch {
      return true;
    }
  })();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
    } else if (sellerHasNoMenus) {
      router.replace('/pos');
    }
  }, [hasHydrated, isLoggedIn, sellerHasNoMenus, router]);

  if (!hasHydrated || !isLoggedIn || sellerHasNoMenus) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden shrink-0">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1 bg-gray-50 p-6 overflow-auto print:p-0 print:bg-white">
        {children}
      </main>
    </div>
  );
}
