'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import {
  getProductAnalytics,
  type ProductAnalyticsResult,
  type ProductDocumentType,
  type ProductStockMovement,
} from '@/lib/product-analytics';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function defaultDateFrom(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  date.setDate(date.getDate() + 1);
  return localDate(date);
}

function documentLabel(type: ProductDocumentType): string {
  if (type === 'out_invoice') return 'فروش';
  if (type === 'out_refund') return 'برگشت فروش';
  if (type === 'in_invoice') return 'خرید';
  return 'برگشت خرید';
}

function documentBadge(type: ProductDocumentType): string {
  if (type === 'out_invoice') return 'bg-green-100 text-green-700';
  if (type === 'out_refund') return 'bg-red-100 text-red-700';
  if (type === 'in_invoice') return 'bg-blue-100 text-blue-700';
  return 'bg-orange-100 text-orange-700';
}

function stockMovementLabel(kind: ProductStockMovement['kind']): string {
  if (kind === 'purchase') return 'ورود خرید';
  if (kind === 'sale') return 'خروج فروش';
  if (kind === 'sale_return') return 'برگشت فروش';
  if (kind === 'purchase_return') return 'برگشت خرید';
  if (kind === 'adjustment') return 'تعدیل انبار';
  return 'انتقال داخلی';
}

