'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import { getProducts, createPosOrder, confirmInvoice, getPartners, createCustomerCredit, payWithPaxTerminal, registerInvoicePayment, getInvoiceResidual, searchRead, getPurchaseInvoiceLines, getBankCashBalances, createStockDelivery, getDiscountCategories, getProductsWithDiscount, getProductVariants, createPartner, editPostedInvoice, cancelRelatedPickings, getCompanySettings, getPosPaymentLabel, getBoostPosPricing, type BoostPosPricing } from '@/lib/odoo-api';
import { queueTransaction, replayPendingTransactions, getPendingCount, OfflineTransaction } from '@/stores/offline-store';
import { useAuthStore } from '@/stores/auth-store';
import { logout as odooLogout } from '@/lib/odoo-api';
import Link from 'next/link';

interface OdooProduct {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
  qty_available: number;
  image_128?: string | false;
  display_name?: string;
  product_tmpl_id?: [number, string] | number;
}

const SALES_HISTORY_LIMIT = 100;
const SALES_HISTORY_FIELDS = [
  'name',
  'partner_id',
  'amount_total',
  'invoice_date',
  'create_date',
  'payment_state',
  'narration',
  'create_uid',
];

interface SalesHistoryInvoice {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  amount_total: number;
  invoice_date: string | false;
  create_date: string | false;
  payment_state: string;
  narration: string | false;
  create_uid: [number, string] | false;
}

async function loadSalesHistory(): Promise<SalesHistoryInvoice[]> {
  const history = await searchRead(
    'account.move',
    [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
    SALES_HISTORY_FIELDS,
    SALES_HISTORY_LIMIT,
    0,
    'create_date desc',
  );
  return (history || []) as SalesHistoryInvoice[];
}

const TOMAN_TOLERANCE = 1;

type CardPaymentRow = { amount: string; paid: boolean; accounted: boolean };
type DirectPaymentMethod = 'cash' | 'card' | 'credit';
type DirectSaleLine = { product_id: number; qty: number; price_unit: number };
type DirectSaleRecovery = {
  method: DirectPaymentMethod;
  partnerId?: number;
  lines: DirectSaleLine[];
  total: number;
  journalId?: number;
  paxRequired: boolean;
  paxStatus: 'not_started' | 'started' | 'paid';
  invoiceCreationStarted: boolean;
  invoiceId: number | null;
  invoicePosted: boolean;
  paymentAccounted: boolean;
};

function directPaymentLabel(method: DirectPaymentMethod): string {
  if (method === 'cash') return 'نقد';
  if (method === 'card') return 'کارت';
  return 'اعتباری';
}

function hasDirectExternalEffect(recovery: DirectSaleRecovery | null): boolean {
  return Boolean(recovery && (
    recovery.paxStatus !== 'not_started' ||
    recovery.invoiceCreationStarted ||
    recovery.invoiceId ||
    recovery.invoicePosted ||
    recovery.paymentAccounted
  ));
}

function canResumeDirectSale(recovery: DirectSaleRecovery | null): boolean {
  return Boolean(
    recovery &&
    recovery.paxStatus !== 'started' &&
    !(recovery.invoiceCreationStarted && !recovery.invoiceId) &&
    (recovery.paxStatus === 'paid' || recovery.invoiceId),
  );
}

function toman(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function amountsMatch(left: number, right: number): boolean {
  return Math.abs(toman(left) - toman(right)) <= TOMAN_TOLERANCE;
}

function formatSaleDateTime(value: string | false | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  });
}

function resolveProductPrice(
  product: OdooProduct,
  discountId: number,
  originalPlanPrices: Map<number, number>,
  snapshot: BoostPosPricing | null,
): number {
  const original = discountId !== 0 && originalPlanPrices.has(product.id)
    ? originalPlanPrices.get(product.id)!
    : product.list_price;
  if (!snapshot) return original;
  const channelPrices = discountId === 0
    ? snapshot.regular_prices
    : snapshot.plan_prices[String(discountId)];
  const resolved = channelPrices?.[String(product.id)];
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : original;
}

