{
    'name': 'FMCG Credit Payment',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Credit/deferred payment tracking for FMCG shop customers',
    'description': """
        Credit and deferred payment management:
        - Track customer outstanding balances
        - Record credit sales with notes
        - Process partial and full repayments
        - Customer credit ledger with aging
        - Split payment support (immediate + credit)
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'account',
        'point_of_sale',
        'fmcg_base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/fmcg_customer_credit_views.xml',
        'views/res_partner_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
