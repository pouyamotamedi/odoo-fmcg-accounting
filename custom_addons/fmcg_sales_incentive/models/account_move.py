from zoneinfo import ZoneInfo

from odoo import api, fields, models

TEHRAN = ZoneInfo('Asia/Tehran')


class AccountMove(models.Model):
    _inherit = 'account.move'

    fmcg_seller_id = fields.Many2one('res.users', string='FMCG Seller', readonly=True, copy=False, index=True)
    fmcg_sale_datetime = fields.Datetime(string='Sale Date/Time', readonly=True, copy=False, index=True)
    fmcg_sale_tehran_date = fields.Date(string='Tehran Sale Date', readonly=True, copy=False, index=True)
    fmcg_sale_shift_type = fields.Selection([('morning', 'صبح'), ('evening', 'عصر')], readonly=True, copy=False, index=True)
    fmcg_shift_id = fields.Many2one('fmcg.incentive.shift', readonly=True, copy=False, index=True)

    @api.model_create_multi
    def create(self, vals_list):
        now = fields.Datetime.now()
        local_now = now.replace(tzinfo=ZoneInfo('UTC')).astimezone(TEHRAN)
        policy = self.env['fmcg.incentive.policy'].search([
            ('company_id', '=', self.env.company.id), ('active', '=', True)
        ], limit=1)
        for vals in vals_list:
            if vals.get('move_type') != 'out_invoice':
                continue
            vals.setdefault('fmcg_seller_id', self.env.user.id)
            vals.setdefault('fmcg_sale_datetime', now)
            vals.setdefault('fmcg_sale_tehran_date', local_now.date())
            if policy:
                hour = local_now.hour + local_now.minute / 60
                shift_type = 'morning' if policy.morning_start <= hour < policy.morning_end else 'evening'
                vals.setdefault('fmcg_sale_shift_type', shift_type)
                shift = self.env['fmcg.incentive.shift'].search([
                    ('company_id', '=', self.env.company.id), ('shift_date', '=', local_now.date()),
                    ('shift_type', '=', shift_type),
                ], limit=1)
                if shift:
                    vals.setdefault('fmcg_shift_id', shift.id)
        return super().create(vals_list)

    def action_post(self):
        result = super().action_post()
        periods = self.env['fmcg.incentive.period']
        for move in self.filtered(lambda item: item.move_type == 'out_invoice' and item.fmcg_sale_tehran_date):
            periods |= periods.get_or_create_for_date(move.fmcg_sale_tehran_date)
        periods.recompute()
        return result

    def button_draft(self):
        dates = self.filtered(lambda item: item.move_type == 'out_invoice').mapped('fmcg_sale_tehran_date')
        result = super().button_draft()
        periods = self.env['fmcg.incentive.period']
        for date in dates:
            periods |= periods.get_or_create_for_date(date)
        periods.recompute()
        return result


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    fmcg_cost_snapshot = fields.Monetary(currency_field='currency_id', readonly=True, copy=False)
    fmcg_gross_profit = fields.Monetary(currency_field='currency_id', readonly=True, copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        product_ids = [vals.get('product_id') for vals in vals_list if vals.get('product_id')]
        products = {product.id: product for product in self.env['product.product'].browse(product_ids)}
        for vals in vals_list:
            product = products.get(vals.get('product_id'))
            if not product:
                continue
            quantity = float(vals.get('quantity', 0))
            price_unit = float(vals.get('price_unit', 0))
            discount = float(vals.get('discount', 0))
            cost = product.standard_price * quantity
            revenue = price_unit * quantity * (1 - discount / 100)
            vals.setdefault('fmcg_cost_snapshot', cost)
            vals.setdefault('fmcg_gross_profit', revenue - cost)
        return super().create(vals_list)
