'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import {
  getProductAnalytics,
  type ProductAnalyticsResult,
  type ProductDocumentType,
  type ProductPriceTimelinePoint,
  type ProductStockMovement,
} from '@/lib/product-analytics';
import { formatPrice, toJalali, toPersianDigits } from '@/lib/utils';

const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function defaultDateFrom(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  date.setDate(date.getDate() + 1);
  return localDate(date);
}

function calendarDayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date.getTime() / 86_400_000;
}

function calendarDaysBetween(from: string, to: string): number | null {
  const start = calendarDayNumber(from);
  const end = calendarDayNumber(to);
  return start == null || end == null ? null : end - start;
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
  const [year, monthNumber] = month.split('-').map(Number);
  const name = JALALI_MONTH_NAMES[monthNumber - 1];
  return year && name ? `${name} ${toPersianDigits(year)}` : '—';
}

function timelinePointTitle(point: ProductPriceTimelinePoint): string {
  const source = point.isCurrent
    ? point.purchaseObserved || point.saleObserved
      ? 'قیمت‌های تنظیم‌شده فعلی کالا؛ قیمت مؤثر یکسانِ اسناد قطعی امروز نیز برای این نقطه مشاهده شده است'
      : 'قیمت‌های تنظیم‌شده فعلی کالا'
    : 'قیمت مؤثر اسناد قطعی؛ مقدار سری دیگر در صورت نبود مشاهده روزانه از آخرین مشاهده حمل شده است';
  return [
    toJalali(point.date),
    `خرید: ${point.purchasePrice == null ? 'ناموجود' : `${formatPrice(point.purchasePrice)} تومان`}`,
    `فروش: ${point.salePrice == null ? 'ناموجود' : `${formatPrice(point.salePrice)} تومان`}`,
    `حاشیه اسمی: ${point.marginPercent == null ? 'ناموجود' : metricValue(point.marginPercent, '٪')}`,
    source,
  ].join('\n');
}

