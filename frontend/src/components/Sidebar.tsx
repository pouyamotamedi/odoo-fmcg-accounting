'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCompanyStore } from '@/stores/company-store';
import { useAuthStore } from '@/stores/auth-store';
import { getCompanySettings, logout as odooLogout } from '@/lib/odoo-api';

const menuItems = [
  { href: '/admin', label: 'داشبورد', icon: '📊', key: 'dashboard' },
  { href: '/admin/purchase', label: 'فاکتور خرید', icon: '🛒', key: 'purchase' },
  { href: '/admin/inventory', label: 'انبار و کالاها', icon: '📦', key: 'inventory' },
  { href: '/admin/people', label: 'اشخاص', icon: '👥', key: 'people' },
  { href: '/admin/accounts', label: 'حساب اشخاص', icon: '📒', key: 'accounts' },
  { href: '/admin/treasury', label: 'بانک و صندوق', icon: '🏦', key: 'treasury' },
  { href: '/admin/reconciliation', label: 'مغایرت‌گیری', icon: '🔄', key: 'reconciliation' },
  { href: '/admin/accounting', label: 'اسناد حسابداری', icon: '📋', key: 'accounting' },
  { href: '/admin/chart-of-accounts', label: 'سرفصل حساب‌ها', icon: '🗂️', key: 'chart-of-accounts' },
  { href: '/admin/reports', label: 'گزارش‌ها', icon: '📈', key: 'reports' },
  { href: '/admin/analytics', label: 'تحلیل مدیریتی', icon: '📊', key: 'analytics' },
  { href: '/admin/returns', label: 'برگشت از فروش', icon: '↩️', key: 'returns' },
  { href: '/admin/discounts', label: 'تخفیفات', icon: '🏷️', key: 'discounts' },
  { href: '/admin/stock-count', label: 'انبارگردانی', icon: '📋', key: 'stock-count' },
  { href: '/admin/fiscal-year', label: 'سال مالی', icon: '📅', key: 'fiscal-year' },
  { href: '/admin/settings', label: 'تنظیمات', icon: '⚙️', key: 'settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { name: companyName, setCompany } = useCompanyStore();
  const { name: userName, role, logout: authLogout } = useAuthStore();

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

  return (
    <aside className="w-60 bg-slate-800 text-white h-screen flex flex-col sticky top-0 overflow-y-auto">
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
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-5 py-3 text-sm transition-colors',
              pathname === item.href
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
