from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    fmcg_default_locale = fields.Selection(
        selection=[
            ('en_US', 'English'),
            ('fa_IR', 'Persian (Farsi)'),
        ],
        string='Default Locale',
        default='fa_IR',
        help='Default language/locale for the FMCG shop interface',
    )
    fmcg_pos_terminal_enabled = fields.Boolean(
        string='POS Terminal Integration',
        default=False,
        help='Enable automatic amount transmission to bank POS terminal device',
    )
    fmcg_pax_terminal_ip = fields.Char(
        string='PAX Terminal IP',
        help='IP address of the PAX S800 payment terminal (TCP/IP semi-integrated mode)',
    )
    fmcg_pax_terminal_port = fields.Integer(
        string='PAX Terminal Port',
        default=10009,
        help='TCP port the PAX S800 listens on for ECR commands (default 10009)',
    )
    fmcg_offline_mode_enabled = fields.Boolean(
        string='Offline Mode',
        default=True,
        help='Enable offline operation with automatic sync when connectivity returns',
    )
    fmcg_seller_allowed_menus = fields.Char(
        string='Seller Allowed Menus',
        default='[]',
        help='JSON list of frontend menu keys that seller users may access. '
             'Stored on the company so it applies on every device.',
    )
    fmcg_jalali_calendar = fields.Boolean(
        string='Jalali Calendar',
        default=True,
        help='Use Solar Hijri (Jalali) calendar for date display',
    )
