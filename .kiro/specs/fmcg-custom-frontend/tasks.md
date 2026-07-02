# Tasks — Phase 2: Custom Frontend

## Task 1: Project Setup

- [ ] 1.1 Create Next.js 14 project with TypeScript in `frontend/` directory
- [ ] 1.2 Install Tailwind CSS + configure RTL + Vazirmatn font
- [ ] 1.3 Install shadcn/ui components (Button, Input, Card, Dialog, Table, Select)
- [ ] 1.4 Create `lib/odoo-api.ts` - Odoo JSON-RPC client
- [ ] 1.5 Create `lib/utils.ts` - Persian numerals, Jalali date conversion
- [ ] 1.6 Verify dev server runs and connects to Odoo API

## Task 2: Authentication & Login

- [ ] 2.1 Create `/login` page with username, password, role select (Admin/Seller)
- [ ] 2.2 Implement Odoo session authentication in `lib/auth.ts`
- [ ] 2.3 Create `stores/auth-store.ts` for session state persistence
- [ ] 2.4 Implement role-based redirect (Seller → /pos, Admin → /admin)
- [ ] 2.5 Add auth middleware/guard for protected routes

## Task 3: Admin Layout & Dashboard

- [ ] 3.1 Create `/admin/layout.tsx` with RTL sidebar navigation
- [ ] 3.2 Create `Sidebar.tsx` component with Persian labels and icons
- [ ] 3.3 Create `/admin/page.tsx` (Dashboard) with metric cards
- [ ] 3.4 Fetch real-time data from Odoo (today's sales, cash balance, outstanding)
- [ ] 3.5 Add quick action buttons linking to sub-pages

## Task 4: Onboarding Wizard

- [ ] 4.1 Create `/onboarding/page.tsx` with multi-step wizard
- [ ] 4.2 Step 1: Add People (name, role, phone)
- [ ] 4.3 Step 2: Add Bank Accounts & Cash Register
- [ ] 4.4 Step 3: Configure POS Terminal
- [ ] 4.5 Step 4: Add Products (name, barcode, prices)
- [ ] 4.6 Step 5: Summary & Finish
- [ ] 4.7 Save all data to Odoo via API on completion
- [ ] 4.8 Show onboarding on first login (no products exist), skip option

## Task 5: POS Screen (Seller View)

- [ ] 5.1 Create `/pos/page.tsx` - full screen, no sidebar
- [ ] 5.2 Create `ProductGrid.tsx` - responsive product tiles with prices
- [ ] 5.3 Create `Cart.tsx` - line items, qty +/-, running total
- [ ] 5.4 Implement barcode/search input with instant product lookup
- [ ] 5.5 Create `PaymentDialog.tsx` - Cash (change calc), Card, Credit (customer select + note)
- [ ] 5.6 Implement sale completion: create POS order via Odoo API
- [ ] 5.7 Implement offline mode: Service Worker + IndexedDB queue
- [ ] 5.8 Add online/offline status indicator

## Task 6: Purchase Invoice

- [ ] 6.1 Create `/admin/purchase/page.tsx` - list of purchase invoices
- [ ] 6.2 Create purchase invoice form: supplier, date, line items
- [ ] 6.3 Implement confirm: increase stock + create accounting entry via API
- [ ] 6.4 Implement payment options: Cash/Bank (immediate) or Deferred (accounts payable)
- [ ] 6.5 Add status filter (draft/confirmed/paid)

## Task 7: Inventory & Products

- [ ] 7.1 Create `/admin/inventory/page.tsx` - product list with stock levels
- [ ] 7.2 Create add/edit product form (name, barcode, prices, reorder threshold)
- [ ] 7.3 Implement stock adjustment form (product, qty, reason, note)
- [ ] 7.4 Highlight low-stock products in red
- [ ] 7.5 Fetch real-time stock data from Odoo

## Task 8: People Management

- [ ] 8.1 Create `/admin/people/page.tsx` - people list with role filter
- [ ] 8.2 Create add/edit person form (name, role, phone, login if seller)
- [ ] 8.3 Implement Odoo user creation for Sellers with POS-only access
- [ ] 8.4 Link suppliers for purchase invoices
- [ ] 8.5 Link customers for credit payments

## Task 9: Customer Credits & Bank/Cash

- [ ] 9.1 Create `/admin/credits/page.tsx` - customer credit list with aging
- [ ] 9.2 Implement repayment recording
- [ ] 9.3 Create bank/cash overview page showing balances
- [ ] 9.4 Fetch data from Odoo fmcg_credit and account models

## Task 10: Reports

- [ ] 10.1 Create `/admin/reports/page.tsx` with report type selection
- [ ] 10.2 Daily sales report with date filter and chart
- [ ] 10.3 Inventory status report
- [ ] 10.4 Customer credit aging report
- [ ] 10.5 Cash flow report
- [ ] 10.6 PDF export functionality

## Task 11: Sales Returns

- [ ] 11.1 Create `/admin/returns/page.tsx` - returns list
- [ ] 11.2 Create return form: reference original sale, products, qty, reason
- [ ] 11.3 Options: return to stock OR mark as waste
- [ ] 11.4 Options: refund to cash/bank/customer credit
- [ ] 11.5 Create reversal accounting entries via Odoo API

## Task 12: Settings

- [ ] 12.1 Create `/admin/settings/page.tsx`
- [ ] 12.2 Company name, currency, fiscal year
- [ ] 12.3 POS terminal configuration
- [ ] 12.4 Admin password change
- [ ] 12.5 Odoo connection status indicator
- [ ] 12.6 Re-run onboarding button

## Task 13: Final Polish

- [ ] 13.1 Complete Persian translations for all strings
- [ ] 13.2 Jalali date picker integration
- [ ] 13.3 Persian numeral formatting throughout
- [ ] 13.4 Responsive design for tablet/mobile
- [ ] 13.5 Loading states and error handling
- [ ] 13.6 Final integration test with fresh Odoo database
- [ ] 13.7 Commit and push to GitHub
