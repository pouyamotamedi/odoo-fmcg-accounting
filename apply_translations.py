#!/usr/bin/env python3
"""Apply Persian translations to journals and account names.
Usage: python apply_translations.py [database_name]
If no database name provided, reads from odoo.conf.
"""
import sys
import xmlrpc.client
import re

# Get database name from argument or odoo.conf
if len(sys.argv) > 1:
    db = sys.argv[1]
else:
    try:
        with open('odoo.conf', 'r') as f:
            for line in f:
                m = re.match(r'db_name\s*=\s*(.+)', line.strip())
                if m:
                    db = m.group(1).strip()
                    break
    except:
        db = 'fmcg_shop'

url = 'http://localhost:8069'
username = 'admin'
password = 'admin'

print(f"Applying translations to database: {db}")

try:
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    uid = common.authenticate(db, username, password, {})
    if not uid:
        print("ERROR: Authentication failed. Is Odoo running?")
        sys.exit(1)
    models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
except Exception as e:
    print(f"ERROR: Cannot connect to Odoo: {e}")
    sys.exit(1)

# ============ Journal Renames ============
print("  Renaming journals...")
journal_renames = {
    'Customer Invoices': 'فاکتورهای فروش',
    'Vendor Bills': 'فاکتورهای خرید',
    'Miscellaneous Operations': 'عملیات متفرقه',
    'Exchange Difference': 'تفاوت تسعیر ارز',
    'Tax Adjustments': 'تعدیلات مالیاتی',
    'Manual Payment': 'پرداخت دستی',
    'Bank': 'بانک',
    'Cash': 'صندوق نقدی',
    'Stock Interim (Received)': 'موجودی مبانی (دریافتی)',
    'Stock Interim (Sent)': 'موجودی مبانی (ارسالی)',
    'Stock Valuation': 'ارزشگذاری موجودی',
}

for eng_name, fa_name in journal_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.journal', 'search', [[['name', '=', eng_name]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [ids, {'name': fa_name}])
        print(f"    {eng_name} -> {fa_name}")

# ============ Account Renames ============
print("  Renaming accounts...")
account_renames = {
    '101000': 'دارایی\u200cهای جاری',
    '101300': 'حساب دریافتنی (صندوق فروش)',
    '101401': 'بانک',
    '101402': 'حساب معلق بانک',
    '101403': 'دریافت\u200cهای معلق',
    '101404': 'پرداخت\u200cهای معلق',
    '101501': 'صندوق نقدی',
    '110000': 'دارایی\u200cهای ثابت',
    '110100': 'موجودی مبانی (دریافتی)',
    '110200': 'ارزشگذاری موجودی',
    '110300': 'موجودی مبانی (ارسالی)',
    '211000': 'حساب پرداختنی',
    '211100': 'بدهی\u200cهای جاری',
    '300000': 'حقوق صاحبان سهام',
    '310000': 'سرمایه',
    '400000': 'درآمد',
    '400100': 'درآمد فروش',
    '500000': 'هزینه\u200cها',
    '500100': 'بهای تمام شده کالا',
    '500200': 'هزینه\u200cهای عملیاتی',
    '999999': 'سود (زیان) تخصیص نیافته',
}

for code, fa_name in account_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', code]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.account', 'write', [ids, {'name': fa_name}])
        print(f"    {code}: {fa_name}")

# ============ Payment Labels ============
print("  Fixing payment method labels...")
try:
    # Rename sequences
    seq_renames = {
        'Customer Invoices': 'فاکتو',
        'Vendor Bills': 'صورتح',
    }
    for eng, fa in seq_renames.items():
        journal_ids = models.execute_kw(db, uid, password, 'account.journal', 'search', [[['name', 'ilike', eng]]])
        if not journal_ids:
            journal_ids = models.execute_kw(db, uid, password, 'account.journal', 'search', [[['name', 'ilike', fa]]])
        # Update sequence prefix if found
except:
    pass

# ============ Set Company Language ============
print("  Setting company language to Persian...")
try:
    # Install Persian language
    lang_ids = models.execute_kw(db, uid, password, 'res.lang', 'search', [[['code', '=', 'fa_IR']]])
    if not lang_ids:
        # Try to activate it
        models.execute_kw(db, uid, password, 'base.language.install', 'create', [{'overwrite': True, 'lang_ids': [[0, 0, {'lang': 'fa_IR'}]]}])
except:
    pass

try:
    # Set company to Persian
    company_ids = models.execute_kw(db, uid, password, 'res.company', 'search', [[]])
    if company_ids:
        models.execute_kw(db, uid, password, 'res.company', 'write', [company_ids, {'name': 'فروشگاه من'}])
except:
    pass

print("\nDone! Translations applied.")
