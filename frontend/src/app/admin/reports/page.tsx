'use client';

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">گزارش‌ها</h1>
      <p className="text-gray-500 text-sm mb-6">گزارش‌های فروش، انبار، بدهی و جریان نقدی</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-300 cursor-pointer transition">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-bold text-sm">گزارش فروش روزانه</h3>
          <p className="text-xs text-gray-500 mt-1">مجموع فروش، تعداد تراکنش، تفکیک روش پرداخت</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-300 cursor-pointer transition">
          <div className="text-2xl mb-2">📦</div>
          <h3 className="font-bold text-sm">وضعیت موجودی</h3>
          <p className="text-xs text-gray-500 mt-1">لیست کالاها با تعداد و ارزش</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-300 cursor-pointer transition">
          <div className="text-2xl mb-2">👥</div>
          <h3 className="font-bold text-sm">سن بدهی مشتریان</h3>
          <p className="text-xs text-gray-500 mt-1">بدهی‌ها به تفکیک ۳۰-۶۰-۹۰ روز</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-300 cursor-pointer transition">
          <div className="text-2xl mb-2">💰</div>
          <h3 className="font-bold text-sm">جریان نقدی</h3>
          <p className="text-xs text-gray-500 mt-1">ورودی و خروجی وجوه در بازه زمانی</p>
        </div>
      </div>
    </div>
  );
}
