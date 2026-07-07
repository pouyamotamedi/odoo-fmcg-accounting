#!/usr/bin/env python3
"""Final fixes: create missing variants, delete unused attributes"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# 1. Delete unused attribute "نارگیل"
print("Deleting unused attribute 'نارگیل' (id=2)...")
try:
    models.execute_kw(db, uid, password, 'product.attribute', 'unlink', [[2]])
    print("  Done!")
except Exception as e:
    print(f"  Error: {e}")

# 2. Force variant creation for tagbot by writing the template
# Odoo auto-creates variants when attribute lines change
# Let's try a different approach: write the value_ids again to trigger variant creation
print("\nForcing variant regeneration for تاگ بات 13000 (tmpl=16)...")
lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', 16]]],
    {'fields': ['id', 'value_ids']})
for l in lines:
    # Re-write to trigger variant creation
    models.execute_kw(db, uid, password, 'product.template.attribute.line', 'write',
        [[l['id']], {'value_ids': [[6, 0, l['value_ids']]]}])
    print(f"  Re-wrote line {l['id']} with values {l['value_ids']}")

# Check variants now
variants = models.execute_kw(db, uid, password, 'product.product', 'search_read',
    [[['product_tmpl_id', '=', 16], ['active', '=', True]]],
    {'fields': ['id', 'display_name']})
print(f"  Now has {len(variants)} variants:")
for v in variants:
    print(f"    {v['display_name']}")

print("\nDone!")
