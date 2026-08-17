from odoo import SUPERUSER_ID, api


def migrate(cr, version):
    """Repair only missing active-variant lines from recoverable legacy data."""
    env = api.Environment(cr, SUPERUSER_ID, {})
    discount_lines = env['fmcg.discount.line']
    templates = discount_lines.search([]).mapped('product_id.product_tmpl_id')
    if not templates:
        return

    snapshots = discount_lines._snapshot_template_prices(templates)
    discount_lines._fill_missing_template_prices(templates, snapshots)
