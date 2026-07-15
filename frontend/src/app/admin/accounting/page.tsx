'use client';

import React, { useState, useEffect } from 'react';
import { searchRead, create, getBankCashBalances, callMethod, getPartners, getExpenseIncomeAccounts } from '@/lib/odoo-api';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import PriceInput from '@/components/PriceInput';
import ExcelButtons from '@/components/ExcelButtons';
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
  const [initialRange] = useState(() => getCurrentJalaliMonthRange());

  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<DocType>('payment');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [entryLinesMap, setEntryLinesMap] = useState<Record<number, any[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'invoice' | 'out_invoice' | 'in_invoice' | 'out_refund' | 'in_refund'>('all');
  const [searchText, setSearchText] = useState('');

  // Date range filter state
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState(initialRange.dateTo);

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

  // Free-form journal entry (multi-line)
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [freeFormDate, setFreeFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [freeFormNote, setFreeFormNote] = useState('');
  const [freeFormLines, setFreeFormLines] = useState<{account_id: number; debit: string; credit: string; name: string; partner_id: number}[]>([
    { account_id: 0, debit: '', credit: '', name: '', partner_id: 0 },
    { account_id: 0, debit: '', credit: '', name: '', partner_id: 0 },
  ]);
  const [allAccounts, setAllAccounts] = useState<{id: number; name: string; code: string}[]>([]);

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
      // Move type filter (server-side)
      if (filterType === 'out_invoice') domain.push(['move_type', '=', 'out_invoice']);
      else if (filterType === 'in_invoice') domain.push(['move_type', '=', 'in_invoice']);
      else if (filterType === 'out_refund') domain.push(['move_type', '=', 'out_refund']);
      else if (filterType === 'in_refund') domain.push(['move_type', '=', 'in_refund']);
      else if (filterType === 'invoice') domain.push(['move_type', 'in', ['out_invoice', 'in_invoice', 'out_refund', 'in_refund']]);
      else if (filterType === 'in') domain.push(['move_type', '=', 'entry']);
      else if (filterType === 'out') domain.push(['move_type', '=', 'entry']);

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

  async function loadAllAccounts() {
    try {
      const data = await searchRead('account.account', [['deprecated', '=', false]], ['name', 'code'], 0, 0, 'code asc');
      setAllAccounts((data || []).map((a: any) => ({ id: a.id, name: a.name, code: a.code })));
    } catch {}
  }

  useEffect(() => { fetchJournals(); fetchPartners(); fetchAccounts(); loadAllAccounts(); }, []);

  // Fetch entries on mount and re-fetch when filters change
  useEffect(() => { fetchEntries(); }, [dateFrom, dateTo, filterPartnerId, filterType]);

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
    const next = new Set(expandedEntries);
    if (next.has(entryId)) { next.delete(entryId); setExpandedEntries(next); return; }
    next.add(entryId);
    setExpandedEntries(next);
    try {
      const lines = await searchRead('account.move.line', [['move_id', '=', entryId]], [
        'name', 'account_id', 'debit', 'credit', 'partner_id', 'product_id',
      ]);
      setEntryLinesMap(prev => ({ ...prev, [entryId]: lines || [] }));
    } catch { setEntryLinesMap(prev => ({ ...prev, [entryId]: [] })); }
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

      // Resolve partner_id: use selected partner or find/create default "مشتری عمومی"
      let resolvedPartnerId = form.partner_id;
      if (!resolvedPartnerId) {
        try {
          const defaultPartners = await searchRead(
            'res.partner',
            [['name', '=', 'مشتری عمومی']],
            ['id'],
            1
          );
          if (defaultPartners && defaultPartners.length > 0) {
            resolvedPartnerId = defaultPartners[0].id;
          } else {
            // Create the default partner if it doesn't exist
            resolvedPartnerId = await create('res.partner', { name: 'مشتری عمومی', customer_rank: 1, supplier_rank: 1 });
          }
        } catch {
          alert('خطا در دریافت شخص پیش‌فرض. لطفاً یک شخص انتخاب کنید.');
          setSaving(false);
          return;
        }
      }

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
      const partnerType = formType === 'payment' ? 'supplier' : 'customer';

      const paymentData: any = {
        payment_type: paymentType,
        partner_type: partnerType,
        amount: amount,
        journal_id: form.journal_id,
        date: form.date,
        memo: memo,
        destination_account_id: form.account_id,
        partner_id: resolvedPartnerId,
      };

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

  // Free-form journal entry submit
  async function handleFreeFormSubmit() {
    if (!freeFormDate) { alert('تاریخ الزامی'); return; }
    const validLines = freeFormLines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { alert('حداقل ۲ آرتیکل با مبلغ وارد کنید'); return; }
    const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = validLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 1) {
      alert(`سند تراز نیست!\nبدهکار: ${formatPrice(totalDebit)}\nبستانکار: ${formatPrice(totalCredit)}\nتفاوت: ${formatPrice(Math.abs(totalDebit - totalCredit))}`);
      return;
    }
    setSaving(true);
    try {
      const lines = validLines.map(l => [0, 0, {
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        name: l.name || freeFormNote || 'سند آزاد',
        partner_id: l.partner_id || false,
      }]);
      const moveId = await create('account.move', {
        move_type: 'entry',
        date: freeFormDate,
        line_ids: lines,
        narration: freeFormNote || 'سند آزاد',
      });
      await callMethod('account.move', 'action_post', [[moveId]]);
      setShowFreeForm(false);
      setFreeFormLines([{ account_id: 0, debit: '', credit: '', name: '', partner_id: 0 }, { account_id: 0, debit: '', credit: '', name: '', partner_id: 0 }]);
      setFreeFormNote('');
      setMsg('✅ سند آزاد ثبت شد');
      setTimeout(() => setMsg(''), 3000);
      await fetchEntries();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  const freeFormTotalDebit = freeFormLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const freeFormTotalCredit = freeFormLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  // Client-side filter: only search text (type/date/partner are server-side now)
  const filtered = entries.filter((e) => {
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

  function handleQuickAction(type: DocType, keyword: string, description: string, fallbackKeyword?: string) {
    const accountId = findAccountByKeyword(keyword) || (fallbackKeyword ? findAccountByKeyword(fallbackKeyword) : 0);
    if (!accountId) {
      setMsg(`⚠️ حساب مرتبط با "${keyword}" یافت نشد. ابتدا حساب‌ها را بررسی کنید.`);
      setTimeout(() => setMsg(''), 4000);
      return;
    }
    openForm(type, accountId);
    setForm(f => ({...f, description}));
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
          <ExcelButtons
            data={entries}
            columns={[
              { key: 'name', label: 'شماره سند' },
              { key: 'date', label: 'تاریخ', transform: (v) => v ? toJalali(v) : '' },
              { key: 'partner_id', label: 'طرف حساب', transform: (v) => v ? v[1] : '' },
              { key: 'journal_id', label: 'دفتر', transform: (v) => v ? v[1] : '' },
              { key: 'amount_total', label: 'مبلغ' },
              { key: 'move_type', label: 'نوع' },
              { key: 'state', label: 'وضعیت' },
            ]}
            filename="accounting-entries"
          />
          <button onClick={() => openForm('receipt')} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition">
            + سند دریافت
          </button>
          <button onClick={() => openForm('payment')} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 transition">
            + سند پرداخت
          </button>
          <button onClick={() => setShowFreeForm(true)} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">
            + سند آزاد
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
        {([
          ['all', 'همه'],
          ['out_invoice', 'فروش'],
          ['in_invoice', 'خرید'],
          ['out_refund', 'برگشت فروش'],
          ['in_refund', 'برگشت خرید'],
          ['in', 'دریافت‌ها'],
          ['out', 'پرداخت‌ها'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilterType(key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filterType === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
        <input type="text" placeholder="🔍 جستجو..." value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="mr-auto p-1.5 px-3 border rounded-lg text-sm w-64" />
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'هزینه پیک'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">🏍️</div>
          <div className="text-xs text-gray-600 mt-1">هزینه پیک</div>
        </button>
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'پرداخت حقوق'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">💵</div>
          <div className="text-xs text-gray-600 mt-1">پرداخت حقوق</div>
        </button>
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'خرید موارد مصرفی'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">🛒</div>
          <div className="text-xs text-gray-600 mt-1">خرید مصرفی</div>
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
              {(() => {
                // Group related entries by ref into nested accordion
                const refGroups = new Map<string, typeof filtered>();
                const standalone: typeof filtered = [];
                for (const e of filtered) {
                  const ref = e.ref || '';
                  if (ref) {
                    if (!refGroups.has(ref)) refGroups.set(ref, []);
                    refGroups.get(ref)!.push(e);
                  } else {
                    standalone.push(e);
                  }
                }

                const rows: React.ReactNode[] = [];
                const groupColors = ['bg-indigo-50 border-indigo-200', 'bg-orange-50 border-orange-200', 'bg-green-50 border-green-200', 'bg-pink-50 border-pink-200', 'bg-cyan-50 border-cyan-200'];
                let colorIdx = 0;

                // Render grouped entries
                for (const [ref, groupEntries] of refGroups) {
                  if (groupEntries.length > 1) {
                    const color = groupColors[colorIdx % groupColors.length];
                    colorIdx++;
                    const isGroupOpen = expandedGroups.has(ref);
                    const totalAmount = groupEntries.reduce((s, e) => s + e.amount_total, 0);
                    const mainEntry = groupEntries.find(e => e.move_type === 'in_invoice' || e.move_type === 'out_invoice') || groupEntries[0];
                    const partnerName = mainEntry.partner_id ? mainEntry.partner_id[1] : '';

                    // Group header row
                    rows.push(
                      <tr key={`group-${ref}`} className={`border-b cursor-pointer hover:bg-gray-100 ${color}`} onClick={() => { const next = new Set(expandedGroups); if (next.has(ref)) next.delete(ref); else next.add(ref); setExpandedGroups(next); }}>
                        <td className="p-3 text-xs font-bold" colSpan={2}>
                          <span className="ml-2">{isGroupOpen ? '▼' : '◀'}</span>
                          {` ${ref}`}
                        </td>
                        <td className="p-3"><span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full font-bold">{toPersianDigits(groupEntries.length)} سند</span></td>
                        <td className="p-3 text-xs">{partnerName}</td>
                        <td className="p-3 text-xs text-gray-500">{mainEntry.date ? toJalali(mainEntry.date) : ''}</td>
                        <td className="p-3 text-xs"></td>
                        <td className="p-3 font-bold">{formatPrice(totalAmount / groupEntries.length)}</td>
                      </tr>
                    );

                    // Child entries (if group is open)
                    if (isGroupOpen) {
                      for (const entry of groupEntries) {
                        rows.push(
                          <React.Fragment key={entry.id}>
                          <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer bg-white" onClick={() => handleExpandEntry(entry.id)}>
                            <td className="p-3 text-gray-400 text-xs pr-8">↳ {entry.name}</td>
                            <td className="p-3 text-xs">{entry.date ? toJalali(entry.date) : ''}</td>
                            <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getMoveTypeColor(entry)}`}>{getMoveTypeLabel(entry)}</span></td>
                            <td className="p-3 text-xs">{entry.partner_id ? entry.partner_id[1] : ''}</td>
                            <td className="p-3 text-xs text-gray-600 max-w-[150px] truncate">{getDescription(entry)}</td>
                            <td className="p-3 text-xs">{entry.journal_id ? entry.journal_id[1] : ''}</td>
                            <td className="p-3 font-bold">{formatPrice(entry.amount_total)}</td>
                          </tr>
                          {expandedEntries.has(entry.id) && (
                            <tr><td colSpan={7} className="p-3 bg-gray-50">
                              <div className="text-xs font-bold mb-2">آرتیکل‌های سند:</div>
                              {(entryLinesMap[entry.id] || []).length === 0 ? <p className="text-xs text-gray-400">بدون آرتیکل</p> : (
                                <table className="w-full text-xs"><thead><tr><th className="text-right p-1">شرح</th><th className="text-right p-1">کالا</th><th className="text-right p-1">حساب</th><th className="text-right p-1">بدهکار</th><th className="text-right p-1">بستانکار</th></tr></thead>
                                <tbody>{(entryLinesMap[entry.id] || []).map((l: any) => (
                                  <tr key={l.id}><td className="p-1">{l.name || '\u2014'}</td><td className="p-1 text-gray-500">{l.product_id?.[1] || ''}</td><td className="p-1">{l.account_id?.[1] || '\u2014'}</td><td className="p-1">{l.debit > 0 ? formatPrice(l.debit) : ''}</td><td className="p-1">{l.credit > 0 ? formatPrice(l.credit) : ''}</td></tr>
                                ))}</tbody></table>
                              )}
                            </td></tr>
                          )}
                          </React.Fragment>
                        );
                      }
                    }
                  } else {
                    // Single entry with ref — treat as standalone
                    standalone.push(groupEntries[0]);
                  }
                }

                // Render standalone entries
                for (const entry of standalone) {
                  rows.push(
                    <React.Fragment key={entry.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => handleExpandEntry(entry.id)}>
                      <td className="p-3 text-gray-500 text-xs">{entry.name}</td>
                      <td className="p-3">{entry.date ? toJalali(entry.date) : '\u2014'}</td>
                      <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getMoveTypeColor(entry)}`}>{getMoveTypeLabel(entry)}</span></td>
                      <td className="p-3 text-xs">{entry.partner_id ? entry.partner_id[1] : '\u2014'}</td>
                      <td className="p-3 text-xs text-gray-600 max-w-[200px] truncate">{getDescription(entry)}</td>
                      <td className="p-3 text-xs">{entry.journal_id ? entry.journal_id[1] : '\u2014'}</td>
                      <td className="p-3 font-bold">{formatPrice(entry.amount_total)}</td>
                    </tr>
                    {expandedEntries.has(entry.id) && (
                      <tr><td colSpan={7} className="p-3 bg-gray-50">
                        <div className="text-xs font-bold mb-2">آرتیکل‌های سند:</div>
                        {(entryLinesMap[entry.id] || []).length === 0 ? <p className="text-xs text-gray-400">بدون آرتیکل</p> : (
                          <table className="w-full text-xs"><thead><tr><th className="text-right p-1">شرح</th><th className="text-right p-1">کالا</th><th className="text-right p-1">حساب</th><th className="text-right p-1">بدهکار</th><th className="text-right p-1">بستانکار</th></tr></thead>
                          <tbody>{(entryLinesMap[entry.id] || []).map((l: any) => (
                            <tr key={l.id}><td className="p-1">{l.name || '\u2014'}</td><td className="p-1 text-gray-500">{l.product_id?.[1] || ''}</td><td className="p-1">{l.account_id?.[1] || '\u2014'}</td><td className="p-1">{l.debit > 0 ? formatPrice(l.debit) : ''}</td><td className="p-1">{l.credit > 0 ? formatPrice(l.credit) : ''}</td></tr>
                          ))}</tbody></table>
                        )}
                      </td></tr>
                    )}
                    </React.Fragment>
                  );
                }

                return rows;
              })()}
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

      {/* Free-Form Journal Entry Modal */}
      {showFreeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-2">📝 سند آزاد (چند آرتیکلی)</h3>
            <p className="text-xs text-gray-500 mb-4">برای مغایرت بانکی، تسویه پرداخت‌های معلق، اسناد اصلاحی و موارد تجمیعی استفاده کنید.</p>

            <div className="flex gap-4 mb-4">
              <div>
                <label className="text-[10px] text-gray-500">تاریخ سند</label>
                <JalaliDatePicker value={freeFormDate} onChange={setFreeFormDate} placeholder="تاریخ" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500">شرح سند (narration)</label>
                <input type="text" value={freeFormNote} onChange={e => setFreeFormNote(e.target.value)} placeholder="مثلاً: مغایرت بانکی مورخ ..." className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            <table className="w-full text-xs border rounded-lg overflow-hidden mb-3">
              <thead className="bg-gray-50"><tr>
                <th className="text-right p-2">حساب *</th>
                <th className="text-right p-2 w-32">شرح آرتیکل</th>
                <th className="text-right p-2 w-28">شخص</th>
                <th className="text-right p-2 w-28">بدهکار</th>
                <th className="text-right p-2 w-28">بستانکار</th>
                <th className="p-2 w-8"></th>
              </tr></thead>
              <tbody>
                {freeFormLines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-1">
                      <select value={line.account_id} onChange={e => { const next = [...freeFormLines]; next[idx] = {...next[idx], account_id: Number(e.target.value)}; setFreeFormLines(next); }} className="w-full p-1.5 border rounded text-xs">
                        <option value={0}>— حساب —</option>
                        {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="text" value={line.name} onChange={e => { const next = [...freeFormLines]; next[idx] = {...next[idx], name: e.target.value}; setFreeFormLines(next); }} className="w-full p-1.5 border rounded text-xs" placeholder="شرح" /></td>
                    <td className="p-1">
                      <select value={line.partner_id} onChange={e => { const next = [...freeFormLines]; next[idx] = {...next[idx], partner_id: Number(e.target.value)}; setFreeFormLines(next); }} className="w-full p-1.5 border rounded text-xs">
                        <option value={0}>—</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><PriceInput value={line.debit} onChange={v => { const next = [...freeFormLines]; next[idx] = {...next[idx], debit: v}; setFreeFormLines(next); }} placeholder="۰" className="w-full p-1.5 border rounded text-xs" /></td>
                    <td className="p-1"><PriceInput value={line.credit} onChange={v => { const next = [...freeFormLines]; next[idx] = {...next[idx], credit: v}; setFreeFormLines(next); }} placeholder="۰" className="w-full p-1.5 border rounded text-xs" /></td>
                    <td className="p-1"><button onClick={() => setFreeFormLines(freeFormLines.filter((_,i) => i !== idx))} className="text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={() => setFreeFormLines([...freeFormLines, { account_id: 0, debit: '', credit: '', name: '', partner_id: 0 }])} className="text-xs text-blue-600 font-bold mb-3">+ افزودن آرتیکل</button>

            {/* Balance check */}
            <div className={`flex justify-between p-3 rounded-lg text-xs font-bold ${Math.abs(freeFormTotalDebit - freeFormTotalCredit) < 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span>بدهکار: {formatPrice(freeFormTotalDebit)}</span>
              <span>بستانکار: {formatPrice(freeFormTotalCredit)}</span>
              <span>{Math.abs(freeFormTotalDebit - freeFormTotalCredit) < 1 ? '✓ تراز' : `تفاوت: ${formatPrice(Math.abs(freeFormTotalDebit - freeFormTotalCredit))}`}</span>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleFreeFormSubmit} disabled={saving} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'ثبت...' : '✓ ثبت سند'}</button>
              <button onClick={() => setShowFreeForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>

            {/* Helper templates */}
            <div className="mt-4 border-t pt-3">
              <div className="text-[10px] text-gray-500 mb-2">الگوهای رایج:</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setFreeFormNote('مغایرت بانکی'); setFreeFormLines([{ account_id: 0, debit: '', credit: '', name: 'پرداخت‌های معلق (تسویه)', partner_id: 0 }, { account_id: 0, debit: '', credit: '', name: 'بانک (طبق صورتحساب)', partner_id: 0 }]); }} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-100">🏦 مغایرت بانکی</button>
                <button onClick={() => { setFreeFormNote('انتقال بین حساب‌ها'); setFreeFormLines([{ account_id: 0, debit: '', credit: '', name: 'از حساب', partner_id: 0 }, { account_id: 0, debit: '', credit: '', name: 'به حساب', partner_id: 0 }]); }} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-1 rounded font-bold hover:bg-purple-100">🔄 انتقال بین حساب‌ها</button>
                <button onClick={() => { setFreeFormNote('اصلاح حسابها'); setFreeFormLines([{ account_id: 0, debit: '', credit: '', name: '', partner_id: 0 }, { account_id: 0, debit: '', credit: '', name: '', partner_id: 0 }]); }} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold hover:bg-amber-100">📋 سند اصلاحی</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
