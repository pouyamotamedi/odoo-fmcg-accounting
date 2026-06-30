{
    'name': 'FMCG Inventory',
    'version': '18.0.1.0.0',
    'category': 'Inventory/Inventory',
    'summary': 'FMCG-specific inventory management with low-stock warnings and stock adjustments',
    'description': """
        Extends Odoo inventory for FMCG shop:
        - Configurable reorder threshold per product with visual low-stock warning
        - Stock adjustment entries for damaged, expired, or lost goods
        - Stock valuation summary
        - Fast barcode lookup
        - Negative stock warning with confirmation
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'stock',
        'product',
        'barcodes',
        'fmcg_base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/product_template_views.xml',
        'views/fmcg_stock_adjustment_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
