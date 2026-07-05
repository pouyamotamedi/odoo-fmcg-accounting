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
  // Convert ISO string to a Date object for the picker
  const dateValue = value ? new Date(value) : undefined;

  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={dateValue}
      onChange={(date: any) => {
        if (date) {
          // Convert back to Gregorian ISO string
          const d = date.toDate() as Date;
          const iso = d.toISOString().split('T')[0];
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
