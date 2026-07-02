'use client';

import { useState, useEffect } from 'react';
import { getCustomerCredits, recordRepayment } from '@/lib/odoo-api';
import { formatPrice, toJalali } from '@/lib/utils';

interface Credit {
  id: number;
  partner_id: [number, string] | false;
  amount: number;
  remaining: number;
  paid_amount: number;
  date: string;
  state: string;
  note: string | false;
  invoice_ref: string | false;
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRepayId, setShowRepayId] = useState<number | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayNote, setRepayNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchCredits() {
    try {
      setLoading(true);
      const data = await getCustomerCredits();
      setCredits(data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCredits(); }, []);

  function openRepay(credit: Credit) {
    setShowRepayId(credit.id);
    setRepayAmount(String(credit.remaining));
    setRepayNote('');
  }

  async function handleRepay() {
    if (!showRepayId || !repayAmount) { alert('مبلغ الزامی است'); return; }
    setSaving(true);
    try {
      await recordRepayment({
        credit_id: showRepayId,
        amount: parseFloat(repayAmount.replace(/[^\d.]/g, '')) || 0,
        note: repayNote || undefined,
      });
      setShowRepayId(null);
      await fetchCredits();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت بازپرداخت');
    } finally {
      setSaving(false);
    }
  }

  const totalOutstanding = credits.reduce((s, c) => s + (c.remaining || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">حساب مشتریان</h1>
          <p className="text-gray-500 text-sm">بدهی و اعتبار مشتریان (نسیه)</p>
        </div>
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold">
          مجموع بدهی: {formatPrice(totalOutstanding)} تومان
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : credits.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
          <div className="text-4xl mb-3">🤝</div>
          <p>هنوز حساب اعتباری ثبت نشده</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right p-3 font-medium text-gray-600">مشتری</th>
                <th className="text-right p-3 font-medium text-gray-600">مبلغ کل</th>
                <th className="text-right p-3 font-medium text-gray-600">پرداخت شده</th>
                <th className="text-right p-3 font-medium text-gray-600">باقیمانده</th>
                <th className="text-right p-3 font-medium text-gray-600">تاریخ</th>
                <th className="text-right p-3 font-medium text-gray-600">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-3 font-medium">{c.partner_id ? c.partner_id[1] : '—'}</td>
                  <td className="p-3">{formatPrice(c.amount)}</td>
                  <td className="p-3 text-green-600">{formatPrice(c.paid_amount)}</td>
                  <td className="p-3 font-bold text-red-600">{formatPrice(c.remaining)}</td>
                  <td className="p-3 text-gray-500">{c.date ? toJalali(c.date) : '—'}</td>
                  <td className="p-3">
                    <button onClick={() => openRepay(c)} className="text-xs text-green-600 hover:text-green-800 font-bold">
                      ثبت بازپرداخت
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Repayment Modal */}
      {showRepayId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">💰 ثبت بازپرداخت</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">مبلغ بازپرداخت (تومان) *</label>
                <input
                  type="text"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-green-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">یادداشت</label>
                <textarea
                  value={repayNote}
                  onChange={(e) => setRepayNote(e.target.value)}
                  rows={2}
                  placeholder="اختیاری..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-green-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleRepay}
                disabled={saving}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'در حال ثبت...' : 'ثبت بازپرداخت'}
              </button>
              <button
                onClick={() => setShowRepayId(null)}
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
