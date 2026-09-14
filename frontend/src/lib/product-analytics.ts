import * as jalaali from 'jalaali-js';
import { searchRead } from '@/lib/odoo-api';

export type ProductDocumentType = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund';
export type CostSource = 'actual' | 'mixed' | 'estimated' | 'none';
export type JalaliMonthKey = `${number}-${string}`;

type OdooRow = Record<string, unknown> & { id: number };

export interface ProductAnalyticsProduct {
  id: number;
  name: string;
  displayName: string;
  barcode: string | false;
  category: string;
  uom: string;
  listPrice: number;
  standardPrice: number;
  quantityAvailable: number;
  reorderThreshold: number;
  image: string | false;
  templateId: number;
  templateName: string;
}

export interface ProductAnalyticsMetrics {
  netSoldQuantity: number;
  grossSoldQuantity: number;
  returnedSaleQuantity: number;
  netRevenue: number;
  grossRevenue: number;
  refundedRevenue: number;
  netPurchasedQuantity: number;
  grossPurchasedQuantity: number;
  returnedPurchaseQuantity: number;
  netPurchaseAmount: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  averageSalePrice: number | null;
  averagePurchasePrice: number | null;
  inventoryValue: number;
  returnRate: number | null;
  stockCoverageDays: number | null;
  firstAvailableDate: string | null;
  lifetimeSoldQuantity: number | null;
  lifetimeObservationDays: number | null;
  lastSaleDate: string | null;
  lastPurchaseDate: string | null;
  saleDocumentCount: number;
  purchaseDocumentCount: number;
  costSource: CostSource;
  actualCostCoverage: number | null;
}

export interface ProductAnalyticsRanking {
  salesRank: number | null;
  profitRank: number | null;
  comparedProducts: number;
}

export interface ProductAnalyticsTrend {
  month: JalaliMonthKey;
  soldQuantity: number;
  purchasedQuantity: number;
  revenue: number;
  purchaseAmount: number;
  cogs: number;
  profit: number;
}

export interface ProductPriceTimelinePoint {
  date: string;
  purchasePrice: number | null;
  salePrice: number | null;
  marginPercent: number | null;
  purchaseObserved: boolean;
  saleObserved: boolean;
  isCurrent: boolean;
}

export interface ProductFinancialTransaction {
  id: number;
  date: string;
  moveId: number;
  moveName: string;
  partnerName: string;
  type: ProductDocumentType;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
}

export interface ProductStockMovement {
  id: number;
  date: string;
  reference: string;
  origin: string;
  source: string;
  destination: string;
  kind: 'purchase' | 'sale' | 'sale_return' | 'purchase_return' | 'adjustment' | 'transfer';
  signedQuantity: number;
}

export interface ProductAnalyticsResult {
  product: ProductAnalyticsProduct;
  metrics: ProductAnalyticsMetrics;
  ranking: ProductAnalyticsRanking;
  trends: ProductAnalyticsTrend[];
  priceTimeline: ProductPriceTimelinePoint[];
  transactions: ProductFinancialTransaction[];
  stockMovements: ProductStockMovement[];
  stockHistoryAvailable: boolean;
  stockHistoryTruncated: boolean;
}

interface InvoiceLine {
  id: number;
  date: string;
  moveId: number;
  moveName: string;
  type: ProductDocumentType;
  productId: number;
  productName: string;
  partnerName: string;
  baseQuantity: number;
  companyAmount: number;
  discount: number;
}

interface SalesAggregate {
  netQuantity: number;
  grossQuantity: number;
  returnedQuantity: number;
  netRevenue: number;
  grossRevenue: number;
  refundedRevenue: number;
}

interface UomInfo {
  factor: number;
  categoryId: number;
}

interface GregorianDateParts {
  year: number;
  month: number;
  day: number;
}

interface DailyPriceEvent {
  purchaseAmount: number;
  purchaseQuantity: number;
  saleAmount: number;
  saleQuantity: number;
}

interface LifecycleDailyAggregate extends DailyPriceEvent {
  date: string;
  netSoldQuantity: number;
}

interface LifecycleInvoiceResult {
  days: LifecycleDailyAggregate[];
  firstPurchaseDocumentDate: string | null;
  firstProductDocumentDate: string | null;
  available: boolean;
}

interface StockAvailabilityResult {
  available: boolean;
  date: string | null;
}

function asRows(value: unknown): OdooRow[] {
  return Array.isArray(value) ? value as OdooRow[] : [];
}

