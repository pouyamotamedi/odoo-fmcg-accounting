'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnboardingData } from '@/lib/odoo-api';

interface Person { name: string; role: string; phone: string }
interface BankAccount { bankName: string; accountNumber: string; bankBalance: string; cashBalance: string }
interface Terminal { model: string; port: string; protocol: string }
interface Product { name: string; barcode: string; buyPrice: string; sellPrice: string }

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: People
  const [people, setPeople] = useState<Person[]>([]);
  const [personForm, setPersonForm] = useState<Person>({ name: '', role: 'فروشنده', phone: '' });

  // Step 2: Bank/Cash
  const [bank, setBank] = useState<BankAccount>({ bankName: '', accountNumber: '', bankBalance: '', cashBalance: '' });

  // Step 3: Terminal
  const [terminal, setTerminal] = useState<Terminal>({ model: '', port: 'COM3', protocol: 'serial' });

  // Step 4: Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productForm, setProductForm] = useState<Product>({ name: '', barcode: '', buyPrice: '', sellPrice: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function addPerson() {
    if (personForm.name) {
      setPeople([...people, { ...personForm }]);
      setPersonForm({ name: '', role: 'فروشنده', phone: '' });
    }
  }

  function addProduct() {
    if (productForm.name) {
      setProducts([...products, { ...productForm }]);
      setProductForm({ name: '', barcode: '', buyPrice: '', sellPrice: '' });
    }
  }

  async function handleFinish() {
    setSaving(true);
    setSaveError('');
    try {
      await saveOnboardingData({ people, bank, terminal, products });
      router.push('/admin');
    } catch (e: any) {
      setSaveError(e.message || 'خطا در ذخیره اطلاعات در سرور');
      setSaving(false);
    }
  }

  const steps = [
    { num: 1, label: 'اشخاص' },
    { num: 2, label: 'بانک و صندوق' },
    { num: 3, label: 'کارتخوان' },
    { num: 4, label: 'کالاها' },
    { num: 5, label: 'اتمام' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">🎉 خوش آمدید!</h2>
        <p className="text-center text-gray-500 text-sm mb-8">بیایید فروشگاه‌تان را راه‌اندازی کنیم</p>

        {/* Steps indicator */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((s) => (
            <div
              key={s.num}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                s.num < step ? 'bg-green-500 text-white' :
                s.num === step ? 'bg-indigo-500 text-white' :
                'bg-gray-200 text-gray-500'
              }`}
            >
              {s.num < step ? '✓' : s.num}
            </div>
          ))}
        </div>

        {/* Step 1: People */}
        {step === 1 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-4">👥 مرحله ۱: اشخاص</h3>
            <p className="text-sm text-gray-500 mb-4">فروشنده‌ها و تامین‌کنندگان خود را معرفی کنید</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <input type="text" placeholder="نام" value={personForm.name} onChange={(e) => setPersonForm({...personForm, name: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
              <select value={personForm.role} onChange={(e) => setPersonForm({...personForm, role: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm">
                <option>فروشنده</option>
                <option>تامین‌کننده</option>
                <option>مدیر</option>
              </select>
              <input type="text" placeholder="شماره تماس" value={personForm.phone} onChange={(e) => setPersonForm({...personForm, phone: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <button onClick={addPerson} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600">+ افزودن</button>
            {people.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-xs text-gray-500 mb-2">{people.length} شخص ثبت شده:</p>
                {people.map((p, i) => (
                  <div key={i} className="text-sm py-1 flex justify-between">
                    <span>{p.name} ({p.role})</span><span className="text-gray-400">{p.phone}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button onClick={() => router.push('/admin')} className="text-sm text-gray-400 hover:text-gray-600">رد کردن ←</button>
              <button onClick={() => setStep(2)} className="bg-green-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-600">مرحله بعد ←</button>
            </div>
          </div>
        )}

        {/* Step 2: Bank/Cash */}
        {step === 2 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-4">🏦 مرحله ۲: حساب بانکی و صندوق</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام بانک</label>
                <input type="text" placeholder="بانک ملت" value={bank.bankName} onChange={(e) => setBank({...bank, bankName: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">شماره حساب</label>
                <input type="text" placeholder="۱۲۳۴۵۶۷۸۹۰" value={bank.accountNumber} onChange={(e) => setBank({...bank, accountNumber: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">موجودی اولیه حساب بانکی (تومان)</label>
                <input type="text" placeholder="۱۰,۰۰۰,۰۰۰" value={bank.bankBalance} onChange={(e) => setBank({...bank, bankBalance: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">موجودی اولیه صندوق نقدی (تومان)</label>
                <input type="text" placeholder="۵,۰۰۰,۰۰۰" value={bank.cashBalance} onChange={(e) => setBank({...bank, cashBalance: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">→ قبلی</button>
              <button onClick={() => setStep(3)} className="bg-green-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-600">مرحله بعد ←</button>
            </div>
          </div>
        )}

        {/* Step 3: Terminal */}
        {step === 3 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-4">💳 مرحله ۳: دستگاه کارتخوان</h3>
            <p className="text-sm text-gray-500 mb-4">اگه دستگاه کارتخوان ندارید این مرحله رو رد کنید</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">مدل دستگاه</label>
                <input type="text" placeholder="Ingenico iWL250" value={terminal.model} onChange={(e) => setTerminal({...terminal, model: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">پورت اتصال</label>
                <input type="text" placeholder="COM3" value={terminal.port} onChange={(e) => setTerminal({...terminal, port: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">پروتکل</label>
                <select value={terminal.protocol} onChange={(e) => setTerminal({...terminal, protocol: e.target.value})} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                  <option value="serial">Serial (RS232)</option>
                  <option value="tcp">TCP/IP</option>
                </select>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">→ قبلی</button>
              <button onClick={() => setStep(4)} className="bg-green-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-600">مرحله بعد ←</button>
            </div>
          </div>
        )}

        {/* Step 4: Products */}
        {step === 4 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-4">📦 مرحله ۴: کالاها</h3>
            <p className="text-sm text-gray-500 mb-4">محصولات فروشگاه خود را اضافه کنید</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input type="text" placeholder="نام کالا" value={productForm.name} onChange={(e) => setProductForm({...productForm, name: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
              <input type="text" placeholder="بارکد (اختیاری)" value={productForm.barcode} onChange={(e) => setProductForm({...productForm, barcode: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
              <input type="text" placeholder="قیمت خرید" value={productForm.buyPrice} onChange={(e) => setProductForm({...productForm, buyPrice: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
              <input type="text" placeholder="قیمت فروش" value={productForm.sellPrice} onChange={(e) => setProductForm({...productForm, sellPrice: e.target.value})} className="p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <button onClick={addProduct} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600">+ افزودن کالا</button>
            {products.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-xs text-gray-500 mb-2">{products.length} کالا ثبت شده:</p>
                {products.map((p, i) => (
                  <div key={i} className="text-sm py-1 flex justify-between">
                    <span>{p.name}</span><span className="text-gray-400">خرید: {p.buyPrice} | فروش: {p.sellPrice}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700">→ قبلی</button>
              <button onClick={() => setStep(5)} className="bg-green-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-600">مرحله بعد ←</button>
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="text-5xl mb-4">🎊</div>
            <h3 className="text-xl font-bold mb-2">تبریک! راه‌اندازی کامل شد</h3>
            <p className="text-gray-500 text-sm mb-6">
              {people.length} شخص و {products.length} کالا ثبت شد. الان میتونید شروع کنید!
            </p>
            {saveError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{saveError}</div>
            )}
            <button
              onClick={handleFinish}
              disabled={saving}
              className="bg-indigo-500 text-white px-8 py-3 rounded-lg font-bold hover:bg-indigo-600 transition disabled:opacity-50"
            >
              {saving ? 'در حال ذخیره...' : 'ثبت و ورود به پنل مدیریت ←'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
