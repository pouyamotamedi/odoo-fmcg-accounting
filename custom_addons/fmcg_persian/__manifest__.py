{
    'name': 'FMCG Persian Localization',
    'version': '18.0.1.0.0',
    'category': 'Localization',
    'summary': 'Persian/Farsi localization with RTL and Jalali calendar support',
    'description': """
        Persian/Farsi localization for FMCG shop:
        - RTL layout support
        - Persian translations for all FMCG modules
        - Jalali (Solar Hijri) calendar date display
        - Persian numeral formatting
        - Persian font for PDF reports
    """,
    'author': 'FMCG Shop',
    'website': 'https://github.com/pouyamotamedi/odoo-fmcg-accounting',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'web',
        'fmcg_base',
    ],
    'data': [
        'views/assets.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'fmcg_persian/static/src/css/rtl.css',
        ],
    },
    'installable': True,
    'auto_install': False,
}
