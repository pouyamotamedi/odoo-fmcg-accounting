{
    'name': 'FMCG Boost Pricing',
    'version': '18.0.1.0.0',
    'category': 'Sales',
    'summary': 'Temporary company-scoped POS price boost overrides',
    'depends': ['account', 'fmcg_discount', 'point_of_sale'],
    'data': [
        'security/fmcg_boost_security.xml',
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
