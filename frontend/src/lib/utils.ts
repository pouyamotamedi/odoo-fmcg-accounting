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
export function formatPrice(amount: number): string {
  const formatted = Math.round(amount).toLocaleString('fa-IR');
  return formatted;
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

/**
 * Tailwind class merge utility
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
