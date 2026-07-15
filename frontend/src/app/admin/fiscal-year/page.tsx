'use client';

import { useState, useEffect } from 'react';
import { searchRead, write, create, callMethod, getBankCashBalances } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits, toJalali } from '@/lib/utils';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import PriceInput from '@/components/PriceInput';

interface FiscalYear {
  id: number;
  name: string;
  date_from: string;
  date_to: string;
}

interface LockInfo {
  fiscalyear_lock_date: string | false;
  tax_lock_date: string | false;
  hard_lock_date: string | false;
}

export default function FiscalYearPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [lockInfo, setLockInfo] = useState<LockInfo>({ fiscalyear_lock_date: false, tax_lock_date: false, hard_lock_date: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [fiscalYearModelExists, setFiscalYearModelExists] = useState(true);

  // New fiscal year form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');

  // Opening balance form
  const [showOpening, setShowOpening] = useState(false);
  const [openingDate, setOpeningDate] = useState('');
  const [openingItems, setOpeningItems] = useState<{account_id: number; account_name: string; debit: string; credit: string}[]>([]);
  const [accounts, setAccounts] = useState<{id: number; name: string; code: string}[]>([]);
  const [journals, setJournals] = useState<{id: number; name: string; type: string}[]>([]);

  // Lock dates form
  const [lockDate, setLockDate] = useState('');
  const [taxLockDate, setTaxLockDate] = useState('');

  // Year-end closing
  const [showClosing, setShowClosing] = useState(false);
  const [closingYear, setClosingYear] = useState<FiscalYear | null>(null);
  const [profitLossAmount, setProfitLossAmount] = useState(0);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState<number>(0);
  const [equityAccounts, setEquityAccounts] = useState<{id: number; name: string; code: string}[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      // Load fiscal years
      try {
        const years = await searchRead('account.fiscal.year', [], ['name', 'date_from', 'date_to'], 0, 0, 'date_from desc');
        setFiscalYears(years || []);
        setFiscalYearModelExists(true);
      } catch {
        setFiscalYearModelExists(false);
        setFiscalYears([]);
      }

      // Load lock dates from company
      try {
        const companies = await searchRead('res.company', [], ['fiscalyear_lock_date', 'tax_lock_date', 'hard_lock_date'], 1);
        if (companies && companies.length > 0) {
          setLockInfo({
            fiscalyear_lock_date: companies[0].fiscalyear_lock_date || false,
            tax_lock_date: companies[0].tax_lock_date || false,
            hard_lock_date: companies[0].hard_lock_date || false,
          });
          setLockDate(companies[0].fiscalyear_lock_date || '');
          setTaxLockDate(companies[0].tax_lock_date || '');
        }
      } catch {}

      // Load equity accounts
      try {
        const eqAccounts = await searchRead('account.account', [
          ['account_type', 'in', ['equity', 'equity_unaffected']],
        ], ['name', 'code'], 0, 0, 'code asc');
        setEquityAccounts(eqAccounts || []);
      } catch {}
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreateFiscalYear() {
    if (!newName || !newFrom || !newTo) { alert('تمام فیلدها الزامی هستند'); return; }
    setSaving(true);
    try {
      if (fiscalYearModelExists) {
        await create('account.fiscal.year', { name: newName, date_from: newFrom, date_to: newTo });
      } else {
        // If model doesn't exist, just store as a lock date reference
        alert('مدل سال مالی در Odoo فعال نیست. لطفاً از بخش تنظیمات Odoo، Fiscal Years را فعال کنید.\n\nدر عوض، تاریخ قفل تنظیم میشود.');
        const companies = await searchRead('res.company', [], ['id'], 1);
        if (companies?.[0]) {
          await write('res.company', [companies[0].id], { fiscalyear_lock_date: newFrom });
        }
      }
      setShowNewForm(false);
      setNewName(''); setNewFrom(''); setNewTo('');
      setMsg('✅ سال مالی ایجاد شد');
      setTimeout(() => setMsg(''), 3000);
      await loadData();
    } catch (e: any) { alert(e.message || 'خطا در ایجاد سال مالی'); }
    setSaving(false);
  }

  async function handleSetLockDate() {
    if (!lockDate) { alert('تاریخ قفل را وارد کنید'); return; }
    setSaving(true);
    try {
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) {
        const values: any = { fiscalyear_lock_date: lockDate };
        if (taxLockDate) values.tax_lock_date = taxLockDate;
        await write('res.company', [companies[0].id], values);
        setMsg('✅ تاریخ قفل تنظیم شد');
        setTimeout(() => setMsg(''), 3000);
        await loadData();
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleRemoveLockDate() {
    if (!confirm('آیا از حذف تاریخ قفل مطمئنید؟')) return;
    setSaving(true);
    try {
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) {
        await write('res.company', [companies[0].id], { fiscalyear_lock_date: false, tax_lock_date: false });
        setMsg('✅ قفل حذف شد');
        setTimeout(() => setMsg(''), 3000);
        await loadData();
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleStartClosing(fy: FiscalYear) {
    setClosingYear(fy);
    try {
      const incomeLines = await searchRead('account.move.line', [
        ['parent_state', '=', 'posted'], ['date', '>=', fy.date_from], ['date', '<=', fy.date_to],
        ['account_id.account_type', 'in', ['income', 'income_other']],
      ], ['credit', 'debit']);
      const totalIncome = (incomeLines || []).reduce((sum: number, l: any) => sum + l.credit - l.debit, 0);
      const expenseLines = await searchRead('account.move.line', [
        ['parent_state', '=', 'posted'], ['date', '>=', fy.date_from], ['date', '<=', fy.date_to],
        ['account_id.account_type', 'in', ['expense', 'expense_direct_cost', 'expense_depreciation']],
      ], ['debit', 'credit']);
      const totalExpense = (expenseLines || []).reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);
      setProfitLossAmount(totalIncome - totalExpense);
    } catch { setProfitLossAmount(0); }
    setShowClosing(true);
  }

  async function handleCloseYear() {
    if (!closingYear || !retainedEarningsAccount) { alert('حساب سود انباشته را انتخاب کنید'); return; }
    if (!confirm(`بستن سال مالی ${closingYear.name}؟`)) return;
    setSaving(true);
    try {
      if (profitLossAmount !== 0) {
        const cyeAccounts = await searchRead('account.account', [['account_type', '=', 'equity_unaffected']], ['id'], 1);
        const cyeAccountId = cyeAccounts?.[0]?.id;
        if (cyeAccountId) {
          const closingLines: any[] = [];
          if (profitLossAmount > 0) {
            closingLines.push([0, 0, { account_id: cyeAccountId, debit: profitLossAmount, credit: 0, name: `بستن سال مالی ${closingYear.name}` }]);
            closingLines.push([0, 0, { account_id: retainedEarningsAccount, debit: 0, credit: profitLossAmount, name: `سود انباشته ${closingYear.name}` }]);
          } else {
            const abs = Math.abs(profitLossAmount);
            closingLines.push([0, 0, { account_id: cyeAccountId, debit: 0, credit: abs, name: `بستن سال مالی ${closingYear.name}` }]);
            closingLines.push([0, 0, { account_id: retainedEarningsAccount, debit: abs, credit: 0, name: `زیان انباشته ${closingYear.name}` }]);
          }
          const moveId = await create('account.move', { move_type: 'entry', date: closingYear.date_to, line_ids: closingLines, narration: `سند بستن ${closingYear.name}` });
          await callMethod('account.move', 'action_post', [[moveId]]);
        }
      }
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) {
        await write('res.company', [companies[0].id], { fiscalyear_lock_date: closingYear.date_to, tax_lock_date: closingYear.date_to });
      }
      setShowClosing(false); setClosingYear(null);
      setMsg(`✅ سال مالی ${closingYear.name} بسته شد`);
      setTimeout(() => setMsg(''), 4000);
      await loadData();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleOpeningBalance() {
    // Load all accounts for opening balance entry
    try {
      const allAccounts = await searchRead('account.account', [['deprecated', '=', false]], ['name', 'code', 'account_type'], 0, 0, 'code asc');
      setAccounts(allAccounts || []);
      const jrnls = await getBankCashBalances();
      setJournals((jrnls || []).map((j: any) => ({ id: j.id, name: j.name, type: j.type })));
    } catch {}
    // Pre-populate with common opening items
    setOpeningItems([
      { account_id: 0, account_name: '', debit: '', credit: '' },
    ]);
    setOpeningDate(new Date().toISOString().split('T')[0]);
    setShowOpening(true);
  }

  function addOpeningItem() {
    setOpeningItems([...openingItems, { account_id: 0, account_name: '', debit: '', credit: '' }]);
  }

  function removeOpeningItem(idx: number) {
    setOpeningItems(openingItems.filter((_, i) => i !== idx));
  }

  function updateOpeningItem(idx: number, field: string, value: any) {
    const items = [...openingItems];
    (items[idx] as any)[field] = value;
    if (field === 'account_id') {
      const acc = accounts.find(a => a.id === value);
      items[idx].account_name = acc ? `${acc.code} - ${acc.name}` : '';
    }
    setOpeningItems(items);
  }

  async function handleSaveOpening() {
    if (!openingDate) { alert('تاریخ افتتاحیه الزامی است'); return; }
    const validItems = openingItems.filter(item => item.account_id && (Number(item.debit) > 0 || Number(item.credit) > 0));
    if (validItems.length === 0) { alert('حداقل یک آیتم با مبلغ وارد کنید'); return; }
    // Check balance
    const totalDebit = validItems.reduce((s, i) => s + (Number(i.debit) || 0), 0);
    const totalCredit = validItems.reduce((s, i) => s + (Number(i.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 1) {
      alert(`سند تراز نیست!\nجمع بدهکار: ${formatPrice(totalDebit)}\nجمع بستانکار: ${formatPrice(totalCredit)}\nتفاوت: ${formatPrice(Math.abs(totalDebit - totalCredit))}`);
      return;
    }
    setSaving(true);
    try {
      const lines = validItems.map(item => [0, 0, {
        account_id: item.account_id,
        debit: Number(item.debit) || 0,
        credit: Number(item.credit) || 0,
        name: 'سند افتتاحیه',
      }]);
      const moveId = await create('account.move', { move_type: 'entry', date: openingDate, line_ids: lines, narration: 'سند افتتاحیه سال مالی' });
      await callMethod('account.move', 'action_post', [[moveId]]);
      setShowOpening(false);
      setMsg('✅ سند افتتاحیه ثبت شد');
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  const openingTotalDebit = openingItems.reduce((s, i) => s + (Number(i.debit) || 0), 0);
  const openingTotalCredit = openingItems.reduce((s, i) => s + (Number(i.credit) || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مدیریت سال مالی</h1>
          <p className="text-gray-500 text-sm">افتتاح، بستن سال مالی و سند افتتاحیه</p>
        </div>
        {msg && <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">{msg}</span>}
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">بارگذاری...</div> : (
        <div className="space-y-6">

          {/* Lock Status */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-slate-700 mb-4">🔒 وضعیت قفل دفاتر</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل عمومی</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.fiscalyear_lock_date ? toJalali(lockInfo.fiscalyear_lock_date) : '— تنظیم نشده —'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل مالیاتی</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.tax_lock_date ? toJalali(lockInfo.tax_lock_date) : '— تنظیم نشده —'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل سخت (غیرقابل بازگشت)</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.hard_lock_date ? <span className="text-red-600">{toJalali(lockInfo.hard_lock_date)}</span> : '— تنظیم نشده —'}
                </div>
              </div>
            </div>
            <div className="border-t pt-4 mt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">تاریخ قفل عمومی</label>
                  <JalaliDatePicker value={lockDate} onChange={setLockDate} placeholder="انتخاب تاریخ" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">تاریخ قفل مالیاتی</label>
                  <JalaliDatePicker value={taxLockDate} onChange={setTaxLockDate} placeholder="انتخاب تاریخ" />
                </div>
                <button onClick={handleSetLockDate} disabled={saving} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-50">تنظیم قفل</button>
                {lockInfo.fiscalyear_lock_date && (
                  <button onClick={handleRemoveLockDate} disabled={saving} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200">حذف قفل</button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">بعد از تنظیم قفل، هیچ سندی با تاریخ قبل از آن قابل ثبت نخواهد بود.</p>
            </div>
          </div>

          {/* Fiscal Years List */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-700">📅 سال‌های مالی</h3>
              <div className="flex gap-2">
                <button onClick={handleOpeningBalance} className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600">📝 سند افتتاحیه</button>
                <button onClick={() => setShowNewForm(true)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600">+ سال مالی جدید</button>
              </div>
            </div>

            {!fiscalYearModelExists && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
                ⚠️ مدل سال مالی (account.fiscal.year) در Odoo فعال نیست. برای فعال‌سازی به تنظیمات Odoo → Accounting → Fiscal Periods بروید و Fiscal Years را فعال کنید.
              </div>
            )}

            {fiscalYears.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📅</div>
                <p className="text-gray-400 text-sm">سال مالی تعریف نشده</p>
                <p className="text-gray-400 text-[10px] mt-1">میتوانید سال مالی جدید ایجاد کنید</p>
              </div>
            ) : (
              <div className="space-y-2">
                {fiscalYears.map((fy) => {
                  const isLocked = lockInfo.fiscalyear_lock_date && fy.date_to <= lockInfo.fiscalyear_lock_date;
                  return (
                    <div key={fy.id} className={`flex items-center justify-between p-3 rounded-lg border ${isLocked ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        {isLocked ? <span className="text-lg">🔒</span> : <span className="text-lg">📆</span>}
                        <div>
                          <div className="text-sm font-bold text-slate-700">{fy.name}</div>
                          <div className="text-[10px] text-gray-500">{toJalali(fy.date_from)} تا {toJalali(fy.date_to)}</div>
                        </div>
                      </div>
                      <div>
                        {isLocked ? (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-bold">بسته شده</span>
                        ) : (
                          <button onClick={() => handleStartClosing(fy)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200">بستن سال</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-blue-700 mb-2">ℹ️ راهنما</h4>
            <ol className="text-xs text-blue-600 space-y-1.5 list-decimal list-inside">
              <li><b>افتتاح سال:</b> سال مالی جدید ایجاد کنید و سند افتتاحیه (موجودی اول دوره) ثبت کنید</li>
              <li><b>سند افتتاحیه:</b> موجودی بانک، صندوق، کالا، آورده شرکا و سایر دارایی/بدهی‌ها</li>
              <li><b>بستن سال:</b> سود/زیان به سود انباشته منتقل شده و دفاتر قفل میشوند</li>
              <li><b>قفل دفاتر:</b> جلوگیری از ثبت سند با تاریخ قبل از تاریخ قفل</li>
            </ol>
          </div>
        </div>
      )}

      {/* New Fiscal Year Modal */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">📅 افتتاح سال مالی جدید</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام سال مالی *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلاً: سال مالی ۱۴۰۴" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تاریخ شروع *</label>
                  <JalaliDatePicker value={newFrom} onChange={setNewFrom} placeholder="شروع" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تاریخ پایان *</label>
                  <JalaliDatePicker value={newTo} onChange={setNewTo} placeholder="پایان" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreateFiscalYear} disabled={saving} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 disabled:opacity-50">{saving ? 'ثبت...' : 'ایجاد'}</button>
              <button onClick={() => setShowNewForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Year-End Closing Modal */}
      {showClosing && closingYear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🔒 بستن سال: {closingYear.name}</h3>
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${profitLossAmount >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-xs text-gray-600 mb-1">سود / زیان خالص:</div>
                <div className={`text-xl font-bold ${profitLossAmount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatPrice(Math.abs(profitLossAmount))} تومان {profitLossAmount >= 0 ? '(سود)' : '(زیان)'}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">حساب سود/زیان انباشته *</label>
                <select value={retainedEarningsAccount} onChange={(e) => setRetainedEarningsAccount(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>— انتخاب —</option>
                  {equityAccounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>)}
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-600">
                سود/زیان به حساب انتخابی منتقل و دفاتر تا {toJalali(closingYear.date_to)} قفل میشوند.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCloseYear} disabled={saving} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'بستن...' : '🔒 بستن سال'}</button>
              <button onClick={() => { setShowClosing(false); setClosingYear(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Opening Balance Modal */}
      {showOpening && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">📝 سند افتتاحیه سال مالی</h3>
            <p className="text-xs text-gray-500 mb-4">موجودی اول دوره دارایی‌ها، بدهی‌ها و حقوق صاحبان سهام را وارد کنید. سند باید تراز باشد (جمع بدهکار = جمع بستانکار).</p>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">تاریخ سند افتتاحیه</label>
              <JalaliDatePicker value={openingDate} onChange={setOpeningDate} placeholder="تاریخ" />
            </div>

            {/* Items table */}
            <div className="border rounded-lg overflow-hidden mb-3">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-2 w-1/2">حساب</th>
                    <th className="text-right p-2">بدهکار</th>
                    <th className="text-right p-2">بستانکار</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {openingItems.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1">
                        <select value={item.account_id} onChange={(e) => updateOpeningItem(idx, 'account_id', Number(e.target.value))} className="w-full p-1.5 border border-gray-200 rounded text-xs">
                          <option value={0}>— حساب —</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </td>
                      <td className="p-1">
                        <PriceInput value={item.debit} onChange={(v) => updateOpeningItem(idx, 'debit', v)} placeholder="۰" className="w-full p-1.5 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="p-1">
                        <PriceInput value={item.credit} onChange={(v) => updateOpeningItem(idx, 'credit', v)} placeholder="۰" className="w-full p-1.5 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="p-1">
                        <button onClick={() => removeOpeningItem(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={addOpeningItem} className="text-xs text-blue-600 font-bold mb-3">+ افزودن ردیف</button>

            {/* Totals */}
            <div className={`flex justify-between p-3 rounded-lg text-xs font-bold ${Math.abs(openingTotalDebit - openingTotalCredit) < 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span>جمع بدهکار: {formatPrice(openingTotalDebit)}</span>
              <span>جمع بستانکار: {formatPrice(openingTotalCredit)}</span>
              <span>تفاوت: {formatPrice(Math.abs(openingTotalDebit - openingTotalCredit))}</span>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={handleSaveOpening} disabled={saving} className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'ثبت...' : '✓ ثبت سند افتتاحیه'}</button>
              <button onClick={() => setShowOpening(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>

            {/* Common items helper */}
            <div className="mt-4 border-t pt-3">
              <div className="text-[10px] text-gray-500 mb-2">اقلام رایج افتتاحیه:</div>
              <div className="flex flex-wrap gap-1">
                {['صندوق', 'بانک', 'موجودی کالا', 'آورده نقدی شرکا', 'بدهکاران', 'بستانکاران', 'سرمایه'].map(label => (
                  <span key={label} className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
