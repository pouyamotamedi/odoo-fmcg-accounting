# Requirements Document

## Introduction

This document defines the requirements for customizing Odoo Community Edition to serve as the management system for a small FMCG (Fast-Moving Consumer Goods) shop. The customization covers bank and cash management, inventory, basic accounting, reporting, POS terminal integration, multiple payment methods (cash, card, credit), Persian/Farsi localization with RTL support, and offline operation with data synchronization.

## Glossary

- **System**: The customized Odoo Community Edition instance configured for the FMCG shop
- **POS_Terminal**: The physical bank card payment terminal device connected to the System
- **Cash_Register**: A physical or logical cash drawer used to hold and track cash transactions
- **Bank_Account**: A defined bank account within the System linked to an actual bank account
- **Invoice**: A sales document generated for a customer transaction
- **Customer_Account**: A record representing a customer, including outstanding balances and credit history
- **Inventory_Module**: The warehouse and stock management component of the System
- **Accounting_Module**: The basic accounting component handling journal entries, ledgers, and financial summaries
- **Sync_Engine**: The component responsible for storing data locally during offline periods and synchronizing with the server when connectivity returns
- **Operator**: The shop staff member who uses the System to process sales and manage inventory
- **Administrator**: The shop owner or manager who configures the System and reviews reports
- **Product**: An item sold in the shop, defined by name, barcode, unit, category, purchase price, and sale price
- **Product_Category**: A grouping classification for products (e.g., beverages, snacks, dairy, household)
- **Barcode_Scanner**: A USB or Bluetooth barcode scanning device connected to the System for fast product lookup

## Requirements

### Requirement 1: Bank Account Definition

**User Story:** As an Administrator, I want to define bank accounts in the system, so that I can track payments received through banking channels.

#### Acceptance Criteria

1. THE System SHALL allow the Administrator to create, edit, and deactivate Bank_Account records
2. WHEN a Bank_Account is created, THE System SHALL require the account holder name (1 to 100 characters), bank name (1 to 100 characters), account number (10 to 26 digits), and an initial balance (defaulting to zero)
3. WHEN a Bank_Account is deactivated, THE System SHALL prevent new transactions from being recorded against that Bank_Account
4. THE System SHALL display the current balance for each active Bank_Account, calculated as the initial balance plus the sum of all recorded transactions for that account
5. IF the Administrator attempts to create a Bank_Account with an account number that already exists in the System, THEN THE System SHALL reject the creation and display an error message indicating a duplicate account number
6. WHEN the Administrator edits a Bank_Account that has recorded transactions, THE System SHALL prevent modification of the account number while allowing changes to account holder name and bank name

### Requirement 2: Cash Register Management

**User Story:** As an Administrator, I want to define and manage cash registers in the system, so that I can track physical cash holdings accurately.

#### Acceptance Criteria

1. THE System SHALL allow the Administrator to create, edit, and deactivate Cash_Register records
2. WHEN a Cash_Register is created, THE System SHALL require a name (between 1 and 100 characters) and an opening balance (a non-negative numeric value with up to two decimal places)
3. THE System SHALL display the current running balance for each active Cash_Register, calculated as the opening balance plus all recorded cash inflows minus all recorded cash outflows
4. WHEN a cash transaction is recorded, THE System SHALL update the corresponding Cash_Register balance within 2 seconds and reflect the new balance on the Cash_Register detail view
5. WHEN a Cash_Register is deactivated, THE System SHALL prevent new transactions from being recorded against that Cash_Register
6. IF the Operator attempts to record a transaction against a deactivated Cash_Register, THEN THE System SHALL display an error message indicating the Cash_Register is inactive and reject the transaction

### Requirement 3: Multiple Operators

**User Story:** As an Administrator, I want to create multiple Operator accounts, so that each salesperson has their own login and their sales activity is tracked individually.

#### Acceptance Criteria

