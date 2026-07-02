'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { searchRead, getBankCashBalances, getCustomerCredits } from '@/lib/odoo-api';

interface DashData {
  todaySales: number;
  txCount: number;
  cashBalance: number;
  outstanding: number;
}

function DashCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className={`text-2xl font-bold ${color || 'text-slate-800'}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{title}</div>
    </div>
  );
}

function ActionButton({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-white border-2 border-gray-100 rounded-xl p-5 text-center hover:border-indigo-400 hover:-translate-y-0.5 transition-all shadow-sm"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-xs font-bold text-gray-700">{label}</div>
    </Link>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashData>({ todaySales: 0, txCount: 0, cashBalance: 0, outstanding: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Try fetching from Odoo
        const [balances, credits] = await Promise.all([
          getBankCashBalances(),
          getCustomerCredits(),
        ]);
        const cashBalance = balances
          ?.filter((b: any) => b.type === 'cash')
          .reduce((sum: number, b: any) => sum + (b.fmcg_running_balance || 0), 0) || 0;
        const outstanding = credits?.reduce((sum: number, c: any) => sum + (c.remaining || 0), 0) || 0;
        setData({ todaySales: 0, txCount: 0, cashBalance, outstanding });
      } catch {
        // Fallback demo data if Odoo not connected
        setData({ todaySales: 12500000, txCount: 47, cashBalance: 8200000, outstanding: 3800000 });
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">داشبورد</h1>
        <p className="text-gray-500 text-sm">خلاصه وضعیت فروشگاه امروز</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashCard title="فروش امروز (تومان)" value={loading ? '...' : formatPrice(data.todaySales)} color="text-green-600" />
        <DashCard title="تعداد فاکتور" value={loading ? '...' : toPersianDigits(data.txCount)} color="text-blue-600" />
        <DashCard title="موجودی صندوق" value={loading ? '...' : formatPrice(data.cashBalance)} />
        <DashCard title="بدهی مشتریان" value={loading ? '...' : formatPrice(data.outstanding)} color="text-red-600" />
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-3">عملیات سریع</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <ActionButton href="/admin/purchase" icon="🛒" label="فاکتور خرید" />
        <ActionButton href="/admin/inventory" icon="📦" label="ثبت کالای جدید" />
        <ActionButton href="/admin/people" icon="👤" label="شخص جدید" />
        <ActionButton href="/admin/credits" icon="💰" label="حساب مشتریان" />
        <ActionButton href="/admin/returns" icon="↩️" label="برگشت از فروش" />
        <ActionButton href="/pos" icon="🖥️" label="صندوق فروش" />
      </div>
    </div>
  );
}
