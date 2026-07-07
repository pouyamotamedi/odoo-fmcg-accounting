#!/usr/bin/env python3
"""Force variant creation for templates that should have more variants"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Check tag bot
print("=== تاگ بات 13000 ===")
lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', 16]]],
    {'fields': ['id', 'attribute_id', 'value_ids']})
for l in lines:
    vals = models.execute_kw(db, uid, password, 'product.attribute.value', 'read', [l['value_ids']], {'fields': ['name']})
    print(f"  Line {l['id']}: {l['attribute_id'][1]} = {[v['name'] for v in vals]}")

variants = models.execute_kw(db, uid, password, 'product.product', 'search_read',
    [[['product_tmpl_id', '=', 16]]],
    {'fields': ['id', 'display_name', 'active']})
print(f"  Variants (including inactive):")
for v in variants:
    print(f"    id={v['id']} active={v['active']} name={v['display_name']}")

# Try to reactivate inactive variants
inactive = [v for v in variants if not v['active']]
if inactive:
    print(f"\n  Reactivating {len(inactive)} inactive variants...")
    models.execute_kw(db, uid, password, 'product.product', 'write',
        [[v['id'] for v in inactive], {'active': True}])
    print("  Done!")

# Also check if we need to delete the extra attribute that was created by mistake
print("\n\n=== All product attributes ===")
attrs = models.execute_kw(db, uid, password, 'product.attribute', 'search_read',
    [[]], {'fields': ['id', 'name']})
for a in attrs:
    # Count how many lines use this attribute
    line_count = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_count',
        [[['attribute_id', '=', a['id']]]])
    print(f"  id={a['id']} name={a['name']} (used in {line_count} products)")

print("\nDone!")
