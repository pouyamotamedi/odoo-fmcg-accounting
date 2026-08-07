"""Test if seller can create res.partner on shop6"""
import requests

base_url = 'https://shop6.mediumco.org'
session = requests.Session()

# Login as sara
r = session.post(f'{base_url}/api/web/session/authenticate', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {'db': 'shop6', 'login': 'sara', 'password': 'sara'}
})
uid = r.json().get('result', {}).get('uid')
print(f"Sara UID: {uid}")

# Try to create partner
print("\n=== Create 'مشتری عمومی' ===")
r2 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
    'jsonrpc': '2.0', 'method': 'call',
    'params': {
        'model': 'res.partner', 'method': 'create',
        'args': [{'name': '\u0645\u0634\u062a\u0631\u06cc \u0639\u0645\u0648\u0645\u06cc', 'customer_rank': 1}],
        'kwargs': {}
    }
})
r2_data = r2.json()
if 'error' in r2_data:
    print(f"  ERROR: {r2_data['error']['data']['message'][:300]}")
else:
    partner_id = r2_data.get('result')
    print(f"  Created partner id={partner_id}")
    
    # Now try invoice with this partner
    r3 = session.post(f'{base_url}/api/web/dataset/call_kw', json={
        'jsonrpc': '2.0', 'method': 'call',
        'params': {
            'model': 'product.product', 'method': 'search_read',
            'args': [[['active', '=', True], ['type', '=', 'consu']]],
            'kwargs': {'fields': ['id', 'list_price'], 'limit': 1, 'offset': 0, 'order': ''}
        }
    })
    products = r3.json().get('result', [])
    
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
        print(f"  Invoice create ERROR: {r4_data['error']['data']['message'][:200]}")
    else:
        move_id = r4_data.get('result')
        print(f"  Invoice id={move_id}")
        # Confirm
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
            print(f"  Confirm ERROR: {r5_data['error']['data']['message'][:200]}")
        else:
            print(f"  CONFIRMED OK!")
