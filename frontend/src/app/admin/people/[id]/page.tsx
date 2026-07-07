'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchRead } from '@/lib/odoo-api';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';

interface Partner {
  id: number;
  name: string;
  phone: string | false;
  mobile: string | false;
  supplier_rank: number;
  customer_rank: number;
  comment: string | false;
}

interface AccountEntry {
  id: number;
  name: string;
  date: string;
  move_type: string;
  amount_total: number;
  state: string;
  payment_state: string;
  narration: string | false;
}

interface PaymentEntry {
  id: number;
  name: string;
  date: string;
  payment_type: string;
  amount: number;
  journal_id: [number, string] | false;
  state: string;
}

interface MoveLine {
  id: number;
  date: string;
  move_id: [number, string] | false;
  account_id: [number, string] | false;
  debit: number;
  credit: number;
  name: string | false;
}

export default function PersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partnerId = Number(params.id);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [invoices, setInvoices] = useState<AccountEntry[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [moveLines, setMoveLines] = useState<MoveLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'ledger'>('invoices');
  const [balance, setBalance] = useState({ receivable: 0, payable: 0 });

  useEffect(() => {
    if (!partnerId) return;
    loadAll();
  }, [partnerId]);

  async function loadAll() {
    setLoading(true);
    try {
      // Load partner info
      const partners = await searchRead('res.partner', [['id', '=', partnerId]], [
        'name', 'phone', 'mobile', 'supplier_rank', 'customer_rank', 'comment',
      ], 1);
      if (partners && partners.length > 0) setPartner(partners[0]);

      // Load invoices (sale + purchase + refunds)
      const invs = await searchRead('account.move', [
        ['partner_id', '=', partnerId],
        ['move_type', 'in', ['out_invoice', 'in_invoice', 'out_refund', 'in_refund']],
      ], ['name', 'date', 'move_type', 'amount_total', 'state', 'payment_state', 'narration'], 100, 0, 'date desc');
      setInvoices(invs || []);

      // Load payments
      const pays = await searchRead('account.payment', [
        ['partner_id', '=', partnerId],
      ], ['name', 'date', 'payment_type', 'amount', 'journal_id', 'state'], 100, 0, 'date desc');
      setPayments(pays || []);

      // Load account.move.line (ledger) for receivable/payable
      const lines = await searchRead('account.move.line', [
        ['partner_id', '=', partnerId],
        ['parent_state', '=', 'posted'],
        ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']],
      ], ['date', 'move_id', 'account_id', 'debit', 'credit', 'name'], 200, 0, 'date desc');
      setMoveLines(lines || []);

      // Calculate balance
      let recv = 0, pay = 0;
      for (const l of (lines || [])) {
        recv += l.debit;
        pay += l.credit;
      }
      setBalance({ receivable: recv - pay, payable: pay - recv });
    } catch { /* ignore */ }
    setLoading(false);
  }

  function getMoveTypeLabel(type: string) {
    switch (type) {
      case 'out_invoice': return 'فاکتور فروش';
      case 'in_invoice': return 'فاکتور خرید';
      case 'out_refund': return 'برگشت از فروش';
      case 'in_refund': return 'برگشت از خرید';
      default: return type;
    }
  }

  function getStateLabel(state: string) {
    switch (state) {
      case 'posted': return 'ثبت شده';
      case 'draft': return 'پیش‌نویس';
      case 'cancel': return 'لغو شده';
      default: return state;
    }
  }

  function getPaymentStateLabel(ps: string) {
    switch (ps) {
      case 'paid': return '✅ پرداخت شده';
      case 'partial': return '⚠️ ناقص';
      case 'not_paid': return '❌ پرداخت نشده';
      case 'in_payment': return '⏳ در حال پرداخت';
      default: return ps || '—';
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>;
  }

  if (!partner) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">شخص یافت نشد</p>
        <Link href="/admin/people" className="text-indigo-500 text-sm mt-2 inline-block">← بازگشت</Link>
      </div>
    );
  }

  const netBalance = balance.receivable;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/people" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
            <h1 className="text-2xl font-bold text-slate-800">{partner.name}</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {partner.phone || partner.mobile || ''}
            {partner.customer_rank > 0 && ' • مشتری'}
            {partner.supplier_rank > 0 && ' • تامین‌کننده'}
          </p>
        </div>
        <div className="text-left">
          <div className={`text-xl font-bold ${netBalance > 0 ? 'text-red-600' : netBalance < 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {formatPrice(Math.abs(netBalance))} تومان
          </div>
          <div className="text-xs text-gray-500">
            {netBalance > 0 ? 'بدهکار به ما' : netBalance < 0 ? 'بستانکار از ما' : 'تسویه'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'invoices' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          فاکتورها ({toPersianDigits(invoices.length)})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'payments' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          پرداخت‌ها ({toPersianDigits(payments.length)})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'ledger' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          دفتر معین ({toPersianDigits(moveLines.length)})
        </button>
      </div>

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">فاکتوری ثبت نشده</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right p-3">شماره</th>
                  <th className="text-right p-3">نوع</th>
                  <th className="text-right p-3">مبلغ</th>
                  <th className="text-right p-3">تاریخ</th>
                  <th className="text-right p-3">وضعیت</th>
                  <th className="text-right p-3">پرداخت</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{inv.name}</td>
                    <td className="p-3">{getMoveTypeLabel(inv.move_type)}</td>
                    <td className="p-3 font-bold">{formatPrice(inv.amount_total)}</td>
                    <td className="p-3">{inv.date ? toJalali(inv.date) : '—'}</td>
                    <td className="p-3 text-xs">{getStateLabel(inv.state)}</td>
                    <td className="p-3 text-xs">{getPaymentStateLabel(inv.payment_state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {payments.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">پرداختی ثبت نشده</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right p-3">شماره</th>
                  <th className="text-right p-3">نوع</th>
                  <th className="text-right p-3">مبلغ</th>
                  <th className="text-right p-3">محل</th>
                  <th className="text-right p-3">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{pay.name}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pay.payment_type === 'inbound' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {pay.payment_type === 'inbound' ? 'دریافت' : 'پرداخت'}
                      </span>
                    </td>
                    <td className="p-3 font-bold">{formatPrice(pay.amount)}</td>
                    <td className="p-3 text-xs">{pay.journal_id ? pay.journal_id[1] : '—'}</td>
                    <td className="p-3">{pay.date ? toJalali(pay.date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {moveLines.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">سندی ثبت نشده</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right p-3">تاریخ</th>
                  <th className="text-right p-3">سند</th>
                  <th className="text-right p-3">شرح</th>
                  <th className="text-right p-3">بدهکار</th>
                  <th className="text-right p-3">بستانکار</th>
                  <th className="text-right p-3">مانده</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let runningBalance = 0;
                  // Reverse to show oldest first for running balance
                  const sorted = [...moveLines].reverse();
                  return sorted.map((line) => {
                    runningBalance += line.debit - line.credit;
                    return (
                      <tr key={line.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{line.date ? toJalali(line.date) : '—'}</td>
                        <td className="p-3 font-mono text-xs">{line.move_id ? line.move_id[1] : '—'}</td>
                        <td className="p-3 text-xs">{line.name || '—'}</td>
                        <td className="p-3 text-green-700 font-bold">{line.debit > 0 ? formatPrice(line.debit) : ''}</td>
                        <td className="p-3 text-red-700 font-bold">{line.credit > 0 ? formatPrice(line.credit) : ''}</td>
                        <td className={`p-3 font-bold ${runningBalance >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                          {formatPrice(Math.abs(runningBalance))} {runningBalance >= 0 ? 'بد' : 'بس'}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Notes */}
      {partner.comment && (
        <div className="mt-4 bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <div className="text-xs text-yellow-700 font-bold mb-1">یادداشت:</div>
          <div className="text-sm text-yellow-800">{partner.comment}</div>
        </div>
      )}
    </div>
  );
}
