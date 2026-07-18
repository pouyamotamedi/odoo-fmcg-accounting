'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatPrice, toPersianDigits, toJalali } from '@/lib/utils';
import { searchRead, getBankCashBalances, getTodaySales, getProducts, getPartnerBalances } from '@/lib/odoo-api';
import * as jalaali from 'jalaali-js';

interface DashData {
  todaySales: number;
  txCount: number;
  cashBalance: number;
  outstanding: number;
  lowStockProducts: string[];
  highDebtCustomers: string[];
}

interface ChartPoint {
  label: string;
  date: string;
  sales: number;
  purchases: number;
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

// Jalali month names
const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const WEEKDAYS_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

/** Convert gregorian date string to Jalali day label */
function toJalaliLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const { jd } = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const weekday = WEEKDAYS_SHORT[d.getDay()];
  return `${weekday} ${toPersianDigits(jd)}`;
}

/** Convert gregorian date to Jalali month label */
function toJalaliMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const { jm } = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return JALALI_MONTHS[jm - 1];
}

/** Format compact price for chart (e.g., 2.5M) */
function compactPrice(amount: number): string {
  if (amount === 0) return '';
  if (amount >= 1000000) return toPersianDigits((amount / 1000000).toFixed(1).replace('.0', '')) + 'M';
  if (amount >= 1000) return toPersianDigits(Math.round(amount / 1000).toString()) + 'K';
  return toPersianDigits(amount.toString());
}

function getDateRange(period: 'daily' | 'weekly' | 'monthly', customFrom?: string, customTo?: string): { from: string; to: string; points: number } {
  const today = new Date();
  if (customFrom && customTo) {
    const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime();
    const diffDays = Math.ceil(diffMs / 864e5) + 1;
    return { from: customFrom, to: customTo, points: Math.min(diffDays, 60) };
  }
  switch (period) {
    case 'daily': {
      const from = new Date(today.getTime() - 13 * 864e5);
      return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0], points: 14 };
    }
    case 'weekly': {
      const from = new Date(today.getTime() - 7 * 7 * 864e5);
      return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0], points: 8 };
    }
    case 'monthly': {
      const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0], points: 6 };
    }
  }
}

