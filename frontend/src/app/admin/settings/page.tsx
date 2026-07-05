'use client';

import { useState, useEffect } from 'react';
import { getCompanySettings, updateCompanySettings, changePassword, searchRead, write } from '@/lib/odoo-api';
import { useCompanyStore } from '@/stores/company-store';
import Link from 'next/link';

export default function SettingsPage() {
  const [companyId, setCompanyId] = useState<number>(0);
  const [name, setName] = useState('');
  const [paxEnabled, setPaxEnabled] = useState(false);
  const [paxIp, setPaxIp] = useState('');
  const [paxPort, setPaxPort] = useState('10009');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const { setCompany } = useCompanyStore();
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [taxRate, setTaxRate] = useState('9');

  useEffect(() => {
    async function load() {
      try {
        const data = await getCompanySettings();
        if (data) {
          setCompanyId(data.id);
          setName(data.name || '');
          setPaxEnabled(data.fmcg_pos_terminal_enabled || false);
          setPaxIp(data.fmcg_pax_terminal_ip || '');
          setPaxPort(String(data.fmcg_pax_terminal_port || 10009));
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await updateCompanySettings(companyId, {
        name,
        fmcg_pos_terminal_enabled: paxEnabled,
        fmcg_pax_terminal_ip: paxIp || false,
        fmcg_pax_terminal_port: parseInt(paxPort) || 10009,
      });
      setCompany(companyId, name);
      setMsg('✅ تنظیمات ذخیره شد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      alert(e.message || 'خطا در ذخیره');
    }
    setSaving(false);
  }

  async function handleChangePassword() {
    if (!newPassword) { alert('رمز جدید را وارد کنید'); return; }
    setSaving(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setMsg('✅ رمز عبور تغییر کرد');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      alert(e.message || 'خطا در تغییر رمز');
    }
    setSaving(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">تنظیمات</h1>
          <p className="text-gray-500 text-sm">تنظیمات فروشگاه و دستگاه کارتخوان PAX S800</p>
        </div>
        {msg && <span className="text-sm bg-green-500 text-white px-3 py-1.5 rounded-lg">{msg}</span>}
      </div>

      {/* Connection Status */}
      <div className={`mb-6 p-3 rounded-lg text-sm font-bold ${connected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {connected ? '🟢 اتصال به Odoo برقرار است' : '🔴 اتصال به Odoo برقرار نیست'}
      </div>

      <div className="space-y-6">
        {/* Company */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">اطلاعات فروشگاه</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">نام فروشگاه</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full max-w-sm p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
          </div>
        </div>

        {/* Tax Settings */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">💰 تنظیمات مالیات</h3>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm">فعال‌سازی مالیات بر ارزش افزوده</span>
          </label>
          {taxEnabled && (
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نرخ مالیات (%)</label>
                <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="9" className="w-24 p-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <button onClick={async () => {
                try {
                  // Find sale tax and update or disable
                  const taxes = await searchRead('account.tax', [['type_tax_use','=','sale']], ['id','amount'], 5);
                  if (taxes && taxes.length > 0) {
                    for (const tax of taxes) {
                      await write('account.tax', [tax.id], { amount: parseFloat(taxRate) || 0, active: taxEnabled });
                    }
                  }
                  const purchaseTaxes = await searchRead('account.tax', [['type_tax_use','=','purchase']], ['id'], 5);
                  if (purchaseTaxes && purchaseTaxes.length > 0) {
                    for (const tax of purchaseTaxes) {
                      await write('account.tax', [tax.id], { amount: parseFloat(taxRate) || 0, active: taxEnabled });
                    }
                  }
                  setMsg('✅ مالیات بروز شد');
                  setTimeout(() => setMsg(''), 3000);
                } catch(e:any) { alert(e.message || 'خطا'); }
              }} className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600">
                اعمال تغییرات مالیات
              </button>
            </div>
          )}
          {!taxEnabled && (
            <button onClick={async () => {
              try {
                const taxes = await searchRead('account.tax', [], ['id'], 20);
                if (taxes && taxes.length > 0) {
                  for (const tax of taxes) { await write('account.tax', [tax.id], { active: false }); }
                }
                setMsg('✅ مالیات غیرفعال شد');
                setTimeout(() => setMsg(''), 3000);
              } catch(e:any) { alert(e.message || 'خطا'); }
            }} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600">
              غیرفعال کردن همه مالیات‌ها
            </button>
          )}
        </div>

        {/* PAX Terminal */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">💳 دستگاه کارتخوان (PAX S800)</h3>
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={paxEnabled} onChange={(e) => setPaxEnabled(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm">فعال‌سازی ارسال خودکار مبلغ به کارتخوان</span>
          </label>
          {paxEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">آدرس IP دستگاه</label>
                <input type="text" value={paxIp} onChange={(e) => setPaxIp(e.target.value)} placeholder="192.168.1.50" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">پورت TCP</label>
                <input type="text" value={paxPort} onChange={(e) => setPaxPort(e.target.value)} placeholder="10009" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
              </div>
              <p className="col-span-2 text-[11px] text-gray-400">
                دستگاه PAX S800 باید در شبکه محلی باشد و ECR mode (TCP/IP) فعال باشد. پورت پیش‌فرض: ۱۰۰۰۹
              </p>
            </div>
          )}
        </div>

        {/* Password */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">🔑 تغییر رمز عبور مدیر</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1 max-w-sm">
              <label className="block text-xs text-gray-500 mb-1">رمز جدید</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <button onClick={handleChangePassword} disabled={saving} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50">
              تغییر رمز
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={handleSave} disabled={saving} className="bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition disabled:opacity-50">
            {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
          </button>
          <Link href="/onboarding" className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 transition">
            🔄 اجرای مجدد راه‌اندازی
          </Link>
        </div>
      </div>
    </div>
  );
}
