"""
Jalali (Solar Hijri) calendar utilities for Persian localization.
Provides Gregorian to Jalali conversion and Persian numeral formatting.
"""
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)

try:
    import jdatetime
    HAS_JDATETIME = True
except ImportError:
    HAS_JDATETIME = False
    _logger.warning("jdatetime not installed. Jalali calendar features unavailable. Install with: pip install jdatetime")


# Persian numeral mapping
PERSIAN_DIGITS = {
    '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
    '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
}


class JalaliUtils(models.AbstractModel):
    _name = 'fmcg.jalali.utils'
    _description = 'Jalali Calendar Utilities'

    @api.model
    def gregorian_to_jalali(self, date):
        """Convert a Gregorian date to Jalali formatted string (YYYY/MM/DD)."""
        if not date:
            return ''
        if not HAS_JDATETIME:
            return str(date)
        try:
            jdate = jdatetime.date.fromgregorian(date=date)
            return jdate.strftime('%Y/%m/%d')
        except Exception as e:
            _logger.error(f"Jalali conversion error: {e}")
            return str(date)

    @api.model
    def jalali_to_gregorian(self, jalali_str):
        """Convert a Jalali date string (YYYY/MM/DD) to Gregorian date."""
        if not jalali_str or not HAS_JDATETIME:
            return None
        try:
            parts = jalali_str.split('/')
            jdate = jdatetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
            return jdate.togregorian()
        except Exception as e:
            _logger.error(f"Jalali to Gregorian conversion error: {e}")
            return None

    @api.model
    def to_persian_numerals(self, text):
        """Convert ASCII digits in text to Persian numerals."""
        if not text:
            return ''
        result = str(text)
        for ascii_digit, persian_digit in PERSIAN_DIGITS.items():
            result = result.replace(ascii_digit, persian_digit)
        return result

    @api.model
    def format_persian_number(self, number):
        """Format a number with Persian numerals and thousand separator (/)."""
        if number is None:
            return ''
        # Format with thousand separator
        if isinstance(number, float):
            formatted = f"{number:,.2f}"
        else:
            formatted = f"{int(number):,}"
        # Replace comma with forward slash for Persian convention
        formatted = formatted.replace(',', '/')
        # Convert to Persian numerals
        return self.to_persian_numerals(formatted)
