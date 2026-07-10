'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCompanyStore } from '@/stores/company-store';
import { getCompanySettings } from '@/lib/odoo-api';

const menuItems = [
  { href: '/admin', label: 'داشبورد', icon: '📊' },
  { href: '/admin/purchase', label: 'فاکتور خرید', icon: '🛒' },
  { href: '/admin/inventory', label: 'انبار و کالاها', icon: '📦' },
  { href: '/admin/people', label: 'اشخاص', icon: '👥' },
  { href: '/admin/accounts', label: 'حساب اشخاص', icon: '📒' },
  { href: '/admin/treasury', label: 'بانک و صندوق', icon: '🏦' },
  { href: '/admin/accounting', label: 'اسناد حسابداری', icon: '📋' },
  { href: '/admin/chart-of-accounts', label: 'سرفصل حساب‌ها', icon: '🗂️' },
  { href: '/admin/reports', label: 'گزارش‌ها', icon: '📈' },
  { href: '/admin/returns', label: 'برگشت از فروش', icon: '↩️' },
  { href: '/admin/discounts', label: 'تخفیفات', icon: '🏷️' },
  { href: '/admin/stock-count', label: 'انبارگردانی', icon: '📋' },
  { href: '/admin/settings', label: 'تنظیمات', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { name: companyName, setCompany } = useCompanyStore();

  useEffect(() => {
    if (!companyName) {
      getCompanySettings().then((data) => {
        if (data) setCompany(data.id, data.name);
      }).catch(() => {});
    }
  }, [companyName, setCompany]);

  return (
    <aside className="w-60 bg-slate-800 text-white h-screen flex flex-col sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700 text-center">
        <h2 className="text-lg font-bold">🏪 {companyName || 'فروشگاه من'}</h2>
        <p className="text-xs text-slate-400 mt-1">پنل مدیریت</p>
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

      {/* POS Link */}
      <div className="p-4 border-t border-slate-700">
        <Link
          href="/pos"
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 text-sm font-bold transition"
        >
          🖥️ صندوق فروش
        </Link>
      </div>
    </aside>
  );
}
