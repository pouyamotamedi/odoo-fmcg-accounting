"""Test seller creating POS invoice on shop6 - same flow as frontend"""
import requests

base_url = 'https://shop6.mediumco.org'
session = requests.Session()

# Login as sara
print("=== Login as sara ===")
r = session.post(f'{base_url}/api/web/session/authenticate', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {'db': 'shop6', 'login': 'sara', 'password': 'sara'}
})
data = r.json()
uid = data.get('result', {}).get('uid')
print(f"  UID: {uid}")
if not uid:
    print("  LOGIN FAILED!")
    exit()

# Step 1: Try to find "مشتری عمومی"
print("\n=== Step 1: searchRead res.partner ===")
r2 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'res.partner', 'method': 'search_read',
        'args': [[['name', '=', '\u0645\u0634\u062a\u0631\u06cc \u0639\u0645\u0648\u0645\u06cc']]],
        'kwargs': {'fields': ['id', 'name'], 'limit': 1, 'offset': 0, 'order': ''}
    }
})
r2_data = r2.json()
if 'error' in r2_data:
    print(f"  ERROR: {r2_data['error']['data']['message'][:200]}")
else:
    partners = r2_data.get('result', [])
    print(f"  Found: {partners}")

# Step 2: Try to create invoice with partner
print("\n=== Step 2: Create invoice ===")
# First get a product
r3 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'product.product', 'method': 'search_read',
        'args': [[['active', '=', True], ['type', '=', 'consu']]],
        'kwargs': {'fields': ['id', 'name', 'list_price'], 'limit': 1, 'offset': 0, 'order': ''}
    }
})
r3_data = r3.json()
if 'error' in r3_data:
    print(f"  Product search ERROR: {r3_data['error']['data']['message'][:200]}")
    exit()
products = r3_data.get('result', [])
print(f"  Product: {products[0]['name'] if products else 'NONE'}")

if not products:
    exit()

# Try creating invoice with partner_id
partner_id = partners[0]['id'] if partners else False
print(f"\n=== Step 3: Create invoice with partner_id={partner_id} ===")
r4 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'account.move', 'method': 'create',
        'args': [{
            'move_type': 'out_invoice',
            'partner_id': partner_id,
            'invoice_date': '2026-08-06',
            'date': '2026-08-06',
            'invoice_line_ids': [[0, 0, {
                'product_id': products[0]['id'],
                'quantity': 1,
                'price_unit': products[0]['list_price'],
            }]],
        }],
        'kwargs': {}
    }
})
r4_data = r4.json()
if 'error' in r4_data:
    print(f"  Create ERROR: {r4_data['error']['data']['message'][:300]}")
else:
    move_id = r4_data.get('result')
    print(f"  Invoice created: id={move_id}")
    
    # Try to confirm
    print(f"\n=== Step 4: Confirm invoice ===")
    r5 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
        'jsonrpc': '2.0', 'method': 'call',
        'params': {
            'model': 'account.move', 'method': 'action_post',
            'args': [[move_id]],
            'kwargs': {}
        }
    })
    r5_data = r5.json()
    if 'error' in r5_data:
        print(f"  Confirm ERROR: {r5_data['error']['data']['message'][:300]}")
    else:
        print(f"  CONFIRMED OK!")
