from odoo import api, fields, models
from odoo.exceptions import ValidationError, UserError


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    # Bank account specific fields
    fmcg_account_holder = fields.Char(
        string='FMCG Account Holder',
        size=100,
        help='Name of the bank account holder',
    )
    fmcg_account_number = fields.Char(
        string='Bank Account Number',
        size=26,
        help='Bank account number (10 to 26 digits)',
    )
    fmcg_opening_balance = fields.Monetary(
        string='Opening Balance',
        default=0.0,
        help='Initial balance when the account/register was created',
    )
    fmcg_is_active = fields.Boolean(
        string='FMCG Active',
        default=True,
        help='Inactive accounts cannot receive new transactions',
    )
    fmcg_running_balance = fields.Monetary(
        string='Running Balance',
        compute='_compute_running_balance',
        store=True,
        help='Current balance = Opening balance + sum of all transactions',
    )

    @api.depends('fmcg_opening_balance')
    def _compute_running_balance(self):
        """Calculate running balance as opening balance + sum of transactions."""
        for journal in self:
            if journal.type in ('bank', 'cash'):
                # Sum all posted move lines for this journal's default account
                domain = [
                    ('journal_id', '=', journal.id),
                    ('parent_state', '=', 'posted'),
                ]
                move_lines = self.env['account.move.line'].search(domain)
                total = sum(move_lines.mapped('debit')) - sum(move_lines.mapped('credit'))
                journal.fmcg_running_balance = journal.fmcg_opening_balance + total
            else:
                journal.fmcg_running_balance = 0.0

    @api.constrains('fmcg_account_number')
    def _check_unique_account_number(self):
        """Ensure bank account numbers are unique across all active bank journals."""
        for journal in self:
            if journal.fmcg_account_number and journal.type == 'bank':
                duplicate = self.search([
                    ('fmcg_account_number', '=', journal.fmcg_account_number),
                    ('type', '=', 'bank'),
                    ('id', '!=', journal.id),
                ])
                if duplicate:
                    raise ValidationError(
                        f"Account number '{journal.fmcg_account_number}' already exists. "
                        f"Each bank account must have a unique account number."
                    )

    @api.constrains('fmcg_account_number')
    def _check_account_number_format(self):
        """Validate account number is 10-26 digits."""
        for journal in self:
            if journal.fmcg_account_number and journal.type == 'bank':
                number = journal.fmcg_account_number.strip()
                if not number.isdigit():
                    raise ValidationError(
                        "Account number must contain only digits."
                    )
                if len(number) < 10 or len(number) > 26:
                    raise ValidationError(
                        "Account number must be between 10 and 26 digits."
                    )

    def write(self, vals):
        """Prevent modification of account number if transactions exist."""
        if 'fmcg_account_number' in vals:
            for journal in self:
                if journal.type == 'bank' and journal.fmcg_account_number:
                    has_moves = self.env['account.move.line'].search_count([
                        ('journal_id', '=', journal.id),
                        ('parent_state', '=', 'posted'),
                    ])
                    if has_moves and vals['fmcg_account_number'] != journal.fmcg_account_number:
                        raise UserError(
                            "Cannot change account number for a bank account that has recorded transactions. "
                            "You can still update the account holder name and bank name."
                        )
        return super().write(vals)

    def action_check_active(self):
        """Check if journal is active before allowing transaction recording."""
        self.ensure_one()
        if not self.fmcg_is_active:
            raise UserError(
                f"The account/register '{self.name}' is inactive. "
                f"No new transactions can be recorded against it."
            )
        return True