function metricValue(value: number | null, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${toPersianDigits(Math.round(value))}${suffix}`;
}

function monthLabel(month: string): string {
  if (!month) return '—';
  return toJalali(`${month}-15`).slice(0, 7);
}

export default function ProductAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const validProductId = Number.isInteger(productId) && productId > 0;
  const requestId = useRef(0);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(() => localDate(new Date()));
  const [data, setData] = useState<ProductAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(validProductId);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'financial' | 'stock'>('financial');

  useEffect(() => {
    if (!validProductId) return;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      getProductAnalytics(productId, dateFrom, dateTo)
        .then((result) => {
          if (currentRequest !== requestId.current) return;
          setData(result);
          if (!result) setError('کالا یا واریانت موردنظر یافت نشد');
        })
        .catch((reason: unknown) => {
          if (currentRequest !== requestId.current) return;
          setData(null);
          setError(reason instanceof Error ? reason.message : 'خطا در دریافت تحلیل کالا');
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [productId, validProductId, dateFrom, dateTo]);

  const insights = useMemo(() => {
    if (!data) return [];
    const { metrics, product, ranking } = data;
    const rows: Array<{ tone: string; text: string }> = [];

    if (product.quantityAvailable <= product.reorderThreshold && product.reorderThreshold > 0) {
      rows.push({ tone: 'bg-red-50 text-red-700', text: `موجودی به حد هشدار رسیده است؛ موجودی فعلی ${metricValue(product.quantityAvailable)} و حد هشدار ${metricValue(product.reorderThreshold)} است.` });
    } else if (metrics.stockCoverageDays != null && metrics.stockCoverageDays < 30) {
      rows.push({ tone: 'bg-orange-50 text-orange-700', text: `با آهنگ فروش این دوره، موجودی تقریباً برای ${metricValue(metrics.stockCoverageDays)} روز کافی است.` });
    } else if (metrics.stockCoverageDays != null && metrics.stockCoverageDays > 180) {
      rows.push({ tone: 'bg-amber-50 text-amber-700', text: `پوشش موجودی حدود ${metricValue(metrics.stockCoverageDays)} روز است؛ احتمال خواب سرمایه را بررسی کنید.` });
    }

    if (metrics.grossMargin != null && metrics.grossMargin < 10) {
      rows.push({ tone: 'bg-red-50 text-red-700', text: `حاشیه سود ناخالص ${metricValue(metrics.grossMargin, '٪')} است و پایین محسوب می‌شود؛ قیمت فروش و بهای خرید را بازبینی کنید.` });
    } else if (metrics.grossMargin != null && metrics.grossMargin >= 25) {
      rows.push({ tone: 'bg-green-50 text-green-700', text: `حاشیه سود ناخالص ${metricValue(metrics.grossMargin, '٪')} است و عملکرد سودآوری مناسبی دارد.` });
    }

    if (metrics.returnRate != null && metrics.returnRate > 5) {
      rows.push({ tone: 'bg-red-50 text-red-700', text: `نرخ برگشت فروش ${metricValue(metrics.returnRate, '٪')} است؛ علت برگشتی‌ها را بررسی کنید.` });
    }

    if (ranking.salesRank != null && ranking.salesRank <= 10) {
      rows.push({ tone: 'bg-indigo-50 text-indigo-700', text: `این کالا از نظر مبلغ فروش، رتبه ${metricValue(ranking.salesRank)} از ${metricValue(ranking.comparedProducts)} کالای فروخته‌شده در دوره را دارد.` });
    }

    if (metrics.lastSaleDate) {
      const reportEnd = new Date(`${dateTo}T23:59:59`).getTime();
      const daysSinceSale = Math.floor((reportEnd - new Date(`${metrics.lastSaleDate}T00:00:00`).getTime()) / 86_400_000);
      if (daysSinceSale > 60 && product.quantityAvailable > 0) {
        rows.push({ tone: 'bg-amber-50 text-amber-700', text: `تا پایان بازه، ${metricValue(daysSinceSale)} روز از آخرین فروش گذشته و کالا موجودی داشته است؛ کندگردش بودن آن را بررسی کنید.` });
      }
    }

    if (rows.length === 0) {
      rows.push({ tone: 'bg-slate-50 text-slate-600', text: 'در بازه انتخابی هشدار مهمی شناسایی نشد. روند فروش و موجودی را به‌صورت دوره‌ای پایش کنید.' });
    }
    return rows;
  }, [data, dateTo]);

  if (loading) return <div className="text-center py-16 text-gray-400">در حال محاسبه تحلیل کالا...</div>;

  if (!data) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-white rounded-xl border p-8 text-center">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-red-600 text-sm">{!validProductId ? 'شناسه کالا معتبر نیست' : error || 'کالا یافت نشد'}</p>
        <Link href="/admin/inventory" className="inline-block mt-4 text-indigo-600 text-sm">بازگشت به کالاها</Link>
      </div>
    );
  }

  const { product, metrics, ranking, trends, transactions, stockMovements } = data;
  const maxTrendAmount = Math.max(1, ...trends.flatMap((item) => [Math.abs(item.revenue), Math.abs(item.profit)]));
  const costLabel = metrics.costSource === 'actual'
    ? 'ثبت‌شده حسابداری'
    : metrics.costSource === 'mixed'
      ? `ترکیبی؛ ${metricValue(metrics.actualCostCoverage, '٪')} پوشش واقعی`
      : metrics.costSource === 'estimated' ? 'برآوردی با بهای فعلی' : 'بدون فروش';
  const cards = [
    { label: 'فروش خالص', value: `${formatPrice(metrics.netRevenue)} تومان`, note: `${metricValue(metrics.saleDocumentCount)} سند فروش`, color: 'text-green-700', icon: '💵' },
    { label: 'سود ناخالص', value: `${formatPrice(metrics.grossProfit)} تومان`, note: costLabel, color: metrics.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700', icon: '📈' },
    { label: 'حاشیه سود', value: metricValue(metrics.grossMargin, '٪'), note: 'فروش خالص منهای بهای تمام‌شده', color: 'text-indigo-700', icon: '٪' },
    { label: 'تعداد فروش خالص', value: `${metricValue(metrics.netSoldQuantity)} ${product.uom}`, note: `${metricValue(metrics.returnedSaleQuantity)} برگشتی`, color: 'text-blue-700', icon: '🛍️' },
    { label: 'خرید خالص', value: `${metricValue(metrics.netPurchasedQuantity)} ${product.uom}`, note: `${formatPrice(metrics.netPurchaseAmount)} تومان`, color: 'text-cyan-700', icon: '🛒' },
    { label: 'ارزش موجودی فعلی', value: `${formatPrice(metrics.inventoryValue)} تومان`, note: `${metricValue(product.quantityAvailable)} ${product.uom} موجود`, color: 'text-orange-700', icon: '📦' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/inventory" className="text-gray-400 hover:text-indigo-600 text-xl">←</Link>
          <div className="w-16 h-16 rounded-xl bg-white border overflow-hidden flex items-center justify-center flex-shrink-0">
            {product.image
              ? <img src={`data:image/png;base64,${product.image}`} alt="" className="w-full h-full object-cover" />
              : <span className="text-3xl">📦</span>}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800 truncate">{product.displayName}</h1>
            <p className="text-xs text-gray-500 mt-1">
              {product.category} • بارکد: {product.barcode || 'ندارد'} • شناسه: {toPersianDigits(product.id)}
            </p>
            <div className="flex gap-2 mt-2 text-[11px]">
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">موجودی: {metricValue(product.quantityAvailable)} {product.uom}</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">فروش فعلی: {formatPrice(product.listPrice)}</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">بهای فعلی: {formatPrice(product.standardPrice)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-3 flex flex-wrap items-end gap-2">
          <div className="w-36">
            <label className="block text-[10px] text-gray-500 mb-1">از تاریخ</label>
            <JalaliDatePicker value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ" />
          </div>
          <div className="w-36">
            <label className="block text-[10px] text-gray-500 mb-1">تا تاریخ</label>
            <JalaliDatePicker value={dateTo} onChange={setDateTo} placeholder="تا تاریخ" />
          </div>
          <button
            onClick={() => { setDateFrom(defaultDateFrom()); setDateTo(localDate(new Date())); }}
            className="h-9 px-3 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200"
          >یک‌سال اخیر</button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">{error}</div>}

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{card.label}</span>
              <span className="text-lg">{card.icon}</span>
            </div>
            <div className={`text-lg font-bold mt-2 ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.note}</div>
          </div>
        ))}
      </div>

      {(metrics.costSource === 'estimated' || metrics.costSource === 'mixed') && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs">
          ⚠️ پوشش بهای تمام‌شده ثبت‌شده برای این بازه {metricValue(metrics.actualCostCoverage, '٪')} است؛ فقط ردیف‌های بدون COGS با بهای فعلی کالا برآورد شده‌اند. مبلغ خرید دوره با بهای تمام‌شده فروش متفاوت است.
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-bold text-sm text-slate-800">روند ماهانه فروش و سود</h2>
              <p className="text-[10px] text-gray-400 mt-1">مبالغ خالص پس از کسر برگشت‌ها</p>
            </div>
            <div className="flex gap-3 text-[10px] text-gray-500">
              <span><i className="inline-block w-2 h-2 rounded bg-indigo-400 ml-1" />فروش</span>
              <span><i className="inline-block w-2 h-2 rounded bg-emerald-400 ml-1" />سود</span>
            </div>
          </div>
          <div className="space-y-3 max-h-80 overflow-auto pl-1">
            {trends.map((item) => (
              <div key={item.month} className="grid grid-cols-[64px_1fr_100px] gap-2 items-center">
                <div className="text-[10px] text-gray-500">{monthLabel(item.month)}</div>
                <div className="space-y-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(0, Math.abs(item.revenue) / maxTrendAmount * 100)}%` }} />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.profit >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${Math.max(0, Math.abs(item.profit) / maxTrendAmount * 100)}%` }} />
                  </div>
                </div>
                <div className="text-left text-[10px]">
                  <div className="text-indigo-600">{formatPrice(item.revenue)}</div>
                  <div className={item.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPrice(item.profit)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-sm text-slate-800 mb-3">جایگاه و شاخص‌های کلیدی</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-indigo-700">{ranking.salesRank ? toPersianDigits(ranking.salesRank) : '—'}</div>
              <div className="text-[10px] text-indigo-600">رتبه مبلغ فروش</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-emerald-700">{ranking.profitRank ? toPersianDigits(ranking.profitRank) : '—'}</div>
              <div className="text-[10px] text-emerald-600">رتبه سود برآوردی هم‌مبنا</div>
            </div>
          </div>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">تعداد کالاهای مقایسه‌شده</dt><dd className="font-bold">{metricValue(ranking.comparedProducts)}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">میانگین فروش واحد</dt><dd>{metrics.averageSalePrice == null ? '—' : formatPrice(metrics.averageSalePrice)}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">میانگین خرید واحد</dt><dd>{metrics.averagePurchasePrice == null ? '—' : formatPrice(metrics.averagePurchasePrice)}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">نرخ برگشت فروش</dt><dd>{metricValue(metrics.returnRate, '٪')}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">پوشش تقریبی موجودی</dt><dd>{metrics.stockCoverageDays == null ? '—' : `${metricValue(metrics.stockCoverageDays)} روز`}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">آخرین فروش / خرید</dt><dd>{metrics.lastSaleDate ? toJalali(metrics.lastSaleDate) : '—'} / {metrics.lastPurchaseDate ? toJalali(metrics.lastPurchaseDate) : '—'}</dd></div>
          </dl>
        </section>
      </div>

      <section>
        <h2 className="font-bold text-sm text-slate-800 mb-2">جمع‌بندی مدیریتی</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {insights.map((insight, index) => (
            <div key={index} className={`rounded-lg p-3 text-xs leading-6 ${insight.tone}`}>{insight.text}</div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800">گردش و تاریخچه کالا</h2>
            <p className="text-[10px] text-gray-400 mt-1">گردش مالی از فاکتورها و گردش انبار از انتقال‌های انجام‌شده</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('financial')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${activeTab === 'financial' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>اسناد خرید و فروش ({toPersianDigits(transactions.length)})</button>
            <button onClick={() => setActiveTab('stock')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${activeTab === 'stock' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>گردش انبار ({toPersianDigits(stockMovements.length)})</button>
          </div>
        </div>

        {activeTab === 'financial' ? (
          transactions.length === 0 ? <div className="p-10 text-center text-gray-400 text-sm">در این بازه خرید یا فروشی ثبت نشده است</div> : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="text-right p-3">تاریخ</th><th className="text-right p-3">سند</th><th className="text-right p-3">نوع</th><th className="text-right p-3">طرف حساب</th><th className="text-right p-3">تعداد</th><th className="text-right p-3">قیمت واحد</th><th className="text-right p-3">تخفیف</th><th className="text-right p-3">مبلغ</th>
                </tr></thead>
                <tbody>{transactions.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap">{toJalali(row.date)}</td>
                    <td className="p-3 font-mono">{row.moveName}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${documentBadge(row.type)}`}>{documentLabel(row.type)}</span></td>
                    <td className="p-3">{row.partnerName}</td>
                    <td className="p-3">{metricValue(row.quantity)} {product.uom}</td>
                    <td className="p-3">{formatPrice(row.unitPrice)}</td>
                    <td className="p-3">{metricValue(row.discount, '٪')}</td>
                    <td className="p-3 font-bold">{formatPrice(row.amount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        ) : !data.stockHistoryAvailable ? (
          <div className="p-10 text-center text-amber-600 text-sm">گردش انبار دریافت نشد؛ دسترسی کاربر یا ارتباط سرور را بررسی کنید</div>
        ) : stockMovements.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">در این بازه گردش انباری ثبت نشده است</div>
        ) : (
          <div>
            {data.stockHistoryTruncated && (
              <div className="p-2 text-center text-[10px] bg-amber-50 text-amber-700 border-b">فقط ۳۰۰ گردش آخر این بازه نمایش داده می‌شود؛ برای مشاهده دقیق‌تر بازه تاریخ را محدود کنید.</div>
            )}
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="text-right p-3">تاریخ</th><th className="text-right p-3">مرجع</th><th className="text-right p-3">نوع</th><th className="text-right p-3">مبدأ</th><th className="text-right p-3">مقصد</th><th className="text-right p-3">تغییر موجودی</th>
                </tr></thead>
                <tbody>{stockMovements.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap">{toJalali(row.date)}</td>
                    <td className="p-3"><div className="font-medium">{row.reference}</div><div className="text-[10px] text-gray-400">{row.origin}</div></td>
                    <td className="p-3">{stockMovementLabel(row.kind)}</td>
                    <td className="p-3 text-gray-500">{row.source}</td>
                    <td className="p-3 text-gray-500">{row.destination}</td>
                    <td className={`p-3 font-bold ${row.signedQuantity > 0 ? 'text-green-600' : row.signedQuantity < 0 ? 'text-red-600' : 'text-gray-500'}`}>{row.signedQuantity > 0 ? '+' : ''}{metricValue(row.signedQuantity)} {product.uom}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
