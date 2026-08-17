from odoo import models, fields, api


class FmcgDiscountCategory(models.Model):
    _name = 'fmcg.discount.category'
    _description = 'Discount Category'
    _order = 'sequence, name'

    name = fields.Char(string='نام دسته تخفیف', required=True)
    code = fields.Char(string='کد')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    is_fixed_percent = fields.Boolean(
        string='تخفیف درصدی ثابت',
        help='اگر فعال باشد، یک درصد ثابت روی همه محصولات اعمال می‌شود. '
             'در غیر این صورت قیمت هر محصول جداگانه تعریف می‌شود.'
    )
    fixed_percent = fields.Float(
        string='درصد تخفیف',
        help='درصد تخفیف ثابت (مثلاً 5 یعنی 5 درصد تخفیف)'
    )
    line_ids = fields.One2many(
        'fmcg.discount.line', 'category_id',
        string='قیمت‌های اختصاصی'
    )
    note = fields.Text(string='توضیحات')

    def get_product_price(self, product_id):
        """Get the discounted price for a product in this category."""
        self.ensure_one()
        if self.is_fixed_percent:
            # Fixed percentage discount on list_price
            product = self.env['product.product'].browse(product_id)
            return product.list_price * (1 - self.fixed_percent / 100)
        else:
            # Look for a specific price line
            line = self.line_ids.filtered(lambda l: l.product_id.id == product_id)
            if line:
                return line[0].discount_price
            # No specific price = no discount (return list_price)
            product = self.env['product.product'].browse(product_id)
            return product.list_price
