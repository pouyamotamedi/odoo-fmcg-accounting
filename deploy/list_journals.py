import xmlrpc.client, sys

db = sys.argv[1] if len(sys.argv) > 1 else 'shop1'
url = 'http://localhost:8069'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, 'admin', 'admin', {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

print("=== JOURNALS ===")
journals = models.execute_kw(db, uid, 'admin', 'account.journal', 'search_read', [[]], {'fields': ['name', 'code', 'type']})
for j in journals:
    print(f"  {j['id']:3} | {j['code']:8} | {j['type']:10} | {j['name']}")

print("\n=== PAYMENT METHODS ===")
methods = models.execute_kw(db, uid, 'admin', 'account.payment.method', 'search_read', [[]], {'fields': ['name', 'code', 'payment_type']})
for m in methods:
    print(f"  {m['id']:3} | {m['code']:12} | {m['payment_type']:8} | {m['name']}")

print("\n=== PAYMENT METHOD LINES ===")
lines = models.execute_kw(db, uid, 'admin', 'account.payment.method.line', 'search_read', [[]], {'fields': ['name', 'journal_id']})
for l in lines:
    print(f"  {l['id']:3} | {l['journal_id'][1] if l['journal_id'] else '-':20} | {l['name']}")
