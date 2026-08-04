/**
 * Odoo JSON-RPC API Client
 * Handles all communication with Odoo backend
 */

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL || '/api';
const ODOO_DB = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';

/** Get today's date in local timezone as YYYY-MM-DD */
function getLocalToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
      ['name', 'display_name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'fmcg_reorder_threshold', 'image_128', 'product_tmpl_id'],
      limit
    );
  } catch {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'display_name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'image_128', 'product_tmpl_id'],
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
  categ_id?: number;
  image_1920?: string;
}) {
  const data: any = {
    name: values.name,
    barcode: values.barcode || false,
    list_price: values.list_price,
    standard_price: values.standard_price,
    type: 'consu',
    is_storable: true,
  };
  // Only set categ_id if a valid one is provided (not 0/false)
  if (values.categ_id) {
    data.categ_id = values.categ_id;
  }
  if (values.image_1920) {
    data.image_1920 = values.image_1920;
  }
  try { data.fmcg_reorder_threshold = values.fmcg_reorder_threshold || 10; } catch {}
  return create('product.product', data);
}

export async function updateProduct(id: number, values: Record<string, any>) {
  return write('product.product', [id], values);
}

export async function deleteProduct(id: number) {
  return write('product.product', [id], { active: false });
}

export async function deleteProductTemplate(id: number) {
  // Deactivate all variants + the template itself
  const variants = await searchRead('product.product', [['product_tmpl_id', '=', id]], ['id']);
  if (variants && variants.length > 0) {
    await write('product.product', variants.map((v: any) => v.id), { active: false });
  }
  return write('product.template', [id], { active: false });
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
  // Get journals
  let journals: any[];
  try {
    journals = await searchRead('account.journal', [['type', 'in', ['bank', 'cash']]], [
      'name', 'type', 'fmcg_running_balance', 'fmcg_is_active', 'fmcg_opening_balance',
      'fmcg_account_holder', 'fmcg_account_number', 'default_account_id',
    ]);
  } catch {
    journals = await searchRead('account.journal', [['type', 'in', ['bank', 'cash']]], [
      'name', 'type', 'default_account_id',
    ]);
  }

  // Calculate real accounting balance for each journal
  // The Odoo backend now computes fmcg_running_balance correctly
  // (from account entries + outstanding). This client-side calculation
  // is a fallback in case the backend module is not updated yet.
  for (const j of (journals || [])) {
    // If Odoo already computed a non-zero balance, trust it
    if (j.fmcg_running_balance && j.fmcg_running_balance !== 0) continue;
    
    try {
      const accountId = j.default_account_id?.[0];
      if (accountId) {
        // Query 1: All posted entries on the journal's default account (from ANY journal)
        const lines = await searchRead('account.move.line', [
          ['account_id', '=', accountId],
          ['parent_state', '=', 'posted'],
        ], ['debit', 'credit'], 0);
        const accountBalance = (lines || []).reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);

        // Query 2: Outstanding payment/receipt lines in this journal
        const outstandingLines = await searchRead('account.move.line', [
          ['journal_id', '=', j.id],
          ['parent_state', '=', 'posted'],
          ['account_id', '!=', accountId],
          ['account_id.account_type', 'in', ['asset_current']],
        ], ['debit', 'credit'], 0);
        const outstandingBalance = (outstandingLines || []).reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);

        j.fmcg_running_balance = accountBalance + outstandingBalance;
      } else {
        j.fmcg_running_balance = j.fmcg_opening_balance || 0;
      }
    } catch (e: any) {
      console.error(`Treasury balance calc error for ${j.name}:`, e?.message || e);
    }
  }

  return journals;
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

  const today = getLocalToday();

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
    'name', 'partner_id', 'amount_total', 'invoice_date', 'state', 'payment_state', 'invoice_line_ids', 'narration',
  ], 50, 0, 'create_date desc');
}

export async function getPurchaseInvoiceLines(invoiceId: number) {
  return searchRead('account.move.line', [['move_id', '=', invoiceId], ['display_type', '=', 'product']], [
    'product_id', 'name', 'quantity', 'price_unit', 'price_subtotal',
  ]);
}

export async function deletePurchaseInvoice(invoiceId: number) {
  // First try to reset to draft, then delete
  try {
    await callMethod('account.move', 'button_draft', [[invoiceId]]);
  } catch { /* may already be draft */ }
  return unlink('account.move', [invoiceId]);
}

export async function createPurchaseInvoice(values: {
  partner_id: number;
  lines: Array<{ product_id: number; quantity: number; price_unit: number }>;
  note?: string;
  date?: string;
}) {
  const invoice_lines = values.lines.map((line) => [
    0, 0, {
      product_id: line.product_id,
      quantity: line.quantity,
      price_unit: line.price_unit,
    },
  ]);

  const invoiceDate = values.date || getLocalToday();

  const invoiceId = await create('account.move', {
    move_type: 'in_invoice',
    partner_id: values.partner_id,
    invoice_date: invoiceDate,
    date: invoiceDate,
    invoice_line_ids: invoice_lines,
    narration: values.note || false,
  });

  // Auto-confirm the purchase invoice
  await confirmInvoice(invoiceId);

  return invoiceId;
}

/**
 * Register payment for an invoice (reduces bank/cash balance)
 * Uses Odoo's payment register wizard to properly reconcile the payment with the invoice.
 * @param invoiceId - the confirmed invoice ID
 * @param journalId - the specific bank/cash journal to pay from
 * @param amount - the amount to pay (partial or full)
 */
