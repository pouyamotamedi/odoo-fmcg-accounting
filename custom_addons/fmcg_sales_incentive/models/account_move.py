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
        """Create sales with snapshots while keeping invoice creation as the real user."""
        now = fields.Datetime.now()
        local_now = now.replace(tzinfo=ZoneInfo('UTC')).astimezone(TEHRAN)
        sudo_policy_model = self.env['fmcg.incentive.policy'].sudo()
        sudo_shift_model = self.env['fmcg.incentive.shift'].sudo()
        company_snapshots = {}
        for vals in vals_list:
            if vals.get('move_type') != 'out_invoice':
                continue
            company_id = vals.get('company_id') or self.env.company.id
            if company_id not in company_snapshots:
                policy = sudo_policy_model.with_company(company_id).with_context(
                    allowed_company_ids=[company_id]
                ).search([
                    ('company_id', '=', company_id), ('active', '=', True)
                ], limit=1)
                shift = sudo_shift_model.browse()
                shift_type = False
                if policy:
                    hour = local_now.hour + local_now.minute / 60
                    shift_type = 'morning' if policy.morning_start <= hour < policy.morning_end else 'evening'
                    shift = sudo_shift_model.with_company(company_id).with_context(
                        allowed_company_ids=[company_id]
                    ).search([
                        ('company_id', '=', company_id), ('shift_date', '=', local_now.date()),
                        ('shift_type', '=', shift_type),
                    ], limit=1)
                company_snapshots[company_id] = (shift_type, shift)
            shift_type, shift = company_snapshots[company_id]
            vals.setdefault('fmcg_seller_id', self.env.user.id)
            vals.setdefault('fmcg_sale_datetime', now)
            vals.setdefault('fmcg_sale_tehran_date', local_now.date())
            if shift_type:
                vals.setdefault('fmcg_sale_shift_type', shift_type)
            if shift:
                vals.setdefault('fmcg_shift_id', shift.id)
        return super().create(vals_list)

    def _sudo_recompute_incentive_periods(self, move_dates):
        """Recompute only periods belonging to each move's company."""
        periods = self.env['fmcg.incentive.period'].sudo().browse()
        for company_id, date in set(move_dates):
            policy_model = self.env['fmcg.incentive.policy'].sudo().with_company(company_id).with_context(
                allowed_company_ids=[company_id]
            )
            policy = policy_model.search([
                ('company_id', '=', company_id), ('active', '=', True)
            ], limit=1)
            period_model = self.env['fmcg.incentive.period'].sudo().with_company(company_id).with_context(
                allowed_company_ids=[company_id]
            )
            period = period_model.get_or_create_for_date(date, policy)
            periods |= period
        periods.recompute()

    def action_post(self):
        result = super().action_post()
        move_dates = [
            (move.company_id.id, move.fmcg_sale_tehran_date)
            for move in self
            if move.move_type == 'out_invoice' and move.fmcg_sale_tehran_date
        ]
        self._sudo_recompute_incentive_periods(move_dates)
        return result

    def button_draft(self):
        move_dates = [
            (move.company_id.id, move.fmcg_sale_tehran_date)
            for move in self
            if move.move_type == 'out_invoice' and move.fmcg_sale_tehran_date
        ]
        result = super().button_draft()
        self._sudo_recompute_incentive_periods(move_dates)
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