1. THE System SHALL allow the Administrator to create, edit, and deactivate Operator accounts
2. WHEN an Operator account is created, THE System SHALL require a name (maximum 100 characters), a unique username (3 to 50 alphanumeric characters), and a password (minimum 6 characters)
3. IF the Administrator attempts to create an Operator account with a username that already exists, THEN THE System SHALL reject the creation and display an error message indicating the username is already taken
4. WHEN an Operator processes a sale, THE System SHALL record the Operator identity on the Invoice
5. THE System SHALL generate a per-Operator sales report showing total sales, transaction count, and revenue for a specified date range
6. THE System SHALL allow the Administrator to assign access permissions to each Operator, controlling at minimum the ability to process sales, issue refunds, modify inventory, and view reports
7. IF an Operator account is deactivated, THEN THE System SHALL prevent that Operator from logging in while preserving all historical Invoices and reports associated with that Operator

### Requirement 4: Inventory Management

**User Story:** As an Operator, I want to manage FMCG product inventory, so that I can track stock levels, receive goods, and identify low-stock items.

#### Acceptance Criteria

1. THE System SHALL allow the Operator to create, edit, and deactivate Product records with name (maximum 150 characters), barcode (unique, maximum 20 characters), unit of measure, Product_Category, purchase price (0.01 to 999,999,999.99), and sale price (0.01 to 999,999,999.99)
2. WHEN goods are received, THE Inventory_Module SHALL record a goods receipt entry capturing the Product, received quantity (minimum 1), receipt date, and increase the stock quantity for the corresponding Product
3. WHEN a sale is completed, THE Inventory_Module SHALL decrease the stock quantity for each sold Product by the sold quantity, allowing stock to reach zero but not below zero
4. IF a sale would reduce stock quantity below zero for any Product, THEN THE System SHALL display a warning to the Operator and require confirmation before completing the sale
5. WHILE stock quantity for a Product is at or below a configurable reorder threshold (default 10 units, configurable per Product from 0 to 99,999), THE System SHALL display a visual low-stock warning indicator next to that Product in product list and detail views
6. THE Inventory_Module SHALL provide a stock valuation summary showing total inventory value for all active Products with stock quantity greater than zero, calculated as stock quantity multiplied by purchase price
7. THE Inventory_Module SHALL support stock adjustment entries for damaged, expired, or lost goods, requiring a quantity to reduce, an adjustment reason selected from a predefined list, and a mandatory free-text note field (maximum 500 characters)
8. WHEN a Barcode_Scanner reads a barcode, THE System SHALL look up and display the matching Product within 1 second
9. IF a Barcode_Scanner reads a barcode that does not match any active Product, THEN THE System SHALL display a notification indicating no matching product was found

### Requirement 5: Basic Accounting

**User Story:** As an Administrator, I want basic accounting capabilities, so that I can track income, expenses, and the overall financial health of the shop.

#### Acceptance Criteria

1. WHEN a sale is completed, THE Accounting_Module SHALL automatically create a journal entry debiting the payment account and crediting the revenue account for the exact Invoice total amount, before any subsequent transaction can be processed
2. WHEN an expense is recorded, THE Accounting_Module SHALL automatically create a journal entry debiting the selected expense account and crediting the selected payment account for the entered expense amount
3. WHEN the Administrator records an expense, THE Accounting_Module SHALL require a date, amount greater than zero, expense account category, payment account, and a description of at least 3 characters
4. THE Accounting_Module SHALL maintain a chart of accounts with predefined categories including assets (cash, bank, inventory, accounts receivable), liabilities (accounts payable), equity (owner equity), revenue (sales revenue), and expenses (cost of goods sold, rent, utilities, salaries, other expenses)
5. THE Accounting_Module SHALL provide a profit and loss report for a user-specified date range showing total revenue, total expenses grouped by expense account, and the resulting net profit or net loss
6. THE Accounting_Module SHALL provide a balance sheet report showing total assets, total liabilities, and total equity as of a specified date, where total assets equals total liabilities plus total equity
7. THE Accounting_Module SHALL enforce double-entry bookkeeping such that every journal entry has equal total debit and total credit amounts
8. IF the Administrator attempts to record an expense with any required field missing or an amount of zero or less, THEN THE Accounting_Module SHALL reject the entry and display an error message indicating which field is invalid

