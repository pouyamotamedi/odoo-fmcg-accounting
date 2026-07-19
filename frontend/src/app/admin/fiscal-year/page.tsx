'use client';

import { useState, useEffect } from 'react';
import { searchRead, write, create, callMethod, getBankCashBalances, getProducts, getPartners } from '@/lib/odoo-api';
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

interface OpeningItem {
  account_id: number;
  account_name: string;
  account_type: string;
  partner_id: number;
  partner_name: string;
  debit: string;
  credit: string;
  type: 'asset' | 'liability' | 'equity';
}

interface InventoryItem {
  product_id: number;
  product_name: string;
  qty: string;
  unit_cost: string;
}

export default function FiscalYearPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [lockInfo, setLockInfo] = useState<LockInfo>({ fiscalyear_lock_date: false, tax_lock_date: false, hard_lock_date: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [fiscalYearModelExists, setFiscalYearModelExists] = useState(true);

  // Forms
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [taxLockDate, setTaxLockDate] = useState('');

  // Year-end closing
  const [showClosing, setShowClosing] = useState(false);
  const [closingYear, setClosingYear] = useState<FiscalYear | null>(null);
  const [profitLossAmount, setProfitLossAmount] = useState(0);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState<number>(0);
  const [equityAccounts, setEquityAccounts] = useState<{id: number; name: string; code: string}[]>([]);

  // Opening balance wizard
  const [showOpening, setShowOpening] = useState(false);
  const [openingStep, setOpeningStep] = useState<1|2|3>(1); // 1: accounts, 2: inventory, 3: review
  const [openingDate, setOpeningDate] = useState('');
  const [openingItems, setOpeningItems] = useState<OpeningItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [balanceSheetAccounts, setBalanceSheetAccounts] = useState<{id: number; name: string; code: string; account_type: string}[]>([]);
  const [allProducts, setAllProducts] = useState<{id: number; name: string; standard_price: number}[]>([]);
  const [allPartners, setAllPartners] = useState<{id: number; name: string}[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      try {
        const years = await searchRead('account.fiscal.year', [], ['name', 'date_from', 'date_to'], 0, 0, 'date_from desc');
        setFiscalYears(years || []);
        setFiscalYearModelExists(true);
      } catch {
        setFiscalYearModelExists(false);
        // Fallback: load from date.range with fiscal type
        try {
          const rangeTypes = await searchRead('date.range.type', [['name', 'ilike', 'fiscal']], ['id'], 1);
          if (rangeTypes && rangeTypes.length > 0) {
            const ranges = await searchRead('date.range', [['type_id', '=', rangeTypes[0].id]], ['name', 'date_start', 'date_end'], 0, 0, 'date_start desc');
            setFiscalYears((ranges || []).map((r: any) => ({ id: r.id, name: r.name, date_from: r.date_start, date_to: r.date_end })));
          } else {
            setFiscalYears([]);
          }
        } catch {
          setFiscalYears([]);
        }
      }
      try {
        const companies = await searchRead('res.company', [], ['fiscalyear_lock_date', 'tax_lock_date', 'hard_lock_date'], 1);
        if (companies?.[0]) {
          setLockInfo({ fiscalyear_lock_date: companies[0].fiscalyear_lock_date || false, tax_lock_date: companies[0].tax_lock_date || false, hard_lock_date: companies[0].hard_lock_date || false });
          setLockDate(companies[0].fiscalyear_lock_date || '');
          setTaxLockDate(companies[0].tax_lock_date || '');
        }
      } catch {}
      try {
        const eqAccounts = await searchRead('account.account', [['account_type', 'in', ['equity', 'equity_unaffected']]], ['name', 'code'], 0, 0, 'code asc');
        setEquityAccounts(eqAccounts || []);
      } catch {}
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // Fiscal year CRUD
  async function handleCreateFiscalYear() {
    if (!newName || !newFrom || !newTo) { alert('تمام فیلدها الزامی'); return; }
    setSaving(true);
    try {
      if (fiscalYearModelExists) {
        await create('account.fiscal.year', { name: newName, date_from: newFrom, date_to: newTo });
      } else {
        try {
          const rangeTypes = await searchRead('date.range.type', [['name', 'ilike', 'fiscal']], ['id'], 1);
          let typeId = rangeTypes?.[0]?.id;
          if (!typeId) typeId = await create('date.range.type', { name: 'Fiscal Year' });
          await create('date.range', { name: newName, date_start: newFrom, date_end: newTo, type_id: typeId });
        } catch {}
      }
      setShowNewForm(false); setNewName(''); setNewFrom(''); setNewTo('');
      setMsg('✅ سال مالی ایجاد شد'); setTimeout(() => setMsg(''), 3000);
      await loadData();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleSetLockDate() {
    if (!lockDate) { alert('تاریخ قفل الزامی'); return; }
    setSaving(true);
    try {
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) {
        const values: any = { fiscalyear_lock_date: lockDate };
        if (taxLockDate) values.tax_lock_date = taxLockDate;
        await write('res.company', [companies[0].id], values);
        setMsg('✅ قفل تنظیم شد'); setTimeout(() => setMsg(''), 3000);
        await loadData();
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleRemoveLockDate() {
    if (!confirm('حذف قفل؟')) return;
    setSaving(true);
    try {
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) {
        await write('res.company', [companies[0].id], { fiscalyear_lock_date: false, tax_lock_date: false });
        setMsg('✅ قفل حذف شد'); setTimeout(() => setMsg(''), 3000);
        await loadData();
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleStartClosing(fy: FiscalYear) {
    setClosingYear(fy);
    try {
      const incomeLines = await searchRead('account.move.line', [['parent_state', '=', 'posted'], ['date', '>=', fy.date_from], ['date', '<=', fy.date_to], ['account_id.account_type', 'in', ['income', 'income_other']]], ['credit', 'debit']);
      const totalIncome = (incomeLines || []).reduce((s: number, l: any) => s + l.credit - l.debit, 0);
      const expenseLines = await searchRead('account.move.line', [['parent_state', '=', 'posted'], ['date', '>=', fy.date_from], ['date', '<=', fy.date_to], ['account_id.account_type', 'in', ['expense', 'expense_direct_cost', 'expense_depreciation']]], ['debit', 'credit']);
      const totalExpense = (expenseLines || []).reduce((s: number, l: any) => s + l.debit - l.credit, 0);
      setProfitLossAmount(totalIncome - totalExpense);
    } catch { setProfitLossAmount(0); }
    setShowClosing(true);
  }

  async function handleCloseYear() {
    if (!closingYear || !retainedEarningsAccount) { alert('حساب سود انباشته الزامی'); return; }
    if (!confirm(`بستن سال ${closingYear.name}؟`)) return;
    setSaving(true);
    try {
      if (profitLossAmount !== 0) {
        const cyeAccounts = await searchRead('account.account', [['account_type', '=', 'equity_unaffected']], ['id'], 1);
        const cyeId = cyeAccounts?.[0]?.id;
        if (cyeId) {
          const lines: any[] = profitLossAmount > 0
            ? [[0,0,{account_id:cyeId, debit:profitLossAmount, credit:0, name:`بستن ${closingYear.name}`}],[0,0,{account_id:retainedEarningsAccount, debit:0, credit:profitLossAmount, name:`سود انباشته`}]]
            : [[0,0,{account_id:cyeId, debit:0, credit:Math.abs(profitLossAmount), name:`بستن ${closingYear.name}`}],[0,0,{account_id:retainedEarningsAccount, debit:Math.abs(profitLossAmount), credit:0, name:`زیان انباشته`}]];

          // Find general journal for closing entry
          let closingJournalId: number | undefined;
          try {
            const miscJournals = await searchRead('account.journal', [['type', '=', 'general']], ['id'], 1);
            closingJournalId = miscJournals?.[0]?.id;
          } catch {}

          const closingMoveVals: Record<string, any> = {
            move_type: 'entry',
            date: closingYear.date_to,
            ref: `بستن سال مالی ${closingYear.name}`,
            line_ids: lines,
            narration: `سند بستن ${closingYear.name}`,
          };
          if (closingJournalId) {
            closingMoveVals.journal_id = closingJournalId;
          }

          const moveId = await create('account.move', closingMoveVals);
          await callMethod('account.move', 'action_post', [[moveId]]);
        }
      }
      const companies = await searchRead('res.company', [], ['id'], 1);
      if (companies?.[0]) await write('res.company', [companies[0].id], { fiscalyear_lock_date:closingYear.date_to, tax_lock_date:closingYear.date_to });
      setShowClosing(false); setClosingYear(null);
      setMsg(`✅ سال ${closingYear.name} بسته شد`); setTimeout(() => setMsg(''), 4000);
      await loadData();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  // Opening Balance Wizard
  async function startOpeningWizard() {
    setOpeningStep(1);
    setOpeningDate(new Date().toISOString().split('T')[0]);
    try {
      // Load only balance sheet accounts (asset, liability, equity) — NOT income/expense
      const bsAccounts = await searchRead('account.account', [
        ['deprecated', '=', false],
        ['account_type', 'in', [
          'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current', 'asset_prepayments', 'asset_fixed',
          'liability_payable', 'liability_current', 'liability_non_current',
          'equity', 'equity_unaffected',
        ]],
      ], ['name', 'code', 'account_type'], 0, 0, 'code asc');
      setBalanceSheetAccounts(bsAccounts || []);

      // Load products for inventory
      const prods = await getProducts();
      setAllProducts((prods || []).map((p: any) => ({ id: p.id, name: p.display_name || p.name, standard_price: p.standard_price || 0 })));

      // Load partners for receivable/payable accounts
      const partners = await getPartners();
      setAllPartners((partners || []).map((p: any) => ({ id: p.id, name: p.name })));

      // Pre-fill with current bank/cash balances
      const journals = await getBankCashBalances();
      const prefillItems: OpeningItem[] = [];
      for (const j of (journals || [])) {
        if (j.fmcg_running_balance && j.fmcg_running_balance > 0) {
          // Find account for this journal
          const defaultAccount = j.default_account_id?.[0];
          const accMatch = bsAccounts?.find((a: any) => a.id === defaultAccount);
          if (accMatch) {
            prefillItems.push({ account_id: accMatch.id, account_name: `${accMatch.code} - ${accMatch.name}`, account_type: accMatch.account_type, partner_id: 0, partner_name: '', debit: String(Math.round(j.fmcg_running_balance)), credit: '', type: 'asset' });
          }
        }
      }
      // Add empty row for capital/equity
      prefillItems.push({ account_id: 0, account_name: '', account_type: '', partner_id: 0, partner_name: '', debit: '', credit: '', type: 'equity' });
      setOpeningItems(prefillItems.length > 0 ? prefillItems : [{ account_id: 0, account_name: '', account_type: '', partner_id: 0, partner_name: '', debit: '', credit: '', type: 'asset' }]);
      setInventoryItems([]);
    } catch {}
    setShowOpening(true);
  }

  function addOpeningItem() {
    setOpeningItems([...openingItems, { account_id: 0, account_name: '', account_type: '', partner_id: 0, partner_name: '', debit: '', credit: '', type: 'asset' }]);
  }

  function updateOpeningItem(idx: number, field: string, value: any) {
    const items = [...openingItems];
    (items[idx] as any)[field] = value;
    if (field === 'account_id') {
      const acc = balanceSheetAccounts.find(a => a.id === value);
      items[idx].account_name = acc ? `${acc.code} - ${acc.name}` : '';
      items[idx].account_type = acc?.account_type || '';
      // Auto-detect type
      if (acc?.account_type.startsWith('asset')) items[idx].type = 'asset';
      else if (acc?.account_type.startsWith('liability')) items[idx].type = 'liability';
      else items[idx].type = 'equity';
      // Reset partner when account changes
      if (acc?.account_type !== 'asset_receivable' && acc?.account_type !== 'liability_payable') {
        items[idx].partner_id = 0;
        items[idx].partner_name = '';
      }
    }
    if (field === 'partner_id') {
      const partner = allPartners.find(p => p.id === value);
      items[idx].partner_name = partner?.name || '';
    }
    setOpeningItems(items);
  }

  function addInventoryItem() {
    setInventoryItems([...inventoryItems, { product_id: 0, product_name: '', qty: '', unit_cost: '' }]);
  }

  function updateInventoryItem(idx: number, field: string, value: any) {
    const items = [...inventoryItems];
    (items[idx] as any)[field] = value;
    if (field === 'product_id') {
      const prod = allProducts.find(p => p.id === value);
      items[idx].product_name = prod?.name || '';
      if (prod && !items[idx].unit_cost) items[idx].unit_cost = String(prod.standard_price);
    }
    setInventoryItems(items);
  }

  const openingTotalDebit = openingItems.reduce((s, i) => s + (Number(i.debit) || 0), 0);
  const openingTotalCredit = openingItems.reduce((s, i) => s + (Number(i.credit) || 0), 0);
  const inventoryTotalValue = inventoryItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0), 0);

  async function handleSaveOpening() {
    if (!openingDate) { alert('تاریخ افتتاحیه الزامی'); return; }

    // Validate: only balance sheet accounts
    const validItems = openingItems.filter(item => item.account_id && (Number(item.debit) > 0 || Number(item.credit) > 0));

    // Validate: partner is required for receivable/payable accounts
    for (const item of validItems) {
      if ((item.account_type === 'asset_receivable' || item.account_type === 'liability_payable') && !item.partner_id) {
        alert(`حساب "${item.account_name}" از نوع دریافتنی/پرداختنی است و انتخاب شخص (حساب تفصیلی) الزامی است.`);
        return;
      }
    }

    // Add inventory value as a debit to stock valuation account if inventory items exist
    let inventoryAccountId: number | undefined;
    if (inventoryItems.length > 0 && inventoryTotalValue > 0) {
      // Find stock valuation account (usually asset_current with "موجودی" or code starting with 1)
      const stockAccounts = balanceSheetAccounts.filter(a => 
        a.account_type === 'asset_current' && (a.name.includes('موجودی') || a.name.includes('کالا') || a.name.includes('stock') || a.code.startsWith('14'))
      );
      inventoryAccountId = stockAccounts[0]?.id;
      if (!inventoryAccountId) {
        // Try to find or create
        const anyAssetCurrent = balanceSheetAccounts.find(a => a.account_type === 'asset_current');
        inventoryAccountId = anyAssetCurrent?.id;
      }
      if (inventoryAccountId) {
        validItems.push({ account_id: inventoryAccountId, account_name: '', account_type: 'asset_current', partner_id: 0, partner_name: '', debit: String(inventoryTotalValue), credit: '', type: 'asset' });
      }
    }

    // Check balance
    const totalDebit = validItems.reduce((s, i) => s + (Number(i.debit) || 0), 0);
    const totalCredit = validItems.reduce((s, i) => s + (Number(i.credit) || 0), 0);
    if (validItems.length === 0) { alert('حداقل یک آیتم وارد کنید'); return; }
    if (Math.abs(totalDebit - totalCredit) > 1) {
      alert(`سند تراز نیست!\nبدهکار: ${formatPrice(totalDebit)}\nبستانکار: ${formatPrice(totalCredit)}\nتفاوت: ${formatPrice(Math.abs(totalDebit - totalCredit))}\n\nنکته: مجموع بدهکار (دارایی‌ها) باید با مجموع بستانکار (بدهی‌ها + سرمایه) برابر باشد.`);
      return;
    }

    setSaving(true);
    try {
      // Find or use the miscellaneous journal for opening entries
      let openingJournalId: number | undefined;
      try {
        const miscJournals = await searchRead('account.journal', [['type', '=', 'general']], ['id', 'name'], 1);
        openingJournalId = miscJournals?.[0]?.id;
      } catch {}

      // 1. Create opening journal entry with proper journal_id and partner_id on lines
      const lines = validItems.map(item => {
        // Build descriptive name: include partner name for receivable/payable
        let lineName = 'سند افتتاحیه';
        if (item.partner_name) {
          lineName = `سند افتتاحیه - ${item.partner_name}`;
        }
        return [0, 0, {
          account_id: item.account_id,
          debit: Number(item.debit) || 0,
          credit: Number(item.credit) || 0,
          name: lineName,
          partner_id: item.partner_id || false,
        }];
      });

      const moveVals: Record<string, any> = {
        move_type: 'entry',
        date: openingDate,
        ref: 'سند افتتاحیه',
        line_ids: lines,
        narration: 'سند افتتاحیه سال مالی',
      };
      if (openingJournalId) {
        moveVals.journal_id = openingJournalId;
      }

      const moveId = await create('account.move', moveVals);
      await callMethod('account.move', 'action_post', [[moveId]]);

      // 2. Create stock adjustments for inventory items (sets qty_available)
      if (inventoryItems.length > 0) {
        for (const item of inventoryItems) {
          if (!item.product_id || !Number(item.qty)) continue;
          try {
            // Update product standard_price if user entered a different cost
            if (Number(item.unit_cost) > 0) {
              await write('product.product', [item.product_id], {
                standard_price: Number(item.unit_cost),
              });
            }

            // Use stock.quant to set initial quantity
            // First check if quant exists
            const existingQuants = await searchRead('stock.quant', [
              ['product_id', '=', item.product_id],
              ['location_id.usage', '=', 'internal'],
            ], ['id', 'quantity', 'location_id'], 1);

            if (existingQuants && existingQuants.length > 0) {
              // Update existing quant
              await write('stock.quant', [existingQuants[0].id], {
                inventory_quantity: Number(item.qty),
              });
              await callMethod('stock.quant', 'action_apply_inventory', [[existingQuants[0].id]]);
            } else {
              // Find internal location
              const locations = await searchRead('stock.location', [['usage', '=', 'internal']], ['id'], 1);
              const locId = locations?.[0]?.id;
              if (locId) {
                const quantId = await create('stock.quant', {
                  product_id: item.product_id,
                  location_id: locId,
                  inventory_quantity: Number(item.qty),
                });
                await callMethod('stock.quant', 'action_apply_inventory', [[quantId]]);
              }
            }
          } catch { /* individual item failure, continue */ }
        }
      }

      setShowOpening(false);
      setMsg('✅ سند افتتاحیه و موجودی انبار ثبت شد');
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

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
                <div className="text-sm font-bold mt-1">{lockInfo.fiscalyear_lock_date ? toJalali(lockInfo.fiscalyear_lock_date) : '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل مالیاتی</div>
                <div className="text-sm font-bold mt-1">{lockInfo.tax_lock_date ? toJalali(lockInfo.tax_lock_date) : '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] text-gray-500">قفل سخت</div>
                <div className="text-sm font-bold mt-1 text-red-600">{lockInfo.hard_lock_date ? toJalali(lockInfo.hard_lock_date) : '—'}</div>
              </div>
            </div>
            <div className="border-t pt-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">قفل عمومی</label>
                <JalaliDatePicker value={lockDate} onChange={setLockDate} placeholder="تاریخ" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">قفل مالیاتی</label>
                <JalaliDatePicker value={taxLockDate} onChange={setTaxLockDate} placeholder="تاریخ" />
              </div>
              <button onClick={handleSetLockDate} disabled={saving} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold disabled:opacity-50">تنظیم</button>
              {lockInfo.fiscalyear_lock_date && <button onClick={handleRemoveLockDate} disabled={saving} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-bold">حذف</button>}
            </div>
          </div>

          {/* Fiscal Years */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-700">📅 سال‌های مالی</h3>
              <div className="flex gap-2">
                <button onClick={startOpeningWizard} className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600">📝 سند افتتاحیه</button>
                <button onClick={() => setShowNewForm(true)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600">+ سال جدید</button>
              </div>
            </div>
            {!fiscalYearModelExists && fiscalYears.length === 0 && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">ℹ️ مدل سال مالی نصب نیست. از date.range استفاده می‌شود. سند افتتاحیه و قفل مستقل کار می‌کنند.</div>}
            {fiscalYears.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">سال مالی تعریف نشده</div>
            ) : (
              <div className="space-y-2">
                {fiscalYears.map((fy) => {
                  const isLocked = lockInfo.fiscalyear_lock_date && fy.date_to <= lockInfo.fiscalyear_lock_date;
                  return (
                    <div key={fy.id} className={`flex items-center justify-between p-3 rounded-lg border ${isLocked ? 'bg-gray-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{isLocked ? '🔒' : '📆'}</span>
                        <div>
                          <div className="text-sm font-bold">{fy.name}</div>
                          <div className="text-[10px] text-gray-500">{toJalali(fy.date_from)} تا {toJalali(fy.date_to)}</div>
                        </div>
                      </div>
                      {isLocked ? <span className="text-[10px] bg-gray-200 px-2 py-1 rounded-full">بسته</span> : (
                        <button onClick={() => handleStartClosing(fy)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">بستن</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Guide */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-blue-700 mb-2">ℹ️ راهنما</h4>
            <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
              <li><b>افتتاح:</b> سال مالی جدید + سند افتتاحیه (شامل موجودی بانک، صندوق، کالا، آورده شرکا)</li>
              <li><b>سند افتتاحیه:</b> فقط حساب‌های ترازنامه‌ای مجازند (دارایی/بدهی/حقوق صاحبان)</li>
              <li><b>موجودی کالا:</b> هم ارزش ریالی (تو سند) و هم تعداد فیزیکی (تو انبار) ثبت میشه</li>
              <li><b>بستن:</b> سود/زیان → سود انباشته + قفل دفاتر</li>
            </ol>
          </div>
        </div>
      )}

      {/* New Fiscal Year Modal */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">📅 سال مالی جدید</h3>
            <div className="space-y-3">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام (مثلاً: سال مالی ۱۴۰۴)" className="w-full p-2 border rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-gray-500">شروع</label><JalaliDatePicker value={newFrom} onChange={setNewFrom} placeholder="شروع" /></div>
                <div><label className="text-[10px] text-gray-500">پایان</label><JalaliDatePicker value={newTo} onChange={setNewTo} placeholder="پایان" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreateFiscalYear} disabled={saving} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'ثبت...' : 'ایجاد'}</button>
              <button onClick={() => setShowNewForm(false)} className="flex-1 py-2 bg-gray-200 rounded-lg text-sm font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Closing Modal */}
      {showClosing && closingYear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🔒 بستن: {closingYear.name}</h3>
            <div className={`p-4 rounded-lg mb-4 ${profitLossAmount >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-600">سود/زیان خالص:</div>
              <div className={`text-xl font-bold ${profitLossAmount >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatPrice(Math.abs(profitLossAmount))} {profitLossAmount >= 0 ? '(سود)' : '(زیان)'}</div>
            </div>
            <select value={retainedEarningsAccount} onChange={(e) => setRetainedEarningsAccount(Number(e.target.value))} className="w-full p-2 border rounded-lg text-sm mb-4">
              <option value={0}>— حساب سود انباشته —</option>
              {equityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={handleCloseYear} disabled={saving} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'بستن...' : '🔒 بستن'}</button>
              <button onClick={() => setShowClosing(false)} className="flex-1 py-2 bg-gray-200 rounded-lg text-sm font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Opening Balance Wizard */}
      {showOpening && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📝 سند افتتاحیه سال مالی</h3>
              <div className="flex gap-2">
                {[1,2,3].map(s => (
                  <button key={s} onClick={() => setOpeningStep(s as 1|2|3)} className={`w-8 h-8 rounded-full text-xs font-bold ${openingStep === s ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{toPersianDigits(s)}</button>
                ))}
              </div>
            </div>

            {/* Step indicator */}
            <div className="flex gap-4 mb-4 text-xs text-gray-500">
              <span className={openingStep === 1 ? 'text-indigo-600 font-bold' : ''}>۱. حساب‌های مالی</span>
              <span className={openingStep === 2 ? 'text-indigo-600 font-bold' : ''}>۲. موجودی کالا</span>
              <span className={openingStep === 3 ? 'text-indigo-600 font-bold' : ''}>۳. بررسی و ثبت</span>
            </div>

            {/* Step 1: Financial Accounts */}
            {openingStep === 1 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">موجودی اول دوره دارایی‌ها (بدهکار) و بدهی‌ها + سرمایه (بستانکار) را وارد کنید.</p>
                <div className="mb-3">
                  <label className="text-[10px] text-gray-500">تاریخ سند</label>
                  <JalaliDatePicker value={openingDate} onChange={setOpeningDate} placeholder="تاریخ" />
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-[10px] text-green-700">
                  <b>دارایی‌ها = بدهکار:</b> صندوق، بانک، بدهکاران، پیش‌پرداخت<br/>
                  <b>بدهی‌ها + سرمایه = بستانکار:</b> بستانکاران، وام، آورده شرکا، سرمایه
                </div>

                <table className="w-full text-xs border rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="text-right p-2">حساب (فقط ترازنامه‌ای)</th>
                    <th className="text-right p-2 w-36">شخص (تفصیلی)</th>
                    <th className="text-right p-2 w-28">بدهکار</th>
                    <th className="text-right p-2 w-28">بستانکار</th>
                    <th className="p-2 w-8"></th>
                  </tr></thead>
                  <tbody>
                    {openingItems.map((item, idx) => {
                      const needsPartner = item.account_type === 'asset_receivable' || item.account_type === 'liability_payable';
                      return (
                      <tr key={idx} className="border-t">
                        <td className="p-1">
                          <select value={item.account_id} onChange={(e) => updateOpeningItem(idx, 'account_id', Number(e.target.value))} className="w-full p-1.5 border rounded text-xs">
                            <option value={0}>— حساب —</option>
                            {balanceSheetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                          </select>
                        </td>
                        <td className="p-1">
                          {needsPartner ? (
                            <select value={item.partner_id} onChange={(e) => updateOpeningItem(idx, 'partner_id', Number(e.target.value))} className="w-full p-1.5 border rounded text-xs border-amber-300 bg-amber-50">
                              <option value={0}>— شخص —</option>
                              {allPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ) : (
                            <span className="text-gray-300 text-[10px] p-1.5 block">—</span>
                          )}
                        </td>
                        <td className="p-1"><PriceInput value={item.debit} onChange={(v) => updateOpeningItem(idx, 'debit', v)} placeholder="۰" className="w-full p-1.5 border rounded text-xs" /></td>
                        <td className="p-1"><PriceInput value={item.credit} onChange={(v) => updateOpeningItem(idx, 'credit', v)} placeholder="۰" className="w-full p-1.5 border rounded text-xs" /></td>
                        <td className="p-1"><button onClick={() => setOpeningItems(openingItems.filter((_,i)=>i!==idx))} className="text-red-400 text-xs">✕</button></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={addOpeningItem} className="text-xs text-blue-600 font-bold mt-2">+ افزودن ردیف</button>

                <div className={`flex justify-between p-3 rounded-lg mt-3 text-xs font-bold ${Math.abs(openingTotalDebit - openingTotalCredit) < 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <span>بدهکار: {formatPrice(openingTotalDebit)}</span>
                  <span>بستانکار: {formatPrice(openingTotalCredit)}</span>
                  <span>{Math.abs(openingTotalDebit - openingTotalCredit) < 1 ? '✓ تراز' : `تفاوت: ${formatPrice(Math.abs(openingTotalDebit - openingTotalCredit))}`}</span>
                </div>

                <div className="flex justify-end mt-4">
                  <button onClick={() => setOpeningStep(2)} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold">مرحله بعد: موجودی کالا ←</button>
                </div>
              </div>
            )}

            {/* Step 2: Inventory */}
            {openingStep === 2 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">موجودی فیزیکی کالاها در ابتدای دوره. تعداد و قیمت تمام‌شده هر واحد را وارد کنید. ارزش کل به سند حسابداری اضافه میشود و تعداد در انبار ثبت میگردد.</p>

                <table className="w-full text-xs border rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="text-right p-2">کالا</th>
                    <th className="text-right p-2 w-24">تعداد</th>
                    <th className="text-right p-2 w-28">قیمت واحد</th>
                    <th className="text-right p-2 w-28">ارزش کل</th>
                    <th className="p-2 w-8"></th>
                  </tr></thead>
                  <tbody>
                    {inventoryItems.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1">
                          <select value={item.product_id} onChange={(e) => updateInventoryItem(idx, 'product_id', Number(e.target.value))} className="w-full p-1.5 border rounded text-xs">
                            <option value={0}>— کالا —</option>
                            {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="p-1"><input type="number" value={item.qty} onChange={(e) => updateInventoryItem(idx, 'qty', e.target.value)} className="w-full p-1.5 border rounded text-xs" placeholder="۰" /></td>
                        <td className="p-1"><PriceInput value={item.unit_cost} onChange={(v) => updateInventoryItem(idx, 'unit_cost', v)} placeholder="۰" className="w-full p-1.5 border rounded text-xs" /></td>
                        <td className="p-1 text-center font-bold">{formatPrice((Number(item.qty)||0) * (Number(item.unit_cost)||0))}</td>
                        <td className="p-1"><button onClick={() => setInventoryItems(inventoryItems.filter((_,i)=>i!==idx))} className="text-red-400 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={addInventoryItem} className="text-xs text-blue-600 font-bold mt-2">+ افزودن کالا</button>

                {inventoryTotalValue > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg mt-3 text-xs text-blue-700">
                    ارزش کل موجودی: <b>{formatPrice(inventoryTotalValue)}</b> — این مبلغ بعنوان بدهکار حساب موجودی کالا به سند اضافه میشود.
                  </div>
                )}

                <div className="flex justify-between mt-4">
                  <button onClick={() => setOpeningStep(1)} className="px-4 py-2 bg-gray-200 rounded-lg text-xs font-bold">→ مرحله قبل</button>
                  <button onClick={() => setOpeningStep(3)} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold">مرحله بعد: بررسی ←</button>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {openingStep === 3 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">خلاصه سند افتتاحیه قبل از ثبت نهایی:</p>

                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-bold mb-2">حساب‌های مالی:</div>
                    {openingItems.filter(i => i.account_id).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[10px] py-0.5">
                        <span>{item.account_name || `حساب #${item.account_id}`}{item.partner_name ? ` (${item.partner_name})` : ''}</span>
                        <span>{Number(item.debit) > 0 ? `بدهکار: ${formatPrice(Number(item.debit))}` : `بستانکار: ${formatPrice(Number(item.credit))}`}</span>
                      </div>
                    ))}
                  </div>

                  {inventoryItems.length > 0 && inventoryTotalValue > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-bold mb-2">موجودی کالا (بدهکار حساب موجودی): {formatPrice(inventoryTotalValue)}</div>
                      {inventoryItems.filter(i => i.product_id).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[10px] py-0.5">
                          <span>{item.product_name}</span>
                          <span>{toPersianDigits(Number(item.qty))} عدد × {formatPrice(Number(item.unit_cost))} = {formatPrice((Number(item.qty)||0)*(Number(item.unit_cost)||0))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`p-3 rounded-lg text-xs font-bold ${Math.abs((openingTotalDebit + inventoryTotalValue) - openingTotalCredit) < 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    جمع بدهکار: {formatPrice(openingTotalDebit + inventoryTotalValue)} | جمع بستانکار: {formatPrice(openingTotalCredit)}
                    {Math.abs((openingTotalDebit + inventoryTotalValue) - openingTotalCredit) < 1 ? ' ✓ تراز' : ` ✗ تراز نیست (${formatPrice(Math.abs((openingTotalDebit + inventoryTotalValue) - openingTotalCredit))} تفاوت)`}
                  </div>
                </div>

                <div className="flex justify-between mt-5">
                  <button onClick={() => setOpeningStep(2)} className="px-4 py-2 bg-gray-200 rounded-lg text-xs font-bold">→ مرحله قبل</button>
                  <button onClick={handleSaveOpening} disabled={saving} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'ثبت...' : '✓ ثبت نهایی سند افتتاحیه'}</button>
                </div>
              </div>
            )}

            <div className="flex justify-start mt-4 border-t pt-3">
              <button onClick={() => setShowOpening(false)} className="text-xs text-gray-500 hover:text-gray-700">انصراف و بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
