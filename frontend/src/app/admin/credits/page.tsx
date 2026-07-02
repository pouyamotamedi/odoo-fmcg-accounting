'use client';

export default function CreditsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">حساب مشتریان</h1>
      <p className="text-gray-500 text-sm mb-6">بدهی و اعتبار مشتریان</p>
      
      <div className="mt-6 bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
        <div className="text-4xl mb-3">🤝</div>
        <p>هنوز حساب اعتباری ثبت نشده</p>
      </div>
    </div>
  );
}