export default function PosPage() {
  const { items, addItem, updateQuantity, clearCart, total, updateAllPrices } = useCartStore();
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
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
  const [splitCredit, setSplitCredit] = useState('');
  const [splitCustomer, setSplitCustomer] = useState(0);
  const [splitCardPayments, setSplitCardPayments] = useState<CardPaymentRow[]>([{amount: '', paid: false, accounted: false}]);
  const [splitInvoiceId, setSplitInvoiceId] = useState<number | null>(null);
  const [splitCashAccounted, setSplitCashAccounted] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryInvoice[]>([]);
  const [expandedSale, setExpandedSale] = useState<number | null>(null);
  const [saleLines, setSaleLines] = useState<any[]>([]);
  const [posJournals, setPosJournals] = useState<{id:number;name:string;type:string}[]>([]);
  const [discountCategories, setDiscountCategories] = useState<{id:number;name:string}[]>([]);
  const [activeDiscount, setActiveDiscount] = useState<number>(0);
  const [discountPrices, setDiscountPrices] = useState<Map<number, number>>(new Map());
  const [boostPricing, setBoostPricing] = useState<BoostPosPricing | null>(null);
  const productsRef = useRef<OdooProduct[]>([]);
  const activeDiscountRef = useRef(0);
  const discountPricesRef = useRef<Map<number, number>>(new Map());
  const discountRequestRef = useRef(0);
  const boostPricingRef = useRef<BoostPosPricing | null>(null);
  const boostRequestRef = useRef(0);
  const pendingBoostPricingRef = useRef<BoostPosPricing | null>(null);
  const checkoutPricingFrozenRef = useRef(false);
  const checkoutCommittedRef = useRef(false);
  const paymentModalOpenRef = useRef(false);
  const directRecoveryRef = useRef<DirectSaleRecovery | null>(null);
  const [directRecovery, setDirectRecoveryState] = useState<DirectSaleRecovery | null>(null);
  const [variantPopup, setVariantPopup] = useState<{tmplId:number; name:string; variants:any[]} | null>(null);
  // Variant cache for offline mode
  const [variantCache, setVariantCache] = useState<Map<number, any[]>>(new Map());
  // Pin feature
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  // Multi-card payment
  const [showMultiCard, setShowMultiCard] = useState(false);
  const [cardPayments, setCardPayments] = useState<CardPaymentRow[]>([{amount: '', paid: false, accounted: false}]);
  const [multiCardInvoiceId, setMultiCardInvoiceId] = useState<number | null>(null);
  // Quick add customer
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  // PAX terminal setting
  const [paxTerminalEnabled, setPaxTerminalEnabled] = useState(false);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { activeDiscountRef.current = activeDiscount; }, [activeDiscount]);
  useEffect(() => { discountPricesRef.current = discountPrices; }, [discountPrices]);

  const searchBlocked = showCredit || showSplit || showSalesHistory || showMultiCard ||
    showNewCustomer || Boolean(variantPopup);

  const focusSearchIfSafe = useCallback(() => {
    if (searchBlocked) return;

    const input = searchInputRef.current;
    if (!input) return;

    const active = document.activeElement;
    const activeIsEditable = active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable);

    if (active && active !== document.body && active !== input && activeIsEditable) return;
    input.focus({ preventScroll: true });
  }, [searchBlocked]);

  const rebuildVariantCache = useCallback((data: OdooProduct[]) => {
    const cache = new Map<number, any[]>();
    for (const product of data) {
      const templateId = (product as any).product_tmpl_id?.[0] || (product as any).product_tmpl_id || product.id;
      if (!cache.has(templateId)) cache.set(templateId, []);
      cache.get(templateId)!.push(product);
    }
    setVariantCache(cache);
  }, []);

  const replaceCanonicalProducts = useCallback((incoming: OdooProduct[]) => {
    productsRef.current = incoming;
    setProducts(incoming);
    rebuildVariantCache(incoming);
    return incoming;
  }, [rebuildVariantCache]);

  const mergeCanonicalProducts = useCallback((incoming: OdooProduct[]) => {
    const byId = new Map(productsRef.current.map((product) => [product.id, product]));
    for (const product of incoming) {
      byId.set(product.id, { ...byId.get(product.id), ...product });
    }
    const merged = Array.from(byId.values());
    productsRef.current = merged;
    setProducts(merged);
    rebuildVariantCache(merged);
    return merged;
  }, [rebuildVariantCache]);

  const refreshProducts = useCallback(async () => {
    try {
      replaceCanonicalProducts((await getProducts()) || []);
    } catch {
      // Keep the current POS product cache available if refresh fails.
    }
  }, [replaceCanonicalProducts]);

  const applyLocalStockDelta = useCallback((lines: Array<{ product_id: number; qty: number }>) => {
    const soldByProduct = new Map<number, number>();
    for (const line of lines) {
      soldByProduct.set(line.product_id, (soldByProduct.get(line.product_id) || 0) + line.qty);
    }

    const next = productsRef.current.map((product) => {
      const sold = soldByProduct.get(product.id) || 0;
      return sold ? { ...product, qty_available: Math.max(0, product.qty_available - sold) } : product;
    });
    productsRef.current = next;
    setProducts(next);
    rebuildVariantCache(next);
  }, [rebuildVariantCache]);

  const commitBoostPricing = useCallback((next: BoostPosPricing) => {
    boostPricingRef.current = next;
    setBoostPricing(next);
    const priceMap = new Map<number, number>();
    const productMap = new Map(productsRef.current.map((product) => [product.id, product]));
    for (const item of useCartStore.getState().items) {
      const product = productMap.get(item.id);
      if (product) {
        priceMap.set(item.id, resolveProductPrice(
          product,
          activeDiscountRef.current,
          discountPricesRef.current,
          next,
        ));
      }
    }
    updateAllPrices(priceMap);
  }, [updateAllPrices]);

  const freezeCheckoutPricing = useCallback(() => {
    checkoutPricingFrozenRef.current = true;
  }, []);

  const releaseCheckoutPricing = useCallback(() => {
    if (paymentModalOpenRef.current || checkoutCommittedRef.current) return;
    checkoutPricingFrozenRef.current = false;
    const pending = pendingBoostPricingRef.current;
    if (pending) {
      pendingBoostPricingRef.current = null;
      commitBoostPricing(pending);
    }
  }, [commitBoostPricing]);

  const acceptBoostPricing = useCallback((next: BoostPosPricing, requestId: number) => {
    if (requestId !== boostRequestRef.current) return;
    if (checkoutPricingFrozenRef.current) {
      pendingBoostPricingRef.current = next;
      return;
    }
    commitBoostPricing(next);
  }, [commitBoostPricing]);

  const refreshBoostPricing = useCallback(async () => {
    if (!navigator.onLine) return;
    const requestId = ++boostRequestRef.current;
    try {
      acceptBoostPricing(await getBoostPosPricing(), requestId);
    } catch {
      // Keep the last successful snapshot so an active sale remains consistently priced.
    }
  }, [acceptBoostPricing]);

  const finishSale = useCallback((lines: Array<{ product_id: number; qty: number }>, refreshStock = false) => {
    applyLocalStockDelta(lines);
    completeSale();
    if (refreshStock) void refreshProducts();
    window.requestAnimationFrame(focusSearchIfSafe);
  }, [applyLocalStockDelta, focusSearchIfSafe, refreshProducts]);

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
      // Get journals fresh (they may not be in state yet)
      let journals = posJournals;
      if (!journals || journals.length === 0) {
        try {
          const jrnls = await getBankCashBalances();
          journals = jrnls?.map((j: any) => ({ id: j.id, name: j.name, type: j.type })) || [];
          setPosJournals(journals);
        } catch {}
      }
      // Load saved journal preferences
      let savedJournals = { cash: 0, card: 0 };
      try {
        const s = localStorage.getItem('pos_journal_settings');
        if (s) savedJournals = JSON.parse(s);
      } catch {}

      const result = await replayPendingTransactions(async (tx: OfflineTransaction) => {
        const lines = tx.lines;
        const invoiceId = await createPosOrder({
          lines,
          payment_method: tx.payment_method,
          partner_id: tx.partner_id,
        });
        await confirmInvoice(invoiceId);
        try {
          await createStockDelivery(lines);
        } catch { /* best effort */ }
        // Payment registration is best-effort (don't fail the whole tx if it fails)
        if (tx.payment_method !== 'credit') {
          try {
            const cashJ = savedJournals.cash || journals.find(j => j.type === 'cash')?.id;
            const bankJ = savedJournals.card || journals.find(j => j.type === 'bank')?.id;
            const jId = tx.payment_method === 'card' ? bankJ : cashJ;
            if (jId) await registerInvoicePayment(invoiceId, jId, tx.total);
          } catch { /* payment registration failed, invoice still created */ }
        }
      });

      // Update count
      const remaining = await getPendingCount();
      setPendingCount(remaining);

      if (result.success > 0) {
        void refreshProducts();
        setMsg(`✅ ${toPersianDigits(result.success)} تراکنش آفلاین ثبت شد${result.failed > 0 ? ` (${toPersianDigits(result.failed)} خطا)` : ''}`);
        setTimeout(() => setMsg(''), 4000);
      } else if (result.failed > 0) {
        setMsg(`❌ ${toPersianDigits(result.failed)} تراکنش خطا خورد — ۱۰ ثانیه بعد مجدد تلاش میشه`);
        setTimeout(() => setMsg(''), 6000);
      }
      if (remaining > 0) {
        // Retry failed ones after a delay
        setTimeout(syncOfflineQueue, 10000);
      }
    } catch (err: any) {
      // Will retry on next online event or after delay
      setMsg(`❌ خطا: ${err?.message || 'ناشناخته'}`);
      setTimeout(() => setMsg(''), 5000);
      const remaining = await getPendingCount().catch(() => 0);
      setPendingCount(remaining);
      setTimeout(syncOfflineQueue, 15000);
    }
  }, [posJournals, refreshProducts]);

  useEffect(() => {
    async function load() {
      const boostRequestId = ++boostRequestRef.current;
      try {
        const [data, jrnls, discCats, boost] = await Promise.all([
          getProducts(),
          getBankCashBalances(),
          getDiscountCategories(),
          getBoostPosPricing().catch(() => null),
        ]);
        replaceCanonicalProducts(data || []);
        setDiscountCategories(discCats?.map((c:any) => ({ id: c.id, name: c.name })) || []);
        setPosJournals(jrnls?.map((j:any) => ({ id: j.id, name: j.name, type: j.type })) || []);
        if (boost) acceptBoostPricing(boost, boostRequestId);
        // Check PAX terminal setting
        try {
          const settings = await getCompanySettings();
          setPaxTerminalEnabled(settings?.fmcg_pos_terminal_enabled || false);
        } catch {}
      } catch { setProducts([]); }
      setLoading(false);
      // Load pinned products from localStorage
      try {
        const saved = localStorage.getItem('pos_pinned_products');
        if (saved) setPinnedIds(new Set(JSON.parse(saved)));
      } catch {}
    }
    load();
  }, [acceptBoostPricing, replaceCanonicalProducts]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshBoostPricing();
    };
    const interval = window.setInterval(refreshWhenVisible, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshBoostPricing]);

  useEffect(() => {
    if (searchBlocked) {
      if (document.activeElement === searchInputRef.current) searchInputRef.current?.blur();
      return;
    }
    if (loading || submitting) return;

    const frame = window.requestAnimationFrame(focusSearchIfSafe);
    return () => window.cancelAnimationFrame(frame);
  }, [loading, submitting, searchBlocked, focusSearchIfSafe]);

  // Load original channel prices, then resolve the canonical Boost snapshot.
  async function handleDiscountChange(catId: number) {
    if (checkoutPricingFrozenRef.current) return;
    const requestId = ++discountRequestRef.current;
    if (catId === 0) {
      const emptyPrices = new Map<number, number>();
      activeDiscountRef.current = 0;
      discountPricesRef.current = emptyPrices;
      setActiveDiscount(0);
      setDiscountPrices(emptyPrices);
      const priceMap = new Map<number, number>();
      const productMap = new Map(productsRef.current.map((product) => [product.id, product]));
      for (const item of useCartStore.getState().items) {
        const product = productMap.get(item.id);
        if (product) priceMap.set(item.id, resolveProductPrice(product, 0, emptyPrices, boostPricingRef.current));
      }
      updateAllPrices(priceMap);
      return;
    }
    try {
      const prods = await getProductsWithDiscount(catId);
      const priceMap = new Map<number, number>();
      for (const product of (prods || [])) {
        if (typeof product.discount_price === 'number') priceMap.set(product.id, product.discount_price);
      }
      if (requestId !== discountRequestRef.current || checkoutPricingFrozenRef.current) return;
      mergeCanonicalProducts((prods || []) as OdooProduct[]);
      activeDiscountRef.current = catId;
      discountPricesRef.current = priceMap;
      setActiveDiscount(catId);
      setDiscountPrices(priceMap);
      const repriced = new Map<number, number>();
      const productMap = new Map(productsRef.current.map((product) => [product.id, product]));
      for (const item of useCartStore.getState().items) {
        const product = productMap.get(item.id);
        if (product) repriced.set(item.id, resolveProductPrice(product, catId, priceMap, boostPricingRef.current));
      }
      updateAllPrices(repriced);
    } catch {
      // Keep the previous channel and prices if loading the requested plan fails.
    }
  }

  function getEffectivePrice(product: OdooProduct): number {
    return resolveProductPrice(
      product,
      activeDiscountRef.current,
      discountPricesRef.current,
      boostPricingRef.current,
    );
  }

  function getDisplayedPrice(product: OdooProduct): number {
    return resolveProductPrice(product, activeDiscount, discountPrices, boostPricing);
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
      // Hide zero-stock unless showAllProducts is enabled
      if (!showAllProducts && (p.qty_available || 0) <= 0) return false;
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
    if (hasDirectExternalEffect(directRecoveryRef.current)) return;
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
        window.requestAnimationFrame(focusSearchIfSafe);
      }
    }
  }, [search]);

  async function handleProductClick(product: OdooProduct & {variantCount?: number}) {
    if (hasDirectExternalEffect(directRecoveryRef.current)) {
      alert('این فروش در حال بازیابی است؛ ابتدا همان روش پرداخت را تکمیل کنید.');
      return;
    }
    const tmplId = (product as any).product_tmpl_id?.[0] || (product as any).product_tmpl_id;
    if (product.variantCount && product.variantCount > 1 && tmplId) {
      // Has variants - show popup (use cache first, API as fallback)
      let vars = variantCache.get(tmplId);
      if (!vars || vars.length <= 1) {
        try {
          const fetched = await getProductVariants(tmplId);
          vars = (fetched || []).map((variant: OdooProduct) => ({
            ...variant,
            product_tmpl_id: variant.product_tmpl_id || tmplId,
          }));
          mergeCanonicalProducts(vars as OdooProduct[]);
        } catch {
          // Offline fallback: use cached products for this template
          vars = productsRef.current.filter(p => {
            const pTmpl = (p as any).product_tmpl_id?.[0] || (p as any).product_tmpl_id || p.id;
            return pTmpl === tmplId;
          });
        }
      }
      if (vars && vars.length > 1) {
        setVariantPopup({ tmplId, name: product.name, variants: vars });
        return;
      }
    }
    // Single variant or no variants - add directly
    addItem({ id: product.id, name: product.display_name || product.name, price: getEffectivePrice(product) });
    window.requestAnimationFrame(focusSearchIfSafe);
  }

  function selectVariant(variant: OdooProduct) {
    if (hasDirectExternalEffect(directRecoveryRef.current)) {
      alert('این فروش در حال بازیابی است؛ ابتدا همان روش پرداخت را تکمیل کنید.');
      return;
    }
    const price = getEffectivePrice(variant);
    // Extract short name for display
    const shortName = variant.display_name || variant.name;
    addItem({ id: variant.id, name: shortName, price });
    setVariantPopup(null);
  }

  const cartTotal = total();
  const directRecoveryLocked = hasDirectExternalEffect(directRecovery);

  function resolvePosJournal(type: 'cash' | 'bank'): number | undefined {
    let configuredId = 0;
    try {
      const settings = JSON.parse(localStorage.getItem('pos_journal_settings') || '{}');
      configuredId = Number(type === 'cash' ? settings.cash : settings.card);
    } catch {}
    if (configuredId > 0 && posJournals.some(j => j.id === configuredId && j.type === type)) return configuredId;
    return posJournals.find(j => j.type === type)?.id;
  }

  function storeDirectRecovery(next: DirectSaleRecovery | null): void {
    directRecoveryRef.current = next;
    setDirectRecoveryState(next);
  }

  function patchDirectRecovery(patch: Partial<DirectSaleRecovery>): DirectSaleRecovery {
    const current = directRecoveryRef.current;
    if (!current) throw new Error('اطلاعات بازیابی فروش در دسترس نیست');
    const next = { ...current, ...patch };
    storeDirectRecovery(next);
    return next;
  }

  function resetSafeDirectRecovery(): void {
    storeDirectRecovery(null);
    checkoutCommittedRef.current = false;
    releaseCheckoutPricing();
  }

  function closeCreditPayment(): void {
    const recovery = directRecoveryRef.current;
    if (hasDirectExternalEffect(recovery)) {
      alert(`این فروش اثر خارجی دارد و قابل پاک‌کردن نیست؛ برای ادامه همان روش پرداخت «${directPaymentLabel(recovery!.method)}» را دوباره بزنید.`);
      return;
    }
    setShowCredit(false);
    resetSafeDirectRecovery();
  }

  function clearCartSafely(): void {
    const recovery = directRecoveryRef.current;
    if (checkoutCommittedRef.current || hasDirectExternalEffect(recovery)) {
      const method = recovery ? directPaymentLabel(recovery.method) : 'فعلی';
      alert(`بخشی از فروش انجام شده است و سبد نباید پاک شود؛ برای ادامه همان روش پرداخت «${method}» را دوباره بزنید.`);
      return;
    }
    clearCart();
    storeDirectRecovery(null);
    checkoutCommittedRef.current = false;
    releaseCheckoutPricing();
  }

  function closeSplitPayment(): void {
    if (checkoutCommittedRef.current || splitInvoiceId || splitCashAccounted || splitCardPayments.some(row => row.paid || row.accounted)) {
      alert('بخشی از پرداخت انجام شده است؛ تا تکمیل حسابداری امکان بستن این پنجره وجود ندارد');
      return;
    }
    paymentModalOpenRef.current = false;
    setShowSplit(false);
    releaseCheckoutPricing();
  }

  function closeMultiCardPayment(): void {
    if (checkoutCommittedRef.current || multiCardInvoiceId || cardPayments.some(row => row.paid || row.accounted)) {
      alert('بخشی از پرداخت انجام شده است؛ تا تکمیل حسابداری امکان بستن این پنجره وجود ندارد');
      return;
    }
    paymentModalOpenRef.current = false;
    setShowMultiCard(false);
    releaseCheckoutPricing();
  }

  // Reset all per-sale state only after the sale is registered or safely queued.
  function completeSale() {
    const emptyPrices = new Map<number, number>();
    clearCart();
    setSearch('');
    activeDiscountRef.current = 0;
    discountPricesRef.current = emptyPrices;
    setActiveDiscount(0);
    setDiscountPrices(emptyPrices);
    storeDirectRecovery(null);
    checkoutCommittedRef.current = false;
    paymentModalOpenRef.current = false;
    releaseCheckoutPricing();
  }

  function createDirectRecovery(method: DirectPaymentMethod, partnerId?: number): DirectSaleRecovery | null {
    const existing = directRecoveryRef.current;
    if (existing) {
      if (existing.method !== method) {
        alert(`این فروش با روش «${directPaymentLabel(existing.method)}» شروع شده است؛ برای ادامه همان روش را دوباره بزنید.`);
        return null;
      }
      if (method === 'credit' && existing.partnerId !== partnerId) {
        alert('مشتری این فروش اعتباری قبلاً ثبت شده است؛ همان مشتری را انتخاب کنید.');
        return null;
      }
      return existing;
    }

    const currentItems = useCartStore.getState().items;
    const lines = currentItems.map(item => ({
      product_id: item.id,
      qty: item.quantity,
      price_unit: item.price,
    }));
    if (lines.length === 0) return null;
    const pinnedTotal = lines.reduce((sum, line) => sum + line.qty * line.price_unit, 0);
    const journalId = method === 'credit'
      ? undefined
      : resolvePosJournal(method === 'card' ? 'bank' : 'cash');
    if (method !== 'credit' && !journalId) {
      alert(method === 'card' ? 'دفتر بانکی کارت تنظیم نشده است' : 'دفتر نقدی صندوق تنظیم نشده است');
      return null;
    }

    const recovery: DirectSaleRecovery = {
      method,
      partnerId,
      lines,
      total: pinnedTotal,
      journalId,
      paxRequired: method === 'card' && paxTerminalEnabled,
      paxStatus: 'not_started',
      invoiceCreationStarted: false,
      invoiceId: null,
      invoicePosted: false,
      paymentAccounted: false,
    };
    storeDirectRecovery(recovery);
    return recovery;
  }

  async function queueDirectRecovery(recovery: DirectSaleRecovery): Promise<void> {
    await queueTransaction({
      lines: recovery.lines,
      payment_method: recovery.method,
      partner_id: recovery.partnerId,
      credit_note: recovery.method === 'credit' && creditNote ? creditNote : undefined,
      total: recovery.total,
    });
    setPendingCount(await getPendingCount());
    finishSale(recovery.lines, false);
  }

  async function runDirectRecovery(initial: DirectSaleRecovery): Promise<void> {
    let recovery = directRecoveryRef.current || initial;

    if (recovery.method === 'card' && recovery.paxRequired) {
      if (recovery.paxStatus === 'started') {
        throw new Error('نتیجه درخواست قبلی کارتخوان نامشخص است؛ پیش از هر اقدام وضعیت تراکنش را روی دستگاه بررسی کنید');
      }
      if (recovery.paxStatus !== 'paid') {
        recovery = patchDirectRecovery({ paxStatus: 'started' });
        checkoutCommittedRef.current = true;
        setMsg('💳 مبلغ به دستگاه کارتخوان ارسال شد، منتظر کشیدن کارت...');
        const pax = await payWithPaxTerminal(recovery.total, 'sale');
        if (!pax?.success) {
          recovery = patchDirectRecovery({ paxStatus: 'not_started' });
          checkoutCommittedRef.current = false;
          setMsg('');
          throw new Error(pax?.error || 'تراکنش کارتخوان ناموفق بود');
        }
        recovery = patchDirectRecovery({ paxStatus: 'paid' });
      }
    }

    if (!recovery.invoiceId) {
      if (recovery.invoiceCreationStarted) {
        throw new Error('نتیجه ایجاد فاکتور قبلی نامشخص است؛ برای جلوگیری از فاکتور تکراری ابتدا وضعیت Odoo را بررسی کنید');
      }
      recovery = patchDirectRecovery({ invoiceCreationStarted: true });
      checkoutCommittedRef.current = true;
      const invoiceId = await createPosOrder({
        lines: recovery.lines,
        payment_method: recovery.method,
        partner_id: recovery.partnerId,
      });
      recovery = patchDirectRecovery({ invoiceId });
    }

    const invoiceId = Number(recovery.invoiceId);
    if (!recovery.invoicePosted) {
      const invoices = await searchRead('account.move', [['id', '=', invoiceId]], ['state'], 1);
      if (invoices?.[0]?.state !== 'posted') {
        await confirmInvoice(invoiceId);
      }
      recovery = patchDirectRecovery({ invoicePosted: true });
    }

    if (recovery.method !== 'credit' && !recovery.paymentAccounted) {
      const residual = await getInvoiceResidual(invoiceId);
      if (amountsMatch(residual, 0)) {
        recovery = patchDirectRecovery({ paymentAccounted: true });
      } else {
        await registerInvoicePayment(invoiceId, recovery.journalId!, recovery.total);
        recovery = patchDirectRecovery({ paymentAccounted: true });
      }
    }

    try {
      await createStockDelivery(recovery.lines, recovery.partnerId);
    } catch { /* best effort */ }
    finishSale(recovery.lines, true);
  }

  function handleDirectFailure(error: unknown): void {
    const recovery = directRecoveryRef.current;
    const reason = error instanceof Error ? error.message : 'خطا در ثبت فاکتور';
    if (!hasDirectExternalEffect(recovery)) {
      resetSafeDirectRecovery();
      alert(reason);
      return;
    }

    const invoiceOutcomeUnknown = Boolean(recovery?.invoiceCreationStarted && !recovery.invoiceId);
    const resumable = canResumeDirectSale(recovery);
    const guidance = invoiceOutcomeUnknown
      ? 'نتیجه ایجاد فاکتور نامشخص است؛ برای جلوگیری از فاکتور تکراری، تلاش خودکار و ساخت مجدد متوقف شده است. وضعیت فاکتور را در Odoo بررسی کنید.'
      : resumable
        ? `این فروش قابل ادامه است؛ برای ادامه همان روش پرداخت «${directPaymentLabel(recovery!.method)}» را دوباره بزنید. کارتخوان یا فاکتور انجام‌شده تکرار نخواهد شد.`
        : 'وضعیت اثر خارجی نامشخص است؛ برای جلوگیری از پرداخت یا فاکتور تکراری دوباره تلاش نکنید و ابتدا وضعیت کارتخوان/Odoo را بررسی کنید.';
    setMsg(`⚠️ ${guidance}`);
    alert(`${reason}\n${guidance}`);
  }

  async function handlePayment(method: DirectPaymentMethod) {
    const pendingRecovery = directRecoveryRef.current;
    if (pendingRecovery && pendingRecovery.method !== method) {
      alert(`این فروش با روش «${directPaymentLabel(pendingRecovery.method)}» شروع شده است؛ برای ادامه همان روش را دوباره بزنید.`);
      return;
    }

    if (method === 'credit') {
      try {
        const cust = await getPartners('customer');
        setCustomers(cust?.map((c:any) => ({id:c.id, name:c.name})) || []);
      } catch { setCustomers([]); }
      if (pendingRecovery?.partnerId) setSelectedCustomer(pendingRecovery.partnerId);
      setShowCredit(true);
      return;
    }

    const recovery = createDirectRecovery(method);
    if (!recovery) return;
    freezeCheckoutPricing();
    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        if (hasDirectExternalEffect(recovery)) {
          throw new Error('این فروش قبلاً اثر خارجی داشته است؛ پس از اتصال همان روش پرداخت را دوباره بزنید');
        }
        await queueDirectRecovery(recovery);
        setMsg('📥 تراکنش ذخیره شد (آفلاین) - پس از اتصال همگام‌سازی می‌شود');
        setTimeout(() => setMsg(''), 4000);
      } else {
        await runDirectRecovery(recovery);
        setMsg('✅ فاکتور ثبت شد');
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (error) {
      handleDirectFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreditSale() {
    if (!selectedCustomer) { alert('مشتری را انتخاب کنید'); return; }
    const recovery = createDirectRecovery('credit', selectedCustomer);
    if (!recovery) return;
    freezeCheckoutPricing();
    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        if (hasDirectExternalEffect(recovery)) {
          throw new Error('این فروش قبلاً اثر خارجی داشته است؛ پس از اتصال همان روش پرداخت را دوباره بزنید');
        }
        await queueDirectRecovery(recovery);
        setShowCredit(false);
        setMsg('📥 فروش اعتباری ذخیره شد (آفلاین)');
        setTimeout(() => setMsg(''), 4000);
      } else {
        await runDirectRecovery(recovery);
        setShowCredit(false);
        setMsg('✅ فروش اعتباری ثبت شد');
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (error) {
      handleDirectFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSplitPayment() {
    const cashAmt = toman(splitCash);
    const creditAmt = toman(splitCredit);
    const positiveCards = splitCardPayments
      .map((row, index) => ({ ...row, index, normalizedAmount: toman(row.amount) }))
      .filter(row => row.normalizedAmount > 0);
    const cardAmt = positiveCards.reduce((sum, row) => sum + row.normalizedAmount, 0);
    const totalSplit = cashAmt + cardAmt + creditAmt;

    if (!amountsMatch(totalSplit, cartTotal)) {
      alert(`مجموع مبالغ (${formatPrice(totalSplit)}) با جمع فاکتور (${formatPrice(cartTotal)}) برابر نیست`);
      return;
    }
    if (creditAmt > 0 && !splitCustomer) {
      alert('برای بخش اعتباری، انتخاب مشتری الزامی است');
      return;
    }
    if (positiveCards.some(row => !row.paid)) {
      alert('ابتدا همه کارت‌های دارای مبلغ را پرداخت کنید');
      return;
    }
    if (splitCardPayments.some(row => row.paid && toman(row.amount) <= 0)) {
      alert('مبلغ کارت پرداخت‌شده نامعتبر است');
      return;
    }

    const cashJournalId = cashAmt > 0 ? resolvePosJournal('cash') : undefined;
    const bankJournalId = cardAmt > 0 ? resolvePosJournal('bank') : undefined;
    if (cashAmt > 0 && !cashJournalId) { alert('دفتر نقدی صندوق تنظیم نشده است'); return; }
    if (cardAmt > 0 && !bankJournalId) { alert('دفتر بانکی کارت تنظیم نشده است'); return; }

    checkoutCommittedRef.current = true;
    setSubmitting(true);
    try {
      const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
      const partnerId = creditAmt > 0 ? splitCustomer : undefined;
      let invoiceId = splitInvoiceId;
      if (!invoiceId) {
        const createdInvoiceId = await createPosOrder({ lines, payment_method: 'split', partner_id: partnerId });
        await confirmInvoice(createdInvoiceId);
        setSplitInvoiceId(createdInvoiceId);
        invoiceId = createdInvoiceId;
      }

      const activeInvoiceId = Number(invoiceId);
      if (cashAmt > 0 && !splitCashAccounted) {
        await registerInvoicePayment(activeInvoiceId, cashJournalId!, cashAmt);
        setSplitCashAccounted(true);
      }
      for (const card of positiveCards) {
        if (card.accounted) continue;
        await registerInvoicePayment(activeInvoiceId, bankJournalId!, card.normalizedAmount);
        setSplitCardPayments(previous => previous.map((row, index) =>
          index === card.index ? { ...row, accounted: true } : row
        ));
      }

      const residual = await getInvoiceResidual(activeInvoiceId);
      if (!amountsMatch(residual, creditAmt)) {
        throw new Error(`مانده فاکتور (${formatPrice(residual)}) با مبلغ اعتباری مورد انتظار (${formatPrice(creditAmt)}) برابر نیست؛ وضعیت پرداخت را بررسی کنید`);
      }

      try { await createStockDelivery(lines.map(l => ({ product_id: l.product_id, qty: l.qty })), partnerId); } catch { /* best effort */ }
      finishSale(lines.map(line => ({ product_id: line.product_id, qty: line.qty })), true);
      setShowSplit(false);
      setSplitCash(''); setSplitCredit(''); setSplitCustomer(0);
      setSplitCardPayments([{amount: '', paid: false, accounted: false}]);
      setSplitCashAccounted(false); setSplitInvoiceId(null);
      setMsg('✅ پرداخت ترکیبی ثبت شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e:any) {
      alert(`${e.message || 'خطا در ثبت'}\nپرداخت‌های کارتخوان برگشت خودکار نمی‌خورند؛ این پنجره را باز نگه دارید و دوباره تلاش کنید.`);
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
          {boostPricing?.enabled && (
            <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow" role="status">
              🚀 حالت بوست فعال است ({boostPricing.percent >= 0 ? '+' : ''}{toPersianDigits(boostPricing.percent)}٪)
            </span>
          )}
          <div className="flex items-center gap-4">
            {msg && <span className="text-xs bg-green-500 px-2 py-1 rounded">{msg}</span>}
            {pendingCount > 0 && (
              <div className="flex gap-1">
                <button onClick={async () => {
                  setMsg('🔄 همگام‌سازی...');
                  await syncOfflineQueue();
                }} className="text-xs bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded cursor-pointer">
                  📥 {toPersianDigits(pendingCount)} در صف — ارسال
                </button>
                <button onClick={async () => {
                  if (!confirm(`${pendingCount} تراکنش در صف هست.\n\nآیا می‌خواهید صف را پاک کنید؟\n⚠️ این تراکنش‌ها بدون ثبت حذف می‌شوند!`)) return;
                  // Clear IndexedDB
                  const db = await new Promise<IDBDatabase>((resolve) => {
                    const req = indexedDB.open('fmcg-offline', 1);
                    req.onsuccess = () => resolve(req.result);
                  });
                  const tx = db.transaction('pending-transactions', 'readwrite');
                  tx.objectStore('pending-transactions').clear();
                  db.close();
                  setPendingCount(0);
                  setMsg('🗑️ صف پاک شد');
                  setTimeout(() => setMsg(''), 3000);
                }} className="text-xs bg-red-500/70 hover:bg-red-600 px-1.5 py-1 rounded cursor-pointer" title="پاک کردن صف">
                  🗑️
                </button>
              </div>
            )}
            <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {isOnline ? '🟢 آنلاین' : '🔴 آفلاین'}
            </span>
            {(() => {
              const auth = useAuthStore.getState();
              const hasMenus = (() => { try { const m = localStorage.getItem('seller_allowed_menus'); return m ? JSON.parse(m).length > 0 : false; } catch { return false; } })();
              return (auth.isAdmin || hasMenus) ? (
                <Link href="/admin" className="text-xs text-slate-400 hover:text-white">
                  بازگشت به پنل ←
                </Link>
              ) : null;
            })()}
            <button onClick={async () => {
              try { const d = await loadSalesHistory(); setSalesHistory(d); } catch { setSalesHistory([]); }
              setShowSalesHistory(true);
            }} className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded">📋 سوابق</button>
            <button onClick={async () => {
              try { await odooLogout(); } catch {}
              useAuthStore.getState().logout();
              window.location.href = '/login';
            }} className="text-xs bg-red-600/80 hover:bg-red-700 px-2 py-1 rounded">🚪 خروج</button>
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
            ref={searchInputRef}
            type="text"
            placeholder="🔍 جستجو یا اسکن بارکد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={directRecoveryLocked}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {/* Show all products toggle */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={showAllProducts} onChange={(e) => setShowAllProducts(e.target.checked)} className="w-3.5 h-3.5 rounded" />
            <span className="text-xs text-gray-500">نمایش همه محصولات (شامل موجودی صفر)</span>
          </label>
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
              <div
                key={product.id}
                className="relative"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') setHoveredProductId(product.id);
                }}
                onPointerLeave={() => setHoveredProductId((current) => current === product.id ? null : current)}
                onPointerCancel={() => setHoveredProductId((current) => current === product.id ? null : current)}
              >
                <button
                  onClick={() => handleProductClick(product)}
                  disabled={directRecoveryLocked}
                  className={`relative rounded-xl overflow-hidden border-2 ${pinnedIds.has(product.id) ? 'border-yellow-400' : 'border-transparent'} hover:border-indigo-400 hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 transition-all shadow-sm aspect-square w-full`}
                >
                  {product.image_128 ? (
                    <img src={`data:image/png;base64,${product.image_128}`} alt="" className="absolute inset-0 z-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <span className="text-3xl opacity-30">📦</span>
                    </div>
                  )}
                  <div
                    style={{ opacity: hoveredProductId === product.id ? 0 : 1 }}
                    className="absolute inset-0 z-10 bg-black/40 transition-opacity duration-200 ease-out pointer-events-none flex flex-col items-center justify-center p-2"
                  >
                    <div className="text-white text-xs font-bold text-center leading-tight">{product.name}</div>
                    <div className="text-[10px] text-slate-200 mt-1">
                      موجودی: {toPersianDigits(Math.max(0, Math.round(product.qty_available ?? 0)))}
                    </div>
                    <div className="text-white text-xs font-bold mt-1 bg-green-600/80 px-2 py-0.5 rounded">
                      {formatPrice(getDisplayedPrice(product))}
                    </div>
                    {activeDiscount !== 0 && discountPrices.has(product.id) && (
                      <span className="text-[10px] text-gray-300 line-through">{formatPrice(product.list_price)}</span>
                    )}
                  </div>
                </button>
                {/* Pin button */}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(product.id); }}
                  className={`absolute top-1 right-1 text-xs z-20 w-5 h-5 rounded-full flex items-center justify-center ${pinnedIds.has(product.id) ? 'bg-yellow-400 text-yellow-900' : 'bg-black/30 text-white/60 hover:text-white'}`}
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
              onClick={clearCartSafely}
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
                      disabled={directRecoveryLocked}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold disabled:opacity-40"
                    >
                      -
                    </button>
                    <input type="number" value={item.quantity} onChange={(e) => updateQuantity(item.id, Number(e.target.value) || 1)} disabled={directRecoveryLocked} className="w-12 text-center text-sm border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min="1" />
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={directRecoveryLocked}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold disabled:opacity-40"
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
            disabled={items.length === 0 || submitting || Boolean(directRecovery && directRecovery.method !== 'cash')}
            className="py-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition"
          >
            💵 نقد
          </button>
          <button
            onClick={() => handlePayment('card')}
            disabled={items.length === 0 || submitting || !isOnline || Boolean(directRecovery && directRecovery.method !== 'card')}
            className="py-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition"
          >
            💳 کارت
          </button>
          <button
            onClick={() => {
              paymentModalOpenRef.current = true;
              freezeCheckoutPricing();
              setCardPayments([{amount: String(toman(cartTotal)), paid: false, accounted: false}]);
              setMultiCardInvoiceId(null);
              setShowMultiCard(true);
            }}
            disabled={items.length === 0 || submitting || !isOnline || Boolean(directRecovery)}
            className="py-3 bg-blue-400 text-white rounded-lg text-xs font-bold hover:bg-blue-500 disabled:opacity-40 transition"
          >
            💳💳 چند کارت
          </button>
          <button
            onClick={() => handlePayment('credit')}
            disabled={items.length === 0 || submitting || Boolean(directRecovery && directRecovery.method !== 'credit')}
            className="py-3 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 transition"
          >
            🤝 اعتباری
          </button>
          <button
            onClick={async () => {
              try { const cust = await getPartners('customer'); setCustomers(cust?.map((c:any) => ({id:c.id, name:c.name})) || []); } catch {}
              setSplitCash(''); setSplitCredit(''); setSplitCustomer(0);
              setSplitCardPayments([{amount: '', paid: false, accounted: false}]);
              setSplitCashAccounted(false); setSplitInvoiceId(null);
              paymentModalOpenRef.current = true;
              freezeCheckoutPricing();
              setShowSplit(true);
            }}
            disabled={items.length === 0 || submitting || Boolean(directRecovery)}
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
                  disabled={directRecoveryLocked}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-amber-400 focus:outline-none disabled:bg-gray-100"
                >
                  <option value={0}>— انتخاب کنید —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button onClick={() => setShowNewCustomer(true)} className="text-xs text-indigo-600 font-bold mt-1">+ ثبت مشتری جدید</button>
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
                onClick={closeCreditPayment}
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[85vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">🔀 پرداخت ترکیبی</h3>
            <div className="mb-3 text-sm text-gray-600">جمع کل: <b>{formatPrice(cartTotal)} تومان</b></div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">💵 مبلغ نقدی</label>
                <input type="text" value={splitCash ? Number(splitCash).toLocaleString() : ''} onChange={(e) => setSplitCash(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">💳 کارت‌ها</label>
                <div className="space-y-2">
                  {splitCardPayments.map((cp, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cp.amount ? Number(cp.amount).toLocaleString() : ''}
                        onChange={(e) => { const val = e.target.value.replace(/[^\d]/g, ''); const next = [...splitCardPayments]; next[idx] = {...next[idx], amount: val}; setSplitCardPayments(next); }}
                        placeholder="مبلغ"
                        disabled={cp.paid}
                        className="flex-1 p-2 border border-gray-200 rounded-lg text-xs"
                      />
                      {cp.paid ? (
                        <span className="text-green-600 text-xs font-bold">✓</span>
                      ) : (
                        <button
                          onClick={async () => {
                            const amt = Number(cp.amount);
                            if (!amt) { alert('مبلغ وارد کنید'); return; }
                            if (paxTerminalEnabled) {
                              setMsg('💳 ارسال به کارتخوان...');
                              try {
                                const pax = await payWithPaxTerminal(amt, 'sale');
                                if (!pax?.success) { alert(pax?.error || 'ناموفق'); setMsg(''); return; }
                              } catch (e: any) { alert(e.message || 'خطا'); setMsg(''); return; }
                            }
                            const next = [...splitCardPayments]; next[idx] = {...next[idx], paid: true}; setSplitCardPayments(next);
                            setMsg(`✅ کارت ${toPersianDigits(idx+1)} پرداخت شد`);
                            setTimeout(() => setMsg(''), 2000);
                          }}
                          className="px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-bold"
                        >پرداخت</button>
                      )}
                      {!cp.paid && splitCardPayments.length > 1 && (
                        <button onClick={() => setSplitCardPayments(splitCardPayments.filter((_,i)=>i!==idx))} className="text-red-400 text-xs">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setSplitCardPayments([...splitCardPayments, {amount: '', paid: false, accounted: false}])} className="text-[10px] text-blue-600 font-bold mt-1">+ کارت دیگر</button>
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
                  <button onClick={() => setShowNewCustomer(true)} className="text-xs text-indigo-600 font-bold mt-1">+ ثبت مشتری جدید</button>
                </div>
              )}
              <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-500">
                مجموع وارد شده: {formatPrice(toman(splitCash) + splitCardPayments.reduce((sum, row) => sum + Math.max(0, toman(row.amount)), 0) + toman(splitCredit))} از {formatPrice(cartTotal)}
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
              <button onClick={closeSplitPayment} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300">
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sales History Modal */}
      {showSalesHistory && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSalesHistory(false);
          }}
        >
          <div className="bg-white rounded-2xl p-6 w-[96vw] max-w-6xl shadow-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📋 سوابق فاکتورهای فروش</h3>
              <button onClick={() => setShowSalesHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {salesHistory.length === 0 ? <p className="text-center text-gray-400 py-8">فاکتوری یافت نشد</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-right p-2">شماره</th><th className="text-right p-2">تاریخ و ساعت</th><th className="text-right p-2">مشتری</th><th className="text-right p-2">روش پرداخت</th><th className="text-right p-2">مبلغ</th><th className="text-right p-2">وضعیت</th><th className="text-right p-2">عملیات</th>
                </tr></thead>
                <tbody>{salesHistory.map((inv) => (<React.Fragment key={inv.id}>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div>{inv.name}</div>
                      <div className="mt-0.5 text-[10px] text-gray-500">فروشنده: {inv.create_uid ? inv.create_uid[1] : 'نامشخص'}</div>
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">{formatSaleDateTime(inv.create_date)}</td>
                    <td className="p-2">{inv.partner_id?inv.partner_id[1]:'—'}</td>
                    <td className="p-2 text-xs whitespace-nowrap">{getPosPaymentLabel(inv.narration, inv.payment_state)}</td>
                    <td className="p-2 font-bold">{formatPrice(inv.amount_total)}</td>
                    <td className="p-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${(String(inv.narration||'')).includes('ابطال') ? 'bg-red-100 text-red-700' : inv.payment_state==='paid'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{(String(inv.narration||'')).includes('ابطال') ? '⛔ ابطال شده' : inv.payment_state==='paid'?'پرداخت شده':'تأیید شده'}</span></td>
                    <td className="p-2 flex gap-1">
                      <button onClick={async()=>{if(expandedSale===inv.id){setExpandedSale(null);setSaleLines([]);return;} try{const l=await getPurchaseInvoiceLines(inv.id);setSaleLines(l||[]);setExpandedSale(inv.id);}catch{setSaleLines([]);}}} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">مشاهده</button>
                      {!(String(inv.narration||'')).includes('ابطال') ? (
                        <button onClick={async()=>{
                          if (!confirm(`ابطال فاکتور ${inv.name}؟\nیک credit note ایجاد میشه، پول به صندوق/بانک برمیگرده و حواله انبار برمیگرده.`)) return;
                          try {
                            const { voidInvoice } = await import('@/lib/odoo-api');
                            let jId: number | undefined;
                            try { const s = JSON.parse(localStorage.getItem('pos_journal_settings')||'{}'); jId = s.cash || s.card; } catch{}
                            if (!jId) { const j = posJournals.find(j => j.type === 'cash'); jId = j?.id; }
                            await voidInvoice(inv.id, jId);
                            setMsg(`✅ فاکتور ${inv.name} ابطال شد`);
                            setTimeout(()=>setMsg(''),4000);
                            try { const h = await loadSalesHistory(); setSalesHistory(h); } catch{}
                          } catch(e:any){alert(e.message||'خطا در ابطال');}
                        }} className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded">🚫 ابطال</button>
                      ) : (
                        <span className="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded">⛔ ابطال شده</span>
                      )}
                    </td>
                  </tr>
                  {expandedSale===inv.id&&(<tr key={`d-${inv.id}`}><td colSpan={7} className="p-2 bg-gray-50">
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

      {/* New Customer Quick Add */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold mb-3">+ ثبت مشتری جدید</h3>
            <div className="space-y-3">
              <input type="text" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="نام مشتری *" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              <input type="text" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="شماره تماس (اختیاری)" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={async () => {
                if (!newCustName) { alert('نام الزامی'); return; }
                try {
                  const id = await createPartner({ name: newCustName, phone: newCustPhone || undefined, customer_rank: 1 });
                  setCustomers(prev => [...prev, { id, name: newCustName }]);
                  setSelectedCustomer(id);
                  setSplitCustomer(id);
                  setNewCustName(''); setNewCustPhone(''); setShowNewCustomer(false);
                } catch (e: any) { alert(e.message || 'خطا'); }
              }} className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold">ثبت</button>
              <button onClick={() => setShowNewCustomer(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Card Payment Popup */}
      {showMultiCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">💳 پرداخت چند کارته</h3>
              <button onClick={closeMultiCardPayment} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="text-sm text-gray-500 mb-3">جمع فاکتور: <b>{formatPrice(cartTotal)}</b></div>
            <div className="space-y-3 mb-4">
              {cardPayments.map((cp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">کارت {toPersianDigits(idx + 1)}:</span>
                  <input
                    type="text"
                    value={cp.amount ? Number(cp.amount).toLocaleString() : ''}
                    onChange={(e) => { const val = e.target.value.replace(/[^\d]/g, ''); const next = [...cardPayments]; next[idx] = {...next[idx], amount: val}; setCardPayments(next); }}
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
                        if (paxTerminalEnabled) {
                          setMsg('💳 ارسال به کارتخوان...');
                          try {
                            const pax = await payWithPaxTerminal(amt, 'sale');
                            if (!pax?.success) { alert(pax?.error || 'ناموفق'); setMsg(''); return; }
                          } catch (e: any) { alert(e.message || 'خطا'); setMsg(''); return; }
                        }
                        const next = [...cardPayments]; next[idx] = {...next[idx], paid: true}; setCardPayments(next);
                        setMsg(`✅ کارت ${toPersianDigits(idx+1)} پرداخت شد`);
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
            <button onClick={() => setCardPayments([...cardPayments, {amount: '', paid: false, accounted: false}])} className="text-xs text-blue-600 font-bold mb-4">+ افزودن کارت دیگر</button>
            <div className="text-xs text-gray-500 mb-3">
              پرداخت شده: {formatPrice(cardPayments.filter(c=>c.paid).reduce((s,c)=>s+(Number(c.amount)||0),0))} از {formatPrice(cartTotal)}
            </div>
            <button
              onClick={async () => {
                const positiveCards = cardPayments
                  .map((row, index) => ({ ...row, index, normalizedAmount: toman(row.amount) }))
                  .filter(row => row.normalizedAmount > 0);
                const totalPaid = positiveCards.reduce((sum, row) => sum + row.normalizedAmount, 0);
                if (positiveCards.length === 0) { alert('حداقل یک مبلغ کارت معتبر وارد کنید'); return; }
                if (positiveCards.some(row => !row.paid)) { alert('ابتدا همه کارت‌های دارای مبلغ را پرداخت کنید'); return; }
                if (cardPayments.some(row => row.paid && toman(row.amount) <= 0)) { alert('مبلغ کارت پرداخت‌شده نامعتبر است'); return; }
                if (!amountsMatch(totalPaid, cartTotal)) { alert('مجموع کارت‌ها باید دقیقاً برابر جمع فاکتور باشد'); return; }
                const bankJournalId = resolvePosJournal('bank');
                if (!bankJournalId) { alert('دفتر بانکی کارت تنظیم نشده است'); return; }

                checkoutCommittedRef.current = true;
                setSubmitting(true);
                try {
                  const lines = items.map(i => ({ product_id: i.id, qty: i.quantity, price_unit: i.price }));
                  let invoiceId = multiCardInvoiceId;
                  if (!invoiceId) {
                    const createdInvoiceId = await createPosOrder({ lines, payment_method: 'multi_card' });
                    await confirmInvoice(createdInvoiceId);
                    setMultiCardInvoiceId(createdInvoiceId);
                    invoiceId = createdInvoiceId;
                  }
                  const activeInvoiceId = Number(invoiceId);
                  for (const card of positiveCards) {
                    if (card.accounted) continue;
                    await registerInvoicePayment(activeInvoiceId, bankJournalId, card.normalizedAmount);
                    setCardPayments(previous => previous.map((row, index) =>
                      index === card.index ? { ...row, accounted: true } : row
                    ));
                  }
                  const residual = await getInvoiceResidual(activeInvoiceId);
                  if (!amountsMatch(residual, 0)) {
                    throw new Error(`مانده فاکتور باید صفر باشد اما ${formatPrice(residual)} است`);
                  }
                  try { await createStockDelivery(lines); } catch {}
                  finishSale(lines, true);
                  setShowMultiCard(false); setCardPayments([{amount: '', paid: false, accounted: false}]); setMultiCardInvoiceId(null);
                  setMsg('✅ فاکتور ثبت شد'); setTimeout(() => setMsg(''), 3000);
                } catch (e: any) {
                  alert(`${e.message || 'خطا'}\nپرداخت‌های کارتخوان برگشت خودکار نمی‌خورند؛ این پنجره را باز نگه دارید و دوباره تلاش کنید.`);
                }
                setSubmitting(false);
              }}
              disabled={submitting}
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
                    <div className="text-xs text-slate-400 mt-1">
                      موجودی: {toPersianDigits(Math.max(0, Math.round(v.qty_available || 0)))} | {v.barcode || 'بدون بارکد'}
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
