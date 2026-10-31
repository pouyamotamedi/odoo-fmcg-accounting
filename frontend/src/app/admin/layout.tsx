'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/stores/auth-store';
import { getSellerAccess } from '@/lib/odoo-api';
import { isSellerPathAllowed, sellerHomePath } from '@/lib/menus';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, role, isAdmin, allowedMenus, setAllowedMenus, setSimpleDashboard } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [menusSynced, setMenusSynced] = useState(false);
  // Mobile drawer; closed by the backdrop or by Sidebar's onNavigate when a link is tapped
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const isRestrictedSeller = hasHydrated && isLoggedIn && role === 'seller' && !isAdmin;

  // Always re-read seller menu access from the server, so changes made by the admin
  // (on any device) apply without the seller having to log out.
  useEffect(() => {
    if (!isRestrictedSeller) return;
    let cancelled = false;
    getSellerAccess()
      .then(({ menus, simpleDashboard }) => {
        if (cancelled) return;
        if (menus) setAllowedMenus(menus);
        if (simpleDashboard !== null) setSimpleDashboard(simpleDashboard);
        setMenusSynced(true);
      })
      .catch(() => { if (!cancelled) setMenusSynced(true); });
    return () => { cancelled = true; };
  }, [isRestrictedSeller, setAllowedMenus, setSimpleDashboard]);

  const sellerPathBlocked = isRestrictedSeller && !isSellerPathAllowed(pathname, allowedMenus);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLoggedIn) {
      router.replace('/login');
    } else if (sellerPathBlocked && menusSynced) {
      router.replace(sellerHomePath(allowedMenus));
    }
  }, [hasHydrated, isLoggedIn, sellerPathBlocked, menusSynced, allowedMenus, router]);

  if (!hasHydrated || !isLoggedIn) return null;
  if (sellerPathBlocked) {
    return <div className="py-12 text-center text-gray-400">{menusSynced ? 'انتقال...' : 'بارگذاری دسترسی‌ها...'}</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:block print:hidden shrink-0">
        <Sidebar />
      </div>

      {/* Mobile: off-canvas drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden print:hidden fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label="منوی اصلی">
          <div className="shrink-0 shadow-2xl">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="بستن منو"
            className="flex-1 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      <div className="min-w-0 flex-1 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden print:hidden sticky top-0 z-40 flex items-center justify-between gap-2 bg-slate-800 px-3 py-2 text-white shadow">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="باز کردن منو"
            aria-expanded={mobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-slate-700"
          >
            ☰
          </button>
          <span className="truncate text-sm font-bold">پنل مدیریت</span>
          <Link
            href="/pos"
            className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold hover:bg-green-700"
          >
            🖥️ صندوق
          </Link>
        </header>
        <main className="min-w-0 flex-1 bg-gray-50 p-3 md:p-6 overflow-auto print:p-0 print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