function PriceTimelineChart({
  points,
  firstAvailableDate,
}: {
  points: ProductPriceTimelinePoint[];
  firstAvailableDate: string | null;
}) {
  const validPoints = points.filter((point) => calendarDayNumber(point.date) != null);
  if (validPoints.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">داده‌ای برای نمایش روند قیمت وجود ندارد</div>;
  }

  const width = Math.min(2400, Math.max(760, validPoints.length * 72));
  const height = 320;
  const padding = { top: 24, right: 74, bottom: 50, left: 84 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const pointDays = validPoints.map((point) => calendarDayNumber(point.date)!).filter(Number.isFinite);
  const firstPointDay = Math.min(...pointDays);
  const lastPointDay = Math.max(...pointDays);
  const requestedStartDay = firstAvailableDate ? calendarDayNumber(firstAvailableDate) : null;
  const startDay = requestedStartDay != null ? Math.min(requestedStartDay, firstPointDay) : firstPointDay;
  const endDay = Math.max(startDay, lastPointDay);
  const daySpan = endDay - startDay;
  const x = (date: string) => {
    const day = calendarDayNumber(date) ?? startDay;
    return daySpan === 0 ? padding.left + plotWidth / 2 : padding.left + (day - startDay) / daySpan * plotWidth;
  };

  const moneyValues = validPoints.flatMap((point) => [point.purchasePrice, point.salePrice])
    .filter((value): value is number => value != null && Number.isFinite(value));
  const maxMoney = Math.max(1, ...moneyValues, 0);
  const moneyY = (value: number) => padding.top + (1 - Math.max(0, value) / maxMoney) * plotHeight;

  const marginValues = validPoints.map((point) => point.marginPercent)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const minMargin = Math.min(0, ...marginValues);
  let maxMargin = Math.max(0, ...marginValues);
  if (maxMargin === minMargin) maxMargin = minMargin + 1;
  const marginY = (value: number) => padding.top + (maxMargin - value) / (maxMargin - minMargin) * plotHeight;

  const linePath = (
    valueOf: (point: ProductPriceTimelinePoint) => number | null,
    y: (value: number) => number,
  ) => {
    let path = '';
    let continuing = false;
    for (const point of validPoints) {
      const value = valueOf(point);
      if (value == null || !Number.isFinite(value)) {
        continuing = false;
        continue;
      }
      path += `${continuing ? ' L' : 'M'} ${x(point.date).toFixed(2)} ${y(value).toFixed(2)}`;
      continuing = true;
    }
    return path;
  };

  const purchasePath = linePath((point) => point.purchasePrice, moneyY);
  const salePath = linePath((point) => point.salePrice, moneyY);
  const marginPath = linePath((point) => point.marginPercent, marginY);
  const axisStartDate = firstAvailableDate || validPoints[0].date;
  const axisEndDate = validPoints.at(-1)?.date || axisStartDate;

  return (
    <div className="overflow-x-auto pb-2" dir="ltr">
      <svg
        aria-label="نمودار روند قیمت خرید، قیمت فروش و حاشیه اسمی"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: `${width}px`, minWidth: '760px', height: '320px' }}
      >
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} stroke="#cbd5e1" />
        <line x1={width - padding.right} y1={padding.top} x2={width - padding.right} y2={padding.top + plotHeight} stroke="#cbd5e1" />
        <line x1={padding.left} y1={padding.top + plotHeight} x2={width - padding.right} y2={padding.top + plotHeight} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + ratio * plotHeight;
          const money = maxMoney * (1 - ratio);
          const margin = maxMargin - ratio * (maxMargin - minMargin);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">{formatPrice(money)}</text>
              <text x={width - padding.right + 10} y={y + 4} textAnchor="start" fontSize="10" fill="#64748b">{metricValue(margin, '٪')}</text>
            </g>
          );
        })}
        <text x={padding.left} y={14} textAnchor="start" fontSize="10" fill="#64748b">تومان / واحد پایه</text>
        <text x={width - padding.right} y={14} textAnchor="end" fontSize="10" fill="#64748b">حاشیه اسمی</text>

        {purchasePath && <path d={purchasePath} fill="none" stroke="#f59e0b" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
        {salePath && <path d={salePath} fill="none" stroke="#6366f1" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
        {marginPath && <path d={marginPath} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}

        {validPoints.map((point) => {
          const pointX = x(point.date);
          const title = timelinePointTitle(point);
          const radius = point.isCurrent ? 5 : 3.5;
          return (
            <g key={`${point.date}-${point.isCurrent ? 'current' : 'historical'}`}>
              {point.purchasePrice != null && (
                <circle cx={pointX} cy={moneyY(point.purchasePrice)} r={radius} fill="#f59e0b" stroke="white" strokeWidth="1.5">
                  <title>{title}</title>
                </circle>
              )}
              {point.salePrice != null && (
                <circle cx={pointX} cy={moneyY(point.salePrice)} r={radius} fill="#6366f1" stroke="white" strokeWidth="1.5">
                  <title>{title}</title>
                </circle>
              )}
              {point.marginPercent != null && (
                <circle cx={pointX} cy={marginY(point.marginPercent)} r={radius} fill="#10b981" stroke="white" strokeWidth="1.5">
                  <title>{title}</title>
                </circle>
              )}
            </g>
          );
        })}

        <text x={padding.left} y={height - 18} textAnchor="start" fontSize="10" fill="#64748b">{toJalali(axisStartDate)}</text>
        <text x={width - padding.right} y={height - 18} textAnchor="end" fontSize="10" fill="#64748b">{toJalali(axisEndDate)}</text>
      </svg>
    </div>
  );
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
      rows.push({ tone: 'bg-orange-50 text-orange-700', text: `براساس میانگین فروش خالص صورتحساب‌شده از اولین دسترسی کالا، موجودی تقریباً برای ${metricValue(metrics.stockCoverageDays)} روز کافی است.` });
    } else if (metrics.stockCoverageDays != null && metrics.stockCoverageDays > 180) {
      rows.push({ tone: 'bg-amber-50 text-amber-700', text: `پوشش موجودی براساس میانگین فروش از اولین دسترسی حدود ${metricValue(metrics.stockCoverageDays)} روز است؛ احتمال خواب سرمایه را بررسی کنید.` });
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
      const daysSinceSale = calendarDaysBetween(metrics.lastSaleDate, dateTo);
      if (daysSinceSale != null && daysSinceSale > 60 && product.quantityAvailable > 0) {
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

  const { product, metrics, ranking, trends, priceTimeline, transactions, stockMovements } = data;
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
              <p className="text-[10px] text-gray-400 mt-1">گروه‌بندی ماه‌های واقعی جلالی؛ مبالغ خالص پس از کسر برگشت‌ها</p>
            </div>
            <div className="flex gap-3 text-[10px] text-gray-500">
              <span><i className="inline-block w-2 h-2 rounded bg-indigo-400 ml-1" />فروش</span>
              <span><i className="inline-block w-2 h-2 rounded bg-emerald-400 ml-1" />سود</span>
            </div>
          </div>
          <div className="space-y-3 max-h-80 overflow-auto pl-1">
            {trends.map((item) => (
              <div key={item.month} className="grid grid-cols-[90px_1fr_100px] gap-2 items-center">
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
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">اولین دسترسی کالا</dt><dd>{metrics.firstAvailableDate ? toJalali(metrics.firstAvailableDate) : '—'}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">فروش خالص کل دوره عمر</dt><dd>{metrics.lifetimeSoldQuantity == null ? '—' : `${metricValue(metrics.lifetimeSoldQuantity)} ${product.uom}`}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">روزهای مشاهده عمر کالا</dt><dd>{metrics.lifetimeObservationDays == null ? '—' : `${metricValue(metrics.lifetimeObservationDays)} روز`}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-gray-500">پوشش با میانگین فروش عمر</dt><dd>{metrics.stockCoverageDays == null ? '—' : `${metricValue(metrics.stockCoverageDays)} روز`}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">آخرین فروش / خرید در بازه</dt><dd>{metrics.lastSaleDate ? toJalali(metrics.lastSaleDate) : '—'} / {metrics.lastPurchaseDate ? toJalali(metrics.lastPurchaseDate) : '—'}</dd></div>
          </dl>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] leading-5 text-slate-500">
            پوشش = بیشینه موجودی فعلی و صفر × روزهای تقویمی از اولین دسترسی تا امروز ÷ فروش خالص صورتحساب‌شده همان دوره. این شاخص مستقل از بازه انتخابی بالای صفحه است.
          </p>
        </section>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800">روند قیمت و حاشیه اسمی عمر کالا</h2>
            <p className="text-[10px] text-gray-400 mt-1">از اولین دسترسی تا امروز؛ مستقل از بازه تاریخ انتخابی</p>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
            <span><i className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" />قیمت خرید</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-indigo-500 ml-1" />قیمت فروش</span>
            <span><i className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-1" />حاشیه اسمی</span>
          </div>
        </div>
        <PriceTimelineChart points={priceTimeline} firstAvailableDate={metrics.firstAvailableDate} />
        <p className="mt-2 text-[10px] leading-5 text-gray-500">
          نقاط تاریخی، قیمت مؤثر وزنی هر واحد پایه در فاکتورهای قطعی خرید و فروشِ غیرمرجوعی هستند و مقدار مشاهده‌شده طرف مقابل تا رویداد بعدی حمل می‌شود. نقطه امروز از بهای استاندارد و قیمت فروش فعلی تنظیم‌شده کالا می‌آید. تغییرات تاریخی تنظیمات قیمت که در اسناد ثبت نشده‌اند قابل بازسازی نیستند. برای جزئیات هر نقطه، نشانگر را روی آن نگه دارید.
        </p>
      </section>

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
