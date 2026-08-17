import logging

from odoo import models


_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    def _create_variant_ids(self):
        """Preserve recoverable prices when Odoo replaces product variants."""
        discount_lines = self.env['fmcg.discount.line'].sudo()
        try:
            with self.env.cr.savepoint():
                snapshots = discount_lines._snapshot_template_prices(self)
        except Exception:
            snapshots = {}
            _logger.exception('Could not snapshot discount prices before variant creation')

        result = super()._create_variant_ids()

        if snapshots:
            try:
                with self.env.cr.savepoint():
                    discount_lines._fill_missing_template_prices(self, snapshots)
            except Exception:
                # Discount repair must never block Odoo's variant lifecycle.
                _logger.exception('Could not copy discount prices to new product variants')
        return result
