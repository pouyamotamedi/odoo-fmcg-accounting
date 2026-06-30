{
    'name': 'FMCG Accounting',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Basic accounting for FMCG shop with expense management',
    'description': """
        Basic accounting extensions for FMCG shop:
        - Simple expense recording with double-entry journal entries
        - Predefined chart of accounts for small retail
        - Profit & Loss and Balance Sheet summaries
        - Automatic journal entries on sales
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'account',
        'fmcg_base',
        'fmcg_bank_cash',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/fmcg_expense_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
