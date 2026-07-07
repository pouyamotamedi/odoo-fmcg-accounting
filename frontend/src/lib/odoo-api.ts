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
      ['name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'fmcg_reorder_threshold', 'fmcg_is_low_stock', 'image_128', 'product_tmpl_id'],
      limit
    );
  } catch {
    return await searchRead(
      'product.product',
      [['active', '=', true], ['type', '=', 'consu']],
      ['name', 'barcode', 'list_price', 'standard_price', 'qty_available', 'image_128', 'product_tmpl_id'],
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

  // Calculate real accounting balance for each journal from account.move.line
  // In Odoo 18, payments go through "Outstanding Payments" account (asset_current),
  // NOT directly to the journal's default_account_id (asset_cash).
  // So we must sum ALL lines in the journal excluding payable/receivable counterparts.
  for (const j of (journals || [])) {
    try {
      // Get all posted move lines for this journal, excluding the partner-side entries
      // (payable/receivable). This gives us the liquidity side (cash/bank/outstanding).
      const lines = await searchRead('account.move.line', [
        ['journal_id', '=', j.id],
        ['parent_state', '=', 'posted'],
        ['account_id.account_type', 'not in', ['asset_receivable', 'liability_payable']],
      ], ['debit', 'credit'], 0);
      // Negative balance = money went out (outbound payments)
      const balance = (lines || []).reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);
      j.computed_balance = balance;
      // Use computed balance, adding opening balance
      j.fmcg_running_balance = j.computed_balance + (j.fmcg_opening_balance || 0);
    } catch {
      // Keep existing fmcg_running_balance if calculation fails
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
    'name', 'partner_id', 'amount_total', 'invoice_date', 'state', 'payment_state', 'invoice_line_ids',
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

  const invoiceDate = values.date || new Date().toISOString().split('T')[0];

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
 * @param invoiceId - the confirmed invoice ID
 * @param journalId - the specific bank/cash journal to pay from
 * @param amount - the amount to pay (partial or full)
 */
export async function registerInvoicePayment(invoiceId: number, journalId: number, amount: number) {
  const invoice = await searchRead('account.move', [['id', '=', invoiceId]], ['amount_total', 'partner_id', 'move_type', 'amount_residual'], 1);
  if (!invoice || invoice.length === 0) return;

  const payAmount = amount || invoice[0].amount_residual || invoice[0].amount_total;
  const paymentType = invoice[0].move_type === 'in_invoice' ? 'outbound' : 'inbound';
  const partnerType = invoice[0].move_type === 'in_invoice' ? 'supplier' : 'customer';

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
    'name', 'partner_id', 'amount_total', 'invoice_date', 'state', 'narration', 'create_date',
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

  const refundId = await create('account.move', {
    move_type: 'out_refund',
    partner_id: partner_id,
    invoice_line_ids: refund_lines,
    narration: values.note || false,
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

  // If waste (not return to stock), record an expense journal entry
  // so the cost goes to the expense account (code 600000)
  if (!values.return_to_stock) {
    try {
      // Find expense account with code 600000
      const expenseAccounts = await searchRead('account.account', [['code', '=', '600000']], ['id'], 1);
      if (expenseAccounts && expenseAccounts.length > 0 && values.journal_id) {
        const expenseAccountId = expenseAccounts[0].id;
        const totalAmount = values.lines.reduce((sum, l) => sum + l.quantity * l.price_unit, 0);

        // Create an outbound payment to expense account
        const expensePaymentId = await create('account.payment', {
          payment_type: 'outbound',
          partner_type: 'supplier',
          partner_id: partner_id || false,
          amount: totalAmount,
          journal_id: values.journal_id,
          destination_account_id: expenseAccountId,
        });
        await callMethod('account.payment', 'action_post', [[expensePaymentId]]);
      }
    } catch { /* expense recording failed, refund still done */ }
  }

  // If return_to_stock, create a stock return (incoming picking)
  if (values.return_to_stock) {
    try {
      // Find the receipt picking type (incoming)
      const pickingTypes = await searchRead('stock.picking.type', [['code', '=', 'incoming']], ['id', 'default_location_src_id', 'default_location_dest_id'], 1);
      if (pickingTypes && pickingTypes.length > 0) {
        const pickingType = pickingTypes[0];
        const srcLocation = pickingType.default_location_src_id?.[0] || false;
        const destLocation = pickingType.default_location_dest_id?.[0] || false;

        const moveLines = values.lines.map((line) => [0, 0, {
          product_id: line.product_id,
          name: 'Return',
          product_uom_qty: line.quantity,
          location_id: srcLocation,
          location_dest_id: destLocation,
        }]);

        const pickingId = await create('stock.picking', {
          picking_type_id: pickingType.id,
          partner_id: partner_id || false,
          origin: `Sales Return ${refundId}`,
          location_id: srcLocation,
          location_dest_id: destLocation,
          move_ids_without_package: moveLines,
        });

        await callMethod('stock.picking', 'action_confirm', [[pickingId]]);
        
        // Set quantities done
        const moves = await searchRead('stock.move', [['picking_id', '=', pickingId]], ['id', 'product_uom_qty']);
        for (const move of (moves || [])) {
          await write('stock.move', [move.id], { quantity: move.product_uom_qty });
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
  return create('product.category', { name, parent_id: parent_id || false });
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
