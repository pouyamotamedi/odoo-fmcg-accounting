{
    'name': 'FMCG Sales Incentive',
    'version': '18.0.1.1.0',
    'category': 'Sales',
    'summary': 'Simple shift commission and Hubbleium rewards',
    'author': 'FMCG Shop',
    'license': 'LGPL-3',
    'depends': ['account', 'fmcg_base'],
    'data': [
        'security/incentive_security.xml',
        'security/ir.model.access.csv',
        'data/default_data.xml',
        'views/incentive_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
