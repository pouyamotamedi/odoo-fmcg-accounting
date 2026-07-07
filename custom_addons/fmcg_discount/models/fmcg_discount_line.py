from odoo import models, fields, api


class FmcgDiscountLine(models.Model):
    _name = 'fmcg.discount.line'
    _description = 'Discount Price Line'
    _order = 'product_id'

    category_id = fields.Many2one(
        'fmcg.discount.category', string='دسته تخفیف',
        required=True, ondelete='cascade'
    )
    product_id = fields.Many2one(
        'product.product', string='محصول',
        required=True, ondelete='cascade'
    )
    product_list_price = fields.Float(
        related='product_id.list_price',
        string='قیمت فروش عادی', readonly=True
    )
    discount_price = fields.Float(
        string='قیمت تخفیفی',
        help='قیمت فروش برای این دسته تخفیف'
    )

    _sql_constraints = [
        ('unique_product_category', 'UNIQUE(category_id, product_id)',
         'هر محصول فقط یک قیمت در هر دسته تخفیف می‌تواند داشته باشد.')
    ]
