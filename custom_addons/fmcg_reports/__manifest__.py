{
    'name': 'FMCG Reports',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Business reports for FMCG shop (sales, inventory, credit, cash flow)',
    'description': """
        Custom reports for FMCG shop:
        - Daily sales summary with payment method breakdown
        - Inventory status with stock values
        - Customer credit aging report
        - Cash flow report
        - PDF export with Persian support
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'account',
        'stock',
        'point_of_sale',
        'fmcg_base',
        'fmcg_credit',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/fmcg_report_views.xml',
        'report/daily_sales_report_template.xml',
    ],
    'installable': True,
    'auto_install': False,
}