export async function registerInvoicePayment(invoiceId: number, journalId: number, amount: number) {
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['amount_total', 'partner_id', 'move_type', 'amount_residual', 'name'], 1);
  if (!invoice || invoice.length === 0) return;

  const payAmount = amount || invoice[0].amount_residual || invoice[0].amount_total;
  const paymentType = invoice[0].move_type === 'in_invoice' ? 'outbound' : 'inbound';
  const partnerType = invoice[0].move_type === 'in_invoice' ? 'supplier' : 'customer';

  // Try using the payment register wizard (properly reconciles payment with invoice)
  try {
    // Create the wizard in the context of the invoice
    const wizardId = await jsonRpc('/web/dataset/call_kw', {
      model: 'account.payment.register',
      method: 'create',
      args: [{
        journal_id: journalId,
        amount: payAmount,
        payment_type: paymentType,
        partner_type: partnerType,
      }],
      kwargs: {
        context: {
          active_model: 'account.move',
          active_ids: [invoiceId],
        },
      },
    });

    // Execute the wizard to create and reconcile the payment
    await jsonRpc('/web/dataset/call_kw', {
      model: 'account.payment.register',
      method: 'action_create_payments',
      args: [[wizardId]],
      kwargs: {
        context: {
          active_model: 'account.move',
          active_ids: [invoiceId],
        },
      },
    });
    return wizardId;
  } catch (e) {
    // Fallback: Create payment directly (won't be reconciled but at least records the payment)
    console.warn('[registerInvoicePayment] Wizard failed, using direct payment:', e);
    const paymentId = await create('account.payment', {
      payment_type: paymentType,
      partner_type: partnerType,
      partner_id: invoice[0].partner_id?.[0] || false,
      amount: payAmount,
      journal_id: journalId,
    });
    await callMethod('account.payment', 'action_post', [[paymentId]]);
    return paymentId;
  }
}

/**
 * Create stock picking (warehouse receipt) for a purchase invoice
 */
export async function createStockReceipt(invoiceId: number) {
  const lines = await getPurchaseInvoiceLines(invoiceId);
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['partner_id'], 1);
  if (!lines || lines.length === 0) return null;

  // Find the receipt picking type (incoming)
  const pickingTypes = await searchRead('stock.picking.type', [['code', '=', 'incoming']], ['id', 'default_location_src_id', 'default_location_dest_id'], 1);
  if (!pickingTypes || pickingTypes.length === 0) return null;

  const pickingType = pickingTypes[0];
  const srcLocation = pickingType.default_location_src_id?.[0] || false;
  const destLocation = pickingType.default_location_dest_id?.[0] || false;

  // Create stock.picking with move lines
  const moveLines = lines.map((line: any) => [0, 0, {
    product_id: line.product_id?.[0] || line.product_id,
    name: line.name || 'Receipt',
    product_uom_qty: line.quantity,
    location_id: srcLocation,
    location_dest_id: destLocation,
  }]);

  const pickingId = await create('stock.picking', {
    picking_type_id: pickingType.id,
    partner_id: invoice?.[0]?.partner_id?.[0] || false,
    origin: `Purchase Invoice ${invoiceId}`,
    location_id: srcLocation,
    location_dest_id: destLocation,
    move_ids_without_package: moveLines,
  });

  // Confirm the picking
  await callMethod('stock.picking', 'action_confirm', [[pickingId]]);
  
  // Set quantities done on stock.move.line (Odoo 18 way)
  // First try setting quantity on stock.move directly
  const moves = await searchRead('stock.move', [['picking_id', '=', pickingId]], ['id', 'product_uom_qty']);
  for (const move of (moves || [])) {
    try {
      await write('stock.move', [move.id], { quantity: move.product_uom_qty });
    } catch {
      // Try quantity_done for older API
      try { await write('stock.move', [move.id], { quantity_done: move.product_uom_qty }); } catch {}
    }
  }

  // Validate picking
  try {
    await callMethod('stock.picking', 'button_validate', [[pickingId]]);
  } catch {
    try {
      await jsonRpc('/web/dataset/call_kw', {
        model: 'stock.picking',
        method: 'button_validate',
        args: [[pickingId]],
        kwargs: { context: { skip_backorder: true, picking_ids_not_to_backorder: [pickingId] } },
      });
    } catch { /* best effort */ }
  }

  return pickingId;
}

/**
 * Create stock delivery (outgoing) for a sales invoice - reduces inventory
 */
export async function createStockDelivery(invoiceLines: Array<{ product_id: number; qty: number }>, partnerId?: number) {
  if (!invoiceLines || invoiceLines.length === 0) return null;

  // Find the delivery picking type (outgoing)
  const pickingTypes = await searchRead('stock.picking.type', [['code', '=', 'outgoing']], ['id', 'default_location_src_id', 'default_location_dest_id'], 1);
  if (!pickingTypes || pickingTypes.length === 0) return null;

  const pickingType = pickingTypes[0];
  const srcLocation = pickingType.default_location_src_id?.[0] || false;
  const destLocation = pickingType.default_location_dest_id?.[0] || false;

  const moveLines = invoiceLines.map((line) => [0, 0, {
    product_id: line.product_id,
    name: 'Delivery',
    product_uom_qty: line.qty,
    location_id: srcLocation,
    location_dest_id: destLocation,
  }]);

  const pickingId = await create('stock.picking', {
    picking_type_id: pickingType.id,
    partner_id: partnerId || false,
    origin: 'POS Sale',
    location_id: srcLocation,
    location_dest_id: destLocation,
    move_ids_without_package: moveLines,
  });

  await callMethod('stock.picking', 'action_confirm', [[pickingId]]);

  const moves = await searchRead('stock.move', [['picking_id', '=', pickingId]], ['id', 'product_uom_qty']);
  for (const move of (moves || [])) {
    try {
      await write('stock.move', [move.id], { quantity: move.product_uom_qty });
    } catch {
      try { await write('stock.move', [move.id], { quantity_done: move.product_uom_qty }); } catch {}
    }
  }

  try {
    await callMethod('stock.picking', 'button_validate', [[pickingId]]);
  } catch {
    try {
      await jsonRpc('/web/dataset/call_kw', {
        model: 'stock.picking',
        method: 'button_validate',
        args: [[pickingId]],
        kwargs: { context: { skip_backorder: true, picking_ids_not_to_backorder: [pickingId] } },
      });
    } catch { /* best effort */ }
  }

  return pickingId;
}

