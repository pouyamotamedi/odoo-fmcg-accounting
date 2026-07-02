'use client';

export default function ReturnsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">برگشت از فروش</h1>
      <p className="text-gray-500 text-sm mb-6">ثبت مرجوعی کالا و بازگشت وجه</p>
      
      <button className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">
        + ثبت برگشت
      </button>

      <div className="mt-6 bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
        <div className="text-4xl mb-3">↩️</div>
        <p>هنوز برگشتی ثبت نشده</p>
      </div>
    </div>
  );
}
