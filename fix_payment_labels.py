#!/usr/bin/env python3
"""Fix payment method names and other English labels in Odoo"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# 1. Fix payment method names (account.payment.method)
print("=== Payment Methods ===")
methods = models.execute_kw(db, uid, password, 'account.payment.method', 'search_read', [[]], {'fields': ['name', 'code', 'payment_type']})
method_renames = {
    'Manual': '\u067e\u0631\u062f\u0627\u062e\u062a \u062f\u0633\u062a\u06cc',  # Manual -> پرداخت دستی
    'Checks': '\u0686\u06a9',  # Checks -> چک
    'SEPA Credit Transfer': '\u0627\u0646\u062a\u0642\u0627\u0644 \u0628\u0627\u0646\u06a9\u06cc',
    'SEPA Direct Debit': '\u0628\u0631\u062f\u0627\u0634\u062a \u0645\u0633\u062a\u0642\u06cc\u0645',
    'Batch Deposit': '\u0648\u0627\u0631\u06cc\u0632 \u062f\u0633\u062a\u0647\u200c\u0627\u06cc',
}
for m in methods:
    if m['name'] in method_renames:
        new_name = method_renames[m['name']]
        models.execute_kw(db, uid, password, 'account.payment.method', 'write', [[m['id']], {'name': new_name}])
        print(f"  {m['name']} -> {new_name}")
    else:
        print(f"  [ok] {m['name']}")

# 2. Fix payment method line names (account.payment.method.line)
print("\n=== Payment Method Lines ===")
pm_lines = models.execute_kw(db, uid, password, 'account.payment.method.line', 'search_read', [[]], {'fields': ['name', 'payment_method_id']})
line_renames = {
    'Manual': '\u067e\u0631\u062f\u0627\u062e\u062a \u062f\u0633\u062a\u06cc',
    'Checks': '\u0686\u06a9',
    'SEPA Credit Transfer': '\u0627\u0646\u062a\u0642\u0627\u0644 \u0628\u0627\u0646\u06a9\u06cc',
    'SEPA Direct Debit': '\u0628\u0631\u062f\u0627\u0634\u062a \u0645\u0633\u062a\u0642\u06cc\u0645',
    'Batch Deposit': '\u0648\u0627\u0631\u06cc\u0632 \u062f\u0633\u062a\u0647\u200c\u0627\u06cc',
}
for pl in pm_lines:
    if pl['name'] in line_renames:
        new_name = line_renames[pl['name']]
        models.execute_kw(db, uid, password, 'account.payment.method.line', 'write', [[pl['id']], {'name': new_name}])
        print(f"  {pl['name']} -> {new_name}")
    else:
        print(f"  [ok] {pl['name']}")

# 3. Fix existing move line labels that say "Manual Payment"
print("\n=== Fixing existing move line labels ===")
move_lines = models.execute_kw(db, uid, password, 'account.move.line', 'search', [[['name', '=', 'Manual Payment']]])
if move_lines:
    models.execute_kw(db, uid, password, 'account.move.line', 'write', [move_lines, {'name': '\u067e\u0631\u062f\u0627\u062e\u062a \u062f\u0633\u062a\u06cc'}])
    print(f"  Fixed {len(move_lines)} move lines")
else:
    print("  No 'Manual Payment' labels found in move lines")

# Also check for other English labels in move lines
eng_labels = {
    'Exchange Difference': '\u062a\u0641\u0627\u0648\u062a \u062a\u0633\u0639\u06cc\u0631 \u0627\u0631\u0632',
    'Bank Fees': '\u06a9\u0627\u0631\u0645\u0632\u062f \u0628\u0627\u0646\u06a9\u06cc',
    'Tax adjustment': '\u062a\u0639\u062f\u06cc\u0644 \u0645\u0627\u0644\u06cc\u0627\u062a',
}
for eng, fa in eng_labels.items():
    ids = models.execute_kw(db, uid, password, 'account.move.line', 'search', [[['name', '=', eng]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.move.line', 'write', [ids, {'name': fa}])
        print(f"  Fixed {len(ids)} lines: '{eng}' -> '{fa}'")

print("\nDone!")
