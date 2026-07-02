'use client';

import { useState } from 'react';
import { formatPrice, toPersianDigits } from '@/lib/utils';

interface PurchaseItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

// Demo products - will come from Odoo API
const demoProducts = [
  { id: 1, name: 'شیر کاله', price: 25000 },
  { id: 2, name: 'ماست سون', price: 20000 },
  { id: 3, name: 'نان باگت', price: 10000 },
  { id: 4, name: 'آب معدنی', price: 5000 },
  { id: 5, name: 'چیپس', price: 35000 },
  { id: 6, name: 'نوشابه', price: 15000 },
  { id: 7, name: 'بیسکویت', price: 12000 },
  { id: 8, name: 'شامپو', price: 60000 },
  { id: 9, name: 'صابون', price: 8000 },
  { id: 10, name: 'دستمال', price: 25000 },
  { id: 11, name: 'پنیر', price: 40000 },
  { id: 12, name: 'کره', price: 50000 },
];

export default function PurchasePage() {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');

  const filteredProducts = demoProducts.filter(
    (p) => p.name.includes(search) || String(p.id).includes(search)
  );

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addItem(product: { id: number; name: string; price: number }) {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function updateQuantity(id: number, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item)));
    }
  }

  function handleConfirm(paymentMethod: 'cash' | 'bank' | 'credit') {
    const methodLabel = paymentMethod === 'cash' ? 'نقد' : paymentMethod === 'bank' ? 'بانک' : 'نسیه';
    alert(`فاکتور خرید ثبت شد!\nتامین‌کننده: ${supplier || 'نامشخص'}\nمبلغ: ${formatPrice(total)} تومان\nپرداخت: ${methodLabel}`);
    setItems([]);
    setSupplier('');
  }

  function handleAddNewProduct() {
    if (newProductName && newProductPrice) {
      // TODO: Create in Odoo via API
      alert(`کالای "${newProductName}" با قیمت خرید ${newProductPrice} ثبت شد`);
      setShowNewProduct(false);
      setNewProductName('');
      setNewProductPrice('');
    }
  }

  return (
    <div className="flex h-[calc(100vh-48px)] -m-6">
      {/* Products Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <header className="bg-orange-600 text-white px-4 py-3 flex justify-between items-center">
          <span className="text-lg font-bold">🛒 فاکتور خرید</span>
          <button
            onClick={() => setShowNewProduct(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition"
          >
            + کالای جدید
          </button>
        </header>

        {/* Supplier */}
        <div className="p-3 bg-white border-b border-gray-200">
          <input
            type="text"
            placeholder="👤 نام تامین‌کننده..."
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-orange-400 focus:outline-none"
          />
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <input
            type="text"
            placeholder="🔍 جستجوی کالا یا بارکد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:border-orange-400 focus:outline-none"
          />
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addItem(product)}
                className="bg-white rounded-xl p-4 text-center border-2 border-transparent hover:border-orange-400 hover:scale-[1.02] transition-all shadow-sm"
              >
                <div className="text-sm font-medium text-gray-800">{product.name}</div>
                <div className="text-xs text-orange-600 font-bold mt-2">
                  خرید: {formatPrice(product.price)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-80 bg-white flex flex-col border-r border-gray-200 shadow-lg">
        <div className="p-4 bg-orange-50 border-b border-orange-100">
          <strong className="text-sm">📋 اقلام فاکتور خرید</strong>
          {items.length > 0 && (
            <button
              onClick={() => setItems([])}
              className="float-left text-xs text-red-500 hover:text-red-700"
            >
              پاک کردن
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto p-3">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-10">کالایی انتخاب نشده</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex justify-between items-center py-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-6 h-6 rounded bg-gray-200 text-xs font-bold">-</button>
                    <span className="text-sm">{toPersianDigits(item.quantity)}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-6 h-6 rounded bg-gray-200 text-xs font-bold">+</button>
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-700">{formatPrice(item.price * item.quantity)}</div>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="p-4 border-t-2 border-gray-200">
          <div className="flex justify-between text-lg font-bold text-slate-800">
            <span>جمع کل:</span>
            <span>{formatPrice(total)} تومان</span>
          </div>
        </div>

        {/* Payment Buttons */}
        <div className="p-3 space-y-2">
          <p className="text-xs text-gray-500 mb-1">نحوه پرداخت:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleConfirm('cash')}
              disabled={items.length === 0}
              className="py-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition"
            >
              💵 نقد
            </button>
            <button
              onClick={() => handleConfirm('bank')}
              disabled={items.length === 0}
              className="py-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition"
            >
              🏦 بانک
            </button>
            <button
              onClick={() => handleConfirm('credit')}
              disabled={items.length === 0}
              className="py-3 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 transition"
            >
              📝 نسیه
            </button>
          </div>
        </div>
      </div>

      {/* New Product Popup */}
      {showNewProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">+ ثبت کالای جدید</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام کالا</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="مثلاً: شیر کاله ۱ لیتری"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">بارکد</label>
                <input type="text" placeholder="اختیاری" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت خرید</label>
                  <input
                    type="text"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="۲۵,۰۰۰"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">قیمت فروش</label>
                  <input type="text" placeholder="۳۲,۰۰۰" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddNewProduct}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600"
              >
                ثبت کالا
              </button>
              <button
                onClick={() => setShowNewProduct(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
