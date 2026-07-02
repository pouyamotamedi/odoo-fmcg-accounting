'use client';

import { useState, useEffect } from 'react';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { getProducts, getPartners, createPurchaseInvoice, createProduct, getPurchaseInvoices } from '@/lib/odoo-api';

interface PurchaseItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface OdooProduct {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  standard_price: number;
}

export default function PurchasePage() {
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [suppliers, setSuppliers] = useState<{id:number;name:string}[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductSellPrice, setNewProductSellPrice] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [histFilter, setHistFilter] = useState<'all' | 'draft' | 'posted' | 'paid'>('all');
  const [showHistory, setShowHistory] = useState(false);

  async function loadData() {
    try {
      const [prods, sups] = await Promise.all([getProducts(), getPartners('supplier')]);
      setProducts(prods || []);
      setSuppliers(sups?.map((s:any) => ({ id: s.id, name: s.name })) || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadHistory(state?: string) {
    try {
      const data = await getPurchaseInvoices(state === 'all' ? undefined : state);
      setHistory(data || []);
    } catch { setHistory([]); }
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (showHistory) loadHistory(histFilter); }, [showHistory, histFilter]);

  const filteredProducts = products.filter(
    (p) => p.name.includes(search) || (p.barcode && p.barcode.includes(search))
  );

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addItem(product: { id: number; name: string; price: number }) {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function updateQuantity(id: number, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item)));
    }
  }

  async function handleConfirm(paymentMethod: 'cash' | 'bank' | 'credit') {
    if (!supplier) { alert('تامین‌کننده را انتخاب کنید'); return; }
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      await createPurchaseInvoice({
        partner_id: supplier,
        lines: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
        payment_method: paymentMethod,
      });
      setItems([]);
      setSupplier(0);
      setMsg('✅ فاکتور خرید ثبت شد و موجودی افزایش یافت');
      setTimeout(() => setMsg(''), 4000);
    } catch (e:any) {
      alert(e.message || 'خطا در ثبت فاکتور خرید');
    }
    setSubmitting(false);
  }

  async function handleAddNewProduct() {
    if (!newProductName || !newProductPrice) {
      alert('نام و قیمت خرید الزامی است');
      return;
    }
    setSubmitting(true);
    try {
      await createProduct({
        name: newProductName,
        barcode: newProductBarcode || undefined,
        standard_price: parseFloat(newProductPrice.replace(/[^\d.]/g, '')) || 0,
        list_price: parseFloat(newProductSellPrice.replace(/[^\d.]/g, '')) || 0,
      });
      setShowNewProduct(false);
      setNewProductName('');
      setNewProductBarcode('');
      setNewProductPrice('');
      setNewProductSellPrice('');
      await loadData();
    } catch (e:any) {
      alert(e.message || 'خطا در ثبت کالا');
    }
    setSubmitting(false);
  }

  return (
    <div className="flex h-[calc(100vh-48px)] -m-6">
      {/* Products Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <header className="bg-orange-600 text-white px-4 py-3 flex justify-between items-center">
          <span className="text-lg font-bold">🛒 فاکتور خرید</span>
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs bg-green-500 px-2 py-1 rounded">{msg}</span>}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition"
            >
              {showHistory ? '← فاکتور جدید' : '📋 سابقه'}
            </button>
            <button
              onClick={() => setShowNewProduct(true)}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition"
            >
              + کالای جدید
            </button>
          </div>
        </header>

        {showHistory ? (
          /* Purchase History View */
          <div className="flex-1 overflow-auto p-4">
            <div className="flex gap-2 mb-4">
              {(['all', 'draft', 'posted', 'paid'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHistFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${histFilter === f ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {f === 'all' ? 'همه' : f === 'draft' ? 'پیش‌نویس' : f === 'posted' ? 'تأیید شده' : 'پرداخت شده'}
                </button>
              ))}
            </div>
            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-400">فاکتوری یافت نشد</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-right p-3 font-medium text-gray-600">شماره</th>
                      <th className="text-right p-3 font-medium text-gray-600">تامین‌کننده</th>
                      <th className="text-right p-3 font-medium text-gray-600">مبلغ</th>
                      <th className="text-right p-3 font-medium text-gray-600">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((inv: any) => (
                      <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="p-3">{inv.name || '—'}</td>
                        <td className="p-3">{inv.partner_id ? inv.partner_id[1] : '—'}</td>
                        <td className="p-3 font-bold">{formatPrice(inv.amount_total || 0)}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${inv.payment_state === 'paid' ? 'bg-green-100 text-green-700' : inv.state === 'posted' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {inv.payment_state === 'paid' ? 'پرداخت شده' : inv.state === 'posted' ? 'تأیید شده' : 'پیش‌نویس'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <>
        {/* Supplier */}
        <div className="p-3 bg-white border-b border-gray-200">
          <select
            value={supplier}
            onChange={(e) => setSupplier(Number(e.target.value))}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-orange-400 focus:outline-none"
          >
            <option value={0}>👤 انتخاب تامین‌کننده...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <input
            type="text"
            placeholder="🔍 جستجوی کالا یا بارکد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:border-orange-400 focus:outline-none"
          />
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
          ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addItem({ id: product.id, name: product.name, price: product.standard_price })}
                className="bg-white rounded-xl p-4 text-center border-2 border-transparent hover:border-orange-400 hover:scale-[1.02] transition-all shadow-sm"
              >
                <div className="text-sm font-medium text-gray-800">{product.name}</div>
                <div className="text-xs text-orange-600 font-bold mt-2">
                  خرید: {formatPrice(product.standard_price)}
                </div>
              </button>
            ))}
          </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Cart Area */}
      <div className="w-80 bg-white flex flex-col border-r border-gray-200 shadow-lg">
        <div className="p-4 bg-orange-50 border-b border-orange-100">
          <strong className="text-sm">📋 اقلام فاکتور خرید</strong>
          {items.length > 0 && (
            <button
              onClick={() => setItems([])}
              className="float-left text-xs text-red-500 hover:text-red-700"
            >
              پاک کردن
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto p-3">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-10">کالایی انتخاب نشده</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex justify-between items-center py-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-6 h-6 rounded bg-gray-200 text-xs font-bold">-</button>
                    <span className="text-sm">{toPersianDigits(item.quantity)}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-6 h-6 rounded bg-gray-200 text-xs font-bold">+</button>
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-700">{formatPrice(item.price * item.quantity)}</div>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="p-4 border-t-2 border-gray-200">
          <div className="flex justify-between text-lg font-bold text-slate-800">
            <span>جمع کل:</span>
            <span>{formatPrice(total)} تومان</span>
          </div>
        </div>

        {/* Payment Buttons */}
        <div className="p-3 space-y-2">
          <p className="text-xs text-gray-500 mb-1">نحوه پرداخت:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleConfirm('cash')}
              disabled={items.length === 0 || submitting}
              className="py-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition"
            >
              💵 نقد
            </button>
            <button
              onClick={() => handleConfirm('bank')}
              disabled={items.length === 0 || submitting}
              className="py-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition"
            >
              🏦 بانک
            </button>
            <button
              onClick={() => handleConfirm('credit')}
              disabled={items.length === 0 || submitting}
              className="py-3 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 transition"
            >
              📝 نسیه
            </button>
          </div>
        </div>
      </div>

      {/* New Product Popup */}
      {showNewProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">+ ثبت کالای جدید</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام کالا</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="مثلاً: شیر کاله ۱ لیتری"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">بارکد</label>
                <input
                  type="text"
                  value={newProductBarcode}
                  onChange={(e) => setNewProductBarcode(e.target.value)}
                  placeholder="اختیاری"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت خرید</label>
                  <input
                    type="text"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="۲۵,۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت فروش</label>
                  <input
                    type="text"
                    value={newProductSellPrice}
                    onChange={(e) => setNewProductSellPrice(e.target.value)}
                    placeholder="۳۲,۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddNewProduct}
                disabled={submitting}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50"
              >
                {submitting ? 'در حال ثبت...' : 'ثبت کالا'}
              </button>
              <button
                onClick={() => setShowNewProduct(false)}
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
