#!/usr/bin/env python3
"""Apply Persian translations to a fresh Odoo database.
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

# ============ Set Admin User Language to Persian ============
print("  Setting admin language to Persian...")
try:
    # In Odoo 18, lang is on res.partner, not res_users
    admin_partner = models.execute_kw(db, uid, password, 'res.users', 'read', [[2]], {'fields': ['partner_id']})
    if admin_partner:
        partner_id = admin_partner[0]['partner_id'][0]
        models.execute_kw(db, uid, password, 'res.partner', 'write', [[partner_id], {'lang': 'fa_IR'}])
        print("    Admin language set to fa_IR")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Journal Renames ============
print("  Renaming journals...")
journal_renames = {
    'Customer Invoices': 'فاکتورهای فروش',
    'Vendor Bills': 'صورتحساب\u200cهای خرید',
    'Miscellaneous Operations': 'عملیات متفرقه',
    'Exchange Difference': 'تفاوت تسعیر ارز',
    'Tax Adjustments': 'تعدیلات مالیاتی',
    'Manual Payment': 'پرداخت دستی',
    'Bank': 'بانک',
    'Cash': 'صندوق نقدی',
    'Cash Basis Taxes': 'مالیات نقدی',
    'Stock Interim (Received)': 'موجودی مبانی (دریافتی)',
    'Stock Interim (Sent)': 'موجودی مبانی (ارسالی)',
    'Stock Valuation': 'ارزشگذاری موجودی',
}

for eng_name, fa_name in journal_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.journal', 'search', [[['name', '=', eng_name]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [ids, {'name': fa_name}])
        print(f"    {eng_name} -> {fa_name}")

# ============ Account Renames (ALL) ============
print("  Renaming accounts...")
account_renames = {
    '101000': 'دارایی\u200cهای جاری',
    '101100': 'حساب\u200cهای دریافتنی',
    '101200': 'حساب دریافتنی تجاری',
    '101300': 'حساب دریافتنی (صندوق فروش)',
    '101401': 'بانک',
    '101402': 'حساب معلق بانک',
    '101403': 'دریافت\u200cهای معلق',
    '101404': 'پرداخت\u200cهای معلق',
    '101501': 'صندوق نقدی',
    '101600': 'پیش\u200cپرداخت\u200cها',
    '101700': 'مالیات قابل استرداد',
    '101701': 'انتقال نقدینگی',
    '110000': 'دارایی\u200cهای ثابت',
    '110100': 'موجودی مبانی (دریافتی)',
    '110200': 'ارزشگذاری موجودی',
    '110300': 'موجودی مبانی (ارسالی)',
    '110400': 'بهای تولید',
    '110500': 'کار در جریان ساخت',
    '120000': 'دارایی\u200cهای غیرجاری',
    '120100': 'اموال و تجهیزات',
    '120200': 'استهلاک انباشته',
    '121000': 'حساب دریافتنی',
    '121100': 'کالاهای در راه',
    '128000': 'پیش\u200cپرداخت هزینه\u200cها',
    '131000': 'مالیات پرداختی',
    '132000': 'مالیات دریافتنی',
    '141000': 'پیش\u200cپرداخت\u200cها',
    '151000': 'دارایی\u200cهای ثابت مشهود',
    '191000': 'دارایی\u200cهای غیرجاری',
    '201000': 'بدهی\u200cهای جاری',
    '201100': 'کارت اعتباری',
    '211000': 'حساب پرداختنی',
    '211100': 'بدهی\u200cهای جاری',
    '212000': 'درآمد تحقق نیافته',
    '220000': 'بدهی\u200cهای بلندمدت',
    '230000': 'حقوق پرداختنی',
    '230100': 'مالیات حقوق کارکنان',
    '230200': 'مالیات حقوق کارفرما',
    '251000': 'مالیات دریافتی',
    '252000': 'مالیات پرداختنی',
    '291000': 'بدهی\u200cهای غیرجاری',
    '300000': 'حقوق صاحبان سهام',
    '301000': 'سرمایه',
    '302000': 'سود تقسیم شده',
    '310000': 'سرمایه',
    '320000': 'سود انباشته',
    '400000': 'درآمد',
    '400100': 'درآمد فروش',
    '400200': 'سایر درآمدها',
    '441000': 'سود تسعیر ارز',
    '442000': 'سود اختلاف نقدی',
    '443000': 'زیان تخفیف نقدی',
    '450000': 'سایر درآمدها',
    '500000': 'بهای تمام شده کالای فروش',
    '500100': 'بهای تمام شده کالا',
    '500200': 'هزینه\u200cهای عملیاتی',
    '500300': 'هزینه استهلاک',
    '500400': 'هزینه حقوق و دستمزد',
    '500500': 'هزینه\u200cهای اداری',
    '600000': 'هزینه\u200cها',
    '611000': 'خرید تجهیزات',
    '612000': 'اجاره',
    '620000': 'کارمزد بانکی',
    '630000': 'هزینه حقوق',
    '641000': 'زیان تسعیر ارز',
    '642000': 'زیان اختلاف نقدی',
    '643000': 'سود تخفیف نقدی',
    '961000': 'هزینه تحقیق و توسعه',
    '962000': 'هزینه\u200cهای فروش',
    '999999': 'سود (زیان) تخصیص نیافته',
}

for code, fa_name in account_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', code]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.account', 'write', [ids, {'name': fa_name}])
        print(f"    {code}: {fa_name}")

# ============ Product Category Renames ============
print("  Renaming product categories...")
category_renames = {
    'All': 'همه',
    'All / Saleable': 'همه / قابل فروش',
    'All / Expenses': 'همه / هزینه\u200cها',
    'All / Internal': 'همه / داخلی',
    'Saleable': 'قابل فروش',
    'Expenses': 'هزینه\u200cها',
    'Internal': 'داخلی',
}

for eng_name, fa_name in category_renames.items():
    ids = models.execute_kw(db, uid, password, 'product.category', 'search', [[['complete_name', '=', eng_name]]])
    if not ids:
        ids = models.execute_kw(db, uid, password, 'product.category', 'search', [[['name', '=', eng_name]]])
    if ids:
        models.execute_kw(db, uid, password, 'product.category', 'write', [ids, {'name': fa_name}])
        print(f"    {eng_name} -> {fa_name}")

# ============ Sequence Prefixes (Invoice numbers in Persian) ============
print("  Setting invoice sequence prefixes...")
try:
    # Find sale journal and set sequence prefix
    sale_journals = models.execute_kw(db, uid, password, 'account.journal', 'search_read',
        [[['type', '=', 'sale']]], {'fields': ['id', 'name', 'sequence_override_regex']})
    for j in sale_journals:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [[j['id']], {'code': 'INV'}])

    purchase_journals = models.execute_kw(db, uid, password, 'account.journal', 'search_read',
        [[['type', '=', 'purchase']]], {'fields': ['id', 'name']})
    for j in purchase_journals:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [[j['id']], {'code': 'BILL'}])
except Exception as e:
    print(f"    Warning: {e}")

# ============ Set Company Name ============
print("  Setting company name...")
try:
    company_ids = models.execute_kw(db, uid, password, 'res.company', 'search', [[]])
    if company_ids:
        models.execute_kw(db, uid, password, 'res.company', 'write', [company_ids, {'name': 'فروشگاه من'}])
        print("    Company: فروشگاه من")
except:
    pass

# ============ Set Currency to Toman display ============
print("  Setting currency display...")
try:
    irr_ids = models.execute_kw(db, uid, password, 'res.currency', 'search', [[['name', '=', 'IRR']]])
    if irr_ids:
        models.execute_kw(db, uid, password, 'res.currency', 'write', [irr_ids, {'symbol': 'تومان', 'rounding': 1.0}])
        print("    IRR symbol: تومان")
except:
    pass

print("\nDone! All translations applied.")