/**
 * Get partner account balances (receivable/payable)
 */
export async function getPartnerBalances() {
  // Get all partners
  const partners = await searchRead('res.partner', [
    ['active', '=', true],
    '|', ['customer_rank', '>', 0], ['supplier_rank', '>', 0]
  ], ['name', 'phone', 'mobile', 'supplier_rank', 'customer_rank']);
  
  if (!partners || partners.length === 0) return [];

  // Get ALL receivable/payable lines in ONE query (instead of N+1)
  const allLines = await searchRead('account.move.line', [
    ['partner_id', 'in', partners.map((p: any) => p.id)],
    ['parent_state', '=', 'posted'],
    ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']],
  ], ['partner_id', 'debit', 'credit', 'account_type'], 0);

  // Group by partner
  const balanceMap: Record<number, { receivable: number; payable: number }> = {};
  for (const line of (allLines || [])) {
    const pid = line.partner_id?.[0] || line.partner_id;
    if (!pid) continue;
    if (!balanceMap[pid]) balanceMap[pid] = { receivable: 0, payable: 0 };
    if (line.account_type === 'asset_receivable') {
      balanceMap[pid].receivable += (line.debit - line.credit);
    } else if (line.account_type === 'liability_payable') {
      balanceMap[pid].payable += (line.credit - line.debit);
    }
  }

  return partners.map((partner: any) => {
    const bal = balanceMap[partner.id] || { receivable: 0, payable: 0 };
    // Net balance: positive = they owe us, negative = we owe them
    const net = bal.receivable - bal.payable;
    return {
      ...partner,
      receivable: net > 0 ? net : 0,
      payable: net < 0 ? -net : 0,
      balance: net,
    };
  });
}

/**
 * Get sales returns (credit notes) history
 */
