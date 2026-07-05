'use client';

import React, { useState, useEffect } from 'react';
import { searchRead, create, getBankCashBalances, callMethod, getPartners, getExpenseIncomeAccounts } from '@/lib/odoo-api';
import { formatPrice, toJalali } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import PriceInput from '@/components/PriceInput';
import * as jalaali from 'jalaali-js';

type DocType = 'payment' | 'receipt';

interface Journal {
  id: number;
  name: string;
  type: string;
}

interface Partner {
  id: number;
  name: string;
}

interface Account {
  id: number;
  name: string;
  code: string;
  account_type: string;
}

interface AccountEntry {
  id: number;
  name: string;
  date: string;
  move_type: string;
  amount_total: number;
  journal_id: [number, string] | false;
  partner_id: [number, string] | false;
  narration: string | false;
  state: string;
  payment_state: string;
  ref: string | false;
}

/**
 * Compute ISO date strings for the start and end of the current Jalali month.
 */
function getCurrentJalaliMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const { jy, jm } = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  // Start of current Jalali month
  const startGregorian = jalaali.toGregorian(jy, jm, 1);
  const dateFrom = `${startGregorian.gy}-${String(startGregorian.gm).padStart(2, '0')}-${String(startGregorian.gd).padStart(2, '0')}`;
  // End of current Jalali month
  const monthLength = jalaali.jalaaliMonthLength(jy, jm);
  const endGregorian = jalaali.toGregorian(jy, jm, monthLength);
  const dateTo = `${endGregorian.gy}-${String(endGregorian.gm).padStart(2, '0')}-${String(endGregorian.gd).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

export default function AccountingPage() {
  const defaultRange = getCurrentJalaliMonthRange();

  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<DocType>('payment');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [entryLines, setEntryLines] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'invoice'>('all');
  const [searchText, setSearchText] = useState('');

  // Date range filter state
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);

  // Partner filter state (0 = all)
  const [filterPartnerId, setFilterPartnerId] = useState(0);

  const [form, setForm] = useState({
    description: '',
    amount: '',
    journal_id: 0,
    partner_id: 0,
    account_id: 0,
    date: new Date().toISOString().split('T')[0],
    note: '',
  });

  async function fetchEntries() {
    try {
      setLoading(true);
      const domain: any[] = [['state', '=', 'posted']];
      // Date range filter
      if (dateFrom) {
        domain.push(['date', '>=', dateFrom]);
      }
      if (dateTo) {
        domain.push(['date', '<=', dateTo]);
      }
      // Partner filter
      if (filterPartnerId > 0) {
        domain.push(['partner_id', '=', filterPartnerId]);
      }
      const data = await searchRead(
        'account.move',
        domain,
        ['name', 'date', 'move_type', 'amount_total', 'journal_id', 'partner_id', 'narration', 'state', 'payment_state', 'ref'],
        100, 0, 'date desc, id desc'
      );
      setEntries(data || []);
    } catch { setEntries([]); }
    setLoading(false);
  }

  async function fetchJournals() {
    try {
      const data = await getBankCashBalances();
      setJournals(data?.map((j: any) => ({ id: j.id, name: j.name, type: j.type })) || []);
    } catch { setJournals([]); }
  }

  async function fetchPartners() {
    try {
      const data = await getPartners();
      setPartners(data?.map((p: any) => ({ id: p.id, name: p.name })) || []);
    } catch { setPartners([]); }
  }

  async function fetchAccounts() {
    try {
      const data = await getExpenseIncomeAccounts();
      setAccounts(data?.map((a: any) => ({ id: a.id, name: a.name, code: a.code, account_type: a.account_type })) || []);
    } catch { setAccounts([]); }
  }

  useEffect(() => { fetchEntries(); fetchJournals(); fetchPartners(); fetchAccounts(); }, []);

  // Re-fetch entries when date or partner filter changes
  useEffect(() => { fetchEntries(); }, [dateFrom, dateTo, filterPartnerId]);

  function getMoveTypeLabel(entry: AccountEntry): string {
    if (entry.move_type === 'out_invoice') return 'فاکتور فروش';
    if (entry.move_type === 'in_invoice') return 'فاکتور خرید';
    if (entry.move_type === 'out_refund') return 'برگشت فروش';
    if (entry.move_type === 'in_refund') return 'برگشت خرید';
    if (entry.journal_id) {
      const jName = entry.journal_id[1].toLowerCase();
      if (jName.includes('cash') || jName.includes('bank') || jName.includes('صندوق') || jName.includes('بانک') || jName.includes('نقد') || jName.includes('ملی') || jName.includes('پاسارگاد')) {
        return (entry.narration && typeof entry.narration === 'string' && entry.narration.includes('دریافت')) ? 'سند دریافت' : 'سند پرداخت';
      }
    }
    return 'سند حسابداری';
  }

  function getMoveTypeColor(entry: AccountEntry): string {
    if (entry.move_type === 'out_invoice') return 'bg-green-100 text-green-700';
    if (entry.move_type === 'in_invoice') return 'bg-orange-100 text-orange-700';
    if (entry.move_type === 'out_refund') return 'bg-pink-100 text-pink-700';
    return 'bg-blue-100 text-blue-700';
  }

  function getDescription(entry: AccountEntry): string {
    if (entry.narration) return entry.narration.replace(/<[^>]*>/g, '');
    if (entry.ref) return entry.ref;
    if (entry.partner_id) return entry.partner_id[1];
    return '\u2014';
  }

  async function handleExpandEntry(entryId: number) {
    if (expandedEntry === entryId) { setExpandedEntry(null); setEntryLines([]); return; }
    try {
      const lines = await searchRead('account.move.line', [['move_id', '=', entryId]], [
        'name', 'account_id', 'debit', 'credit', 'partner_id',
      ]);
      setEntryLines(lines || []);
      setExpandedEntry(entryId);
    } catch { setEntryLines([]); }
  }

  function openForm(type: DocType, preselectedAccountId?: number) {
    setFormType(type);
    setForm({
      description: '',
      amount: '',
      journal_id: journals[0]?.id || 0,
      partner_id: 0,
      account_id: preselectedAccountId || 0,
      date: new Date().toISOString().split('T')[0],
      note: '',
    });
    setShowForm(true);
  }

  function getAccountTypeLabel(accountType: string): string {
    if (accountType === 'expense' || accountType === 'expense_direct_cost') return 'هزینه';
    if (accountType === 'income' || accountType === 'income_other') return 'درآمد';
    if (accountType === 'equity') return 'حقوق صاحبان سهام';
    return '';
  }

  async function handleSubmit() {
    if (!form.amount || !form.journal_id) {
      alert('مبلغ و حساب بانک/صندوق الزامی هستند');
      return;
    }
    if (!form.account_id) {
      alert('انتخاب حساب (بابت) الزامی است');
      return;
    }
    setSaving(true);
    try {
      const amount = parseFloat(form.amount) || 0;
      if (amount <= 0) { alert('مبلغ باید بزرگتر از صفر باشد'); setSaving(false); return; }

      // Build memo
      const selectedAccount = accounts.find(a => a.id === form.account_id);
      let memo = form.description || selectedAccount?.name || '';
      if (form.partner_id) {
        const p = partners.find(x => x.id === form.partner_id);
        memo = `${formType === 'payment' ? 'پرداخت به' : 'دریافت از'} ${p?.name || ''} - ${memo}`;
      }
      if (form.note) memo += ` | ${form.note}`;

      // Use account.payment for proper accounting
      const paymentType = formType === 'payment' ? 'outbound' : 'inbound';
      const partnerType = form.partner_id
        ? (formType === 'payment' ? 'supplier' : 'customer')
        : 'supplier';

      const paymentData: any = {
        payment_type: paymentType,
        partner_type: partnerType,
        amount: amount,
        journal_id: form.journal_id,
        date: form.date,
        memo: memo,
        destination_account_id: form.account_id,
      };

      if (form.partner_id) {
        paymentData.partner_id = form.partner_id;
      }

      const paymentId = await create('account.payment', paymentData);
      await callMethod('account.payment', 'action_post', [[paymentId]]);

      setShowForm(false);
      setMsg(`\u2705 سند ${formType === 'payment' ? 'پرداخت' : 'دریافت'} ثبت شد`);
      setTimeout(() => setMsg(''), 3000);
      await fetchEntries();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت سند');
    }
    setSaving(false);
  }

  // Client-side filter on type and search text (date + partner are server-side)
  const filtered = entries.filter((e) => {
    if (filterType === 'in' && e.move_type !== 'entry') return false;
    if (filterType === 'out' && e.move_type !== 'entry') return false;
    if (filterType === 'invoice' && e.move_type === 'entry') return false;
    if (searchText) {
      const text = `${e.name} ${e.narration || ''} ${e.partner_id ? e.partner_id[1] : ''} ${e.ref || ''} ${e.journal_id ? e.journal_id[1] : ''}`.toLowerCase();
      if (!text.includes(searchText.toLowerCase()) && !text.includes(searchText)) return false;
    }
    return true;
  });

  // Find specific accounts for quick actions
  function findAccountByKeyword(keyword: string): number {
    const found = accounts.find(a => a.name.includes(keyword));
    return found?.id || 0;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">اسناد حسابداری</h1>
          <p className="text-gray-500 text-sm">ثبت و مشاهده دریافت‌ها، پرداخت‌ها و اسناد مالی</p>
        </div>
        <div className="flex gap-2 items-center">
          {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button onClick={() => openForm('receipt')} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition">
            + سند دریافت
          </button>
          <button onClick={() => openForm('payment')} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 transition">
            + سند پرداخت
          </button>
        </div>
      </div>

      {/* Date Range and Partner Filter Bar */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">از تاریخ</label>
            <JalaliDatePicker value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">تا تاریخ</label>
            <JalaliDatePicker value={dateTo} onChange={setDateTo} placeholder="تا تاریخ" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">فیلتر شخص</label>
            <select
              value={filterPartnerId}
              onChange={e => setFilterPartnerId(Number(e.target.value))}
              className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value={0}>همه اشخاص</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Type Filters and Search */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([['all', 'همه اسناد'], ['invoice', 'فاکتورها'], ['in', 'دریافت‌ها'], ['out', 'پرداخت‌ها']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilterType(key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filterType === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
        <input type="text" placeholder="جستجو (نام، شماره، شخص...)" value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="mr-auto p-1.5 px-3 border rounded-lg text-sm w-64" />
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => { openForm('payment', findAccountByKeyword('پیک')); setForm(f => ({...f, description: 'هزینه پیک'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">🏍️</div>
          <div className="text-xs text-gray-600 mt-1">هزینه پیک</div>
        </button>
        <button onClick={() => { openForm('payment', findAccountByKeyword('برداشت') || findAccountByKeyword('سهام')); setForm(f => ({...f, description: 'برداشت شرکا'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">💰</div>
          <div className="text-xs text-gray-600 mt-1">برداشت شرکا</div>
        </button>
        <button onClick={() => { openForm('receipt', findAccountByKeyword('سرمایه') || findAccountByKeyword('سهام')); setForm(f => ({...f, description: 'افزایش سرمایه'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-green-300 transition text-center">
          <div className="text-2xl">📈</div>
          <div className="text-xs text-gray-600 mt-1">افزایش سرمایه</div>
        </button>
        <button onClick={() => openForm('receipt')} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-green-300 transition text-center">
          <div className="text-2xl">🤝</div>
          <div className="text-xs text-gray-600 mt-1">دریافت از شخص</div>
        </button>
      </div>

      {/* Entries List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
          <div className="text-4xl mb-3">📋</div>
          <p>سندی یافت نشد</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right p-3 font-medium text-gray-600">شماره</th>
                <th className="text-right p-3 font-medium text-gray-600">تاریخ</th>
                <th className="text-right p-3 font-medium text-gray-600">نوع</th>
                <th className="text-right p-3 font-medium text-gray-600">شخص</th>
                <th className="text-right p-3 font-medium text-gray-600">شرح</th>
                <th className="text-right p-3 font-medium text-gray-600">حساب</th>
                <th className="text-right p-3 font-medium text-gray-600">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <React.Fragment key={entry.id}>
                <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => handleExpandEntry(entry.id)}>
                  <td className="p-3 text-gray-500 text-xs">{entry.name}</td>
                  <td className="p-3">{entry.date ? toJalali(entry.date) : '\u2014'}</td>
                  <td className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getMoveTypeColor(entry)}`}>
                      {getMoveTypeLabel(entry)}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{entry.partner_id ? entry.partner_id[1] : '\u2014'}</td>
                  <td className="p-3 text-xs text-gray-600 max-w-[200px] truncate">{getDescription(entry)}</td>
                  <td className="p-3 text-xs">{entry.journal_id ? entry.journal_id[1] : '\u2014'}</td>
                  <td className="p-3 font-bold">{formatPrice(entry.amount_total)}</td>
                </tr>
                {expandedEntry === entry.id && (
                  <tr><td colSpan={7} className="p-3 bg-gray-50">
                    <div className="text-xs font-bold mb-2">آرتیکل‌های سند:</div>
                    {entryLines.length === 0 ? <p className="text-xs text-gray-400">بدون آرتیکل</p> : (
                      <table className="w-full text-xs"><thead><tr><th className="text-right p-1">شرح</th><th className="text-right p-1">حساب</th><th className="text-right p-1">بدهکار</th><th className="text-right p-1">بستانکار</th></tr></thead>
                      <tbody>{entryLines.map((l: any) => (
                        <tr key={l.id}><td className="p-1">{l.name || '\u2014'}</td><td className="p-1">{l.account_id?.[1] || '\u2014'}</td><td className="p-1">{l.debit > 0 ? formatPrice(l.debit) : ''}</td><td className="p-1">{l.credit > 0 ? formatPrice(l.credit) : ''}</td></tr>
                      ))}</tbody></table>
                    )}
                  </td></tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">
              {formType === 'payment' ? '📤 ثبت سند پرداخت' : '📥 ثبت سند دریافت'}
            </h3>
            <div className="space-y-3">
              {/* Account (destination) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">حساب (بابت) *</label>
                <select value={form.account_id} onChange={e => setForm({...form, account_id: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none">
                  <option value={0}>-- انتخاب حساب --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({getAccountTypeLabel(a.account_type)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Partner (always visible, optional) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">شخص (اختیاری)</label>
                <select value={form.partner_id} onChange={e => setForm({...form, partner_id: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none">
                  <option value={0}>-- بدون شخص --</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">شرح</label>
                <input type="text" value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="مثلا: هزینه پیک، اجاره، قبض برق..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">مبلغ (تومان) *</label>
                <PriceInput value={form.amount} onChange={v => setForm({...form, amount: v})} placeholder="۰"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>

              {/* Journal */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{formType === 'payment' ? 'پرداخت از حساب' : 'واریز به حساب'} *</label>
                <select value={form.journal_id} onChange={e => setForm({...form, journal_id: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none">
                  <option value={0}>-- انتخاب حساب --</option>
                  {journals.map(j => <option key={j.id} value={j.id}>{j.name} ({j.type === 'cash' ? 'نقدی' : 'بانک'})</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">تاریخ</label>
                <JalaliDatePicker value={form.date} onChange={d => setForm({...form, date: d})} placeholder="انتخاب تاریخ" />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">یادداشت</label>
                <textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                  placeholder="توضیحات تکمیلی (اختیاری)..." rows={2}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSubmit} disabled={saving}
                className={`flex-1 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50 ${formType === 'payment' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}>
                {saving ? 'در حال ثبت...' : formType === 'payment' ? 'ثبت سند پرداخت' : 'ثبت سند دریافت'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
