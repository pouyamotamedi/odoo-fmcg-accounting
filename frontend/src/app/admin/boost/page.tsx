'use client';

import { useEffect, useMemo, useState } from 'react';
import PriceInput from '@/components/PriceInput';
import {
  getBoostConfiguration,
  saveBoostConfiguration,
  type BoostConfiguration,
  type BoostSelectionState,
} from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';

interface EditablePrice {
  value: string;
  hasOverride: boolean;
}

interface EditableProduct {
  id: number;
  name: string;
  selectedState: BoostSelectionState;
  regular: EditablePrice;
  plans: Record<number, EditablePrice>;
  originals: Record<number, number>;
  regularOriginal: number;
}

function Switch({ checked, onChange, label, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-50 ${checked ? 'bg-green-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-6' : '-translate-x-1'}`} />
    </button>
  );
}

function toEditable(configuration: BoostConfiguration): EditableProduct[] {
  return configuration.products.map((product) => {
    const plans: Record<number, EditablePrice> = {};
    const originals: Record<number, number> = {};
    for (const plan of product.plan_prices) {
      const hasOverride = plan.override_price !== null;
      plans[plan.category_id] = {
        value: String(hasOverride ? plan.override_price : plan.original_price),
        hasOverride,
      };
      originals[plan.category_id] = plan.original_price;
    }
    const regularHasOverride = product.regular_override_price !== null;
    return {
      id: product.id,
      name: product.name,
      selectedState: product.selected_state,
      regularOriginal: product.regular_original_price,
      regular: {
        value: String(regularHasOverride ? product.regular_override_price : product.regular_original_price),
        hasOverride: regularHasOverride,
      },
      plans,
      originals,
    };
  });
}

function isSelected(state: BoostSelectionState, allProducts: boolean): boolean {
  if (state === 'included') return true;
  if (state === 'excluded') return false;
  return allProducts;
}

export default function BoostPage() {
  const [configuration, setConfiguration] = useState<BoostConfiguration | null>(null);
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [percent, setPercent] = useState('0');
  const [allProducts, setAllProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function applyConfiguration(next: BoostConfiguration) {
    setConfiguration(next);
    setEnabled(next.enabled);
    setPercent(String(next.percent));
    setAllProducts(next.all_products);
    setProducts(toEditable(next));
  }

  useEffect(() => {
    let active = true;
    getBoostConfiguration()
      .then((result) => {
        if (active) applyConfiguration(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'خطا در دریافت تنظیمات بوست');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fa');
    if (!query) return products;
    return products.filter((product) => product.name.toLocaleLowerCase('fa').includes(query));
  }, [products, search]);

  function updateProduct(productId: number, update: (product: EditableProduct) => EditableProduct) {
    setProducts((current) => current.map((product) => product.id === productId ? update(product) : product));
  }

  function setProductSelected(productId: number, selected: boolean) {
    updateProduct(productId, (product) => ({
      ...product,
      selectedState: selected === allProducts ? 'inherit' : selected ? 'included' : 'excluded',
    }));
  }

  function setPrice(productId: number, categoryId: number | null, value: string) {
    updateProduct(productId, (product) => categoryId === null
      ? { ...product, regular: { value, hasOverride: true } }
      : {
          ...product,
          plans: { ...product.plans, [categoryId]: { value, hasOverride: true } },
        });
  }

  function resetPrice(productId: number, categoryId: number | null) {
    updateProduct(productId, (product) => categoryId === null
      ? { ...product, regular: { value: String(product.regularOriginal), hasOverride: false } }
      : {
          ...product,
          plans: {
            ...product.plans,
            [categoryId]: { value: String(product.originals[categoryId]), hasOverride: false },
          },
        });
  }

  async function handleSave() {
    if (!configuration) return;
    const parsedPercent = Number(percent);
    if (!Number.isFinite(parsedPercent) || parsedPercent < -100) {
      setError('درصد بوست باید عددی محدود و حداقل ۱۰۰- باشد');
      return;
    }
    for (const product of products) {
      const prices = [product.regular, ...configuration.plans.map((plan) => product.plans[plan.id])];
      if (prices.some((price) => price.hasOverride && (price.value === '' || !Number.isFinite(Number(price.value)) || Number(price.value) < 0))) {
        setError(`قیمت بوست «${product.name}» باید عددی نامنفی باشد`);
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveBoostConfiguration({
        revision: configuration.revision,
        enabled,
        percent: parsedPercent,
        all_products: allProducts,
        products: products.map((product) => ({
          product_id: product.id,
          selected_state: product.selectedState,
          regular_override_price: product.regular.hasOverride ? Number(product.regular.value) : null,
          plan_overrides: configuration.plans.map((plan) => ({
            category_id: plan.id,
            override_price: product.plans[plan.id].hasOverride ? Number(product.plans[plan.id].value) : null,
          })),
        })),
      });
      applyConfiguration(saved);
      setMessage('تنظیمات حالت بوست با موفقیت ذخیره شد');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'خطا در ذخیره تنظیمات بوست');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-gray-400">در حال دریافت تنظیمات حالت بوست...</div>;
  if (!configuration) return <div className="rounded-xl border bg-white p-8 text-center text-sm text-red-600">{error || 'تنظیمات بوست در دسترس نیست'}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">🚀 حالت بوست</h1>
        <p className="mt-1 text-xs text-gray-500">قیمت‌های موقت صندوق را بدون تغییر قیمت اصلی کالا یا پلن تخفیف مدیریت کنید.</p>
      </div>

      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</div>}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-3">
          <label className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4">
            <span><strong className="block text-sm text-slate-800">فعال‌سازی کلی</strong><span className="text-[11px] text-gray-500">اعمال Boost در صندوق</span></span>
            <Switch checked={enabled} onChange={setEnabled} label="فعال‌سازی حالت بوست" />
          </label>
          <label className="block rounded-lg bg-slate-50 p-4">
            <span className="mb-2 block text-sm font-bold text-slate-800">درصد افزایش یا کاهش</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="-100"
                step="any"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm focus:border-indigo-400 focus:outline-none"
                dir="ltr"
                aria-label="درصد بوست"
              />
              <span className="text-sm text-gray-500">٪</span>
            </div>
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4">
            <span><strong className="block text-sm text-slate-800">همه محصولات</strong><span className="text-[11px] text-gray-500">پیش‌فرض انتخاب گروهی</span></span>
            <Switch checked={allProducts} onChange={setAllProducts} label="انتخاب پیش‌فرض همه محصولات" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">قیمت و انتخاب محصولات</h2>
            <p className="mt-1 text-[10px] text-gray-400">مقدار خاکستری قیمت اصلی است؛ با ویرایش، فقط override بوست ذخیره می‌شود.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی محصول..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none sm:w-64"
          />
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
              <tr>
                <th className="whitespace-nowrap p-3 text-right">محصول</th>
                <th className="min-w-48 p-3 text-right">قیمت عادی</th>
                {configuration.plans.map((plan) => (
                  <th key={plan.id} className="min-w-48 p-3 text-right">
                    {plan.name}
                    {plan.is_fixed_percent && <span className="block text-[9px] font-normal text-gray-400">تخفیف ثابت {toPersianDigits(plan.fixed_percent)}٪</span>}
                  </th>
                ))}
                <th className="whitespace-nowrap p-3 text-center">اعمال بوست</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-t hover:bg-slate-50/60">
                  <td className="max-w-64 p-3 font-medium text-slate-700">{product.name}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <PriceInput value={product.regular.value} onChange={(value) => setPrice(product.id, null, value)} className={`w-32 rounded-md border px-2 py-1.5 text-left ${product.regular.hasOverride ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`} />
                      {product.regular.hasOverride && <button type="button" onClick={() => resetPrice(product.id, null)} className="text-[10px] text-red-500 hover:underline">بازنشانی</button>}
                    </div>
                    <span className="mt-1 block text-[9px] text-gray-400">اصلی: {formatPrice(product.regularOriginal)}</span>
                  </td>
                  {configuration.plans.map((plan) => {
                    const price = product.plans[plan.id];
                    return (
                      <td key={plan.id} className="p-3">
                        <div className="flex items-center gap-2">
                          <PriceInput value={price.value} onChange={(value) => setPrice(product.id, plan.id, value)} className={`w-32 rounded-md border px-2 py-1.5 text-left ${price.hasOverride ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`} />
                          {price.hasOverride && <button type="button" onClick={() => resetPrice(product.id, plan.id)} className="text-[10px] text-red-500 hover:underline">بازنشانی</button>}
                        </div>
                        <span className="mt-1 block text-[9px] text-gray-400">اصلی: {formatPrice(product.originals[plan.id])}</span>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    <Switch checked={isSelected(product.selectedState, allProducts)} onChange={(selected) => setProductSelected(product.id, selected)} label={`اعمال بوست برای ${product.name}`} />
                    {product.selectedState !== 'inherit' && <span className="mt-1 block text-[9px] text-indigo-500">استثنای دستی</span>}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && <tr><td colSpan={configuration.plans.length + 3} className="p-10 text-center text-gray-400">محصولی پیدا نشد</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-gray-50 p-4">
          <span className="text-xs text-gray-500">{toPersianDigits(filteredProducts.length)} محصول نمایش داده می‌شود</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات بوست'}
          </button>
        </div>
      </section>
    </div>
  );
}