export async function getSalesReturns() {
  return searchRead('account.move', [['move_type', '=', 'out_refund']], [
    'name', 'partner_id', 'amount_total', 'invoice_date', 'state', 'narration', 'create_date', 'invoice_line_ids',
  ], 50, 0, 'create_date desc');
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
  journal_id: number;
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

  // If no partner, use "مشتری عمومی"
  let partner_id = values.partner_id || false;
  if (!partner_id) {
    try {
      const existing = await searchRead('res.partner', [['name', '=', 'مشتری عمومی']], ['id'], 1);
      if (existing && existing.length > 0) {
        partner_id = existing[0].id;
      } else {
        partner_id = await create('res.partner', { name: 'مشتری عمومی', customer_rank: 1 });
      }
    } catch {
      partner_id = false;
    }
  }

  const refundNarration = values.return_to_stock 
    ? (values.note || 'برگشت به انبار') 
    : (values.note ? `ضایعات - ${values.note}` : 'ضایعات');

  const refundId = await create('account.move', {
    move_type: 'out_refund',
    partner_id: partner_id,
    invoice_line_ids: refund_lines,
    narration: refundNarration,
  });

  await confirmInvoice(refundId);

  // Register payment for the credit note (so money actually leaves bank/cash)
  // For out_refund, we are PAYING the customer back, so payment_type must be 'outbound'
  if (values.journal_id && (values.refund_method === 'cash' || values.refund_method === 'bank')) {
    const totalAmount = values.lines.reduce((sum, l) => sum + l.quantity * l.price_unit, 0);
    // Create outbound payment directly (not using registerInvoicePayment which gets direction wrong for refunds)
    const paymentId = await create('account.payment', {
      payment_type: 'outbound',
      partner_type: 'customer',
      partner_id: partner_id || false,
      amount: totalAmount,
      journal_id: values.journal_id,
    });
    await callMethod('account.payment', 'action_post', [[paymentId]]);
  }

  // If credit method: record customer credit so balance shows on their account
  if (values.refund_method === 'credit' && values.partner_id) {
    try {
      const totalAmount = values.lines.reduce((sum, l) => sum + l.quantity * l.price_unit, 0);
      await create('fmcg.customer.credit', {
        partner_id: values.partner_id,
        amount: totalAmount,
        note: values.note || 'بابت برگشت از فروش',
        invoice_ref: String(refundId),
      });
    } catch { /* fmcg.customer.credit module may not be installed */ }
  }

  // If waste (not return to stock), use Odoo's scrap mechanism
  // Steps: 1) Return from customer to warehouse, 2) Scrap from warehouse
  if (!values.return_to_stock) {
    try {
      // Use customer location (like return-to-stock) so account 110300 is used
      const customerLocs = await searchRead('stock.location', [['usage', '=', 'customer']], ['id'], 1);
      const internalLocs = await searchRead('stock.location', [['usage', '=', 'internal']], ['id'], 1);
      const pickingTypes = await searchRead('stock.picking.type', [['code', '=', 'incoming']], ['id'], 1);

      if (customerLocs?.length > 0 && internalLocs?.length > 0 && pickingTypes?.length > 0) {
        const customerLocId = customerLocs[0].id;
        const internalLocId = internalLocs[0].id;
        const pickingTypeId = pickingTypes[0].id;

        // Create picking: customer → warehouse (uses 110300)
        const moveLines = values.lines.map((line) => [0, 0, {
          product_id: line.product_id,
          name: 'Return for Scrap',
          product_uom_qty: line.quantity,
          location_id: customerLocId,
          location_dest_id: internalLocId,
        }]);

        const pickingId = await create('stock.picking', {
          picking_type_id: pickingTypeId,
          partner_id: partner_id || false,
          origin: `Sales Return (Scrap) ${refundId}`,
          location_id: customerLocId,
          location_dest_id: internalLocId,
          move_ids_without_package: moveLines,
        });

        await callMethod('stock.picking', 'action_confirm', [[pickingId]]);
        const moves = await searchRead('stock.move', [['picking_id', '=', pickingId]], ['id', 'product_uom_qty']);
        for (const move of (moves || [])) {
          try { await write('stock.move', [move.id], { quantity: move.product_uom_qty }); } catch {}
        }
        try { await callMethod('stock.picking', 'button_validate', [[pickingId]]); } catch {}

        // Now scrap each product from internal location
        for (const line of values.lines) {
          try {
            const scrapId = await create('stock.scrap', {
              product_id: line.product_id,
              scrap_qty: line.quantity,
              location_id: internalLocId,
            });
            await callMethod('stock.scrap', 'action_validate', [[scrapId]]);
          } catch { /* scrap failed for this item */ }
        }
      }
    } catch { /* waste/scrap recording failed */ }
  }

  // If return_to_stock, create a stock return FROM CUSTOMER back to warehouse
  // Using customer location as source ensures Odoo uses account 110300 (stock interim sent)
  // instead of 110100 (stock interim received) which is for supplier receipts
  if (values.return_to_stock) {
    try {
      // Find customer location and internal (warehouse) location
      const customerLocs = await searchRead('stock.location', [['usage', '=', 'customer']], ['id'], 1);
      const internalLocs = await searchRead('stock.location', [['usage', '=', 'internal']], ['id'], 1);
      const pickingTypes = await searchRead('stock.picking.type', [['code', '=', 'incoming']], ['id'], 1);

      if (customerLocs?.length > 0 && internalLocs?.length > 0 && pickingTypes?.length > 0) {
        const customerLocId = customerLocs[0].id;
        const internalLocId = internalLocs[0].id;
        const pickingTypeId = pickingTypes[0].id;

        const moveLines = values.lines.map((line) => [0, 0, {
          product_id: line.product_id,
          name: 'Customer Return',
          product_uom_qty: line.quantity,
          location_id: customerLocId,
          location_dest_id: internalLocId,
        }]);

        const pickingId = await create('stock.picking', {
          picking_type_id: pickingTypeId,
          partner_id: partner_id || false,
          origin: `Sales Return ${refundId}`,
          location_id: customerLocId,
          location_dest_id: internalLocId,
          move_ids_without_package: moveLines,
        });

        await callMethod('stock.picking', 'action_confirm', [[pickingId]]);

        // Set quantities done
        const moves = await searchRead('stock.move', [['picking_id', '=', pickingId]], ['id', 'product_uom_qty']);
        for (const move of (moves || [])) {
          try { await write('stock.move', [move.id], { quantity: move.product_uom_qty }); } catch {}
        }

        try {
          await callMethod('stock.picking', 'button_validate', [[pickingId]]);
        } catch {
          try {
            await jsonRpc('/web/dataset/call_kw', {
              model: 'stock.picking',
              method: 'button_validate',
              args: [[pickingId]],
              kwargs: { context: { skip_backorder: true, picking_ids_not_to_backorder: [pickingId] } },
            });
          } catch { /* best effort */ }
        }
      }
    } catch { /* stock return failed, but refund is done */ }
  }

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
  // First find the stock accounts for proper valuation setup
  let inputAcc: number | false = false;
  let outputAcc: number | false = false;
  let valAcc: number | false = false;
  try {
    const accounts = await searchRead('account.account', [['code', 'in', ['110100', '110200', '110300']]], ['id', 'code']);
    for (const a of (accounts || [])) {
      if (a.code === '110100') inputAcc = a.id;
      if (a.code === '110200') valAcc = a.id;
      if (a.code === '110300') outputAcc = a.id;
    }
  } catch {}

  const values: any = {
    name,
    parent_id: parent_id || false,
    property_valuation: 'real_time',
    property_cost_method: 'fifo',
  };
  if (inputAcc) values.property_stock_account_input_categ_id = inputAcc;
  if (outputAcc) values.property_stock_account_output_categ_id = outputAcc;
  if (valAcc) values.property_stock_valuation_account_id = valAcc;

  return create('product.category', values);
}

// ============ Chart of Accounts ============

export async function getAccounts(accountTypes?: string[]) {
  const domain: any[] = [];
  if (accountTypes && accountTypes.length > 0) {
    domain.push(['account_type', 'in', accountTypes]);
  }
  return searchRead('account.account', domain, [
    'name', 'code', 'account_type', 'reconcile', 'deprecated',
  ], 0, 0, 'code asc');
}

export async function getExpenseIncomeAccounts() {
  return searchRead('account.account', [
    ['account_type', 'in', ['expense', 'expense_direct_cost', 'income', 'income_other', 'equity']],
    ['deprecated', '=', false],
  ], ['name', 'code', 'account_type'], 0, 0, 'code asc');
}

export async function createAccount(values: {
  name: string;
  code: string;
  account_type: string;
}) {
  return create('account.account', {
    name: values.name,
    code: values.code,
    account_type: values.account_type,
  });
}

