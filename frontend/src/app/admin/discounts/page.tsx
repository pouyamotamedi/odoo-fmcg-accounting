'use client';

import { useState, useEffect } from 'react';
import {
  getDiscountCategories, createDiscountCategory, updateDiscountCategory,
  deleteDiscountCategory, getDiscountLines, setDiscountPrice, removeDiscountPrice,
  getProducts,
} from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import PriceInput from '@/components/PriceInput';

interface DiscountCategory {
  id: number;
  name: string;
  code: string | false;
  is_fixed_percent: boolean;
  fixed_percent: number;
  note: string | false;
}

interface DiscountLine {
  product_id: [number, string] | number;
  product_list_price: number;
  discount_price: number;
}

interface Product {
  id: number;
  name: string;
  list_price: number;
}

export default function DiscountsPage() {
  const [categories, setCategories] = useState<DiscountCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formIsFixed, setFormIsFixed] = useState(false);
  const [formPercent, setFormPercent] = useState('');
  const [formNote, setFormNote] = useState('');

  // Price editing
  const [selectedCategory, setSelectedCategory] = useState<DiscountCategory | null>(null);
  const [lines, setLines] = useState<DiscountLine[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [editingPrices, setEditingPrices] = useState<Record<number, string>>({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [cats, prods] = await Promise.all([getDiscountCategories(), getProducts()]);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadLines(catId: number) {
    try {
      const data = await getDiscountLines(catId);
      setLines(data || []);
    } catch { setLines([]); }
  }

  function openNewForm() {
    setFormName(''); setFormCode(''); setFormIsFixed(false); setFormPercent(''); setFormNote('');
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(cat: DiscountCategory) {
    setFormName(cat.name);
    setFormCode(cat.code || '');
    setFormIsFixed(cat.is_fixed_percent);
    setFormPercent(String(cat.fixed_percent || ''));
    setFormNote(cat.note || '');
    setEditingId(cat.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName) { alert('نام دسته تخفیف الزامی است'); return; }
    setSaving(true);
    try {
      const values = {
        name: formName,
        code: formCode || undefined,
        is_fixed_percent: formIsFixed,
        fixed_percent: formIsFixed ? parseFloat(formPercent) || 0 : 0,
        note: formNote || undefined,
      };
      if (editingId) {
        await updateDiscountCategory(editingId, values);
      } else {
        await createDiscountCategory(values);
      }
      setShowForm(false);
      await loadAll();
      setMsg('✅ ذخیره شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('حذف این دسته تخفیف؟')) return;
    try {
      await deleteDiscountCategory(id);
      await loadAll();
      if (selectedCategory?.id === id) setSelectedCategory(null);
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  function openPriceEditor(cat: DiscountCategory) {
    setSelectedCategory(cat);
    loadLines(cat.id);
    setEditingPrices({});
    setLineSearch('');
  }

  async function savePrice(productId: number) {
    if (!selectedCategory) return;
    const priceStr = editingPrices[productId];
    if (!priceStr) return;
    const price = parseFloat(priceStr);
    if (isNaN(price)) return;
    try {
      await setDiscountPrice(selectedCategory.id, productId, price);
      await loadLines(selectedCategory.id);
      setEditingPrices((prev) => { const next = { ...prev }; delete next[productId]; return next; });
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  const filteredProducts = products.filter(
    (p) => p.name.includes(lineSearch)
  );

  const lineMap = new Map(
    lines.map((l) => [Array.isArray(l.product_id) ? l.product_id[0] : l.product_id, l.discount_price])
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">تخفیفات</h1>
          <p className="text-gray-500 text-sm">مدیریت دسته‌بندی‌ها و قیمت‌های تخفیفی</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button onClick={openNewForm} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">
            + دسته تخفیف جدید
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Categories List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">دسته‌بندی‌ها</h3>
            {categories.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center text-gray-400 border border-dashed">
                هنوز دسته تخفیفی ایجاد نشده
              </div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`bg-white rounded-xl p-4 border cursor-pointer transition ${selectedCategory?.id === cat.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-indigo-200'}`}
                  onClick={() => openPriceEditor(cat)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm">{cat.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {cat.is_fixed_percent
                          ? `تخفیف ثابت ${toPersianDigits(cat.fixed_percent)}٪ روی همه`
                          : 'قیمت‌گذاری اختصاصی هر محصول'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEditForm(cat); }} className="text-xs text-blue-500 hover:text-blue-700">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }} className="text-xs text-red-500 hover:text-red-700">🗑️</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Price Editor */}
          <div className="lg:col-span-2">
            {selectedCategory ? (
              <div className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold">
                    قیمت‌های «{selectedCategory.name}»
                    {selectedCategory.is_fixed_percent && (
                      <span className="text-xs text-gray-500 font-normal mr-2">
                        (تخفیف {toPersianDigits(selectedCategory.fixed_percent)}٪ روی همه)
                      </span>
                    )}
                  </h3>
                </div>

                {!selectedCategory.is_fixed_percent && (
                  <>
                    <input
                      type="text"
                      placeholder="🔍 جستجوی کالا..."
                      value={lineSearch}
                      onChange={(e) => setLineSearch(e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-3 focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="text-right p-2">کالا</th>
                            <th className="text-right p-2">قیمت فروش</th>
                            <th className="text-right p-2">قیمت تخفیفی</th>
                            <th className="text-right p-2 w-24"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.map((p) => {
                            const currentDiscount = lineMap.get(p.id);
                            const isEditing = editingPrices[p.id] !== undefined;
                            return (
                              <tr key={p.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 text-xs font-medium">{p.name}</td>
                                <td className="p-2 text-xs text-gray-500">{formatPrice(p.list_price)}</td>
                                <td className="p-2">
                                  {isEditing ? (
                                    <PriceInput
                                      value={editingPrices[p.id]}
                                      onChange={(v) => setEditingPrices({ ...editingPrices, [p.id]: v })}
                                      placeholder="قیمت"
                                      className="w-24 p-1 border rounded text-xs"
                                    />
                                  ) : (
                                    <span className={`text-xs font-bold ${currentDiscount ? 'text-green-600' : 'text-gray-400'}`}>
                                      {currentDiscount ? formatPrice(currentDiscount) : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {isEditing ? (
                                    <button onClick={() => savePrice(p.id)} className="text-xs text-green-600 font-bold">✓ ذخیره</button>
                                  ) : (
                                    <button
                                      onClick={() => setEditingPrices({ ...editingPrices, [p.id]: String(currentDiscount || p.list_price) })}
                                      className="text-xs text-blue-500"
                                    >
                                      تنظیم قیمت
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {selectedCategory.is_fixed_percent && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-3xl mb-2">🏷️</div>
                    <p className="text-sm">این دسته تخفیف درصدی ثابت دارد</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {toPersianDigits(selectedCategory.fixed_percent)}٪ تخفیف روی قیمت فروش تمام محصولات اعمال می‌شود
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed">
                <div className="text-3xl mb-2">🏷️</div>
                <p className="text-sm">یک دسته تخفیف انتخاب کنید تا قیمت‌ها رو ببینید</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">{editingId ? '✏️ ویرایش دسته تخفیف' : '+ دسته تخفیف جدید'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثلاً: تخفیف همکاری" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">کد (اختیاری)</label>
                <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="مثلاً: COOP" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="fixedPercent" checked={formIsFixed} onChange={(e) => setFormIsFixed(e.target.checked)} className="rounded" />
                <label htmlFor="fixedPercent" className="text-sm text-gray-700">تخفیف درصدی ثابت روی همه محصولات</label>
              </div>
              {formIsFixed && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">درصد تخفیف</label>
                  <input type="number" value={formPercent} onChange={(e) => setFormPercent(e.target.value)} placeholder="5" min="0" max="100" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">توضیحات</label>
                <textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} rows={2} placeholder="اختیاری..." className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50">
                {saving ? 'در حال ذخیره...' : 'ذخیره'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
