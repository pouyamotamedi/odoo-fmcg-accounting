#!/usr/bin/env python3
"""Fix remaining English journal names"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Rename by ID (we know them from listing)
renames = {
    5: '\u0645\u0627\u0644\u06cc\u0627\u062a \u0646\u0642\u062f\u06cc',        # Cash Basis Taxes
    8: '\u0627\u0631\u0632\u0634\u200c\u06af\u0630\u0627\u0631\u06cc \u0645\u0648\u062c\u0648\u062f\u06cc',  # Inventory Valuation
}

for jid, name in renames.items():
    models.execute_kw(db, uid, password, 'account.journal', 'write', [[jid], {'name': name}])
    print(f'  id={jid} -> {name}')

print('\nDone!')