export async function updateAccount(id: number, values: Record<string, any>) {
  return write('account.account', [id], values);
}

export async function deleteAccount(id: number) {
  // Mark as deprecated instead of deleting (safer)
  return write('account.account', [id], { deprecated: true });
}

// ============ Dashboard Helpers ============

export async function getTodaySales() {
  const today = getLocalToday();
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

// ============ Product Variants (Attributes) ============

/**
 * Get all product attributes (e.g., "طعم", "رنگ", "سایز")
 */
export async function getProductAttributes() {
  return searchRead('product.attribute', [], ['name', 'display_type', 'create_variant'], 0, 0, 'name asc');
}

/**
 * Get attribute values for a specific attribute
 */
export async function getAttributeValues(attributeId: number) {
  return searchRead('product.attribute.value', [['attribute_id', '=', attributeId]], ['name', 'attribute_id', 'sequence'], 0, 0, 'sequence asc');
}

/**
 * Create a new product attribute (e.g., "طعم")
 */
export async function createProductAttribute(name: string) {
  return create('product.attribute', { name, create_variant: 'always' });
}

/**
 * Create a new attribute value (e.g., "هلو" for attribute "طعم")
 */
export async function createAttributeValue(attributeId: number, name: string) {
  return create('product.attribute.value', { attribute_id: attributeId, name });
}

/**
 * Get variants (product.product) for a product template
 */
export async function getProductVariants(templateId: number) {
  return searchRead('product.product', [['product_tmpl_id', '=', templateId], ['active', '=', true]], [
    'name', 'barcode', 'list_price', 'standard_price', 'qty_available',
    'product_template_variant_value_ids', 'combination_indices', 'display_name',
  ], 0, 0, 'id asc');
}

/**
 * Get attribute lines for a product template (which attributes are assigned)
 */
export async function getTemplateAttributeLines(templateId: number) {
  return searchRead('product.template.attribute.line', [['product_tmpl_id', '=', templateId]], [
    'attribute_id', 'value_ids',
  ]);
}

/**
 * Add attribute values to a product template (creates variants)
 * This adds an attribute line with specific values to a template.
 */
export async function addAttributeToTemplate(templateId: number, attributeId: number, valueIds: number[]) {
  return create('product.template.attribute.line', {
    product_tmpl_id: templateId,
    attribute_id: attributeId,
    value_ids: [[6, 0, valueIds]],
  });
}

/**
 * Update barcode for a specific variant
 */
export async function updateVariantBarcode(variantId: number, barcode: string) {
  return write('product.product', [variantId], { barcode: barcode || false });
}

/**
 * Get product template ID from product.product ID
 */
export async function getProductTemplate(productId: number) {
  const result = await searchRead('product.product', [['id', '=', productId]], ['product_tmpl_id'], 1);
  if (result && result.length > 0) return result[0].product_tmpl_id;
  return null;
}

// ============ Discount Categories ============

/**
 * Get all discount categories
 */
export async function getDiscountCategories() {
  try {
    return await searchRead('fmcg.discount.category', [['active', '=', true]], [
      'name', 'code', 'is_fixed_percent', 'fixed_percent', 'note', 'sequence',
    ], 0, 0, 'sequence asc');
  } catch {
    return [];
  }
}

/**
 * Create a discount category
 */
export async function createDiscountCategory(values: {
  name: string;
  code?: string;
  is_fixed_percent: boolean;
  fixed_percent?: number;
  note?: string;
}) {
  return create('fmcg.discount.category', {
    name: values.name,
    code: values.code || false,
    is_fixed_percent: values.is_fixed_percent,
    fixed_percent: values.fixed_percent || 0,
    note: values.note || false,
  });
}

/**
 * Update a discount category
 */
export async function updateDiscountCategory(id: number, values: Record<string, any>) {
  return write('fmcg.discount.category', [id], values);
}

/**
 * Delete a discount category (deactivate)
 */
export async function deleteDiscountCategory(id: number) {
  return write('fmcg.discount.category', [id], { active: false });
}

/**
 * Get discount lines for a category (per-product prices)
 */
export async function getDiscountLines(categoryId: number) {
  try {
    return await searchRead('fmcg.discount.line', [['category_id', '=', categoryId]], [
      'product_id', 'product_list_price', 'discount_price',
    ]);
  } catch {
    return [];
  }
}

/**
 * Set discount price for a product in a category
 */
export async function setDiscountPrice(categoryId: number, productId: number, discountPrice: number) {
  // Check if line exists
  const existing = await searchRead('fmcg.discount.line', [
    ['category_id', '=', categoryId],
    ['product_id', '=', productId],
  ], ['id'], 1);
  if (existing && existing.length > 0) {
    return write('fmcg.discount.line', [existing[0].id], { discount_price: discountPrice });
  }
  return create('fmcg.discount.line', {
    category_id: categoryId,
    product_id: productId,
    discount_price: discountPrice,
  });
}

/**
 * Remove discount price for a product in a category
 */
export async function removeDiscountPrice(categoryId: number, productId: number) {
  const existing = await searchRead('fmcg.discount.line', [
    ['category_id', '=', categoryId],
    ['product_id', '=', productId],
  ], ['id'], 1);
  if (existing && existing.length > 0) {
    return unlink('fmcg.discount.line', [existing[0].id]);
  }
}

/**
 * Get all products with their discount prices for a specific category
 * Returns products with adjusted prices based on discount category rules
 */
export async function getProductsWithDiscount(categoryId: number) {
  const [products, category, lines] = await Promise.all([
    getProducts(),
    searchRead('fmcg.discount.category', [['id', '=', categoryId]], ['is_fixed_percent', 'fixed_percent'], 1),
    getDiscountLines(categoryId),
  ]);

  if (!products || !category || category.length === 0) return products;

  const cat = category[0];
  const lineMap = new Map((lines || []).map((l: any) => [l.product_id[0] || l.product_id, l.discount_price]));

  return products.map((p: any) => {
    let discountPrice = p.list_price;
    if (cat.is_fixed_percent && cat.fixed_percent > 0) {
      discountPrice = p.list_price * (1 - cat.fixed_percent / 100);
    } else if (lineMap.has(p.id)) {
      discountPrice = lineMap.get(p.id)!;
    }
    return { ...p, discount_price: discountPrice };
  });
}


// ============ Edit Posted Invoices ============

/**
 * Edit a posted invoice: reset to draft, update lines, re-post.
 * Also handles reversing related stock pickings and payments.
 */
export async function editPostedInvoice(invoiceId: number, newLines: Array<{ product_id: number; quantity: number; price_unit: number }>) {
  // 0. Cancel related payments first (reverse them)
  try {
    // Find payments linked to this invoice via reconciliation
    const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['name', 'partner_id', 'amount_total'], 1);
    if (invoice && invoice.length > 0) {
      // Find all posted payments for this partner that match the amount
      const payments = await searchRead('account.payment', [
        ['partner_id', '=', invoice[0].partner_id?.[0] || false],
        ['state', '=', 'posted'],
        ['amount', '=', invoice[0].amount_total],
      ], ['id'], 5);
      for (const pay of (payments || [])) {
        try {
          await callMethod('account.payment', 'action_draft', [[pay.id]]);
          await callMethod('account.payment', 'action_cancel', [[pay.id]]);
        } catch { /* best effort */ }
      }
    }
  } catch { /* payment cancellation failed, continue with edit */ }

  // 1. Reset invoice to draft
  await callMethod('account.move', 'button_draft', [[invoiceId]]);

  // 2. Get current invoice lines and delete them
  const currentLines = await searchRead('account.move.line', [['move_id', '=', invoiceId], ['display_type', '=', 'product']], ['id']);
  if (currentLines && currentLines.length > 0) {
    const unlinkCmds = currentLines.map((l: any) => [2, l.id, 0]);
    await write('account.move', [invoiceId], { invoice_line_ids: unlinkCmds });
  }

  // 3. Add new lines
  const addCmds = newLines.map((line) => [0, 0, {
    product_id: line.product_id,
    quantity: line.quantity,
    price_unit: line.price_unit,
  }]);
  await write('account.move', [invoiceId], { invoice_line_ids: addCmds });

  // 4. Re-post the invoice
  await confirmInvoice(invoiceId);

  return invoiceId;
}

