{
    'name': 'FMCG Bank & Cash',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Bank account and cash register management for FMCG shop',
    'description': """
        Extends Odoo accounting journals with FMCG-specific fields:
        - Bank account management with holder name, account number, validation
        - Cash register management with opening balance and running balance
        - Deactivation logic preventing transactions on inactive accounts
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'account',
        'fmcg_base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/account_journal_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
