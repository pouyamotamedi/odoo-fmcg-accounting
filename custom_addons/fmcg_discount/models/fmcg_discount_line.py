import logging

from odoo import api, fields, models


_logger = logging.getLogger(__name__)


class FmcgDiscountLine(models.Model):
    _name = 'fmcg.discount.line'
    _description = 'Discount Price Line'
    _order = 'product_tmpl_id'

    category_id = fields.Many2one(
        'fmcg.discount.category', string='دسته تخفیف',
        required=True, ondelete='cascade', index=True,
    )
    product_tmpl_id = fields.Many2one(
        'product.template', string='محصول',
        required=True, ondelete='cascade', index=True,
    )
    # Kept only to migrate databases created before template-level pricing.
    # New records are independent of product.product so variant recreation
    # cannot detach or delete a product's discount price.
    product_id = fields.Many2one(
        'product.product', string='واریانت قدیمی',
        required=False, ondelete='set null', index=True,
    )
    product_list_price = fields.Float(
        related='product_tmpl_id.list_price',
        string='قیمت فروش عادی', readonly=True,
    )
    discount_price = fields.Float(
        string='قیمت تخفیفی',
        help='قیمت فروش برای این دسته تخفیف',
    )

    _sql_constraints = [
        (
            'unique_template_category',
            'UNIQUE(category_id, product_tmpl_id)',
            'هر محصول فقط یک قیمت در هر دسته تخفیف می‌تواند داشته باشد.',
        ),
    ]

    def _auto_init(self):
        """Migrate variant-level prices before Odoo enforces the new constraint."""
        self.env.cr.execute("SELECT to_regclass('public.fmcg_discount_line')")
        if self.env.cr.fetchone()[0]:
            self.env.cr.execute(
                "ALTER TABLE fmcg_discount_line "
                "ADD COLUMN IF NOT EXISTS product_tmpl_id INTEGER"
            )
            self.env.cr.execute(
                """
                UPDATE fmcg_discount_line AS line
                   SET product_tmpl_id = product.product_tmpl_id
                  FROM product_product AS product
                 WHERE line.product_tmpl_id IS NULL
                   AND line.product_id = product.id
                """
            )
            # Preserve every legacy row that cannot map cleanly one-to-one.
            # This audit table is intentionally outside the ORM so a database
            # administrator can recover any prior per-variant value if needed.
            self.env.cr.execute(
                """
                CREATE TABLE IF NOT EXISTS fmcg_discount_line_migration_backup (
                    id BIGSERIAL PRIMARY KEY,
                    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    line_id INTEGER NOT NULL UNIQUE,
                    category_id INTEGER,
                    product_tmpl_id INTEGER,
                    product_id INTEGER,
                    discount_price DOUBLE PRECISION,
                    product_active BOOLEAN,
                    reason VARCHAR NOT NULL
                )
                """
            )
            self.env.cr.execute(
                """
                WITH legacy_lines AS (
                    SELECT line.id, line.category_id, line.product_tmpl_id,
                           line.product_id, line.discount_price, product.active,
                           COUNT(*) OVER (
                               PARTITION BY line.category_id, line.product_tmpl_id
                           ) AS group_count
                      FROM fmcg_discount_line AS line
                 LEFT JOIN product_product AS product ON product.id = line.product_id
                )
                INSERT INTO fmcg_discount_line_migration_backup (
                    line_id, category_id, product_tmpl_id, product_id,
                    discount_price, product_active, reason
                )
                SELECT id, category_id, product_tmpl_id, product_id,
                       discount_price, active,
                       CASE
                           WHEN product_tmpl_id IS NULL THEN 'orphan'
                           ELSE 'duplicate_or_conflict'
                       END
                  FROM legacy_lines
                 WHERE product_tmpl_id IS NULL OR group_count > 1
                ON CONFLICT (line_id) DO NOTHING
                """
            )
            self.env.cr.execute(
                """
                SELECT category_id, product_tmpl_id,
                       ARRAY_AGG(DISTINCT discount_price ORDER BY discount_price)
                  FROM fmcg_discount_line
                 WHERE product_tmpl_id IS NOT NULL
              GROUP BY category_id, product_tmpl_id
                HAVING COUNT(DISTINCT discount_price) > 1
                """
            )
            for category_id, template_id, prices in self.env.cr.fetchall():
                _logger.warning(
                    'Conflicting legacy discount prices for category %s and '
                    'template %s: %s. Preserving the newest active-variant '
                    'value; all originals are in '
                    'fmcg_discount_line_migration_backup.',
                    category_id, template_id, prices,
                )

            # An orphaned line can no longer affect a sellable product; its
            # original value has been retained in the audit table above.
            self.env.cr.execute(
                "DELETE FROM fmcg_discount_line WHERE product_tmpl_id IS NULL"
            )
            # The product-level UI has always intended one value for all
            # variants. Prefer the newest active-variant value and retain every
            # discarded source row in the audit table above.
            self.env.cr.execute(
                """
                WITH ranked AS (
                    SELECT line.id,
                           ROW_NUMBER() OVER (
                               PARTITION BY line.category_id, line.product_tmpl_id
                               ORDER BY COALESCE(product.active, FALSE) DESC,
                                        line.id DESC
                           ) AS row_number
                      FROM fmcg_discount_line AS line
                 LEFT JOIN product_product AS product
                        ON product.id = line.product_id
                )
                DELETE FROM fmcg_discount_line AS line
                 USING ranked
                 WHERE line.id = ranked.id
                   AND ranked.row_number > 1
                """
            )
            self.env.cr.execute(
                "ALTER TABLE fmcg_discount_line "
                "DROP CONSTRAINT IF EXISTS "
                "fmcg_discount_line_unique_product_category"
            )
            # Recreate the legacy product foreign key with ON DELETE SET NULL
            # in super()._auto_init(); otherwise an old CASCADE constraint could
            # still delete the new template-level line with an archived variant.
            self.env.cr.execute(
                "ALTER TABLE fmcg_discount_line "
                "DROP CONSTRAINT IF EXISTS fmcg_discount_line_product_id_fkey"
            )

        return super()._auto_init()

    @api.model_create_multi
    def create(self, values_list):
        records = self.browse()
        values_to_create = []
        for values in values_list:
            if not values.get('product_tmpl_id') and values.get('product_id'):
                product = self.env['product.product'].browse(values['product_id'])
                values['product_tmpl_id'] = product.product_tmpl_id.id

            existing = self.search([
                ('category_id', '=', values.get('category_id')),
                ('product_tmpl_id', '=', values.get('product_tmpl_id')),
            ], limit=1)
            if existing:
                updates = {}
                if 'discount_price' in values:
                    updates['discount_price'] = values['discount_price']
                # Keep old browser tabs compatible during rollout: their
                # variant-level search can find the line they just updated.
                if values.get('product_id'):
                    updates['product_id'] = values['product_id']
                if updates:
                    existing.write(updates)
                records |= existing
            else:
                values_to_create.append(values)

        if values_to_create:
            records |= super().create(values_to_create)
        return records
