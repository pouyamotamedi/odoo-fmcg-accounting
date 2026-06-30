{
    'name': 'FMCG POS Terminal',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'POS bank terminal integration for automatic amount transmission',
    'description': """
        Integration with bank POS terminal devices:
        - Automatic amount transmission to terminal on card payment
        - Serial (RS232) and TCP/IP communication protocols
        - Connection timeout (10s) and transaction timeout (120s)
        - Manual reference entry fallback when device unreachable
        - Admin configuration for terminal settings
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'fmcg_base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/fmcg_pos_terminal_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
