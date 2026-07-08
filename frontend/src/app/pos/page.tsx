'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { getProducts, createPosOrder, confirmInvoice, getPartners, createCustomerCredit, payWithPaxTerminal, registerInvoicePayment, searchRead, getPurchaseInvoiceLines, getBankCashBalances, createStockDelivery, getDiscountCategories, getProductsWithDiscount, getProductVariants } from '@/lib/odoo-api';
import { queueTransaction, replayPendingTransactions, getPendingCount, OfflineTransaction } from '@/stores/offline-store';
import Link from 'next/link';

interface OdooProduct {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  qty_available: number;
  image_512?: string | false;
  display_name?: string;
  product_tmpl_id?: [number, string] | number;
}

export default function PosPage() {
  const { items, addItem, updateQuantity, clearCart, total, updateAllPrices } = useCartStore();
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
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [expandedSale, setExpandedSale] = useState<number | null>(null);
  const [saleLines, setSaleLines] = useState<any[]>([]);
  const [posJournals, setPosJournals] = useState<{id:number;name:string;type:string}[]>([]);
  const [discountCategories, setDiscountCategories] = useState<{id:number;name:string}[]>([]);
  const [activeDiscount, setActiveDiscount] = useState<number>(0);
  const [discountPrices, setDiscountPrices] = useState<Map<number, number>>(new Map());
  const [variantPopup, setVariantPopup] = useState<{tmplId:number; name:string; variants:any[]} | null>(null);
  // Pin feature
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  // Multi-card payment
  const [showMultiCard, setShowMultiCard] = useState(false);
  const [cardPayments, setCardPayments] = useState<{amount: string; paid: boolean}[]>([{amount: '', paid: false}]);

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
        if (tx.payment_method !== 'credit') {
          const cashJ = posJournals.find(j => j.type === 'cash');
          const bankJ = posJournals.find(j => j.type === 'bank');
          const jId = tx.payment_method === 'card' ? bankJ?.id : cashJ?.id;
          if (jId) await registerInvoicePayment(invoiceId, jId, tx.total);
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
        const [data, jrnls, discCats] = await Promise.all([getProducts(), getBankCashBalances(), getDiscountCategories()]);
        setProducts(data || []);
        setPosJournals(jrnls?.map((j:any) => ({ id: j.id, name: j.name, type: j.type })) || []);
        setDiscountCategories(discCats?.map((c:any) => ({ id: c.id, name: c.name })) || []);
      } catch { setProducts([]); }
      setLoading(false);
      // Load pinned products from localStorage
      try {
        const saved = localStorage.getItem('pos_pinned_products');
        if (saved) setPinnedIds(new Set(JSON.parse(saved)));
      } catch {}
    }
    load();
  }, []);

  // Load discount prices when discount category changes
  async function handleDiscountChange(catId: number) {
    setActiveDiscount(catId);
    if (catId === 0) {
      setDiscountPrices(new Map());
      // Reset cart prices to original list_price
      const priceMap = new Map<number, number>();
      for (const item of items) {
        const prod = products.find(p => p.id === item.id);
        if (prod) priceMap.set(item.id, prod.list_price);
      }
      updateAllPrices(priceMap);
      return;
    }
    try {
      const prods = await getProductsWithDiscount(catId);
      const priceMap = new Map<number, number>();
      for (const p of (prods || [])) {
        priceMap.set(p.id, p.discount_price);
      }
      setDiscountPrices(priceMap);
      // Update existing cart items with new prices
      updateAllPrices(priceMap);
    } catch { setDiscountPrices(new Map()); }
  }

  // Get effective price for a product (considering active discount)
  function getEffectivePrice(product: OdooProduct): number {
    if (activeDiscount && discountPrices.has(product.id)) {
      return discountPrices.get(product.id)!;
    }
    return product.list_price;
  }

  function togglePin(productId: number) {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      localStorage.setItem('pos_pinned_products', JSON.stringify([...next]));
      return next;
    });
  }

  const filteredProducts = products.filter(
    (p) => {
      if (!search) return true;
      if (p.name.includes(search)) return true;
      if (p.barcode) {
        const barcodes = String(p.barcode).split(',').map(b => b.trim());
        if (barcodes.some(b => b.includes(search))) return true;
      }
      return false;
    }
  );

  // Group products by template for display (show templates, not individual variants)
  const displayProducts = (() => {
    const tmplMap = new Map<number, OdooProduct & {variantCount: number}>();
    for (const p of filteredProducts) {
      const tmplId = (p as any).product_tmpl_id?.[0] || (p as any).product_tmpl_id || p.id;
      if (!tmplMap.has(tmplId)) {
        tmplMap.set(tmplId, { ...p, variantCount: 0 });
      }
      tmplMap.get(tmplId)!.variantCount++;
    }
    return Array.from(tmplMap.values());
  })();

  // Sort: pinned first
  const sortedDisplayProducts = [...displayProducts].sort((a, b) => {
    const aPin = pinnedIds.has(a.id) ? 0 : 1;
    const bPin = pinnedIds.has(b.id) ? 0 : 1;
    return aPin - bPin;
  });

  // If searching by barcode, check for exact barcode match -> add directly
  useEffect(() => {
    if (search.length >= 6) {
      // Support comma-separated barcodes
      const match = products.find((p) => {
        if (!p.barcode) return false;
        const barcodes = String(p.barcode).split(',').map(b => b.trim());
        return barcodes.includes(search.trim());
      });
      if (match) {
        addItem({ id: match.id, name: match.display_name || match.name, price: getEffectivePrice(match) });
        setSearch('');
      }
    }
  }, [search]);

  async function handleProductClick(product: OdooProduct & {variantCount?: number}) {
    const tmplId = (product as any).product_tmpl_id?.[0] || (product as any).product_tmpl_id;
    if (product.variantCount && product.variantCount > 1 && tmplId) {
      // Has variants - show popup
      const vars = await getProductVariants(tmplId);
      if (vars && vars.length > 1) {
        setVariantPopup({ tmplId, name: product.name, variants: vars });
        return;
      }
    }
    // Single variant or no variants - add directly
    addItem({ id: product.id, name: product.name, price: getEffectivePrice(product) });
  }

  function selectVariant(variant: any) {
    const price = activeDiscount && discountPrices.has(variant.id) ? discountPrices.get(variant.id)! : variant.list_price;
    // Extract short name for display
    const tmplName = variantPopup?.name || '';
    const shortName = variant.display_name || variant.name;
    addItem({ id: variant.id, name: shortName, price });
    setVariantPopup(null);
  }

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
      // Register payment - get journal from settings or fallback to first found
      let journalId: number | undefined;
      try {
        const saved = localStorage.getItem('pos_journal_settings');
        if (saved) {
          const s = JSON.parse(saved);
          journalId = method === 'card' ? s.card : s.cash;
        }
      } catch {}
      if (!journalId) {
        const cashJournal = posJournals.find(j => j.type === 'cash');
        const bankJournal = posJournals.find(j => j.type === 'bank');
        journalId = method === 'card' ? bankJournal?.id : cashJournal?.id;
      }
      if (journalId) {
        await registerInvoicePayment(invoiceId, journalId, cartTotal);
      }
      // Create stock delivery to reduce inventory
      try {
        await createStockDelivery(lines);
      } catch { /* best effort */ }
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
      // فاکتور فروش تأیید شده خودش receivable ایجاد میکنه - نیازی به ثبت جداگانه نیست
      // Create stock delivery to reduce inventory
      try {
        await createStockDelivery(lines.map(l => ({ product_id: l.product_id, qty: l.qty })));
      } catch { /* best effort */ }
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

      // If card amount > 0, send to PAX terminal first
      if (cardAmt > 0) {
        setMsg('💳 مبلغ کارت به دستگاه کارتخوان ارسال شد...');
        const pax = await payWithPaxTerminal(cardAmt, 'sale');
        if (!pax?.success) {
          setMsg('');
          alert(pax?.error || 'تراکنش کارتخوان ناموفق بود');
          setSubmitting(false);
          return;
        }
      }

      const invoiceId = await createPosOrder({ lines, payment_method: 'cash', partner_id: partnerId });
      await confirmInvoice(invoiceId);

      // Only register payment for cash/card portions
      if (cashAmt > 0 || cardAmt > 0) {
        const cashJournal = posJournals.find(j => j.type === 'cash');
        const bankJournal = posJournals.find(j => j.type === 'bank');
        if (cashAmt > 0 && cashJournal) {
          await registerInvoicePayment(invoiceId, cashJournal.id, cashAmt);
        }
        if (cardAmt > 0 && bankJournal) {
          await registerInvoicePayment(invoiceId, bankJournal.id, cardAmt);
        }
      }
      // Create stock delivery to reduce inventory
      try {
        await createStockDelivery(lines.map(l => ({ product_id: l.product_id, qty: l.qty })));
      } catch { /* best effort */ }

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
            <button onClick={async () => {
              try { const d = await searchRead('account.move', [['move_type','=','out_invoice'],['state','=','posted']], ['name','partner_id','amount_total','invoice_date','payment_state'], 30, 0, 'create_date desc'); setSalesHistory(d||[]); } catch { setSalesHistory([]); }
              setShowSalesHistory(true);
            }} className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded">📋 سوابق</button>
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
          {/* Discount category selector */}
          {discountCategories.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <button
                onClick={() => handleDiscountChange(0)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${activeDiscount === 0 ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                قیمت عادی
              </button>
              {discountCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleDiscountChange(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${activeDiscount === cat.id ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                >
                  🏷️ {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">در حال بارگذاری محصولات...</div>
          ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedDisplayProducts.map((product) => (
              <div key={product.id} className="relative">
                <button
                  onClick={() => handleProductClick(product)}
                  className={`group relative rounded-xl overflow-hidden border-2 ${pinnedIds.has(product.id) ? 'border-yellow-400' : 'border-transparent'} hover:border-indigo-400 hover:scale-[1.02] transition-all shadow-sm aspect-square w-full`}
                >
                  {product.image_512 ? (
                    <img src={`data:image/png;base64,${product.image_512}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <span className="text-3xl opacity-30">📦</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-all flex flex-col items-center justify-center p-2">
                    <div className="text-white text-xs font-bold text-center group-hover:opacity-0 transition-opacity leading-tight">{product.name}</div>
                    {(product as any).variantCount > 1 && (
                      <div className="text-purple-200 text-[10px] mt-1 group-hover:opacity-0 transition-opacity">{toPersianDigits((product as any).variantCount)} نوع</div>
                    )}
                    <div className="text-white text-xs font-bold mt-1 bg-green-600/80 px-2 py-0.5 rounded group-hover:opacity-0 transition-opacity">
                      {formatPrice(getEffectivePrice(product))}
                    </div>
                    {activeDiscount && discountPrices.has(product.id) && (
                      <span className="text-[10px] text-gray-300 line-through group-hover:opacity-0 transition-opacity">{formatPrice(product.list_price)}</span>
                    )}
                  </div>
                </button>
                {/* Pin button */}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(product.id); }}
                  className={`absolute top-1 right-1 text-xs z-10 w-5 h-5 rounded-full flex items-center justify-center ${pinnedIds.has(product.id) ? 'bg-yellow-400 text-yellow-900' : 'bg-black/30 text-white/60 hover:text-white'}`}
                >📌</button>
              </div>
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
            onClick={() => { setCardPayments([{amount: String(cartTotal), paid: false}]); setShowMultiCard(true); }}
            disabled={items.length === 0 || submitting || !isOnline}
            className="py-3 bg-blue-400 text-white rounded-lg text-xs font-bold hover:bg-blue-500 disabled:opacity-40 transition"
          >
            💳💳 چند کارت
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
                <input type="text" value={splitCash ? Number(splitCash).toLocaleString() : ''} onChange={(e) => setSplitCash(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">💳 مبلغ کارت</label>
                <input type="text" value={splitCard ? Number(splitCard).toLocaleString() : ''} onChange={(e) => setSplitCard(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🤝 مبلغ اعتباری (نسیه)</label>
                <input type="text" value={splitCredit ? Number(splitCredit).toLocaleString() : ''} onChange={(e) => setSplitCredit(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
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
      {/* Sales History Modal */}
      {showSalesHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📋 سوابق فاکتورهای فروش</h3>
              <button onClick={() => setShowSalesHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {salesHistory.length === 0 ? <p className="text-center text-gray-400 py-8">فاکتوری یافت نشد</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-right p-2">شماره</th><th className="text-right p-2">مشتری</th><th className="text-right p-2">مبلغ</th><th className="text-right p-2">وضعیت</th><th className="text-right p-2">جزئیات</th>
                </tr></thead>
                <tbody>{salesHistory.map((inv:any) => (<React.Fragment key={inv.id}>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-2">{inv.name}</td>
                    <td className="p-2">{inv.partner_id?inv.partner_id[1]:'—'}</td>
                    <td className="p-2 font-bold">{formatPrice(inv.amount_total)}</td>
                    <td className="p-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${inv.payment_state==='paid'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{inv.payment_state==='paid'?'پرداخت شده':'تأیید شده'}</span></td>
                    <td className="p-2"><button onClick={async()=>{if(expandedSale===inv.id){setExpandedSale(null);setSaleLines([]);return;} try{const l=await getPurchaseInvoiceLines(inv.id);setSaleLines(l||[]);setExpandedSale(inv.id);}catch{setSaleLines([]);}}} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">مشاهده</button></td>
                  </tr>
                  {expandedSale===inv.id&&(<tr key={`d-${inv.id}`}><td colSpan={5} className="p-2 bg-gray-50">
                    {saleLines.length===0?<p className="text-xs text-gray-400">بدون آیتم</p>:(
                      <table className="w-full text-xs"><thead><tr><th className="text-right p-1">کالا</th><th className="text-right p-1">تعداد</th><th className="text-right p-1">قیمت</th><th className="text-right p-1">جمع</th></tr></thead>
                      <tbody>{saleLines.map((l:any)=>(<tr key={l.id}><td className="p-1">{l.product_id?.[1]||l.name}</td><td className="p-1">{l.quantity}</td><td className="p-1">{formatPrice(l.price_unit)}</td><td className="p-1">{formatPrice(l.price_subtotal)}</td></tr>))}</tbody></table>
                    )}
                  </td></tr>)}
                </React.Fragment>))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Multi-Card Payment Popup */}
      {showMultiCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">💳 پرداخت چند کارته</h3>
              <button onClick={() => setShowMultiCard(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="text-sm text-gray-500 mb-3">جمع فاکتور: <b>{formatPrice(cartTotal)}</b></div>
            <div className="space-y-3 mb-4">
              {cardPayments.map((cp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">کارت {toPersianDigits(idx + 1)}:</span>
                  <input
                    type="number"
                    value={cp.amount}
                    onChange={(e) => { const next = [...cardPayments]; next[idx] = {...next[idx], amount: e.target.value}; setCardPayments(next); }}
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="مبلغ"
                    disabled={cp.paid}
                  />
                  {cp.paid ? (
                    <span className="text-green-600 text-xs font-bold">✓ پرداخت شد</span>
                  ) : (
                    <button
                      onClick={async () => {
                        const amt = Number(cp.amount);
                        if (!amt) { alert('مبلغ وارد کنید'); return; }
                        setMsg('💳 ارسال به کارتخوان...');
                        try {
                          const pax = await payWithPaxTerminal(amt, 'sale');
                          if (!pax?.success) { alert(pax?.error || 'ناموفق'); setMsg(''); return; }
                          const next = [...cardPayments]; next[idx] = {...next[idx], paid: true}; setCardPayments(next);
                          setMsg(`✅ کارت ${toPersianDigits(idx+1)} پرداخت شد`);
                        } catch (e: any) { alert(e.message || 'خطا'); setMsg(''); }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                    >پرداخت</button>
                  )}
                  {!cp.paid && cardPayments.length > 1 && (
                    <button onClick={() => setCardPayments(cardPayments.filter((_, i) => i !== idx))} className="text-red-400 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setCardPayments([...cardPayments, {amount: '', paid: false}])} className="text-xs text-blue-600 font-bold mb-4">+ افزودن کارت دیگر</button>
            <div className="text-xs text-gray-500 mb-3">
              پرداخت شده: {formatPrice(cardPayments.filter(c=>c.paid).reduce((s,c)=>s+(Number(c.amount)||0),0))} از {formatPrice(cartTotal)}
            </div>
            <button
              onClick={async () => {
                const totalPaid = cardPayments.filter(c=>c.paid).reduce((s,c)=>s+(Number(c.amount)||0),0);
                if (totalPaid < cartTotal) { alert('کل مبلغ هنوز پرداخت نشده'); return; }
                // All cards paid - create invoice
                setSubmitting(true);
                try {
                  const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
                  const invoiceId = await createPosOrder({ lines, payment_method: 'card' });
                  await confirmInvoice(invoiceId);
                  const bankJournal = posJournals.find(j => j.type === 'bank');
                  if (bankJournal) await registerInvoicePayment(invoiceId, bankJournal.id, cartTotal);
                  try { await createStockDelivery(lines); } catch {}
                  clearCart(); setShowMultiCard(false); setMsg('✅ فاکتور ثبت شد');
                  setTimeout(() => setMsg(''), 3000);
                } catch (e: any) { alert(e.message || 'خطا'); }
                setSubmitting(false);
              }}
              disabled={submitting || cardPayments.some(c => !c.paid)}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-40"
            >
              {submitting ? 'ثبت...' : '✓ ثبت فاکتور'}
            </button>
          </div>
        </div>
      )}

      {/* Variant Selection Popup */}
      {variantPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{variantPopup.name}</h3>
              <button onClick={() => setVariantPopup(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">کدام نوع را انتخاب می‌کنید؟</p>
            <div className="space-y-2 max-h-60 overflow-auto">
              {variantPopup.variants.map((v: any) => {
                const tmplName = variantPopup.name;
                const displayLabel = (v.display_name || v.name);
                const shortLabel = displayLabel.startsWith(tmplName) && displayLabel.length > tmplName.length
                  ? displayLabel.slice(tmplName.length).replace(/^\s*[\(\[,]\s*/, '').replace(/[\)\]]\s*$/, '')
                  : displayLabel;
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVariant(v)}
                    className="w-full text-right p-3 bg-gray-50 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 border border-gray-200 transition"
                  >
                    <div className="font-medium text-sm">{shortLabel || displayLabel}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      موجودی: {toPersianDigits(Math.round(v.qty_available))} | {v.barcode || 'بدون بارکد'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
