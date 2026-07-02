/**
 * Odoo JSON-RPC API Client
 * Handles all communication with Odoo backend
 */

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL || '/api';
const ODOO_DB = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';

let sessionId: string | null = null;

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
  sessionId = null;
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

// ============ Specific API Helpers ============

export async function getProducts() {
  return searchRead('product.product', [['active', '=', true], ['type', '=', 'product']], [
    'name', 'barcode', 'list_price', 'standard_price', 'qty_available',
  ]);
}

export async function getPartners(role?: string) {
  const domain: any[] = [];
  if (role === 'supplier') domain.push(['supplier_rank', '>', 0]);
  if (role === 'customer') domain.push(['customer_rank', '>', 0]);
  return searchRead('res.partner', domain, ['name', 'phone', 'supplier_rank', 'customer_rank']);
}

export async function getCustomerCredits() {
  return searchRead('fmcg.customer.credit', [['state', 'in', ['open', 'partial']]], [
    'partner_id', 'amount', 'remaining', 'date', 'state', 'note',
  ]);
}

export async function getBankCashBalances() {
  return searchRead('account.journal', [['type', 'in', ['bank', 'cash']]], [
    'name', 'type', 'fmcg_running_balance', 'fmcg_is_active',
  ]);
}
