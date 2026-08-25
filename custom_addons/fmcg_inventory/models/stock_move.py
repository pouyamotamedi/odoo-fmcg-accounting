from odoo import _, models
from odoo.exceptions import UserError


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _get_opening_inventory_account(self, accounts_data):
        account = accounts_data.get('stock_input')
        if not account:
            raise UserError(_(
                'The stock input/interim account is not configured for product %s.',
                self.product_id.display_name,
            ))
        return account.id

    def _get_src_account(self, accounts_data):
        if self.env.context.get('fmcg_opening_inventory'):
            return self._get_opening_inventory_account(accounts_data)
        return super()._get_src_account(accounts_data)

    def _get_dest_account(self, accounts_data):
        if self.env.context.get('fmcg_opening_inventory'):
            return self._get_opening_inventory_account(accounts_data)
        return super()._get_dest_account(accounts_data)
