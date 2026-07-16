'use client';

import { useState, useEffect } from 'react';
import { searchRead, getProducts } from '@/lib/odoo-api';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import * as jalaali from 'jalaali-js';

// ============ Types ============
interface SaleInvoice {
  id: number;
  name: string;
  amount_total: number;
  invoice_date: string;
  create_date: string;
  partner_id: [number, string] | false;
  invoice_line_ids: number[];
}

interface InvoiceLine {
  id: number;
  product_id: [number, string] | false;
  quantity: number;
  price_subtotal: number;
  price_unit: number;
}

interface ProductInfo {
  id: number;
  name: string;
  display_name: string;
  standard_price: number;
  list_price: number;
  qty_available: number;
}

type TabType = 'dashboard' | 'top-products' | 'profit-margin' | 'dead-stock' | 'smart-inventory' | 'time-analysis' | 'abc' | 'employees';

// ============ Helpers ============
function getJalaliMonthRange(): { from: string; to: string } {
  const now = new Date();
  const { jy, jm } = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const start = jalaali.toGregorian(jy, jm, 1);
  const monthLen = jalaali.jalaaliMonthLength(jy, jm);
  const end = jalaali.toGregorian(jy, jm, monthLen);
  return {
    from: `${start.gy}-${String(start.gm).padStart(2, '0')}-${String(start.gd).padStart(2, '0')}`,
    to: `${end.gy}-${String(end.gm).padStart(2, '0')}-${String(end.gd).padStart(2, '0')}`,
  };
}

