from odoo import api, fields, models
from odoo.exceptions import ValidationError


class FmcgStockAdjustment(models.Model):
    _name = 'fmcg.stock.adjustment'
    _description = 'Stock Adjustment for Damaged/Expired/Lost Goods'
    _order = 'date desc, id desc'

    product_id = fields.Many2one(
        'product.product',
        string='Product',
        required=True,
        domain="[('type', '=', 'product')]",
    )
    quantity = fields.Float(
        string='Quantity to Reduce',
        required=True,
        help='Number of units to remove from stock',
    )
    reason = fields.Selection(
        selection=[
            ('damaged', 'Damaged'),
            ('expired', 'Expired'),
            ('lost', 'Lost'),
            ('other', 'Other'),
        ],
        string='Reason',
        required=True,
    )
    note = fields.Text(
        string='Note',
        required=True,
        help='Mandatory description of why stock is being adjusted (max 500 characters)',
    )
    date = fields.Date(
        string='Date',
        default=fields.Date.today,
        required=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string='Adjusted By',
        default=lambda self: self.env.user,
        readonly=True,
    )
    state = fields.Selection(
        selection=[
            ('draft', 'Draft'),
            ('confirmed', 'Confirmed'),
        ],
        string='Status',
        default='draft',
    )
    product_qty_before = fields.Float(
        string='Stock Before',
        readonly=True,
    )
    product_qty_after = fields.Float(
        string='Stock After',
        readonly=True,
    )

    @api.constrains('quantity')
    def _check_quantity(self):
        for record in self:
            if record.quantity <= 0:
                raise ValidationError("Quantity to reduce must be greater than zero.")

    @api.constrains('note')
    def _check_note_length(self):
        for record in self:
            if record.note and len(record.note) > 500:
                raise ValidationError("Note cannot exceed 500 characters.")

    def action_confirm(self):
        """Confirm the adjustment and reduce stock via inventory move."""
        for record in self:
            if record.state == 'confirmed':
                continue

            product = record.product_id
            record.product_qty_before = product.qty_available

            # Use stock quant to adjust inventory (Odoo 18 recommended approach)
            stock_location = self.env['stock.warehouse'].search(
                [('company_id', '=', self.env.company.id)], limit=1
            ).lot_stock_id

            if not stock_location:
                raise UserError("No stock location found. Please configure a warehouse first.")

            # Use Odoo's built-in inventory adjustment via stock.quant
            quant = self.env['stock.quant'].search([
                ('product_id', '=', product.id),
                ('location_id', '=', stock_location.id),
            ], limit=1)

            current_qty = quant.quantity if quant else 0.0
            new_qty = current_qty - record.quantity

            # Apply inventory adjustment using Odoo's standard method
            self.env['stock.quant'].with_context(
                inventory_mode=True
            )._update_available_quantity(
                product, stock_location, -record.quantity
            )

            record.product_qty_after = product.with_context(force_company=self.env.company.id).qty_available
            record.state = 'confirmed'

    def action_reset_to_draft(self):
        """Reset to draft (only if not confirmed)."""
        for record in self:
            if record.state == 'draft':
                continue
            raise ValidationError("Cannot reset a confirmed adjustment.")