/**
 * Cancel related stock pickings for an invoice (for re-doing stock)
 */
export async function cancelRelatedPickings(invoiceId: number) {
  // Find pickings related to this invoice
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['name'], 1);
  if (!invoice || invoice.length === 0) return;

  const pickings = await searchRead('stock.picking', [
    ['origin', 'ilike', invoice[0].name],
    ['state', '!=', 'cancel'],
  ], ['id', 'state']);

  for (const picking of (pickings || [])) {
    try {
      await callMethod('stock.picking', 'action_cancel', [[picking.id]]);
    } catch { /* may already be done */ }
  }
}

/**
 * Cancel related payments for an invoice
 */
export async function cancelRelatedPayments(invoiceId: number) {
  // Find payments reconciled with this invoice via account.move.line
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['name', 'partner_id'], 1);
  if (!invoice || invoice.length === 0) return;

  // Find payments referencing this invoice
  const payments = await searchRead('account.payment', [
    ['partner_id', '=', invoice[0].partner_id?.[0] || false],
    ['state', '=', 'posted'],
  ], ['id', 'ref'], 0);

  // Cancel payments that reference this invoice number
  for (const pay of (payments || [])) {
    if (pay.ref && pay.ref.includes(invoice[0].name)) {
      try {
        await callMethod('account.payment', 'action_draft', [[pay.id]]);
        await callMethod('account.payment', 'action_cancel', [[pay.id]]);
      } catch { /* best effort */ }
    }
  }
}


// ============ Corrective Operations ============

/**
 * Change payment method for a sales invoice (e.g., cash was selected but should be card)
 * This reverses the old payment and creates a new one with the correct journal.
 */
export async function changePaymentMethod(invoiceId: number, newJournalId: number) {
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['partner_id', 'amount_total', 'move_type'], 1);
  if (!invoice || invoice.length === 0) throw new Error('فاکتور یافت نشد');

  const partnerId = invoice[0].partner_id?.[0] || false;
  const amount = invoice[0].amount_total;
  const isOutInvoice = invoice[0].move_type === 'out_invoice';

  // Find existing payments for this invoice
  const payments = await searchRead('account.payment', [
    ['partner_id', '=', partnerId],
    ['amount', '=', amount],
    ['state', '=', 'posted'],
  ], ['id', 'journal_id'], 5);

  // Cancel existing payments
  for (const pay of (payments || []).slice(0, 1)) {
    try {
      await callMethod('account.payment', 'action_draft', [[pay.id]]);
      await callMethod('account.payment', 'action_cancel', [[pay.id]]);
    } catch { /* may fail if already reconciled - try reverse */ }
  }

  // Create new payment with correct journal
  const paymentType = isOutInvoice ? 'inbound' : 'outbound';
  const partnerType = isOutInvoice ? 'customer' : 'supplier';
  const newPaymentId = await create('account.payment', {
    payment_type: paymentType,
    partner_type: partnerType,
    partner_id: partnerId,
    amount: amount,
    journal_id: newJournalId,
  });
  await callMethod('account.payment', 'action_post', [[newPaymentId]]);
  return newPaymentId;
}

