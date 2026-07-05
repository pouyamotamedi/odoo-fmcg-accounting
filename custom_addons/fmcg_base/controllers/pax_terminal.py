"""HTTP endpoint that bridges the web frontend to the PAX S800 terminal.

The browser cannot open raw TCP sockets, so the frontend POSTs the amount here
and Odoo (Python) forwards it to the PAX terminal using the POSLink protocol.
"""
import logging

from odoo import http
from odoo.http import request

from . import pax_poslink

_logger = logging.getLogger(__name__)


class PaxTerminalController(http.Controller):

    @http.route('/fmcg/pax/pay', type='json', auth='user', methods=['POST'])
    def pax_pay(self, amount=None, trans_type='sale', ecr_ref='1', **kwargs):
        """Send a card payment amount to the configured PAX terminal.

        Args (JSON):
            amount: transaction amount in Tomans (major units).
            trans_type: 'sale' or 'return'.
            ecr_ref: ECR reference number.

        Returns a dict describing the outcome.
        """
        company = request.env.company
        if not company.fmcg_pos_terminal_enabled:
            return {'success': False, 'error': 'اتصال دستگاه کارتخوان در تنظیمات غیرفعال است'}

        ip = company.fmcg_pax_terminal_ip
        port = company.fmcg_pax_terminal_port or 10009
        if not ip:
            return {'success': False, 'error': 'آدرس IP دستگاه کارتخوان تنظیم نشده است'}

        if amount is None:
            return {'success': False, 'error': 'مبلغ ارسال نشده است'}

        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            return {'success': False, 'error': 'مبلغ نامعتبر است'}

        if amount_value <= 0:
            return {'success': False, 'error': 'مبلغ باید بزرگتر از صفر باشد'}

        # PAX expects the amount in minor units (e.g. cents). Iranian Toman has
        # no minor unit in practice, so we pass the integer amount directly.
        amount_minor = int(round(amount_value))
        pax_type = (
            pax_poslink.TRANS_TYPE_RETURN
            if trans_type == 'return'
            else pax_poslink.TRANS_TYPE_SALE
        )

        try:
            result = pax_poslink.do_credit_sale(
                ip=ip,
                port=port,
                amount_cents=amount_minor,
                trans_type=pax_type,
                ecr_ref=str(ecr_ref),
            )
        except OSError as exc:
            _logger.warning('PAX terminal connection failed: %s', exc)
            return {'success': False, 'error': 'اتصال به دستگاه کارتخوان برقرار نشد: %s' % exc}
        except Exception as exc:  # noqa: BLE001 - report any protocol error
            _logger.exception('PAX terminal error')
            return {'success': False, 'error': 'خطای دستگاه کارتخوان: %s' % exc}

        if result.get('success'):
            return {
                'success': True,
                'result_code': result.get('result_code'),
                'message': result.get('message') or 'پرداخت با موفقیت انجام شد',
            }
        return {
            'success': False,
            'result_code': result.get('result_code'),
            'error': result.get('message') or 'تراکنش ناموفق بود',
        }
