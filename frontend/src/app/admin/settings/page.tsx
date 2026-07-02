'use client';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">تنظیمات</h1>
      <p className="text-gray-500 text-sm mb-6">تنظیمات فروشگاه، واحد پول و دستگاه کارتخوان</p>
      
      <div className="space-y-6">
        {/* Company Info */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">اطلاعات فروشگاه</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">نام فروشگاه</label>
              <input type="text" defaultValue="فروشگاه من" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">واحد پول</label>
              <select className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option>تومان (IRT)</option>
                <option>ریال (IRR)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">شروع سال مالی</label>
              <select className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option>فروردین</option>
                <option>مهر</option>
              </select>
            </div>
          </div>
        </div>

        {/* POS Terminal */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">دستگاه کارتخوان</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">پروتکل</label>
              <select className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option>Serial (RS232)</option>
                <option>TCP/IP</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">پورت</label>
              <input type="text" placeholder="COM3" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        <button className="bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition">
          ذخیره تنظیمات
        </button>
      </div>
    </div>
  );
}
