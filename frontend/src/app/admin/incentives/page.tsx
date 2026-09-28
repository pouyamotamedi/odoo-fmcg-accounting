'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import {
  create, getCurrentIncentiveDashboard, getIncentiveConfiguration,
  requestHubbleiumReward, saveIncentiveConfiguration, searchRead, swapIncentiveShifts,
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

export default function IncentivesPage() {
  const { isAdmin } = useAuthStore();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const dash = await getCurrentIncentiveDashboard();
      setDashboard(dash);
      if (isAdmin) setConfig(await getIncentiveConfiguration());
    } catch (error: any) {
      setMsg(error?.message || 'خطا در دریافت اطلاعات؛ ماژول Odoo را نصب یا ارتقا دهید.');
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [isAdmin]);

  if (loading) return <div className="py-16 text-center text-gray-400">در حال بارگذاری...</div>;

  const tabs: { key: Tab; label: string; admin?: boolean }[] = [
    { key: 'dashboard', label: 'داشبورد من' },
    { key: 'settings', label: 'تنظیمات', admin: true },
    { key: 'shifts', label: 'برنامه شیفت', admin: true },
    { key: 'adjustments', label: 'تعدیلات دستی', admin: true },
    { key: 'rewards', label: 'جوایز', admin: true },
  ];

  return <div>
    <div className="flex items-center justify-between mb-5">
      <div><h1 className="text-2xl font-bold text-slate-800">🪙 پورسانت و هابلیوم</h1><p className="text-sm text-gray-500">تمام تاریخ‌ها شمسی و زمان‌ها براساس تهران هستند.</p></div>
      {msg && <span className="text-xs bg-indigo-50 text-indigo-700 rounded-lg px-3 py-2">{msg}</span>}
    </div>
    <div className="flex gap-2 mb-5 overflow-auto">
      {tabs.filter(item => !item.admin || isAdmin).map(item => <button key={item.key} onClick={() => setTab(item.key)} className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${tab === item.key ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'}`}>{item.label}</button>)}
    </div>
    {tab === 'dashboard' && <Dashboard data={dashboard} reload={load} />}
    {tab === 'settings' && isAdmin && config && <Settings config={config} onSaved={async text => { setMsg(text); await load(); }} />}
    {tab === 'shifts' && isAdmin && <Shifts period={dashboard?.period} reload={load} />}
    {tab === 'adjustments' && isAdmin && <Adjustments period={dashboard?.period} reload={load} />}
    {tab === 'rewards' && isAdmin && <Rewards reload={load} />}
  </div>;
}

function Dashboard({ data, reload }: { data: any; reload: () => Promise<void> }) {
  if (!data) return <div className="bg-white rounded-xl p-8 text-center">اطلاعاتی وجود ندارد.</div>;
  const period = data.period || {};
  const result = data.result || {};
  const progress = period.target_amount ? Math.min(period.total_sales / period.target_amount * 100, 100) : 0;
  return <div className="space-y-5">
    <div className="grid sm:grid-cols-4 gap-3">
      <Card label="هدف تیم" value={`${formatPrice(period.target_amount)} تومان`} />
      <Card label="فروش تیم" value={`${formatPrice(period.total_sales)} تومان`} />
      <Card label="پورسانت تخمینی من" value={`${formatPrice(result.final_commission || 0)} تومان`} />
      <Card label="موجودی هابلیوم" value={`${formatPrice(data.wallet?.balance || 0)} H`} />
    </div>
    <div className="bg-white rounded-xl border p-5">
      <div className="flex justify-between text-sm mb-2"><span>پیشرفت هدف تیم در ماه {toPersianDigits(period.name || '')}</span><span>{toPersianDigits((period.total_sales / Math.max(period.target_amount || 1, 1) * 100).toFixed(1))}٪</span></div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} /></div>
      {result && <div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm"><div>هدف شخصی: <b>{formatPrice(result.personal_target || 0)}</b></div><div>فروش شیفت‌ها: <b>{formatPrice(result.actual_sales || 0)}</b></div><div>تحقق: <b>{toPersianDigits((result.achievement_percent || 0).toFixed(1))}٪</b></div></div>}
    </div>
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="font-bold p-4 border-b">شیفت‌های من</div>
      <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3 text-right">تاریخ</th><th>شیفت</th><th>هدف</th><th>فروش</th><th>تحقق</th><th>هابلیوم</th></tr></thead><tbody>{(data.shifts || []).map((shift: any) => <tr key={shift.id} className="border-t"><td className="p-3">{formatTehranJalaliDate(shift.shift_date)}</td><td>{shift.shift_type === 'morning' ? 'صبح' : 'عصر'}</td><td>{formatPrice(shift.target_amount)}</td><td>{formatPrice(shift.actual_sales)}</td><td>{toPersianDigits((shift.achievement_percent || 0).toFixed(1))}٪</td><td>{formatPrice(shift.hubbleium_awarded)} H</td></tr>)}</tbody></table>
    </div>
    <div className="bg-white rounded-xl border p-5"><div className="font-bold mb-3">فروشگاه جایزه</div><div className="grid sm:grid-cols-3 gap-3">{(data.rewards || []).map((reward: any) => <div key={reward.id} className="border rounded-xl p-4"><div className="font-bold">{reward.name}</div><div className="text-indigo-600 my-2">{formatPrice(reward.cost)} H</div><button onClick={async () => { await requestHubbleiumReward(reward.id); alert('درخواست جایزه ثبت شد'); await reload(); }} className="w-full bg-indigo-600 text-white rounded-lg py-2 text-xs">درخواست جایزه</button></div>)}</div></div>
  </div>;
}

function Card({ label, value }: { label: string; value: string }) { return <div className="bg-white rounded-xl border p-4"><div className="text-xl font-bold text-slate-800">{value}</div><div className="text-xs text-gray-500 mt-1">{label}</div></div>; }

function Settings({ config: initial, onSaved }: { config: any; onSaved: (text: string) => Promise<void> }) {
  const [config, setConfig] = useState<any>(structuredClone(initial));
  const [saving, setSaving] = useState(false);
  function updateWeight(day: string, shift: string, value: string) {
    setConfig((current: any) => ({ ...current, weights: current.weights.map((row: any) => String(row.weekday) === day && row.shift_type === shift ? { ...row, weight: Number(value) } : row) }));
  }
  function weight(day: string, shift: string) { return config.weights.find((row: any) => String(row.weekday) === day && row.shift_type === shift)?.weight ?? 1; }
  return <div className="space-y-5">
    <div className="bg-white rounded-xl border p-5 grid sm:grid-cols-3 gap-4"><Field label="هدف ماهانه (تومان)" value={config.monthly_target} onChange={(v) => setConfig({ ...config, monthly_target: Number(v) })}/><Field label="شروع صبح" value={config.morning_start} step="0.25" onChange={v => setConfig({ ...config, morning_start: Number(v) })}/><Field label="پایان صبح" value={config.morning_end} step="0.25" onChange={v => setConfig({ ...config, morning_end: Number(v) })}/><Field label="شروع عصر" value={config.evening_start} step="0.25" onChange={v => setConfig({ ...config, evening_start: Number(v) })}/><Field label="پایان عصر" value={config.evening_end} step="0.25" onChange={v => setConfig({ ...config, evening_end: Number(v) })}/></div>
    <div className="bg-white rounded-xl border overflow-hidden"><div className="p-4 font-bold border-b">وزن شیفت‌ها</div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3">روز</th><th>صبح</th><th>عصر</th></tr></thead><tbody>{DAYS.map(day => <tr key={day.value} className="border-t"><td className="p-3">{day.label}</td>{['morning','evening'].map(shift => <td key={shift} className="p-2"><input className="w-28 border rounded p-2" type="number" step="0.01" value={weight(day.value, shift)} onChange={e => updateWeight(day.value, shift, e.target.value)}/></td>)}</tr>)}</tbody></table></div>
    <div className="bg-white rounded-xl border p-5"><div className="font-bold mb-3">پلکان پورسانت از سود ناخالص فروش مازاد</div>{config.tiers.map((tier: any, index: number) => <div key={index} className="grid grid-cols-3 gap-3 mb-2"><Field label="از درصد" value={tier.from_percent} onChange={v => { const tiers=[...config.tiers]; tiers[index]={...tier,from_percent:Number(v)}; setConfig({...config,tiers}); }}/><Field label="تا درصد (صفر=بی‌نهایت)" value={tier.to_percent} onChange={v => { const tiers=[...config.tiers]; tiers[index]={...tier,to_percent:Number(v)}; setConfig({...config,tiers}); }}/><Field label="درصد پورسانت" value={tier.rate} onChange={v => { const tiers=[...config.tiers]; tiers[index]={...tier,rate:Number(v)}; setConfig({...config,tiers}); }}/></div>)}</div>
    <div className="bg-white rounded-xl border p-5"><div className="font-bold mb-3">امتیازهای هابلیوم</div><div className="grid sm:grid-cols-3 gap-3"><Field label="تحقق ۹۰٪" value={config.hubbleium_90} onChange={v=>setConfig({...config,hubbleium_90:Number(v)})}/><Field label="تحقق ۱۰۰٪" value={config.hubbleium_100} onChange={v=>setConfig({...config,hubbleium_100:Number(v)})}/><Field label="تحقق ۱۱۰٪" value={config.hubbleium_110} onChange={v=>setConfig({...config,hubbleium_110:Number(v)})}/><Field label="هدف تیمی روز" value={config.hubbleium_team_day} onChange={v=>setConfig({...config,hubbleium_team_day:Number(v)})}/><Field label="رکورد شخصی" value={config.hubbleium_personal_best} onChange={v=>setConfig({...config,hubbleium_personal_best:Number(v)})}/><Field label="ثبات" value={config.hubbleium_consistency} onChange={v=>setConfig({...config,hubbleium_consistency:Number(v)})}/></div></div>
    <button disabled={saving} onClick={async()=>{setSaving(true); await saveIncentiveConfiguration(config); await onSaved('✅ تنظیمات ذخیره و دوره باز محاسبه شد'); setSaving(false);}} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold">{saving?'ذخیره...':'ذخیره تنظیمات'}</button>
  </div>;
}

function Field({ label, value, onChange, step='1' }: { label:string; value:any; onChange:(value:string)=>void; step?:string }) { return <label className="text-xs text-gray-500"><span className="block mb-1">{label}</span><input type="number" step={step} value={value ?? ''} onChange={e=>onChange(e.target.value)} className="w-full border rounded-lg p-2 text-sm text-slate-800"/></label>; }

function Shifts({ period, reload }: { period:any; reload:()=>Promise<void> }) {
  const [shifts,setShifts]=useState<any[]>([]); const [sellers,setSellers]=useState<any[]>([]); const [first,setFirst]=useState(0); const [second,setSecond]=useState(0);
  async function load(){ if(!period)return; const [s,u]=await Promise.all([searchRead('fmcg.incentive.shift',[['shift_date','>=',period.date_from],['shift_date','<=',period.date_to]],['shift_date','shift_type','seller_id','target_amount','actual_sales','achievement_percent'],0,0,'shift_date, shift_type'),searchRead('res.users',[['active','=',true],['share','=',false]],['name','fmcg_is_seller'],0,0,'name')]); setShifts(s||[]); setSellers(u||[]); }
  useEffect(()=>{void load();},[period?.id]);
  return <div className="space-y-4"><NewShift sellers={sellers} onCreated={async()=>{await load();await reload();}}/><div className="bg-white border rounded-xl p-4"><div className="font-bold mb-3">تعویض دو شیفت</div><div className="flex flex-wrap gap-2"><select className="border rounded p-2" value={first} onChange={e=>setFirst(Number(e.target.value))}><option value={0}>شیفت اول</option>{shifts.map(s=><option key={s.id} value={s.id}>{formatTehranJalaliDate(s.shift_date)} {s.shift_type==='morning'?'صبح':'عصر'} - {s.seller_id?.[1]}</option>)}</select><select className="border rounded p-2" value={second} onChange={e=>setSecond(Number(e.target.value))}><option value={0}>شیفت دوم</option>{shifts.map(s=><option key={s.id} value={s.id}>{formatTehranJalaliDate(s.shift_date)} {s.shift_type==='morning'?'صبح':'عصر'} - {s.seller_id?.[1]}</option>)}</select><button className="bg-indigo-600 text-white px-4 rounded" onClick={async()=>{if(!first||!second)return;await swapIncentiveShifts(first,second);await load();await reload();}}>تعویض و محاسبه مجدد</button></div></div><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3">تاریخ شمسی</th><th>شیفت</th><th>مسئول</th><th>هدف</th><th>فروش</th><th>تحقق</th></tr></thead><tbody>{shifts.map(s=><tr key={s.id} className="border-t"><td className="p-3">{formatTehranJalaliDate(s.shift_date)}</td><td>{s.shift_type==='morning'?'صبح':'عصر'}</td><td>{s.seller_id?.[1]}</td><td>{formatPrice(s.target_amount)}</td><td>{formatPrice(s.actual_sales)}</td><td>{toPersianDigits((s.achievement_percent||0).toFixed(1))}٪</td></tr>)}</tbody></table></div></div>;
}

function NewShift({sellers,onCreated}:{sellers:any[];onCreated:()=>Promise<void>}) { const [date,setDate]=useState('');const [type,setType]=useState('morning');const [seller,setSeller]=useState(0);return <div className="bg-white border rounded-xl p-4"><div className="font-bold mb-3">افزودن شیفت</div><div className="flex flex-wrap gap-2"><input type="date" title="تاریخ در دیتابیس میلادی است؛ نمایش جدول شمسی است" value={date} onChange={e=>setDate(e.target.value)} className="border rounded p-2"/><select value={type} onChange={e=>setType(e.target.value)} className="border rounded p-2"><option value="morning">صبح</option><option value="evening">عصر</option></select><select value={seller} onChange={e=>setSeller(Number(e.target.value))} className="border rounded p-2"><option value={0}>فروشنده</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button onClick={async()=>{if(!date||!seller)return;await create('fmcg.incentive.shift',{shift_date:date,shift_type:type,seller_id:seller});await onCreated();}} className="bg-green-600 text-white px-4 rounded">ثبت شیفت</button></div><div className="text-[11px] text-gray-400 mt-2">پس از ثبت، تاریخ به‌صورت شمسی نمایش داده می‌شود و تمام محاسبات با تهران انجام می‌شود.</div></div>; }

function Adjustments({period,reload}:{period:any;reload:()=>Promise<void>}) {const [sellers,setSellers]=useState<any[]>([]);const [seller,setSeller]=useState(0);const [type,setType]=useState('commission');const [amount,setAmount]=useState('');const [reason,setReason]=useState('');useEffect(()=>{searchRead('res.users',[['active','=',true],['share','=',false]],['name'],0,0,'name').then(setSellers)},[]);return <div className="bg-white border rounded-xl p-5"><div className="font-bold mb-4">افزایش یا کاهش دستی</div><div className="grid sm:grid-cols-2 gap-3"><select className="border rounded p-2" value={seller} onChange={e=>setSeller(Number(e.target.value))}><option value={0}>فروشنده</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="border rounded p-2" value={type} onChange={e=>setType(e.target.value)}><option value="commission">پورسانت</option><option value="hubbleium">هابلیوم</option></select><input className="border rounded p-2" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مقدار؛ برای کاهش منفی وارد کنید"/><input className="border rounded p-2" value={reason} onChange={e=>setReason(e.target.value)} placeholder="دلیل تعدیل"/></div><button className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded" onClick={async()=>{if(!seller||!period?.id||!amount||!reason)return;await create('fmcg.incentive.adjustment',{seller_id:seller,period_id:period.id,adjustment_type:type,amount:Number(amount),reason});setAmount('');setReason('');await reload();}}>ثبت تعدیل</button></div>;}

function Rewards({reload}:{reload:()=>Promise<void>}) {const [items,setItems]=useState<any[]>([]);const [name,setName]=useState('');const [cost,setCost]=useState('');const [stock,setStock]=useState('');async function load(){setItems(await searchRead('fmcg.reward',[],['name','cost','stock_qty','unlimited_stock','active'],0,0,'cost'));}useEffect(()=>{void load();},[]);return <div className="space-y-4"><div className="bg-white border rounded-xl p-4 flex flex-wrap gap-2"><input className="border rounded p-2" placeholder="نام جایزه" value={name} onChange={e=>setName(e.target.value)}/><input className="border rounded p-2" type="number" placeholder="قیمت هابلیوم" value={cost} onChange={e=>setCost(e.target.value)}/><input className="border rounded p-2" type="number" placeholder="موجودی" value={stock} onChange={e=>setStock(e.target.value)}/><button className="bg-green-600 text-white px-4 rounded" onClick={async()=>{if(!name||!cost)return;await create('fmcg.reward',{name,cost:Number(cost),stock_qty:Number(stock||0)});setName('');setCost('');setStock('');await load();await reload();}}>افزودن</button></div><div className="grid sm:grid-cols-3 gap-3">{items.map(i=><div className="bg-white border rounded-xl p-4" key={i.id}><b>{i.name}</b><div className="text-indigo-600 my-1">{formatPrice(i.cost)} H</div><div className="text-xs text-gray-500">موجودی: {formatPrice(i.stock_qty)}</div></div>)}</div></div>;}
