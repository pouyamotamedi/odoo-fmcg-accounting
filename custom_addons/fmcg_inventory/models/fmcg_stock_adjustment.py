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

            # Create a stock move to reduce inventory
            stock_location = self.env.ref('stock.stock_location_stock')
            inventory_loss_location = self.env.ref('stock.stock_location_inventory')

            move_vals = {
                'name': f'FMCG Adjustment: {record.reason} - {product.name}',
                'product_id': product.id,
                'product_uom_qty': record.quantity,
                'product_uom': product.uom_id.id,
                'location_id': stock_location.id,
                'location_dest_id': inventory_loss_location.id,
                'origin': f'FMCG-ADJ/{record.id}',
                'move_line_ids': [(0, 0, {
                    'product_id': product.id,
                    'location_id': stock_location.id,
                    'location_dest_id': inventory_loss_location.id,
                    'quantity': record.quantity,
                })],
            }
            move = self.env['stock.move'].create(move_vals)
            move._action_confirm()
            move._action_done()

            record.product_qty_after = product.qty_available
            record.state = 'confirmed'

    def action_reset_to_draft(self):
        """Reset to draft (only if not confirmed)."""
        for record in self:
            if record.state == 'draft':
                continue
            raise ValidationError("Cannot reset a confirmed adjustment.")