function relationId(value: unknown): number {
  if (Array.isArray(value)) return Number(value[0]) || 0;
  return Number(value) || 0;
}

function relationName(value: unknown): string {
  return Array.isArray(value) ? String(value[1] || '') : '';
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function documentSign(type: ProductDocumentType): number {
  return type === 'out_refund' || type === 'in_refund' ? -1 : 1;
}

function isDocumentType(value: unknown): value is ProductDocumentType {
  return value === 'out_invoice' || value === 'out_refund' || value === 'in_invoice' || value === 'in_refund';
}

function parseGregorianDate(value: string): GregorianDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function calendarDayNumber(value: string): number | null {
  const parts = parseGregorianDate(value);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000 : null;
}

function inclusiveCalendarDays(from: string, to: string): number | null {
  const start = calendarDayNumber(from);
  const end = calendarDayNumber(to);
  if (start == null || end == null || end < start) return null;
  return end - start + 1;
}

function monthKey(date: string): JalaliMonthKey | null {
  const parts = parseGregorianDate(date);
  if (!parts) return null;
  const { jy, jm } = jalaali.toJalaali(parts.year, parts.month, parts.day);
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

function monthKeys(from: string, to: string): JalaliMonthKey[] {
  const fromParts = parseGregorianDate(from);
  const toParts = parseGregorianDate(to);
  if (!fromParts || !toParts) return [];

  const fromJalali = jalaali.toJalaali(fromParts.year, fromParts.month, fromParts.day);
  const toJalali = jalaali.toJalaali(toParts.year, toParts.month, toParts.day);
  const result: JalaliMonthKey[] = [];
  let year = fromJalali.jy;
  let month = fromJalali.jm;
  while (year < toJalali.jy || (year === toJalali.jy && month <= toJalali.jm)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (result.length > 240) break;
  }
  return result;
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localDayBoundaryAsUtc(date: string, endOfDay: boolean): string {
  const parts = parseGregorianDate(date);
  if (!parts) return date;
  const local = new Date(parts.year, parts.month - 1, parts.day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function odooUtcToIso(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return '';
  return `${raw.replace(' ', 'T')}Z`;
}

function odooDate(value: unknown): string | null {
  const date = stringValue(value).slice(0, 10);
  return parseGregorianDate(date) ? date : null;
}

function odooUtcToLocalDate(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(`${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : localDate(date);
}

function convertQuantity(quantity: number, fromUomId: number, toUomId: number, uoms: Map<number, UomInfo>): number {
  if (!fromUomId || !toUomId || fromUomId === toUomId) return quantity;
  const from = uoms.get(fromUomId);
  const to = uoms.get(toUomId);
  if (!from || !to || from.categoryId !== to.categoryId || !from.factor) return quantity;
  return quantity / from.factor * to.factor;
}

function aggregateSales(lines: InvoiceLine[]): Map<number, SalesAggregate> {
  const result = new Map<number, SalesAggregate>();
  for (const line of lines) {
    if (line.type !== 'out_invoice' && line.type !== 'out_refund') continue;
    if (!result.has(line.productId)) {
      result.set(line.productId, {
        netQuantity: 0,
        grossQuantity: 0,
        returnedQuantity: 0,
        netRevenue: 0,
        grossRevenue: 0,
        refundedRevenue: 0,
      });
    }
    const aggregate = result.get(line.productId)!;
    const signedQuantity = documentSign(line.type) * line.baseQuantity;
    const revenue = -line.companyAmount;
    aggregate.netQuantity += signedQuantity;
    aggregate.netRevenue += revenue;
    if (line.type === 'out_invoice') {
      aggregate.grossQuantity += line.baseQuantity;
      aggregate.grossRevenue += revenue;
    } else {
      aggregate.returnedQuantity += line.baseQuantity;
      aggregate.refundedRevenue -= revenue;
    }
  }
  return result;
}

function priceMargin(purchasePrice: number | null, salePrice: number | null): number | null {
  return purchasePrice != null && salePrice != null && salePrice > 0
    ? (salePrice - purchasePrice) / salePrice * 100
    : null;
}

function sameNullableNumber(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left === right;
  return Math.abs(left - right) < 0.000001;
}

function buildPriceTimeline(
  days: LifecycleDailyAggregate[],
  firstAvailableDate: string | null,
  today: string,
  currentPurchasePrice: number,
  currentSalePrice: number,
): ProductPriceTimelinePoint[] {
  let latestPurchasePrice: number | null = null;
  let latestSalePrice: number | null = null;
  const points: ProductPriceTimelinePoint[] = [];
  const timelineDays = firstAvailableDate
    ? days
      .filter((day) => day.date >= firstAvailableDate
        && day.date <= today
        && (day.purchaseQuantity > 0 || day.saleQuantity > 0))
      .sort((left, right) => left.date.localeCompare(right.date))
    : [];
  for (const event of timelineDays) {
    const date = event.date;
    const purchaseObserved = event.purchaseQuantity > 0;
    const saleObserved = event.saleQuantity > 0;
    if (purchaseObserved) latestPurchasePrice = event.purchaseAmount / event.purchaseQuantity;
    if (saleObserved) latestSalePrice = event.saleAmount / event.saleQuantity;
    const point: ProductPriceTimelinePoint = {
      date,
      purchasePrice: latestPurchasePrice,
      salePrice: latestSalePrice,
      marginPercent: priceMargin(latestPurchasePrice, latestSalePrice),
      purchaseObserved,
      saleObserved,
      isCurrent: false,
    };
    const previous = points.at(-1);
    if (previous
      && sameNullableNumber(previous.purchasePrice, point.purchasePrice)
      && sameNullableNumber(previous.salePrice, point.salePrice)
      && sameNullableNumber(previous.marginPercent, point.marginPercent)) {
      continue;
    }
    points.push(point);
  }

  const currentPoint: ProductPriceTimelinePoint = {
    date: today,
    purchasePrice: currentPurchasePrice,
    salePrice: currentSalePrice,
    marginPercent: priceMargin(currentPurchasePrice, currentSalePrice),
    purchaseObserved: false,
    saleObserved: false,
    isCurrent: true,
  };
  const todayHistoricalPoint = points.find((point) => point.date === today);
  if (todayHistoricalPoint
    && sameNullableNumber(todayHistoricalPoint.purchasePrice, currentPoint.purchasePrice)
    && sameNullableNumber(todayHistoricalPoint.salePrice, currentPoint.salePrice)) {
    return points.map((point) => point.date === today
      ? {
        ...currentPoint,
        purchaseObserved: point.purchaseObserved,
        saleObserved: point.saleObserved,
      }
      : point);
  }
  return [...points, currentPoint]
    .sort((left, right) => left.date.localeCompare(right.date) || Number(left.isCurrent) - Number(right.isCurrent));
}

async function readProduct(productId: number): Promise<OdooRow | null> {
  const domain = [['id', '=', productId]];
  const baseFields = [
    'name', 'display_name', 'barcode', 'list_price', 'standard_price', 'qty_available',
    'categ_id', 'uom_id', 'image_128', 'product_tmpl_id', 'active', 'company_id', 'currency_id',
  ];
  try {
    const rows = asRows(await searchRead('product.product', domain, [...baseFields, 'fmcg_reorder_threshold'], 1));
    return rows[0] || null;
  } catch {
    const rows = asRows(await searchRead('product.product', domain, baseFields, 1));
    return rows[0] || null;
  }
}

const LIFECYCLE_INVOICE_PAGE_SIZE = 500;

async function readLifecycleInvoiceRows(
  productId: number,
  baseUomId: number,
  companyId: number,
  today: string,
): Promise<LifecycleInvoiceResult> {
  try {
    const baseDomain: unknown[] = [
      ['product_id', '=', productId],
      ['parent_state', '=', 'posted'],
      ['display_type', '=', 'product'],
      ['move_id.move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']],
      ['date', '<=', today],
    ];
    if (companyId) baseDomain.push(['company_id', '=', companyId]);

    const dailyAggregates = new Map<string, LifecycleDailyAggregate>();
    const uomMap = new Map<number, UomInfo>();
    const loadedUomIds = new Set<number>();
    let firstPurchaseDocumentDate: string | null = null;
    let firstProductDocumentDate: string | null = null;
    let lastId = 0;

    while (true) {
      const page = asRows(await searchRead('account.move.line', [
        ...baseDomain,
        ['id', '>', lastId],
      ], [
        'id', 'date', 'move_type', 'product_uom_id', 'quantity', 'balance',
      ], LIFECYCLE_INVOICE_PAGE_SIZE, 0, 'id asc'));
      if (page.length === 0) break;

      const nextLastId = numberValue(page.at(-1)?.id);
      if (!Number.isInteger(nextLastId) || nextLastId <= lastId) {
        throw new Error('Lifecycle invoice pagination did not advance');
      }

      const requiredUomIds = [...new Set([
        baseUomId,
        ...page.map((row) => relationId(row.product_uom_id)),
      ].filter(Boolean))];
      const missingUomIds = requiredUomIds.filter((id) => !loadedUomIds.has(id));
      if (missingUomIds.length > 0) {
        const uomRows = asRows(await searchRead(
          'uom.uom',
          [['id', 'in', missingUomIds]],
          ['factor', 'category_id'],
          missingUomIds.length,
          0,
          'id asc',
        ));
        for (const row of uomRows) {
          uomMap.set(row.id, { factor: numberValue(row.factor), categoryId: relationId(row.category_id) });
        }
        for (const uomId of missingUomIds) loadedUomIds.add(uomId);
      }

      for (const row of page) {
        if (!isDocumentType(row.move_type)) continue;
        const date = odooDate(row.date);
        if (!date) continue;
        if (!firstProductDocumentDate || date < firstProductDocumentDate) firstProductDocumentDate = date;
        if (row.move_type === 'in_invoice'
          && (!firstPurchaseDocumentDate || date < firstPurchaseDocumentDate)) {
          firstPurchaseDocumentDate = date;
        }

        const baseQuantity = convertQuantity(
          numberValue(row.quantity),
          relationId(row.product_uom_id),
          baseUomId,
          uomMap,
        );
        const aggregate = dailyAggregates.get(date) || {
          date,
          netSoldQuantity: 0,
          purchaseAmount: 0,
          purchaseQuantity: 0,
          saleAmount: 0,
          saleQuantity: 0,
        };
        let contributesToDailyAggregate = false;
        if (row.move_type === 'out_invoice' || row.move_type === 'out_refund') {
          aggregate.netSoldQuantity += documentSign(row.move_type) * baseQuantity;
          contributesToDailyAggregate = true;
        }

        const priceQuantity = Math.abs(baseQuantity);
        if (priceQuantity > 0 && row.move_type === 'in_invoice') {
          aggregate.purchaseAmount += Math.abs(numberValue(row.balance));
          aggregate.purchaseQuantity += priceQuantity;
          contributesToDailyAggregate = true;
        } else if (priceQuantity > 0 && row.move_type === 'out_invoice') {
          aggregate.saleAmount += Math.abs(numberValue(row.balance));
          aggregate.saleQuantity += priceQuantity;
          contributesToDailyAggregate = true;
        }
        if (contributesToDailyAggregate) dailyAggregates.set(date, aggregate);
      }

      lastId = nextLastId;
      if (page.length < LIFECYCLE_INVOICE_PAGE_SIZE) break;
    }

    return {
      days: [...dailyAggregates.values()].sort((left, right) => left.date.localeCompare(right.date)),
      firstPurchaseDocumentDate,
      firstProductDocumentDate,
      available: true,
    };
  } catch {
    return {
      days: [],
      firstPurchaseDocumentDate: null,
      firstProductDocumentDate: null,
      available: false,
    };
  }
}

async function readFirstStockAvailabilityDate(
  productId: number,
  companyId: number,
  today: string,
): Promise<StockAvailabilityResult> {
  try {
    const domain: unknown[] = [
      ['product_id', '=', productId],
      ['state', '=', 'done'],
      ['location_dest_id.usage', '=', 'internal'],
      ['location_id.usage', '!=', 'internal'],
      ['date', '<=', localDayBoundaryAsUtc(today, true)],
    ];
    if (companyId) domain.push(['company_id', '=', companyId]);
    const rows = asRows(await searchRead('stock.move', domain, ['date'], 1, 0, 'date asc, id asc'));
    return { available: true, date: rows[0] ? odooUtcToLocalDate(rows[0].date) : null };
  } catch {
    return { available: false, date: null };
  }
}

async function readStockMovements(
  productId: number,
  companyId: number,
  dateFrom: string,
  dateTo: string,
): Promise<{ rows: ProductStockMovement[]; available: boolean; truncated: boolean }> {
  try {
    const domain: unknown[] = [
      ['product_id', '=', productId],
      ['state', '=', 'done'],
      ['date', '>=', localDayBoundaryAsUtc(dateFrom, false)],
      ['date', '<=', localDayBoundaryAsUtc(dateTo, true)],
    ];
    if (companyId) domain.push(['company_id', '=', companyId]);
    const moves = asRows(await searchRead('stock.move', domain, [
      'date', 'quantity', 'location_id', 'location_dest_id', 'picking_id', 'origin', 'reference',
    ], 301, 0, 'date desc, id desc'));
    const truncated = moves.length > 300;
    const visibleMoves = moves.slice(0, 300);

    const locationIds = [...new Set(visibleMoves.flatMap((move) => [
      relationId(move.location_id), relationId(move.location_dest_id),
    ]).filter(Boolean))];
    const locations = locationIds.length > 0
      ? asRows(await searchRead('stock.location', [['id', 'in', locationIds]], ['name', 'complete_name', 'usage']))
      : [];
    const locationMap = new Map<number, { name: string; usage: string }>();
    for (const location of locations) {
      locationMap.set(location.id, {
        name: stringValue(location.complete_name) || stringValue(location.name),
        usage: stringValue(location.usage),
      });
    }

    const rows = visibleMoves.map((move): ProductStockMovement => {
      const sourceId = relationId(move.location_id);
      const destinationId = relationId(move.location_dest_id);
      const source = locationMap.get(sourceId) || { name: relationName(move.location_id), usage: '' };
      const destination = locationMap.get(destinationId) || { name: relationName(move.location_dest_id), usage: '' };
      const quantity = Math.abs(numberValue(move.quantity));
      let kind: ProductStockMovement['kind'] = 'transfer';
      let signedQuantity = 0;

      if (source.usage === 'supplier' && destination.usage === 'internal') {
        kind = 'purchase'; signedQuantity = quantity;
      } else if (source.usage === 'internal' && destination.usage === 'customer') {
        kind = 'sale'; signedQuantity = -quantity;
      } else if (source.usage === 'customer' && destination.usage === 'internal') {
        kind = 'sale_return'; signedQuantity = quantity;
      } else if (source.usage === 'internal' && destination.usage === 'supplier') {
        kind = 'purchase_return'; signedQuantity = -quantity;
      } else if (source.usage === 'internal' && destination.usage !== 'internal') {
        kind = 'adjustment'; signedQuantity = -quantity;
      } else if (source.usage !== 'internal' && destination.usage === 'internal') {
        kind = 'adjustment'; signedQuantity = quantity;
      }

      return {
        id: move.id,
        date: odooUtcToIso(move.date),
        reference: stringValue(move.reference) || relationName(move.picking_id) || '—',
        origin: stringValue(move.origin) || '—',
        source: source.name || '—',
        destination: destination.name || '—',
        kind,
        signedQuantity,
      };
    });

    return { rows, available: true, truncated };
  } catch {
    return { rows: [], available: false, truncated: false };
  }
}

interface LifecycleReadResult {
  lifecycleInvoiceResult: LifecycleInvoiceResult;
  firstStockAvailabilityResult: StockAvailabilityResult;
}

interface LifecycleCacheEntry {
  promise: Promise<LifecycleReadResult>;
  expiresAt: number;
}

const LIFECYCLE_CACHE_TTL_MS = 5 * 60 * 1000;
const lifecycleReadCache = new Map<string, LifecycleCacheEntry>();

function readCachedLifecycleData(
  productId: number,
  baseUomId: number,
  companyId: number,
  today: string,
): Promise<LifecycleReadResult> {
  const now = Date.now();
  for (const [key, entry] of lifecycleReadCache) {
    if (entry.expiresAt <= now) lifecycleReadCache.delete(key);
  }

  const key = JSON.stringify([productId, baseUomId, companyId, today]);
  const cached = lifecycleReadCache.get(key);
  if (cached) return cached.promise;

  const promise = Promise.all([
    readLifecycleInvoiceRows(productId, baseUomId, companyId, today),
    readFirstStockAvailabilityDate(productId, companyId, today),
  ]).then(([lifecycleInvoiceResult, firstStockAvailabilityResult]) => ({
    lifecycleInvoiceResult,
    firstStockAvailabilityResult,
  }));
  const entry: LifecycleCacheEntry = {
    promise,
    expiresAt: now + LIFECYCLE_CACHE_TTL_MS,
  };
  lifecycleReadCache.set(key, entry);
  void promise.then(
    ({ lifecycleInvoiceResult, firstStockAvailabilityResult }) => {
      if ((!lifecycleInvoiceResult.available || !firstStockAvailabilityResult.available)
        && lifecycleReadCache.get(key) === entry) {
        lifecycleReadCache.delete(key);
      }
    },
    () => {
      if (lifecycleReadCache.get(key) === entry) lifecycleReadCache.delete(key);
    },
  );
  return promise;
}

export async function getProductAnalytics(
  productId: number,
  dateFrom: string,
  dateTo: string,
): Promise<ProductAnalyticsResult | null> {
  const [productRow, companies] = await Promise.all([
    readProduct(productId),
    searchRead('res.company', [], ['name', 'currency_id'], 1).then(asRows).catch(() => []),
  ]);
  if (!productRow) return null;

  const companyId = relationId(productRow.company_id) || companies[0]?.id || 0;
  const selectedProductBaseUomId = relationId(productRow.uom_id);
  const today = localDate(new Date());
  const lineDomain: unknown[] = [
    ['product_id', '!=', false],
    ['parent_state', '=', 'posted'],
    ['display_type', '=', 'product'],
    ['move_id.move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']],
    ['date', '>=', dateFrom],
    ['date', '<=', dateTo],
  ];
  const cogsDomain: unknown[] = [
    ['product_id', '!=', false],
    ['parent_state', '=', 'posted'],
    ['display_type', '=', 'cogs'],
    ['account_id.account_type', 'in', ['expense_direct_cost', 'expense']],
    ['date', '>=', dateFrom],
    ['date', '<=', dateTo],
  ];
  if (companyId) {
    lineDomain.push(['company_id', '=', companyId]);
    cogsDomain.push(['company_id', '=', companyId]);
  }

  const [invoiceRows, cogsRows, stockResult, lifecycleRead] = await Promise.all([
    searchRead('account.move.line', lineDomain, [
      'date', 'move_id', 'move_type', 'product_id', 'product_uom_id', 'partner_id',
      'quantity', 'balance', 'discount', 'company_currency_id',
    ], 0, 0, 'date desc, id desc').then(asRows),
    searchRead('account.move.line', cogsDomain, [
      'date', 'move_id', 'product_id', 'balance', 'cogs_origin_id',
    ], 0, 0, 'date asc, id asc').then(asRows).catch(() => []),
    readStockMovements(productId, companyId, dateFrom, dateTo),
    readCachedLifecycleData(productId, selectedProductBaseUomId, companyId, today),
  ]);
  const { lifecycleInvoiceResult, firstStockAvailabilityResult } = lifecycleRead;

  const firstAvailableDate = firstStockAvailabilityResult.date
    || lifecycleInvoiceResult.firstPurchaseDocumentDate
    || lifecycleInvoiceResult.firstProductDocumentDate;
  const lifecycleDays = firstAvailableDate
    ? lifecycleInvoiceResult.days.filter((day) => day.date >= firstAvailableDate && day.date <= today)
    : [];

  const productIds = [...new Set([...invoiceRows.map((line) => relationId(line.product_id)), productId].filter(Boolean))];
  const productRows = productIds.length > 0
    ? asRows(await searchRead('product.product', [['id', 'in', productIds]], ['display_name', 'standard_price', 'uom_id']))
    : [];
  const productCostMap = new Map<number, number>();
  const productUomMap = new Map<number, number>();
  for (const row of productRows) {
    productCostMap.set(row.id, numberValue(row.standard_price));
    productUomMap.set(row.id, relationId(row.uom_id));
  }
  productCostMap.set(productId, numberValue(productRow.standard_price));
  productUomMap.set(productId, selectedProductBaseUomId);

  const uomIds = [...new Set([
    ...invoiceRows.map((line) => relationId(line.product_uom_id)),
    ...productUomMap.values(),
  ].filter(Boolean))];
  const uomRows = uomIds.length > 0
    ? asRows(await searchRead('uom.uom', [['id', 'in', uomIds]], ['factor', 'category_id']))
    : [];
  const uomMap = new Map<number, UomInfo>();
  for (const row of uomRows) {
    uomMap.set(row.id, { factor: numberValue(row.factor), categoryId: relationId(row.category_id) });
  }

  const normalizeInvoiceRows = (rows: OdooRow[]): InvoiceLine[] => rows.flatMap((row) => {
    if (!isDocumentType(row.move_type)) return [];
    const currentProductId = relationId(row.product_id);
    if (!currentProductId) return [];
    const rawQuantity = numberValue(row.quantity);
    const baseQuantity = convertQuantity(
      rawQuantity,
      relationId(row.product_uom_id),
      productUomMap.get(currentProductId) || 0,
      uomMap,
    );
    return [{
      id: row.id,
      date: stringValue(row.date),
      moveId: relationId(row.move_id),
      moveName: relationName(row.move_id) || '—',
      type: row.move_type,
      productId: currentProductId,
      productName: relationName(row.product_id),
      partnerName: relationName(row.partner_id) || '—',
      baseQuantity,
      companyAmount: numberValue(row.balance),
      discount: numberValue(row.discount),
    }];
  });

  const invoiceLines = normalizeInvoiceRows(invoiceRows);

  const cogsByOriginLine = new Map<number, number>();
  for (const row of cogsRows) {
    const originId = relationId(row.cogs_origin_id);
    if (!originId) continue;
    cogsByOriginLine.set(originId, (cogsByOriginLine.get(originId) || 0) + numberValue(row.balance));
  }

  const salesMap = aggregateSales(invoiceLines);
  const selectedSales = salesMap.get(productId) || {
    netQuantity: 0,
    grossQuantity: 0,
    returnedQuantity: 0,
    netRevenue: 0,
    grossRevenue: 0,
    refundedRevenue: 0,
  };
  const selectedLines = invoiceLines.filter((line) => line.productId === productId);
  const selectedSaleLines = selectedLines.filter((line) => line.type === 'out_invoice' || line.type === 'out_refund');

  let actualCostLines = 0;
  let selectedCogs = 0;
  const cogsByMonth = new Map<JalaliMonthKey, number>();
  for (const line of selectedSaleLines) {
    const actual = cogsByOriginLine.get(line.id);
    const contribution = actual == null
      ? documentSign(line.type) * line.baseQuantity * numberValue(productRow.standard_price)
      : actual;
    if (actual != null) actualCostLines += 1;
    selectedCogs += contribution;
    const month = monthKey(line.date);
    if (month) cogsByMonth.set(month, (cogsByMonth.get(month) || 0) + contribution);
  }
  const costSource: CostSource = selectedSaleLines.length === 0
    ? 'none'
    : actualCostLines === selectedSaleLines.length
      ? 'actual'
      : actualCostLines > 0 ? 'mixed' : 'estimated';

  let netPurchasedQuantity = 0;
  let grossPurchasedQuantity = 0;
  let returnedPurchaseQuantity = 0;
  let netPurchaseAmount = 0;
  let lastSaleDate: string | null = null;
  let lastPurchaseDate: string | null = null;
  const saleDocumentIds = new Set<number>();
  const purchaseDocumentIds = new Set<number>();

  for (const line of selectedLines) {
    const signedQuantity = documentSign(line.type) * line.baseQuantity;
    if (line.type === 'out_invoice' || line.type === 'out_refund') {
      if (line.moveId) saleDocumentIds.add(line.moveId);
      if (line.type === 'out_invoice' && (!lastSaleDate || line.date > lastSaleDate)) lastSaleDate = line.date;
    } else {
      if (line.moveId) purchaseDocumentIds.add(line.moveId);
      netPurchasedQuantity += signedQuantity;
      netPurchaseAmount += line.companyAmount;
      if (line.type === 'in_invoice') {
        grossPurchasedQuantity += line.baseQuantity;
        if (!lastPurchaseDate || line.date > lastPurchaseDate) lastPurchaseDate = line.date;
      } else {
        returnedPurchaseQuantity += line.baseQuantity;
      }
    }
  }

  const grossProfit = selectedSales.netRevenue - selectedCogs;
  const grossMargin = selectedSales.netRevenue > 0 ? (grossProfit / selectedSales.netRevenue) * 100 : null;
  const lifetimeSoldQuantity = lifecycleInvoiceResult.available
    ? lifecycleDays.reduce((total, day) => total + day.netSoldQuantity, 0)
    : null;
  const lifetimeObservationDays = firstAvailableDate ? inclusiveCalendarDays(firstAvailableDate, today) : null;
  const stockCoverageDays = lifetimeObservationDays != null
    && lifetimeSoldQuantity != null
    && lifetimeSoldQuantity > 0
    ? Math.max(numberValue(productRow.qty_available), 0) * lifetimeObservationDays / lifetimeSoldQuantity
    : null;

  const rankRows = [...salesMap.entries()].map(([id, aggregate]) => ({
    id,
    revenue: aggregate.netRevenue,
    estimatedProfit: aggregate.netRevenue - aggregate.netQuantity * (productCostMap.get(id) || 0),
  })).filter((row) => row.revenue !== 0 || row.estimatedProfit !== 0);
  const salesSorted = [...rankRows].sort((a, b) => b.revenue - a.revenue || a.id - b.id);
  const profitSorted = [...rankRows].sort((a, b) => b.estimatedProfit - a.estimatedProfit || a.id - b.id);
  const salesRankIndex = salesSorted.findIndex((row) => row.id === productId);
  const profitRankIndex = profitSorted.findIndex((row) => row.id === productId);

  const trendMap = new Map<JalaliMonthKey, ProductAnalyticsTrend>();
  for (const month of monthKeys(dateFrom, dateTo)) {
    trendMap.set(month, { month, soldQuantity: 0, purchasedQuantity: 0, revenue: 0, purchaseAmount: 0, cogs: 0, profit: 0 });
  }
  for (const line of selectedLines) {
    const month = monthKey(line.date);
    if (!month) continue;
    const trend = trendMap.get(month);
    if (!trend) continue;
    const signedQuantity = documentSign(line.type) * line.baseQuantity;
    if (line.type === 'out_invoice' || line.type === 'out_refund') {
      trend.soldQuantity += signedQuantity;
      trend.revenue += -line.companyAmount;
    } else {
      trend.purchasedQuantity += signedQuantity;
      trend.purchaseAmount += line.companyAmount;
    }
  }
  for (const trend of trendMap.values()) {
    trend.cogs = cogsByMonth.get(trend.month) || 0;
    trend.profit = trend.revenue - trend.cogs;
  }

  const priceTimeline = buildPriceTimeline(
    lifecycleInvoiceResult.days,
    firstAvailableDate,
    today,
    numberValue(productRow.standard_price),
    numberValue(productRow.list_price),
  );

  const transactions = selectedLines.map((line): ProductFinancialTransaction => {
    const quantity = documentSign(line.type) * line.baseQuantity;
    const amount = line.type === 'out_invoice' || line.type === 'out_refund'
      ? -line.companyAmount
      : line.companyAmount;
    return {
      id: line.id,
      date: line.date,
      moveId: line.moveId,
      moveName: line.moveName,
      partnerName: line.partnerName,
      type: line.type,
      quantity,
      unitPrice: quantity !== 0 ? Math.abs(amount / quantity) : 0,
      amount,
      discount: line.discount,
    };
  });

  return {
    product: {
      id: productRow.id,
      name: stringValue(productRow.name) || stringValue(productRow.display_name),
      displayName: stringValue(productRow.display_name) || stringValue(productRow.name),
      barcode: stringValue(productRow.barcode) || false,
      category: relationName(productRow.categ_id) || 'بدون دسته‌بندی',
      uom: relationName(productRow.uom_id) || 'عدد',
      listPrice: numberValue(productRow.list_price),
      standardPrice: numberValue(productRow.standard_price),
      quantityAvailable: numberValue(productRow.qty_available),
      reorderThreshold: numberValue(productRow.fmcg_reorder_threshold),
      image: stringValue(productRow.image_128) || false,
      templateId: relationId(productRow.product_tmpl_id),
      templateName: relationName(productRow.product_tmpl_id) || stringValue(productRow.name),
    },
    metrics: {
      netSoldQuantity: selectedSales.netQuantity,
      grossSoldQuantity: selectedSales.grossQuantity,
      returnedSaleQuantity: selectedSales.returnedQuantity,
      netRevenue: selectedSales.netRevenue,
      grossRevenue: selectedSales.grossRevenue,
      refundedRevenue: selectedSales.refundedRevenue,
      netPurchasedQuantity,
      grossPurchasedQuantity,
      returnedPurchaseQuantity,
      netPurchaseAmount,
      cogs: selectedCogs,
      grossProfit,
      grossMargin,
      averageSalePrice: selectedSales.netQuantity > 0 ? selectedSales.netRevenue / selectedSales.netQuantity : null,
      averagePurchasePrice: netPurchasedQuantity > 0 ? netPurchaseAmount / netPurchasedQuantity : null,
      inventoryValue: numberValue(productRow.qty_available) * numberValue(productRow.standard_price),
      returnRate: selectedSales.grossQuantity > 0 ? (selectedSales.returnedQuantity / selectedSales.grossQuantity) * 100 : null,
      stockCoverageDays,
      firstAvailableDate,
      lifetimeSoldQuantity,
      lifetimeObservationDays,
      lastSaleDate,
      lastPurchaseDate,
      saleDocumentCount: saleDocumentIds.size,
      purchaseDocumentCount: purchaseDocumentIds.size,
      costSource,
      actualCostCoverage: selectedSaleLines.length > 0 ? actualCostLines / selectedSaleLines.length * 100 : null,
    },
    ranking: {
      salesRank: salesRankIndex >= 0 ? salesRankIndex + 1 : null,
      profitRank: profitRankIndex >= 0 ? profitRankIndex + 1 : null,
      comparedProducts: rankRows.length,
    },
    trends: [...trendMap.values()],
    priceTimeline,
    transactions,
    stockMovements: stockResult.rows,
    stockHistoryAvailable: stockResult.available,
    stockHistoryTruncated: stockResult.truncated,
  };
}
