'use client';

import { useState, useEffect } from 'react';
import { getBankCashBalances, write, create, unlink, searchRead } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';

interface Journal {
  id: number;
  name: string;
  type: 'bank' | 'cash';
  fmcg_running_balance: number;
  fmcg_is_active: boolean;
  fmcg_opening_balance: number;
  fmcg_account_holder: string | false;
  fmcg_account_number: string | false;
}

export default function TreasuryPage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    type: 'bank' as 'bank' | 'cash',
    fmcg_account_number: '',
    fmcg_account_holder: '',
    fmcg_opening_balance: '',
  });

  async function fetchData() {
    try {
      setLoading(true);
      const data = await getBankCashBalances();
      setJournals(data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  function openNewForm() {
    setForm({ name: '', type: 'bank', fmcg_account_number: '', fmcg_account_holder: '', fmcg_opening_balance: '' });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(j: Journal) {
    setForm({
      name: j.name,
      type: j.type,
      fmcg_account_number: j.fmcg_account_number || '',
      fmcg_account_holder: j.fmcg_account_holder || '',
      fmcg_opening_balance: String(j.fmcg_opening_balance || ''),
    });
    setEditingId(j.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name) { alert('نام حساب الزامی است'); return; }
    setSaving(true);
    try {
      const values: any = {
        name: form.name,
        fmcg_account_holder: form.fmcg_account_holder || false,
        fmcg_opening_balance: parseFloat(form.fmcg_opening_balance.replace(/[^\d.]/g, '')) || 0,
      };
      if (form.type === 'bank') {
        values.fmcg_account_number = form.fmcg_account_number.replace(/[^\d]/g, '') || false;
      }

      if (editingId) {
        await write('account.journal', [editingId], values);
      } else {
        values.type = form.type;
        await create('account.journal', values);
      }
      setShowForm(false);
      setMsg('✅ ذخیره شد');
      setTimeout(() => setMsg(''), 3000);
      await fetchData();
    } catch (e: any) {
      alert(e.message || 'خطا در ذخیره');
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('آیا از حذف این حساب مطمئنید؟')) return;
    try {
      await unlink('account.journal', [id]);
      await fetchData();
    } catch (e: any) {
      // Try to deactivate instead
      try {
        await write('account.journal', [id], { fmcg_is_active: false });
        await fetchData();
      } catch {
        alert(e.message || 'امکان حذف وجود ندارد — ممکن است تراکنش مرتبط داشته باشد');
      }
    }
  }

  const cashJournals = journals.filter((j) => j.type === 'cash');
  const bankJournals = journals.filter((j) => j.type === 'bank');
  const totalCash = cashJournals.reduce((s, j) => s + (j.fmcg_running_balance || 0), 0);
  const totalBank = bankJournals.reduce((s, j) => s + (j.fmcg_running_balance || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">بانک و صندوق</h1>
          <p className="text-gray-500 text-sm">موجودی حساب‌های بانکی و صندوق نقدی</p>
        </div>
        <div className="flex gap-2">
          {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button onClick={openNewForm} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">
            + حساب جدید
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-green-600">{formatPrice(totalCash)}</div>
              <div className="text-sm text-gray-500 mt-1">موجودی نقدی (تومان)</div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-blue-600">{formatPrice(totalBank)}</div>
              <div className="text-sm text-gray-500 mt-1">موجودی بانکی (تومان)</div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-slate-800">{formatPrice(totalCash + totalBank)}</div>
              <div className="text-sm text-gray-500 mt-1">مجموع دارایی نقدی</div>
            </div>
          </div>

          <JournalSection title="💵 صندوق‌های نقدی" journals={cashJournals} accent="green" onEdit={openEditForm} onDelete={handleDelete} />
          <JournalSection title="🏦 حساب‌های بانکی" journals={bankJournals} accent="blue" onEdit={openEditForm} onDelete={handleDelete} />
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">
              {editingId ? '✏️ ویرایش حساب' : '+ حساب جدید'}
            </h3>
            <div className="space-y-3">
              {!editingId && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">نوع حساب</label>
                  <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value as 'bank' | 'cash'})} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                    <option value="bank">حساب بانکی</option>
                    <option value="cash">صندوق نقدی</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام حساب *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="مثلاً: بانک ملت شعبه مرکزی" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              {(form.type === 'bank' || (editingId && bankJournals.find(j => j.id === editingId))) && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">شماره حساب</label>
                    <input type="text" value={form.fmcg_account_number} onChange={(e) => setForm({...form, fmcg_account_number: e.target.value})} placeholder="۱۲۳۴۵۶۷۸۹۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">صاحب حساب</label>
                    <input type="text" value={form.fmcg_account_holder} onChange={(e) => setForm({...form, fmcg_account_holder: e.target.value})} placeholder="نام صاحب حساب" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">موجودی اولیه (تومان)</label>
                <input type="text" value={form.fmcg_opening_balance} onChange={(e) => setForm({...form, fmcg_opening_balance: e.target.value})} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50">
                {saving ? 'در حال ذخیره...' : editingId ? 'ذخیره تغییرات' : 'ایجاد حساب'}
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

function JournalSection({ title, journals, accent, onEdit, onDelete }: { title: string; journals: Journal[]; accent: 'green' | 'blue'; onEdit: (j: Journal) => void; onDelete: (id: number) => void }) {
  if (journals.length === 0) return null;
  const border = accent === 'green' ? 'border-r-green-400' : 'border-r-blue-400';
  const text = accent === 'green' ? 'text-green-600' : 'text-blue-600';
  return (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-slate-800 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {journals.map((j) => (
          <div key={j.id} className={`bg-white rounded-xl p-4 border border-gray-100 border-r-4 ${border}`}>
            <div className="flex justify-between items-start">
              <div className="font-bold text-sm text-slate-800">{j.name}</div>
              <div className="flex gap-1">
                {!j.fmcg_is_active && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">غیرفعال</span>
                )}
                <button onClick={() => onEdit(j)} className="text-xs text-blue-500 hover:text-blue-700">✏️</button>
                <button onClick={() => onDelete(j.id)} className="text-xs text-red-400 hover:text-red-600">🗑️</button>
              </div>
            </div>
            {j.fmcg_account_number && (
              <div className="text-xs text-gray-400 mt-1">شماره: {toPersianDigits(j.fmcg_account_number)}</div>
            )}
            {j.fmcg_account_holder && (
              <div className="text-xs text-gray-400">صاحب حساب: {j.fmcg_account_holder}</div>
            )}
            <div className={`text-xl font-bold mt-3 ${text}`}>{formatPrice(j.fmcg_running_balance || 0)}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              موجودی اولیه: {formatPrice(j.fmcg_opening_balance || 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
