'use client';

import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

interface Props {
  value: string; // ISO date string yyyy-mm-dd
  onChange: (isoDate: string) => void;
  placeholder?: string;
  className?: string;
}

export default function JalaliDatePicker({ value, onChange, placeholder, className }: Props) {
  // Parse and serialize calendar dates in local time so timezone conversion cannot shift the day.
  const dateValue = (() => {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : undefined;
  })();

  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={dateValue}
      onChange={(date: unknown) => {
        if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
          const selected = date.toDate() as Date;
          const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
          onChange(iso);
        }
      }}
      format="YYYY/MM/DD"
      inputClass={className || 'p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none w-full'}
      containerClassName="w-full"
      placeholder={placeholder || 'انتخاب تاریخ'}
    />
  );
}
