#!/usr/bin/env python3
"""Debug: show templates, variants, and attribute lines"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Find nesti template
tmpls = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['name', 'ilike', 'نستی 50']]],
    {'fields': ['id', 'name', 'active', 'product_variant_count']})

for t in tmpls:
    print(f"\nTemplate: id={t['id']} name={t['name']} active={t['active']} variants={t['product_variant_count']}")

    # Attribute lines
    lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
        [[['product_tmpl_id', '=', t['id']]]],
        {'fields': ['id', 'attribute_id', 'value_ids']})
    for line in lines:
        vals = models.execute_kw(db, uid, password, 'product.attribute.value', 'read', [line['value_ids']], {'fields': ['name']})
        val_names = [v['name'] for v in vals]
        print(f"  AttrLine id={line['id']}: attr={line['attribute_id'][1]} values={val_names}")

    # Variants
    variants = models.execute_kw(db, uid, password, 'product.product', 'search_read',
        [[['product_tmpl_id', '=', t['id']]]],
        {'fields': ['id', 'name', 'display_name', 'active', 'barcode', 'product_template_variant_value_ids']})
    for v in variants:
        print(f"  Variant id={v['id']} active={v['active']} name={v['display_name']} barcode={v['barcode']} ptav_ids={v['product_template_variant_value_ids']}")

# Also check all templates active status
print("\n\n=== All templates ===")
all_tmpls = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['type', '=', 'consu']]],
    {'fields': ['id', 'name', 'active']})
for t in all_tmpls:
    print(f"  id={t['id']} active={t['active']} name={t['name']}")
