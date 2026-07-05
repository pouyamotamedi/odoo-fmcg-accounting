'use client';

import { useState, useEffect } from 'react';

const PERSIAN_DIGITS: Record<string, string> = {
  '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
  '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
};

function toPersian(s: string): string {
  return s.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d] || d);
}

function formatWithSeparator(value: string): string {
  // Strip non-digit chars
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  // Add thousand separators
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return toPersian(withCommas);
}

interface PriceInputProps {
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
  min?: number;
}

/**
 * Input that formats numbers with Persian thousand separators as user types.
 * `value` and `onChange` work with raw digit strings (no separators).
 */
export default function PriceInput({ value, onChange, placeholder, className, min }: PriceInputProps) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    setDisplay(formatWithSeparator(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => {
      const idx = '۰۱۲۳۴۵۶۷۸۹'.indexOf(d);
      return idx >= 0 ? String(idx) : d;
    });
    onChange(raw);
    setDisplay(formatWithSeparator(raw));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      min={min}
    />
  );
}
