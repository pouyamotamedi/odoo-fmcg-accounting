from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    fmcg_reorder_threshold = fields.Integer(
        string='Reorder Threshold',
        default=10,
        help='Low-stock warning appears when quantity is at or below this value (0-99999)',
    )
    fmcg_is_low_stock = fields.Boolean(
        string='Low Stock',
        compute='_compute_fmcg_is_low_stock',
        store=True,
        help='Indicates stock is at or below the reorder threshold',
    )

    @api.depends('qty_available', 'fmcg_reorder_threshold')
    def _compute_fmcg_is_low_stock(self):
        for product in self:
            product.fmcg_is_low_stock = (
                product.qty_available <= product.fmcg_reorder_threshold
            )

    @api.constrains('fmcg_reorder_threshold')
    def _check_reorder_threshold(self):
        for product in self:
            if product.fmcg_reorder_threshold < 0:
                raise models.ValidationError(
                    "Reorder threshold must be 0 or greater."
                )
            if product.fmcg_reorder_threshold > 99999:
                raise models.ValidationError(
                    "Reorder threshold cannot exceed 99,999."
                )
