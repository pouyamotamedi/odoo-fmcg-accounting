/**
 * Admin panel menu definition + seller access helpers.
 * Seller access is configured in Settings and stored on the company (server-side),
 * so it is the same on every device.
 */

export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  key: string;
  adminOnly?: boolean;
}

export const menuItems: MenuItem[] = [
  { href: '/admin', label: 'داشبورد', icon: '📊', key: 'dashboard' },
  { href: '/admin/purchase', label: 'فاکتور خرید', icon: '🛒', key: 'purchase' },
  { href: '/admin/inventory', label: 'انبار و کالاها', icon: '📦', key: 'inventory' },
  { href: '/admin/people', label: 'اشخاص', icon: '👥', key: 'people' },
  { href: '/admin/accounts', label: 'حساب اشخاص', icon: '📒', key: 'accounts' },
  { href: '/admin/treasury', label: 'بانک و صندوق', icon: '🏦', key: 'treasury' },
  { href: '/admin/reconciliation', label: 'مغایرت‌گیری', icon: '🔄', key: 'reconciliation' },
  { href: '/admin/accounting', label: 'اسناد حسابداری', icon: '📋', key: 'accounting' },
  { href: '/admin/chart-of-accounts', label: 'سرفصل حساب‌ها', icon: '🗂️', key: 'chart-of-accounts' },
  { href: '/admin/reports', label: 'گزارش‌ها', icon: '📈', key: 'reports' },
  { href: '/admin/analytics', label: 'تحلیل مدیریتی', icon: '📊', key: 'analytics' },
  { href: '/admin/returns', label: 'برگشت از فروش', icon: '↩️', key: 'returns' },
  { href: '/admin/discounts', label: 'تخفیفات', icon: '🏷️', key: 'discounts' },
  { href: '/admin/boost', label: 'حالت بوست', icon: '🚀', key: 'boost', adminOnly: true },
  { href: '/admin/stock-count', label: 'انبارگردانی', icon: '📋', key: 'stock-count' },
  { href: '/admin/fiscal-year', label: 'سال مالی', icon: '📅', key: 'fiscal-year' },
  { href: '/admin/incentives', label: 'پورسانت و هابلیوم', icon: '🪙', key: 'incentives' },
  { href: '/admin/settings', label: 'تنظیمات', icon: '⚙️', key: 'settings' },
];

/** Menus a seller can be granted (admin-only menus are never available to sellers). */
export const sellerAssignableMenus = menuItems.filter((menu) => !menu.adminOnly);

export function isMenuActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Menus visible to the current user. Admins see everything; sellers only the allowed ones. */
export function visibleMenusFor(isAdminUser: boolean, allowed: string[]): MenuItem[] {
  if (isAdminUser) return menuItems;
  return sellerAssignableMenus.filter((menu) => allowed.includes(menu.key));
}

/** Seller landing page when the admin has not allowed any menu. */
export const SELLER_FALLBACK_HOME = '/admin/incentives';

/** Whether a seller may open the given /admin path. */
export function isSellerPathAllowed(pathname: string, allowed: string[]): boolean {
  const menus = visibleMenusFor(false, allowed);
  if (menus.length === 0) return isMenuActive(SELLER_FALLBACK_HOME, pathname);
  return menus.some((menu) => isMenuActive(menu.href, pathname));
}

/** Where a seller lands: the first allowed menu, or the commission page when nothing is allowed. */
export function sellerHomePath(allowed: string[]): string {
  return visibleMenusFor(false, allowed)[0]?.href ?? SELLER_FALLBACK_HOME;
}

export function parseAllowedMenus(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((key): key is string => typeof key === 'string');
  if (typeof raw !== 'string' || !raw) return [];
  try {
    return parseAllowedMenus(JSON.parse(raw));
  } catch {
    return [];
  }
}
