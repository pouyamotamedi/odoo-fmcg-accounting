from odoo import api, fields, models
from odoo.exceptions import ValidationError, UserError


class FmcgExpense(models.Model):
    _name = 'fmcg.expense'
    _description = 'Simple Expense Entry'
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Reference',
        readonly=True,
        default='New',
        copy=False,
    )
    date = fields.Date(
        string='Date',
        required=True,
        default=fields.Date.today,
    )
    amount = fields.Monetary(
        string='Amount',
        required=True,
        currency_field='currency_id',
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        default=lambda self: self.env.company.currency_id,
        readonly=True,
    )
    account_id = fields.Many2one(
        'account.account',
        string='Expense Account',
        required=True,
        domain="[('account_type', 'in', ['expense', 'expense_direct_cost'])]",
        help='The expense account to debit',
    )
    payment_journal_id = fields.Many2one(
        'account.journal',
        string='Payment Method',
        required=True,
        domain="[('type', 'in', ['bank', 'cash'])]",
        help='Bank or cash account used to pay this expense',
    )
    description = fields.Char(
        string='Description',
        required=True,
        size=200,
        help='Brief description of the expense (minimum 3 characters)',
    )
    state = fields.Selection(
        selection=[
            ('draft', 'Draft'),
            ('confirmed', 'Confirmed'),
            ('cancelled', 'Cancelled'),
        ],
        string='Status',
        default='draft',
        readonly=True,
    )
    move_id = fields.Many2one(
        'account.move',
        string='Journal Entry',
        readonly=True,
        copy=False,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
        readonly=True,
    )

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('fmcg.expense') or 'New'
        return super().create(vals_list)

    @api.constrains('amount')
    def _check_amount(self):
        for record in self:
            if record.amount <= 0:
                raise ValidationError("Amount must be greater than zero.")

    @api.constrains('description')
    def _check_description(self):
        for record in self:
            if record.description and len(record.description.strip()) < 3:
                raise ValidationError("Description must be at least 3 characters.")

    def action_confirm(self):
        """Create double-entry journal entry for the expense."""
        for record in self:
            if record.state != 'draft':
                continue

            if not record.payment_journal_id.default_account_id:
                raise UserError(
                    f"Payment method '{record.payment_journal_id.name}' "
                    f"does not have a default account configured."
                )

            move_vals = {
                'journal_id': record.payment_journal_id.id,
                'date': record.date,
                'ref': f'{record.name} - {record.description}',
                'line_ids': [
                    (0, 0, {
                        'name': record.description,
                        'debit': record.amount,
                        'credit': 0.0,
                        'account_id': record.account_id.id,
                    }),
                    (0, 0, {
                        'name': record.description,
                        'debit': 0.0,
                        'credit': record.amount,
                        'account_id': record.payment_journal_id.default_account_id.id,
                    }),
                ],
            }
            move = self.env['account.move'].create(move_vals)
            move.action_post()

            record.write({
                'state': 'confirmed',
                'move_id': move.id,
            })

    def action_cancel(self):
        """Cancel the expense and reverse the journal entry."""
        for record in self:
            if record.state != 'confirmed':
                continue
            if record.move_id:
                record.move_id.button_draft()
                record.move_id.button_cancel()
            record.state = 'cancelled'

    def action_reset_to_draft(self):
        """Reset cancelled expense back to draft."""
        for record in self:
            if record.state == 'cancelled':
                record.state = 'draft'
