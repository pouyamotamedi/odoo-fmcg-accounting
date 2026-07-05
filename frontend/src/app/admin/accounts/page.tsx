'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPartnerBalances, getBankCashBalances, create, callMethod } from '@/lib/odoo-api';
import { formatPrice } from '@/lib/utils';
import PriceInput from '@/components/PriceInput';

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">بارگذاری...</div>}>
      <AccountsPageContent />
    </Suspense>
  );
}

function AccountsPageContent() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all'|'debtors'|'creditors'>('all');
  const searchParams = useSearchParams();

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'debtors' || f === 'creditors') setFilter(f);
  }, [searchParams]);
  const [journals, setJournals] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payPartner, setPayPartner] = useState<any>(null);
  const [payType, setPayType] = useState<'inbound'|'outbound'>('inbound');
  const [payAmount, setPayAmount] = useState('');
  const [payJournal, setPayJournal] = useState(0);
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [result, jrnls] = await Promise.all([getPartnerBalances(), getBankCashBalances()]);
      setData(result || []);
      setJournals(jrnls || []);
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
      setData([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openPayForm(partner: any, type: 'inbound' | 'outbound') {
    setPayPartner(partner);
    setPayType(type);
    setPayAmount('');
    setPayJournal(journals[0]?.id || 0);
    setPayNote('');
    setShowPayForm(true);
  }

  async function handlePay() {
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) { alert('مبلغ باید بزرگتر از صفر باشد'); return; }
    if (!payJournal) { alert('حساب بانک/صندوق را انتخاب کنید'); return; }
    setSaving(true);
    try {
      const partnerType = payPartner.supplier_rank > 0 ? 'supplier' : 'customer';
      const paymentId = await create('account.payment', {
        payment_type: payType,
        partner_type: partnerType,
        partner_id: payPartner.id,
        amount: amount,
        journal_id: payJournal,
        memo: payNote || (payType === 'inbound' ? `دریافت از ${payPartner.name}` : `پرداخت به ${payPartner.name}`),
      });
      await callMethod('account.payment', 'action_post', [[paymentId]]);
      setShowPayForm(false);
      setMsg('✅ سند ثبت شد');
      setTimeout(() => setMsg(''), 3000);
      await load();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت');
    }
    setSaving(false);
  }

  const filtered = data.filter((p) => {
    if (!p.name.includes(search)) return false;
    if (filter === 'debtors') return p.receivable > 0;
    if (filter === 'creditors') return p.payable > 0;
    return true;
  });

  const totalRec = filtered.reduce((s,p) => s+p.receivable, 0);
  const totalPay = filtered.reduce((s,p) => s+p.payable, 0);

  return (<div>
    <div className="flex justify-between items-center mb-4">
      <div>
        <h1 className="text-2xl font-bold">حساب اشخاص</h1>
        <p className="text-gray-500 text-sm">مانده بدهکاری/بستانکاری</p>
      </div>
      {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
    </div>

    {error && (
      <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex justify-between items-center">
        <span>{error}</span>
        <button onClick={load} className="bg-red-100 hover:bg-red-200 px-3 py-1 rounded text-xs font-bold">تلاش مجدد</button>
      </div>
    )}

    <div className="flex gap-2 mb-4 flex-wrap items-center">
      {(['all','debtors','creditors'] as const).map(f=>(
        <button key={f} onClick={()=>setFilter(f)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter===f?'bg-indigo-500 text-white':'bg-gray-100 text-gray-600'}`}>
          {f==='all'?'همه':f==='debtors'?'بدهکاران':'بستانکاران'}
        </button>))}
      <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">🔄 بروزرسانی</button>
      <input type="text" placeholder="🔍 جستجو..." value={search}
        onChange={e=>setSearch(e.target.value)}
        className="mr-auto p-1.5 px-3 border rounded-lg text-sm"/>
    </div>

    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="bg-red-50 rounded-xl p-4 text-center">
        <div className="text-xs text-red-600">جمع بدهکاری‌ها</div>
        <div className="text-lg font-bold text-red-700">{formatPrice(totalRec)} ت</div>
      </div>
      <div className="bg-green-50 rounded-xl p-4 text-center">
        <div className="text-xs text-green-600">جمع بستانکاری‌ها</div>
        <div className="text-lg font-bold text-green-700">{formatPrice(totalPay)} ت</div>
      </div>
    </div>

    {loading ? <div className="text-center py-12 text-gray-400">بارگذاری...</div> :
    filtered.length===0 ? <div className="text-center py-12 text-gray-400">موردی یافت نشد</div> :
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-right p-3">نام</th>
            <th className="text-right p-3">نقش</th>
            <th className="text-right p-3 text-red-600">بدهکار</th>
            <th className="text-right p-3 text-green-600">بستانکار</th>
            <th className="text-right p-3">مانده</th>
            <th className="text-right p-3">عملیات</th>
          </tr>
        </thead>
        <tbody>{filtered.map(p=>(
          <tr key={p.id} className="border-b hover:bg-gray-50">
            <td className="p-3 font-medium">{p.name}</td>
            <td className="p-3 text-xs">{p.supplier_rank>0?'تامین‌کننده':'مشتری'}</td>
            <td className="p-3 text-red-600">{p.receivable>0?formatPrice(p.receivable):'—'}</td>
            <td className="p-3 text-green-600">{p.payable>0?formatPrice(p.payable):'—'}</td>
            <td className="p-3 font-bold">{formatPrice(p.balance)}</td>
            <td className="p-3">
              <div className="flex gap-1">
                {p.receivable > 0 && (
                  <button onClick={()=>openPayForm(p,'inbound')} className="text-[11px] bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">ثبت سند دریافت</button>
                )}
                {p.payable > 0 && (
                  <button onClick={()=>openPayForm(p,'outbound')} className="text-[11px] bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">ثبت سند پرداخت</button>
                )}
                {p.receivable === 0 && p.payable === 0 && (
                  <span className="text-[11px] text-gray-400">تسویه</span>
                )}
              </div>
            </td>
          </tr>))}</tbody>
      </table>
    </div>}

    {/* Payment/Receipt Modal */}
    {showPayForm && payPartner && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <h3 className="text-lg font-bold mb-4">
            {payType==='inbound' ? '📥 دریافت از' : '📤 پرداخت به'} {payPartner.name}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">مبلغ (تومان) *</label>
              <PriceInput value={payAmount} onChange={v=>setPayAmount(v)} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">حساب بانک/صندوق *</label>
              <select value={payJournal} onChange={e=>setPayJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option value={0}>— انتخاب —</option>
                {journals.map((j:any)=>(<option key={j.id} value={j.id}>{j.name} ({j.type==='cash'?'نقدی':'بانک'})</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">توضیحات</label>
              <input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="اختیاری" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={handlePay} disabled={saving}
              className={`flex-1 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50 ${payType==='inbound'?'bg-green-600 hover:bg-green-700':'bg-red-500 hover:bg-red-600'}`}>
              {saving ? 'در حال ثبت...' : payType==='inbound' ? 'ثبت دریافت' : 'ثبت پرداخت'}
            </button>
            <button onClick={()=>setShowPayForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
          </div>
        </div>
      </div>
    )}
  </div>);
}
