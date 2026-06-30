from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    fmcg_credit_ids = fields.One2many(
        'fmcg.customer.credit',
        'partner_id',
        string='Credit Entries',
    )
    fmcg_total_outstanding = fields.Monetary(
        string='Total Outstanding',
        compute='_compute_fmcg_total_outstanding',
        store=True,
        currency_field='currency_id',
        help='Total unpaid credit balance for this customer',
    )
    fmcg_credit_count = fields.Integer(
        string='Credit Count',
        compute='_compute_fmcg_total_outstanding',
        store=True,
    )

    @api.depends('fmcg_credit_ids', 'fmcg_credit_ids.remaining', 'fmcg_credit_ids.state')
    def _compute_fmcg_total_outstanding(self):
        for partner in self:
            open_credits = partner.fmcg_credit_ids.filtered(
                lambda c: c.state in ('open', 'partial')
            )
            partner.fmcg_total_outstanding = sum(open_credits.mapped('remaining'))
            partner.fmcg_credit_count = len(open_credits)
