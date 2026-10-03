/**
 * Utility functions for Persian locale
 */
import * as jalaali from 'jalaali-js';

// Persian digit mapping
const PERSIAN_DIGITS: Record<string, string> = {
  '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
  '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
};

/**
 * Convert ASCII digits to Persian numerals
 */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d] || d);
}

/**
 * Format number with thousand separators and Persian digits
 */
export function formatPrice(amount: number | undefined | null): string {
  if (amount == null || isNaN(amount)) return '۰';
  // Use explicit regex-based formatting for consistent SSR/client behavior
  const rounded = Math.round(amount);
  const isNegative = rounded < 0;
  const absStr = Math.abs(rounded).toString();
  // Add thousand separators (comma every 3 digits from right)
  const withSeparators = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Convert to Persian digits and Persian comma separator
  const persian = withSeparators
    .replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d] || d)
    .replace(/,/g, '٬');
  return isNegative ? `-${persian}` : persian;
}

/**
 * Format price with currency suffix
 */
export function formatCurrency(amount: number): string {
  return `${formatPrice(amount)} تومان`;
}

/**
 * Convert Gregorian date to Jalali string (YYYY/MM/DD)
 */
export function toJalali(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { jy, jm, jd } = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/**
 * Get today in Jalali format
 */
export function todayJalali(): string {
  return toJalali(new Date());
}

export function formatTehranDateTime(value: string | Date | false | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date
    ? value
    : new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fa-IR-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran',
  });
}

// Convert Gregorian to Persian (Jalali) manually
function gregorianToPersian(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const daysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  
  // Calculate days since March 21, 622 (start of Persian calendar)
  const jy = year - 622;
  const jm = month - 1;
  const jd = day;
  
  // Approximate calculation
  let pYear = year - 621;
  let pMonth = month - 1;
  let pDay = day;
  
  // Adjust for months before Farvardin
  if (month < 3 || (month === 3 && day < 21)) {
    pYear -= 1;
    pMonth = month + 9;
    pDay = day;
  } else if (month === 3 && day < 21) {
    pMonth = 0;
    pDay = day + 10;
  } else {
    pMonth = month - 3;
    pDay = day + 10;
  }
  
  return { year: pYear, month: pMonth, day: pDay };
}

function toPersianNumber(num: number): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num.toString().split('').map(d => persianDigits[parseInt(d)] || d).join('');
}

export function formatTehranJalaliDate(value: string | Date | false | undefined): string {
  if (!value) return '—';
  
  const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  
  let year: number, month: number, day: number;
  
  if (value instanceof Date) {
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  } else {
    // Parse YYYY-MM-DD format directly - no timezone conversion
    const parts = value.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  }
  
  // Adjust month/day if before March 21 in Gregorian
  if (month < 3 || (month === 3 && day < 21)) {
    // In this case, it's the previous Persian year
  } else if (month > 3 || (month === 3 && day >= 21)) {
    // Convert Gregorian to Persian
    month = month - 3;
    day = day + 10;
  } else if (month === 3 && day >= 21) {
    month = 0;
    day = day - 20;
  }
  
  // Ensure month is 0-11 and day is valid
  month = Math.max(0, Math.min(11, month));
  
  return `${toPersianNumber(day)} ${persianMonths[month]} ${toPersianNumber(year)}`;
}

/**
 * Tailwind class merge utility
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
