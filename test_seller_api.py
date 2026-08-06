"""Test seller API access via JSON-RPC (same as frontend) on shop6"""
import requests

base_url = 'https://shop6.mediumco.org'
session = requests.Session()

# Login as admin first
print("=== Admin Login ===")
r = session.post(f'{base_url}/api/web/session/authenticate', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {'db': 'shop6', 'login': 'admin', 'password': 'admin'}
})
admin_data = r.json()
admin_uid = admin_data.get('result', {}).get('uid')
print(f"  Admin UID: {admin_uid}")

# Get products as admin
r2 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'product.product', 'method': 'search_read',
        'args': [[['active', '=', True], ['type', '=', 'consu']]],
        'kwargs': {'fields': ['name', 'list_price', 'qty_available'], 'limit': 5}
    }
})
admin_products = r2.json().get('result', [])
print(f"  Admin sees {len(admin_products)} products")
for p in admin_products[:3]:
    print(f"    {p['name']} - {p['list_price']} - qty={p.get('qty_available')}")

# Now logout and login as seller
session2 = requests.Session()
print("\n=== Seller Login (sara) ===")
# Try common passwords
for pwd in ['1234', 'sara', 'admin', '123456']:
    r3 = session2.post(f'{base_url}/api/web/session/authenticate', json={
        'jsonrpc': '2.0', 'method': 'call',
        'params': {'db': 'shop6', 'login': 'sara', 'password': pwd}
    })
    seller_data = r3.json()
    seller_uid = seller_data.get('result', {}).get('uid')
    if seller_uid:
        print(f"  Sara UID: {seller_uid} (password: {pwd})")
        break
else:
    # Try ali
    for pwd in ['1234', 'ali', 'admin', '123456']:
        r3 = session2.post(f'{base_url}/api/web/session/authenticate', json={
            'jsonrpc': '2.0', 'method': 'call',
            'params': {'db': 'shop6', 'login': 'ali', 'password': pwd}
        })
        seller_data = r3.json()
        seller_uid = seller_data.get('result', {}).get('uid')
        if seller_uid:
            print(f"  Ali UID: {seller_uid} (password: {pwd})")
            break
    else:
        print("  Could not login as any seller!")
        exit()

# Get products as seller
r4 = session2.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'product.product', 'method': 'search_read',
        'args': [[['active', '=', True], ['type', '=', 'consu']]],
        'kwargs': {'fields': ['name', 'list_price', 'qty_available'], 'limit': 5}
    }
})
result = r4.json()
if 'error' in result:
    print(f"  ERROR: {result['error']['data']['message']}")
else:
    seller_products = result.get('result', [])
    print(f"  Seller sees {len(seller_products)} products")
    for p in seller_products[:3]:
        print(f"    {p['name']} - {p['list_price']} - qty={p.get('qty_available')}")
