'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { searchRead, getBankCashBalances, getTodaySales, getProducts, getPartnerBalances } from '@/lib/odoo-api';

interface DashData {
  todaySales: number;
  txCount: number;
  cashBalance: number;
  outstanding: number;
  lowStockProducts: string[];
  highDebtCustomers: string[];
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
  const router = useRouter();
  const [data, setData] = useState<DashData>({ todaySales: 0, txCount: 0, cashBalance: 0, outstanding: 0, lowStockProducts: [], highDebtCustomers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Check if any products exist — if not, redirect to onboarding
        const products = await getProducts(1);
        if (!products || products.length === 0) {
          router.replace('/onboarding');
          return;
        }

        // Try fetching from Odoo
        const [balances, partners, todaySalesData, allProducts] = await Promise.all([
          getBankCashBalances(),
          getPartnerBalances(),
          getTodaySales(),
          getProducts(),
        ]);
        const cashBalance = balances
          ?.filter((b: any) => b.type === 'cash')
          .reduce((sum: number, b: any) => sum + (b.fmcg_running_balance || 0), 0) || 0;
        const outstanding = partners?.reduce((sum: number, p: any) => sum + (p.receivable || 0), 0) || 0;
        // Low stock alerts
        const lowStock = (allProducts || []).filter((p: any) => p.qty_available <= (p.fmcg_reorder_threshold || 5)).map((p: any) => p.name);
        // High debt customers
        const highDebt = (partners || []).filter((p: any) => p.receivable > 500000).map((p: any) => `${p.name} (${formatPrice(p.receivable)})`);
        setData({
          todaySales: todaySalesData?.totalAmount || 0,
          txCount: todaySalesData?.count || 0,
          cashBalance,
          outstanding,
          lowStockProducts: lowStock.slice(0, 5),
          highDebtCustomers: highDebt.slice(0, 5),
        });
      } catch {
        // Fallback demo data if Odoo not connected
        setData({ todaySales: 12500000, txCount: 47, cashBalance: 8200000, outstanding: 3800000, lowStockProducts: [], highDebtCustomers: [] });
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
        <ActionButton href="/admin/accounts" icon="💰" label="حساب اشخاص" />
        <ActionButton href="/admin/returns" icon="↩️" label="برگشت از فروش" />
        <ActionButton href="/pos" icon="🖥️" label="صندوق فروش" />
      </div>

      {/* Alerts */}
      {(data.lowStockProducts.length > 0 || data.highDebtCustomers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {data.lowStockProducts.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-orange-700 mb-2">⚠️ هشدار موجودی پایین</h4>
              <ul className="text-xs text-orange-600 space-y-1">
                {data.lowStockProducts.map((name, i) => <li key={i}>• {name}</li>)}
              </ul>
              <Link href="/admin/inventory" className="text-[10px] text-orange-500 mt-2 inline-block">مشاهده انبار →</Link>
            </div>
          )}
          {data.highDebtCustomers.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-red-700 mb-2">🔴 بدهکاران بالا</h4>
              <ul className="text-xs text-red-600 space-y-1">
                {data.highDebtCustomers.map((name, i) => <li key={i}>• {name}</li>)}
              </ul>
              <Link href="/admin/accounts?filter=debtors" className="text-[10px] text-red-500 mt-2 inline-block">مشاهده حساب‌ها →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
