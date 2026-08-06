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
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (role === 'seller' && !isAdmin) {
      // Check if seller has allowed menus
      try {
        const savedMenus = localStorage.getItem('seller_allowed_menus');
        const allowedMenus = savedMenus ? JSON.parse(savedMenus) : [];
        if (allowedMenus.length === 0) {
          router.replace('/pos');
          setAllowed(false);
        }
      } catch {
        router.replace('/pos');
        setAllowed(false);
      }
    }
  }, [isLoggedIn, role, isAdmin, router]);

  if (!isLoggedIn || !allowed) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="flex-1 bg-gray-50 p-6 overflow-auto print:p-0 print:bg-white">
        {children}
      </main>
    </div>
  );
}
