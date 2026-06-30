import logging
import socket
import time

from odoo import api, models

_logger = logging.getLogger(__name__)

try:
    import serial
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    _logger.warning("pyserial not installed. Serial POS terminal communication unavailable.")


class FmcgPosTerminalDriver(models.AbstractModel):
    _name = 'fmcg.pos.terminal.driver'
    _description = 'POS Terminal Communication Driver'

    @api.model
    def test_connection(self, config):
        """Test if the terminal device is reachable."""
        try:
            if config.protocol == 'serial':
                return self._test_serial(config)
            elif config.protocol == 'tcp':
                return self._test_tcp(config)
            else:
                return {'success': False, 'error': f'Unknown protocol: {config.protocol}'}
        except Exception as e:
            _logger.error(f"Terminal connection test failed: {e}")
            return {'success': False, 'error': str(e), 'message': f'Connection failed: {e}'}

    @api.model
    def send_payment(self, config, amount):
        """
        Send payment amount to the terminal device.
        Returns dict with:
            - success: bool
            - reference: str (transaction reference number if successful)
            - error: str (error message if failed)
        """
        try:
            if config.protocol == 'serial':
                return self._send_serial_payment(config, amount)
            elif config.protocol == 'tcp':
                return self._send_tcp_payment(config, amount)
            else:
                return {'success': False, 'error': f'Unknown protocol: {config.protocol}'}
        except socket.timeout:
            msg = f"Transaction timed out after {config.transaction_timeout} seconds"
            _logger.warning(msg)
            config.write({'state': 'error', 'last_error': msg})
            return {'success': False, 'error': msg}
        except Exception as e:
            _logger.error(f"Payment transmission failed: {e}")
            config.write({'state': 'error', 'last_error': str(e)})
            return {'success': False, 'error': str(e)}

    def _test_serial(self, config):
        """Test serial port connection."""
        if not HAS_SERIAL:
            return {'success': False, 'error': 'pyserial library not installed', 'message': 'Install pyserial: pip install pyserial'}
        try:
            ser = serial.Serial(
                port=config.port,
                baudrate=config.baud_rate,
                timeout=config.connection_timeout,
            )
            ser.close()
            return {'success': True, 'message': f'Successfully connected to {config.port}'}
        except serial.SerialException as e:
            return {'success': False, 'error': str(e), 'message': f'Cannot connect to {config.port}: {e}'}

    def _test_tcp(self, config):
        """Test TCP connection."""
        try:
            host, port_str = config.port.split(':')
            port = int(port_str)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(config.connection_timeout)
            sock.connect((host, port))
            sock.close()
            return {'success': True, 'message': f'Successfully connected to {config.port}'}
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            return {'success': False, 'error': str(e), 'message': f'Cannot connect to {config.port}: {e}'}

    def _send_serial_payment(self, config, amount):
        """Send payment amount via serial port."""
        if not HAS_SERIAL:
            return {'success': False, 'error': 'pyserial not installed'}

        # Format amount as integer (cents/rials)
        amount_int = int(amount)
        command = f"PAY:{amount_int}\r\n"

        ser = serial.Serial(
            port=config.port,
            baudrate=config.baud_rate,
            timeout=config.transaction_timeout,
        )
        try:
            ser.write(command.encode('ascii'))
            _logger.info(f"Sent payment command: {command.strip()} to {config.port}")

            # Wait for response
            response = ser.readline().decode('ascii', errors='ignore').strip()
            _logger.info(f"Terminal response: {response}")

            return self._parse_response(response, config)
        finally:
            ser.close()

    def _send_tcp_payment(self, config, amount):
        """Send payment amount via TCP."""
        host, port_str = config.port.split(':')
        port = int(port_str)
        amount_int = int(amount)
        command = f"PAY:{amount_int}\r\n"

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(config.connection_timeout)
        try:
            sock.connect((host, port))
            sock.settimeout(config.transaction_timeout)
            sock.sendall(command.encode('ascii'))
            _logger.info(f"Sent payment command: {command.strip()} to {config.port}")

            # Wait for response
            response = sock.recv(1024).decode('ascii', errors='ignore').strip()
            _logger.info(f"Terminal response: {response}")

            return self._parse_response(response, config)
        finally:
            sock.close()

    def _parse_response(self, response, config):
        """
        Parse terminal response.
        Expected format:
            OK:REFERENCE_NUMBER  (successful transaction)
            FAIL:REASON          (declined/failed)
            TIMEOUT              (no response in time)
        """
        if not response:
            config.write({'state': 'error', 'last_error': 'No response from terminal'})
            return {'success': False, 'error': 'No response from terminal'}

        if response.startswith('OK:'):
            reference = response[3:]
            config.write({'state': 'connected', 'last_error': False})
            return {'success': True, 'reference': reference}
        elif response.startswith('FAIL:'):
            reason = response[5:]
            config.write({'state': 'connected', 'last_error': reason})
            return {'success': False, 'error': reason}
        else:
            config.write({'state': 'error', 'last_error': f'Unexpected response: {response}'})
            return {'success': False, 'error': f'Unexpected response: {response}'}
