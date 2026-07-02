'use client';

import { useEffect, useState } from 'react';
import { getPartners, createPartner, updatePartner, createSellerUser } from '@/lib/odoo-api';
import { toPersianDigits } from '@/lib/utils';

interface Partner {
  id: number;
  name: string;
  phone: string | false;
  mobile: string | false;
  supplier_rank: number;
  customer_rank: number;
  email: string | false;
  comment: string | false;
}

interface PartnerForm {
  name: string;
  phone: string;
  mobile: string;
  role: 'seller' | 'supplier' | 'customer';
  comment: string;
  login: string;
  password: string;
}

export default function PeoplePage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'supplier' | 'customer'>('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<PartnerForm>({
    name: '', phone: '', mobile: '', role: 'customer', comment: '', login: '', password: '',
  });

  async function fetchPartners() {
    try {
      setLoading(true);
      const role = filter === 'all' ? undefined : filter;
      const data = await getPartners(role);
      setPartners(data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPartners(); }, [filter]);

  function openNewForm() {
    setForm({ name: '', phone: '', mobile: '', role: 'customer', comment: '', login: '', password: '' });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(partner: Partner) {
    const role: PartnerForm['role'] = partner.supplier_rank > 0 ? 'supplier' : 'customer';
    setForm({
      name: partner.name,
      phone: partner.phone || '',
      mobile: partner.mobile || '',
      role,
      comment: partner.comment || '',
      login: '',
      password: '',
    });
    setEditingId(partner.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name) {
      alert('نام شخص الزامی است');
      return;
    }
    // Seller creation requires login credentials
    if (form.role === 'seller' && !editingId) {
      if (!form.login || !form.password) {
        alert('برای فروشنده، نام کاربری و رمز عبور الزامی است');
        return;
      }
    }
    setSaving(true);
    try {
      if (form.role === 'seller' && !editingId) {
        // Create an Odoo login user (POS-only) + a linked partner
        await createSellerUser({
          name: form.name,
          login: form.login,
          password: form.password,
          phone: form.phone || undefined,
        });
      } else {
        const values = {
          name: form.name,
          phone: form.phone || undefined,
          mobile: form.mobile || undefined,
          supplier_rank: form.role === 'supplier' ? 1 : 0,
          customer_rank: form.role === 'customer' ? 1 : 0,
          comment: form.comment || undefined,
        };
        if (editingId) {
          await updatePartner(editingId, values);
        } else {
          await createPartner(values);
        }
      }
      setShowForm(false);
      await fetchPartners();
    } catch (e: any) {
      alert(e.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  function getRoleLabel(partner: Partner): string {
    if (partner.supplier_rank > 0 && partner.customer_rank > 0) return 'تامین‌کننده / مشتری';
    if (partner.supplier_rank > 0) return 'تامین‌کننده';
    if (partner.customer_rank > 0) return 'مشتری';
    return 'سایر';
  }

  function getRoleBadgeColor(partner: Partner): string {
    if (partner.supplier_rank > 0) return 'bg-orange-100 text-orange-700';
    if (partner.customer_rank > 0) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  }

  const filtered = partners.filter(
    (p) => p.name.includes(search) || (p.phone && p.phone.includes(search)) || (p.mobile && p.mobile.includes(search))
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">اشخاص</h1>
          <p className="text-gray-500 text-sm">مدیریت فروشنده‌ها، تامین‌کنندگان و مشتریان</p>
        </div>
        <button
          onClick={openNewForm}
          className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-600 transition"
        >
          + شخص جدید
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === 'all' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          همه
        </button>
        <button
          onClick={() => setFilter('supplier')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === 'supplier' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          تامین‌کنندگان
        </button>
        <button
          onClick={() => setFilter('customer')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === 'customer' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          مشتریان
        </button>

        <input
          type="text"
          placeholder="🔍 جستجو..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mr-auto p-1.5 px-3 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-dashed border-gray-300">
          <div className="text-4xl mb-3">👥</div>
          <p>هنوز شخصی ثبت نشده</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((partner) => (
            <div
              key={partner.id}
              className="bg-white rounded-xl p-4 border border-gray-100 hover:border-indigo-200 transition cursor-pointer"
              onClick={() => openEditForm(partner)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm text-slate-800">{partner.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {partner.phone || partner.mobile || 'بدون شماره'}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getRoleBadgeColor(partner)}`}>
                  {getRoleLabel(partner)}
                </span>
              </div>
              {partner.comment && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-1">{partner.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Partner Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">
              {editingId ? '✏️ ویرایش شخص' : '+ ثبت شخص جدید'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">نام *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="نام و نام خانوادگی"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نقش</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as PartnerForm['role'] })}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="customer">مشتری</option>
                  <option value="supplier">تامین‌کننده</option>
                  <option value="seller">فروشنده</option>
                </select>
              </div>
              {form.role === 'seller' && !editingId && (
                <div className="grid grid-cols-2 gap-3 bg-indigo-50 p-3 rounded-lg">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">نام کاربری *</label>
                    <input
                      type="text"
                      value={form.login}
                      onChange={(e) => setForm({ ...form, login: e.target.value })}
                      placeholder="seller01"
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">رمز عبور *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••"
                      className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-[10px] text-indigo-600">
                    فروشنده با این حساب فقط به صفحه صندوق فروش (POS) دسترسی دارد.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">تلفن</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="۰۲۱-۱۲۳۴۵۶۷۸"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">موبایل</label>
                  <input
                    type="tel"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">توضیحات</label>
                <textarea
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="توضیحات اختیاری..."
                  rows={2}
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره...' : editingId ? 'ذخیره تغییرات' : 'ثبت شخص'}
              </button>
              <button
                onClick={() => setShowForm(false)}
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
