#!/usr/bin/env python3
"""Fix remaining Manual Payment labels"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

fa_name = '\u067e\u0631\u062f\u0627\u062e\u062a \u062f\u0633\u062a\u06cc'

# Fix payment methods named "Manual Payment"
print("=== Payment Methods ===")
ids = models.execute_kw(db, uid, password, 'account.payment.method', 'search', [[['name', '=', 'Manual Payment']]])
if ids:
    models.execute_kw(db, uid, password, 'account.payment.method', 'write', [ids, {'name': fa_name}])
    print(f"  Fixed {len(ids)} payment methods")

# Fix payment method lines named "Manual Payment"
print("=== Payment Method Lines ===")
ids = models.execute_kw(db, uid, password, 'account.payment.method.line', 'search', [[['name', '=', 'Manual Payment']]])
if ids:
    models.execute_kw(db, uid, password, 'account.payment.method.line', 'write', [ids, {'name': fa_name}])
    print(f"  Fixed {len(ids)} payment method lines")

print("\nDone!")
