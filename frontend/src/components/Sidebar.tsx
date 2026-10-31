'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCompanyStore } from '@/stores/company-store';
import { useAuthStore } from '@/stores/auth-store';
import { getCompanySettings, logout as odooLogout } from '@/lib/odoo-api';
import { isMenuActive, visibleMenusFor } from '@/lib/menus';


interface SidebarProps {
  /** Called after a link is tapped (used to close the mobile drawer). */
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { name: companyName, setCompany } = useCompanyStore();
  const { name: userName, role, isAdmin, allowedMenus, logout: authLogout } = useAuthStore();

  useEffect(() => {
    if (!companyName) {
      getCompanySettings().then((data) => {
        if (data) setCompany(data.id, data.name);
      }).catch(() => {});
    }
  }, [companyName, setCompany]);

  async function handleLogout() {
    try {
      await odooLogout();
    } catch { /* ignore */ }
    authLogout();
    router.push('/login');
  }

  // Sellers only see the menus the admin allowed in Settings (loaded from the server)
  const visibleMenus = visibleMenusFor(isAdmin || role === 'admin', allowedMenus);

  return (
    <aside className="w-64 max-w-[80vw] md:w-60 bg-slate-800 text-white h-[100dvh] flex flex-col sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700 text-center">
        <h2 className="text-lg font-bold">🏪 {companyName || 'فروشگاه من'}</h2>
        <p className="text-xs text-slate-400 mt-1">پنل مدیریت</p>
        {userName && (
          <p className="text-[10px] text-slate-500 mt-0.5">{userName}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {visibleMenus.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-5 py-3 text-sm transition-colors',
              isMenuActive(item.href, pathname)
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            )}
          >
            <span className="w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* POS Link + Logout */}
      <div className="p-4 border-t border-slate-700 space-y-2">
        <Link
          href="/pos"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 text-sm font-bold transition"
        >
          🖥️ صندوق فروش
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-600/80 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-bold transition"
        >
          🚪 خروج
        </button>
      </div>
    </aside>
  );
}
