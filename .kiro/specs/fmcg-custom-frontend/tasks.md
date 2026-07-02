# Tasks — Phase 2: Custom Frontend

## Task 1: Project Setup ✅

- [x] 1.1 Create Next.js 14 project with TypeScript in `frontend/` directory
- [x] 1.2 Install Tailwind CSS + configure RTL + Vazirmatn font (CDN)
- [x] 1.3 ~~Install shadcn/ui components~~ (skipped - not needed)
- [x] 1.4 Create `lib/odoo-api.ts` - Odoo JSON-RPC client
- [x] 1.5 Create `lib/utils.ts` - Persian numerals, Jalali date conversion
- [x] 1.6 Verify dev server runs and connects to Odoo API

## Task 2: Authentication & Login ✅

- [x] 2.1 Create `/login` page with username, password, role select (Admin/Seller)
- [x] 2.2 Implement Odoo session authentication in `lib/auth.ts`
- [x] 2.3 Create `stores/auth-store.ts` for session state persistence
- [x] 2.4 Implement role-based redirect (Seller → /pos, Admin → /admin)
- [ ] 2.5 Add auth middleware/guard for protected routes

## Task 3: Admin Layout & Dashboard ✅

- [x] 3.1 Create `/admin/layout.tsx` with RTL sidebar navigation
- [x] 3.2 Create `Sidebar.tsx` component with Persian labels and icons
- [x] 3.3 Create `/admin/page.tsx` (Dashboard) with metric cards
- [x] 3.4 Fetch real-time data from Odoo (today's sales, cash balance, outstanding)
- [x] 3.5 Add quick action buttons linking to sub-pages

## Task 4: Onboarding Wizard ✅

- [x] 4.1 Create `/onboarding/page.tsx` with multi-step wizard
- [x] 4.2 Step 1: Add People (name, role, phone)
- [x] 4.3 Step 2: Add Bank Accounts & Cash Register
- [x] 4.4 Step 3: Configure POS Terminal
- [x] 4.5 Step 4: Add Products (name, barcode, prices)
- [x] 4.6 Step 5: Summary & Finish
- [x] 4.7 Save all data to Odoo via API on completion
- [ ] 4.8 Show onboarding on first login (no products exist), skip option

## Task 5: POS Screen (Seller View) ✅

- [x] 5.1 Create `/pos/page.tsx` - full screen, no sidebar
- [x] 5.2 Create `ProductGrid.tsx` - responsive product tiles with prices
- [x] 5.3 Create `Cart.tsx` - line items, qty +/-, running total
- [x] 5.4 Implement barcode/search input with instant product lookup
- [x] 5.5 Create `PaymentDialog.tsx` - Cash (change calc), Card, Credit (customer select + note)
- [x] 5.6 Implement sale completion: create POS order via Odoo API
- [x] 5.7 Implement offline mode: Service Worker + IndexedDB queue
- [x] 5.8 Add online/offline status indicator

## Task 6: Purchase Invoice ✅

- [x] 6.1 Create `/admin/purchase/page.tsx` - POS-style purchase invoice
- [x] 6.2 Create purchase invoice form: supplier, search, product grid + cart
- [x] 6.3 Implement confirm: increase stock + create accounting entry via API
- [x] 6.4 Implement payment options: Cash/Bank (immediate) or Deferred (نسیه)
- [ ] 6.5 Add status filter (draft/confirmed/paid)
- [x] 6.6 Add new product popup for creating products inline

## Task 7: Inventory & Products ✅

- [x] 7.1 Create `/admin/inventory/page.tsx` - product list placeholder
- [x] 7.2 Create add/edit product form (name, barcode, prices, reorder threshold)
- [x] 7.3 Implement stock adjustment form (product, qty, reason, note)
- [x] 7.4 Highlight low-stock products in red
- [x] 7.5 Fetch real-time stock data from Odoo

## Task 8: People Management ✅

- [x] 8.1 Create `/admin/people/page.tsx` - people list placeholder
- [x] 8.2 Create add/edit person form (name, role, phone, login if seller)
- [x] 8.3 Implement Odoo user creation for Sellers with POS-only access
- [x] 8.4 Link suppliers for purchase invoices
- [x] 8.5 Link customers for credit payments

## Task 9: Customer Credits & Bank/Cash ✅

- [x] 9.1 Create `/admin/credits/page.tsx` - customer credit list placeholder
- [x] 9.2 Implement repayment recording
- [x] 9.3 Create bank/cash overview page showing balances
- [x] 9.4 Fetch data from Odoo fmcg_credit and account models

## Task 10: Reports ✅

- [x] 10.1 Create `/admin/reports/page.tsx` with report type selection
- [x] 10.2 Daily sales report with date filter and chart
- [x] 10.3 Inventory status report
- [x] 10.4 Customer credit aging report
- [x] 10.5 Cash flow report
- [x] 10.6 PDF export functionality

## Task 11: Sales Returns ✅

- [x] 11.1 Create `/admin/returns/page.tsx` - returns list placeholder
- [x] 11.2 Create return form: reference original sale, products, qty, reason
- [x] 11.3 Options: return to stock OR mark as waste
- [x] 11.4 Options: refund to cash/bank/customer credit
- [x] 11.5 Create reversal accounting entries via Odoo API

## Task 12: Settings ✅

- [x] 12.1 Create `/admin/settings/page.tsx`
- [x] 12.2 Company name, currency, fiscal year
- [x] 12.3 POS terminal configuration
- [x] 12.4 Admin password change
- [x] 12.5 Odoo connection status indicator
- [x] 12.6 Re-run onboarding button

## Task 13: Final Polish ✅

- [x] 13.1 Complete Persian translations for all strings
- [x] 13.2 Jalali date picker integration
- [x] 13.3 Persian numeral formatting throughout
- [x] 13.4 Responsive design for tablet/mobile
- [x] 13.5 Loading states and error handling
- [ ] 13.6 Final integration test with fresh Odoo database
- [x] 13.7 Commit and push to GitHub