function SalesChart() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPurchases, setShowPurchases] = useState(true);

  useEffect(() => {
    loadChart();
  }, [period, dateFrom, dateTo]);

  async function loadChart() {
    setLoading(true);
    try {
      const { from, to } = getDateRange(period, dateFrom || undefined, dateTo || undefined);

      // Fetch all sales and purchases in range
      const [sales, purchases] = await Promise.all([
        searchRead('account.move', [
          ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
          ['invoice_date', '>=', from], ['invoice_date', '<=', to],
        ], ['amount_total', 'invoice_date']),
        searchRead('account.move', [
          ['move_type', '=', 'in_invoice'], ['state', '=', 'posted'],
          ['invoice_date', '>=', from], ['invoice_date', '<=', to],
        ], ['amount_total', 'invoice_date']),
      ]);

      // Group by period
      const points: ChartPoint[] = [];

      if (period === 'monthly' && !dateFrom) {
        // Group by month
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
          const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
          const monthSales = (sales || []).filter((s: any) => s.invoice_date?.startsWith(monthStr)).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          const monthPurchases = (purchases || []).filter((s: any) => s.invoice_date?.startsWith(monthStr)).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          points.push({ label: toJalaliMonthLabel(monthStr + '-15'), date: monthStr, sales: monthSales, purchases: monthPurchases });
        }
      } else if (period === 'weekly' && !dateFrom) {
        // Group by week
        const today = new Date();
        for (let w = 7; w >= 0; w--) {
          const weekStart = new Date(today.getTime() - (w * 7 + today.getDay()) * 864e5);
          const weekEnd = new Date(weekStart.getTime() + 6 * 864e5);
          const wsStr = weekStart.toISOString().split('T')[0];
          const weStr = weekEnd.toISOString().split('T')[0];
          const weekSales = (sales || []).filter((s: any) => s.invoice_date >= wsStr && s.invoice_date <= weStr).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          const weekPurchases = (purchases || []).filter((s: any) => s.invoice_date >= wsStr && s.invoice_date <= weStr).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          points.push({ label: toJalaliLabel(wsStr), date: wsStr, sales: weekSales, purchases: weekPurchases });
        }
      } else {
        // Daily
        const fromDate = new Date(dateFrom || from);
        const toDate = new Date(dateTo || to);
        const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 864e5) + 1;
        const maxPoints = Math.min(diffDays, 30);
        const step = Math.max(1, Math.floor(diffDays / maxPoints));

        for (let i = 0; i < diffDays; i += step) {
          const d = new Date(fromDate.getTime() + i * 864e5);
          const dStr = d.toISOString().split('T')[0];
          const daySales = (sales || []).filter((s: any) => s.invoice_date === dStr).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          const dayPurchases = (purchases || []).filter((s: any) => s.invoice_date === dStr).reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0);
          const dayLabel = toJalaliLabel(dStr);
          points.push({ label: dayLabel, date: dStr, sales: daySales, purchases: dayPurchases });
        }
      }

      setChartData(points);
    } catch { setChartData([]); }
    setLoading(false);
  }

  const maxAmt = Math.max(...chartData.map(d => Math.max(d.sales, d.purchases)), 1);
  const totalSales = chartData.reduce((s, d) => s + d.sales, 0);
  const totalPurchases = chartData.reduce((s, d) => s + d.purchases, 0);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h3 className="text-sm font-bold text-slate-700">📊 نمودار فروش و خرید</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition ${period === p && !dateFrom ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {p === 'daily' ? 'روزانه' : p === 'weekly' ? 'هفتگی' : 'ماهانه'}
              </button>
            ))}
          </div>
          {/* Date filters */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="p-1 border border-gray-200 rounded text-[10px] w-28"
            title="از تاریخ"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="p-1 border border-gray-200 rounded text-[10px] w-28"
            title="تا تاریخ"
          />
          {/* Toggle purchases */}
          <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showPurchases} onChange={(e) => setShowPurchases(e.target.checked)} className="w-3 h-3" />
            خرید
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-400 inline-block"></span> فروش: <b>{formatPrice(totalSales)}</b></span>
        {showPurchases && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block"></span> خرید: <b>{formatPrice(totalPurchases)}</b></span>}
        <span className="text-gray-400">|</span>
        <span className={totalSales - totalPurchases >= 0 ? 'text-green-600' : 'text-red-600'}>
          سود ناخالص: <b>{formatPrice(totalSales - totalPurchases)}</b>
        </span>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">بارگذاری نمودار...</div>
      ) : chartData.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">داده‌ای یافت نشد</div>
      ) : (
        <div dir="ltr" className="mt-2" style={{ height: '180px' }}>
          <div className="flex items-end gap-1 h-full px-1">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 min-w-[28px] flex flex-col items-center h-full group cursor-pointer">
                {/* Bar area */}
                <div className="flex gap-px w-full items-end flex-1 relative">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] rounded px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg">
                    {formatPrice(d.sales)}{showPurchases && d.purchases > 0 ? ` | ${formatPrice(d.purchases)}` : ''}
                  </div>
                  {/* Sales bar */}
                  <div
                    className="flex-1 bg-indigo-400 rounded-t-sm transition-all group-hover:bg-indigo-500 self-end"
                    style={{ height: `${Math.max((d.sales / maxAmt) * 100, 3)}%` }}
                  />
                  {/* Purchases bar */}
                  {showPurchases && (
                    <div
                      className="flex-1 bg-orange-300 rounded-t-sm transition-all group-hover:bg-orange-400 self-end"
                      style={{ height: `${Math.max((d.purchases / maxAmt) * 100, 3)}%` }}
                    />
                  )}
                </div>
                {/* Label */}
                <div className="text-[9px] text-gray-500 text-center leading-tight mt-1 shrink-0" dir="rtl">{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashData>({ todaySales: 0, txCount: 0, cashBalance: 0, outstanding: 0, lowStockProducts: [], highDebtCustomers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Check if any products exist — if not, show empty state (don't redirect to onboarding)
        const products = await getProducts(1);
        if (!products || products.length === 0) {
          // Fresh install - just show empty dashboard
          setData({ todaySales: 0, txCount: 0, cashBalance: 0, outstanding: 0, lowStockProducts: [], highDebtCustomers: [] });
          setLoading(false);
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
        // Low stock alerts — only variants that have SOME stock but below threshold
        const lowStock = (allProducts || [])
          .filter((p: any) => {
            const threshold = p.fmcg_reorder_threshold || 5;
            return p.qty_available > 0 && p.qty_available <= threshold;
          })
          .map((p: any) => `${p.display_name || p.name} (${toPersianDigits(Math.round(p.qty_available))} عدد)`);
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

      {/* Enhanced Sales Chart */}
      <SalesChart />

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
