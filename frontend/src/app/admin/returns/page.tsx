'use client';

import { useState, useEffect } from 'react';
import { getProducts, getPartners, createSalesReturn, getSalesReturns, getBankCashBalances } from '@/lib/odoo-api';
import { formatPrice, toPersianDigits, toJalali } from '@/lib/utils';

interface ReturnItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface OdooProduct {
  id: number;
  name: string;
  barcode: string | false;
  list_price: number;
}

interface Journal {
  id: number;
  name: string;
  type: string;
  fmcg_running_balance?: number;
}

export default function ReturnsPage() {
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<number>(0);
  const [returnToStock, setReturnToStock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'bank' | 'credit'>('cash');
  const [selectedJournal, setSelectedJournal] = useState<number>(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [returnHistory, setReturnHistory] = useState<any[]>([]);

  async function loadData() {
    try {
      const [prods, custs, jrnls] = await Promise.all([
        getProducts(),
        getPartners('customer'),
        getBankCashBalances(),
      ]);
      setProducts(prods || []);
      setCustomers(custs?.map((c: any) => ({ id: c.id, name: c.name })) || []);
      setJournals(jrnls || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadHistory() {
    try { setReturnHistory(await getSalesReturns() || []); }
    catch { setReturnHistory([]); }
  }

  useEffect(() => { loadData(); loadHistory(); }, []);

  // Filter journals based on refund method
  const filteredJournals = journals.filter((j) =>
    refundMethod === 'cash' ? j.type === 'cash' : refundMethod === 'bank' ? j.type === 'bank' : false
  );

  const filteredProducts = products.filter(
    (p) => (p.display_name || p.name).includes(search) || p.name.includes(search) || (p.barcode && p.barcode.includes(search))
  );

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function addItem(product: OdooProduct) {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: product.id, name: product.display_name || product.name, price: product.list_price, quantity: 1 }];
    });
  }

  function updateQuantity(id: number, qty: number) {
    if (qty <= 0) setItems((prev) => prev.filter((i) => i.id !== id));
    else setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
  }

  async function handleSubmit() {
    if (items.length === 0) { alert('حداقل یک کالا انتخاب کنید'); return; }
    if (refundMethod === 'credit' && !customer) { alert('برای اعتبار مشتری، انتخاب مشتری الزامی است'); return; }
    if ((refundMethod === 'cash' || refundMethod === 'bank') && !selectedJournal) { alert('لطفاً حساب بانکی/صندوق را انتخاب کنید'); return; }

    setSubmitting(true);
    try {
      await createSalesReturn({
        partner_id: customer || undefined,
        lines: items.map((i) => ({ product_id: i.id, quantity: i.quantity, price_unit: i.price })),
        return_to_stock: returnToStock,
        refund_method: refundMethod,
        journal_id: selectedJournal,
        note: note || undefined,
      });
      setItems([]);
      setCustomer(0);
      setSelectedJournal(0);
      setNote('');
      setShowForm(false);
      setMsg('✅ برگشت از فروش ثبت شد');
      setTimeout(() => setMsg(''), 4000);
      await loadHistory();
    } catch (e: any) {
      alert(e.message || 'خطا در ثبت برگشت');
    }
    setSubmitting(false);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">برگشت از فروش</h1>
          <p className="text-gray-500 text-sm">ثبت مرجوعی کالا و بازگشت وجه</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
          <button
            onClick={() => setShowForm(true)}
            className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition"
          >
            + ثبت برگشت
          </button>
        </div>
      </div>

      {/* History table always visible when form is not shown */}
      {!showForm && (
        <div className="space-y-4">
          {returnHistory.length > 0 ? (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="text-sm font-bold text-slate-700">📋 سوابق برگشت‌ها</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-right p-3">شماره</th>
                  <th className="text-right p-3">مشتری</th>
                  <th className="text-right p-3">مبلغ</th>
                  <th className="text-right p-3">تاریخ</th>
                  <th className="text-right p-3">توضیحات</th>
                </tr></thead>
                <tbody>{returnHistory.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-xs">{r.name}</td>
                    <td className="p-3">{r.partner_id ? r.partner_id[1] : 'مشتری عمومی'}</td>
                    <td className="p-3 font-bold">{formatPrice(r.amount_total)}</td>
                    <td className="p-3">{r.invoice_date ? toJalali(r.invoice_date) : '—'}</td>
                    <td className="p-3 text-xs text-gray-500">{r.narration ? r.narration.replace(/<[^>]*>/g, '').trim() : '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
              <div className="text-4xl mb-3">↩️</div>
              <p>هنوز سابقه برگشتی ثبت نشده. برای ثبت مرجوعی، دکمه «ثبت برگشت» را بزنید</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Product selection */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <input
              type="text"
              placeholder="🔍 جستجوی کالا..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2 border border-gray-200 rounded-lg text-sm mb-3 focus:border-indigo-400 focus:outline-none"
            />
            {loading ? (
              <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-auto">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addItem(p)}
                    className="bg-gray-50 rounded-lg p-3 text-center border-2 border-transparent hover:border-indigo-400 transition"
                  >
                    <div className="text-xs font-medium text-gray-800">{p.display_name || p.name}</div>
                    <div className="text-xs text-green-600 font-bold mt-1">{formatPrice(p.list_price)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Return cart + options */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col">
            <strong className="text-sm mb-3">📋 اقلام مرجوعی</strong>
            <div className="flex-1 overflow-auto mb-3 min-h-24">
              {items.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-6">کالایی انتخاب نشده</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div>
                      <div className="text-xs font-medium">{item.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold">-</button>
                        <span className="text-xs">{toPersianDigits(item.quantity)}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-5 h-5 rounded bg-gray-200 text-xs font-bold">+</button>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-700">{formatPrice(item.price * item.quantity)}</div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 border-t pt-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">مشتری {refundMethod === 'credit' ? '(الزامی)' : '(اختیاری)'}</label>
                <select
                  value={customer}
                  onChange={(e) => setCustomer(Number(e.target.value))}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value={0}>— بدون مشتری —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">سرنوشت کالا</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReturnToStock(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${returnToStock ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    بازگشت به انبار
                  </button>
                  <button
                    onClick={() => setReturnToStock(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${!returnToStock ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    ضایعات
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">روش بازگشت وجه</label>
                <select
                  value={refundMethod}
                  onChange={(e) => { setRefundMethod(e.target.value as 'cash' | 'bank' | 'credit'); setSelectedJournal(0); }}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="cash">نقد</option>
                  <option value="bank">بانک</option>
                  <option value="credit">اعتبار مشتری</option>
                </select>
              </div>

              {/* Journal selection for cash/bank */}
              {(refundMethod === 'cash' || refundMethod === 'bank') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {refundMethod === 'cash' ? 'صندوق' : 'حساب بانکی'}
                  </label>
                  <select
                    value={selectedJournal}
                    onChange={(e) => setSelectedJournal(Number(e.target.value))}
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    <option value={0}>— انتخاب کنید —</option>
                    {filteredJournals.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} {j.fmcg_running_balance != null ? `(${formatPrice(j.fmcg_running_balance)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">دلیل / یادداشت</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="دلیل مرجوعی..."
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-between text-base font-bold text-slate-800 pt-2 border-t">
                <span>مبلغ بازگشتی:</span>
                <span>{formatPrice(total)} تومان</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || items.length === 0}
                  className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-40"
                >
                  {submitting ? 'در حال ثبت...' : 'ثبت برگشت'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setItems([]); }}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
