'use client';

import { useState, useEffect } from 'react';
import { searchRead, write, create, callMethod } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';

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

  // New fiscal year form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');

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
      // Load fiscal years (account.fiscal.year)
      try {
        const years = await searchRead('account.fiscal.year', [], ['name', 'date_from', 'date_to'], 0, 0, 'date_from desc');
        setFiscalYears(years || []);
      } catch {
        // Module may not have fiscal years enabled
        setFiscalYears([]);
      }

      // Load lock dates from company settings
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

      // Load equity accounts for year-end closing
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
      await create('account.fiscal.year', {
        name: newName,
        date_from: newFrom,
        date_to: newTo,
      });
      setShowNewForm(false);
      setNewName(''); setNewFrom(''); setNewTo('');
      setMsg('✅ سال مالی جدید ایجاد شد');
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
      if (companies && companies.length > 0) {
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
      if (companies && companies.length > 0) {
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
    // Calculate P&L for this fiscal year
    try {
      // Get income accounts total
      const incomeLines = await searchRead('account.move.line', [
        ['parent_state', '=', 'posted'],
        ['date', '>=', fy.date_from],
        ['date', '<=', fy.date_to],
        ['account_id.account_type', 'in', ['income', 'income_other']],
      ], ['credit', 'debit']);
      const totalIncome = (incomeLines || []).reduce((sum: number, l: any) => sum + l.credit - l.debit, 0);

      // Get expense accounts total
      const expenseLines = await searchRead('account.move.line', [
        ['parent_state', '=', 'posted'],
        ['date', '>=', fy.date_from],
        ['date', '<=', fy.date_to],
        ['account_id.account_type', 'in', ['expense', 'expense_direct_cost', 'expense_depreciation']],
      ], ['debit', 'credit']);
      const totalExpense = (expenseLines || []).reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);

      setProfitLossAmount(totalIncome - totalExpense);
    } catch {
      setProfitLossAmount(0);
    }
    setShowClosing(true);
  }

  async function handleCloseYear() {
    if (!closingYear) return;
    if (!retainedEarningsAccount) { alert('حساب سود انباشته را انتخاب کنید'); return; }
    if (!confirm(`بستن سال مالی ${closingYear.name}؟\n\nاین عملیات:\n- سود/زیان ${formatPrice(profitLossAmount)} به حساب سود انباشته منتقل میشه\n- تاریخ قفل روی ${closingYear.date_to} تنظیم میشه\n\nادامه میدید؟`)) return;

    setSaving(true);
    try {
      // 1. Create closing journal entry: transfer P&L to retained earnings
      if (profitLossAmount !== 0) {
        // Find the "current year earnings" account (type: equity_unaffected)
        const cyeAccounts = await searchRead('account.account', [['account_type', '=', 'equity_unaffected']], ['id'], 1);
        const cyeAccountId = cyeAccounts?.[0]?.id;

        if (cyeAccountId) {
          const closingLines: any[] = [];
          
          if (profitLossAmount > 0) {
            // Profit: debit current year earnings, credit retained earnings
            closingLines.push([0, 0, { account_id: cyeAccountId, debit: profitLossAmount, credit: 0, name: `بستن سال مالی ${closingYear.name} - انتقال سود` }]);
            closingLines.push([0, 0, { account_id: retainedEarningsAccount, debit: 0, credit: profitLossAmount, name: `بستن سال مالی ${closingYear.name} - سود انباشته` }]);
          } else {
            // Loss: credit current year earnings, debit retained earnings
            const absAmount = Math.abs(profitLossAmount);
            closingLines.push([0, 0, { account_id: cyeAccountId, debit: 0, credit: absAmount, name: `بستن سال مالی ${closingYear.name} - انتقال زیان` }]);
            closingLines.push([0, 0, { account_id: retainedEarningsAccount, debit: absAmount, credit: 0, name: `بستن سال مالی ${closingYear.name} - زیان انباشته` }]);
          }

          // Create the closing journal entry
          const moveId = await create('account.move', {
            move_type: 'entry',
            date: closingYear.date_to,
            line_ids: closingLines,
            narration: `سند بستن سال مالی ${closingYear.name}`,
          });
          // Post it
          await callMethod('account.move', 'action_post', [[moveId]]);
        }
      }

      // 2. Set lock date to end of fiscal year
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies && companies.length > 0) {
        await write('res.company', [companies[0].id], {
          fiscalyear_lock_date: closingYear.date_to,
          tax_lock_date: closingYear.date_to,
        });
      }

      setShowClosing(false);
      setClosingYear(null);
      setMsg(`✅ سال مالی ${closingYear.name} بسته شد`);
      setTimeout(() => setMsg(''), 4000);
      await loadData();
    } catch (e: any) { alert(e.message || 'خطا در بستن سال مالی'); }
    setSaving(false);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مدیریت سال مالی</h1>
          <p className="text-gray-500 text-sm">افتتاح و بستن سال مالی، قفل دوره‌های مالی</p>
        </div>
        {msg && <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">{msg}</span>}
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">بارگذاری...</div> : (
        <div className="space-y-6">

          {/* Lock Status */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              🔒 وضعیت قفل دفاتر
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل عمومی (Lock Everything)</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.fiscalyear_lock_date ? lockInfo.fiscalyear_lock_date : '— تنظیم نشده —'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل مالیاتی</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.tax_lock_date ? lockInfo.tax_lock_date : '— تنظیم نشده —'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل سخت (غیرقابل بازگشت)</div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {lockInfo.hard_lock_date ? <span className="text-red-600">{lockInfo.hard_lock_date}</span> : '— تنظیم نشده —'}
                </div>
              </div>
            </div>

            {/* Set Lock Date */}
            <div className="border-t pt-4 mt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">تاریخ قفل عمومی</label>
                  <input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} className="p-2 border border-gray-200 rounded-lg text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">تاریخ قفل مالیاتی</label>
                  <input type="date" value={taxLockDate} onChange={(e) => setTaxLockDate(e.target.value)} className="p-2 border border-gray-200 rounded-lg text-xs" />
                </div>
                <button onClick={handleSetLockDate} disabled={saving} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-50">
                  تنظیم قفل
                </button>
                {lockInfo.fiscalyear_lock_date && (
                  <button onClick={handleRemoveLockDate} disabled={saving} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 disabled:opacity-50">
                    حذف قفل
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                بعد از تنظیم قفل، هیچ سند حسابداری با تاریخ قبل از تاریخ قفل قابل ثبت یا ویرایش نخواهد بود.
              </p>
            </div>
          </div>

          {/* Fiscal Years List */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-700">📅 سال‌های مالی</h3>
              <button onClick={() => setShowNewForm(true)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600">+ سال مالی جدید</button>
            </div>

            {fiscalYears.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">📅</div>
                <p className="text-gray-400 text-sm">هنوز سال مالی تعریف نشده</p>
                <p className="text-gray-400 text-[10px] mt-1">سال مالی جدید ایجاد کنید یا Odoo از تنظیمات پیش‌فرض (ژانویه تا دسامبر) استفاده میکند</p>
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
                          <div className="text-[10px] text-gray-500">{fy.date_from} تا {fy.date_to}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLocked ? (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-bold">بسته شده</span>
                        ) : (
                          <button onClick={() => handleStartClosing(fy)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200">
                            بستن سال مالی
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-blue-700 mb-2">ℹ️ راهنمای بستن سال مالی</h4>
            <ol className="text-xs text-blue-600 space-y-1.5 list-decimal list-inside">
              <li>مطمئن شوید تمام حساب‌های بانکی تا پایان سال تطبیق داده شده‌اند</li>
              <li>فاکتورهای فروش و خرید پیش‌نویس را تأیید یا حذف کنید</li>
              <li>اسناد استهلاک و پیش‌پرداخت‌ها را ثبت کنید</li>
              <li>سود/زیان سال را به حساب سود انباشته منتقل کنید (سند بستن)</li>
              <li>تاریخ قفل را روی آخرین روز سال مالی تنظیم کنید</li>
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
                  <input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تاریخ پایان *</label>
                  <input type="date" value={newTo} onChange={(e) => setNewTo(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreateFiscalYear} disabled={saving} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 disabled:opacity-50">
                {saving ? 'در حال ثبت...' : 'ایجاد سال مالی'}
              </button>
              <button onClick={() => setShowNewForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Year-End Closing Modal */}
      {showClosing && closingYear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🔒 بستن سال مالی: {closingYear.name}</h3>
            
            <div className="space-y-4">
              {/* P&L Summary */}
              <div className={`p-4 rounded-lg border ${profitLossAmount >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-xs text-gray-600 mb-1">سود / زیان خالص دوره:</div>
                <div className={`text-xl font-bold ${profitLossAmount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {profitLossAmount >= 0 ? '📈' : '📉'} {formatPrice(Math.abs(profitLossAmount))} تومان {profitLossAmount >= 0 ? '(سود)' : '(زیان)'}
                </div>
              </div>

              {/* Retained Earnings Account Selection */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">حساب سود/زیان انباشته (حقوق صاحبان سهام) *</label>
                <select value={retainedEarningsAccount} onChange={(e) => setRetainedEarningsAccount(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>— انتخاب کنید —</option>
                  {equityAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                  ))}
                </select>
              </div>

              {/* What will happen */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-xs font-bold text-amber-700 mb-1">عملیاتی که انجام میشود:</div>
                <ul className="text-[10px] text-amber-600 space-y-1 list-disc list-inside">
                  <li>سند انتقال سود/زیان ({formatPrice(Math.abs(profitLossAmount))}) به حساب سود انباشته</li>
                  <li>تنظیم تاریخ قفل عمومی و مالیاتی روی {closingYear.date_to}</li>
                  <li>بعد از بستن، اسناد قبل از تاریخ قفل قابل ویرایش نخواهند بود</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={handleCloseYear} disabled={saving} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50">
                {saving ? 'در حال بستن...' : '🔒 بستن سال مالی'}
              </button>
              <button onClick={() => { setShowClosing(false); setClosingYear(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
