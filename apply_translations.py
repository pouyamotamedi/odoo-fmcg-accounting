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
    'Stock Interim (Received)': 'موجودی میانی (دریافتی)',
    'Stock Interim (Sent)': 'موجودی میانی (ارسالی)',
    'Stock Valuation': 'ارزشگذاری موجودی',
    'Inventory Valuation': 'ارزشگذاری موجودی',
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
    '110100': 'موجودی میانی (دریافتی)',
    '110200': 'ارزشگذاری موجودی',
    '110300': 'موجودی میانی (ارسالی)',
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
    '600000': 'هزینه\u200cهای عمومی و اداری',
    '600010': 'هزینه ضایعات و کسری کالا',
    '611000': 'هزینه ملزومات مصرفی',
    '612000': 'اجاره',
    '620000': 'کارمزد بانکی',
    '630000': 'هزینه حقوق و دستمزد',
    '641000': 'زیان تسعیر ارز',
    '642000': 'زیان اختلاف نقدی',
    '643000': 'زیان تخفیف نقدی',
    '961000': 'هزینه تحقیق و توسعه',
    '962000': 'هزینه\u200cهای فروش',
    '999999': 'سود (زیان) تخصیص نیافته',
    '211100': 'سایر حساب\u200cهای پرداختنی',
    '443000': 'سود تخفیف نقدی',
}

for code, fa_name in account_renames.items():
    ids = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', code]]])
    if ids:
        models.execute_kw(db, uid, password, 'account.account', 'write', [ids, {'name': fa_name}])
        print(f"    {code}: {fa_name}")

# ============ Create Missing Accounts (IFRS compliant for retail) ============
print("  Creating missing accounts...")
new_accounts = [
    {'code': '101600', 'name': 'تنخواه\u200cگردان', 'account_type': 'asset_cash'},
    {'code': '151100', 'name': 'استهلاک انباشته دارایی\u200cهای ثابت', 'account_type': 'asset_fixed'},
    {'code': '410000', 'name': 'تخفیفات فروش', 'account_type': 'expense'},
    {'code': '630100', 'name': 'هزینه پورسانت و پاداش فروش', 'account_type': 'expense'},
    {'code': '650000', 'name': 'هزینه استهلاک', 'account_type': 'expense'},
]
for acc in new_accounts:
    existing = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', acc['code']]]])
    if not existing:
        try:
            models.execute_kw(db, uid, password, 'account.account', 'create', [acc])
            print(f"    Created {acc['code']}: {acc['name']}")
        except Exception as e:
            print(f"    Warning creating {acc['code']}: {e}")
    else:
        # Ensure name is correct
        models.execute_kw(db, uid, password, 'account.account', 'write', [existing, {'name': acc['name']}])

# ============ Deactivate Unused Accounts (production/R&D - not needed for retail) ============
print("  Deactivating unused accounts (production/R&D)...")
deactivate_codes = ['110400', '110500', '961000', '962000']
for code in deactivate_codes:
    ids = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', code]]])
    if ids:
        try:
            models.execute_kw(db, uid, password, 'account.account', 'write', [ids, {'deprecated': True}])
            print(f"    Deactivated {code}")
        except:
            pass

# ============ Fix Account Types (443000 and 643000 swapped) ============
print("  Fixing account types for discount accounts...")
try:
    # 443000 should be income type (سود تخفیف نقدی = درآمد)
    acc_443 = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '443000']]])
    if acc_443:
        models.execute_kw(db, uid, password, 'account.account', 'write', [acc_443, {'account_type': 'income_other'}])
        print("    443000: type -> income_other (سود تخفیف نقدی)")

    # 643000 should be expense type (زیان تخفیف نقدی = هزینه)
    acc_643 = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '643000']]])
    if acc_643:
        models.execute_kw(db, uid, password, 'account.account', 'write', [acc_643, {'account_type': 'expense'}])
        print("    643000: type -> expense (زیان تخفیف نقدی)")
except Exception as e:
    print(f"    Warning: {e}")

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
    # Sale journal: code = فاکتو (shows as فاکتو/2026/00001)
    sale_journals = models.execute_kw(db, uid, password, 'account.journal', 'search_read',
        [[['type', '=', 'sale']]], {'fields': ['id', 'name']})
    for j in sale_journals:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [[j['id']], {'code': 'فاکتو'}])
        print(f"    Sale journal code -> فاکتو")

    # Purchase journal: code = صورتح (shows as صورتح/2026/07/0001)
    purchase_journals = models.execute_kw(db, uid, password, 'account.journal', 'search_read',
        [[['type', '=', 'purchase']]], {'fields': ['id', 'name']})
    for j in purchase_journals:
        models.execute_kw(db, uid, password, 'account.journal', 'write', [[j['id']], {'code': 'صورتح'}])
        print(f"    Purchase journal code -> صورتح")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Payment Methods ============
