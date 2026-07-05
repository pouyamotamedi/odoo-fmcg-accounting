'use client';

import { useEffect, useState } from 'react';
import { getProducts, createProduct, updateProduct, deleteProduct, createStockAdjustment, getCategories, createCategory, searchRead } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import PriceInput from '@/components/PriceInput';

interface Product {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  standard_price: number;
  qty_available: number;
  fmcg_reorder_threshold: number;
  fmcg_is_low_stock: boolean;
  categ_id: [number, string] | false;
}

interface Category {
  id: number;
  name: string;
}

interface ProductForm {
  name: string;
  barcode: string;
  list_price: string;
  standard_price: string;
  fmcg_reorder_threshold: string;
  categ_id: number;
}

interface AdjustmentForm {
  product_id: number;
  quantity: string;
  reason: 'damaged' | 'expired' | 'lost' | 'other';
  note: string;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState(0);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [form, setForm] = useState<ProductForm>({
    name: '', barcode: '', list_price: '', standard_price: '', fmcg_reorder_threshold: '10', categ_id: 0,
  });

  const [adjForm, setAdjForm] = useState<AdjustmentForm>({
    product_id: 0, quantity: '', reason: 'damaged', note: '',
  });

  async function fetchProducts() {
    try {
      setLoading(true);
      const data = await getProducts();
      // Re-fetch with categ_id field
      const fullData = await searchRead(
        'product.product',
        [['active', '=', true], ['type', '=', 'consu']],
        ['name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'fmcg_reorder_threshold', 'fmcg_is_low_stock', 'categ_id'],
      );
      setProducts(fullData || data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const data = await getCategories();
      setCategories(data || []);
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  function openNewForm() {
    setForm({ name: '', barcode: '', list_price: '', standard_price: '', fmcg_reorder_threshold: '10', categ_id: 0 });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    setForm({
      name: product.name,
      barcode: product.barcode || '',
      list_price: String(product.list_price),
      standard_price: String(product.standard_price),
      fmcg_reorder_threshold: String(product.fmcg_reorder_threshold),
      categ_id: product.categ_id ? product.categ_id[0] : 0,
    });
    setEditingId(product.id);
    setShowForm(true);
  }

  function openAdjustment(product: Product) {
    setAdjForm({ product_id: product.id, quantity: '', reason: 'damaged', note: '' });
    setShowAdjustment(true);
  }

  async function handleSave() {
    if (!form.name || !form.list_price || !form.standard_price) {
      alert('نام، قیمت خرید و قیمت فروش الزامی هستند');
      return;
    }
    setSaving(true);
    try {
      const values: any = {
        name: form.name,
        barcode: form.barcode || undefined,
        list_price: parseFloat(form.list_price),
        standard_price: parseFloat(form.standard_price),
        fmcg_reorder_threshold: parseInt(form.fmcg_reorder_threshold) || 10,
      };
      if (form.categ_id) values.categ_id = form.categ_id;

      if (editingId) {
        await updateProduct(editingId, values);
      } else {
        await createProduct(values);
      }
      setShowForm(false);
      await fetchProducts();
    } catch (e: any) {
      alert(e.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('آیا از حذف این کالا مطمئنید؟')) return;
    try {
      await deleteProduct(id);
      await fetchProducts();
    } catch (e: any) {
      alert(e.message || 'خطا در حذف');
    }
  }

  async function handleAdjustment() {
    if (!adjForm.quantity || !adjForm.note) {
      alert('تعداد و توضیحات الزامی هستند');
      return;
    }
    setSaving(true);
    try {
      await createStockAdjustment({
        product_id: adjForm.product_id,
        quantity: parseFloat(adjForm.quantity),
        reason: adjForm.reason,
        note: adjForm.note,
      });
      setShowAdjustment(false);
      await fetchProducts();
    } catch (e: any) {
      alert(e.message || 'خطا در تعدیل');
    } finally {
      setSaving(false);
    }
  }

  const filtered = products.filter(
    (p) => {
      const matchSearch = p.name.includes(search) || (p.barcode && p.barcode.includes(search));
      const matchCategory = !filterCategory || (p.categ_id && p.categ_id[0] === filterCategory);
      return matchSearch && matchCategory;
    }
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">انبار و کالاها</h1>
          <p className="text-gray-500 text-sm">مدیریت محصولات، موجودی و تعدیل انبار</p>
        </div>
        <button
          onClick={openNewForm}
          className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition"
        >
          + کالای جدید
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="mb-4 flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="🔍 جستجوی نام یا بارکد..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(Number(e.target.value))}
          className="p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
        >
          <option value={0}>همه دسته‌بندی‌ها</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button onClick={() => setShowCategoryForm(true)} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200">
          + دسته‌بندی
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
          <div className="text-4xl mb-3">📦</div>
          <p>هنوز کالایی ثبت نشده</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right p-3 font-medium text-gray-600">نام کالا</th>
                <th className="text-right p-3 font-medium text-gray-600">دسته</th>
                <th className="text-right p-3 font-medium text-gray-600">بارکد</th>
                <th className="text-right p-3 font-medium text-gray-600">قیمت خرید</th>
                <th className="text-right p-3 font-medium text-gray-600">قیمت فروش</th>
                <th className="text-right p-3 font-medium text-gray-600">موجودی</th>
                <th className="text-right p-3 font-medium text-gray-600">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 ${product.fmcg_is_low_stock ? 'bg-red-50' : ''}`}
                >
                  <td className="p-3 font-medium">
                    {product.name}
                    {product.fmcg_is_low_stock && (
                      <span className="mr-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">کمبود</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{product.categ_id ? product.categ_id[1] : '—'}</td>
                  <td className="p-3 text-gray-500">{product.barcode || '—'}</td>
                  <td className="p-3">{formatPrice(product.standard_price)}</td>
                  <td className="p-3">{formatPrice(product.list_price)}</td>
                  <td className={`p-3 font-bold ${product.fmcg_is_low_stock ? 'text-red-600' : 'text-green-600'}`}>
                    {toPersianDigits(Math.round(product.qty_available))}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEditForm(product)} className="text-xs text-blue-600 hover:text-blue-800">ویرایش</button>
                      <button onClick={() => openAdjustment(product)} className="text-xs text-orange-600 hover:text-orange-800">تعدیل</button>
                      <button onClick={() => handleDelete(product.id)} className="text-xs text-red-500 hover:text-red-700">حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">
              {editingId ? '✏️ ویرایش کالا' : '+ ثبت کالای جدید'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام کالا *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثلاً: شیر کاله ۱ لیتری"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">بارکد</label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="اختیاری"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت خرید (تومان) *</label>
                  <PriceInput
                    value={form.standard_price}
                    onChange={(v) => setForm({ ...form, standard_price: v })}
                    placeholder="۲۵٬۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت فروش (تومان) *</label>
                  <PriceInput
                    value={form.list_price}
                    onChange={(v) => setForm({ ...form, list_price: v })}
                    placeholder="۳۲٬۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">حد هشدار موجودی</label>
                <input
                  type="number"
                  value={form.fmcg_reorder_threshold}
                  onChange={(e) => setForm({ ...form, fmcg_reorder_threshold: e.target.value })}
                  placeholder="10"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">دسته‌بندی</label>
                <select
                  value={form.categ_id}
                  onChange={(e) => setForm({ ...form, categ_id: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value={0}>— بدون دسته‌بندی —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره...' : editingId ? 'ذخیره تغییرات' : 'ثبت کالا'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">📉 تعدیل موجودی</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">تعداد کاهش *</label>
                <input
                  type="number"
                  value={adjForm.quantity}
                  onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })}
                  placeholder="مثلاً ۵"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">دلیل *</label>
                <select
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value as AdjustmentForm['reason'] })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="damaged">آسیب‌دیده</option>
                  <option value="expired">منقضی شده</option>
                  <option value="lost">مفقودی</option>
                  <option value="other">سایر</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">توضیحات *</label>
                <textarea
                  value={adjForm.note}
                  onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })}
                  placeholder="توضیح دلیل کاهش موجودی..."
                  rows={3}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAdjustment}
                disabled={saving}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? 'در حال ثبت...' : 'ثبت تعدیل'}
              </button>
              <button
                onClick={() => setShowAdjustment(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-4">+ دسته‌بندی جدید</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">نام دسته‌بندی *</label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="مثلاً: نوشیدنی، لبنیات، تنقلات..."
                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={async () => {
                  if (!newCategoryName) { alert('نام دسته الزامی است'); return; }
                  try {
                    await createCategory(newCategoryName);
                    setNewCategoryName('');
                    setShowCategoryForm(false);
                    await fetchCategories();
                  } catch (e:any) { alert(e.message || 'خطا'); }
                }}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600"
              >
                ثبت دسته
              </button>
              <button onClick={() => setShowCategoryForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
