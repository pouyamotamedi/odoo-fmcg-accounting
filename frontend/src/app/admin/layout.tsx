'use client';

import { useEffect } from 'react';
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

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    } else if (role === 'seller' && !isAdmin) {
      router.replace('/pos');
    }
  }, [isLoggedIn, role, isAdmin, router]);

  // Don't render admin panel for unauthorized users
  if (!isLoggedIn || (role === 'seller' && !isAdmin)) {
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
