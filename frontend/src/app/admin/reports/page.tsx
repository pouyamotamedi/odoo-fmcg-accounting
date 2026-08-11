'use client';

import { useState } from 'react';
import {
  getDailySalesReport,
  getInventoryReport,
  getCreditAgingReport,
  getCashFlowReport,
  searchRead,
} from '@/lib/odoo-api';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import ExcelButtons from '@/components/ExcelButtons';

type ReportType = 'sales' | 'inventory' | 'credit' | 'cashflow' | 'profitloss' | 'purchases' | null;

export default function ReportsPage() {
  const [active, setActive] = useState<ReportType>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);

  async function runReport(type: ReportType) {
    setActive(type);
    setLoading(true);
    setError('');
    try {
      let data: any[] = [];
      if (type === 'sales') data = await getDailySalesReport(dateFrom, dateTo);
      else if (type === 'inventory') data = await getInventoryReport();
      else if (type === 'credit') data = await getCreditAgingReport();
      else if (type === 'cashflow') data = await getCashFlowReport(dateFrom, dateTo);
      else if (type === 'purchases') {
        data = await searchRead('account.move', [['move_type', '=', 'in_invoice'], ['state', '=', 'posted'], ['invoice_date', '>=', dateFrom], ['invoice_date', '<=', dateTo]], ['name', 'partner_id', 'amount_total', 'invoice_date', 'payment_state'], 0, 0, 'invoice_date desc');
      }
      else if (type === 'profitloss') {
        // Get income, COGS, and operating expense totals from account.move.line
        const incomeLines = await searchRead('account.move.line', [['parent_state', '=', 'posted'], ['account_id.account_type', 'in', ['income', 'income_other']], ['date', '>=', dateFrom], ['date', '<=', dateTo]], ['debit', 'credit', 'account_id'], 0);
        const cogsLines = await searchRead('account.move.line', [['parent_state', '=', 'posted'], ['account_id.account_type', '=', 'expense_direct_cost'], ['date', '>=', dateFrom], ['date', '<=', dateTo]], ['debit', 'credit', 'account_id'], 0);
        const expenseLines = await searchRead('account.move.line', [['parent_state', '=', 'posted'], ['account_id.account_type', '=', 'expense'], ['date', '>=', dateFrom], ['date', '<=', dateTo]], ['debit', 'credit', 'account_id'], 0);
        // Group by account
        const incomeMap: Record<string, number> = {};
        for (const l of (incomeLines || [])) { const name = l.account_id?.[1] || 'نامشخص'; incomeMap[name] = (incomeMap[name] || 0) + l.credit - l.debit; }
        const cogsMap: Record<string, number> = {};
        for (const l of (cogsLines || [])) { const name = l.account_id?.[1] || 'نامشخص'; cogsMap[name] = (cogsMap[name] || 0) + l.debit - l.credit; }
        const expenseMap: Record<string, number> = {};
        for (const l of (expenseLines || [])) { const name = l.account_id?.[1] || 'نامشخص'; expenseMap[name] = (expenseMap[name] || 0) + l.debit - l.credit; }
        const totalIncome = Object.values(incomeMap).reduce((s, v) => s + v, 0);
        const totalCogs = Object.values(cogsMap).reduce((s, v) => s + v, 0);
        const totalExpense = Object.values(expenseMap).reduce((s, v) => s + v, 0);
        const grossProfit = totalIncome - totalCogs;
        const netProfit = grossProfit - totalExpense;
        data = [
          ...Object.entries(incomeMap).map(([name, amount]) => ({ name, amount, type: 'income' })),
          { name: '--- جمع درآمد ---', amount: totalIncome, type: 'subtotal' },
          ...Object.entries(cogsMap).map(([name, amount]) => ({ name, amount, type: 'expense' })),
          { name: '--- جمع بهای تمام شده ---', amount: totalCogs, type: 'subtotal' },
          { name: '=== سود ناخالص ===', amount: grossProfit, type: 'total' },
          ...Object.entries(expenseMap).map(([name, amount]) => ({ name, amount, type: 'expense' })),
          { name: '--- جمع هزینه‌های عملیاتی ---', amount: totalExpense, type: 'subtotal' },
          { name: '=== سود (زیان) خالص ===', amount: netProfit, type: 'total' },
        ];
      }
      setRows(data || []);
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت گزارش');
      setRows([]);
    }
    setLoading(false);
  }

  const cards = [
    { type: 'sales' as const, icon: '📊', title: 'گزارش فروش', desc: 'مجموع فروش و تعداد فاکتور' },
    { type: 'purchases' as const, icon: '🛒', title: 'گزارش خرید', desc: 'فاکتورهای خرید در دوره' },
    { type: 'profitloss' as const, icon: '📈', title: 'سود و زیان', desc: 'درآمدها و هزینه‌ها' },
    { type: 'inventory' as const, icon: '📦', title: 'وضعیت موجودی', desc: 'لیست کالاها با تعداد و ارزش' },
    { type: 'credit' as const, icon: '👥', title: 'سن بدهی مشتریان', desc: 'بدهی‌های باز مشتریان' },
    { type: 'cashflow' as const, icon: '💰', title: 'جریان نقدی', desc: 'ورودی و خروجی وجوه' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">گزارش‌ها</h1>
          <p className="text-gray-500 text-sm">گزارش‌های فروش، انبار، بدهی و جریان نقدی</p>
        </div>
        {active && (
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="text-sm bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 print:hidden">
              🖨️ چاپ / PDF
            </button>
            <button onClick={() => { setActive(null); setRows([]); }} className="text-sm text-gray-500 hover:text-gray-700 print:hidden">
              → بازگشت به لیست
            </button>
          </div>
        )}
      </div>

      {!active && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => (
            <button
              key={c.type}
              onClick={() => runReport(c.type)}
              className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-300 cursor-pointer transition text-right"
            >
              <div className="text-2xl mb-2">{c.icon}</div>
              <h3 className="font-bold text-sm">{c.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div>
          {(active === 'sales' || active === 'cashflow' || active === 'profitloss' || active === 'purchases') && (
            <div className="flex gap-3 mb-4 items-end flex-wrap print:hidden">
              <div>
                <label className="block text-xs text-gray-500 mb-1">از تاریخ</label>
                <JalaliDatePicker value={dateFrom} onChange={(v) => setDateFrom(v)} placeholder="از تاریخ" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">تا تاریخ</label>
                <JalaliDatePicker value={dateTo} onChange={(v) => setDateTo(v)} placeholder="تا تاریخ" />
              </div>
              <button onClick={() => runReport(active)} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600">
                اعمال فیلتر
              </button>
            </div>
          )}

          {/* Print-only header */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold">
              {active === 'sales' ? 'گزارش فروش' : active === 'purchases' ? 'گزارش خرید' : active === 'profitloss' ? 'سود و زیان' : active === 'inventory' ? 'گزارش موجودی' : active === 'credit' ? 'گزارش بدهی مشتریان' : 'گزارش جریان نقدی'}
            </h2>
            {(active === 'sales' || active === 'cashflow' || active === 'profitloss' || active === 'purchases') && (
              <p className="text-sm text-gray-600">از {toJalali(dateFrom)} تا {toJalali(dateTo)}</p>
            )}
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          {loading ? (
            <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
              داده‌ای یافت نشد
            </div>
          ) : (
            <ReportTable type={active} rows={rows} />
          )}
        </div>
      )}
    </div>
  );
}

function ReportTable({ type, rows }: { type: Exclude<ReportType, null>; rows: any[] }) {
  if (type === 'sales') {
    const total = rows.reduce((s, r) => s + (r.amount_total || 0), 0);
    return (
      <div>
        <div className="mb-3 bg-green-50 text-green-700 p-3 rounded-lg text-sm font-bold">
          مجموع فروش: {formatPrice(total)} تومان — {toPersianDigits(rows.length)} فاکتور
        </div>
        <Table
          headers={['فاکتور', 'مشتری', 'مبلغ', 'تاریخ', 'وضعیت پرداخت']}
          data={rows.map((r) => [
            r.name || '—',
            r.partner_id ? r.partner_id[1] : '—',
            formatPrice(r.amount_total || 0),
            r.invoice_date ? toJalali(r.invoice_date) : '—',
            r.payment_state === 'paid' ? 'پرداخت شده' : 'در انتظار',
          ])}
        />
      </div>
    );
  }
  if (type === 'inventory') {
    const totalValue = rows.reduce((s, r) => s + (r.qty_available || 0) * (r.standard_price || 0), 0);
    return (
      <div>
        <div className="mb-3 bg-blue-50 text-blue-700 p-3 rounded-lg text-sm font-bold">
          ارزش کل موجودی: {formatPrice(totalValue)} تومان
        </div>
        <Table
          headers={['کالا', 'موجودی', 'قیمت خرید', 'ارزش', 'وضعیت']}
          data={rows.map((r) => [
            r.name,
            toPersianDigits(Math.round(r.qty_available || 0)),
            formatPrice(r.standard_price || 0),
            formatPrice((r.qty_available || 0) * (r.standard_price || 0)),
            r.fmcg_is_low_stock ? '⚠️ کمبود' : 'عادی',
          ])}
        />
      </div>
    );
  }
  if (type === 'credit') {
    const total = rows.reduce((s, r) => s + (r.remaining || 0), 0);
    return (
      <div>
        <div className="mb-3 bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold">
          مجموع بدهی: {formatPrice(total)} تومان
        </div>
        <Table
          headers={['مشتری', 'مبلغ کل', 'باقیمانده', 'تاریخ', 'وضعیت']}
          data={rows.map((r) => [
            r.partner_id ? r.partner_id[1] : '—',
            formatPrice(r.amount || 0),
            formatPrice(r.remaining || 0),
            r.date ? toJalali(r.date) : '—',
            r.state === 'partial' ? 'پرداخت جزئی' : 'باز',
          ])}
        />
      </div>
    );
  }
  // purchases
  if (type === 'purchases') {
    const total = rows.reduce((s, r) => s + (r.amount_total || 0), 0);
    return (
      <div>
        <div className="mb-3 bg-orange-50 text-orange-700 p-3 rounded-lg text-sm font-bold">
          مجموع خرید: {formatPrice(total)} تومان — {toPersianDigits(rows.length)} فاکتور
        </div>
        <Table
          headers={['فاکتور', 'تامین‌کننده', 'مبلغ', 'تاریخ', 'وضعیت پرداخت']}
          data={rows.map((r) => [
            r.name || '—',
            r.partner_id ? r.partner_id[1] : '—',
            formatPrice(r.amount_total || 0),
            r.invoice_date ? toJalali(r.invoice_date) : '—',
            r.payment_state === 'paid' ? 'پرداخت شده' : 'در انتظار',
          ])}
        />
      </div>
    );
  }
  // profitloss
  if (type === 'profitloss') {
    return (
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            <th className="text-right p-3">حساب</th>
            <th className="text-right p-3">مبلغ (تومان)</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b ${r.type === 'subtotal' ? 'bg-gray-50 font-bold' : r.type === 'total' ? 'bg-indigo-50 font-bold text-indigo-700' : r.type === 'income' ? '' : 'text-red-700'}`}>
                <td className="p-3">{r.name}</td>
                <td className={`p-3 font-bold ${r.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatPrice(Math.abs(r.amount))}{r.amount < 0 ? ' (زیان)' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // cashflow
  const inflow = rows.filter((r) => r.move_type === 'out_invoice').reduce((s, r) => s + (r.amount_total || 0), 0);
  const outflow = rows.filter((r) => r.move_type === 'in_invoice').reduce((s, r) => s + (r.amount_total || 0), 0);
  return (
    <div>
      <div className="mb-3 flex gap-3 flex-wrap">
        <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm font-bold">ورودی: {formatPrice(inflow)}</div>
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold">خروجی: {formatPrice(outflow)}</div>
        <div className="bg-slate-100 text-slate-700 p-3 rounded-lg text-sm font-bold">خالص: {formatPrice(inflow - outflow)}</div>
      </div>
      <Table
        headers={['سند', 'نوع', 'مبلغ', 'تاریخ']}
        data={rows.map((r) => [
          r.name || '—',
          r.move_type === 'out_invoice' ? 'فروش' : r.move_type === 'in_invoice' ? 'خرید' : r.move_type,
          formatPrice(r.amount_total || 0),
          r.date ? toJalali(r.date) : '—',
        ])}
      />
    </div>
  );
}

function Table({ headers, data }: { headers: string[]; data: (string | number)[][] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-right p-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-50 hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td key={ci} className="p-3 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
