{
    'name': 'FMCG Discount Categories',
    'version': '18.0.1.1.0',
    'category': 'Sales',
    'summary': 'Discount categories with per-product pricing (wholesale, loyalty, etc.)',
    'depends': ['product', 'sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/fmcg_discount_views.xml',
    ],
    'installable': True,
    'application': False,
}
