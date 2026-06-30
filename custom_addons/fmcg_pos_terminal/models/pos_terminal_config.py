from odoo import api, fields, models
from odoo.exceptions import ValidationError


class FmcgPosTerminalConfig(models.Model):
    _name = 'fmcg.pos.terminal.config'
    _description = 'POS Terminal Device Configuration'

    name = fields.Char(
        string='Terminal Name',
        required=True,
        help='A friendly name for this terminal device',
    )
    port = fields.Char(
        string='Port / Address',
        required=True,
        help='COM port (e.g., COM3) for serial or IP:port (e.g., 192.168.1.100:9100) for TCP',
    )
    protocol = fields.Selection(
        selection=[
            ('serial', 'Serial (RS232)'),
            ('tcp', 'TCP/IP'),
        ],
        string='Protocol',
        required=True,
        default='serial',
    )
    device_model = fields.Char(
        string='Device Model',
        help='Model name/number of the POS terminal device',
    )
    baud_rate = fields.Integer(
        string='Baud Rate',
        default=9600,
        help='Serial communication baud rate (only for serial protocol)',
    )
    connection_timeout = fields.Integer(
        string='Connection Timeout (seconds)',
        default=10,
        help='Maximum time to wait for device connection',
    )
    transaction_timeout = fields.Integer(
        string='Transaction Timeout (seconds)',
        default=120,
        help='Maximum time to wait for transaction result from terminal',
    )
    pos_config_id = fields.Many2one(
        'pos.config',
        string='POS Configuration',
        help='Link this terminal to a specific POS session',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )
    state = fields.Selection(
        selection=[
            ('disconnected', 'Disconnected'),
            ('connected', 'Connected'),
            ('error', 'Error'),
        ],
        string='Status',
        default='disconnected',
        readonly=True,
    )
    last_error = fields.Text(
        string='Last Error',
        readonly=True,
    )

    @api.constrains('connection_timeout')
    def _check_connection_timeout(self):
        for record in self:
            if record.connection_timeout < 1 or record.connection_timeout > 60:
                raise ValidationError("Connection timeout must be between 1 and 60 seconds.")

    @api.constrains('transaction_timeout')
    def _check_transaction_timeout(self):
        for record in self:
            if record.transaction_timeout < 10 or record.transaction_timeout > 300:
                raise ValidationError("Transaction timeout must be between 10 and 300 seconds.")

    def action_test_connection(self):
        """Test connection to the terminal device."""
        self.ensure_one()
        driver = self.env['fmcg.pos.terminal.driver']
        result = driver.test_connection(self)
        if result.get('success'):
            self.write({'state': 'connected', 'last_error': False})
        else:
            self.write({'state': 'error', 'last_error': result.get('error', 'Unknown error')})
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Connection Test',
                'message': result.get('message', 'Test completed'),
                'type': 'success' if result.get('success') else 'danger',
                'sticky': False,
            },
        }

    def action_send_payment(self, amount):
        """Send payment amount to the terminal device."""
        self.ensure_one()
        driver = self.env['fmcg.pos.terminal.driver']
        return driver.send_payment(self, amount)
