#!/usr/bin/env python3
"""Install fmcg_discount module"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Update module list
print("Updating module list...")
models.execute_kw(db, uid, password, 'ir.module.module', 'update_list', [])

# Find the module
print("Searching for fmcg_discount...")
module_ids = models.execute_kw(db, uid, password, 'ir.module.module', 'search', [[['name', '=', 'fmcg_discount']]])

if module_ids:
    module = models.execute_kw(db, uid, password, 'ir.module.module', 'read', [module_ids, ['name', 'state']])
    print(f"  Found: {module[0]['name']} (state={module[0]['state']})")
    if module[0]['state'] != 'installed':
        print("  Installing...")
        models.execute_kw(db, uid, password, 'ir.module.module', 'button_immediate_install', [module_ids])
        print("  Done!")
    else:
        print("  Already installed.")
else:
    print("  Module not found! Make sure addons_path includes custom_addons folder.")
    print("  Check your odoo.conf: addons_path should include the custom_addons directory.")