print("  Renaming payment methods...")
try:
    method_renames = {
        'Manual': 'پرداخت دستی',
        'Manual Payment': 'پرداخت دستی',
        'Checks': 'چک',
        'SEPA Credit Transfer': 'انتقال بانکی',
        'SEPA Direct Debit': 'برداشت مستقیم',
        'Batch Deposit': 'واریز دسته‌ای',
    }
    methods = models.execute_kw(db, uid, password, 'account.payment.method', 'search_read', [[]], {'fields': ['id', 'name']})
    for m in methods:
        if m['name'] in method_renames:
            models.execute_kw(db, uid, password, 'account.payment.method', 'write', [[m['id']], {'name': method_renames[m['name']]}])
            print(f"    {m['name']} -> {method_renames[m['name']]}")

    # Payment method lines
    line_ids = models.execute_kw(db, uid, password, 'account.payment.method.line', 'search', [[['name', 'in', list(method_renames.keys())]]])
    if line_ids:
        for lid in line_ids:
            line = models.execute_kw(db, uid, password, 'account.payment.method.line', 'read', [[lid]], {'fields': ['name']})
            if line and line[0]['name'] in method_renames:
                models.execute_kw(db, uid, password, 'account.payment.method.line', 'write', [[lid], {'name': method_renames[line[0]['name']]}])
        print(f"    Fixed {len(line_ids)} payment method lines")
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
    # Search including inactive currencies (IRR may be inactive by default)
    irr_ids = models.execute_kw(db, uid, password, 'res.currency', 'search', [[['name', '=', 'IRR']]], {'context': {'active_test': False}})
    if irr_ids:
        models.execute_kw(db, uid, password, 'res.currency', 'write', [irr_ids, {'active': True, 'symbol': 'تومان', 'rounding': 1.0}])
        print("    IRR activated + symbol: تومان")
        # Set as company currency
        company_ids = models.execute_kw(db, uid, password, 'res.company', 'search', [[]])
        if company_ids:
            models.execute_kw(db, uid, password, 'res.company', 'write', [company_ids, {'currency_id': irr_ids[0]}])
            print("    Company currency set to IRR (تومان)")
    else:
        print("    WARNING: IRR currency not found in database")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Configure Product Categories for Real-Time Valuation ============
print("  Configuring product categories for perpetual inventory (real_time + FIFO)...")
try:
    # Find stock accounts
    input_acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110100']]])
    output_acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110300']]])
    valuation_acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '110200']]])

    if input_acc and output_acc and valuation_acc:
        # Get all product categories except "Expenses/هزینه‌ها"
        all_cats = models.execute_kw(db, uid, password, 'product.category', 'search_read', [[]], {'fields': ['id', 'name']})
        for cat in all_cats:
            cat_name = cat['name']
            # Skip expense categories
            if 'هزینه' in cat_name or 'Expense' in cat_name:
                continue
            models.execute_kw(db, uid, password, 'product.category', 'write', [[cat['id']], {
                'property_valuation': 'real_time',
                'property_cost_method': 'fifo',
                'property_stock_account_input_categ_id': input_acc[0],
                'property_stock_account_output_categ_id': output_acc[0],
                'property_stock_valuation_account_id': valuation_acc[0],
            }])
            print(f"    Category '{cat_name}': real_time + FIFO")
    else:
        print("    WARNING: Stock accounts (110100/110200/110300) not found. Skipping category setup.")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Fix all products to be storable ============
print("  Ensuring all products are storable (for proper inventory valuation)...")
try:
    non_storable = models.execute_kw(db, uid, password, 'product.product', 'search', [[['type', '=', 'consu'], ['is_storable', '=', False]]])
    if non_storable:
        models.execute_kw(db, uid, password, 'product.product', 'write', [non_storable, {'is_storable': True}])
        print(f"    Fixed {len(non_storable)} products to storable")
    else:
        print("    All products already storable")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Configure Scrap Location Account ============
