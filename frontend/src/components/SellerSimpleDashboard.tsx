'use client';

import { useEffect, useState } from 'react';
import { getCurrentIncentiveDashboard } from '@/lib/odoo-api';
import { formatPrice, formatTehranJalaliDate, toPersianDigits } from '@/lib/utils';

interface Shift {
  id: number;
  shift_date: string;
  shift_type: string;
  achievement_percent?: number;
  hubbleium_awarded?: number;
}

interface SimpleDashboardData {
  period?: { name?: string };
  wallet?: { balance?: number };
  shifts?: Shift[];
}

/**
 * Simple seller dashboard (no shop financials): Hubbleium balance and the seller's shifts.
 * Shown on /admin instead of the main dashboard when "simple dashboard for sellers" is enabled.
 */
export default function SellerSimpleDashboard({ userName }: { userName?: string }) {
  const [data, setData] = useState<SimpleDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getCurrentIncentiveDashboard()
      .then((result) => { if (!cancelled) setData(result || null); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'خطا'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-400">بارگذاری...</div>;

  const shifts = data?.shifts || [];
  const periodName = data?.period?.name || '';

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">داشبورد{userName ? ` ${userName}` : ''}</h1>
        <p className="text-gray-500 text-sm">خلاصه امتیاز و شیفت‌های شما</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xl md:text-2xl font-bold text-indigo-600">{formatPrice(data?.wallet?.balance || 0)} H</div>
          <div className="text-xs text-gray-500 mt-1">موجودی هابلیوم</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xl md:text-2xl font-bold text-green-600">{toPersianDigits(shifts.length)}</div>
          <div className="text-xs text-gray-500 mt-1">شیفت‌های این ماه {periodName ? `(${toPersianDigits(periodName)})` : ''}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-auto">
        <div className="font-bold p-4 border-b text-sm">شیفت‌های من</div>
        {shifts.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3">تاریخ</th>
                <th>شیفت</th>
                <th>تحقق</th>
                <th>امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t text-center">
                  <td className="p-3">{formatTehranJalaliDate(s.shift_date)}</td>
                  <td>{s.shift_type === 'morning' ? 'صبح' : 'عصر'}</td>
                  <td>{toPersianDigits((s.achievement_percent || 0).toFixed(1))}٪</td>
                  <td>{toPersianDigits(s.hubbleium_awarded || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-400 text-sm">هنوز شیفتی برای شما تعریف نشده است.</div>
        )}
      </div>
    </div>
  );
}
