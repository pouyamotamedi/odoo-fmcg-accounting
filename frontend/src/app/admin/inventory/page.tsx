'use client';

import { useEffect, useState } from 'react';
import {
  createProduct, updateProduct, deleteProduct, createStockAdjustment,
  getCategories, createCategory, searchRead, getProductAttributes,
  getAttributeValues, createProductAttribute, createAttributeValue,
  getProductVariants, getTemplateAttributeLines, addAttributeToTemplate,
  updateVariantBarcode, deleteProductTemplate, write,
  getDiscountCategories, getDiscountLines, setDiscountPrice,
} from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import PriceInput from '@/components/PriceInput';

interface ProductTemplate {
  id: number;
  name: string;
  list_price: number;
  standard_price: number;
  categ_id: [number, string] | false;
  product_variant_count: number;
  image_128: string | false;
}

interface Variant {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  qty_available: number;
}

interface Category { id: number; name: string; }
interface Attribute { id: number; name: string; }
interface AttrValue { id: number; name: string; }

interface ProductForm {
  name: string;
  barcode: string;
  list_price: string;
  standard_price: string;
  fmcg_reorder_threshold: string;
  categ_id: number;
}

export default function InventoryPage() {
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState(0);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [form, setForm] = useState<ProductForm>({ name: '', barcode: '', list_price: '', standard_price: '', fmcg_reorder_threshold: '10', categ_id: 0 });

  // Accordion: expanded template
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // Attribute form
  const [showAttrForm, setShowAttrForm] = useState(false);
  const [attrTemplateId, setAttrTemplateId] = useState<number>(0);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [selectedAttr, setSelectedAttr] = useState<number>(0);
  const [attrValues, setAttrValues] = useState<AttrValue[]>([]);
  const [selectedValues, setSelectedValues] = useState<number[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newValueName, setNewValueName] = useState('');

  // Barcode editing
  const [editingBarcode, setEditingBarcode] = useState<number | null>(null);
  const [barcodeValue, setBarcodeValue] = useState('');

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Discount prices per category
  const [discountCats, setDiscountCats] = useState<{id:number;name:string;is_fixed_percent:boolean}[]>([]);
  const [discountPrices, setDiscountPrices] = useState<Record<number, string>>({});

  // Stock adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjProductId, setAdjProductId] = useState(0);
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState<'damaged'|'expired'|'lost'|'other'>('damaged');
  const [adjNote, setAdjNote] = useState('');

  async function fetchTemplates() {
    setLoading(true);
    try {
      // Read product.product (same as POS/purchase) with active filter
      // Then group by product_tmpl_id for display
      const data = await searchRead('product.product', [['active', '=', true], ['type', '=', 'consu']], [
        'name', 'product_tmpl_id', 'list_price', 'standard_price', 'categ_id', 'qty_available', 'image_128', 'barcode',
      ], 0, 0, 'name asc');

      // Group by template
      const tmplMap = new Map<number, ProductTemplate>();
      for (const p of (data || [])) {
        const tmplId = p.product_tmpl_id?.[0] || p.product_tmpl_id;
        if (!tmplMap.has(tmplId)) {
          tmplMap.set(tmplId, {
            id: tmplId,
            name: p.product_tmpl_id?.[1] || p.name,
            list_price: p.list_price,
            standard_price: p.standard_price,
            categ_id: p.categ_id || false,
            product_variant_count: 0,
            image_128: p.image_128 || false,
          });
        }
        tmplMap.get(tmplId)!.product_variant_count++;
      }
      setTemplates(Array.from(tmplMap.values()));
      setError('');
    } catch (e: any) { setError(e.message || 'خطا'); }
    setLoading(false);
  }

  async function fetchCategories() {
    try { const data = await getCategories(); setCategories(data || []); } catch {}
    try { const dc = await getDiscountCategories(); setDiscountCats((dc||[]).filter((c:any) => !c.is_fixed_percent)); } catch {}
  }

  useEffect(() => { fetchTemplates(); fetchCategories(); }, []);

  async function toggleExpand(tmplId: number) {
    if (expandedId === tmplId) { setExpandedId(null); return; }
    setExpandedId(tmplId);
    setVariantsLoading(true);
    try {
      const vars = await getProductVariants(tmplId);
      setVariants(vars || []);
    } catch { setVariants([]); }
    setVariantsLoading(false);
  }

  function openNewForm() {
    setForm({ name: '', barcode: '', list_price: '', standard_price: '', fmcg_reorder_threshold: '10', categ_id: 0 });
    setEditingId(null); setImageFile(null);
    // Default discount prices = empty (will default to list_price)
    setDiscountPrices({});
    setShowForm(true);
  }

  function openEditForm(t: ProductTemplate) {
    setForm({ name: t.name, barcode: '', list_price: String(t.list_price), standard_price: String(t.standard_price), fmcg_reorder_threshold: '10', categ_id: t.categ_id ? t.categ_id[0] : 0 });
    setEditingId(t.id); setImageFile(null);
    // Load existing discount prices for this product
    loadDiscountPricesForTemplate(t.id);
    setShowForm(true);
  }

  async function loadDiscountPricesForTemplate(tmplId: number) {
    const prices: Record<number, string> = {};
    // Find first variant of this template
    const vars = await searchRead('product.product', [['product_tmpl_id', '=', tmplId], ['active', '=', true]], ['id'], 1);
    if (vars && vars.length > 0) {
      const prodId = vars[0].id;
      for (const cat of discountCats) {
        const lines = await searchRead('fmcg.discount.line', [['category_id', '=', cat.id], ['product_id', '=', prodId]], ['discount_price'], 1);
        if (lines && lines.length > 0) {
          prices[cat.id] = String(lines[0].discount_price);
        }
      }
    }
    setDiscountPrices(prices);
  }

  async function handleSave() {
    if (!form.name || !form.list_price || !form.standard_price) { alert('نام، قیمت خرید و فروش الزامی‌اند'); return; }
    setSaving(true);
    try {
      const values: any = {
        name: form.name, barcode: form.barcode || undefined,
        list_price: parseFloat(form.list_price), standard_price: parseFloat(form.standard_price),
        fmcg_reorder_threshold: parseInt(form.fmcg_reorder_threshold) || 10,
      };
      if (form.categ_id) values.categ_id = form.categ_id;
      // Image
      if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        values.image_1920 = base64;
      }
      if (editingId) {
        await write('product.template', [editingId], values);
        // Save discount prices
        const vars = await searchRead('product.product', [['product_tmpl_id', '=', editingId], ['active', '=', true]], ['id'], 1);
        if (vars && vars.length > 0) {
          for (const cat of discountCats) {
            const price = parseFloat(discountPrices[cat.id] || '');
            if (price && price !== parseFloat(form.list_price)) {
              await setDiscountPrice(cat.id, vars[0].id, price);
            }
          }
        }
      } else {
        const newId = await createProduct(values);
        // Save discount prices for new product
        if (newId) {
          for (const cat of discountCats) {
            const price = parseFloat(discountPrices[cat.id] || '');
            if (price && price !== parseFloat(form.list_price)) {
              await setDiscountPrice(cat.id, newId, price);
            }
          }
        }
      }
      setShowForm(false); await fetchTemplates();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:image/...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleDelete(id: number) {
    if (!confirm('حذف این کالا؟')) return;
    try { await deleteProductTemplate(id); await fetchTemplates(); } catch (e: any) { alert(e.message || 'خطا'); }
  }

  async function handleAdjustment() {
    if (!adjQty || !adjNote) { alert('تعداد و توضیحات الزامی‌اند'); return; }
    setSaving(true);
    try {
      await createStockAdjustment({ product_id: adjProductId, quantity: parseFloat(adjQty), reason: adjReason, note: adjNote });
      setShowAdjustment(false); await fetchTemplates();
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  // Attribute functions
  async function openAttrForm(tmplId: number) {
    setAttrTemplateId(tmplId); setSelectedAttr(0); setSelectedValues([]); setNewAttrName(''); setNewValueName('');
    try { const attrs = await getProductAttributes(); setAttributes(attrs || []); } catch {}
    setShowAttrForm(true);
  }

  async function handleAttrSelect(attrId: number) {
    setSelectedAttr(attrId); setSelectedValues([]);
    if (attrId) { try { const v = await getAttributeValues(attrId); setAttrValues(v || []); } catch { setAttrValues([]); } }
    else setAttrValues([]);
  }

  async function handleCreateAttr() {
    if (!newAttrName) return;
    try {
      const id = await createProductAttribute(newAttrName); setNewAttrName('');
      const attrs = await getProductAttributes(); setAttributes(attrs || []);
      await handleAttrSelect(id);
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  async function handleCreateValue() {
    if (!newValueName || !selectedAttr) return;
    try {
      const id = await createAttributeValue(selectedAttr, newValueName); setNewValueName('');
      const v = await getAttributeValues(selectedAttr); setAttrValues(v || []);
      setSelectedValues([...selectedValues, id]);
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  async function handleAddAttr() {
    if (!selectedAttr || selectedValues.length === 0) { alert('ویژگی و مقادیر را انتخاب کنید'); return; }
    setSaving(true);
    try {
      await addAttributeToTemplate(attrTemplateId, selectedAttr, selectedValues);
      setShowAttrForm(false); await fetchTemplates();
      if (expandedId === attrTemplateId) { const vars = await getProductVariants(attrTemplateId); setVariants(vars || []); }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function saveBarcode(variantId: number) {
    try { await updateVariantBarcode(variantId, barcodeValue); setEditingBarcode(null);
      if (expandedId) { const vars = await getProductVariants(expandedId); setVariants(vars || []); }
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.includes(search);
    const matchCat = !filterCategory || (t.categ_id && t.categ_id[0] === filterCategory);
    return matchSearch && matchCat;
  });

  const imgUrl = (img128: string | false) => img128 ? `data:image/png;base64,${img128}` : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">انبار و کالاها</h1>
          <p className="text-gray-500 text-sm">مدیریت محصولات، واریانت‌ها و موجودی</p>
        </div>
        <button onClick={openNewForm} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">+ کالای جدید</button>
      </div>

      {/* Search & Filter */}
      <div className="mb-4 flex gap-3 flex-wrap items-center">
        <input type="text" placeholder="🔍 جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 max-w-md p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
        <select value={filterCategory} onChange={(e) => setFilterCategory(Number(e.target.value))} className="p-2 border border-gray-200 rounded-lg text-sm">
          <option value={0}>همه دسته‌ها</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setShowCategoryForm(true)} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200">+ دسته‌بندی</button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-gray-400">بارگذاری...</div> : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed"><div className="text-4xl mb-3">📦</div><p>کالایی ثبت نشده</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Product row */}
              <div className="flex items-center p-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(t.id)}>
                {/* Image */}
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden ml-3 flex-shrink-0">
                  {imgUrl(t.image_128) ? <img src={imgUrl(t.image_128)!} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-800 truncate">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.categ_id ? t.categ_id[1] : '—'} {t.product_variant_count > 1 && `• ${toPersianDigits(t.product_variant_count)} واریانت`}</div>
                </div>
                <div className="text-xs text-gray-500 px-3">خرید: {formatPrice(t.standard_price)}</div>
                <div className="text-xs text-green-600 font-bold px-3">فروش: {formatPrice(t.list_price)}</div>
                <div className="flex gap-1 px-2">
                  <button onClick={(e) => { e.stopPropagation(); openEditForm(t); }} className="text-xs text-blue-500 hover:text-blue-700 px-1">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); openAttrForm(t.id); }} className="text-xs text-purple-500 hover:text-purple-700 px-1" title="افزودن ویژگی">🏷️</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-xs text-red-400 hover:text-red-600 px-1">🗑️</button>
                </div>
                <div className="text-gray-400 text-xs px-2">{expandedId === t.id ? '▲' : '▼'}</div>
              </div>

              {/* Expanded variants */}
              {expandedId === t.id && (
                <div className="border-t bg-gray-50 p-3">
                  {variantsLoading ? <div className="text-center text-gray-400 text-sm py-3">بارگذاری...</div> : variants.length <= 1 ? (
                    <div className="text-center text-gray-400 text-sm py-3">
                      <p>واریانتی ایجاد نشده. با دکمه 🏷️ ویژگی اضافه کنید.</p>
                      <p className="text-xs mt-1">موجودی: {toPersianDigits(Math.round(variants[0]?.qty_available || 0))}</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-500">
                        <th className="text-right p-2">واریانت</th>
                        <th className="text-right p-2">بارکد</th>
                        <th className="text-right p-2">موجودی</th>
                        <th className="text-right p-2">عملیات</th>
                      </tr></thead>
                      <tbody>
                        {variants.map((v) => (
                          <tr key={v.id} className="border-t border-gray-200">
                            <td className="p-2 font-medium">{v.name}</td>
                            <td className="p-2">
                              {editingBarcode === v.id ? (
                                <div className="flex gap-1">
                                  <input type="text" value={barcodeValue} onChange={(e) => setBarcodeValue(e.target.value)} className="w-28 p-1 border rounded text-xs" autoFocus />
                                  <button onClick={() => saveBarcode(v.id)} className="text-green-600 font-bold">✓</button>
                                  <button onClick={() => setEditingBarcode(null)} className="text-red-500">✕</button>
                                </div>
                              ) : (
                                <span className="text-gray-500 cursor-pointer hover:text-blue-600" onClick={() => { setEditingBarcode(v.id); setBarcodeValue(v.barcode || ''); }}>
                                  {v.barcode || '— تنظیم بارکد —'}
                                </span>
                              )}
                            </td>
                            <td className="p-2 font-bold">{toPersianDigits(Math.round(v.qty_available))}</td>
                            <td className="p-2">
                              <button onClick={() => { setAdjProductId(v.id); setAdjQty(''); setAdjNote(''); setShowAdjustment(true); }} className="text-orange-600 hover:text-orange-800">تعدیل</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">{editingId ? '✏️ ویرایش کالا' : '+ کالای جدید'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="نام کالا" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">بارکد</label>
                <input type="text" value={form.barcode} onChange={(e) => setForm({...form, barcode: e.target.value})} placeholder="اختیاری" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت خرید *</label>
                  <PriceInput value={form.standard_price} onChange={(v) => setForm({...form, standard_price: v})} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت فروش *</label>
                  <PriceInput value={form.list_price} onChange={(v) => setForm({...form, list_price: v})} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">دسته‌بندی</label>
                <select value={form.categ_id} onChange={(e) => setForm({...form, categ_id: Number(e.target.value)})} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">تصویر محصول</label>
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="w-full text-sm" />
              </div>
              {/* Discount prices */}
              {discountCats.length > 0 && (
                <div className="border-t pt-3 mt-3">
                  <label className="block text-xs text-gray-500 mb-2">قیمت‌های تخفیفی (پیش‌فرض = قیمت فروش)</label>
                  <div className="space-y-2">
                    {discountCats.map((cat) => (
                      <div key={cat.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-28 truncate">{cat.name}:</span>
                        <PriceInput
                          value={discountPrices[cat.id] || ''}
                          onChange={(v) => setDiscountPrices({...discountPrices, [cat.id]: v})}
                          placeholder={form.list_price || '= قیمت فروش'}
                          className="flex-1 p-2 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50">{saving ? 'ذخیره...' : 'ذخیره'}</button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Attribute Form Modal */}
      {showAttrForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold mb-4">افزودن ویژگی (ایجاد واریانت)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">ویژگی</label>
                <select value={selectedAttr} onChange={(e) => handleAttrSelect(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>— انتخاب —</option>
                  {attributes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="flex gap-2 mt-2">
                  <input type="text" value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)} placeholder="ویژگی جدید (مثلاً: طعم)" className="flex-1 p-2 border border-gray-200 rounded-lg text-xs" />
                  <button onClick={handleCreateAttr} disabled={!newAttrName} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">+ ایجاد</button>
                </div>
              </div>
              {selectedAttr > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">مقادیر</label>
                  <div className="flex flex-wrap gap-2 mb-2 max-h-32 overflow-auto">
                    {attrValues.map((v) => (
                      <button key={v.id} onClick={() => setSelectedValues((p) => p.includes(v.id) ? p.filter(x=>x!==v.id) : [...p, v.id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${selectedValues.includes(v.id) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {v.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newValueName} onChange={(e) => setNewValueName(e.target.value)} placeholder="مقدار جدید (مثلاً: هلو)" className="flex-1 p-2 border border-gray-200 rounded-lg text-xs" onKeyDown={(e) => { if (e.key==='Enter') handleCreateValue(); }} />
                    <button onClick={handleCreateValue} disabled={!newValueName} className="px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">+ افزودن</button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleAddAttr} disabled={saving||!selectedAttr||selectedValues.length===0} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold disabled:opacity-40">{saving?'ذخیره...':'ثبت و ایجاد واریانت‌ها'}</button>
              <button onClick={() => setShowAttrForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
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
                <label className="block text-xs text-gray-500 mb-1">تعداد *</label>
                <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder="تعداد" min="1" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">دلیل</label>
                <select value={adjReason} onChange={(e) => setAdjReason(e.target.value as any)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value="damaged">آسیب‌دیده</option><option value="expired">منقضی</option><option value="lost">مفقودی</option><option value="other">سایر</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">توضیحات *</label>
                <textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} rows={2} placeholder="دلیل تعدیل..." className="w-full p-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleAdjustment} disabled={saving} className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving?'ثبت...':'ثبت تعدیل'}</button>
              <button onClick={() => setShowAdjustment(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Form */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-4">+ دسته‌بندی جدید</h3>
            <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="نام دسته" className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-4" />
            <div className="flex gap-3">
              <button onClick={async () => { if (!newCategoryName) return; try { await createCategory(newCategoryName); setNewCategoryName(''); setShowCategoryForm(false); await fetchCategories(); } catch(e:any){alert(e.message||'خطا');} }} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold">ثبت</button>
              <button onClick={() => setShowCategoryForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">انصراف</button>
            </div>
            {/* Category list with edit/delete */}
            {categories.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <div className="text-xs text-gray-500 mb-2">دسته‌بندی‌های موجود:</div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {categories.map((c) => (
                    <div key={c.id} className="flex justify-between items-center py-1 px-2 rounded hover:bg-gray-50">
                      <span className="text-xs">{c.name}</span>
                      <button onClick={async () => { if(!confirm(`حذف دسته "${c.name}"?`)) return; try { await write('product.category', [c.id], {active: false}); await fetchCategories(); } catch(e:any){alert(e.message||'خطا');} }} className="text-xs text-red-400 hover:text-red-600">حذف</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
