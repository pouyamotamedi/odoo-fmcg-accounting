from odoo import api, fields, models
from odoo.exceptions import UserError
from datetime import date, timedelta


class FmcgDailySalesReport(models.TransientModel):
    _name = 'fmcg.report.daily.sales'
    _description = 'Daily Sales Summary Report Wizard'

    date_from = fields.Date(string='From Date', required=True, default=fields.Date.today)
    date_to = fields.Date(string='To Date', required=True, default=fields.Date.today)

    def action_generate_report(self):
        """Generate daily sales summary."""
        self.ensure_one()
        data = self._get_report_data()
        return self.env.ref('fmcg_reports.action_report_daily_sales').report_action(self, data=data)

    def _get_report_data(self):
        """Collect data for the daily sales report."""
        domain = [
            ('date_order', '>=', self.date_from),
            ('date_order', '<=', self.date_to),
            ('state', 'in', ['paid', 'done', 'invoiced']),
        ]
        pos_orders = self.env['pos.order'].search(domain)

        total_revenue = sum(pos_orders.mapped('amount_total'))
        transaction_count = len(pos_orders)

        # Payment method breakdown
        payment_methods = {}
        for order in pos_orders:
            for payment in order.payment_ids:
                method_name = payment.payment_method_id.name or 'Other'
                payment_methods.setdefault(method_name, 0.0)
                payment_methods[method_name] += payment.amount

        return {
            'date_from': str(self.date_from),
            'date_to': str(self.date_to),
            'total_revenue': total_revenue,
            'transaction_count': transaction_count,
            'payment_methods': payment_methods,
        }


class FmcgInventoryStatusReport(models.TransientModel):
    _name = 'fmcg.report.inventory.status'
    _description = 'Inventory Status Report Wizard'

    def action_generate_report(self):
        """Generate inventory status report."""
        self.ensure_one()
        products = self.env['product.product'].search([
            ('type', '=', 'product'),
            ('active', '=', True),
        ])

        lines = []
        total_value = 0.0
        for product in products:
            value = product.qty_available * product.standard_price
            total_value += value
            lines.append({
                'name': product.name,
                'qty': product.qty_available,
                'price': product.standard_price,
                'value': value,
                'low_stock': product.qty_available <= product.product_tmpl_id.fmcg_reorder_threshold,
            })

        data = {
            'lines': lines,
            'total_value': total_value,
            'product_count': len(lines),
        }
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Inventory Status',
                'message': f'{len(lines)} products, Total value: {total_value:,.0f}',
                'type': 'info',
                'sticky': True,
            },
        }


class FmcgCustomerCreditReport(models.TransientModel):
    _name = 'fmcg.report.customer.credit'
    _description = 'Customer Credit Aging Report Wizard'

    def action_generate_report(self):
        """Generate customer credit aging report."""
        self.ensure_one()
        credits = self.env['fmcg.customer.credit'].search([
            ('state', 'in', ['open', 'partial']),
        ])

        today = date.today()
        buckets = {
            '0_30': {'label': '0-30 days', 'amount': 0.0, 'count': 0},
            '31_60': {'label': '31-60 days', 'amount': 0.0, 'count': 0},
            '61_90': {'label': '61-90 days', 'amount': 0.0, 'count': 0},
            '90_plus': {'label': '90+ days', 'amount': 0.0, 'count': 0},
        }
        total_outstanding = 0.0

        for credit in credits:
            days = (today - credit.date).days
            remaining = credit.remaining
            total_outstanding += remaining

            if days <= 30:
                buckets['0_30']['amount'] += remaining
                buckets['0_30']['count'] += 1
            elif days <= 60:
                buckets['31_60']['amount'] += remaining
                buckets['31_60']['count'] += 1
            elif days <= 90:
                buckets['61_90']['amount'] += remaining
                buckets['61_90']['count'] += 1
            else:
                buckets['90_plus']['amount'] += remaining
                buckets['90_plus']['count'] += 1

        message = f"Total outstanding: {total_outstanding:,.0f}\n"
        for key, bucket in buckets.items():
            if bucket['count'] > 0:
                message += f"{bucket['label']}: {bucket['amount']:,.0f} ({bucket['count']} entries)\n"

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Customer Credit Aging',
                'message': message,
                'type': 'warning' if total_outstanding > 0 else 'info',
                'sticky': True,
            },
        }


class FmcgCashFlowReport(models.TransientModel):
    _name = 'fmcg.report.cash.flow'
    _description = 'Cash Flow Report Wizard'

    date_from = fields.Date(string='From Date', required=True, default=lambda self: date.today().replace(day=1))
    date_to = fields.Date(string='To Date', required=True, default=fields.Date.today)

    def action_generate_report(self):
        """Generate cash flow summary."""
        self.ensure_one()
        domain = [
            ('date', '>=', self.date_from),
            ('date', '<=', self.date_to),
            ('parent_state', '=', 'posted'),
        ]
        move_lines = self.env['account.move.line'].search(domain)

        inflows = sum(move_lines.filtered(lambda l: l.debit > 0 and l.journal_id.type in ('bank', 'cash')).mapped('debit'))
        outflows = sum(move_lines.filtered(lambda l: l.credit > 0 and l.journal_id.type in ('bank', 'cash')).mapped('credit'))

        message = (
            f"Period: {self.date_from} to {self.date_to}\n"
            f"Inflows: {inflows:,.0f}\n"
            f"Outflows: {outflows:,.0f}\n"
            f"Net: {inflows - outflows:,.0f}"
        )
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Cash Flow Summary',
                'message': message,
                'type': 'info',
                'sticky': True,
            },
        }
