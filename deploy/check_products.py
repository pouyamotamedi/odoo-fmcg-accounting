import xmlrpc.client, sys

db = sys.argv[1] if len(sys.argv) > 1 else 'shop3'
url = 'http://localhost:8069'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, 'admin', 'admin', {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

print("=== ALL PRODUCTS ===")
products = models.execute_kw(db, uid, 'admin', 'product.product', 'search_read', 
    [[['type', '=', 'consu']]], 
    {'fields': ['name', 'type', 'is_storable', 'categ_id']})

for p in products:
    print(f"  {p['name'][:30]:30} | type={p['type']} | storable={p['is_storable']} | categ={p['categ_id']}")

print("\n=== PRODUCT CATEGORIES ===")
cats = models.execute_kw(db, uid, 'admin', 'product.category', 'search_read', 
    [[]], 
    {'fields': ['name', 'property_valuation', 'property_cost_method', 'property_stock_account_input_categ_id', 'property_stock_account_output_categ_id', 'property_stock_valuation_account_id']})

for c in cats:
    print(f"  {c['name']:20} | valuation={c.get('property_valuation','?')} | cost={c.get('property_cost_method','?')} | input={c.get('property_stock_account_input_categ_id','?')} | output={c.get('property_stock_account_output_categ_id','?')} | val_acc={c.get('property_stock_valuation_account_id','?')}")
