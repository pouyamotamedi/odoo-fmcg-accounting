'use client';

import { useState, useEffect } from 'react';
import { searchRead, create, confirmInvoice, getBankCashBalances } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';

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
}

interface Journal {
  id: number;
  name: string;
  type: string;
}

type EntryType = 'payment' | 'receipt';

export default function AccountingPage() {
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<EntryType>('payment');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    description: '',
    amount: '',
    journal_id: 0,
    date: new Date().toISOString().split('T')[0],
    note: '',
  });

  async function fetchEntries() {
    try {
      setLoading(true);
      const data = await searchRead(
        'account.move',
        [['move_type', '=', 'entry'], ['state', '=', 'posted']],
        ['name', 'date', 'move_type', 'amount_total', 'journal_id', 'partner_id', 'narration', 'state'],
        50, 0, 'date desc'
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

  useEffect(() => {
    fetchEntries();
    fetchJournals();
  }, []);

  function openForm(type: EntryType) {
    setFormType(type);
    setForm({ description: '', amount: '', journal_id: 0, date: new Date().toISOString().split('T')[0], note: '' });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.description || !form.amount || !form.journal_id) {
      alert('شرح، مبلغ و حساب الزامی هستند');
      return;
    }
    setSaving(true);
    try {
      const amount = parseFloat(form.amount.replace(/[^\d.]/g, '')) || 0;
      if (amount <= 0) { alert('مبلغ باید بزرگتر از صفر باشد'); setSaving(false); return; }

      // Find the journal's default accounts
      const journalData = await searchRead('account.journal', [['id', '=', form.journal_id]], ['default_account_id'], 1);
      const defaultAccountId = journalData?.[0]?.default_account_id?.[0];
      
      if (!defaultAccountId) {
        alert('حساب پیش‌فرض ژورنال یافت نشد');
        setSaving(false);
        return;
      }

      // For payments: debit expense, credit bank/cash
      // For receipts: debit bank/cash, credit income
      const lines = formType === 'payment' ? [
        [0, 0, { name: form.description, debit: amount, credit: 0, account_id: defaultAccountId }],
        [0, 0, { name: form.description, debit: 0, credit: amount, account_id: defaultAccountId }],
      ] : [
        [0, 0, { name: form.description, debit: amount, credit: 0, account_id: defaultAccountId }],
        [0, 0, { name: form.description, debit: 0, credit: amount, account_id: defaultAccountId }],
      ];

      const moveId = await create('account.move', {
        move_type: 'entry',
        journal_id: form.journal_id,
        date: form.date,
        narration: form.note || form.description,
        line_ids: lines,
      });

      await confirmInvoice(moveId);
      setShowForm(false);
      setMsg(`✅ سند ${formType === 'payment' ? 'پرداخت' : 'دریافت'} ثبت شد`);
      setTimeout(() => setMsg(''), 3000);
      await fetchEntries();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت سند');
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">اسناد حسابداری</h1>
          <p className="text-gray-500 text-sm">ثبت دریافت، پرداخت، تنخواه و سایر اسناد</p>
        </div>
        <div className="flex gap-2">
          {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button onClick={() => openForm('receipt')} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition">
            + دریافت
          </button>
          <button onClick={() => openForm('payment')} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600 transition">
            + پرداخت
          </button>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'هزینه پیک'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">🏍️</div>
          <div className="text-xs text-gray-600 mt-1">هزینه پیک</div>
        </button>
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'تنخواه'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">💰</div>
          <div className="text-xs text-gray-600 mt-1">تنخواه</div>
        </button>
        <button onClick={() => { openForm('payment'); setForm(f => ({...f, description: 'برداشت از صندوق'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-red-300 transition text-center">
          <div className="text-2xl">🏧</div>
          <div className="text-xs text-gray-600 mt-1">برداشت</div>
        </button>
        <button onClick={() => { openForm('receipt'); setForm(f => ({...f, description: 'واریز به صندوق'})); }} className="bg-white rounded-xl p-4 border border-gray-100 hover:border-green-300 transition text-center">
          <div className="text-2xl">📥</div>
          <div className="text-xs text-gray-600 mt-1">واریز</div>
        </button>
      </div>

      {/* Entries List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
          <div className="text-4xl mb-3">📋</div>
          <p>هنوز سند حسابداری ثبت نشده</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right p-3 font-medium text-gray-600">شماره</th>
                <th className="text-right p-3 font-medium text-gray-600">تاریخ</th>
                <th className="text-right p-3 font-medium text-gray-600">شرح</th>
                <th className="text-right p-3 font-medium text-gray-600">حساب</th>
                <th className="text-right p-3 font-medium text-gray-600">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-3 text-gray-500">{entry.name}</td>
                  <td className="p-3">{entry.date}</td>
                  <td className="p-3">{entry.narration || '—'}</td>
                  <td className="p-3">{entry.journal_id ? entry.journal_id[1] : '—'}</td>
                  <td className="p-3 font-bold">{formatPrice(entry.amount_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">
              {formType === 'payment' ? '📤 ثبت پرداخت' : '📥 ثبت دریافت'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">شرح *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  placeholder="مثلاً: هزینه پیک، تنخواه، برداشت..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">مبلغ (تومان) *</label>
                <input
                  type="text"
                  value={form.amount}
                  onChange={(e) => setForm({...form, amount: e.target.value})}
                  placeholder="۵۰۰,۰۰۰"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">از حساب *</label>
                <select
                  value={form.journal_id}
                  onChange={(e) => setForm({...form, journal_id: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value={0}>— انتخاب حساب —</option>
                  {journals.map((j) => (
                    <option key={j.id} value={j.id}>{j.name} ({j.type === 'cash' ? 'نقدی' : 'بانک'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">تاریخ</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({...form, date: e.target.value})}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">توضیحات</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({...form, note: e.target.value})}
                  placeholder="اختیاری..."
                  rows={2}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className={`flex-1 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50 ${formType === 'payment' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {saving ? 'در حال ثبت...' : formType === 'payment' ? 'ثبت پرداخت' : 'ثبت دریافت'}
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
