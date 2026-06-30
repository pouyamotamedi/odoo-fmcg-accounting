{
    'name': 'FMCG Offline Mode',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Offline operation with automatic sync for FMCG shop',
    'description': """
        Extends Odoo POS offline capability:
        - Leverages built-in POS offline mode (IndexedDB)
        - Adds sync conflict detection and admin resolution
        - Offline indicator persistence
        - 7-day local transaction retention
        - Retry logic for failed syncs (3 attempts)
        
        Note: Odoo POS already supports offline sales and auto-sync.
        This module adds monitoring, conflict resolution, and extended
        offline support for non-POS operations.
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
        'views/fmcg_sync_log_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
