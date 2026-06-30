# Tasks

## Task 1: Project Setup and Odoo Installation ✅

- [x] 1.1 Clone Odoo 18 Community Edition from GitHub
- [x] 1.2 Set up Python virtual environment and install dependencies
- [x] 1.3 Configure PostgreSQL database (user: odoo, db: fmcg_shop)
- [x] 1.4 Create custom_addons directory structure
- [x] 1.5 Create odoo.conf with addons-path pointing to custom_addons
- [x] 1.6 Verify Odoo starts and base modules load correctly

## Task 2: fmcg_base Module - Core Configuration ✅

- [x] 2.1 Create module scaffold (__manifest__.py, __init__.py)
- [x] 2.2 Extend res.company with FMCG settings (locale, POS terminal toggle, offline toggle, jalali)
- [x] 2.3 Extend res.users with operator permission fields (sales, refunds, inventory, reports, persian)
- [x] 2.4 Create security/ir.model.access.csv for access rights
- [x] 2.5 Create views for FMCG settings configuration + user form
- [x] 2.6 Install and verify module loads without errors (loaded in 3.75s, 0 errors)

## Task 3: fmcg_bank_cash Module - Bank & Cash Management ✅

Depends on: Task 2

- [x] 3.1 Create module scaffold with dependency on fmcg_base and account
- [x] 3.2 Extend account.journal with fmcg_account_holder, fmcg_account_number, fmcg_opening_balance, fmcg_is_active fields
- [x] 3.3 Implement unique account number constraint
- [x] 3.4 Implement deactivation logic (prevent transactions on inactive journals)
- [x] 3.5 Implement running balance computation (opening + sum of transactions)
- [x] 3.6 Create/extend form and list views for bank accounts and cash registers
- [x] 3.7 Add menu items under Finance menu
- [ ] 3.8 Write tests for bank account CRUD and validation rules

## Task 4: fmcg_inventory Module - Inventory Management ✅

Depends on: Task 2

- [x] 4.1 Create module scaffold with dependency on stock, product, barcodes, fmcg_base
- [x] 4.2 Extend product.template with fmcg_reorder_threshold and fmcg_is_low_stock computed field
- [x] 4.3 Implement low-stock warning logic and UI indicator
- [x] 4.4 Create fmcg.stock.adjustment model (product, quantity, reason selection, note, date, user)
- [x] 4.5 Create stock adjustment form/list views and menu
- [x] 4.6 Implement stock valuation summary (qty × purchase price via stock report)
- [ ] 4.7 Implement negative stock warning with confirmation dialog
- [x] 4.8 Implement barcode lookup (extend existing barcode handling for <1s response)
- [ ] 4.9 Handle unmatched barcode notification
- [ ] 4.10 Write tests for stock adjustments and low-stock computation

## Task 5: fmcg_accounting Module - Basic Accounting ✅

Depends on: Task 3

- [x] 5.1 Create module scaffold with dependency on account, fmcg_base, fmcg_bank_cash
- [ ] 5.2 Create predefined chart of accounts XML data file (assets, liabilities, equity, revenue, expenses)
- [x] 5.3 Create fmcg.expense model with required fields (date, amount, account, payment journal, description)
- [x] 5.4 Implement expense confirmation logic creating double-entry journal entries
- [x] 5.5 Implement validation (reject invalid/missing fields, amount ≤ 0)
- [x] 5.6 Create expense form/list views and menu items
- [ ] 5.7 Verify automatic journal entry creation on POS sales
- [ ] 5.8 Write tests for expense recording and journal entry creation

## Task 6: fmcg_reports Module - General Reports

Depends on: Task 5, Task 7

- [ ] 6.1 Create module scaffold with dependencies on account, stock, point_of_sale, fmcg_credit, fmcg_base
- [ ] 6.2 Implement daily sales summary report (revenue, tx count, payment method breakdown)
- [ ] 6.3 Implement inventory status report (all products, qty, stock value)
- [ ] 6.4 Implement customer credit report with aging buckets (0-30, 31-60, 61-90, 90+)
- [ ] 6.5 Implement cash flow report (inflows/outflows by source for date range)
- [ ] 6.6 Create QWeb PDF templates for all reports with Persian font support
- [ ] 6.7 Add date range filter UI for all reports
- [ ] 6.8 Handle empty results message
- [ ] 6.9 Write tests for report generation with sample data

