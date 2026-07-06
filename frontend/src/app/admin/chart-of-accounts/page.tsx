'use client';

import { useState, useEffect } from 'react';
import { getAccounts, createAccount, updateAccount, deleteAccount, searchRead } from '@/lib/odoo-api';
import { toPersianDigits } from '@/lib/utils';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'expense', label: 'هزینه' },
  { value: 'expense_direct_cost', label: 'بهای تمام شده' },
  { value: 'income', label: 'درآمد' },
  { value: 'income_other', label: 'درآمد متفرقه' },
  { value: 'equity', label: 'حقوق صاحبان سهام' },
  { value: 'asset_current', label: 'دارایی جاری' },
  { value: 'liability_current', label: 'بدهی جاری' },
];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  expense: 'هزینه',
  expense_direct_cost: 'بهای تمام شده',
  income: 'درآمد',
  income_other: 'درآمد متفرقه',
  equity: 'حقوق صاحبان سهام',
  asset_current: 'دارایی جاری',
  liability_current: 'بدهی جاری',
  asset_receivable: 'دریافتنی',
  liability_payable: 'پرداختنی',
  asset_cash: 'نقد و بانک',
  asset_non_current: 'دارایی غیرجاری',
  liability_non_current: 'بدهی غیرجاری',
  off_balance: 'خارج از ترازنامه',
  asset_fixed: 'دارایی ثابت',
  asset_prepayments: 'پیش‌پرداخت',
  equity_unaffected: 'سود و زیان انباشته',
};

const RENAME_MAPPINGS: { code: string; persianName: string }[] = [
  { code: '400000', persianName: 'فروش کالا' },
  { code: '500000', persianName: 'بهای تمام شده کالای فروش رفته' },
  { code: '600000', persianName: 'هزینه‌ها' },
  { code: '611000', persianName: 'خرید تجهیزات' },
  { code: '612000', persianName: 'اجاره' },
  { code: '620000', persianName: 'کارمزد بانکی' },
  { code: '630000', persianName: 'حقوق و دستمزد' },
  { code: '301000', persianName: 'سرمایه' },
  { code: '302000', persianName: 'سود تقسیمی شرکا' },
];

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('expense');
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editAccount, setEditAccount] = useState<any>(null);
  const [editName, setEditName] = useState('');

  // Rename state
  const [renaming, setRenaming] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await getAccounts();
      setAccounts(result || []);
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
      setAccounts([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showMessage(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleAdd() {
    if (!newName.trim() || !newCode.trim()) {
      alert('نام و کد حساب الزامی است');
      return;
    }
    setSaving(true);
    try {
      await createAccount({ name: newName.trim(), code: newCode.trim(), account_type: newType });
      setShowAddForm(false);
      setNewName('');
      setNewCode('');
      setNewType('expense');
      showMessage('حساب جدید ایجاد شد');
      await load();
    } catch (e: any) {
      alert(e.message || 'خطا در ایجاد حساب');
    }
    setSaving(false);
  }

  async function handleEdit() {
    if (!editAccount || !editName.trim()) return;
    setSaving(true);
    try {
      await updateAccount(editAccount.id, { name: editName.trim() });
      setEditAccount(null);
      setEditName('');
      showMessage('نام حساب ویرایش شد');
      await load();
    } catch (e: any) {
      alert(e.message || 'خطا در ویرایش حساب');
    }
    setSaving(false);
  }

  async function handleDelete(account: any) {
    if (!confirm(`آیا از غیرفعال کردن حساب "${account.name}" مطمئن هستید؟`)) return;
    try {
      await deleteAccount(account.id);
      showMessage('حساب غیرفعال شد');
      await load();
    } catch (e: any) {
      alert(e.message || 'خطا در حذف حساب');
    }
  }

  async function handleRenameAccounts() {
    if (!confirm('آیا از تغییر نام حساب‌ها به فارسی مطمئن هستید؟')) return;
    setRenaming(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const mapping of RENAME_MAPPINGS) {
      try {
        const results = await searchRead(
          'account.account',
          [['code', '=', mapping.code]],
          ['id', 'name'],
          1
        );
        if (results && results.length > 0) {
          await updateAccount(results[0].id, { name: mapping.persianName });
          successCount++;
        }
      } catch (e: any) {
        errors.push(`${mapping.code} (${mapping.persianName}): ${e.message || 'خطا'}`);
      }
    }
    if (errors.length > 0) {
      alert(`خطا در تغییر نام ${toPersianDigits(String(errors.length))} حساب:\n${errors.join('\n')}`);
    }
    if (successCount > 0) {
      showMessage(`${toPersianDigits(String(successCount))} حساب با موفقیت تغییر نام یافت`);
      await load();
    }
    setRenaming(false);
  }

  const filtered = accounts.filter((a) => {
    if (activeTab !== 'all' && a.account_type !== activeTab) return false;
    if (!search) return true;
    return a.name.includes(search) || a.code.includes(search);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">سرفصل حساب‌ها</h1>
          <p className="text-gray-500 text-sm">مدیریت حساب‌های دفتر کل</p>
        </div>
        {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={load} className="bg-red-100 hover:bg-red-200 px-3 py-1 rounded text-xs font-bold">تلاش مجدد</button>
        </div>
      )}

      {/* Account type tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'همه' },
          { key: 'expense', label: 'هزینه' },
          { key: 'expense_direct_cost', label: 'بهای تمام شده' },
          { key: 'income', label: 'درآمد' },
          { key: 'income_other', label: 'درآمد متفرقه' },
          { key: 'equity', label: 'حقوق صاحبان سهام' },
          { key: 'asset_current', label: 'دارایی جاری' },
          { key: 'asset_receivable', label: 'دریافتنی' },
          { key: 'liability_current', label: 'بدهی جاری' },
          { key: 'liability_payable', label: 'پرداختنی' },
          { key: 'asset_cash', label: 'نقد و بانک' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === tab.key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <button onClick={() => setShowAddForm(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600">
          ➕ افزودن حساب جدید
        </button>
        <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">🔄 بروزرسانی</button>
        <input
          type="text"
          placeholder="🔍 جستجو..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mr-auto p-1.5 px-3 border rounded-lg text-sm"
        />
      </div>

      {/* Accounts table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">موردی یافت نشد</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-right p-3">کد</th>
                <th className="text-right p-3">نام حساب</th>
                <th className="text-right p-3">نوع</th>
                <th className="text-right p-3">وضعیت</th>
                <th className="text-right p-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{toPersianDigits(account.code)}</td>
                  <td className="p-3 font-medium">{account.name}</td>
                  <td className="p-3 text-xs">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {account.deprecated ? (
                      <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded">غیرفعال</span>
                    ) : (
                      <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded">فعال</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditAccount(account); setEditName(account.name); }}
                        className="text-[11px] bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                      >
                        ویرایش
                      </button>
                      {!account.deprecated && (
                        <button
                          onClick={() => handleDelete(account)}
                          className="text-[11px] bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                        >
                          غیرفعال
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">➕ افزودن حساب جدید</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام حساب *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثلا: هزینه تبلیغات"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">کد حساب *</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="مثلا: 640000"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نوع حساب *</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                >
                  {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره...' : 'ذخیره'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">✏️ ویرایش نام حساب</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">کد حساب</label>
                <input
                  type="text"
                  value={editAccount.code}
                  disabled
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام جدید *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleEdit}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره...' : 'ذخیره'}
              </button>
              <button
                onClick={() => { setEditAccount(null); setEditName(''); }}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
