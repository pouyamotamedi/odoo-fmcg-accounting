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

export function formatTehranJalaliDate(value: string | Date | false | undefined): string {
  if (!value) return '—';
  
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    // Parse YYYY-MM-DD directly as Tehran date
    const [year, month, day] = value.split('-').map(Number);
    // Create date in Tehran timezone by using UTC and adding the offset
    date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }
  
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fa-IR-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  });
}

/**
 * Tailwind class merge utility
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