### Requirement 6: General Reports

**User Story:** As an Administrator, I want to generate common business reports, so that I can make informed decisions about the shop.

#### Acceptance Criteria

1. WHEN the Administrator selects the daily sales summary report and specifies a date, THE System SHALL generate a report showing total revenue, number of transactions, and a breakdown of totals per payment method (cash, card, credit) for that date
2. THE System SHALL generate an inventory status report listing all active Products with current quantities and stock values calculated from purchase prices
3. THE System SHALL generate a customer credit report listing all Customer_Accounts with outstanding balances greater than zero, showing balance amounts grouped into aging buckets of 0-30 days, 31-60 days, 61-90 days, and over 90 days
4. THE System SHALL generate a cash flow report showing all inflows and outflows categorized by source (sales, expenses, repayments) for a specified date range
5. WHEN a report is generated, THE System SHALL allow the Operator to export the report in PDF format
6. WHEN a report is generated, THE System SHALL allow the Operator to filter results by date range using start date and end date inputs
7. IF a report is generated and no data exists for the selected criteria, THEN THE System SHALL display a message indicating no records were found for the specified period

### Requirement 7: POS Terminal Integration

**User Story:** As an Operator, I want the system to send the payment amount directly to the connected bank POS terminal, so that I do not have to manually type the amount on the device.

#### Acceptance Criteria

1. WHEN an Invoice is created and the Operator selects POS card payment, THE System SHALL send the card payment portion of the total payable amount to the connected POS_Terminal within 5 seconds of the Operator's selection
2. WHEN the POS_Terminal confirms a successful transaction, THE System SHALL mark the Invoice as paid and record the transaction reference number
3. IF the POS_Terminal reports a failed or declined transaction, THEN THE System SHALL display the failure reason to the Operator and keep the Invoice in unpaid status
4. IF the POS_Terminal does not respond within 10 seconds of the payment request, THEN THE System SHALL display a connection error message to the Operator and allow manual entry of the transaction reference
5. THE System SHALL allow the Administrator to configure the POS_Terminal connection parameters including at minimum: port, protocol, and device model
6. WHILE a POS_Terminal transaction is pending, THE System SHALL display a waiting indicator to the Operator and provide a cancel option that returns the Invoice to unpaid status
7. IF the POS_Terminal does not return a transaction result within 120 seconds, THEN THE System SHALL time out the request, notify the Operator, and allow manual entry of the transaction reference or a retry

### Requirement 8: Cash Payment Support

**User Story:** As an Operator, I want to process cash payments, so that customers can pay with physical currency and the transaction is properly recorded.

#### Acceptance Criteria

