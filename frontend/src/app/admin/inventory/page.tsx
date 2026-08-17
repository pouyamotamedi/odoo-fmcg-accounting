'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createProduct, updateProduct, deleteProduct, createStockAdjustment,
  getCategories, createCategory, searchRead, getProductAttributes,
  getAttributeValues, createProductAttribute, createAttributeValue,
  getProductVariants, getTemplateAttributeLines, addAttributeToTemplate,
  updateVariantBarcode, deleteProductTemplate, write,
  getDiscountCategories, syncDiscountPriceForProducts, syncDiscountPriceForTemplate,
} from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import PriceInput from '@/components/PriceInput';
import ExcelButtons from '@/components/ExcelButtons';

interface ProductTemplate {
  id: number;
  name: string;
  list_price: number;
  standard_price: number;
  categ_id: [number, string] | false;
  product_variant_count: number;
  image_512: string | false;
  total_qty: number;
  fmcg_reorder_threshold?: number;
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

function LowStockList() {
  const [items, setItems] = useState<{name: string; qty: number; threshold: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch ALL products — qty_available is computed (not stored) so no ORDER BY on it
        let prods: any[] = [];
        try {
          prods = await searchRead('product.product', [['type', '=', 'consu'], ['active', '=', true]], ['display_name', 'qty_available', 'fmcg_reorder_threshold']);
        } catch {
          try {
            prods = await searchRead('product.product', [['active', '=', true]], ['display_name', 'qty_available', 'fmcg_reorder_threshold']);
          } catch {
            prods = await searchRead('product.product', [['active', '=', true]], ['display_name', 'qty_available']);
          }
        }
        const lowItems = (prods || [])
          .filter((p: any) => {
            const threshold = p.fmcg_reorder_threshold || 5;
            const qty = p.qty_available ?? 0;
            return qty <= threshold;
          })
          .map((p: any) => ({ name: p.display_name || p.name, qty: p.qty_available ?? 0, threshold: p.fmcg_reorder_threshold || 5 }))
          .sort((a, b) => a.qty - b.qty);
        setItems(lowItems);
      } catch (e) { console.error('[LowStock] error:', e); setItems([]); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="p-4 border-b bg-orange-50">
        <h3 className="text-sm font-bold text-orange-700">⚠️ کالاهای با موجودی کم ({toPersianDigits(items.length)} مورد)</h3>
        <p className="text-[10px] text-orange-600">واریانت‌هایی که موجودی آنها کمتر یا مساوی حد نصاب است</p>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">همه کالاها موجودی کافی دارند ✓</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-right p-3">نام کالا</th>
            <th className="text-right p-3">موجودی فعلی</th>
            <th className="text-right p-3">حد نصاب</th>
            <th className="text-right p-3">وضعیت</th>
          </tr></thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t hover:bg-orange-50">
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3 text-red-600 font-bold">{toPersianDigits(Math.round(item.qty))}</td>
                <td className="p-3 text-gray-500">{toPersianDigits(item.threshold)}</td>
                <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.qty === 0 ? 'bg-red-200 text-red-800' : 'bg-orange-100 text-orange-700'}`}>{item.qty === 0 ? 'ناموجود' : 'کمبود'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
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
  const [invPriceLinked, setInvPriceLinked] = useState(true);
  const [invPriceOriginal, setInvPriceOriginal] = useState(0);
  const [invSellOriginal, setInvSellOriginal] = useState(0);
  const [invDiscountOriginals, setInvDiscountOriginals] = useState<Record<number, number>>({});

  // Accordion: expanded templates (multiple allowed)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [variantsMap, setVariantsMap] = useState<Record<number, any[]>>({});
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
  const [currentAttrLines, setCurrentAttrLines] = useState<any[]>([]);
  // Barcode editing
  const [editingBarcode, setEditingBarcode] = useState<number | null>(null);
  const [barcodeValue, setBarcodeValue] = useState('');

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Discount prices per category
  const [discountCats, setDiscountCats] = useState<{id:number;name:string;is_fixed_percent:boolean}[]>([]);
  const [discountPrices, setDiscountPrices] = useState<Record<number, string>>({});
  const [discountLoading, setDiscountLoading] = useState(false);
  const discountLoadRequest = useRef(0);

  // Stock adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjProductId, setAdjProductId] = useState(0);
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState<'damaged'|'expired'|'lost'|'other'>('damaged');
  const [adjNote, setAdjNote] = useState('');
  const [inventoryTab, setInventoryTab] = useState<'products'|'lowstock'>('products');

  async function fetchTemplates() {
    setLoading(true);
    try {
      // Read product.product and group by template for accurate prices
      const prods = await searchRead('product.product', [['type', '=', 'consu'], ['active', '=', true]], [
        'name', 'display_name', 'list_price', 'standard_price', 'qty_available', 'categ_id', 'product_tmpl_id', 'image_512', 'fmcg_reorder_threshold',
      ], 0, 0, 'name asc');
      
      const tmplMap = new Map<number, ProductTemplate>();
      for (const p of (prods || [])) {
        const tmplId = p.product_tmpl_id?.[0] || p.product_tmpl_id;
        if (!tmplMap.has(tmplId)) {
          tmplMap.set(tmplId, {
            id: tmplId,
            name: p.product_tmpl_id?.[1] || p.name,
            list_price: p.list_price,
            standard_price: p.standard_price,
            categ_id: p.categ_id || false,
            product_variant_count: 0,
            image_512: p.image_512 || false,
            total_qty: 0,
            fmcg_reorder_threshold: p.fmcg_reorder_threshold || 10,
          });
        }
        const t = tmplMap.get(tmplId)!;
        t.product_variant_count++;
        t.total_qty += (p.qty_available || 0);
        if (p.standard_price > t.standard_price) t.standard_price = p.standard_price;
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
    const next = new Set(expandedIds);
    if (next.has(tmplId)) { next.delete(tmplId); setExpandedIds(next); return; }
    next.add(tmplId);
    setExpandedIds(next);
    setVariantsLoading(true);
    try {
      const vars = await getProductVariants(tmplId);
      setVariantsMap(prev => ({ ...prev, [tmplId]: vars || [] }));
    } catch { setVariantsMap(prev => ({ ...prev, [tmplId]: [] })); }
    setVariantsLoading(false);
  }

  function openNewForm() {
    discountLoadRequest.current += 1;
    setForm({ name: '', barcode: '', list_price: '', standard_price: '', fmcg_reorder_threshold: '10', categ_id: 0 });
    setEditingId(null); setImageFile(null);
    setInvPriceLinked(true);
    setInvDiscountOriginals({});
    // Default discount prices = empty (will default to list_price)
    setDiscountPrices({});
    setDiscountLoading(false);
    setShowForm(true);
  }

  async function openEditForm(t: ProductTemplate) {
    const requestId = ++discountLoadRequest.current;
    setForm({ name: t.name, barcode: '', list_price: String(t.list_price), standard_price: String(t.standard_price), fmcg_reorder_threshold: String(t.fmcg_reorder_threshold || 10), categ_id: t.categ_id ? t.categ_id[0] : 0 });
    setEditingId(t.id); setImageFile(null);
    setInvPriceLinked(true);
    setInvPriceOriginal(t.standard_price);
    setInvSellOriginal(t.list_price);
    setInvDiscountOriginals({});
    setDiscountPrices({});
    setDiscountLoading(true);
    setShowForm(true);

    try {
      let cats = discountCats;
      if (cats.length === 0) {
        const loadedCats = await searchRead(
          'fmcg.discount.category',
          [['active', '=', true], ['is_fixed_percent', '=', false]],
          ['name', 'is_fixed_percent'],
          0,
          0,
          'sequence asc',
        );
        cats = (loadedCats || []).map((cat: {id: number; name: string}) => ({
          id: cat.id,
          name: cat.name,
          is_fixed_percent: false,
        }));
        if (requestId !== discountLoadRequest.current) return;
        setDiscountCats(cats);
      }

      const prices = await loadDiscountPricesForTemplate(t.id, cats);
      if (requestId !== discountLoadRequest.current) return;

      setDiscountPrices(prices);
      const originals: Record<number, number> = {};
      for (const [key, value] of Object.entries(prices)) {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) originals[Number(key)] = numericValue;
      }
      setInvDiscountOriginals(originals);
    } catch (error) {
      if (requestId === discountLoadRequest.current) {
        setShowForm(false);
        alert(error instanceof Error ? error.message : 'خطا در بارگذاری قیمت‌های تخفیفی');
      }
    } finally {
      if (requestId === discountLoadRequest.current) setDiscountLoading(false);
    }
  }

  async function loadDiscountPricesForTemplate(
    tmplId: number,
    cats: {id:number;name:string;is_fixed_percent:boolean}[],
  ): Promise<Record<number, string>> {
    if (cats.length === 0) return {};

    const categoryIds = cats.map((cat) => cat.id);
    const lines = await searchRead(
      'fmcg.discount.line',
      [['category_id', 'in', categoryIds], ['product_tmpl_id', '=', tmplId]],
      ['category_id', 'discount_price'],
    );

    const prices: Record<number, string> = {};
    for (const line of (lines || [])) {
      const categoryId = Array.isArray(line.category_id) ? line.category_id[0] : line.category_id;
      prices[categoryId] = String(line.discount_price);
    }
    return prices;
  }

  async function handleSave() {
    if (discountLoading) { alert('لطفاً تا پایان بارگذاری قیمت‌های تخفیفی صبر کنید'); return; }
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
        // Also update all variants with the same prices
        const allVars = await searchRead('product.product', [['product_tmpl_id', '=', editingId], ['active', '=', true]], ['id']);
        if (allVars && allVars.length > 0) {
          const varIds = allVars.map((v: any) => v.id);
          await write('product.product', varIds, {
            standard_price: parseFloat(form.standard_price),
            list_price: parseFloat(form.list_price),
          });
          // Keep discount lines synchronized for ALL variants. Empty or sale-price values
          // mean "use the regular sale price", so remove any stale custom line.
          const salePrice = parseFloat(form.list_price);
          for (const cat of discountCats) {
            const rawPrice = discountPrices[cat.id] ?? '';
            const price = Number(rawPrice);
            const hasCustomPrice = rawPrice.trim() !== '' && Number.isFinite(price) && price !== salePrice;
            await syncDiscountPriceForTemplate(cat.id, editingId, hasCustomPrice ? price : null);
          }
        }
      } else {
        const newTmplId = await createProduct(values);
        // Save discount prices for new product
        if (newTmplId) {
          for (const cat of discountCats) {
            const rawPrice = discountPrices[cat.id] ?? '';
            const price = Number(rawPrice);
            if (rawPrice.trim() !== '' && Number.isFinite(price) && price !== parseFloat(form.list_price)) {
              await syncDiscountPriceForProducts(cat.id, [newTmplId], price);
            }
          }
        }
      }
      discountLoadRequest.current += 1;
      setShowForm(false);
      await fetchTemplates();
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
    // Load current attribute lines for this template
    try {
      const lines = await searchRead('product.template.attribute.line', [['product_tmpl_id', '=', tmplId]], ['attribute_id', 'value_ids']);
      // Resolve value names
      const resolvedLines = [];
      for (const line of (lines || [])) {
        const vals = await searchRead('product.attribute.value', [['id', 'in', line.value_ids]], ['name']);
        resolvedLines.push({ ...line, value_names: (vals || []).map((v: any) => v.name), line_id: line.id });
      }
      setCurrentAttrLines(resolvedLines);
    } catch { setCurrentAttrLines([]); }
    setShowAttrForm(true);
  }

  async function handleAttrSelect(attrId: number) {
    setSelectedAttr(attrId); setSelectedValues([]);
    if (attrId) {
      try {
        const v = await getAttributeValues(attrId);
        // Show all values - user picks which ones to add
        setAttrValues(v || []);
      } catch { setAttrValues([]); }
    }
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
    if (selectedValues.length < 2) { alert('حداقل ۲ مقدار برای ویژگی انتخاب کنید.\n\nمثلاً: لیمو نعناع + سیب یخ\n\nبا ۱ مقدار، Odoo واریانت جدید نمیسازد.'); return; }
    setSaving(true);
    try {
      // Check if this attribute already exists on the template - if so, add values to existing line
      const existingLines = await searchRead('product.template.attribute.line', [
        ['product_tmpl_id', '=', attrTemplateId],
        ['attribute_id', '=', selectedAttr],
      ], ['id', 'value_ids'], 1);

      if (existingLines && existingLines.length > 0) {
        // Merge new values with existing
        const existingValueIds = existingLines[0].value_ids || [];
        const mergedValues = [...new Set([...existingValueIds, ...selectedValues])];
        await write('product.template.attribute.line', [existingLines[0].id], {
          value_ids: [[6, 0, mergedValues]],
        });
      } else {
        // Create new attribute line
        await addAttributeToTemplate(attrTemplateId, selectedAttr, selectedValues);
      }

      setShowAttrForm(false);
      // Ensure new variants inherit the template's standard_price
      try {
        const tmpl = templates.find(t => t.id === attrTemplateId);
        if (tmpl && tmpl.standard_price) {
          const allVars = await searchRead('product.product', [['product_tmpl_id', '=', attrTemplateId]], ['id', 'standard_price']);
          const zeroVars = (allVars || []).filter((v: any) => !v.standard_price || v.standard_price === 0);
          if (zeroVars.length > 0) {
            await write('product.product', zeroVars.map((v: any) => v.id), { standard_price: tmpl.standard_price, list_price: tmpl.list_price });
          }
        }
      } catch {}
      // Now refresh everything
      await fetchTemplates();
      if (expandedIds.has(attrTemplateId)) {
        const vars = await getProductVariants(attrTemplateId);
        setVariantsMap(prev => ({ ...prev, [attrTemplateId]: vars || [] }));
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function saveBarcode(variantId: number) {
    try { await updateVariantBarcode(variantId, barcodeValue); setEditingBarcode(null);
      // Reload variants for all expanded templates
      for (const tmplId of expandedIds) {
        const vars = await getProductVariants(tmplId);
        setVariantsMap(prev => ({ ...prev, [tmplId]: vars || [] }));
      }
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.includes(search);
    const matchCat = !filterCategory || (t.categ_id && t.categ_id[0] === filterCategory);
    return matchSearch && matchCat;
  });

  const imgUrl = (img: string | false) => {
    if (!img) return null;
    // Odoo stores images as base64. Try to detect format from header bytes.
    // PNG starts with iVBOR, JPEG with /9j/, WEBP with UklG, GIF with R0lG
    if (img.startsWith('iVBOR')) return `data:image/png;base64,${img}`;
    if (img.startsWith('/9j/')) return `data:image/jpeg;base64,${img}`;
    if (img.startsWith('UklG')) return `data:image/webp;base64,${img}`;
    if (img.startsWith('R0lG')) return `data:image/gif;base64,${img}`;
    // Default: let browser figure it out
    return `data:image/png;base64,${img}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">انبار و کالاها</h1>
          <p className="text-gray-500 text-sm">مدیریت محصولات، واریانت‌ها و موجودی</p>
        </div>
        <div className="flex gap-2 items-center">
          <ExcelButtons
            data={templates}
            columns={[
              { key: 'name', label: 'نام کالا' },
              { key: 'standard_price', label: 'قیمت خرید' },
              { key: 'list_price', label: 'قیمت فروش' },
              { key: 'categ_id', label: 'دسته‌بندی', transform: (v) => v ? v[1] : '' },
              { key: 'product_variant_count', label: 'تعداد واریانت' },
            ]}
            filename="products"
            onImport={async (rows) => {
              let count = 0;
              for (const row of rows) {
                if (!row['نام کالا']) continue;
                try {
                  await createProduct({ name: row['نام کالا'], list_price: Number(row['قیمت فروش']) || 0, standard_price: Number(row['قیمت خرید']) || 0 });
                  count++;
                } catch {}
              }
              alert(`${count} کالا وارد شد`);
              await fetchTemplates();
            }}
          />
          <button onClick={openNewForm} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">+ کالای جدید</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setInventoryTab('products')} className={`px-4 py-2 rounded-lg text-xs font-bold ${inventoryTab === 'products' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📦 همه کالاها</button>
        <button onClick={() => setInventoryTab('lowstock')} className={`px-4 py-2 rounded-lg text-xs font-bold ${inventoryTab === 'lowstock' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}>⚠️ موجودی کم</button>
      </div>

      {/* Search & Filter */}
      {inventoryTab === 'products' && <div className="mb-4 flex gap-3 flex-wrap items-center">
        <input type="text" placeholder="🔍 جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 max-w-md p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
        <select value={filterCategory} onChange={(e) => setFilterCategory(Number(e.target.value))} className="p-2 border border-gray-200 rounded-lg text-sm">
          <option value={0}>همه دسته‌ها</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setShowCategoryForm(true)} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200">+ دسته‌بندی</button>
      </div>}

      {inventoryTab === 'products' && (<>
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
                  {imgUrl(t.image_512) ? <img src={imgUrl(t.image_512)!} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-800 truncate">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.categ_id ? t.categ_id[1] : '—'} {t.product_variant_count > 1 && `• ${toPersianDigits(t.product_variant_count)} واریانت`}</div>
                </div>
                <div className="text-xs text-gray-500 px-3">خرید: {formatPrice(t.standard_price)}</div>
                <div className="text-xs text-green-600 font-bold px-3">فروش: {formatPrice(t.list_price)}</div>
                <div className="text-xs text-blue-600 font-bold px-2">موجودی: {toPersianDigits(Math.round(t.total_qty))}</div>
                <div className="flex gap-1 px-2">
                  <button onClick={(e) => { e.stopPropagation(); openEditForm(t); }} className="text-xs text-blue-500 hover:text-blue-700 px-1">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); openAttrForm(t.id); }} className="text-xs text-purple-500 hover:text-purple-700 px-1" title="افزودن ویژگی">🏷️</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-xs text-red-400 hover:text-red-600 px-1">🗑️</button>
                </div>
                <div className="text-gray-400 text-xs px-2">{expandedIds.has(t.id) ? '▲' : '▼'}</div>
              </div>

              {/* Expanded variants */}
              {expandedIds.has(t.id) && (
                <div className="border-t bg-gray-50 p-3">
                  {variantsLoading && !variantsMap[t.id] ? <div className="text-center text-gray-400 text-sm py-3">بارگذاری...</div> : (variantsMap[t.id] || []).length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-3">
                      <p>واریانتی یافت نشد.</p>
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
                        {(variantsMap[t.id] || []).map((v: any) => {
                          // Extract variant attribute info from display_name or combination_indices
                          const variantLabel = v.display_name || v.name;
                          // Try to show only the variant-specific part (after template name)
                          const templateName = t.name;
                          const shortLabel = variantLabel.startsWith(templateName) && variantLabel.length > templateName.length
                            ? variantLabel.slice(templateName.length).replace(/^\s*[\(\[,]\s*/, '').replace(/[\)\]]\s*$/, '')
                            : variantLabel;
                          return (
                          <tr key={v.id} className="border-t border-gray-200">
                            <td className="p-2 font-medium">{shortLabel || variantLabel}</td>
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
                            <td className="p-2 flex gap-2">
                              <button onClick={() => { setAdjProductId(v.id); setAdjQty(''); setAdjNote(''); setShowAdjustment(true); }} className="text-orange-600 hover:text-orange-800">تعدیل</button>
                              <button onClick={async () => { if(!confirm('حذف این واریانت؟')) return; try { await write('product.product', [v.id], {active: false}); await toggleExpand(t.id); await fetchTemplates(); } catch(e:any){alert(e.message||'خطا');} }} className="text-red-500 hover:text-red-700">حذف</button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </>)}

      {/* Low Stock Tab */}
      {inventoryTab === 'lowstock' && (
        <LowStockList />
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">{editingId ? '✏️ ویرایش کالا' : '+ کالای جدید'}</h3>
            <div className={`space-y-3 ${discountLoading ? 'pointer-events-none opacity-60' : ''}`}>
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
                  <PriceInput value={form.standard_price} onChange={(v) => {
                    if (invPriceLinked && invPriceOriginal > 0) {
                      const ratio = (Number(v) || 0) / invPriceOriginal;
                      const newSell = String(Math.round(invSellOriginal * ratio));
                      // Also adjust discount prices proportionally from their originals
                      const newDisc: Record<number, string> = {};
                      for (const [catId, origVal] of Object.entries(invDiscountOriginals)) {
                        if (origVal > 0) newDisc[Number(catId)] = String(Math.round(origVal * ratio));
                      }
                      setForm(f => ({...f, standard_price: v, list_price: newSell}));
                      if (Object.keys(newDisc).length > 0) setDiscountPrices(newDisc);
                    } else {
                      setForm(f => ({...f, standard_price: v}));
                    }
                  }} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
                </div>
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">قیمت فروش *</label>
                    <PriceInput value={form.list_price} onChange={(v) => setForm({...form, list_price: v})} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvPriceLinked(!invPriceLinked)}
                    title={invPriceLinked ? 'لینک فعال: قیمت فروش با خرید تغییر می‌کند' : 'لینک غیرفعال'}
                    className={`mb-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-sm transition ${invPriceLinked ? 'bg-indigo-100 text-indigo-600 border-2 border-indigo-400' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                  >
                    {invPriceLinked ? '🔗' : '⛓️‍💥'}
                  </button>
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
                <label className="block text-xs text-gray-500 mb-1">حداقل موجودی (هشدار)</label>
                <input type="number" value={form.fmcg_reorder_threshold} onChange={(e) => setForm({...form, fmcg_reorder_threshold: e.target.value})} placeholder="۱۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">تصویر محصول</label>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="w-full text-sm" />
              </div>
              {/* Discount prices */}
              {(discountLoading || discountCats.length > 0) && (
                <div className="border-t pt-3 mt-3">
                  <label className="block text-xs text-gray-500 mb-2">قیمت‌های تخفیفی (پیش‌فرض = قیمت فروش)</label>
                  {discountLoading ? (
                    <div className="text-xs text-indigo-500 bg-indigo-50 rounded-lg p-3">در حال بارگذاری قیمت‌های ذخیره‌شده...</div>
                  ) : (
                    <div className="space-y-2">
                      {discountCats.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-28 truncate">{cat.name}:</span>
                          <PriceInput
                            value={discountPrices[cat.id] ?? ''}
                            onChange={(value) => setDiscountPrices((previous) => ({...previous, [cat.id]: value}))}
                            placeholder={form.list_price || '= قیمت فروش'}
                            className="flex-1 p-2 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} disabled={saving || discountLoading} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50">{saving ? 'ذخیره...' : discountLoading ? 'بارگذاری...' : 'ذخیره'}</button>
              <button onClick={() => { discountLoadRequest.current += 1; setShowForm(false); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Attribute Form Modal */}
      {showAttrForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">مدیریت ویژگی‌های محصول</h3>

            {/* Current attributes */}
            {currentAttrLines.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-2">ویژگی‌های فعلی:</label>
                <div className="space-y-2">
                  {currentAttrLines.map((line: any) => (
                    <div key={line.line_id || line.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3 border">
                      <div>
                        <span className="text-sm font-bold text-slate-700">{line.attribute_id?.[1] || 'ویژگی'}</span>
                        <span className="text-xs text-gray-500 mr-2">({(line.value_names || []).join('، ')})</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('حذف این ویژگی و واریانت‌های مربوطه؟')) return;
                          try {
                            const { unlink } = await import('@/lib/odoo-api');
                            await unlink('product.template.attribute.line', [line.line_id || line.id]);
                            await openAttrForm(attrTemplateId);
                            await fetchTemplates();
                            if (expandedIds.has(attrTemplateId)) { const vars = await getProductVariants(attrTemplateId); setVariantsMap(prev => ({ ...prev, [attrTemplateId]: vars || [] })); }
                          } catch (e: any) { alert(e.message || 'خطا در حذف'); }
                        }}
                        className="text-xs text-red-500 hover:text-red-700 font-bold"
                      >🗑️ حذف</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new attribute */}
            <div className="border-t pt-4 space-y-4">
              <label className="block text-xs text-gray-500 font-bold">افزودن ویژگی جدید:</label>
              <div>
                <select value={selectedAttr} onChange={(e) => handleAttrSelect(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>— انتخاب ویژگی —</option>
                  {attributes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {selectedAttr > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm('حذف این ویژگی از کل سیستم؟ (فقط اگر در هیچ محصولی استفاده نشده)')) return;
                      try {
                        const { unlink } = await import('@/lib/odoo-api');
                        await unlink('product.attribute', [selectedAttr]);
                        setSelectedAttr(0);
                        const attrs = await getProductAttributes(); setAttributes(attrs || []);
                      } catch (e: any) { alert(e.message || 'خطا - احتمالاً در محصولی استفاده شده'); }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 mt-1 inline-block"
                  >🗑️ حذف ویژگی «{attributes.find(a=>a.id===selectedAttr)?.name}» از سیستم</button>
                )}
                <div className="flex gap-2 mt-2">
                  <input type="text" value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)} placeholder="ویژگی جدید (مثلاً: طعم)" className="flex-1 p-2 border border-gray-200 rounded-lg text-xs" />
                  <button onClick={handleCreateAttr} disabled={!newAttrName} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">+ ایجاد</button>
                </div>
              </div>
              {selectedAttr > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">مقادیر (انتخاب کنید):</label>
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
              <button onClick={handleAddAttr} disabled={saving||!selectedAttr||selectedValues.length===0} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold disabled:opacity-40">{saving?'ذخیره...':'ثبت ویژگی جدید'}</button>
              <button onClick={() => setShowAttrForm(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">بستن</button>
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
                      <div className="flex gap-2">
                        <button onClick={async () => { const newName = prompt('نام جدید:', c.name); if(!newName) return; try { await write('product.category', [c.id], {name: newName}); await fetchCategories(); } catch(e:any){alert(e.message||'خطا');} }} className="text-xs text-blue-400 hover:text-blue-600">✏️</button>
                        <button onClick={async () => { if(!confirm(`حذف دسته "${c.name}"?`)) return; try { await write('product.category', [c.id], {active: false}); await fetchCategories(); } catch(e:any){alert(e.message||'خطا');} }} className="text-xs text-red-400 hover:text-red-600">🗑️</button>
                      </div>
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
