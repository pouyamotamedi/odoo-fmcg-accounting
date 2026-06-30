from odoo import api, fields, models
from odoo.exceptions import ValidationError


class FmcgCustomerCredit(models.Model):
    _name = 'fmcg.customer.credit'
    _description = 'Customer Credit Entry'
    _order = 'date desc, id desc'

    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=True,
    )
    invoice_ref = fields.Char(
        string='Invoice Reference',
        help='Reference to the originating invoice or POS order',
    )
    amount = fields.Monetary(
        string='Credit Amount',
        required=True,
        currency_field='currency_id',
    )
    currency_id = fields.Many2one(
        'res.currency',
        default=lambda self: self.env.company.currency_id,
        readonly=True,
    )
    note = fields.Text(
        string='Note',
        size=500,
        help='Description of the credit arrangement (max 500 chars)',
    )
    date = fields.Date(
        string='Date',
        default=fields.Date.today,
        required=True,
    )
    state = fields.Selection(
        selection=[
            ('open', 'Open'),
            ('partial', 'Partially Paid'),
            ('paid', 'Paid'),
        ],
        string='Status',
        default='open',
        readonly=True,
    )
    paid_amount = fields.Monetary(
        string='Paid Amount',
        default=0.0,
        readonly=True,
        currency_field='currency_id',
    )
    remaining = fields.Monetary(
        string='Remaining',
        compute='_compute_remaining',
        store=True,
        currency_field='currency_id',
    )
    repayment_ids = fields.One2many(
        'fmcg.credit.repayment',
        'credit_id',
        string='Repayments',
    )

    @api.depends('amount', 'paid_amount')
    def _compute_remaining(self):
        for record in self:
            record.remaining = record.amount - record.paid_amount

    @api.constrains('amount')
    def _check_amount(self):
        for record in self:
            if record.amount <= 0:
                raise ValidationError("Credit amount must be greater than zero.")

    @api.constrains('note')
    def _check_note_length(self):
        for record in self:
            if record.note and len(record.note) > 500:
                raise ValidationError("Note cannot exceed 500 characters.")

    def action_record_repayment(self):
        """Open wizard to record a repayment."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Record Repayment',
            'res_model': 'fmcg.credit.repayment',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_credit_id': self.id,
                'default_partner_id': self.partner_id.id,
            },
        }


class FmcgCreditRepayment(models.Model):
    _name = 'fmcg.credit.repayment'
    _description = 'Credit Repayment Entry'
    _order = 'date desc, id desc'

    credit_id = fields.Many2one(
        'fmcg.customer.credit',
        string='Credit Entry',
        required=True,
        ondelete='cascade',
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        related='credit_id.partner_id',
        store=True,
    )
    amount = fields.Monetary(
        string='Repayment Amount',
        required=True,
        currency_field='currency_id',
    )
    currency_id = fields.Many2one(
        'res.currency',
        default=lambda self: self.env.company.currency_id,
        readonly=True,
    )
    date = fields.Date(
        string='Date',
        default=fields.Date.today,
        required=True,
    )
    note = fields.Char(
        string='Note',
    )

    @api.constrains('amount')
    def _check_amount(self):
        for record in self:
            if record.amount <= 0:
                raise ValidationError("Repayment amount must be greater than zero.")
            if record.amount > record.credit_id.remaining:
                raise ValidationError(
                    f"Repayment amount ({record.amount}) exceeds outstanding balance "
                    f"({record.credit_id.remaining}). Maximum repayable: {record.credit_id.remaining}"
                )

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            credit = record.credit_id
            credit.paid_amount += record.amount
            if credit.remaining <= 0:
                credit.state = 'paid'
            else:
                credit.state = 'partial'
        return records
