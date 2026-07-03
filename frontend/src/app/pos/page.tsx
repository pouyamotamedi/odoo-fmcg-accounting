'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { getProducts, createPosOrder, confirmInvoice, getPartners, createCustomerCredit, payWithPaxTerminal } from '@/lib/odoo-api';
import { queueTransaction, replayPendingTransactions, getPendingCount, OfflineTransaction } from '@/stores/offline-store';
import Link from 'next/link';

interface OdooProduct {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  qty_available: number;
}

export default function PosPage() {
  const { items, addItem, updateQuantity, clearCart, total } = useCartStore();
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [customers, setCustomers] = useState<{id:number;name:string}[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<number>(0);
  const [creditNote, setCreditNote] = useState('');
  const [msg, setMsg] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showSplit, setShowSplit] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitCredit, setSplitCredit] = useState('');
  const [splitCustomer, setSplitCustomer] = useState(0);

  // Register Service Worker & online/offline listeners
  useEffect(() => {
    // Register SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      // Listen for sync messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_QUEUE') {
          syncOfflineQueue();
        }
      });
    }

    // Online/Offline detection
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check pending count
    getPendingCount().then(setPendingCount).catch(() => {});

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline queue when back online
  const syncOfflineQueue = useCallback(async () => {
    try {
      const result = await replayPendingTransactions(async (tx: OfflineTransaction) => {
        const lines = tx.lines;
        const invoiceId = await createPosOrder({
          lines,
          payment_method: tx.payment_method,
          partner_id: tx.partner_id,
        });
        await confirmInvoice(invoiceId);
        if (tx.payment_method === 'credit' && tx.partner_id) {
          await createCustomerCredit({
            partner_id: tx.partner_id,
            amount: tx.total,
            note: tx.credit_note,
            invoice_ref: `INV-${invoiceId}`,
          });
        }
      });
      if (result.success > 0) {
        setMsg(`✅ ${toPersianDigits(result.success)} تراکنش آفلاین همگام‌سازی شد`);
        setTimeout(() => setMsg(''), 4000);
      }
      setPendingCount(0);
    } catch {
      // Will retry on next online event
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await getProducts();
        setProducts(data || []);
      } catch { setProducts([]); }
      setLoading(false);
    }
    load();
  }, []);

  const filteredProducts = products.filter(
    (p) => p.name.includes(search) || (p.barcode && p.barcode.includes(search))
  );

  const cartTotal = total();

  async function handlePayment(method: 'cash' | 'card' | 'credit') {
    if (method === 'credit') {
      try {
        const cust = await getPartners('customer');
        setCustomers(cust?.map((c:any) => ({id:c.id, name:c.name})) || []);
      } catch { setCustomers([]); }
      setShowCredit(true);
      return;
    }

    setSubmitting(true);
    try {
      // If offline, queue the transaction
      if (!navigator.onLine) {
        const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
        await queueTransaction({ lines, payment_method: method, total: cartTotal });
        const count = await getPendingCount();
        setPendingCount(count);
        clearCart();
        setMsg('📥 تراکنش ذخیره شد (آفلاین) - پس از اتصال همگام‌سازی می‌شود');
        setTimeout(() => setMsg(''), 4000);
        setSubmitting(false);
        return;
      }

      // For card payments, push the amount to the PAX S800 terminal first.
      if (method === 'card') {
        setMsg('💳 مبلغ به دستگاه کارتخوان ارسال شد، منتظر کشیدن کارت...');
        const pax = await payWithPaxTerminal(cartTotal, 'sale');
        if (!pax?.success) {
          setMsg('');
          alert(pax?.error || 'تراکنش کارتخوان ناموفق بود');
          setSubmitting(false);
          return;
        }
      }
      const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
      const invoiceId = await createPosOrder({ lines, payment_method: method });
      await confirmInvoice(invoiceId);
      clearCart();
      setMsg('✅ فاکتور ثبت شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e:any) {
      // If network error, queue offline
      if (!navigator.onLine || e.message?.includes('fetch')) {
        const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
        await queueTransaction({ lines, payment_method: method, total: cartTotal });
        const count = await getPendingCount();
        setPendingCount(count);
        clearCart();
        setMsg('📥 تراکنش ذخیره شد (آفلاین)');
        setTimeout(() => setMsg(''), 4000);
      } else {
        alert(e.message || 'خطا در ثبت فاکتور');
      }
    }
    setSubmitting(false);
  }

  async function handleCreditSale() {
    if (!selectedCustomer) { alert('مشتری را انتخاب کنید'); return; }
    setSubmitting(true);
    try {
      // If offline, queue
      if (!navigator.onLine) {
        const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
        await queueTransaction({
          lines,
          payment_method: 'credit',
          partner_id: selectedCustomer,
          credit_note: creditNote || undefined,
          total: cartTotal,
        });
        const count = await getPendingCount();
        setPendingCount(count);
        clearCart();
        setShowCredit(false);
        setMsg('📥 فروش اعتباری ذخیره شد (آفلاین)');
        setTimeout(() => setMsg(''), 4000);
        setSubmitting(false);
        return;
      }

      const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
      const invoiceId = await createPosOrder({ lines, payment_method: 'credit', partner_id: selectedCustomer });
      await confirmInvoice(invoiceId);
      await createCustomerCredit({ partner_id: selectedCustomer, amount: cartTotal, note: creditNote || undefined, invoice_ref: `INV-${invoiceId}` });
      clearCart();
      setShowCredit(false);
      setMsg('✅ فروش اعتباری ثبت شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e:any) {
      alert(e.message || 'خطا');
    }
    setSubmitting(false);
  }

  async function handleSplitPayment() {
    const cashAmt = Number(splitCash) || 0;
    const cardAmt = Number(splitCard) || 0;
    const creditAmt = Number(splitCredit) || 0;
    const totalSplit = cashAmt + cardAmt + creditAmt;

    if (totalSplit !== cartTotal) {
      alert(`مجموع مبالغ (${formatPrice(totalSplit)}) با جمع فاکتور (${formatPrice(cartTotal)}) برابر نیست`);
      return;
    }
    if (creditAmt > 0 && !splitCustomer) {
      alert('برای بخش اعتباری، انتخاب مشتری الزامی است');
      return;
    }

    setSubmitting(true);
    try {
      // Load customers if credit amount > 0 and not loaded
      if (creditAmt > 0 && customers.length === 0) {
        const cust = await getPartners('customer');
        setCustomers(cust?.map((c:any) => ({id:c.id, name:c.name})) || []);
      }

      const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
      const partnerId = creditAmt > 0 ? splitCustomer : undefined;
      const invoiceId = await createPosOrder({ lines, payment_method: 'cash', partner_id: partnerId });
      await confirmInvoice(invoiceId);

      // Record credit portion if applicable
      if (creditAmt > 0 && splitCustomer) {
        await createCustomerCredit({ partner_id: splitCustomer, amount: creditAmt, note: `پرداخت ترکیبی - بخش اعتباری`, invoice_ref: `INV-${invoiceId}` });
      }

      clearCart();
      setShowSplit(false);
      setSplitCash(''); setSplitCard(''); setSplitCredit(''); setSplitCustomer(0);
      setMsg('✅ پرداخت ترکیبی ثبت شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e:any) {
      alert(e.message || 'خطا در ثبت');
    }
    setSubmitting(false);
  }

  return (
    <div className="flex h-screen">
      {/* Products Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <header className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
          <span className="text-lg font-bold">🏪 صندوق فروش</span>
          <div className="flex items-center gap-4">
            {msg && <span className="text-xs bg-green-500 px-2 py-1 rounded">{msg}</span>}
            {pendingCount > 0 && (
              <span className="text-xs bg-yellow-500 px-2 py-1 rounded">
                📥 {toPersianDigits(pendingCount)} در صف
              </span>
            )}
            <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {isOnline ? '🟢 آنلاین' : '🔴 آفلاین'}
            </span>
            <Link href="/admin" className="text-xs text-slate-400 hover:text-white">
              بازگشت به پنل ←
            </Link>
          </div>
        </header>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-800">
            ⚠️ اتصال اینترنت قطع است — تراکنش‌ها ذخیره و پس از اتصال ارسال می‌شوند
          </div>
        )}

        {/* Search */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <input
            type="text"
            placeholder="🔍 جستجو یا اسکن بارکد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">در حال بارگذاری محصولات...</div>
          ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addItem({ id: product.id, name: product.name, price: product.list_price })}
                className="bg-white rounded-xl p-4 text-center border-2 border-transparent hover:border-indigo-400 hover:scale-[1.02] transition-all shadow-sm"
              >
                <div className="text-sm font-medium text-gray-800">{product.name}</div>
                <div className="text-sm text-green-600 font-bold mt-2">
                  {formatPrice(product.list_price)}
                </div>
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-80 bg-white flex flex-col border-r border-gray-200 shadow-lg">
        {/* Cart Header */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <strong className="text-sm">🧾 فاکتور فروش</strong>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="float-left text-xs text-red-500 hover:text-red-700"
            >
              پاک کردن
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-auto p-3">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-10">
              محصولی انتخاب نشده
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center py-3 border-b border-gray-100"
              >
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="text-sm">{toPersianDigits(item.quantity)}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {formatPrice(item.price * item.quantity)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="p-4 border-t-2 border-gray-200">
          <div className="flex justify-between text-lg font-bold text-slate-800">
            <span>جمع کل:</span>
            <span>{formatPrice(cartTotal)} تومان</span>
          </div>
        </div>

        {/* Payment Buttons */}
        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            onClick={() => handlePayment('cash')}
            disabled={items.length === 0 || submitting}
            className="py-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition"
          >
            💵 نقد
          </button>
          <button
            onClick={() => handlePayment('card')}
            disabled={items.length === 0 || submitting || !isOnline}
            className="py-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition"
          >
            💳 کارت
          </button>
          <button
            onClick={() => handlePayment('credit')}
            disabled={items.length === 0 || submitting}
            className="py-3 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 transition"
          >
            🤝 اعتباری
          </button>
          <button
            onClick={async () => {
              try { const cust = await getPartners('customer'); setCustomers(cust?.map((c:any) => ({id:c.id, name:c.name})) || []); } catch {}
              setSplitCash(''); setSplitCard(''); setSplitCredit(''); setSplitCustomer(0);
              setShowSplit(true);
            }}
            disabled={items.length === 0 || submitting}
            className="py-3 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 disabled:opacity-40 transition"
          >
            🔀 ترکیبی
          </button>
        </div>
      </div>

      {/* Credit Sale Dialog */}
      {showCredit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🤝 فروش اعتباری (نسیه)</h3>
            <div className="mb-3 text-sm text-gray-600">مبلغ: <b>{formatPrice(cartTotal)} تومان</b></div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">انتخاب مشتری *</label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(Number(e.target.value))}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-amber-400 focus:outline-none"
                >
                  <option value={0}>— انتخاب کنید —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">یادداشت</label>
                <textarea
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  rows={2}
                  placeholder="اختیاری..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-amber-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCreditSale}
                disabled={submitting}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
              >
                {submitting ? 'در حال ثبت...' : 'ثبت فروش نسیه'}
              </button>
              <button
                onClick={() => setShowCredit(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Payment Dialog */}
      {showSplit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🔀 پرداخت ترکیبی</h3>
            <div className="mb-3 text-sm text-gray-600">جمع کل: <b>{formatPrice(cartTotal)} تومان</b></div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">💵 مبلغ نقدی</label>
                <input type="number" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">💳 مبلغ کارت</label>
                <input type="number" value={splitCard} onChange={(e) => setSplitCard(e.target.value)} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🤝 مبلغ اعتباری (نسیه)</label>
                <input type="number" value={splitCredit} onChange={(e) => setSplitCredit(e.target.value)} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              {Number(splitCredit) > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">مشتری (برای بخش اعتباری) *</label>
                  <select value={splitCustomer} onChange={(e) => setSplitCustomer(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                    <option value={0}>— انتخاب —</option>
                    {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
              )}
              <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-500">
                مجموع وارد شده: {formatPrice((Number(splitCash) || 0) + (Number(splitCard) || 0) + (Number(splitCredit) || 0))} از {formatPrice(cartTotal)}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSplitPayment}
                disabled={submitting}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
              >
                {submitting ? 'در حال ثبت...' : 'ثبت پرداخت ترکیبی'}
              </button>
              <button onClick={() => setShowSplit(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