/**
 * Correct an invoice by creating a credit note and new invoice.
 * This is the accounting-safe way to "edit" a posted invoice.
 */
export async function correctInvoice(
  invoiceId: number,
  newLines: Array<{ product_id: number; quantity: number; price_unit: number }>,
  journalId?: number
) {
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], [
    'partner_id', 'move_type', 'amount_total',
  ], 1);
  if (!invoice || invoice.length === 0) throw new Error('فاکتور یافت نشد');

  const partnerId = invoice[0].partner_id?.[0] || false;
  const moveType = invoice[0].move_type;
  const refundType = moveType === 'out_invoice' ? 'out_refund' : 'in_refund';

  // 1. Create credit note (refund) for the old invoice
  const oldLines = await searchRead('account.move.line', [
    ['move_id', '=', invoiceId], ['display_type', '=', 'product'],
  ], ['product_id', 'quantity', 'price_unit']);

  const refundLineCmds = (oldLines || []).map((l: any) => [0, 0, {
    product_id: l.product_id?.[0] || l.product_id,
    quantity: l.quantity,
    price_unit: l.price_unit,
  }]);

  const refundId = await create('account.move', {
    move_type: refundType,
    partner_id: partnerId,
    invoice_line_ids: refundLineCmds,
    narration: `اصلاح فاکتور ${invoice[0].name || invoiceId}`,
  });
  await confirmInvoice(refundId);

  // 2. Create new corrected invoice
  const newLineCmds = newLines.map((l) => [0, 0, {
    product_id: l.product_id,
    quantity: l.quantity,
    price_unit: l.price_unit,
  }]);

  const newInvoiceId = await create('account.move', {
    move_type: moveType,
    partner_id: partnerId,
    invoice_line_ids: newLineCmds,
    narration: `اصلاح‌شده از فاکتور ${invoice[0].name || invoiceId}`,
  });
  await confirmInvoice(newInvoiceId);

  // 3. Register payment for new invoice if journal specified
  if (journalId) {
    const newAmount = newLines.reduce((s, l) => s + l.quantity * l.price_unit, 0);
    await registerInvoicePayment(newInvoiceId, journalId, newAmount);
  }

  return { refundId, newInvoiceId };
}


// ============ Void Invoice (proper Odoo reversal) ============

/**
 * Void/reverse an invoice using Odoo's built-in reversal mechanism.
 * Creates a credit note and optionally reconciles it.
 */