1. WHEN an Invoice is created and the Operator selects cash payment, THE System SHALL prompt the Operator to enter the cash amount received and select the target Cash_Register (defaulting to the Operator's assigned Cash_Register if only one is active)
2. WHEN the entered cash amount is equal to or exceeds the Invoice total, THE System SHALL calculate and display the change amount (cash received minus Invoice total) rounded to the smallest currency denomination
3. IF the entered cash amount is less than the Invoice total and split payment is not selected, THEN THE System SHALL display an error message indicating insufficient payment and prevent recording the transaction
4. WHEN a cash payment is recorded, THE System SHALL mark the Invoice as paid and increase the Cash_Register balance by the Invoice payment amount (excluding change returned)
5. WHEN the Operator selects split payment, THE System SHALL allow the Operator to assign a portion of the Invoice total to cash and the remainder to one other payment method, where each portion must be greater than zero and the sum of all portions must equal the Invoice total exactly
6. IF a split payment is selected and the sum of assigned portions does not equal the Invoice total, THEN THE System SHALL display an error message indicating the mismatch and prevent recording the transaction
7. WHEN all portions of a split payment are successfully recorded, THE System SHALL mark the Invoice as paid

### Requirement 9: Credit/Deferred Payment

**User Story:** As an Operator, I want to record a deferred payment against a customer's account, so that the shop can track who owes money and follow up on collections.

#### Acceptance Criteria

1. WHEN an Invoice is created and the Operator selects credit payment, THE System SHALL require selection of an existing Customer_Account before the payment can be recorded
2. WHEN a credit payment is recorded, THE System SHALL add the Invoice amount to the Customer_Account outstanding balance and record a reference to the originating Invoice on the Customer_Account ledger
3. WHEN a credit payment is recorded, THE System SHALL allow the Operator to add a free-text note of up to 500 characters describing the credit arrangement
4. THE System SHALL display the total outstanding balance and a list of individual credit entries with Invoice reference, date, and amount on the Customer_Account detail view
5. WHEN a customer makes a partial or full repayment, THE System SHALL reduce the Customer_Account outstanding balance by the repayment amount
6. IF the Operator enters a repayment amount that exceeds the Customer_Account outstanding balance, THEN THE System SHALL reject the entry and display an error message indicating the maximum repayable amount
7. THE System SHALL support split payments where part is paid immediately (minimum 0.01 in shop currency) and the remainder (minimum 0.01 in shop currency) is recorded as credit against the Customer_Account
8. IF the Operator selects credit payment and no Customer_Account exists for the customer, THEN THE System SHALL allow the Operator to create a new Customer_Account before proceeding with the credit payment

### Requirement 10: Persian/Farsi Localization

**User Story:** As an Operator, I want the interface to be partially in Persian with RTL layout support, so that I can use the system comfortably in my native language.

#### Acceptance Criteria

1. THE System SHALL provide Persian (Farsi) translations for all navigation menu items, form field labels, button texts, dialog messages, and validation messages used in the Sales, Inventory, Accounting, and Reporting modules
2. WHILE Persian locale is active, THE System SHALL render the user interface in Right-to-Left layout with right-aligned text, mirrored navigation, and right-to-left reading order
3. THE System SHALL support entry, storage, display, and search of Persian text in product names, customer names, notes, and description fields
4. WHILE Persian locale is active, THE System SHALL format numbers using Persian numeral characters (۰-۹) with a forward slash (/) as the thousand separator and a dot (.) as the decimal separator
5. WHILE Persian locale is active, THE System SHALL use the Jalali (Solar Hijri) calendar for all date displays and date picker inputs, formatted as YYYY/MM/DD
6. WHEN a report is exported, THE System SHALL render Persian text in the exported PDF using an embedded font that supports Persian characters, with right-to-left paragraph direction and correct joining of Persian letter forms
7. THE System SHALL allow the Administrator to set Persian as the default locale, and allow each Operator to activate or deactivate Persian locale from their user preferences

### Requirement 11: Offline Mode with Synchronization

**User Story:** As an Operator, I want the system to continue working when internet connectivity is lost, so that I can still process sales and the data syncs when connectivity returns.

#### Acceptance Criteria

1. WHEN internet connectivity is lost, THE Sync_Engine SHALL detect the loss within 10 seconds and store all new transactions (sales, payments, inventory adjustments, and customer account updates) locally on the device
2. WHILE the System is operating in offline mode, THE System SHALL display a persistent offline indicator visible on every screen without requiring Operator dismissal
3. WHEN internet connectivity is restored, THE Sync_Engine SHALL begin synchronizing all locally stored transactions to the server within 30 seconds of detecting restored connectivity
4. IF a synchronization conflict is detected (the same record was modified both locally and on the server during the offline period), THEN THE Sync_Engine SHALL preserve both versions and flag the conflict for Administrator review
5. THE Sync_Engine SHALL synchronize transactions in chronological order to maintain data consistency
6. WHILE the System is operating in offline mode, THE System SHALL allow the Operator to complete sales, record payments, and update inventory with the same response times as online operation
7. IF the Sync_Engine fails to synchronize a transaction after 3 retry attempts, THEN THE Sync_Engine SHALL mark the transaction as failed, notify the Administrator, and retain the transaction locally for manual resolution
8. WHILE the System is operating in offline mode, THE System SHALL retain locally stored transactions for a minimum of 7 days of continuous offline operation
