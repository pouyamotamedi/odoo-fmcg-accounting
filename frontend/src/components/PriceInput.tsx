'use client';

const PERSIAN_DIGITS: Record<string, string> = {
  '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
  '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
};

/** Persian decimal separator (U+066B) used for display. */
const DECIMAL_DISPLAY = '٫';

function toPersian(s: string): string {
  return s.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[d] || d);
}

/**
 * Normalize any user/Odoo input to a raw numeric string: Latin digits and at most one '.'.
 * Accepts Persian/Arabic digits and '.', '٫' as the decimal separator; thousands
 * separators (',', '٬') and other characters are dropped.
 * Numbers in exponent form (e.g. 1e-7 from String(number)) are expanded first.
 */
function normalizeRaw(value: string): string {
  let s = String(value ?? '');
  if (/e/i.test(s) && Number.isFinite(Number(s))) {
    s = Number(s).toFixed(6).replace(/\.?0+$/, '');
  }
  s = s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot === -1) return s;
  // Keep only the first decimal point
  const intPart = s.slice(0, dot) || (s.length > 1 ? '0' : '');
  const fracPart = s.slice(dot + 1).replace(/\./g, '');
  return `${intPart}.${fracPart}`;
}

function formatWithSeparator(value: string): string {
  const raw = normalizeRaw(value);
  if (!raw) return '';
  const [intPart, fracPart] = raw.split('.');
  // Add thousand separators to the integer part only
  const withCommas = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const decimals = fracPart !== undefined ? `${DECIMAL_DISPLAY}${fracPart}` : '';
  return toPersian(withCommas + decimals);
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
 * Supports decimals ('.' or '٫').
 * `value` and `onChange` work with raw numeric strings (Latin digits, '.' decimal, no separators).
 */
export default function PriceInput({ value, onChange, placeholder, className, min }: PriceInputProps) {
  // Fully controlled: the formatted text is derived from the raw `value`.
  const display = formatWithSeparator(value ?? '');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(normalizeRaw(e.target.value));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      min={min}
    />
  );
}
