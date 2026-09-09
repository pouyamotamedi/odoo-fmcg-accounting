import { searchRead } from '@/lib/odoo-api';

export type ProductDocumentType = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund';
export type CostSource = 'actual' | 'mixed' | 'estimated' | 'none';

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
  month: string;
  soldQuantity: number;
  purchasedQuantity: number;
  revenue: number;
  purchaseAmount: number;
  cogs: number;
  profit: number;
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

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthKeys(from: string, to: string): string[] {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) return [];

  const result: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
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

function daysInRange(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const milliseconds = end.getTime() - start.getTime();
  return Number.isFinite(milliseconds) ? Math.max(1, Math.floor(milliseconds / 86_400_000) + 1) : 1;
}

function localDayBoundaryAsUtc(date: string, endOfDay: boolean): string {
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function odooUtcToIso(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return '';
  return `${raw.replace(' ', 'T')}Z`;
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

  const [invoiceRows, cogsRows, stockResult] = await Promise.all([
    searchRead('account.move.line', lineDomain, [
      'date', 'move_id', 'move_type', 'product_id', 'product_uom_id', 'partner_id',
      'quantity', 'balance', 'discount', 'company_currency_id',
    ], 0, 0, 'date desc, id desc').then(asRows),
    searchRead('account.move.line', cogsDomain, [
      'date', 'move_id', 'product_id', 'balance', 'cogs_origin_id',
    ], 0, 0, 'date asc, id asc').then(asRows).catch(() => []),
    readStockMovements(productId, companyId, dateFrom, dateTo),
  ]);

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
  productUomMap.set(productId, relationId(productRow.uom_id));

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

  const invoiceLines: InvoiceLine[] = invoiceRows.flatMap((row) => {
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
  const cogsByMonth = new Map<string, number>();
  for (const line of selectedSaleLines) {
    const actual = cogsByOriginLine.get(line.id);
    const contribution = actual == null
      ? documentSign(line.type) * line.baseQuantity * numberValue(productRow.standard_price)
      : actual;
    if (actual != null) actualCostLines += 1;
    selectedCogs += contribution;
    const month = monthKey(line.date);
    cogsByMonth.set(month, (cogsByMonth.get(month) || 0) + contribution);
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
  const rangeDays = daysInRange(dateFrom, dateTo);
  const dailySales = selectedSales.netQuantity > 0 ? selectedSales.netQuantity / rangeDays : 0;
  const stockCoverageDays = dailySales > 0 ? Math.max(0, numberValue(productRow.qty_available)) / dailySales : null;

  const rankRows = [...salesMap.entries()].map(([id, aggregate]) => ({
    id,
    revenue: aggregate.netRevenue,
    estimatedProfit: aggregate.netRevenue - aggregate.netQuantity * (productCostMap.get(id) || 0),
  })).filter((row) => row.revenue !== 0 || row.estimatedProfit !== 0);
  const salesSorted = [...rankRows].sort((a, b) => b.revenue - a.revenue || a.id - b.id);
  const profitSorted = [...rankRows].sort((a, b) => b.estimatedProfit - a.estimatedProfit || a.id - b.id);
  const salesRankIndex = salesSorted.findIndex((row) => row.id === productId);
  const profitRankIndex = profitSorted.findIndex((row) => row.id === productId);

  const trendMap = new Map<string, ProductAnalyticsTrend>();
  for (const month of monthKeys(dateFrom, dateTo)) {
    trendMap.set(month, { month, soldQuantity: 0, purchasedQuantity: 0, revenue: 0, purchaseAmount: 0, cogs: 0, profit: 0 });
  }
  for (const line of selectedLines) {
    const trend = trendMap.get(monthKey(line.date));
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
    transactions,
    stockMovements: stockResult.rows,
    stockHistoryAvailable: stockResult.available,
    stockHistoryTruncated: stockResult.truncated,
  };
}
