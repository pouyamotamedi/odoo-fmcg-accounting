'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  searchRead, getProductAttributes, getAttributeValues, createProductAttribute,
  createAttributeValue, getProductVariants, getTemplateAttributeLines,
  addAttributeToTemplate, updateVariantBarcode, getProductTemplate,
} from '@/lib/odoo-api';
import { formatPrice, toPersianDigits } from '@/lib/utils';

interface Variant {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  qty_available: number;
  product_template_variant_value_ids: number[];
}

interface Attribute {
  id: number;
  name: string;
}

interface AttributeValue {
  id: number;
  name: string;
  attribute_id: [number, string] | number;
}

interface AttrLine {
  attribute_id: [number, string];
  value_ids: number[];
}

export default function ProductDetailPage() {
  const params = useParams();
  const productId = Number(params.id);

  const [product, setProduct] = useState<any>(null);
  const [templateId, setTemplateId] = useState<number>(0);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attrLines, setAttrLines] = useState<AttrLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Add attribute form
  const [showAddAttr, setShowAddAttr] = useState(false);
  const [selectedAttr, setSelectedAttr] = useState<number>(0);
  const [attrValues, setAttrValues] = useState<AttributeValue[]>([]);
  const [selectedValues, setSelectedValues] = useState<number[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newValueName, setNewValueName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Barcode editing
  const [editingBarcode, setEditingBarcode] = useState<number | null>(null);
  const [barcodeValue, setBarcodeValue] = useState('');

  useEffect(() => {
    if (productId) loadAll();
  }, [productId]);

  async function loadAll() {
    setLoading(true);
    try {
      // Get product info
      const prods = await searchRead('product.product', [['id', '=', productId]], [
        'name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'product_tmpl_id', 'categ_id',
      ], 1);
      if (prods && prods.length > 0) {
        setProduct(prods[0]);
        const tmplId = prods[0].product_tmpl_id?.[0] || prods[0].product_tmpl_id;
        setTemplateId(tmplId);

        // Load variants
        const vars = await getProductVariants(tmplId);
        setVariants(vars || []);

        // Load attribute lines
        const lines = await getTemplateAttributeLines(tmplId);
        setAttrLines(lines || []);
      }

      // Load all attributes
      const attrs = await getProductAttributes();
      setAttributes(attrs || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleAttrSelect(attrId: number) {
    setSelectedAttr(attrId);
    setSelectedValues([]);
    if (attrId) {
      const vals = await getAttributeValues(attrId);
      setAttrValues(vals || []);
    } else {
      setAttrValues([]);
    }
  }

  async function handleCreateAttribute() {
    if (!newAttrName) return;
    setSaving(true);
    try {
      const id = await createProductAttribute(newAttrName);
      setNewAttrName('');
      const attrs = await getProductAttributes();
      setAttributes(attrs || []);
      setSelectedAttr(id);
      const vals = await getAttributeValues(id);
      setAttrValues(vals || []);
    } catch (e: any) { alert(e.message || 'خطا'); }
    setSaving(false);
  }

  async function handleCreateValue() {
    if (!newValueName || !selectedAttr) return;
    try {
      const id = await createAttributeValue(selectedAttr, newValueName);
      setNewValueName('');
      const vals = await getAttributeValues(selectedAttr);
      setAttrValues(vals || []);
      setSelectedValues([...selectedValues, id]);
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  async function handleAddAttribute() {
    if (!selectedAttr || selectedValues.length === 0) {
      alert('ویژگی و حداقل یک مقدار انتخاب کنید');
      return;
    }
    setSaving(true);
    try {
      await addAttributeToTemplate(templateId, selectedAttr, selectedValues);
      setShowAddAttr(false);
      setSelectedAttr(0);
      setSelectedValues([]);
      setMsg('✅ ویژگی اضافه شد. واریانت‌ها ایجاد شدند.');
      setTimeout(() => setMsg(''), 4000);
      await loadAll();
    } catch (e: any) { alert(e.message || 'خطا در اضافه کردن ویژگی'); }
    setSaving(false);
  }

  async function handleSaveBarcode(variantId: number) {
    try {
      await updateVariantBarcode(variantId, barcodeValue);
      setEditingBarcode(null);
      setBarcodeValue('');
      await loadAll();
    } catch (e: any) { alert(e.message || 'خطا'); }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">بارگذاری...</div>;
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">محصول یافت نشد</p>
        <Link href="/admin/inventory" className="text-indigo-500 text-sm mt-2 inline-block">← بازگشت</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/inventory" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{product.name}</h1>
            <p className="text-gray-500 text-sm">
              قیمت خرید: {formatPrice(product.standard_price)} | قیمت فروش: {formatPrice(product.list_price)} | موجودی کل: {toPersianDigits(Math.round(product.qty_available))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button
            onClick={() => setShowAddAttr(true)}
            className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition"
          >
            + افزودن ویژگی
          </button>
        </div>
      </div>

      {/* Current attributes */}
      {attrLines.length > 0 && (
        <div className="mb-4 flex gap-2 flex-wrap">
          {attrLines.map((line, i) => (
            <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
              {line.attribute_id[1]}: {toPersianDigits(line.value_ids.length)} مقدار
            </span>
          ))}
        </div>
      )}

      {/* Variants table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h3 className="text-sm font-bold text-slate-700">
            واریانت‌ها ({toPersianDigits(variants.length)})
          </h3>
        </div>
        {variants.length <= 1 && attrLines.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>هنوز ویژگی‌ای اضافه نشده. با افزودن ویژگی (مثل طعم، رنگ، سایز) واریانت‌ها ایجاد می‌شوند.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-right p-3">نام واریانت</th>
                <th className="text-right p-3">بارکد</th>
                <th className="text-right p-3">موجودی</th>
                <th className="text-right p-3">قیمت</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{v.name}</td>
                  <td className="p-3">
                    {editingBarcode === v.id ? (
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          value={barcodeValue}
                          onChange={(e) => setBarcodeValue(e.target.value)}
                          className="w-32 p-1 border rounded text-xs"
                          placeholder="بارکد"
                          autoFocus
                        />
                        <button onClick={() => handleSaveBarcode(v.id)} className="text-green-600 text-xs font-bold">✓</button>
                        <button onClick={() => setEditingBarcode(null)} className="text-red-500 text-xs">✕</button>
                      </div>
                    ) : (
                      <span
                        className="text-xs text-gray-500 cursor-pointer hover:text-blue-600"
                        onClick={() => { setEditingBarcode(v.id); setBarcodeValue(v.barcode || ''); }}
                      >
                        {v.barcode || '— کلیک برای تنظیم —'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-bold">{toPersianDigits(Math.round(v.qty_available))}</td>
                  <td className="p-3">{formatPrice(v.list_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Attribute Modal */}
      {showAddAttr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold mb-4">افزودن ویژگی به محصول</h3>

            <div className="space-y-4">
              {/* Select or create attribute */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">ویژگی (مثل طعم، رنگ، سایز)</label>
                <div className="flex gap-2">
                  <select
                    value={selectedAttr}
                    onChange={(e) => handleAttrSelect(Number(e.target.value))}
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    <option value={0}>— انتخاب ویژگی —</option>
                    {attributes.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newAttrName}
                    onChange={(e) => setNewAttrName(e.target.value)}
                    placeholder="ساخت ویژگی جدید (مثلاً: طعم)"
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 focus:outline-none"
                  />
                  <button onClick={handleCreateAttribute} disabled={!newAttrName} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">
                    + ایجاد
                  </button>
                </div>
              </div>

              {/* Select or create values */}
              {selectedAttr > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">مقادیر (چند مورد انتخاب کنید)</label>
                  <div className="flex flex-wrap gap-2 mb-2 max-h-32 overflow-auto">
                    {attrValues.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedValues((prev) =>
                            prev.includes(v.id) ? prev.filter((x) => x !== v.id) : [...prev, v.id]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${selectedValues.includes(v.id) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newValueName}
                      onChange={(e) => setNewValueName(e.target.value)}
                      placeholder="مقدار جدید (مثلاً: هلو)"
                      className="flex-1 p-2 border border-gray-200 rounded-lg text-xs focus:border-indigo-400 focus:outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateValue(); }}
                    />
                    <button onClick={handleCreateValue} disabled={!newValueName} className="px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-40">
                      + افزودن
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddAttribute}
                disabled={saving || !selectedAttr || selectedValues.length === 0}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-40"
              >
                {saving ? 'در حال ذخیره...' : 'ثبت و ایجاد واریانت‌ها'}
              </button>
              <button
                onClick={() => setShowAddAttr(false)}
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
