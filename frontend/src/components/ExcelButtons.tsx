'use client';

import { useRef, useState } from 'react';

interface Column {
  key: string;
  label: string;
  transform?: (value: any) => string;
}

interface ExcelButtonsProps {
  data: any[];
  columns: Column[];
  filename: string;
  onImport?: (rows: Record<string, string>[]) => void;
  getExportData?: () => Promise<any[]>;
  onExportError?: (error: unknown) => void;
}

/**
 * Reusable CSV/Excel export and import buttons
 */
export default function ExcelButtons({ data, columns, filename, onImport, getExportData, onExportError }: ExcelButtonsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  async function exportCSV() {
    if (exporting) return;

    try {
      setExporting(true);
      const exportData = getExportData ? await getExportData() : data;
      // BOM for Excel to recognize UTF-8
      const BOM = '\uFEFF';
      const header = columns.map(c => c.label).join(',');
      const rows = exportData.map(row =>
        columns.map(col => {
          let val = row[col.key];
          if (col.transform) val = col.transform(val);
          if (val === null || val === undefined) val = '';
          // Escape commas and quotes
          val = String(val).replace(/"/g, '""');
          if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) {
            val = `"${val}"`;
          }
          return val;
        }).join(',')
      );
      const csv = BOM + header + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (onExportError) onExportError(error);
      else window.alert('خطا در آماده‌سازی خروجی Excel.');
    } finally {
      setExporting(false);
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ''; });
        return obj;
      });
      onImport(rows);
    };
    reader.readAsText(file, 'utf-8');
    // Reset input
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={exportCSV}
        disabled={exporting || (!getExportData && data.length === 0)}
        className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold hover:bg-green-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? 'در حال آماده‌سازی...' : '📥 خروجی Excel'}
      </button>
      {onImport && (
        <>
          <button onClick={() => fileRef.current?.click()} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 transition">
            📤 ورودی Excel
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
        </>
      )}
    </div>
  );
}
