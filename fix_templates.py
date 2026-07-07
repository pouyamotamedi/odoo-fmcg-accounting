#!/usr/bin/env python3
"""Fix: deactivate templates that have no active variants, and fix duplicate templates"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Find all templates
tmpls = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['type', '=', 'consu'], ['active', '=', True]]],
    {'fields': ['id', 'name', 'product_variant_count']})

print(f"Found {len(tmpls)} active templates")

for t in tmpls:
    # Check if any active variants exist
    active_variants = models.execute_kw(db, uid, password, 'product.product', 'search',
        [[['product_tmpl_id', '=', t['id']], ['active', '=', True]]])
    if not active_variants:
        print(f"  DEACTIVATING template id={t['id']} name={t['name']} (no active variants)")
        models.execute_kw(db, uid, password, 'product.template', 'write', [[t['id']], {'active': False}])
    else:
        print(f"  OK: id={t['id']} name={t['name']} ({len(active_variants)} active variants)")

# Fix the nesti variant issue: merge the two attribute lines into one
print("\n\n=== Fixing نستی 50 هزار attribute lines ===")
lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
    [[['product_tmpl_id', '=', 11], ['attribute_id', '=', 1]]],  # attr id 1 = طعم (check)
    {'fields': ['id', 'attribute_id', 'value_ids']})

# Get the attribute id for طعم
attr_search = models.execute_kw(db, uid, password, 'product.attribute', 'search_read',
    [[['name', '=', 'طعم']]],
    {'fields': ['id', 'name']})
if attr_search:
    attr_id = attr_search[0]['id']
    lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
        [[['product_tmpl_id', '=', 11], ['attribute_id', '=', attr_id]]],
        {'fields': ['id', 'value_ids']})
    print(f"  Found {len(lines)} lines for طعم on template 11")
    if len(lines) > 1:
        # Merge: collect all value_ids, delete extra lines, update first with all values
        all_values = []
        for l in lines:
            all_values.extend(l['value_ids'])
        all_values = list(set(all_values))
        print(f"  Merging into one line with values: {all_values}")
        # Keep first, delete rest
        keep_id = lines[0]['id']
        delete_ids = [l['id'] for l in lines[1:]]
        # Delete extra lines
        for did in delete_ids:
            try:
                models.execute_kw(db, uid, password, 'product.template.attribute.line', 'unlink', [[did]])
                print(f"  Deleted line id={did}")
            except Exception as e:
                print(f"  Error deleting {did}: {e}")
        # Update the kept line with all values
        models.execute_kw(db, uid, password, 'product.template.attribute.line', 'write',
            [[keep_id], {'value_ids': [[6, 0, all_values]]}])
        print(f"  Updated line id={keep_id} with all values")

        # Now create missing variants
        try:
            models.execute_kw(db, uid, password, 'product.template', 'create_variant_ids', [[11]])
            print("  Created missing variants")
        except Exception as e:
            print(f"  Note: {e}")

print("\nDone!")
