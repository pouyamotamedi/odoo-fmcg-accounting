'use client';

import { useState, useEffect } from 'react';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { getProducts, getPartners, createPurchaseInvoice, createProduct, getPurchaseInvoices, getPurchaseInvoiceLines, deletePurchaseInvoice, createStockReceipt, getCategories, updateProduct, getBankCashBalances, registerInvoicePayment } from '@/lib/odoo-api';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import PriceInput from '@/components/PriceInput';

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
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSplit, setShowSplit] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [splitCredit, setSplitCredit] = useState('');
  const [splitCashJournal, setSplitCashJournal] = useState<number>(0);
  const [splitBankJournal, setSplitBankJournal] = useState<number>(0);
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<any[]>([]);
  const [categories, setCategories] = useState<{id:number;name:string}[]>([]);
  const [newProductCategory, setNewProductCategory] = useState<number>(0);
  const [editingProduct, setEditingProduct] = useState<OdooProduct | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editSellPrice, setEditSellPrice] = useState('');
  const [journals, setJournals] = useState<{id:number;name:string;type:string}[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentJournal, setPaymentJournal] = useState<number>(0);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<number>(0);

  async function loadData() {
    try {
      const [prods, sups, cats, jrnls] = await Promise.all([getProducts(), getPartners('supplier'), getCategories(), getBankCashBalances()]);
      setProducts(prods || []);
      setSuppliers(sups?.map((s:any) => ({ id: s.id, name: s.name })) || []);
      setCategories(cats?.map((c:any) => ({ id: c.id, name: c.name })) || []);
      setJournals(jrnls?.map((j:any) => ({ id: j.id, name: j.name, type: j.type })) || []);
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

  // Normalize Persian digits to Latin for barcode comparison
  function normalizePersian(str: string): string {
    return str.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  const filteredProducts = products.filter((p) => {
    const normalizedSearch = normalizePersian(search);
    const nameMatch = p.name.includes(search) || p.name.includes(normalizedSearch);
    const barcodeMatch = p.barcode && (
      p.barcode.includes(search) || p.barcode.includes(normalizedSearch) ||
      normalizePersian(p.barcode).includes(normalizedSearch)
    );
    return nameMatch || barcodeMatch;
  });

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

    if (paymentMethod === 'credit') {
      // نسیه - فقط فاکتور ثبت شود بدون پرداخت
      setSubmitting(true);
      try {
        const invoiceId = await createPurchaseInvoice({
          partner_id: supplier,
          lines: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
          date: invoiceDate,
        });
        setItems([]);
        setSupplier(0);
        setMsg('✅ فاکتور خرید (نسیه) ثبت شد');
        setTimeout(() => setMsg(''), 4000);
        if (confirm('آیا سند ورود به انبار هم ثبت شود؟')) {
          try { await createStockReceipt(invoiceId); } catch {}
        }
      } catch (e:any) { alert(e.message || 'خطا'); }
      setSubmitting(false);
      return;
    }

    // نقد یا بانک - باید journal انتخاب بشه
    const relevantJournals = journals.filter(j => paymentMethod === 'cash' ? j.type === 'cash' : j.type === 'bank');
    if (relevantJournals.length === 1) {
      // فقط یک journal هست، مستقیم استفاده میکنیم
      setSubmitting(true);
      try {
        const invoiceId = await createPurchaseInvoice({
          partner_id: supplier,
          lines: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
          date: invoiceDate,
        });
        await registerInvoicePayment(invoiceId, relevantJournals[0].id, total);
        setItems([]);
        setSupplier(0);
        setMsg('✅ فاکتور خرید ثبت و پرداخت شد');
        setTimeout(() => setMsg(''), 4000);
        if (confirm('آیا سند ورود به انبار هم ثبت شود؟')) {
          try { await createStockReceipt(invoiceId); } catch {}
        }
      } catch (e:any) { alert(e.message || 'خطا'); }
      setSubmitting(false);
    } else {
      // چند journal هست - popup نمایش بده
      setPaymentJournal(relevantJournals[0]?.id || 0);
      setShowPayment(true);
    }
  }

  async function handlePaymentConfirm() {
    if (!paymentJournal) { alert('حساب پرداخت را انتخاب کنید'); return; }
    setSubmitting(true);
    try {
      const invoiceId = await createPurchaseInvoice({
        partner_id: supplier,
        lines: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
        date: invoiceDate,
      });
      await registerInvoicePayment(invoiceId, paymentJournal, total);
      setItems([]);
      setSupplier(0);
      setShowPayment(false);
      setMsg('✅ فاکتور خرید ثبت و پرداخت شد');
      setTimeout(() => setMsg(''), 4000);
      if (confirm('آیا سند ورود به انبار هم ثبت شود؟')) {
        try { await createStockReceipt(invoiceId); } catch {}
      }
    } catch (e:any) { alert(e.message || 'خطا'); }
    setSubmitting(false);
  }

  async function handleSplitPayment() {
    if (!supplier) { alert('تامین‌کننده را انتخاب کنید'); return; }
    if (items.length === 0) return;
    const cashAmt = Number(splitCash) || 0;
    const bankAmt = Number(splitBank) || 0;
    const creditAmt = Number(splitCredit) || 0;
    const totalSplit = cashAmt + bankAmt + creditAmt;
    if (totalSplit !== total) {
      alert(`مجموع مبالغ (${formatPrice(totalSplit)}) با جمع فاکتور (${formatPrice(total)}) برابر نیست`);
      return;
    }
    if (cashAmt > 0 && !splitCashJournal) { alert('صندوق نقدی را انتخاب کنید'); return; }
    if (bankAmt > 0 && !splitBankJournal) { alert('حساب بانکی را انتخاب کنید'); return; }
    setSubmitting(true);
    try {
      const invoiceId = await createPurchaseInvoice({
        partner_id: supplier,
        lines: items.map(i => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
        date: invoiceDate,
      });
      // Register partial payments with correct amounts
      if (cashAmt > 0) {
        await registerInvoicePayment(invoiceId, splitCashJournal, cashAmt);
      }
      if (bankAmt > 0) {
        await registerInvoicePayment(invoiceId, splitBankJournal, bankAmt);
      }
      // creditAmt remains as residual (نسیه)
      setItems([]);
      setSupplier(0);
      setShowSplit(false);
      setMsg('✅ فاکتور با پرداخت ترکیبی ثبت شد');
      setTimeout(() => setMsg(''), 4000);
      if (confirm('آیا سند ورود به انبار هم ثبت شود؟')) {
        try { await createStockReceipt(invoiceId); } catch {}
      }
    } catch (e: any) {
      alert(e.message || 'خطا');
    }
    setSubmitting(false);
  }

  async function handleExpandInvoice(invoiceId: number) {
    if (expandedInvoice === invoiceId) {
      setExpandedInvoice(null);
      setInvoiceLines([]);
      return;
    }
    try {
      const lines = await getPurchaseInvoiceLines(invoiceId);
      setInvoiceLines(lines || []);
      setExpandedInvoice(invoiceId);
    } catch { setInvoiceLines([]); }
  }

  async function handleDeleteInvoice(invoiceId: number) {
    if (!confirm('آیا از حذف این فاکتور و اسناد مرتبط مطمئنید؟')) return;
    try {
      await deletePurchaseInvoice(invoiceId);
      await loadHistory(histFilter);
      setMsg('✅ فاکتور حذف شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      alert(e.message || 'خطا در حذف');
    }
  }

  async function handleStockReceipt(invoiceId: number) {
    try {
      await createStockReceipt(invoiceId);
      setMsg('✅ ورود به انبار ثبت شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت ورود انبار');
    }
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
                      <th className="text-right p-3 font-medium text-gray-600">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((inv: any) => (
                      <>
                      <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="p-3">{inv.name || '—'}</td>
                        <td className="p-3">{inv.partner_id ? inv.partner_id[1] : '—'}</td>
                        <td className="p-3 font-bold">{formatPrice(inv.amount_total || 0)}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${inv.payment_state === 'paid' ? 'bg-green-100 text-green-700' : inv.state === 'posted' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {inv.payment_state === 'paid' ? 'پرداخت شده' : inv.state === 'posted' ? 'تأیید شده' : 'پیش‌نویس'}
                          </span>
                        </td>
                        <td className="p-3 flex gap-1">
                          <button onClick={() => handleExpandInvoice(inv.id)} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">جزئیات</button>
                          <button onClick={() => handleStockReceipt(inv.id)} className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded">📦 انبار</button>
                          <button onClick={() => handleDeleteInvoice(inv.id)} className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded">🗑️</button>
                        </td>
                      </tr>
                      {expandedInvoice === inv.id && (
                        <tr key={`detail-${inv.id}`}><td colSpan={5} className="p-3 bg-gray-50">
                          <div className="text-xs font-bold mb-2">اقلام فاکتور:</div>
                          {invoiceLines.length === 0 ? <p className="text-xs text-gray-400">بدون آیتم</p> : (
                            <table className="w-full text-xs">
                              <thead><tr><th className="text-right p-1">کالا</th><th className="text-right p-1">تعداد</th><th className="text-right p-1">قیمت واحد</th><th className="text-right p-1">جمع</th></tr></thead>
                              <tbody>{invoiceLines.map((l: any) => (
                                <tr key={l.id}><td className="p-1">{l.product_id?.[1] || l.name}</td><td className="p-1">{l.quantity}</td><td className="p-1">{formatPrice(l.price_unit)}</td><td className="p-1">{formatPrice(l.price_subtotal)}</td></tr>
                              ))}</tbody>
                            </table>
                          )}
                        </td></tr>
                      )}
                      </>
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

        {/* Date picker */}
        <div className="p-3 bg-white border-b border-gray-200">
          <label className="block text-xs text-gray-500 mb-1">📅 تاریخ فاکتور</label>
          <JalaliDatePicker
            value={invoiceDate}
            onChange={(d) => setInvoiceDate(d)}
            placeholder="انتخاب تاریخ"
          />
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
            {filteredProducts.map((product: any) => (
              <div key={product.id} className="bg-white rounded-xl p-4 text-center border-2 border-transparent hover:border-orange-400 transition-all shadow-sm relative">
                <button
                  onClick={() => addItem({ id: product.id, name: product.name, price: product.standard_price })}
                  className="w-full"
                >
                  {product.image_128 && (
                    <img src={`data:image/png;base64,${product.image_128}`} alt="" className="w-10 h-10 mx-auto rounded-lg object-cover mb-1" />
                  )}
                  <div className="text-sm font-medium text-gray-800">{product.name}</div>
                  <div className="text-xs text-orange-600 font-bold mt-2">
                    خرید: {formatPrice(product.standard_price)}
                  </div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingProduct(product); setEditPrice(String(product.standard_price)); setEditSellPrice(String(product.list_price)); }} className="absolute top-1 left-1 text-[10px] text-gray-400 hover:text-indigo-600">✏️</button>
              </div>
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
          <div className="grid grid-cols-2 gap-2">
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
            <button
              onClick={() => { setSplitCash(''); setSplitBank(''); setSplitCredit(''); setShowSplit(true); }}
              disabled={items.length === 0 || submitting}
              className="py-3 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 disabled:opacity-40 transition"
            >
              🔀 ترکیبی
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
                <label className="block text-xs text-gray-500 mb-1">دسته‌بندی</label>
                <select value={newProductCategory} onChange={(e) => setNewProductCategory(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value={0}>— بدون دسته‌بندی —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
                  <PriceInput
                    value={newProductPrice}
                    onChange={(v) => setNewProductPrice(v)}
                    placeholder="۲۵٬۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت فروش</label>
                  <PriceInput
                    value={newProductSellPrice}
                    onChange={(v) => setNewProductSellPrice(v)}
                    placeholder="۳۲٬۰۰۰"
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
      {/* Split Payment Modal */}
      {showSplit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">🔀 پرداخت ترکیبی</h3>
            <div className="mb-3 text-sm text-gray-600">جمع کل: <b>{formatPrice(total)} تومان</b></div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">💵 مبلغ نقدی</label>
                <PriceInput value={splitCash} onChange={(v) => setSplitCash(v)} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                {Number(splitCash) > 0 && (
                  <select value={splitCashJournal} onChange={(e) => setSplitCashJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm mt-1">
                    <option value={0}>— انتخاب صندوق —</option>
                    {journals.filter(j=>j.type==='cash').map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🏦 مبلغ بانکی</label>
                <PriceInput value={splitBank} onChange={(v) => setSplitBank(v)} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                {Number(splitBank) > 0 && (
                  <select value={splitBankJournal} onChange={(e) => setSplitBankJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm mt-1">
                    <option value={0}>— انتخاب حساب بانک —</option>
                    {journals.filter(j=>j.type==='bank').map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">📝 مبلغ نسیه</label>
                <PriceInput value={splitCredit} onChange={(v) => setSplitCredit(v)} placeholder="۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-500">
                مجموع: {formatPrice((Number(splitCash) || 0) + (Number(splitBank) || 0) + (Number(splitCredit) || 0))} از {formatPrice(total)}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSplitPayment} disabled={submitting} className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50">
                {submitting ? 'در حال ثبت...' : 'ثبت ترکیبی'}
              </button>
              <button onClick={() => setShowSplit(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Journal Select Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-sm font-bold mb-3">💳 انتخاب حساب پرداخت</h3>
            <select value={paymentJournal} onChange={(e) => setPaymentJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-3">
              <option value={0}>— انتخاب —</option>
              {journals.map(j=><option key={j.id} value={j.id}>{j.name} ({j.type==='cash'?'نقدی':'بانک'})</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={handlePaymentConfirm} disabled={submitting} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold">
                {submitting ? '...' : 'تأیید پرداخت'}
              </button>
              <button onClick={() => setShowPayment(false)} className="flex-1 py-2 bg-gray-200 rounded-lg text-xs font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Price Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-sm font-bold mb-3">✏️ ویرایش قیمت: {editingProduct.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">قیمت خرید</label>
                <PriceInput value={editPrice} onChange={(v) => setEditPrice(v)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">قیمت فروش</label>
                <PriceInput value={editSellPrice} onChange={(v) => setEditSellPrice(v)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={async () => { try { await updateProduct(editingProduct.id, { standard_price: Number(editPrice)||0, list_price: Number(editSellPrice)||0 }); setEditingProduct(null); await loadData(); setMsg('✅ قیمت بروز شد'); setTimeout(()=>setMsg(''),3000); } catch(e:any){ alert(e.message||'خطا'); }}} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold">ذخیره</button>
              <button onClick={() => setEditingProduct(null)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