## Task 7: fmcg_credit Module - Credit/Deferred Payment

Depends on: Task 2

- [ ] 7.1 Create module scaffold with dependency on account, point_of_sale, fmcg_base
- [ ] 7.2 Create fmcg.customer.credit model (partner, invoice_ref, amount, note, date, state, paid_amount, remaining)
- [ ] 7.3 Extend res.partner with fmcg_credit_ids and fmcg_total_outstanding computed field
- [ ] 7.4 Implement repayment logic with validation (reject amount > outstanding)
- [ ] 7.5 Create customer credit form/list views showing ledger entries
- [ ] 7.6 Add "Credit" payment method to POS with customer selection popup
- [ ] 7.7 Implement split payment support (immediate + credit portions)
- [ ] 7.8 Implement inline Customer_Account creation from POS when customer doesn't exist
- [ ] 7.9 Write tests for credit creation, repayment, and split payments

## Task 8: fmcg_pos_terminal Module - POS Terminal Integration

Depends on: Task 2

- [ ] 8.1 Create module scaffold with dependency on point_of_sale, fmcg_base
- [ ] 8.2 Create fmcg.pos.terminal.config model (name, port, protocol, device_model, baud_rate, timeout, pos_config_id)
- [ ] 8.3 Implement PosTerminalDriver Python class for serial/TCP communication
- [ ] 8.4 Implement payment request sending (amount → device)
- [ ] 8.5 Implement response handling (success with ref number, failure with reason)
- [ ] 8.6 Implement connection timeout (10s) and transaction timeout (120s)
- [ ] 8.7 Create OWL frontend component (waiting indicator, cancel button)
- [ ] 8.8 Add fallback: manual reference entry when device unreachable
- [ ] 8.9 Create admin configuration form for terminal settings
- [ ] 8.10 Write tests with mock serial device

## Task 9: fmcg_persian Module - Persian/Farsi Localization

Depends on: Task 2

- [ ] 9.1 Create module scaffold with dependency on base, web, fmcg_base
- [ ] 9.2 Create i18n/fa_IR.po translation file for all FMCG module strings
- [ ] 9.3 Implement RTL CSS stylesheet (mirrored navigation, right-aligned text)
- [ ] 9.4 Implement Jalali date picker OWL component (with Gregorian↔Jalali conversion)
- [ ] 9.5 Implement Persian numeral formatting utility (۰-۹, thousand separator)
- [ ] 9.6 Embed Persian font (IRANSans) for PDF report generation
- [ ] 9.7 Add locale selection in user preferences
- [ ] 9.8 Test RTL rendering and Jalali dates in reports
- [ ] 9.9 Verify Persian text entry and search in product/customer fields

## Task 10: fmcg_offline Module - Offline Mode & Sync

Depends on: Task 2

- [ ] 10.1 Create module scaffold with dependency on point_of_sale, fmcg_base
- [ ] 10.2 Extend POS offline capability to cover inventory adjustments and credit entries
- [ ] 10.3 Implement connectivity monitor (ping every 5s, detect loss within 10s)
- [ ] 10.4 Implement persistent offline indicator OWL component
- [ ] 10.5 Implement IndexedDB transaction queue manager
- [ ] 10.6 Implement sync endpoint (receive batched transactions, process chronologically)
- [ ] 10.7 Implement conflict detection (timestamp comparison) and admin resolution UI
- [ ] 10.8 Implement retry logic (3 attempts, then mark failed and notify admin)
- [ ] 10.9 Ensure 7-day local retention of offline transactions
- [ ] 10.10 Write tests for offline queue and sync scenarios

## Task 11: Integration Testing & Final Setup

Depends on: Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10

- [ ] 11.1 Full integration test: create products, process sale with card payment, verify journal entries
- [ ] 11.2 Full integration test: credit sale, repayment, verify customer balance
- [ ] 11.3 Full integration test: offline sale, reconnect, verify sync
- [ ] 11.4 Verify all reports generate correctly with Persian locale
- [ ] 11.5 Performance test: barcode lookup < 1 second with 5000+ products
- [ ] 11.6 Create installation documentation (README.md)
- [ ] 11.7 Final commit and push to GitHub
