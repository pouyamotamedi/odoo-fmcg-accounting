'use client';

import { useState, useEffect } from 'react';
import { getProducts, searchRead, create, write, callMethod } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits, toJalali } from '@/lib/utils';

interface Product {
  id: number;
  name: string;
  barcode: string | false;
  qty_available: number;
}

interface CountLine {
  product_id: number;
  product_name: string;
  system_qty: number;
  counted_qty: number;
  difference: number;
}

interface CountHistory {
  id: number;
  name: string;
  date: string;
  state: string;
  line_count: number;
}

export default function StockCountPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<CountHistory[]>([]);

  useEffect(() => {
    loadData();
    loadHistory();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const prods = await getProducts();
      setProducts(prods || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadHistory() {
    try {
      // Try to load stock.quant records or use our own tracking
      const quants = await searchRead('stock.quant', [
        ['location_id.usage', '=', 'internal'],
      ], ['product_id', 'quantity', 'inventory_date'], 0, 0, 'inventory_date desc');
      // We'll track history via stock adjustments instead
    } catch { /* ignore */ }

    // Load adjustment history from fmcg.stock.adjustment
    try {
      const adjs = await searchRead('fmcg.stock.adjustment', [], [
        'product_id', 'quantity', 'reason', 'note', 'create_date', 'state',
      ], 50, 0, 'create_date desc');
      setHistory(adjs || []);
    } catch { setHistory([]); }
  }

  function addAllProducts() {
    const newLines: CountLine[] = products.map((p) => ({
      product_id: p.id,
      product_name: p.name,
      system_qty: p.qty_available,
      counted_qty: p.qty_available, // Default: same as system
      difference: 0,
    }));
    setLines(newLines);
  }

  function addProduct(product: Product) {
    if (lines.find((l) => l.product_id === product.id)) return;
    setLines([...lines, {
      product_id: product.id,
      product_name: product.name,
      system_qty: product.qty_available,
      counted_qty: product.qty_available,
      difference: 0,
    }]);
  }

  function updateCountedQty(productId: number, qty: number) {
    setLines(lines.map((l) => {
      if (l.product_id === productId) {
        const diff = qty - l.system_qty;
        return { ...l, counted_qty: qty, difference: diff };
      }
      return l;
    }));
  }

  function removeLine(productId: number) {
    setLines(lines.filter((l) => l.product_id !== productId));
  }

  async function handleSubmit() {
    const diffs = lines.filter((l) => l.difference !== 0);
    if (diffs.length === 0) {
      alert('هیچ اختلافی وجود ندارد. انبار تطبیق دارد.');
      return;
    }

    setSubmitting(true);
    try {
      // For each difference, create a stock adjustment using Odoo's stock.quant
      for (const line of diffs) {
        try {
          // Try Odoo 18 stock.quant inventory adjustment
          const quants = await searchRead('stock.quant', [
            ['product_id', '=', line.product_id],
            ['location_id.usage', '=', 'internal'],
          ], ['id', 'quantity', 'location_id'], 1);

          if (quants && quants.length > 0) {
            // Update the quant's inventory_quantity and apply
            await write('stock.quant', [quants[0].id], {
              inventory_quantity: line.counted_qty,
            });
            await callMethod('stock.quant', 'action_apply_inventory', [[quants[0].id]]);
          } else {
            // Fallback: use fmcg.stock.adjustment
            const adjQty = Math.abs(line.difference);
            const reason = line.difference < 0 ? 'lost' : 'other';
            const adjId = await create('fmcg.stock.adjustment', {
              product_id: line.product_id,
              quantity: adjQty,
              reason: reason,
              note: note || `انبارگردانی - اختلاف: ${line.difference > 0 ? '+' : ''}${line.difference}`,
            });
            await callMethod('fmcg.stock.adjustment', 'action_confirm', [[adjId]]);
          }
        } catch {
          // Try fmcg.stock.adjustment as fallback
          try {
            const adjQty = Math.abs(line.difference);
            const adjId = await create('fmcg.stock.adjustment', {
              product_id: line.product_id,
              quantity: adjQty,
              reason: line.difference < 0 ? 'lost' : 'other',
              note: note || `انبارگردانی - ${line.product_name}: ${line.difference > 0 ? '+' : ''}${line.difference}`,
            });
            await callMethod('fmcg.stock.adjustment', 'action_confirm', [[adjId]]);
          } catch { /* skip */ }
        }
      }

      setMsg(`✅ انبارگردانی ثبت شد (${toPersianDigits(diffs.length)} قلم اصلاح شد)`);
      setTimeout(() => setMsg(''), 5000);
      setLines([]);
      setNote('');
      setShowForm(false);
      await loadData();
      await loadHistory();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت انبارگردانی');
    }
    setSubmitting(false);
  }

  const filteredProducts = products.filter(
    (p) => p.name.includes(search) || (p.barcode && p.barcode.includes(search))
  );

  const totalDiffs = lines.filter((l) => l.difference !== 0).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">انبارگردانی</h1>
          <p className="text-gray-500 text-sm">شمارش فیزیکی موجودی و تطبیق با سیستم</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setLines([]); }}
              className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition"
            >
              + شروع انبارگردانی
            </button>
          )}
        </div>
      </div>

      {/* Active count form */}
      {showForm && (
        <div className="space-y-4 mb-6">
          {/* Add products section */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex justify-between items-center mb-3">
              <strong className="text-sm">انتخاب کالا برای شمارش</strong>
              <button
                onClick={addAllProducts}
                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200"
              >
                افزودن همه کالاها
              </button>
            </div>
            <input
              type="text"
              placeholder="🔍 جستجوی کالا..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-3 focus:border-indigo-400 focus:outline-none"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-auto">
              {filteredProducts.slice(0, 30).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={!!lines.find((l) => l.product_id === p.id)}
                  className="bg-gray-50 rounded-lg p-2 text-center border hover:border-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="text-xs font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-[10px] text-gray-500">موجودی: {toPersianDigits(Math.round(p.qty_available))}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Count lines */}
          {lines.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                <strong className="text-sm">جدول شمارش ({toPersianDigits(lines.length)} قلم)</strong>
                {totalDiffs > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-bold">
                    {toPersianDigits(totalDiffs)} اختلاف
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-right p-3">کالا</th>
                    <th className="text-right p-3">موجودی سیستم</th>
                    <th className="text-right p-3">شمارش واقعی</th>
                    <th className="text-right p-3">اختلاف</th>
                    <th className="text-right p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.product_id} className={`border-b ${line.difference !== 0 ? 'bg-orange-50' : ''}`}>
                      <td className="p-3 font-medium text-xs">{line.product_name}</td>
                      <td className="p-3 text-gray-500">{toPersianDigits(Math.round(line.system_qty))}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={line.counted_qty}
                          onChange={(e) => updateCountedQty(line.product_id, Number(e.target.value))}
                          className="w-20 p-1.5 border border-gray-200 rounded text-sm text-center focus:border-indigo-400 focus:outline-none"
                          min={0}
                        />
                      </td>
                      <td className={`p-3 font-bold ${line.difference > 0 ? 'text-green-600' : line.difference < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {line.difference > 0 ? '+' : ''}{toPersianDigits(line.difference)}
                      </td>
                      <td className="p-3">
                        <button onClick={() => removeLine(line.product_id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Note + Submit */}
          {lines.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">یادداشت (اختیاری)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="توضیحات انبارگردانی..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || totalDiffs === 0}
                  className="flex-1 py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-40 transition"
                >
                  {submitting ? 'در حال ثبت...' : `ثبت انبارگردانی (${toPersianDigits(totalDiffs)} اصلاح)`}
                </button>
                <button
                  onClick={() => { setShowForm(false); setLines([]); }}
                  className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 transition"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {!showForm && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="text-sm font-bold text-slate-700">📦 موجودی فعلی کالاها</h3>
          </div>
          {products.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">کالایی ثبت نشده</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right p-3">کالا</th>
                  <th className="text-right p-3">بارکد</th>
                  <th className="text-right p-3">موجودی فعلی</th>
                  <th className="text-right p-3">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-xs text-gray-500 font-mono">{p.barcode || '—'}</td>
                    <td className="p-3 font-bold">{toPersianDigits(Math.round(p.qty_available))}</td>
                    <td className="p-3">
                      {p.qty_available <= 0 ? (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">تمام شده</span>
                      ) : p.qty_available < 5 ? (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">کم</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">موجود</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
