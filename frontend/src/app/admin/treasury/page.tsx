'use client';

import { useState, useEffect } from 'react';
import { getBankCashBalances } from '@/lib/odoo-api';
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

  const cashJournals = journals.filter((j) => j.type === 'cash');
  const bankJournals = journals.filter((j) => j.type === 'bank');
  const totalCash = cashJournals.reduce((s, j) => s + (j.fmcg_running_balance || 0), 0);
  const totalBank = bankJournals.reduce((s, j) => s + (j.fmcg_running_balance || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">بانک و صندوق</h1>
        <p className="text-gray-500 text-sm">موجودی حساب‌های بانکی و صندوق نقدی</p>
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

          <JournalSection title="💵 صندوق‌های نقدی" journals={cashJournals} accent="green" />
          <JournalSection title="🏦 حساب‌های بانکی" journals={bankJournals} accent="blue" />
        </>
      )}
    </div>
  );
}

function JournalSection({ title, journals, accent }: { title: string; journals: Journal[]; accent: 'green' | 'blue' }) {
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
              {!j.fmcg_is_active && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">غیرفعال</span>
              )}
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
