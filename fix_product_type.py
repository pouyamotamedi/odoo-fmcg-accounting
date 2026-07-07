#!/usr/bin/env python3
"""
Fix product types: set all consumable products to storable (is_storable=True)
so that Odoo automatically creates accounting entries for stock moves.

In Odoo 18, type='consu' with is_storable=True makes the product tracked in inventory
with automated valuation.
"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Find all consumable products
products = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['type', '=', 'consu']]],
    {'fields': ['id', 'name', 'is_storable', 'categ_id']})

print(f"Found {len(products)} consumable products")

# First, let's check if the product category has automated valuation
# We need categ_id to have property_valuation = 'real_time' for auto journal entries
categ_ids = list(set([p['categ_id'][0] for p in products if p['categ_id']]))
if categ_ids:
    categories = models.execute_kw(db, uid, password, 'product.category', 'search_read',
        [[['id', 'in', categ_ids]]],
        {'fields': ['id', 'name', 'property_valuation', 'property_stock_valuation_account_id',
                    'property_stock_account_input_categ_id', 'property_stock_account_output_categ_id']})
    print(f"\n=== Product Categories ===")
    for c in categories:
        print(f"  {c['name']}: valuation={c.get('property_valuation', 'N/A')}")

    # Set all categories to automated valuation (real_time)
    for c in categories:
        if c.get('property_valuation') != 'real_time':
            try:
                models.execute_kw(db, uid, password, 'product.category', 'write',
                    [[c['id']], {'property_valuation': 'real_time'}])
                print(f"  -> Set {c['name']} to real_time valuation")
            except Exception as e:
                print(f"  [error] {c['name']}: {e}")

# Now set all products to is_storable=True
count = 0
for p in products:
    if not p.get('is_storable'):
        try:
            models.execute_kw(db, uid, password, 'product.template', 'write',
                [[p['id']], {'is_storable': True}])
            count += 1
        except Exception as e:
            print(f"  [error] {p['name']}: {e}")

print(f"\n{count} products set to storable (is_storable=True)")

# Verify stock valuation accounts are set on categories
print("\n=== Checking valuation accounts ===")
categories = models.execute_kw(db, uid, password, 'product.category', 'search_read',
    [[['id', 'in', categ_ids]]],
    {'fields': ['id', 'name', 'property_valuation',
                'property_stock_valuation_account_id',
                'property_stock_account_input_categ_id',
                'property_stock_account_output_categ_id']})
for c in categories:
    val_acc = c.get('property_stock_valuation_account_id')
    in_acc = c.get('property_stock_account_input_categ_id')
    out_acc = c.get('property_stock_account_output_categ_id')
    print(f"  {c['name']}:")
    print(f"    valuation_account: {val_acc}")
    print(f"    input_account: {in_acc}")
    print(f"    output_account: {out_acc}")
    
    # If accounts are missing, set default ones
    # 110100 = Inventory Valuation, 110200 = Stock Interim (Received), 110300 = Stock Interim (Delivered)
    if not val_acc:
        acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110100']]])
        if acc:
            models.execute_kw(db, uid, password, 'product.category', 'write', [[c['id']], {'property_stock_valuation_account_id': acc[0]}])
            print(f"    -> Set valuation account to 110100")
    if not in_acc:
        acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110200']]])
        if acc:
            models.execute_kw(db, uid, password, 'product.category', 'write', [[c['id']], {'property_stock_account_input_categ_id': acc[0]}])
            print(f"    -> Set input account to 110200")
    if not out_acc:
        acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110300']]])
        if acc:
            models.execute_kw(db, uid, password, 'product.category', 'write', [[c['id']], {'property_stock_account_output_categ_id': acc[0]}])
            print(f"    -> Set output account to 110300")

print("\nDone! Products are now storable with automated valuation.")
print("From now on, stock moves (including inventory adjustments) will auto-create journal entries.")