print("  Configuring scrap location expense account...")
try:
    # Find scrap location
    scrap_locs = models.execute_kw(db, uid, password, 'stock.location', 'search', [[['scrap_location', '=', True]]])
    if not scrap_locs:
        scrap_locs = models.execute_kw(db, uid, password, 'stock.location', 'search', [[['name', 'ilike', 'scrap']]])
    
    if scrap_locs:
        # Create dedicated scrap expense account (600010) if not exists
        scrap_acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '600010']]])
        if not scrap_acc:
            scrap_acc = [models.execute_kw(db, uid, password, 'account.account', 'create', [{
                'code': '600010',
                'name': 'هزینه ضایعات و کسری کالا',
                'account_type': 'expense',
            }])]
            print("    Created account 600010: هزینه ضایعات و کسری کالا")
        
        # Set scrap location accounts
        models.execute_kw(db, uid, password, 'stock.location', 'write', [scrap_locs, {
            'valuation_in_account_id': scrap_acc[0],
            'valuation_out_account_id': scrap_acc[0],
        }])
        print(f"    Scrap location -> 600010 (هزینه ضایعات)")
    else:
        print("    WARNING: No scrap location found")
except Exception as e:
    print(f"    Warning: {e}")

# ============ Set COGS Account on Product Categories ============
# Standard accounting: COGS (500000) separate from operating expenses (600000)
print("  Setting COGS account (500000) on product categories...")
try:
    cogs_acc = models.execute_kw(db, uid, password, 'account.account', 'search', [[['code', '=', '500000']]])
    if cogs_acc:
        # Get all product categories (except expense categories)
        all_cats = models.execute_kw(db, uid, password, 'product.category', 'search_read', [[]], {'fields': ['id', 'name']})
        for cat in all_cats:
            if 'هزینه' in cat['name'] or 'Expense' in cat['name']:
                continue
            models.execute_kw(db, uid, password, 'product.category', 'write', [[cat['id']], {
                'property_account_expense_categ_id': cogs_acc[0],
            }])
        print(f"    All product categories -> expense account 500000 (بهای تمام شده)")
    else:
        print("    WARNING: Account 500000 not found")
except Exception as e:
    print(f"    Warning: {e}")

print("\nDone! All translations and fixes applied.")

# Fix seller user groups - ensure all sellers have POS/Inventory/Invoicing access
print("  Fixing seller user groups...")
try:
    # Ensure "مشتری عمومی" (walk-in customer) exists
    existing_partner = models.execute_kw(db, uid, password, 'res.partner', 'search',
        [[['name', '=', 'مشتری عمومی']]])
    if not existing_partner:
        models.execute_kw(db, uid, password, 'res.partner', 'create',
            [{'name': 'مشتری عمومی', 'customer_rank': 1}])
        print("    Created default customer: مشتری عمومی")
    else:
        print("    Default customer exists: مشتری عمومی")
except Exception as e:
    print(f"    Warning creating default customer: {e}")

try:
    # Find required group IDs
    required_groups = []
    for xml_id in ['base.group_user', 'base.group_partner_manager', 'point_of_sale.group_pos_user', 'stock.group_stock_user', 'account.group_account_invoice', 'sales_team.group_sale_salesman']:
        try:
            gid = models.execute_kw(db, uid, password, 'ir.model.data', 'search_read',
                [[['module', '=', xml_id.split('.')[0]], ['name', '=', xml_id.split('.')[1]]]],
                {'fields': ['res_id'], 'limit': 1})
            if gid:
                required_groups.append(gid[0]['res_id'])
        except:
            pass
    
    if required_groups:
        # Find all seller users (fmcg_is_seller = True) or non-admin internal users
        sellers = models.execute_kw(db, uid, password, 'res.users', 'search_read',
            [[['id', '!=', 2], ['active', '=', True]]],
            {'fields': ['id', 'login', 'groups_id']})
        for seller in sellers:
            existing = set(seller['groups_id'])
            missing = [g for g in required_groups if g not in existing]
            if missing:
                # Add missing groups
                models.execute_kw(db, uid, password, 'res.users', 'write',
                    [[seller['id']], {'groups_id': [(4, g) for g in missing]}])
                print(f"    Fixed groups for user: {seller['login']}")
        if not sellers:
            print("    No non-admin users to fix")
    else:
        print("    WARNING: Could not find required groups")
except Exception as e:
    print(f"    Warning: {e}")
