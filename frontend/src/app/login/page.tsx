'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, UserRole } from '@/stores/auth-store';
import { login as odooLogin } from '@/lib/odoo-api';

export default function LoginPage() {
  const router = useRouter();
  const authLogin = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await odooLogin(username, password);
      authLogin(result.uid, result.name, result.username, role);

      if (role === 'seller') {
        router.push('/pos');
      } else {
        router.push('/admin');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      <form
        onSubmit={handleLogin}
        className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">🏪 فروشگاه من</h1>
          <p className="text-gray-500 text-sm mt-1">نرم‌افزار مدیریت فروشگاه</p>
        </div>

        {/* Role Selection */}
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`flex-1 p-3 rounded-lg border-2 text-center transition ${
              role === 'admin'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl">👔</div>
            <div className="text-xs text-gray-600 mt-1">مدیر</div>
          </button>
          <button
            type="button"
            onClick={() => setRole('seller')}
            className={`flex-1 p-3 rounded-lg border-2 text-center transition ${
              role === 'seller'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl">🛒</div>
            <div className="text-xs text-gray-600 mt-1">فروشنده</div>
          </button>
        </div>

        {/* Inputs */}
        <input
          type="text"
          placeholder="نام کاربری"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-3 p-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
          required
        />
        <input
          type="password"
          placeholder="رمز عبور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 p-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
          required
        />

        {error && (
          <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 bg-indigo-500 text-white rounded-lg font-bold hover:bg-indigo-600 disabled:opacity-50 transition"
        >
          {loading ? 'در حال ورود...' : 'ورود'}
        </button>
      </form>
    </div>
  );
}
