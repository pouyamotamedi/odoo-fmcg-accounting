# Requirements Document — Phase 2: Custom Frontend

## Introduction

This document defines requirements for a custom React frontend that connects to the existing Odoo backend via JSON-RPC API. The frontend replaces Odoo's complex UI with a simple, Persian-first interface tailored for a small FMCG shop.

## Glossary

- **Admin**: Shop owner/manager who configures the system, manages inventory, purchases, and views reports
- **Seller**: Shop staff who only sees the POS screen to process sales
- **Supplier**: External person who supplies goods (not a system user)
- **POS Screen**: The cash register interface for processing sales (product grid + cart + payment)
- **Onboarding Wizard**: Step-by-step setup flow shown on first launch
- **Odoo API**: JSON-RPC endpoints provided by Odoo backend for CRUD operations

## Requirements

### Requirement 1: Authentication & Role-Based Access

**User Story:** As a user, I want to log in and see only the interface relevant to my role.

#### Acceptance Criteria

1. THE System SHALL display a login page with username, password, and role selection (Admin/Seller)
2. WHEN a Seller logs in, THE System SHALL display only the POS screen — no other menus or pages
3. WHEN an Admin logs in, THE System SHALL display the Admin Dashboard with sidebar navigation
4. THE System SHALL authenticate against Odoo's session API (JSON-RPC /web/session/authenticate)
5. IF authentication fails, THE System SHALL display an error message in Persian

### Requirement 2: Onboarding Wizard (First-Time Setup)

**User Story:** As an Admin on first login, I want a guided setup to configure my shop basics.

#### Acceptance Criteria

1. WHEN the Admin logs in for the first time (no products exist), THE System SHALL show the Onboarding Wizard
2. THE Onboarding Wizard SHALL have 5 steps: People → Bank/Cash → POS Terminal → Products → Done
3. EACH step SHALL allow adding multiple entries before proceeding
4. WHEN the Admin completes onboarding, THE System SHALL save all data to Odoo via API
5. THE Admin SHALL be able to skip onboarding and access it later from Settings

### Requirement 3: Admin Dashboard

**User Story:** As an Admin, I want a simple dashboard showing today's key metrics and quick actions.

#### Acceptance Criteria

1. THE Dashboard SHALL display: today's sales total, transaction count, cash balance, customer outstanding
2. THE Dashboard SHALL show quick action buttons: Purchase Invoice, New Product, New Person, Record Expense, Sales Return, Open POS
3. THE Sidebar SHALL contain: Dashboard, Purchase Invoices, Inventory, People, Bank & Cash, Customer Credits, Reports, Returns, Settings
4. ALL text SHALL be in Persian with RTL layout

### Requirement 4: Purchase Invoice

**User Story:** As an Admin, I want to record purchase invoices that automatically update inventory and accounting.

#### Acceptance Criteria

1. THE System SHALL allow the Admin to create a Purchase Invoice with: supplier, date, line items (product, qty, unit price)
2. WHEN a Purchase Invoice is confirmed, THE System SHALL increase stock quantity for each product via Odoo API
3. WHEN payment method is selected (Cash/Bank), THE System SHALL create the corresponding accounting entry
4. IF payment is deferred, THE System SHALL record it as accounts payable for that supplier
5. THE System SHALL display the list of all purchase invoices with status filter (draft/confirmed/paid)

### Requirement 5: POS Screen (Seller View)

**User Story:** As a Seller, I want a fast, simple POS screen to process sales with barcode and touch.

#### Acceptance Criteria

1. THE POS Screen SHALL display a product grid with name and price
2. THE POS Screen SHALL have a search/barcode input that finds products instantly
3. WHEN a product is selected or scanned, THE System SHALL add it to the cart with quantity 1
4. THE cart SHALL show line items, quantities (editable), and running total
5. THE System SHALL offer three payment methods: Cash (with change calculation), Card (send to POS terminal), Credit (select customer + note)
6. WHEN a sale is completed, THE System SHALL: decrease inventory, create accounting entries, print/show receipt
7. THE POS Screen SHALL work offline and sync when connectivity returns

### Requirement 6: Sales Return

**User Story:** As an Admin, I want to process sales returns with options for stock and payment handling.

#### Acceptance Criteria

1. THE System SHALL allow the Admin to create a Sales Return referencing an original sale
2. THE Return form SHALL ask: which products returned, quantity, reason
3. THE Return form SHALL ask: return to stock OR mark as waste/damaged
4. THE Return form SHALL ask: refund to which account (cash/bank/customer credit)
5. WHEN confirmed, THE System SHALL update inventory (if returned to stock) and create reversal accounting entries

### Requirement 7: People Management

**User Story:** As an Admin, I want to manage people (sellers, suppliers, customers) in one place.

#### Acceptance Criteria

1. THE System SHALL display a list of all people with role filter (Seller/Supplier/Customer/Admin)
2. THE Admin SHALL be able to create people with: name, role, phone, optional login credentials
3. IF role is Seller, THE System SHALL create an Odoo user with POS-only access
4. IF role is Supplier, THE System SHALL link them for purchase invoices
5. IF role is Customer, THE System SHALL link them for credit/deferred payments

### Requirement 8: Inventory & Products

**User Story:** As an Admin, I want to see all products with their current stock and manage them easily.

#### Acceptance Criteria

1. THE System SHALL display a product list with: name, barcode, stock quantity, purchase price, sale price, low-stock indicator
2. THE Admin SHALL be able to add/edit products with all fields
3. THE Admin SHALL be able to record stock adjustments (damaged/expired/lost) with mandatory reason
4. THE System SHALL highlight products below reorder threshold in red

### Requirement 9: Reports

**User Story:** As an Admin, I want simple reports to understand my business.

#### Acceptance Criteria

1. Daily Sales Report: date filter, total revenue, transaction count, payment method breakdown
2. Inventory Report: all products with qty and value
3. Customer Credit Report: outstanding balances with aging (0-30, 31-60, 61-90, 90+)
4. Cash Flow Report: inflows/outflows by category for date range
5. ALL reports SHALL be exportable as PDF
6. IF no data exists for selected period, THE System SHALL show "no data" message

### Requirement 10: Settings

**User Story:** As an Admin, I want to configure shop settings in one place.

#### Acceptance Criteria

1. THE Settings page SHALL include: Company name, Currency (Rial/Toman), Fiscal year start, POS terminal config
2. THE Settings page SHALL allow changing admin password
3. THE Settings page SHALL show Odoo connection status
4. THE Settings page SHALL allow re-running the Onboarding Wizard

### Requirement 11: Persian UI & Fonts

**User Story:** As a user, I want the entire interface in Persian with proper fonts and RTL.

#### Acceptance Criteria

1. ALL text SHALL be in Persian (Farsi)
2. THE layout SHALL be fully RTL
3. THE System SHALL use Vazirmatn or IRANSans font
4. Numbers SHALL use Persian numerals (۰-۹) with proper thousand separators
5. Dates SHALL display in Jalali (Solar Hijri) calendar format

## Technical Notes

- **Stack**: React 18 + Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **API**: Odoo JSON-RPC (/jsonrpc endpoint)
- **State**: Zustand or React Context
- **Offline**: Service Worker + IndexedDB for POS
- **Font**: Vazirmatn (Google Fonts, free)
- **Deploy**: Static export or Node.js server
