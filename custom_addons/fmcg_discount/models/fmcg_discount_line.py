from odoo import api, fields, models


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

    @api.model
    def _snapshot_template_prices(self, templates, category_ids=None):
        """Return one recoverable price per template/category without writes.

        Existing active-variant values are preferred. If every old variant is
        inactive, the newest inactive line is used as the recovery source.
        """
        templates = templates.exists()
        snapshots = {template.id: {} for template in templates}
        if not templates:
            return snapshots

        variants = self.env['product.product'].with_context(active_test=False).search([
            ('product_tmpl_id', 'in', templates.ids),
        ])
        if not variants:
            return snapshots

        domain = [('product_id', 'in', variants.ids)]
        if category_ids:
            domain.append(('category_id', 'in', category_ids))
        lines = self.search(domain, order='id asc')

        selected = {}
        for line in lines:
            template_id = line.product_id.product_tmpl_id.id
            key = (template_id, line.category_id.id)
            score = (1 if line.product_id.active else 0, line.id)
            if key not in selected or score > selected[key][0]:
                selected[key] = (score, line.discount_price)

        for (template_id, category_id), (_, price) in selected.items():
            snapshots.setdefault(template_id, {})[category_id] = price
        return snapshots

    @api.model
    def _fill_missing_template_prices(self, templates, snapshots):
        """Copy snapshot values only to active variants that have no line.

        Existing per-variant values are deliberately preserved; this helper
        never updates or deletes a configured discount line.
        """
        templates = templates.exists()
        if not templates or not snapshots:
            return 0

        variants = self.env['product.product'].search([
            ('product_tmpl_id', 'in', templates.ids),
            ('active', '=', True),
        ])
        if not variants:
            return 0

        variants_by_template = {}
        for variant in variants:
            variants_by_template.setdefault(variant.product_tmpl_id.id, []).append(variant)

        existing_lines = self.search([('product_id', 'in', variants.ids)])
        existing_keys = {
            (line.category_id.id, line.product_id.id)
            for line in existing_lines
        }

        values_list = []
        for template_id, category_prices in snapshots.items():
            for variant in variants_by_template.get(template_id, []):
                for category_id, price in category_prices.items():
                    if (category_id, variant.id) not in existing_keys:
                        values_list.append({
                            'category_id': category_id,
                            'product_id': variant.id,
                            'discount_price': price,
                        })
                        existing_keys.add((category_id, variant.id))

        if values_list:
            self.create(values_list)
        return len(values_list)

    @api.model
    def load_template_discount_prices(self, template_id, category_ids=None):
        """Load legacy/current prices and repair only missing active variants."""
        template = self.env['product.template'].browse(template_id).exists()
        if not template:
            return []

        snapshots = self._snapshot_template_prices(template, category_ids or [])
        self._fill_missing_template_prices(template, snapshots)
        return [
            {'category_id': category_id, 'discount_price': price}
            for category_id, price in snapshots.get(template.id, {}).items()
        ]
