'use client';

import { useState, useEffect } from 'react';
import { getCompanySettings, updateCompanySettings, changePassword, searchRead, write, getBankCashBalances } from '@/lib/odoo-api';
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
  // POS journal settings
  const [journals, setJournals] = useState<{id:number;name:string;type:string}[]>([]);
  const [posCashJournal, setPosCashJournal] = useState<number>(0);
  const [posCardJournal, setPosCardJournal] = useState<number>(0);
  const [posCreditJournal, setPosCreditJournal] = useState<number>(0);

  useEffect(() => {
    async function load() {
      try {
        const [data, jrnls] = await Promise.all([getCompanySettings(), getBankCashBalances()]);
        if (data) {
          setCompanyId(data.id);
          setName(data.name || '');
          setPaxEnabled(data.fmcg_pos_terminal_enabled || false);
          setPaxIp(data.fmcg_pax_terminal_ip || '');
          setPaxPort(String(data.fmcg_pax_terminal_port || 10009));
        }
        setJournals((jrnls || []).map((j: any) => ({ id: j.id, name: j.name, type: j.type })));
        // Load tax status from Odoo
        try {
          const taxes = await searchRead('account.tax', [['type_tax_use', '=', 'sale'], ['active', 'in', [true, false]]], ['active', 'amount'], 1);
          if (taxes && taxes.length > 0) {
            setTaxEnabled(taxes[0].active);
            setTaxRate(String(taxes[0].amount || 9));
          } else {
            setTaxEnabled(false);
          }
        } catch { setTaxEnabled(false); }
        // Load POS journal settings from localStorage
        try {
          const saved = localStorage.getItem('pos_journal_settings');
          if (saved) {
            const s = JSON.parse(saved);
            setPosCashJournal(s.cash || 0);
            setPosCardJournal(s.card || 0);
            setPosCreditJournal(s.credit || 0);
          }
        } catch {}
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
            <input type="checkbox" checked={taxEnabled} onChange={async (e) => {
              const newVal = e.target.checked;
              setTaxEnabled(newVal);
              // Auto-save tax status
              try {
                const taxes = await searchRead('account.tax', [['type_tax_use', 'in', ['sale', 'purchase']], ['active', 'in', [true, false]]], ['id'], 20);
                if (taxes && taxes.length > 0) {
                  for (const tax of taxes) { await write('account.tax', [tax.id], { active: newVal }); }
                }
                setMsg(newVal ? '✅ مالیات فعال شد' : '✅ مالیات غیرفعال شد');
                setTimeout(() => setMsg(''), 3000);
              } catch {}
            }} className="w-4 h-4 rounded" />
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
          <h3 className="font-bold text-sm mb-4">🏦 حساب‌های صندوق فروش</h3>
          <p className="text-xs text-gray-500 mb-3">مشخص کنید پرداخت‌های صندوق به کدام حساب بانکی/صندوق وصل شود</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">💵 نقد → صندوق</label>
              <select value={posCashJournal} onChange={(e) => setPosCashJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option value={0}>— اولین صندوق —</option>
                {journals.filter(j=>j.type==='cash').map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">💳 کارت → بانک</label>
              <select value={posCardJournal} onChange={(e) => setPosCardJournal(Number(e.target.value))} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                <option value={0}>— اولین بانک —</option>
                {journals.filter(j=>j.type==='bank').map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">نسیه/اعتباری نیازی به تنظیم ندارد — خودکار به حساب مشتری ثبت می‌شود.</p>
          <button onClick={() => {
            localStorage.setItem('pos_journal_settings', JSON.stringify({cash: posCashJournal, card: posCardJournal, credit: posCreditJournal}));
            setMsg('✅ تنظیمات صندوق ذخیره شد');
            setTimeout(() => setMsg(''), 3000);
          }} className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">ذخیره تنظیمات صندوق</button>
        </div>

        {/* Password - actual */}
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

        {/* Backup & Restore */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">📦 پشتیبان‌گیری و بازگردانی</h3>
          <BackupRestore />
        </div>

        {/* System Update */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">🔄 بروزرسانی سیستم</h3>
          <div className="flex gap-3 flex-wrap">
            <button onClick={async () => {
              if (!confirm('بروزرسانی سیستم از GitHub؟\n\nاین عملیات:\n- آخرین تغییرات کد را دریافت میکند\n- ماژول‌ها را بروز میکند\n- فرانت‌اند را بازسازی میکند\n\nداده‌ها آسیب نمیبینند.')) return;
              setMsg('🔄 در حال بروزرسانی...');
              try {
                const res = await fetch('/api/system/update', { method: 'POST' });
                const data = await res.json();
                if (data.success) { setMsg('✅ بروزرسانی انجام شد. صفحه را رفرش کنید.'); }
                else { setMsg('❌ خطا: ' + (data.error || 'ناشناخته')); }
              } catch { setMsg('❌ API بروزرسانی در دسترس نیست (فقط روی سرور کار میکند)'); }
              setTimeout(() => setMsg(''), 5000);
            }} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600">
              🔄 بروزرسانی از GitHub
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">بکاپ خودکار: هر روز ساعت ۳ صبح (در صورت فعال بودن cron روی سرور)</p>
        </div>

        {/* Seller Menu Access Control */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-bold text-sm mb-4">🔐 دسترسی فروشنده‌ها به منوها</h3>
          <p className="text-xs text-gray-500 mb-4">مشخص کنید فروشنده‌ها به کدام منوهای پنل مدیریت دسترسی داشته باشند. فروشنده‌ها فقط از طریق صندوق فروش وارد می‌شوند.</p>
          <SellerMenuAccess />
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


function SellerMenuAccess() {
  const allMenus = [
    { key: 'dashboard', label: 'داشبورد' },
    { key: 'purchase', label: 'فاکتور خرید' },
    { key: 'inventory', label: 'انبار و کالاها' },
    { key: 'people', label: 'اشخاص' },
    { key: 'accounts', label: 'حساب اشخاص' },
    { key: 'treasury', label: 'بانک و صندوق' },
    { key: 'reconciliation', label: 'مغایرت‌گیری' },
    { key: 'accounting', label: 'اسناد حسابداری' },
    { key: 'chart-of-accounts', label: 'سرفصل حساب‌ها' },
    { key: 'reports', label: 'گزارش‌ها' },
    { key: 'analytics', label: 'تحلیل مدیریتی' },
    { key: 'returns', label: 'برگشت از فروش' },
    { key: 'discounts', label: 'تخفیفات' },
    { key: 'stock-count', label: 'انبارگردانی' },
    { key: 'fiscal-year', label: 'سال مالی' },
    { key: 'settings', label: 'تنظیمات' },
  ];

  const [allowed, setAllowed] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('seller_allowed_menus');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  function toggle(key: string) {
    setAllowed(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem('seller_allowed_menus', JSON.stringify(next));
      return next;
    });
  }

  const noneSelected = allowed.length === 0;

  return (
    <div>
      <p className="text-[11px] text-amber-600 mb-3">
        {noneSelected ? '⚠️ هیچ منویی انتخاب نشده — فروشنده‌ها فقط به صندوق فروش دسترسی دارند.' : `✅ ${allowed.length} منو فعال برای فروشنده‌ها`}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {allMenus.map(menu => (
          <label key={menu.key} className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={allowed.includes(menu.key)}
              onChange={() => toggle(menu.key)}
              className="w-3.5 h-3.5 rounded"
            />
            <span>{menu.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}


function BackupRestore() {
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStatus, setBackupStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [restoreMsg, setRestoreMsg] = useState('');

  const ODOO_URL = '/api';
  const DB_NAME = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';
  const MASTER_PWD = 'admin'; // Odoo database manager password

  async function handleBackup() {
    if (!confirm('پشتیبان‌گیری از دیتابیس؟\n\nیک فایل ZIP شامل کل اطلاعات دانلود می‌شود.')) return;
    
    setBackupStatus('working');
    setBackupProgress(10);
    setBackupMsg('در حال آماده‌سازی...');

    try {
      setBackupProgress(30);
      setBackupMsg('در حال ایجاد بکاپ...');

      // Odoo's database backup endpoint
      const formData = new FormData();
      formData.append('master_pwd', MASTER_PWD);
      formData.append('name', DB_NAME);
      formData.append('backup_format', 'zip');

      const response = await fetch(`${ODOO_URL}/web/database/backup`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setBackupProgress(70);
      setBackupMsg('در حال دانلود...');

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.includes('Access Denied') ? 'رمز مدیریت دیتابیس اشتباه است' : `خطا: ${response.status}`);
      }

      // Check content type - if HTML, it's an error page
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('html')) {
        const text = await response.text();
        throw new Error(text.includes('Access Denied') ? 'رمز مدیریت دیتابیس اشتباه است' : 'خطا در ایجاد بکاپ');
      }

      setBackupProgress(90);
      const blob = await response.blob();
      
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      a.href = url;
      a.download = `backup_${DB_NAME}_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupProgress(100);
      setBackupStatus('done');
      setBackupMsg(`✅ بکاپ دانلود شد (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e: any) {
      setBackupStatus('error');
      setBackupMsg(`❌ ${e.message || 'خطا در پشتیبان‌گیری'}`);
    }
    setTimeout(() => { setBackupStatus('idle'); setBackupProgress(0); setBackupMsg(''); }, 8000);
  }

  async function handleRestore() {
    if (!restoreFile) { alert('فایل بکاپ را انتخاب کنید'); return; }
    if (!confirm(`بازگردانی دیتابیس "${DB_NAME}" از فایل "${restoreFile.name}"؟\n\n⚠️ تمام اطلاعات فعلی با اطلاعات فایل بکاپ جایگزین می‌شود!\n\nاین عمل غیرقابل بازگشت است.`)) return;

    setRestoreStatus('working');
    setRestoreProgress(10);
    setRestoreMsg('در حال آپلود فایل...');

    try {
      setRestoreProgress(30);

      // First drop existing database, then restore
      // Odoo restore endpoint needs the DB to not exist, so we use a temp name and swap
      const formData = new FormData();
      formData.append('master_pwd', MASTER_PWD);
      formData.append('backup_file', restoreFile);
      formData.append('name', DB_NAME);
      formData.append('copy', 'true'); // copy=true means it can overwrite

      setRestoreProgress(50);
      setRestoreMsg('در حال بازگردانی...');

      const response = await fetch(`${ODOO_URL}/web/database/restore`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setRestoreProgress(80);

      const text = await response.text();
      if (text.includes('error') || text.includes('Error') || text.includes('Access Denied')) {
        if (text.includes('already exists')) {
          throw new Error('دیتابیس با این نام وجود دارد. ابتدا باید حذف شود.');
        }
        if (text.includes('Access Denied')) {
          throw new Error('رمز مدیریت دیتابیس اشتباه است');
        }
        throw new Error('خطا در بازگردانی — ممکن است فرمت فایل اشتباه باشد');
      }

      setRestoreProgress(100);
      setRestoreStatus('done');
      setRestoreMsg('✅ بازگردانی انجام شد! در حال بارگذاری مجدد...');
      setTimeout(() => window.location.reload(), 3000);
    } catch (e: any) {
      setRestoreStatus('error');
      setRestoreMsg(`❌ ${e.message || 'خطا در بازگردانی'}`);
    }
    setTimeout(() => { if (restoreStatus !== 'done') { setRestoreStatus('idle'); setRestoreProgress(0); setRestoreMsg(''); } }, 8000);
  }

  return (
    <div className="space-y-4">
      {/* Backup Section */}
      <div className="border border-green-100 rounded-lg p-4 bg-green-50/30">
        <div className="flex justify-between items-center mb-2">
          <div>
            <div className="text-xs font-bold text-green-800">💾 پشتیبان‌گیری</div>
            <div className="text-[10px] text-green-600">دانلود کامل دیتابیس بصورت فایل ZIP</div>
          </div>
          <button
            onClick={handleBackup}
            disabled={backupStatus === 'working'}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50"
          >
            {backupStatus === 'working' ? '⏳ در حال بکاپ...' : '📦 دانلود بکاپ'}
          </button>
        </div>
        {backupStatus !== 'idle' && (
          <div>
            <div className="w-full h-2 bg-green-100 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${backupProgress}%` }} />
            </div>
            <div className={`text-[10px] mt-1 ${backupStatus === 'error' ? 'text-red-600' : 'text-green-700'}`}>{backupMsg}</div>
          </div>
        )}
      </div>

      {/* Restore Section */}
      <div className="border border-amber-100 rounded-lg p-4 bg-amber-50/30">
        <div className="text-xs font-bold text-amber-800 mb-1">🔄 بازگردانی</div>
        <div className="text-[10px] text-amber-600 mb-3">آپلود فایل بکاپ ZIP برای جایگزینی اطلاعات فعلی</div>
        <div className="flex gap-3 items-center">
          <label className="flex-1 cursor-pointer">
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="border-2 border-dashed border-amber-300 rounded-lg p-3 text-center hover:border-amber-500 transition">
              {restoreFile ? (
                <span className="text-xs text-amber-700 font-bold">📁 {restoreFile.name} ({(restoreFile.size / 1024 / 1024).toFixed(1)} MB)</span>
              ) : (
                <span className="text-xs text-amber-500">کلیک کنید یا فایل ZIP را بکشید</span>
              )}
            </div>
          </label>
          <button
            onClick={handleRestore}
            disabled={!restoreFile || restoreStatus === 'working'}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
          >
            {restoreStatus === 'working' ? '⏳ بازگردانی...' : '⬆️ بازگردانی'}
          </button>
        </div>
        {restoreStatus !== 'idle' && (
          <div>
            <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${restoreProgress}%` }} />
            </div>
            <div className={`text-[10px] mt-1 ${restoreStatus === 'error' ? 'text-red-600' : 'text-amber-700'}`}>{restoreMsg}</div>
          </div>
        )}
        <p className="text-[9px] text-amber-400 mt-2">⚠️ بازگردانی تمام اطلاعات فعلی را جایگزین می‌کند. ابتدا از وضعیت فعلی بکاپ بگیرید.</p>
      </div>
    </div>
  );
}
