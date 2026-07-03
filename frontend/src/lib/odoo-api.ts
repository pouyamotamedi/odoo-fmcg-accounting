/**
 * Odoo JSON-RPC API Client
 * Handles all communication with Odoo backend
 */

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL || '/api';
const ODOO_DB = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data: { message: string; debug: string };
  };
}

async function jsonRpc(url: string, params: any): Promise<any> {
  const response = await fetch(`${ODOO_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'call',
      params,
    }),
  });

  const data: JsonRpcResponse = await response.json();

  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || 'خطای سرور');
  }

  return data.result;
}

// ============ Authentication ============

export async function login(username: string, password: string) {
  const result = await jsonRpc('/web/session/authenticate', {
    db: ODOO_DB,
    login: username,
    password: password,
  });

  if (!result.uid) {
    throw new Error('نام کاربری یا رمز عبور اشتباه است');
  }

  return {
    uid: result.uid,
    name: result.name,
    username: result.username,
    sessionId: result.session_id,
  };
}

export async function logout() {
  await jsonRpc('/web/session/destroy', {});
}

// ============ CRUD Operations ============

export async function searchRead(
  model: string,
  domain: any[] = [],
  fields: string[] = [],
  limit?: number,
  offset?: number,
  order?: string
) {
  return await jsonRpc('/web/dataset/call_kw', {
    model,
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields,
      limit: limit || 0,
      offset: offset || 0,
      order: order || '',
    },
  });
}

export async function create(model: string, values: Record<string, any>) {
  return await jsonRpc('/web/dataset/call_kw', {
    model,
    method: 'create',
    args: [values],
    kwargs: {},
  });
}

export async function write(model: string, ids: number[], values: Record<string, any>) {
  return await jsonRpc('/web/dataset/call_kw', {
    model,
    method: 'write',
    args: [ids, values],
    kwargs: {},
  });
}

export async function unlink(model: string, ids: number[]) {
  return await jsonRpc('/web/dataset/call_kw', {
    model,
    method: 'unlink',
    args: [ids],
    kwargs: {},
  });
}

export async function callMethod(model: string, method: string, args: any[] = [], kwargs: any = {}) {
  return await jsonRpc('/web/dataset/call_kw', {
    model,
    method,
    args,
    kwargs,
  });
}

// ============ Products ============

export async function getProducts(limit?: number) {
  // First try with FMCG fields, fallback to basic fields if module not installed
  try {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'fmcg_reorder_threshold', 'fmcg_is_low_stock'],
      limit
    );
  } catch {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'barcode', 'list_price', 'standard_price', 'qty_available'],
      limit
    );
  }
}

export async function createProduct(values: {
  name: string;
  barcode?: string;
  list_price: number;
  standard_price: number;
  type?: string;
  fmcg_reorder_threshold?: number;
}) {
  return create('product.product', {
    name: values.name,
    barcode: values.barcode || false,
    list_price: values.list_price,
    standard_price: values.standard_price,
    type: values.type || 'consu',
    fmcg_reorder_threshold: values.fmcg_reorder_threshold || 10,
  });
}

export async function updateProduct(id: number, values: Record<string, any>) {
  return write('product.product', [id], values);
}

export async function deleteProduct(id: number) {
  return write('product.product', [id], { active: false });
}

// ============ Partners (People) ============

export async function getPartners(role?: string) {
  const domain: any[] = [['active', '=', true]];
  if (role === 'supplier') domain.push(['supplier_rank', '>', 0]);
  if (role === 'customer') domain.push(['customer_rank', '>', 0]);
  return searchRead('res.partner', domain, [
    'name', 'phone', 'mobile', 'supplier_rank', 'customer_rank', 'email', 'comment',
  ]);
}

export async function createPartner(values: {
  name: string;
  phone?: string;
  mobile?: string;
  supplier_rank?: number;
  customer_rank?: number;
  comment?: string;
}) {
  return create('res.partner', {
    name: values.name,
    phone: values.phone || false,
    mobile: values.mobile || false,
    supplier_rank: values.supplier_rank || 0,
    customer_rank: values.customer_rank || 0,
    comment: values.comment || false,
  });
}

export async function updatePartner(id: number, values: Record<string, any>) {
  return write('res.partner', [id], values);
}

// ============ Seller Users (POS-only access) ============

export async function createSellerUser(values: {
  name: string;
  login: string;
  password: string;
  phone?: string;
}) {
  return callMethod('res.users', 'fmcg_create_seller', [], {
    name: values.name,
    login: values.login,
    password: values.password,
    phone: values.phone || false,
  });
}

export async function getSellerUsers() {
  return searchRead('res.users', [['share', '=', false]], ['name', 'login', 'fmcg_is_seller']);
}

// ============ Customer Credits ============

export async function getCustomerCredits(state?: string) {
  const domain: any[] = [];
  if (state) {
    domain.push(['state', '=', state]);
  } else {
    domain.push(['state', 'in', ['open', 'partial']]);
  }
  try {
    return await searchRead('fmcg.customer.credit', domain, [
      'partner_id', 'amount', 'remaining', 'paid_amount', 'date', 'state', 'note', 'invoice_ref',
    ]);
  } catch (e: any) {
    // Model may not exist if module not installed
    if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('does not exist')) {
      return [];
    }
    throw e;
  }
}

export async function createCustomerCredit(values: {
  partner_id: number;
  amount: number;
  note?: string;
  invoice_ref?: string;
}) {
  return create('fmcg.customer.credit', {
    partner_id: values.partner_id,
    amount: values.amount,
    note: values.note || false,
    invoice_ref: values.invoice_ref || false,
  });
}

export async function recordRepayment(values: {
  credit_id: number;
  amount: number;
  note?: string;
}) {
  return create('fmcg.credit.repayment', {
    credit_id: values.credit_id,
    amount: values.amount,
    note: values.note || false,
  });
}

// ============ Bank & Cash ============

export async function getBankCashBalances() {
  // Try with FMCG fields first, fallback to basic fields
  try {
    return await searchRead('account.journal', [['type', 'in', ['bank', 'cash']]], [
      'name', 'type', 'fmcg_running_balance', 'fmcg_is_active', 'fmcg_opening_balance',
      'fmcg_account_holder', 'fmcg_account_number',
    ]);
  } catch {
    return await searchRead('account.journal', [['type', 'in', ['bank', 'cash']]], [
      'name', 'type',
    ]);
  }
}

// ============ POS Orders ============

export async function createPosOrder(values: {
  lines: Array<{ product_id: number; qty: number; price_unit: number }>;
  payment_method: 'cash' | 'card' | 'credit';
  partner_id?: number;
  note?: string;
}) {
  // Create as account.move (invoice) since standard POS may not be installed
  const invoice_lines = values.lines.map((line) => [
    0, 0, {
      product_id: line.product_id,
      quantity: line.qty,
      price_unit: line.price_unit,
    },
  ]);

  const today = new Date().toISOString().split('T')[0];

  // For cash/card sales without a specific customer, use a default walk-in partner
  // or skip partner_id (some Odoo configs require it).
  let partner_id = values.partner_id || false;
  
  // If partner is required, find or create a generic "مشتری عمومی" partner
  if (!partner_id) {
    try {
      const existing = await searchRead('res.partner', [['name', '=', 'مشتری عمومی']], ['id'], 1);
      if (existing && existing.length > 0) {
        partner_id = existing[0].id;
      } else {
        partner_id = await create('res.partner', { name: 'مشتری عمومی', customer_rank: 1 });
      }
    } catch {
      // If all else fails, try without partner
      partner_id = false;
    }
  }

  return create('account.move', {
    move_type: 'out_invoice',
    partner_id: partner_id,
    invoice_date: today,
    date: today,
    invoice_line_ids: invoice_lines,
    narration: values.note || false,
  });
}

export async function confirmInvoice(invoiceId: number) {
  return callMethod('account.move', 'action_post', [[invoiceId]]);
}

// ============ PAX S800 Card Terminal ============

/**
 * Send a card payment amount to the PAX S800 terminal via the Odoo bridge.
 * The browser cannot open TCP sockets, so this posts to an Odoo controller
 * that forwards the amount to the terminal over the POSLink protocol.
 */
export async function payWithPaxTerminal(amount: number, transType: 'sale' | 'return' = 'sale', ecrRef = '1') {
  return jsonRpc('/fmcg/pax/pay', {
    amount,
    trans_type: transType,
    ecr_ref: ecrRef,
  });
}

// ============ Purchase Invoices ============

export async function getPurchaseInvoices(state?: string) {
  const domain: any[] = [['move_type', '=', 'in_invoice']];
  if (state === 'posted') domain.push(['state', '=', 'posted']);
  else if (state === 'draft') domain.push(['state', '=', 'draft']);
  if (state === 'paid') {
    domain.push(['state', '=', 'posted']);
    domain.push(['payment_state', '=', 'paid']);
  }
  return searchRead('account.move', domain, [
    'name', 'partner_id', 'amount_total', 'invoice_date', 'state', 'payment_state',
  ], 50, 0, 'create_date desc');
}

export async function createPurchaseInvoice(values: {
  partner_id: number;
  lines: Array<{ product_id: number; quantity: number; price_unit: number }>;
  payment_method: 'cash' | 'bank' | 'credit';
  note?: string;
}) {
  const invoice_lines = values.lines.map((line) => [
    0, 0, {
      product_id: line.product_id,
      quantity: line.quantity,
      price_unit: line.price_unit,
    },
  ]);

  const today = new Date().toISOString().split('T')[0];

  const invoiceId = await create('account.move', {
    move_type: 'in_invoice',
    partner_id: values.partner_id,
    invoice_date: today,
    date: today,
    invoice_line_ids: invoice_lines,
    narration: values.note || false,
  });

  // Auto-confirm the purchase invoice
  await confirmInvoice(invoiceId);

  return invoiceId;
}

// ============ Stock Adjustment ============

export async function createStockAdjustment(values: {
  product_id: number;
  quantity: number;
  reason: 'damaged' | 'expired' | 'lost' | 'other';
  note: string;
}) {
  const id = await create('fmcg.stock.adjustment', {
    product_id: values.product_id,
    quantity: values.quantity,
    reason: values.reason,
    note: values.note,
  });
  // Auto-confirm
  await callMethod('fmcg.stock.adjustment', 'action_confirm', [[id]]);
  return id;
}

// ============ Sales Returns ============

export async function createSalesReturn(values: {
  partner_id?: number;
  lines: Array<{ product_id: number; quantity: number; price_unit: number }>;
  return_to_stock: boolean;
  refund_method: 'cash' | 'bank' | 'credit';
  note?: string;
}) {
  // Create credit note (refund)
  const refund_lines = values.lines.map((line) => [
    0, 0, {
      product_id: line.product_id,
      quantity: line.quantity,
      price_unit: line.price_unit,
    },
  ]);

  const refundId = await create('account.move', {
    move_type: 'out_refund',
    partner_id: values.partner_id || false,
    invoice_line_ids: refund_lines,
    narration: values.note || false,
  });

  await confirmInvoice(refundId);

  return refundId;
}

// ============ Reports ============

export async function getDailySalesReport(dateFrom: string, dateTo: string) {
  return searchRead(
    'account.move',
    [
      ['move_type', '=', 'out_invoice'],
      ['state', '=', 'posted'],
      ['invoice_date', '>=', dateFrom],
      ['invoice_date', '<=', dateTo],
    ],
    ['name', 'partner_id', 'amount_total', 'invoice_date', 'payment_state'],
    0, 0, 'invoice_date desc'
  );
}

export async function getInventoryReport() {
  try {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'qty_available', 'standard_price', 'list_price', 'fmcg_is_low_stock', 'fmcg_reorder_threshold'],
      0, 0, 'name asc'
    );
  } catch {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'qty_available', 'standard_price', 'list_price'],
      0, 0, 'name asc'
    );
  }
}

export async function getCreditAgingReport() {
  try {
    return await searchRead(
      'fmcg.customer.credit',
      [['state', 'in', ['open', 'partial']]],
      ['partner_id', 'amount', 'remaining', 'date', 'state'],
      0, 0, 'date asc'
    );
  } catch {
    return [];
  }
}

export async function getCashFlowReport(dateFrom: string, dateTo: string) {
  return searchRead(
    'account.move',
    [
      ['state', '=', 'posted'],
      ['date', '>=', dateFrom],
      ['date', '<=', dateTo],
    ],
    ['name', 'move_type', 'amount_total', 'date', 'journal_id'],
    0, 0, 'date desc'
  );
}

// ============ Company Settings ============

export async function getCompanySettings() {
  const companies = await searchRead('res.company', [], [
    'name', 'currency_id',
  ], 1);
  if (!companies || companies.length === 0) return null;
  
  const company = companies[0];
  
  // Try to read FMCG-specific fields (may not exist if module not installed)
  try {
    const fmcgData = await searchRead('res.company', [['id', '=', company.id]], [
      'fmcg_pos_terminal_enabled', 'fmcg_pax_terminal_ip', 'fmcg_pax_terminal_port',
    ], 1);
    if (fmcgData && fmcgData.length > 0) {
      return { ...company, ...fmcgData[0] };
    }
  } catch {
    // FMCG fields not available - module not installed
  }
  
  return company;
}

export async function updateCompanySettings(id: number, values: Record<string, any>) {
  return write('res.company', [id], values);
}

export async function changePassword(newPassword: string) {
  // Updates the current user's password
  return callMethod('res.users', 'change_password', ['', newPassword]);
}

// ============ Onboarding ============

export async function saveOnboardingData(data: {
  people: Array<{ name: string; role: string; phone: string }>;
  bank: { bankName: string; accountNumber: string; bankBalance: string; cashBalance: string };
  terminal: { model: string; port: string; protocol: string };
  products: Array<{ name: string; barcode: string; buyPrice: string; sellPrice: string }>;
}) {
  const results: any = { people: [], products: [] };

  // Create partners
  for (const person of data.people) {
    const id = await createPartner({
      name: person.name,
      phone: person.phone,
      supplier_rank: person.role === 'تامین‌کننده' ? 1 : 0,
      customer_rank: person.role === 'مشتری' ? 1 : 0,
    });
    results.people.push(id);
  }

  // Create bank journal if provided
  if (data.bank.bankName && data.bank.accountNumber) {
    await create('account.journal', {
      name: data.bank.bankName,
      type: 'bank',
      fmcg_account_number: data.bank.accountNumber.replace(/[^\d]/g, ''),
      fmcg_opening_balance: parseFloat(data.bank.bankBalance.replace(/[^\d.]/g, '')) || 0,
    });
  }

  // Set cash opening balance if provided
  if (data.bank.cashBalance) {
    const cashJournals = await searchRead('account.journal', [['type', '=', 'cash']], ['id'], 1);
    if (cashJournals && cashJournals.length > 0) {
      await write('account.journal', [cashJournals[0].id], {
        fmcg_opening_balance: parseFloat(data.bank.cashBalance.replace(/[^\d.]/g, '')) || 0,
      });
    }
  }

  // Create products
  for (const product of data.products) {
    const id = await createProduct({
      name: product.name,
      barcode: product.barcode || undefined,
      standard_price: parseFloat(product.buyPrice.replace(/[^\d.]/g, '')) || 0,
      list_price: parseFloat(product.sellPrice.replace(/[^\d.]/g, '')) || 0,
    });
    results.products.push(id);
  }

  return results;
}

// ============ Product Categories ============

export async function getCategories() {
  return searchRead('product.category', [], ['name', 'parent_id'], 0, 0, 'name asc');
}

export async function createCategory(name: string, parent_id?: number) {
  return create('product.category', { name, parent_id: parent_id || false });
}

// ============ Product Variants (Attributes) ============

export async function getProductAttributes() {
  return searchRead('product.attribute', [], ['name'], 0, 0, 'name asc');
}

export async function createProductAttribute(name: string) {
  return create('product.attribute', { name });
}

export async function getProductAttributeValues(attributeId: number) {
  return searchRead('product.attribute.value', [['attribute_id', '=', attributeId]], ['name', 'attribute_id']);
}

export async function addAttributeToProduct(productTmplId: number, attributeId: number, valueIds: number[]) {
  // Add attribute line to product template
  return create('product.template.attribute.line', {
    product_tmpl_id: productTmplId,
    attribute_id: attributeId,
    value_ids: [[6, 0, valueIds]],
  });
}

export async function getProductVariants(productTmplId: number) {
  return searchRead('product.product', [['product_tmpl_id', '=', productTmplId]], ['name', 'barcode', 'product_template_variant_value_ids', 'list_price', 'qty_available']);
}

// ============ Dashboard Helpers ============

export async function getTodaySales() {
  const today = new Date().toISOString().split('T')[0];
  const sales = await searchRead(
    'account.move',
    [
      ['move_type', '=', 'out_invoice'],
      ['state', '=', 'posted'],
      ['invoice_date', '=', today],
    ],
    ['amount_total'],
  );
  const totalAmount = sales?.reduce((sum: number, s: any) => sum + (s.amount_total || 0), 0) || 0;
  return { totalAmount, count: sales?.length || 0 };
}
