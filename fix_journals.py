#!/usr/bin/env python3
"""Fix journal names - rename default English journals to Persian via XML-RPC"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Journal renames: English name -> Persian name
journal_renames = {
    'Customer Invoices': '\u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627\u06cc \u0641\u0631\u0648\u0634',
    'Vendor Bills': '\u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627\u06cc \u062e\u0631\u06cc\u062f',
    'Miscellaneous Operations': '\u0639\u0645\u0644\u06cc\u0627\u062a \u0645\u062a\u0641\u0631\u0642\u0647',
    'Exchange Difference': '\u062a\u0641\u0627\u0648\u062a \u062a\u0633\u0639\u06cc\u0631 \u0627\u0631\u0632',
    'Tax Adjustments': '\u062a\u0639\u062f\u06cc\u0644\u0627\u062a \u0645\u0627\u0644\u06cc\u0627\u062a\u06cc',
    'Manual Payment': '\u067e\u0631\u062f\u0627\u062e\u062a \u062f\u0633\u062a\u06cc',
    'Cash': '\u0635\u0646\u062f\u0648\u0642 \u0646\u0642\u062f\u06cc',
    'Bank': '\u0628\u0627\u0646\u06a9',
}

count = 0
for eng_name, fa_name in journal_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.journal', 'search', [[['name', '=', eng_name]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [ids, {'name': fa_name}])
        count += 1
        print(f'  {eng_name} -> {fa_name}')
    else:
        print(f'  [skip] {eng_name} not found')

print(f'\nDone! {count} journals renamed.')
