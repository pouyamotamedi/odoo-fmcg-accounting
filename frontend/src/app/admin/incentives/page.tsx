'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import JalaliDatePicker from '@/components/JalaliDatePicker';
import {
  create, getCurrentIncentiveDashboard, getIncentiveManagerData,
  requestHubbleiumReward, saveIncentiveConfiguration, swapIncentiveShifts,
  write, unlink,
} from '@/lib/odoo-api';
import { formatPrice, formatTehranJalaliDate, toPersianDigits } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

const DAYS = [
  { value: '5', label: 'شنبه' }, { value: '6', label: 'یکشنبه' },
  { value: '0', label: 'دوشنبه' }, { value: '1', label: 'سه‌شنبه' },
  { value: '2', label: 'چهارشنبه' }, { value: '3', label: 'پنجشنبه' },
  { value: '4', label: 'جمعه' },
];
type Tab = 'dashboard' | 'settings' | 'shifts' | 'adjustments' | 'rewards';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'خطای ناشناخته';
}

export default function IncentivesPage() {
  const authIsAdmin = useAuthStore(state => state.isAdmin);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [managerData, setManagerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const dash = await getCurrentIncentiveDashboard();
      setDashboard(dash);
      if (dash?.capabilities?.is_manager || authIsAdmin) {
        try { setManagerData(await getIncentiveManagerData()); }
        catch (managerError) { setError(`اطلاعات مدیریتی بارگذاری نشد: ${errorText(managerError)}`); }
      }
    } catch (loadError) {
      setDashboard(null);
      setError(`اتصال به ماژول پورسانت برقرار نشد: ${errorText(loadError)}`);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [authIsAdmin]);
  const isManager = Boolean(dashboard?.capabilities?.is_manager || managerData);
  const tabs = [
    { key: 'dashboard' as Tab, label: 'داشبورد من' },
    { key: 'settings' as Tab, label: 'تنظیمات', manager: true },
    { key: 'shifts' as Tab, label: 'برنامه شیفت', manager: true },
    { key: 'adjustments' as Tab, label: 'تعدیلات دستی', manager: true },
    { key: 'rewards' as Tab, label: 'جوایز', manager: true },
  ];

  if (loading) return <div className="py-16 text-center text-gray-500">در حال دریافت اطلاعات پورسانت...</div>;
  return <div>
    <div className="flex items-center justify-between mb-5 gap-3">
      <div><h1 className="text-2xl font-bold text-slate-800">🪙 پورسانت و هابلیوم</h1><p className="text-sm text-gray-500">تاریخ‌ها شمسی و محاسبات زمانی براساس تهران است.</p></div>
      <button onClick={() => void load()} className="px-3 py-2 rounded-lg bg-white border text-sm">بازخوانی</button>
    </div>
    {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm"><b>خطا:</b> {error}<div className="mt-1 text-xs">اگر پیام 404 یا Model not found است، اسکریپت به‌روزرسانی سرور را دوباره اجرا کنید تا ماژول Odoo نصب/ارتقا شود.</div></div>}
    {message && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm">{message}</div>}
    <div className="flex gap-2 mb-5 overflow-auto">{tabs.filter(item => !item.manager || isManager).map(item => <button key={item.key} onClick={() => setTab(item.key)} className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${tab === item.key ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'}`}>{item.label}</button>)}</div>
    {tab === 'dashboard' && <Dashboard data={dashboard} reload={load} report={setError} />}
    {tab === 'settings' && isManager && (managerData?.config ? <Settings initial={managerData.config} saved={async () => { setMessage('تنظیمات ذخیره و محاسبات به‌روز شد.'); await load(); }} report={setError} /> : <Empty text="تنظیمات مدیریتی بارگذاری نشده است." />)}
    {tab === 'shifts' && isManager && <Shifts data={managerData} reload={load} report={setError} />}
    {tab === 'adjustments' && isManager && <Adjustments data={managerData} reload={load} report={setError} />}
    {tab === 'rewards' && isManager && <Rewards data={managerData} reload={load} report={setError} />}
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="bg-white border rounded-xl p-8 text-center text-gray-500">{text}</div>; }
function Card({ label, value }: { label: string; value: string }) { return <div className="bg-white rounded-xl border p-4"><div className="text-xl font-bold">{value}</div><div className="text-xs text-gray-500 mt-1">{label}</div></div>; }

function Dashboard({ data, reload, report }: { data: any; reload: () => Promise<void>; report: (value: string) => void }) {
  if (!data) return <Empty text="داشبورد در دسترس نیست؛ خطای بالای صفحه را بررسی کنید." />;
  
  const isSimple = data.capabilities?.simple_dashboard;
  const period = data.period || {};
  const result = data.result || {};
  const percent = period.target_amount ? (period.total_sales || 0) / period.target_amount * 100 : 0;
  
  // Simple dashboard - just show wallet and shifts
  if (isSimple) {
    return (
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Card label="موجودی هابلیوم" value={`${formatPrice(data.wallet?.balance || 0)} H`} />
          <Card label="امتیاز شما" value={`${formatPrice(data.wallet?.balance || 0)} H`} />
        </div>
        <div className="bg-white rounded-xl border overflow-auto">
          <div className="font-bold p-4 border-b">شیفت‌های ماه {period.name}</div>
          {data.shifts?.length ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3">تاریخ</th>
                  <th>شیفت</th>
                  <th>تحقق</th>
                  <th>امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s: any) => (
                  <tr key={s.id} className="border-t text-center">
                    <td className="p-3">{formatTehranJalaliDate(s.shift_date)}</td>
                    <td>{s.shift_type === 'morning' ? 'صبح' : 'عصر'}</td>
                    <td>{toPersianDigits((s.achievement_percent || 0).toFixed(1))}٪</td>
                    <td>{s.hubbleium_awarded || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-gray-400">هنوز شیفتی برای شما تعریف نشده است.</div>
          )}
        </div>
      </div>
    );
  }
  
  // Full dashboard
  return <div className="space-y-5">
    <div className="grid sm:grid-cols-4 gap-3"><Card label="هدف تیم" value={`${formatPrice(period.target_amount)} تومان`} /><Card label="فروش تیم" value={`${formatPrice(period.total_sales)} تومان`} /><Card label="پورسانت تخمینی من" value={`${formatPrice(result.final_commission || 0)} تومان`} /><Card label="موجودی هابلیوم" value={`${formatPrice(data.wallet?.balance || 0)} H`} /></div>
    <div className="bg-white rounded-xl border p-5"><div className="flex justify-between text-sm mb-2"><span>پیشرفت ماه {toPersianDigits(period.name || '')}</span><b>{toPersianDigits(percent.toFixed(1))}٪</b></div><div className="h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{width:`${Math.min(percent,100)}%`}} /></div><div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm"><div>هدف شخصی: <b>{formatPrice(result.personal_target || 0)}</b></div><div>فروش شیفت‌ها: <b>{formatPrice(result.actual_sales || 0)}</b></div><div>تحقق: <b>{toPersianDigits((result.achievement_percent || 0).toFixed(1))}٪</b></div></div></div>
    <div className="bg-white rounded-xl border overflow-auto"><div className="font-bold p-4 border-b">شیفت‌های من</div>{data.shifts?.length ? <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3">تاریخ</th><th>شیفت</th><th>هدف</th><th>فروش</th><th>تحقق</th><th>H</th></tr></thead><tbody>{data.shifts.map((s:any)=><tr key={s.id} className="border-t text-center"><td className="p-3">{formatTehranJalaliDate(s.shift_date)}</td><td>{s.shift_type==='morning'?'صبح':'عصر'}</td><td>{formatPrice(s.target_amount)}</td><td>{formatPrice(s.actual_sales)}</td><td>{toPersianDigits((s.achievement_percent||0).toFixed(1))}٪</td><td>{formatPrice(s.hubbleium_awarded)}</td></tr>)}</tbody></table>:<div className="p-6 text-center text-gray-400">هنوز شیفتی برای شما تعریف نشده است.</div>}</div>
    <div className="bg-white rounded-xl border p-5"><div className="font-bold mb-3">فروشگاه جایزه</div><div className="grid sm:grid-cols-3 gap-3">{(data.rewards||[]).map((r:any)=><div key={r.id} className="border rounded-xl p-4"><b>{r.name}</b><div className="text-indigo-600 my-2">{formatPrice(r.cost)} H</div><Action label="درخواست جایزه" onClick={async()=>{try{await requestHubbleiumReward(r.id);await reload();}catch(e){report(errorText(e));}}}/></div>)}</div></div>
  </div>;
}

function Action({label,onClick,disabled=false}:{label:string;onClick:()=>Promise<void>;disabled?:boolean}) { const [busy,setBusy]=useState(false);return <button disabled={disabled||busy} onClick={async()=>{setBusy(true);try{await onClick();}finally{setBusy(false);}}} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-40">{busy?'در حال انجام...':label}</button>; }
function Field({label,value,onChange,step='1'}:{label:string;value:any;onChange:(v:string)=>void;step?:string}) {return <label className="text-xs text-gray-500"><span className="block mb-1">{label}</span><input type="number" step={step} value={value??''} onChange={e=>onChange(e.target.value)} className="w-full border rounded-lg p-2 text-slate-800"/></label>;}

function Settings({initial,saved,report}:{initial:any;saved:()=>Promise<void>;report:(v:string)=>void}) { const [config,setConfig]=useState(structuredClone(initial)); const weight=(d:string,s:string)=>config.weights.find((r:any)=>String(r.weekday)===d&&r.shift_type===s)?.weight??1; return <div className="space-y-5"><div className="bg-white rounded-xl border p-5 grid sm:grid-cols-3 gap-4"><Field label="هدف ماهانه" value={config.monthly_target} onChange={v=>setConfig({...config,monthly_target:Number(v)})}/><Field label="شروع صبح" value={config.morning_start} step="0.25" onChange={v=>setConfig({...config,morning_start:Number(v)})}/><Field label="پایان صبح" value={config.morning_end} step="0.25" onChange={v=>setConfig({...config,morning_end:Number(v)})}/><Field label="شروع عصر" value={config.evening_start} step="0.25" onChange={v=>setConfig({...config,evening_start:Number(v)})}/><Field label="پایان عصر" value={config.evening_end} step="0.25" onChange={v=>setConfig({...config,evening_end:Number(v)})}/></div><div className="bg-white rounded-xl border p-5"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={config.simple_dashboard||false} onChange={e=>setConfig({...config,simple_dashboard:e.target.checked})} className="w-5 h-5"/><div><div className="font-bold">داشبورد ساده برای فروشنده‌ها</div><div className="text-sm text-gray-500">اگر فعال باشد، فروشنده‌ها فقط موجودی هابلیوم و شیفت‌های خود را می‌بینند</div></div></label></div><div className="bg-white rounded-xl border overflow-hidden"><div className="p-4 font-bold">وزن شیفت‌ها</div><table className="w-full text-sm"><thead><tr><th>روز</th><th>صبح</th><th>عصر</th></tr></thead><tbody>{DAYS.map(d=><tr key={d.value} className="border-t"><td className="p-3">{d.label}</td>{['morning','evening'].map(s=><td key={s} className="p-2"><input type="number" step="0.01" value={weight(d.value,s)} onChange={e=>setConfig({...config,weights:config.weights.map((r:any)=>String(r.weekday)===d.value&&r.shift_type===s?{...r,weight:Number(e.target.value)}:r)})} className="w-28 border rounded p-2"/></td>)}</tr>)}</tbody></table></div><div className="bg-white rounded-xl border p-5"><b>پلکان‌های پورسانت</b>{config.tiers.map((t:any,i:number)=><div key={i} className="grid grid-cols-3 gap-3 mt-3"><Field label="از درصد" value={t.from_percent} onChange={v=>{const a=[...config.tiers];a[i]={...t,from_percent:Number(v)};setConfig({...config,tiers:a});}}/><Field label="تا درصد؛ صفر یعنی باز" value={t.to_percent} onChange={v=>{const a=[...config.tiers];a[i]={...t,to_percent:Number(v)};setConfig({...config,tiers:a});}}/><Field label="درصد پورسانت" value={t.rate} onChange={v=>{const a=[...config.tiers];a[i]={...t,rate:Number(v)};setConfig({...config,tiers:a});}}/></div>)}</div><Action label="ذخیره تنظیمات" onClick={async()=>{try{await saveIncentiveConfiguration(config);await saved();}catch(e){report(errorText(e));throw e;}}}/></div>; }

function Shifts({data,reload,report}:{data:any;reload:()=>Promise<void>;report:(v:string)=>void}) {
  const shifts = data?.shifts || [];
  const sellers = data?.sellers || [];
  const config = data?.config || {};
  const period = data?.period || {};
  
  // Get shift type for a specific date (considering custom times)
  const getShiftTypeForDate = (date: Date, shiftType: 'morning' | 'evening'): string => {
    return shiftType; // Just return the type, UI will show both options
  };
  
  // Get default times from config
  const defaultMorningStart = config.morning_start || 8;
  const defaultMorningEnd = config.morning_end || 15;
  const defaultEveningStart = config.evening_start || 15;
  const defaultEveningEnd = config.evening_end || 24;
  
  // Get days in month from period - use local Tehran time
  const getDaysInMonth = (from: string, to: string) => {
    const days: string[] = [];
    const [startY, startM, startD] = from.split('-').map(Number);
    const [endY, endM, endD] = to.split('-').map(Number);
    
    const current = new Date(startY, startM - 1, startD);
    const end = new Date(endY, endM - 1, endD);
    
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      days.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
    return days;
  };
  
  const dateStrings = period.date_from && period.date_to 
    ? getDaysInMonth(period.date_from, period.date_to)
    : [];
  
  // Build shift map for quick lookup
  const shiftMap = new Map();
  shifts.forEach((s: any) => {
    const key = `${s.shift_date}-${s.shift_type}`;
    shiftMap.set(key, s);
  });
  
  // Save shift handler with time
  const saveShift = async (date: string, shiftType: string, sellerId: number, customStart?: number, customEnd?: number) => {
    const key = `${date}-${shiftType}`;
    const existing = shiftMap.get(key);
    
    try {
      if (existing?.id) {
        if (sellerId) {
          const updateVals: any = { seller_id: sellerId };
          if (customStart !== undefined) {
            updateVals.custom_start = customStart;
            updateVals.custom_end = customEnd;
          }
          await write('fmcg.incentive.shift', [existing.id], updateVals);
        } else {
          await unlink('fmcg.incentive.shift', [existing.id]);
        }
      } else if (sellerId) {
        const createVals: any = {
          shift_date: date,
          shift_type: shiftType,
          seller_id: sellerId,
        };
        if (customStart !== undefined) {
          createVals.custom_start = customStart;
          createVals.custom_end = customEnd;
        }
        await create('fmcg.incentive.shift', createVals);
      }
      await reload();
    } catch (e) {
      report(errorText(e));
    }
  };
  
  const getDayName = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const names = ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه', 'یکشنبه'];
    return names[date.getDay()];
  };
  
  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  };
  
  // State for custom time editing
  const [editingTime, setEditingTime] = useState<{date: string, type: string} | null>(null);
  const [customStart, setCustomStart] = useState(8);
  const [customEnd, setCustomEnd] = useState(15);

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl overflow-auto">
        <div className="p-4 font-bold border-b">برنامه شیفت‌های ماه {period.name}</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-right">تاریخ</th>
              <th className="p-2">روز</th>
              <th className="p-2">صبح (ساعت)</th>
              <th className="p-2">فروشنده صبح</th>
              <th className="p-2">هدف صبح</th>
              <th className="p-2">عصر (ساعت)</th>
              <th className="p-2">فروشنده عصر</th>
              <th className="p-2">هدف عصر</th>
            </tr>
          </thead>
          <tbody>
            {dateStrings.map((dateStr) => {
              const morningShift = shiftMap.get(`${dateStr}-morning`);
              const eveningShift = shiftMap.get(`${dateStr}-evening`);
              const isEditingMorning = editingTime?.date === dateStr && editingTime?.type === 'morning';
              const isEditingEvening = editingTime?.date === dateStr && editingTime?.type === 'evening';
              
              return (
                <tr key={dateStr} className="border-t">
                  <td className="p-2">{formatTehranJalaliDate(dateStr)}</td>
                  <td className="p-2 text-gray-500">{getDayName(dateStr)}</td>
                  <td className="p-2">
                    {morningShift?.custom_start ? (
                      <button
                        onClick={() => {
                          setEditingTime({ date: dateStr, type: 'morning' });
                          setCustomStart(morningShift.custom_start || defaultMorningStart);
                          setCustomEnd(morningShift.custom_end || defaultMorningEnd);
                        }}
                        className="text-xs bg-yellow-100 px-2 py-1 rounded"
                      >
                        {formatTime(morningShift.custom_start)}-{formatTime(morningShift.custom_end)}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTime({ date: dateStr, type: 'morning' });
                          setCustomStart(defaultMorningStart);
                          setCustomEnd(defaultMorningEnd);
                        }}
                        className="text-xs text-gray-500 hover:text-indigo-600"
                      >
                        {formatTime(defaultMorningStart)}-{formatTime(defaultMorningEnd)}
                      </button>
                    )}
                  </td>
                  <td className="p-2">
                    <select
                      value={morningShift?.seller_id?.[0] || ''}
                      onChange={(e) => saveShift(dateStr, 'morning', Number(e.target.value))}
                      className="border rounded p-1 w-full"
                    >
                      <option value="">-</option>
                      {sellers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-center text-xs">
                    {morningShift?.target_amount ? formatPrice(morningShift.target_amount) : '-'}
                  </td>
                  <td className="p-2">
                    {eveningShift?.custom_start ? (
                      <button
                        onClick={() => {
                          setEditingTime({ date: dateStr, type: 'evening' });
                          setCustomStart(eveningShift.custom_start || defaultEveningStart);
                          setCustomEnd(eveningShift.custom_end || defaultEveningEnd);
                        }}
                        className="text-xs bg-yellow-100 px-2 py-1 rounded"
                      >
                        {formatTime(eveningShift.custom_start)}-{formatTime(eveningShift.custom_end)}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTime({ date: dateStr, type: 'evening' });
                          setCustomStart(defaultEveningStart);
                          setCustomEnd(defaultEveningEnd);
                        }}
                        className="text-xs text-gray-500 hover:text-indigo-600"
                      >
                        {formatTime(defaultEveningStart)}-{formatTime(defaultEveningEnd)}
                      </button>
                    )}
                  </td>
                  <td className="p-2">
                    <select
                      value={eveningShift?.seller_id?.[0] || ''}
                      onChange={(e) => saveShift(dateStr, 'evening', Number(e.target.value))}
                      className="border rounded p-1 w-full"
                    >
                      <option value="">-</option>
                      {sellers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-center text-xs">
                    {eveningShift?.target_amount ? formatPrice(eveningShift.target_amount) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {dateStrings.length === 0 && <Empty text="اطلاعات دوره مالی موجود نیست." />}
      </div>
      
      {/* Custom Time Modal */}
      {editingTime && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h3 className="font-bold mb-4">تنظیم ساعت شیفت</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">ساعت شروع</label>
                <input
                  type="number"
                  value={customStart}
                  onChange={(e) => setCustomStart(Number(e.target.value))}
                  className="w-full border rounded p-2"
                  min="0"
                  max="24"
                  step="0.5"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500">ساعت پایان</label>
                <input
                  type="number"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(Number(e.target.value))}
                  className="w-full border rounded p-2"
                  min="0"
                  max="24"
                  step="0.5"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditingTime(null)}
                className="flex-1 px-4 py-2 border rounded-lg"
              >
                انصراف
              </button>
              <button
                onClick={async () => {
                  const currentShift = editingTime.type === 'morning' 
                    ? shiftMap.get(`${editingTime.date}-morning`)
                    : shiftMap.get(`${editingTime.date}-evening`);
                  await saveShift(editingTime.date, editingTime.type, currentShift?.seller_id?.[0] || 0, customStart, customEnd);
                  setEditingTime(null);
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Adjustments({data,reload,report}:{data:any;reload:()=>Promise<void>;report:(v:string)=>void}) {const [seller,setSeller]=useState(0),[type,setType]=useState('commission'),[amount,setAmount]=useState(''),[reason,setReason]=useState('');return <div className="bg-white border rounded-xl p-5"><b className="block mb-4">افزایش یا کاهش دستی</b><div className="grid sm:grid-cols-2 gap-3"><select value={seller} onChange={e=>setSeller(Number(e.target.value))} className="border rounded p-2"><option value={0}>فروشنده</option>{(data?.sellers||[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={type} onChange={e=>setType(e.target.value)} className="border rounded p-2"><option value="commission">پورسانت</option><option value="hubbleium">هابلیوم</option></select><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مقدار؛ منفی برای کاهش" className="border rounded p-2"/><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="دلیل الزامی" className="border rounded p-2"/></div><div className="mt-4"><Action disabled={!seller||!data?.period?.id||!Number(amount)||!reason.trim()} label="ثبت تعدیل" onClick={async()=>{try{await create('fmcg.incentive.adjustment',{seller_id:seller,period_id:data.period.id,adjustment_type:type,amount:Number(amount),reason});setAmount('');setReason('');await reload();}catch(e){report(errorText(e));throw e;}}}/></div></div>;}

function Rewards({data,reload,report}:{data:any;reload:()=>Promise<void>;report:(v:string)=>void}) {const [name,setName]=useState(''),[cost,setCost]=useState(''),[stock,setStock]=useState('');return <div className="space-y-4"><div className="bg-white border rounded-xl p-4 grid sm:grid-cols-4 gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="نام جایزه" className="border rounded p-2"/><input type="number" value={cost} onChange={e=>setCost(e.target.value)} placeholder="قیمت H" className="border rounded p-2"/><input type="number" value={stock} onChange={e=>setStock(e.target.value)} placeholder="موجودی" className="border rounded p-2"/><Action disabled={!name.trim()||Number(cost)<=0} label="افزودن جایزه" onClick={async()=>{try{await create('fmcg.reward',{name,cost:Number(cost),stock_qty:Number(stock||0)});setName('');setCost('');setStock('');await reload();}catch(e){report(errorText(e));throw e;}}}/></div><div className="grid sm:grid-cols-3 gap-3">{(data?.rewards||[]).map((r:any)=><div key={r.id} className="bg-white border rounded-xl p-4"><b>{r.name}</b><div className="text-indigo-600">{formatPrice(r.cost)} H</div><div className="text-xs text-gray-500">موجودی: {formatPrice(r.stock_qty)}</div></div>)}</div></div>;}
