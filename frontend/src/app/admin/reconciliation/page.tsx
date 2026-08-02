'use client';

import { useState, useEffect } from 'react';
import { searchRead, create, callMethod, getBankCashBalances } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits, toJalali } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import PriceInput from '@/components/PriceInput';

interface BankLine {
  date: string;
  description: string;
  amount: number;
  reference: string;
}

interface PendingPayment {
  id: number;
  move_id: [number, string];
  name: string;
  debit: number;
  credit: number;
  date: string;
  partner_id: [number, string] | false;
  matched?: boolean;
  matchedWith?: number; // index in bankLines
}

export default function ReconciliationPage() {
  const [journals, setJournals] = useState<{id: number; name: string; type: string}[]>([]);
  const [selectedJournal, setSelectedJournal] = useState(0);
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [reconcileDate, setReconcileDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    async function load() {
      const jrnls = await getBankCashBalances();
      setJournals((jrnls || []).map((j: any) => ({ id: j.id, name: j.name, type: j.type })));
    }
    load();
  }, []);

  // Load pending payments for selected journal
  async function loadPendingPayments() {
    if (!selectedJournal) return;
    setLoading(true);
    try {
      // Find outstanding payment account (101403 or 101404)
      const outstandingAccounts = await searchRead('account.account', [
        ['code', 'in', ['101403', '101404']],
      ], ['id', 'code', 'name']);

      if (outstandingAccounts && outstandingAccounts.length > 0) {
        const accIds = outstandingAccounts.map((a: any) => a.id);
        // Get unreconciled lines in these accounts
        const lines = await searchRead('account.move.line', [
          ['account_id', 'in', accIds],
          ['parent_state', '=', 'posted'],
          ['reconciled', '=', false],
        ], ['name', 'debit', 'credit', 'date', 'move_id', 'partner_id'], 100, 0, 'date desc');
        setPendingPayments((lines || []).map((l: any) => ({ ...l, matched: false })));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { if (selectedJournal) loadPendingPayments(); }, [selectedJournal]);

  // Parse uploaded Excel/CSV file
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const parsed: BankLine[] = [];

      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 3) {
          parsed.push({
            date: cols[0] || '',
            description: cols[1] || '',
            amount: parseFloat(cols[2]?.replace(/[^\d.-]/g, '')) || 0,
            reference: cols[3] || '',
          });
        }
      }
      setBankLines(parsed);
      setMsg(`✅ ${toPersianDigits(parsed.length)} تراکنش از فایل خوانده شد`);
      setTimeout(() => setMsg(''), 3000);
    };
    reader.readAsText(file);
  }

  // Auto-match bank lines with pending payments
  function autoMatch() {
    const updated = [...pendingPayments];
    let matchCount = 0;

    for (let bi = 0; bi < bankLines.length; bi++) {
      const bl = bankLines[bi];
      // Try to find a pending payment with same amount
      const matchIdx = updated.findIndex(p =>
        !p.matched &&
        (Math.abs(p.debit - Math.abs(bl.amount)) < 1 || Math.abs(p.credit - Math.abs(bl.amount)) < 1)
      );
      if (matchIdx >= 0) {
        updated[matchIdx].matched = true;
        updated[matchIdx].matchedWith = bi;
        matchCount++;
      }
    }

    setPendingPayments(updated);
    setMsg(`✅ ${toPersianDigits(matchCount)} مورد اتوماتیک تطبیق شد`);
    setTimeout(() => setMsg(''), 3000);
  }

  // Create reconciliation journal entry
  async function handleReconcile() {
    const matched = pendingPayments.filter(p => p.matched);
    if (matched.length === 0) { alert('هیچ موردی تطبیق نشده'); return; }
    if (!selectedJournal) { alert('حساب بانک/صندوق انتخاب کنید'); return; }

    if (!confirm(`${matched.length} مورد تسویه شود؟\n\nاین عملیات سند مغایرت‌گیری ثبت میکند و حساب پرداخت‌های معلق را تسویه میکند.`)) return;

    setSaving(true);
    try {
      // Find the bank/cash account for this journal
      const journal = await searchRead('account.journal', [['id', '=', selectedJournal]], ['default_account_id']);
      const bankAccountId = journal?.[0]?.default_account_id?.[0];

      // Find outstanding payment account
      const outstandingAcc = await searchRead('account.account', [['code', '=', '101403']], ['id']);
      const outstandingAccId = outstandingAcc?.[0]?.id;

      if (!bankAccountId || !outstandingAccId) {
        alert('حساب بانک یا پرداخت‌های معلق یافت نشد');
        setSaving(false);
        return;
      }

      // Create reconciliation journal entry
      const lines: any[] = [];
      let totalAmount = 0;

      for (const p of matched) {
        const amount = p.debit || p.credit;
        totalAmount += amount;
        // Debit outstanding payments (to clear it)
        lines.push([0, 0, {
          account_id: outstandingAccId,
          debit: p.credit > 0 ? p.credit : 0,
          credit: p.debit > 0 ? p.debit : 0,
          name: `تسویه: ${p.name || p.move_id?.[1] || ''}`,
          partner_id: p.partner_id ? (p.partner_id as [number, string])[0] : false,
        }]);
      }

      // One line for bank (total)
      const totalDebit = matched.reduce((s, p) => s + (p.debit || 0), 0);
      const totalCredit = matched.reduce((s, p) => s + (p.credit || 0), 0);
      lines.push([0, 0, {
        account_id: bankAccountId,
        debit: totalCredit,
        credit: totalDebit,
        name: `مغایرت‌گیری بانکی - ${toJalali(reconcileDate)}`,
      }]);

      const moveId = await create('account.move', {
        move_type: 'entry',
        date: reconcileDate,
        journal_id: selectedJournal,
        line_ids: lines,
        narration: `سند مغایرت‌گیری بانکی - ${matched.length} تراکنش`,
      });
      await callMethod('account.move', 'action_post', [[moveId]]);

      setMsg(`✅ سند مغایرت‌گیری ثبت شد (${toPersianDigits(matched.length)} مورد)`);
      setBankLines([]);
      await loadPendingPayments();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  // Manual toggle match
  function toggleMatch(idx: number) {
    const updated = [...pendingPayments];
    updated[idx].matched = !updated[idx].matched;
    setPendingPayments(updated);
  }

  const matchedCount = pendingPayments.filter(p => p.matched).length;
  const totalPending = pendingPayments.reduce((s, p) => s + (p.debit || 0) + (p.credit || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مغایرت‌گیری بانکی</h1>
          <p className="text-gray-500 text-sm">تطبیق صورتحساب بانکی با پرداخت‌های معلق</p>
        </div>
        {msg && <span className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold">{msg}</span>}
      </div>

      {/* Step 1: Select Journal */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 mb-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">۱. انتخاب حساب</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">حساب بانک / صندوق</label>
            <select value={selectedJournal} onChange={(e) => setSelectedJournal(Number(e.target.value))} className="p-2 border border-gray-200 rounded-lg text-sm min-w-[200px]">
              <option value={0}>— انتخاب —</option>
              {journals.map(j => <option key={j.id} value={j.id}>{j.name} ({j.type === 'bank' ? 'بانک' : 'صندوق'})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">تاریخ سند</label>
            <JalaliDatePicker value={reconcileDate} onChange={setReconcileDate} placeholder="تاریخ" />
          </div>
        </div>
      </div>

      {/* Step 2: Upload Bank Statement */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 mb-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">۲. آپلود صورتحساب بانکی (CSV)</h3>
        <p className="text-xs text-gray-500 mb-3">فایل CSV با فرمت: تاریخ، شرح، مبلغ، شماره پیگیری</p>
        <div className="flex gap-3 items-center">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="text-sm" />
          {bankLines.length > 0 && (
            <button onClick={autoMatch} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600">
              🔄 تطبیق خودکار
            </button>
          )}
        </div>
        {bankLines.length > 0 && (
          <div className="mt-3 border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-right p-2">تاریخ</th>
                <th className="text-right p-2">شرح</th>
                <th className="text-right p-2">مبلغ</th>
                <th className="text-right p-2">پیگیری</th>
              </tr></thead>
              <tbody>
                {bankLines.map((bl, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{bl.date}</td>
                    <td className="p-2">{bl.description}</td>
                    <td className="p-2 font-bold">{formatPrice(bl.amount)}</td>
                    <td className="p-2 text-gray-400">{bl.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Sample file download */}
        <div className="mt-3">
          <a href="/sample-bank-statement.csv" download className="text-xs text-blue-600 hover:underline">📥 دانلود فایل نمونه CSV</a>
        </div>
      </div>

      {/* Step 3: Pending Payments */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-slate-700">۳. پرداخت‌های معلق</h3>
          <div className="flex gap-3 text-xs">
            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded font-bold">معلق: {formatPrice(totalPending)}</span>
            <span className="bg-green-50 text-green-700 px-2 py-1 rounded font-bold">تطبیق: {toPersianDigits(matchedCount)}</span>
          </div>
        </div>

        {loading ? <div className="text-center py-6 text-gray-400">بارگذاری...</div> : pendingPayments.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">هیچ پرداخت معلقی وجود ندارد ✓</div>
        ) : (
          <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="p-2 w-8"><input type="checkbox" onChange={(e) => { setPendingPayments(prev => prev.map(p => ({...p, matched: e.target.checked}))); }} /></th>
                <th className="text-right p-2">تاریخ</th>
                <th className="text-right p-2">سند</th>
                <th className="text-right p-2">شخص</th>
                <th className="text-right p-2">بدهکار</th>
                <th className="text-right p-2">بستانکار</th>
              </tr></thead>
              <tbody>
                {pendingPayments.map((p, idx) => (
                  <tr key={p.id} className={`border-t cursor-pointer ${p.matched ? 'bg-green-50' : 'hover:bg-gray-50'}`} onClick={() => toggleMatch(idx)}>
                    <td className="p-2"><input type="checkbox" checked={p.matched || false} onChange={() => toggleMatch(idx)} /></td>
                    <td className="p-2">{p.date ? toJalali(p.date) : ''}</td>
                    <td className="p-2">{p.move_id?.[1] || p.name || '—'}</td>
                    <td className="p-2">{p.partner_id ? p.partner_id[1] : '—'}</td>
                    <td className="p-2">{p.debit > 0 ? formatPrice(p.debit) : ''}</td>
                    <td className="p-2">{p.credit > 0 ? formatPrice(p.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Step 4: Reconcile */}
      {matchedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm font-bold text-green-700">{toPersianDigits(matchedCount)} مورد آماده تسویه</div>
              <div className="text-xs text-green-600 mt-1">سند مغایرت‌گیری ثبت میشود و حساب پرداخت‌های معلق تسویه خواهد شد.</div>
            </div>
            <button onClick={handleReconcile} disabled={saving} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50">
              {saving ? 'ثبت...' : '✓ ثبت سند مغایرت‌گیری'}
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
        <h4 className="text-sm font-bold text-blue-700 mb-2">ℹ️ راهنما</h4>
        <ol className="text-xs text-blue-600 space-y-1.5 list-decimal list-inside">
          <li>حساب بانک یا صندوق مورد نظر را انتخاب کنید</li>
          <li>فایل صورتحساب بانکی (CSV) را آپلود کنید</li>
          <li>دکمه «تطبیق خودکار» را بزنید — سیستم بر اساس مبلغ تطبیق میدهد</li>
          <li>موارد تطبیق‌نشده را دستی تیک بزنید یا رد کنید</li>
          <li>دکمه «ثبت سند» را بزنید — حساب معلق تسویه میشود</li>
        </ol>
        <div className="mt-3 text-[10px] text-blue-500">
          <b>فرمت CSV:</b> تاریخ,شرح,مبلغ,شماره_پیگیری<br/>
          <b>مثال:</b> 2026-07-15,واریز فروش,5000000,123456
        </div>
      </div>
    </div>
  );
}
