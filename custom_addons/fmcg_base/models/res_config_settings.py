from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    fmcg_default_locale = fields.Selection(
        related='company_id.fmcg_default_locale',
        readonly=False,
    )
    fmcg_pos_terminal_enabled = fields.Boolean(
        related='company_id.fmcg_pos_terminal_enabled',
        readonly=False,
    )
    fmcg_offline_mode_enabled = fields.Boolean(
        related='company_id.fmcg_offline_mode_enabled',
        readonly=False,
    )
    fmcg_jalali_calendar = fields.Boolean(
        related='company_id.fmcg_jalali_calendar',
        readonly=False,
    )