function getPrevPeriod(from: string, to: string): { from: string; to: string } {
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  const prevTo = new Date(new Date(from).getTime() - 864e5);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  return { from: prevFrom.toISOString().split('T')[0], to: prevTo.toISOString().split('T')[0] };
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+∞' : '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${toPersianDigits(Math.round(pct))}%`;
}

function pctColor(current: number, previous: number): string {
  if (previous === 0) return 'text-gray-500';
  return current >= previous ? 'text-green-600' : 'text-red-600';
}


export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabType>('dashboard');
  const monthRange = getJalaliMonthRange();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'داشبورد', icon: '📊' },
    { key: 'top-products', label: 'پرفروش‌ها', icon: '🏆' },
    { key: 'profit-margin', label: 'حاشیه سود', icon: '💰' },
    { key: 'dead-stock', label: 'خواب سرمایه', icon: '💤' },
    { key: 'smart-inventory', label: 'موجودی هوشمند', icon: '🧠' },
    { key: 'time-analysis', label: 'تحلیل زمانی', icon: '⏰' },
    { key: 'abc', label: 'ABC', icon: '🔤' },
    { key: 'employees', label: 'فروشنده‌ها', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">تحلیل و گزارشات مدیریتی</h1>
        <p className="text-gray-500 text-sm">تحلیل فروش، سودآوری، موجودی و عملکرد</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${tab === t.key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Date filter (shared) */}
      <div className="flex gap-3 mb-4 items-end flex-wrap print:hidden">
        {/* Period presets */}
        <div className="flex gap-1">
          {([
            { label: '۷ روز', days: 7 },
            { label: '۳۰ روز', days: 30 },
            { label: '۶ ماه', days: 180 },
            { label: '۱ سال', days: 365 },
          ]).map(p => (
            <button key={p.days} onClick={() => {
              const to = new Date().toISOString().split('T')[0];
              const from = new Date(Date.now() - p.days * 864e5).toISOString().split('T')[0];
              setDateFrom(from); setDateTo(to);
            }} className="px-2 py-1.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700">{p.label}</button>
          ))}
        </div>
        <div><label className="block text-[10px] text-gray-500 mb-1">از تاریخ</label><JalaliDatePicker value={dateFrom} onChange={setDateFrom} placeholder="از" /></div>
        <div><label className="block text-[10px] text-gray-500 mb-1">تا تاریخ</label><JalaliDatePicker value={dateTo} onChange={setDateTo} placeholder="تا" /></div>
        <button onClick={() => window.print()} className="text-xs bg-slate-700 text-white px-3 py-2 rounded-lg">🖨️ چاپ</button>
      </div>

      {/* Tab Content */}
      {tab === 'dashboard' && <DashboardTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'top-products' && <TopProductsTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'profit-margin' && <ProfitMarginTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'dead-stock' && <DeadStockTab />}
      {tab === 'smart-inventory' && <SmartInventoryTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'time-analysis' && <TimeAnalysisTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'abc' && <ABCTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'employees' && <EmployeesTab dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  );
}


// ============ DASHBOARD TAB ============
function DashboardTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      const prev = getPrevPeriod(dateFrom, dateTo);
      // Current period sales
      const curSales = await searchRead('account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['date', '>=', dateFrom], ['date', '<=', dateTo]], ['amount_total', 'partner_id']);
      // Previous period sales
      const prevSales = await searchRead('account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['date', '>=', prev.from], ['date', '<=', prev.to]], ['amount_total']);
      // Current period purchases (for gross margin)
      const curPurchases = await searchRead('account.move', [['move_type', '=', 'in_invoice'], ['state', '=', 'posted'], ['date', '>=', dateFrom], ['date', '<=', dateTo]], ['amount_total']);

      const curTotal = (curSales || []).reduce((s: number, r: any) => s + (r.amount_total || 0), 0);
      const prevTotal = (prevSales || []).reduce((s: number, r: any) => s + (r.amount_total || 0), 0);
      const curPurchaseTotal = (curPurchases || []).reduce((s: number, r: any) => s + (r.amount_total || 0), 0);
      const curCount = (curSales || []).length;
      const prevCount = (prevSales || []).length;
      const avgBasket = curCount > 0 ? curTotal / curCount : 0;
      const prevAvgBasket = prevCount > 0 ? prevTotal / prevCount : 0;
      const grossProfit = curTotal - curPurchaseTotal;
      const grossMarginPct = curTotal > 0 ? (grossProfit / curTotal) * 100 : 0;
      // Unique customers
      const uniqueCustomers = new Set((curSales || []).map((s: any) => s.partner_id?.[0]).filter(Boolean)).size;

      setData({ curTotal, prevTotal, curCount, prevCount, avgBasket, prevAvgBasket, grossProfit, grossMarginPct, uniqueCustomers, curPurchaseTotal });
    } catch { setData(null); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;
  if (!data) return <div className="text-center py-12 text-gray-400">خطا در دریافت داده</div>;

  const cards = [
    { label: 'فروش دوره', value: formatPrice(data.curTotal), prev: data.prevTotal, cur: data.curTotal, icon: '💵' },
    { label: 'تعداد فاکتور', value: toPersianDigits(data.curCount), prev: data.prevCount, cur: data.curCount, icon: '🧾' },
    { label: 'میانگین فاکتور', value: formatPrice(Math.round(data.avgBasket)), prev: data.prevAvgBasket, cur: data.avgBasket, icon: '🛒' },
    { label: 'سود ناخالص', value: formatPrice(data.grossProfit), prev: 0, cur: data.grossProfit, icon: '📈', noPct: true },
    { label: 'حاشیه سود', value: `${toPersianDigits(Math.round(data.grossMarginPct))}%`, prev: 0, cur: 0, icon: '📊', noPct: true },
    { label: 'تعداد مشتری', value: toPersianDigits(data.uniqueCustomers), prev: 0, cur: 0, icon: '👥', noPct: true },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="text-2xl mb-1">{c.icon}</div>
          <div className="text-xl font-bold text-slate-800">{c.value}</div>
          <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          {!c.noPct && <div className={`text-xs mt-1 font-bold ${pctColor(c.cur, c.prev)}`}>{pctChange(c.cur, c.prev)} نسبت به دوره قبل</div>}
        </div>
      ))}
    </div>
  );
}


// ============ TOP PRODUCTS TAB ============
function TopProductsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'qty' | 'amount' | 'profit'>('amount');

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      // Step 1: Get sale invoice IDs in period
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['id']);
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);

      if (invoiceIds.length === 0) { setData([]); setLoading(false); return; }

      // Step 2: Get invoice lines for these invoices
      const lines = await searchRead('account.move.line', [
        ['move_id', 'in', invoiceIds],
        ['product_id', '!=', false],
        ['quantity', '>', 0],
      ], ['product_id', 'quantity', 'price_subtotal', 'credit']);

      // Group by product
      const productMap = new Map<number, { name: string; qty: number; revenue: number }>();
      for (const l of (lines || [])) {
        const pid = l.product_id?.[0];
        const pname = l.product_id?.[1] || '';
        if (!pid || !pname) continue;
        if (!productMap.has(pid)) productMap.set(pid, { name: pname, qty: 0, revenue: 0 });
        const p = productMap.get(pid)!;
        p.qty += l.quantity || 0;
        // In Odoo 18, sale invoice lines have negative price_subtotal (credit side)
        // Use absolute value, or use credit field directly
        p.revenue += Math.abs(l.price_subtotal || 0);
      }

      // Get cost prices
      const productIds = [...productMap.keys()];
      const costMap = new Map<number, number>();
      if (productIds.length > 0) {
        const products = await searchRead('product.product', [['id', 'in', productIds]], ['id', 'standard_price']);
        for (const p of (products || [])) costMap.set(p.id, p.standard_price || 0);
      }

      const result = [...productMap.entries()].map(([id, info]) => {
        const cost = costMap.get(id) || 0;
        const totalCost = cost * info.qty;
        const profit = info.revenue - totalCost;
        const avgSellPrice = info.qty > 0 ? info.revenue / info.qty : 0;
        const profitPerUnit = avgSellPrice - cost;
        return { id, name: info.name, qty: info.qty, revenue: info.revenue, cost: totalCost, profit, marginPct: info.revenue > 0 ? (profit / info.revenue) * 100 : 0, avgBuyPrice: cost, avgSellPrice, profitPerUnit };
      });

      setData(result);
    } catch (e) { console.error('[TopProducts]', e); setData([]); }
    setLoading(false);
  }

  const sorted = [...data].sort((a, b) => sortBy === 'qty' ? b.qty - a.qty : sortBy === 'amount' ? b.revenue - a.revenue : b.profit - a.profit);
  const top20 = sorted.slice(0, 20);

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {([['qty', '🔢 تعداد'], ['amount', '💵 مبلغ فروش'], ['profit', '📈 سود']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortBy === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-right p-3 w-8">#</th>
            <th className="text-right p-3">کالا</th>
            <th className="text-right p-3">تعداد</th>
            <th className="text-right p-3">میانگین خرید</th>
            <th className="text-right p-3">میانگین فروش</th>
            <th className="text-right p-3">سود واحد</th>
            <th className="text-right p-3">سود کل</th>
            <th className="text-right p-3">حاشیه %</th>
          </tr></thead>
          <tbody>
            {top20.map((item, i) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-gray-400 text-xs">{toPersianDigits(i + 1)}</td>
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3">{toPersianDigits(Math.round(item.qty))}</td>
                <td className="p-3 text-gray-500">{formatPrice(Math.round(item.avgBuyPrice))}</td>
                <td className="p-3">{formatPrice(Math.round(item.avgSellPrice))}</td>
                <td className={`p-3 ${item.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(Math.round(item.profitPerUnit))}</td>
                <td className={`p-3 font-bold ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(item.profit)}</td>
                <td className="p-3 text-xs">{toPersianDigits(Math.round(item.marginPct))}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============ PROFIT MARGIN TAB ============
function ProfitMarginTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      // Step 1: Get sale invoice IDs
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['id']);
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);

      if (invoiceIds.length === 0) { setData([]); setLoading(false); return; }

      // Step 2: Get lines
      const lines = await searchRead('account.move.line', [
        ['move_id', 'in', invoiceIds],
        ['product_id', '!=', false],
        ['quantity', '>', 0],
      ], ['product_id', 'quantity', 'price_subtotal']);

      const productMap = new Map<number, { name: string; qty: number; revenue: number }>();
      for (const l of (lines || [])) {
        const pid = l.product_id?.[0];
        if (!pid) continue;
        if (!productMap.has(pid)) productMap.set(pid, { name: l.product_id?.[1] || '', qty: 0, revenue: 0 });
        const p = productMap.get(pid)!;
        p.qty += l.quantity || 0;
        // Absolute value because Odoo 18 stores sale lines as negative (credit)
        p.revenue += Math.abs(l.price_subtotal || 0);
      }

      const productIds = [...productMap.keys()];
      const costMap = new Map<number, number>();
      if (productIds.length > 0) {
        const products = await searchRead('product.product', [['id', 'in', productIds]], ['id', 'standard_price']);
        for (const p of (products || [])) costMap.set(p.id, p.standard_price || 0);
      }

      const result = [...productMap.entries()].map(([id, info]) => {
        const unitCost = costMap.get(id) || 0;
        const totalCost = unitCost * info.qty;
        const profit = info.revenue - totalCost;
        const marginPct = info.revenue > 0 ? (profit / info.revenue) * 100 : 0;
        return { id, name: info.name, qty: info.qty, revenue: info.revenue, unitCost, totalCost, profit, marginPct };
      }).sort((a, b) => b.marginPct - a.marginPct);

      setData(result);
    } catch (e) { console.error('[ProfitMargin]', e); setData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalProfit = data.reduce((s, d) => s + d.profit, 0);

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm font-bold">کل فروش: {formatPrice(totalRevenue)}</div>
        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm font-bold">کل سود: {formatPrice(totalProfit)}</div>
        <div className="bg-indigo-50 text-indigo-700 p-3 rounded-lg text-sm font-bold">حاشیه کلی: {toPersianDigits(totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0)}%</div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-right p-3">کالا</th>
            <th className="text-right p-3">تعداد</th>
            <th className="text-right p-3">میانگین خرید (واحد)</th>
            <th className="text-right p-3">میانگین فروش (واحد)</th>
            <th className="text-right p-3">سود واحد</th>
            <th className="text-right p-3">سود کل</th>
            <th className="text-right p-3">حاشیه %</th>
          </tr></thead>
          <tbody>
            {data.map((item) => {
              const avgSell = item.qty > 0 ? item.revenue / item.qty : 0;
              const profitPerUnit = avgSell - item.unitCost;
              return (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3">{toPersianDigits(Math.round(item.qty))}</td>
                <td className="p-3 text-gray-500">{formatPrice(Math.round(item.unitCost))}</td>
                <td className="p-3">{formatPrice(Math.round(avgSell))}</td>
                <td className={`p-3 ${profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(Math.round(profitPerUnit))}</td>
                <td className={`p-3 font-bold ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPrice(item.profit)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.marginPct >= 20 ? 'bg-green-400' : item.marginPct >= 10 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(Math.max(item.marginPct, 0), 100)}%` }} /></div>
                    <span className="text-xs">{toPersianDigits(Math.round(item.marginPct))}%</span>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============ DEAD STOCK TAB ============
function DeadStockTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [minDays, setMinDays] = useState(30);

  useEffect(() => { load(); }, [minDays]);

  async function load() {
    setLoading(true);
    try {
      // Get all products with qty
      const products = await searchRead('product.product', [['type', '=', 'consu'], ['active', '=', true]], ['display_name', 'qty_available', 'standard_price', 'id']);
      // Get last sale date per product
      const cutoffDate = new Date(Date.now() - minDays * 864e5).toISOString().split('T')[0];
      // Find products that HAVE been sold after cutoff
      const recentInvoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', cutoffDate],
      ], ['id']);
      const recentInvIds = (recentInvoices || []).map((inv: any) => inv.id);
      
      let recentlySoldIds = new Set<number>();
      if (recentInvIds.length > 0) {
        const recentSales = await searchRead('account.move.line', [
          ['move_id', 'in', recentInvIds],
          ['product_id', '!=', false],
          ['quantity', '>', 0],
        ], ['product_id']);
        recentlySoldIds = new Set((recentSales || []).map((l: any) => l.product_id?.[0]).filter(Boolean));
      }

      // Products with stock but NOT sold recently
      const deadStock = (products || [])
        .filter((p: any) => p.qty_available > 0 && !recentlySoldIds.has(p.id))
        .map((p: any) => ({
          id: p.id,
          name: p.display_name || p.name,
          qty: p.qty_available,
          cost: p.standard_price || 0,
          capitalLocked: (p.qty_available || 0) * (p.standard_price || 0),
        }))
        .sort((a: any, b: any) => b.capitalLocked - a.capitalLocked);

      setData(deadStock);
    } catch { setData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  const totalLocked = data.reduce((s, d) => s + d.capitalLocked, 0);

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center">
        <label className="text-xs text-gray-500">کالاهایی که</label>
        <select value={minDays} onChange={e => setMinDays(Number(e.target.value))} className="p-2 border rounded-lg text-sm">
          <option value={7}>۷ روز</option>
          <option value={14}>۱۴ روز</option>
          <option value={30}>۳۰ روز</option>
          <option value={60}>۶۰ روز</option>
          <option value={90}>۹۰ روز</option>
        </select>
        <label className="text-xs text-gray-500">فروش نداشته‌اند</label>
      </div>

      {totalLocked > 0 && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold mb-4">
          ⚠️ سرمایه خوابیده: {formatPrice(totalLocked)} تومان در {toPersianDigits(data.length)} قلم کالا
        </div>
      )}

      {data.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400">همه کالاها در این دوره فروش داشته‌اند ✓</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-right p-3">کالا</th>
              <th className="text-right p-3">موجودی</th>
              <th className="text-right p-3">قیمت خرید</th>
              <th className="text-right p-3">سرمایه خوابیده</th>
              <th className="text-right p-3">پیشنهاد</th>
            </tr></thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id} className="border-b hover:bg-red-50">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3">{toPersianDigits(Math.round(item.qty))}</td>
                  <td className="p-3">{formatPrice(item.cost)}</td>
                  <td className="p-3 text-red-600 font-bold">{formatPrice(item.capitalLocked)}</td>
                  <td className="p-3 text-[10px] text-orange-600">تخفیف / حذف از خرید</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ============ SMART INVENTORY TAB ============
function SmartInventoryTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      // Get all products
      const products = await searchRead('product.product', [['type', '=', 'consu'], ['active', '=', true]], ['display_name', 'qty_available', 'standard_price', 'id']);
      // Get sales in the period to calculate daily consumption
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['id']);
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);
      
      let soldMap = new Map<number, number>();
      if (invoiceIds.length > 0) {
        const lines = await searchRead('account.move.line', [
          ['move_id', 'in', invoiceIds],
          ['product_id', '!=', false],
          ['quantity', '>', 0],
        ], ['product_id', 'quantity']);

        for (const l of (lines || [])) {
          const pid = l.product_id?.[0];
          if (!pid) continue;
          soldMap.set(pid, (soldMap.get(pid) || 0) + (l.quantity || 0));
        }
      }

      const periodDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 864e5) + 1);

      // Build result
      const result = (products || [])
        .filter((p: any) => p.qty_available > 0 || soldMap.has(p.id))
        .map((p: any) => {
          const totalSold = soldMap.get(p.id) || 0;
          const dailyConsumption = totalSold / periodDays;
          const daysRemaining = dailyConsumption > 0 ? Math.round(p.qty_available / dailyConsumption) : p.qty_available > 0 ? 999 : 0;
          const suggestedPurchase = Math.max(0, Math.round(dailyConsumption * 30 - p.qty_available)); // for 30 days
          return {
            id: p.id,
            name: p.display_name || p.name,
            qty: p.qty_available || 0,
            totalSold,
            dailyConsumption: Math.round(dailyConsumption * 10) / 10,
            daysRemaining,
            suggestedPurchase,
            urgent: daysRemaining <= 7 && daysRemaining > 0,
          };
        })
        .filter((p: any) => p.totalSold > 0 || p.qty > 0)
        .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining);

      setData(result);
    } catch { setData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  const urgentCount = data.filter(d => d.urgent).length;

  return (
    <div>
      {urgentCount > 0 && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold mb-4">
          🚨 {toPersianDigits(urgentCount)} کالا کمتر از ۷ روز موجودی دارند!
        </div>
      )}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-right p-3">کالا</th>
            <th className="text-right p-3">موجودی</th>
            <th className="text-right p-3">مصرف روزانه</th>
            <th className="text-right p-3">روز باقیمانده</th>
            <th className="text-right p-3">پیشنهاد خرید (۳۰ روز)</th>
          </tr></thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.id} className={`border-b ${item.urgent ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3">{toPersianDigits(Math.round(item.qty))}</td>
                <td className="p-3">{toPersianDigits(item.dailyConsumption)}</td>
                <td className={`p-3 font-bold ${item.daysRemaining <= 7 ? 'text-red-600' : item.daysRemaining <= 14 ? 'text-orange-600' : 'text-green-600'}`}>
                  {item.daysRemaining >= 999 ? '∞' : toPersianDigits(item.daysRemaining)}
                </td>
                <td className="p-3">{item.suggestedPurchase > 0 ? toPersianDigits(item.suggestedPurchase) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============ TIME ANALYSIS TAB ============
function TimeAnalysisTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [hourlyData, setHourlyData] = useState<{hour: number; count: number; total: number}[]>([]);
  const [weekdayData, setWeekdayData] = useState<{day: number; name: string; count: number; total: number}[]>([]);
  const [loading, setLoading] = useState(true);

  const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      // Get invoices with create_date (has time) for hourly analysis
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['amount_total', 'create_date', 'date']);

      // Hourly breakdown (based on create_date time)
      const hourMap: Record<number, { count: number; total: number }> = {};
      for (let h = 0; h < 24; h++) hourMap[h] = { count: 0, total: 0 };
      
      // Weekday breakdown
      const dayMap: Record<number, { count: number; total: number }> = {};
      for (let d = 0; d < 7; d++) dayMap[d] = { count: 0, total: 0 };

      for (const inv of (invoices || [])) {
        const created = inv.create_date ? new Date(inv.create_date) : null;
        const invDate = inv.date ? new Date(inv.date) : null;

        if (created) {
          const hour = created.getHours();
          hourMap[hour].count++;
          hourMap[hour].total += inv.amount_total || 0;
        }

        if (invDate) {
          const dow = invDate.getDay(); // 0=Sun, 6=Sat
          dayMap[dow].count++;
          dayMap[dow].total += inv.amount_total || 0;
        }
      }

      setHourlyData(Object.entries(hourMap).map(([h, d]) => ({ hour: Number(h), ...d })));
      setWeekdayData(Object.entries(dayMap).map(([d, v]) => ({ day: Number(d), name: WEEKDAYS[Number(d)], ...v })));
    } catch { setHourlyData([]); setWeekdayData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  const maxHourly = Math.max(...hourlyData.map(h => h.total), 1);
  const maxWeekday = Math.max(...weekdayData.map(w => w.total), 1);

  return (
    <div className="space-y-8">
      {/* Hourly Chart */}
      <div className="bg-white rounded-xl p-5 border">
        <h3 className="text-sm font-bold text-slate-700 mb-4">⏰ فروش ساعتی</h3>
        <div dir="ltr" className="flex items-end gap-px h-40">
          {hourlyData.filter(h => h.hour >= 7 && h.hour <= 23).map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
              <div className="absolute -top-5 bg-slate-800 text-white text-[8px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {formatPrice(h.total)} ({toPersianDigits(h.count)} فاکتور)
              </div>
              <div className="w-full bg-indigo-400 rounded-t-sm group-hover:bg-indigo-500 transition" style={{ height: `${Math.max((h.total / maxHourly) * 100, 2)}%` }} />
              <div className="text-[8px] text-gray-500 mt-1">{h.hour}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekday Chart */}
      <div className="bg-white rounded-xl p-5 border">
        <h3 className="text-sm font-bold text-slate-700 mb-4">📅 فروش روزهای هفته</h3>
        <div className="space-y-2">
          {/* Reorder: شنبه first */}
          {[6, 0, 1, 2, 3, 4, 5].map(dayIdx => {
            const w = weekdayData[dayIdx];
            if (!w) return null;
            return (
              <div key={dayIdx} className="flex items-center gap-3">
                <span className="text-xs w-16 text-gray-600">{w.name}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${(w.total / maxWeekday) * 100}%` }} />
                  <span className="absolute right-2 top-1 text-[9px] text-gray-600">{formatPrice(w.total)}</span>
                </div>
                <span className="text-[10px] text-gray-500 w-16">{toPersianDigits(w.count)} فاکتور</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ============ ABC ANALYSIS TAB ============
function ABCTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<{ category: 'A' | 'B' | 'C'; items: any[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['id']);
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);

      if (invoiceIds.length === 0) { setData([]); setLoading(false); return; }

      const lines = await searchRead('account.move.line', [
        ['move_id', 'in', invoiceIds],
        ['product_id', '!=', false],
        ['quantity', '>', 0],
      ], ['product_id', 'price_subtotal']);

      // Sum revenue per product
      const productMap = new Map<number, { name: string; revenue: number }>();
      for (const l of (lines || [])) {
        const pid = l.product_id?.[0];
        if (!pid) continue;
        if (!productMap.has(pid)) productMap.set(pid, { name: l.product_id?.[1] || '', revenue: 0 });
        productMap.get(pid)!.revenue += Math.abs(l.price_subtotal || 0);
      }

      // Sort by revenue descending
      const sorted = [...productMap.entries()].map(([id, info]) => ({ id, ...info })).sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0);

      // Classify ABC
      let cumulative = 0;
      const classA: any[] = [];
      const classB: any[] = [];
      const classC: any[] = [];

      for (const item of sorted) {
        cumulative += item.revenue;
        const pct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0;
        const itemPct = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
        if (pct <= 80) classA.push({ ...item, pct: itemPct });
        else if (pct <= 95) classB.push({ ...item, pct: itemPct });
        else classC.push({ ...item, pct: itemPct });
      }

      setData([
        { category: 'A', items: classA },
        { category: 'B', items: classB },
        { category: 'C', items: classC },
      ]);
    } catch { setData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  const colors = { A: 'bg-green-50 border-green-200 text-green-700', B: 'bg-yellow-50 border-yellow-200 text-yellow-700', C: 'bg-gray-50 border-gray-200 text-gray-600' };
  const labels = { A: 'کالاهای حیاتی (۸۰% درآمد) — نباید تمام شوند!', B: 'کالاهای مهم (۱۵% درآمد)', C: 'کالاهای کم‌اهمیت (۵% درآمد)' };

  return (
    <div className="space-y-4">
      {data.map(({ category, items }) => (
        <div key={category} className={`rounded-xl border p-4 ${colors[category]}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold">گروه {category} — {labels[category]}</h3>
            <span className="text-xs font-bold">{toPersianDigits(items.length)} کالا</span>
          </div>
          {items.length === 0 ? <p className="text-xs text-gray-400">—</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.slice(0, category === 'C' ? 5 : 20).map(item => (
                <div key={item.id} className="flex justify-between text-xs bg-white/60 rounded px-2 py-1">
                  <span>{item.name}</span>
                  <span className="font-bold">{formatPrice(item.revenue)} ({toPersianDigits(Math.round(item.pct))}%)</span>
                </div>
              ))}
              {category === 'C' && items.length > 5 && <div className="text-[10px] text-gray-400">و {toPersianDigits(items.length - 5)} کالای دیگر...</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ============ EMPLOYEES TAB ============
function EmployeesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      // In Odoo, invoices have create_uid (the user who created it = the cashier)
      const invoices = await searchRead('account.move', [
        ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
        ['date', '>=', dateFrom], ['date', '<=', dateTo],
      ], ['amount_total', 'create_uid']);

      // Group by user
      const userMap = new Map<number, { name: string; count: number; total: number }>();
      for (const inv of (invoices || [])) {
        const uid = inv.create_uid?.[0];
        const uname = inv.create_uid?.[1] || 'نامشخص';
        if (!uid) continue;
        if (!userMap.has(uid)) userMap.set(uid, { name: uname, count: 0, total: 0 });
        const u = userMap.get(uid)!;
        u.count++;
        u.total += inv.amount_total || 0;
      }

      const result = [...userMap.values()].map(u => ({
        ...u,
        avgBasket: u.count > 0 ? Math.round(u.total / u.count) : 0,
      })).sort((a, b) => b.total - a.total);

      setData(result);
    } catch { setData([]); }
    setLoading(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;
  if (data.length === 0) return <div className="text-center py-12 text-gray-400">داده‌ای یافت نشد</div>;

  const totalSales = data.reduce((s, d) => s + d.total, 0);

  return (
    <div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-right p-3">فروشنده</th>
            <th className="text-right p-3">تعداد فاکتور</th>
            <th className="text-right p-3">مجموع فروش</th>
            <th className="text-right p-3">میانگین فاکتور</th>
            <th className="text-right p-3">سهم از فروش</th>
          </tr></thead>
          <tbody>
            {data.map((u, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3">{toPersianDigits(u.count)}</td>
                <td className="p-3 font-bold">{formatPrice(u.total)}</td>
                <td className="p-3">{formatPrice(u.avgBasket)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${totalSales > 0 ? (u.total / totalSales) * 100 : 0}%` }} /></div>
                    <span className="text-xs">{toPersianDigits(totalSales > 0 ? Math.round((u.total / totalSales) * 100) : 0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