export async function voidInvoice(invoiceId: number, journalId?: number) {
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['move_type', 'amount_total', 'partner_id', 'name'], 1);
  if (!invoice || invoice.length === 0) throw new Error('فاکتور یافت نشد');

  const inv = invoice[0];
  const today = getLocalToday();
  const refundType = inv.move_type === 'out_invoice' ? 'out_refund' : inv.move_type === 'in_invoice' ? 'in_refund' : 'entry';

  // Get invoice lines
  const lines = await searchRead('account.move.line', [['move_id', '=', invoiceId], ['display_type', '=', 'product']], ['product_id', 'quantity', 'price_unit']);
  const refundLineCmds = (lines || []).map((l: any) => [0, 0, {
    product_id: l.product_id?.[0] || l.product_id,
    quantity: l.quantity,
    price_unit: l.price_unit,
  }]);

  // Create refund
  const refundId = await create('account.move', {
    move_type: refundType,
    partner_id: inv.partner_id?.[0] || false,
    invoice_line_ids: refundLineCmds,
    invoice_date: today,
    date: today,
    narration: `ابطال ${inv.name}`,
  });
  await confirmInvoice(refundId);

  // Payment reversal — In Odoo 18, account.payment records may not persist after posting.
  // Instead, payments create journal entries (account.move) in bank/cash journals.
  // We find the related bank/cash move lines and create reverse payments directly.
  try {
    // Find bank/cash journal entries that are linked to this invoice via reconciliation.
    // The invoice's receivable/payable lines get reconciled with payment move lines.
    // We trace through the reconciliation to find the payment journal entries.
    
    // Step 1: Get the invoice's receivable/payable move lines
    const invRecLines = await searchRead('account.move.line', [
      ['move_id', '=', invoiceId],
      ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']],
    ], ['id', 'matched_debit_ids', 'matched_credit_ids', 'full_reconcile_id']);

    // Step 2: Find the payment moves through partial reconciliation
    const paymentMoveIds = new Set<number>();
    
    // Try via full_reconcile_id first
    const fullRecIds = (invRecLines || [])
      .map((l: any) => l.full_reconcile_id?.[0] || l.full_reconcile_id)
      .filter(Boolean);
    
    if (fullRecIds.length > 0) {
      const counterLines = await searchRead('account.move.line', [
        ['full_reconcile_id', 'in', fullRecIds],
        ['move_id', '!=', invoiceId],
        ['move_id', '!=', refundId],
      ], ['move_id', 'journal_id']);
      for (const cl of (counterLines || [])) {
        paymentMoveIds.add(cl.move_id?.[0] || cl.move_id);
      }
    }

    // Also try via matched_debit_ids / matched_credit_ids (partial reconcile)
    if (paymentMoveIds.size === 0) {
      const partialIds = new Set<number>();
      for (const ml of (invRecLines || [])) {
        for (const pid of (ml.matched_debit_ids || [])) partialIds.add(pid);
        for (const pid of (ml.matched_credit_ids || [])) partialIds.add(pid);
      }
      if (partialIds.size > 0) {
        try {
          const partials = await searchRead('account.partial.reconcile', [['id', 'in', [...partialIds]]], ['debit_move_id', 'credit_move_id']);
          const mlIds = new Set<number>();
          for (const p of (partials || [])) {
            if (p.debit_move_id) mlIds.add(p.debit_move_id[0] || p.debit_move_id);
            if (p.credit_move_id) mlIds.add(p.credit_move_id[0] || p.credit_move_id);
          }
          const invMlIds = new Set((invRecLines || []).map((l: any) => l.id));
          const payMlIds = [...mlIds].filter(id => !invMlIds.has(id));
          if (payMlIds.length > 0) {
            const payMls = await searchRead('account.move.line', [['id', 'in', payMlIds]], ['move_id']);
            for (const ml of (payMls || [])) {
              paymentMoveIds.add(ml.move_id?.[0] || ml.move_id);
            }
          }
        } catch {}
      }
    }

    // Step 3: Get the actual payment journal entries and their details
    if (paymentMoveIds.size > 0) {
      // Read the journal entries to get journal and amount info
      const payMoves = await searchRead('account.move', [
        ['id', 'in', [...paymentMoveIds]],
        ['state', '=', 'posted'],
        ['journal_id.type', 'in', ['bank', 'cash']],
      ], ['id', 'journal_id', 'amount_total']);

      // For each payment move, reverse it from its own journal
      for (const pm of (payMoves || [])) {
        const amount = pm.amount_total;
        const journalId = pm.journal_id?.[0] || pm.journal_id;

        // Create reverse payment
        // For purchase void (in_invoice): original was outbound → reverse is inbound (money comes back)
        // For sale void (out_invoice): original was inbound → reverse is outbound (money goes out)
        const reverseType = inv.move_type === 'in_invoice' ? 'inbound' : 'outbound';
        const partnerType = inv.move_type === 'out_invoice' ? 'customer' : 'supplier';

        const reversePayId = await create('account.payment', {
          payment_type: reverseType,
          partner_type: partnerType,
          partner_id: inv.partner_id?.[0] || false,
          amount: amount,
          journal_id: journalId,
          date: today,
        });
        await callMethod('account.payment', 'action_post', [[reversePayId]]);
      }
    } else {
      // Fallback: Since payments aren't reconciled with invoices in this Odoo instance,
      // find bank/cash journal moves for this partner on the invoice date.
      const invData = await searchRead('account.move', [['id', '=', invoiceId]], ['date', 'invoice_date'], 1);
      const invDate = invData?.[0]?.date || invData?.[0]?.invoice_date;
      
      if (invDate) {
        // Find bank/cash journal moves for this partner on the same date
        const sameDateMoves = await searchRead('account.move', [
          ['partner_id', '=', inv.partner_id?.[0] || false],
          ['date', '=', invDate],
          ['state', '=', 'posted'],
          ['journal_id.type', 'in', ['bank', 'cash']],
          ['id', '!=', invoiceId],
          ['id', '!=', refundId],
        ], ['id', 'journal_id', 'amount_total']);

        // Only reverse up to the invoice total (not more!)
        let reversedTotal = 0;
        const maxReverse = inv.amount_total;

        for (const pm of (sameDateMoves || [])) {
          if (reversedTotal >= maxReverse) break;
          
          // Get the liquidity amount (the actual cash/bank movement)
          const liqLines = await searchRead('account.move.line', [
            ['move_id', '=', pm.id],
            ['account_id.account_type', 'not in', ['asset_receivable', 'liability_payable']],
          ], ['debit', 'credit']);
          // Take the larger side (debit or credit) as the payment amount
          const totalDebit = (liqLines || []).reduce((sum: number, l: any) => sum + l.debit, 0);
          const totalCredit = (liqLines || []).reduce((sum: number, l: any) => sum + l.credit, 0);
          let amount = Math.max(totalDebit, totalCredit) || pm.amount_total;
          
          // Cap at remaining amount to reverse
          amount = Math.min(amount, maxReverse - reversedTotal);
          if (amount <= 0) break;
          
          const reverseType = inv.move_type === 'in_invoice' ? 'inbound' : 'outbound';
          const partnerType = inv.move_type === 'out_invoice' ? 'customer' : 'supplier';
          const journalId = pm.journal_id?.[0] || pm.journal_id;

          const reversePayId = await create('account.payment', {
            payment_type: reverseType,
            partner_type: partnerType,
            partner_id: inv.partner_id?.[0] || false,
            amount: amount,
            journal_id: journalId,
            date: today,
          });
          await callMethod('account.payment', 'action_post', [[reversePayId]]);
          reversedTotal += amount;
        }
      }
    }
  } catch { /* payment reversal failed */ }

  // Stock reversal: create a reverse picking (not cancel!)
  // For purchase (in_invoice): original was incoming → create outgoing to return stock
  // For sale (out_invoice): original was outgoing → create incoming to return stock to warehouse
  try {
    const productLines = (lines || []).map((l: any) => ({
      product_id: l.product_id?.[0] || l.product_id,
      qty: l.quantity,
    }));

    if (inv.move_type === 'in_invoice' && productLines.length > 0) {
      await createStockDelivery(productLines, inv.partner_id?.[0] || undefined);
    }
    if (inv.move_type === 'out_invoice' && productLines.length > 0) {
      await createStockReceipt(refundId);
    }
  } catch { /* stock reversal failed, accounting is still correct */ }

  // Mark original invoice as voided (narration)
  try {
    await write('account.move', [invoiceId], { narration: `⛔ ابطال شده — ${today}` });
  } catch {}

  return refundId;
}
