'use client';

import { useState } from 'react';
import { useCartStore } from '@/stores/cart-store';
import { formatPrice, toPersianDigits } from '@/lib/utils';
import Link from 'next/link';

// Demo products - will be replaced with Odoo API data
const demoProducts = [
  { id: 1, name: 'شیر کاله', price: 32000 },
  { id: 2, name: 'ماست سون', price: 28000 },
  { id: 3, name: 'نان باگت', price: 15000 },
  { id: 4, name: 'آب معدنی', price: 8000 },
  { id: 5, name: 'چیپس', price: 45000 },
  { id: 6, name: 'نوشابه', price: 22000 },
  { id: 7, name: 'بیسکویت', price: 18000 },
  { id: 8, name: 'شامپو', price: 85000 },
  { id: 9, name: 'صابون', price: 12000 },
  { id: 10, name: 'دستمال', price: 35000 },
  { id: 11, name: 'پنیر', price: 55000 },
  { id: 12, name: 'کره', price: 65000 },
];

export default function PosPage() {
  const { items, addItem, updateQuantity, removeItem, clearCart, total } = useCartStore();
  const [search, setSearch] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  const filteredProducts = demoProducts.filter(
    (p) => p.name.includes(search) || String(p.id).includes(search)
  );

  const cartTotal = total();

  function handlePayment(method: 'cash' | 'card' | 'credit') {
    // TODO: Connect to Odoo API
    alert(`پرداخت ${method === 'cash' ? 'نقدی' : method === 'card' ? 'کارتی' : 'اعتباری'}\nمبلغ: ${formatPrice(cartTotal)} تومان`);
    clearCart();
    setShowPayment(false);
  }

  return (
    <div className="flex h-screen">
      {/* Products Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <header className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
          <span className="text-lg font-bold">🏪 صندوق فروش</span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-300">🟢 آنلاین</span>
            <Link href="/admin" className="text-xs text-slate-400 hover:text-white">
              بازگشت به پنل ←
            </Link>
          </div>
        </header>

        {/* Search */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <input
            type="text"
            placeholder="🔍 جستجو یا اسکن بارکد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addItem(product)}
                className="bg-white rounded-xl p-4 text-center border-2 border-transparent hover:border-indigo-400 hover:scale-[1.02] transition-all shadow-sm"
              >
                <div className="text-sm font-medium text-gray-800">{product.name}</div>
                <div className="text-sm text-green-600 font-bold mt-2">
                  {formatPrice(product.price)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-80 bg-white flex flex-col border-r border-gray-200 shadow-lg">
        {/* Cart Header */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <strong className="text-sm">🧾 فاکتور فروش</strong>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="float-left text-xs text-red-500 hover:text-red-700"
            >
              پاک کردن
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-auto p-3">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-10">
              محصولی انتخاب نشده
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center py-3 border-b border-gray-100"
              >
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="text-sm">{toPersianDigits(item.quantity)}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-6 h-6 rounded bg-gray-200 text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {formatPrice(item.price * item.quantity)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="p-4 border-t-2 border-gray-200">
          <div className="flex justify-between text-lg font-bold text-slate-800">
            <span>جمع کل:</span>
            <span>{formatPrice(cartTotal)} تومان</span>
          </div>
        </div>

        {/* Payment Buttons */}
        <div className="grid grid-cols-3 gap-2 p-3">
          <button
            onClick={() => handlePayment('cash')}
            disabled={items.length === 0}
            className="py-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition"
          >
            💵 نقد
          </button>
          <button
            onClick={() => handlePayment('card')}
            disabled={items.length === 0}
            className="py-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition"
          >
            💳 کارت
          </button>
          <button
            onClick={() => handlePayment('credit')}
            disabled={items.length === 0}
            className="py-3 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 transition"
          >
            🤝 اعتباری
          </button>
        </div>
      </div>
    </div>
  );
}
