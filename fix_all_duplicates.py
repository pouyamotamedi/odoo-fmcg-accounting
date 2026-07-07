#!/usr/bin/env python3
"""Fix ALL templates that have duplicate attribute lines for the same attribute"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Get all active templates
tmpls = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['type', '=', 'consu'], ['active', '=', True]]],
    {'fields': ['id', 'name']})

print(f"Checking {len(tmpls)} templates for duplicate attribute lines...\n")

for t in tmpls:
    lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
        [[['product_tmpl_id', '=', t['id']]]],
        {'fields': ['id', 'attribute_id', 'value_ids']})
    
    # Group by attribute_id
    attr_groups = {}
    for line in lines:
        attr_id = line['attribute_id'][0]
        if attr_id not in attr_groups:
            attr_groups[attr_id] = []
        attr_groups[attr_id].append(line)
    
    # Merge duplicates
    for attr_id, group_lines in attr_groups.items():
        if len(group_lines) > 1:
            attr_name = group_lines[0]['attribute_id'][1]
            print(f"  [{t['name']}] Merging {len(group_lines)} duplicate lines for attr '{attr_name}'")
            
            # Collect all value_ids
            all_values = []
            for gl in group_lines:
                all_values.extend(gl['value_ids'])
            all_values = list(set(all_values))
            
            # Keep first line, delete rest
            keep_id = group_lines[0]['id']
            delete_ids = [gl['id'] for gl in group_lines[1:]]
            
            for did in delete_ids:
                try:
                    models.execute_kw(db, uid, password, 'product.template.attribute.line', 'unlink', [[did]])
                    print(f"    Deleted line id={did}")
                except Exception as e:
                    print(f"    Error deleting {did}: {e}")
            
            # Update kept line with all values
            models.execute_kw(db, uid, password, 'product.template.attribute.line', 'write',
                [[keep_id], {'value_ids': [[6, 0, all_values]]}])
            print(f"    Updated line id={keep_id} with {len(all_values)} values")

# Now verify variants exist for all templates
print("\n\nVerifying variants...")
for t in tmpls:
    variants = models.execute_kw(db, uid, password, 'product.product', 'search_read',
        [[['product_tmpl_id', '=', t['id']], ['active', '=', True]]],
        {'fields': ['id', 'display_name']})
    lines = models.execute_kw(db, uid, password, 'product.template.attribute.line', 'search_read',
        [[['product_tmpl_id', '=', t['id']]]],
        {'fields': ['id', 'value_ids']})
    total_values = sum(len(l['value_ids']) for l in lines) if lines else 0
    print(f"  {t['name']}: {len(variants)} variants, {len(lines)} attr lines, {total_values} total values")
    
    # If there should be variants but aren't enough, try to regenerate
    if lines and total_values > 0 and len(variants) < total_values:
        try:
            models.execute_kw(db, uid, password, 'product.template', '_create_variant_ids', [[t['id']]])
            print(f"    -> Regenerated variants")
        except:
            pass

print("\nDone!")
