from odoo import _, api, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_compare


class FmcgOpeningInventory(models.AbstractModel):
    _name = 'fmcg.opening.inventory'
    _description = 'Atomic Opening Journal and Inventory Registration'

    @api.model
    def create_opening(self, values):
        self.env['account.move'].check_access('create')
        self.env['stock.quant'].check_access('write')

        opening_date = values.get('date')
        request_id = (values.get('request_id') or '').strip()
        journal_lines = values.get('journal_lines') or []
        inventory_lines = values.get('inventory_lines') or []

        if not opening_date:
            raise ValidationError(_('Opening date is required.'))
        if not request_id or len(request_id) > 64:
            raise ValidationError(_('A valid opening request identifier is required.'))
        if not journal_lines:
            raise ValidationError(_('At least one opening journal line is required.'))

        request_ref = 'FMCG-OPENING:%s' % request_id
        existing_move = self.env['account.move'].search([
            ('company_id', '=', self.env.company.id),
            ('ref', '=', request_ref),
            ('state', '=', 'posted'),
        ], limit=1)
        if existing_move:
            return {
                'move_id': existing_move.id,
                'processed_products': 0,
                'already_processed': True,
            }

        account_ids = {line.get('account_id') for line in journal_lines if line.get('account_id')}
        accounts = self.env['account.account'].browse(account_ids).exists()
        if len(accounts) != len(account_ids):
            raise ValidationError(_('One or more opening accounts are invalid.'))

        move_lines = []
        total_debit = total_credit = 0.0
        for line in journal_lines:
            account_id = line.get('account_id')
            debit = float(line.get('debit') or 0.0)
            credit = float(line.get('credit') or 0.0)
            if not account_id or (debit <= 0 and credit <= 0):
                continue
            if debit < 0 or credit < 0 or (debit > 0 and credit > 0):
                raise ValidationError(_('Each opening line must be either debit or credit.'))

            total_debit += debit
            total_credit += credit
            move_lines.append((0, 0, {
                'account_id': account_id,
                'debit': debit,
                'credit': credit,
                'name': line.get('name') or _('Opening Entry'),
                'partner_id': line.get('partner_id') or False,
            }))

        currency = self.env.company.currency_id
        if not currency.is_zero(total_debit - total_credit):
            raise ValidationError(_('The opening journal entry is not balanced.'))

        journal = self.env['account.journal'].search([
            ('type', '=', 'general'),
            ('company_id', '=', self.env.company.id),
        ], limit=1)
        if not journal:
            raise UserError(_('A miscellaneous journal is required for the opening entry.'))

        move = self.env['account.move'].create({
            'move_type': 'entry',
            'date': opening_date,
            'journal_id': journal.id,
            'ref': request_ref,
            'narration': _('Fiscal Year Opening Entry'),
            'line_ids': move_lines,
        })
        move.action_post()

        warehouse = self.env['stock.warehouse'].search([
            ('company_id', '=', self.env.company.id),
        ], limit=1)
        if inventory_lines and not warehouse:
            raise UserError(_('No warehouse was found for the current company.'))

        opening_context = {
            'fmcg_opening_inventory': True,
            'inventory_name': _('Opening Inventory'),
            'force_period_date': opening_date,
        }
        processed_products = self.env['product.product']
        quants_to_apply = self.env['stock.quant']

        for line in inventory_lines:
            product = self.env['product.product'].browse(line.get('product_id')).exists()
            if not product or len(product) != 1:
                raise ValidationError(_('An opening inventory product is invalid.'))
            if product in processed_products:
                raise ValidationError(_('Product %s is repeated in opening inventory.', product.display_name))
            processed_products |= product

            quantity = float(line.get('quantity') or 0.0)
            unit_cost = float(line.get('unit_cost') or 0.0)
            if quantity <= 0 or unit_cost < 0:
                raise ValidationError(_('Opening quantity and cost are invalid for %s.', product.display_name))

            if unit_cost > 0:
                product.with_company(self.env.company).standard_price = unit_cost

            quant = self.env['stock.quant'].search([
                ('product_id', '=', product.id),
                ('location_id', '=', warehouse.lot_stock_id.id),
                ('company_id', '=', self.env.company.id),
                ('lot_id', '=', False),
                ('package_id', '=', False),
                ('owner_id', '=', False),
            ], limit=1)
            if not quant:
                quant = self.env['stock.quant'].with_context(inventory_mode=True).create({
                    'product_id': product.id,
                    'location_id': warehouse.lot_stock_id.id,
                    'inventory_quantity': quantity,
                })
            else:
                quant.with_context(inventory_mode=True).inventory_quantity = quantity

            if float_compare(
                quant.inventory_diff_quantity,
                0.0,
                precision_rounding=product.uom_id.rounding,
            ):
                quants_to_apply |= quant
            else:
                quant.action_clear_inventory_quantity()

        if quants_to_apply:
            quants_to_apply.with_context(**opening_context).action_apply_inventory()

        return {'move_id': move.id, 'processed_products': len(processed_products)}
