{
    'name': 'FMCG Base',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Base module for FMCG shop customization',
    'description': """
        Core configuration module for FMCG shop.
        Provides shared settings, operator permissions, and base utilities
        used by all other FMCG modules.
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'point_of_sale',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_views.xml',
        'views/res_users_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
