# Technical Design Document

## Introduction

This document describes the technical design for customizing Odoo Community Edition (v18) to serve a small FMCG shop. The customization is implemented as a set of custom Odoo addons (modules) that extend core Odoo functionality without modifying the base code.

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                    │
│  ┌───────────────────────────────────────────────┐  │
│  │  Odoo Web Client (OWL Framework)              │  │
│  │  - POS Interface (offline-capable)            │  │
│  │  - Backend Interface (forms, lists, reports)  │  │
│  │  - RTL/Persian locale layer                   │  │
│  │  - IndexedDB (offline transaction storage)    │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP/JSON-RPC
┌─────────────────────┴───────────────────────────────┐
│              Odoo Server (Python)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Custom Addons (our modules)                  │  │
│  │  ├── fmcg_base        (core config)           │  │
│  │  ├── fmcg_bank_cash   (bank & cash mgmt)     │  │
│  │  ├── fmcg_inventory   (stock extensions)      │  │
│  │  ├── fmcg_accounting  (accounting extensions) │  │
│  │  ├── fmcg_reports     (custom reports)        │  │
│  │  ├── fmcg_pos_terminal(POS device integration)│  │
│  │  ├── fmcg_credit      (credit/deferred pay)   │  │
│  │  ├── fmcg_persian     (Persian localization)  │  │
│  │  └── fmcg_offline     (offline sync engine)   │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Odoo Core Modules (unmodified)               │  │
│  │  - account, stock, point_of_sale, base, etc.  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────┐
│              PostgreSQL Database                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│        External Hardware                             │
│  ┌──────────────┐  ┌──────────────────────────┐    │
│  │ POS Terminal │  │ Barcode Scanner (USB/BT)  │    │
│  │ (Serial/TCP) │  └──────────────────────────┘    │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Custom addons approach**: All customizations live in separate addon modules that depend on and extend core Odoo modules. This ensures upgradeability.
2. **Odoo 18 Community**: Target version. Uses OWL 2 for frontend components.
3. **POS-based sales**: Use Odoo's built-in Point of Sale module as the primary sales interface (already has offline support).
4. **Inheritance over modification**: Use Odoo's inheritance mechanisms (Python class inheritance + XML view inheritance) to extend existing models and views.

## Module Design

### Module 1: fmcg_base

**Purpose**: Core configuration and shared utilities for all FMCG modules.

**Dependencies**: `base`, `point_of_sale`

**Models**:
- Extends `res.company` to add FMCG-specific settings
- Extends `res.users` to add operator-level permissions

**Key Fields**:
```python
class ResCompany(models.Model):
    _inherit = 'res.company'
    
    fmcg_default_locale = fields.Selection([
        ('en_US', 'English'),
        ('fa_IR', 'Persian')
    ], default='fa_IR')
    fmcg_pos_terminal_enabled = fields.Boolean(default=False)
    fmcg_offline_mode_enabled = fields.Boolean(default=True)
```

---

### Module 2: fmcg_bank_cash

**Purpose**: Bank account and cash register management.

**Dependencies**: `account`, `fmcg_base`

**Models**:
- Extends `account.journal` (Odoo's existing bank/cash journal model)
- Adds validation logic for account number uniqueness and deactivation rules

**Key Extensions**:
```python
class AccountJournal(models.Model):
    _inherit = 'account.journal'
    
    fmcg_account_holder = fields.Char(string='Account Holder', size=100)
    fmcg_account_number = fields.Char(string='Account Number', size=26)
    fmcg_opening_balance = fields.Monetary(string='Opening Balance')
    fmcg_is_active = fields.Boolean(default=True)
    
    @api.constrains('fmcg_account_number')
    def _check_unique_account_number(self):
        # Enforce unique account numbers
        ...
    
    @api.model
    def get_running_balance(self):
        # Calculate opening + sum(transactions)
        ...
```

**Views**: Extends bank/cash journal form to show FMCG fields.

**Requirement Coverage**: R1 (Bank Account), R2 (Cash Register)

---

### Module 3: fmcg_inventory

**Purpose**: FMCG-specific inventory extensions including low-stock warnings, barcode lookup, and stock adjustments.

**Dependencies**: `stock`, `product`, `barcodes`, `fmcg_base`

**Models**:
- Extends `product.template` with reorder threshold and FMCG fields
- Extends `stock.picking` for goods receipt enhancements
- New model `fmcg.stock.adjustment` for damaged/expired goods

**Key Extensions**:
```python
class ProductTemplate(models.Model):
    _inherit = 'product.template'
    
    fmcg_reorder_threshold = fields.Integer(default=10, string='Reorder Threshold')
    fmcg_is_low_stock = fields.Boolean(compute='_compute_low_stock', store=True)
    
    @api.depends('qty_available', 'fmcg_reorder_threshold')
    def _compute_low_stock(self):
        for product in self:
            product.fmcg_is_low_stock = product.qty_available <= product.fmcg_reorder_threshold


class FmcgStockAdjustment(models.Model):
    _name = 'fmcg.stock.adjustment'
    _description = 'Stock Adjustment for Damaged/Expired/Lost Goods'
    
    product_id = fields.Many2one('product.product', required=True)
    quantity = fields.Float(required=True)
    reason = fields.Selection([
        ('damaged', 'Damaged'),
        ('expired', 'Expired'),
        ('lost', 'Lost'),
        ('other', 'Other')
    ], required=True)
    note = fields.Text(required=True, size=500)
    date = fields.Date(default=fields.Date.today)
    user_id = fields.Many2one('res.users', default=lambda self: self.env.user)
```

**Requirement Coverage**: R4 (Inventory Management)

---

### Module 4: fmcg_accounting

**Purpose**: Basic accounting extensions for simple shop accounting.

**Dependencies**: `account`, `fmcg_base`, `fmcg_bank_cash`

**Models**:
- Extends `account.move` for automatic journal entries on sales
- New model `fmcg.expense` for simple expense recording
- Predefined chart of accounts template

**Key Logic**:
```python
class FmcgExpense(models.Model):
    _name = 'fmcg.expense'
    _description = 'Simple Expense Entry'
    
    date = fields.Date(required=True, default=fields.Date.today)
    amount = fields.Monetary(required=True)
    account_id = fields.Many2one('account.account', required=True,
        domain="[('account_type', '=', 'expense')]")
    payment_journal_id = fields.Many2one('account.journal', required=True)
    description = fields.Char(required=True, size=200)
    
    def action_confirm(self):
        """Create double-entry journal entry for the expense"""
        move_vals = {
            'journal_id': self.payment_journal_id.id,
            'date': self.date,
            'line_ids': [
                (0, 0, {'debit': self.amount, 'account_id': self.account_id.id}),
                (0, 0, {'credit': self.amount, 'account_id': self.payment_journal_id.default_account_id.id}),
            ]
        }
        self.env['account.move'].create(move_vals)
```

**Data Files**: `data/chart_of_accounts_fmcg.xml` — predefined accounts for a small retail shop.

**Requirement Coverage**: R5 (Basic Accounting)

---

### Module 5: fmcg_reports

**Purpose**: Custom reports for daily sales, inventory status, customer credit, and cash flow.

**Dependencies**: `account`, `stock`, `point_of_sale`, `fmcg_credit`, `fmcg_base`

**Reports**:
| Report | Source Models | Output |
|--------|-------------|--------|
| Daily Sales Summary | `pos.order`, `account.payment` | Revenue, tx count, payment method breakdown |
| Inventory Status | `product.product`, `stock.quant` | All products with qty and valuation |
| Customer Credit | `fmcg.customer.credit` | Outstanding balances with aging buckets |
| Cash Flow | `account.move.line` | Inflows/outflows by source category |

**Implementation**: Uses Odoo's QWeb report engine for PDF generation with Persian font support.

**Requirement Coverage**: R6 (General Reports)

---

### Module 6: fmcg_pos_terminal

**Purpose**: Integration with physical bank POS terminal device for automatic amount transmission.

**Dependencies**: `point_of_sale`, `fmcg_base`

**Architecture**:
```
POS Frontend (OWL) → JSON-RPC → Odoo Server → Serial/TCP → POS Terminal Device
```

**Key Components**:
- `PosTerminalDriver` (Python): Handles serial/TCP communication with the device
- `PaymentTerminal` (JS/OWL): Frontend component showing waiting state, cancel option
- Configuration wizard for port, protocol, device model

**Communication Flow**:
1. Operator clicks "Card Payment" in POS
2. Frontend sends payment request to backend via RPC
3. Backend `PosTerminalDriver` sends amount to device via configured protocol
4. Device processes card → returns success/failure + reference number
5. Backend relays result to frontend
6. Frontend updates order status

**Key Model**:
```python
class PosTerminalConfig(models.Model):
    _name = 'fmcg.pos.terminal.config'
    _description = 'POS Terminal Device Configuration'
    
    name = fields.Char(required=True)
    port = fields.Char(required=True, help='COM port or TCP address')
    protocol = fields.Selection([
        ('serial', 'Serial (RS232)'),
        ('tcp', 'TCP/IP'),
    ], required=True, default='serial')
    device_model = fields.Char()
    baud_rate = fields.Integer(default=9600)
    timeout = fields.Integer(default=120, help='Transaction timeout in seconds')
    pos_config_id = fields.Many2one('pos.config')
```

**Timeouts**: 10s connection timeout, 120s transaction timeout (per R7 requirements).

**Requirement Coverage**: R7 (POS Terminal Integration)

---

### Module 7: fmcg_credit

**Purpose**: Credit/deferred payment system with customer account tracking.

**Dependencies**: `account`, `point_of_sale`, `fmcg_base`

**Models**:
```python
class FmcgCustomerCredit(models.Model):
    _name = 'fmcg.customer.credit'
    _description = 'Customer Credit Entry'
    
    partner_id = fields.Many2one('res.partner', required=True, string='Customer')
    invoice_ref = fields.Char(string='Invoice Reference')
    amount = fields.Monetary(required=True)
    note = fields.Text(size=500)
    date = fields.Date(default=fields.Date.today)
    state = fields.Selection([
        ('open', 'Open'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid')
    ], default='open')
    paid_amount = fields.Monetary(default=0)
    remaining = fields.Monetary(compute='_compute_remaining', store=True)


class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    fmcg_credit_ids = fields.One2many('fmcg.customer.credit', 'partner_id')
    fmcg_total_outstanding = fields.Monetary(compute='_compute_outstanding')
```

**POS Integration**: Adds "Credit" as a payment method in POS with customer selection popup.

**Requirement Coverage**: R8 (Cash Payment - via core POS), R9 (Credit/Deferred Payment)

---

### Module 8: fmcg_persian

**Purpose**: Persian/Farsi localization with RTL, Jalali calendar, and Persian numerals.

**Dependencies**: `base`, `web`, `fmcg_base`

**Components**:
- **Translation files**: `i18n/fa_IR.po` covering all FMCG module strings
- **Jalali calendar widget**: OWL component replacing date pickers when Persian locale is active
- **RTL CSS**: Stylesheet overrides for RTL layout
- **Persian PDF font**: Embedded font (e.g., IRANSans) for report export
- **Number formatting**: Persian numeral display utility

**Key Frontend Component** (OWL):
```javascript
// Jalali date picker component
export class JalaliDatePicker extends Component {
    setup() {
        this.state = useState({ jalaliDate: '' });
        // Convert Gregorian to Jalali on display
        // Convert Jalali to Gregorian on save
    }
}
```

**Python Utility**:
```python
# Uses jdatetime library for Jalali conversion
import jdatetime

def gregorian_to_jalali(date):
    jdate = jdatetime.date.fromgregorian(date=date)
    return jdate.strftime('%Y/%m/%d')
```

**Requirement Coverage**: R10 (Persian/Farsi Localization)

---

### Module 9: fmcg_offline

**Purpose**: Offline operation and synchronization engine.

**Dependencies**: `point_of_sale`, `fmcg_base`

**Architecture**:
- Leverages Odoo POS's built-in offline capability (IndexedDB storage)
- Extends offline support to inventory adjustments and credit entries
- Adds sync conflict detection and resolution UI

**Frontend (OWL)**:
- Offline indicator component (persistent banner)
- Transaction queue manager (IndexedDB)
- Connectivity monitor (ping every 5 seconds)

**Backend (Python)**:
- Sync endpoint receiving batched transactions
- Conflict detection (timestamp comparison)
- Admin conflict resolution view

**Sync Flow**:
```
1. Connectivity lost → detected within 10s
2. All operations stored in IndexedDB with timestamps
3. Connectivity restored → detected within 30s
4. Client sends queued transactions in chronological order
5. Server processes each, checking for conflicts
6. Conflicts flagged for admin review
7. Retry failed syncs up to 3 times
8. Local storage retained for minimum 7 days
```

**Requirement Coverage**: R11 (Offline Mode with Synchronization)

---

## Data Model Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ res.partner  │────▶│fmcg.customer.    │     │ product.product │
│ (Customer)   │     │credit            │     │ (+ fmcg fields) │
└──────────────┘     └──────────────────┘     └─────────────────┘
                                                       │
┌──────────────┐     ┌──────────────────┐             │
│account.journal│    │ pos.order        │◀────────────┘
│(Bank/Cash)   │◀───│ (Sales)          │
└──────────────┘     └──────────────────┘
                            │
                     ┌──────┴──────────┐
                     │ account.move     │
                     │ (Journal Entries)│
                     └─────────────────┘

┌──────────────────────┐     ┌─────────────────────┐
│fmcg.pos.terminal.    │     │fmcg.stock.adjustment│
│config                │     │                     │
└──────────────────────┘     └─────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+, Odoo 18 CE |
| Frontend | OWL 2 (Odoo Web Library) |
| Database | PostgreSQL 15+ |
| POS Terminal Communication | pyserial / socket |
| Jalali Calendar | jdatetime (Python), custom OWL widget (JS) |
| PDF Reports | QWeb + wkhtmltopdf with Persian fonts |
| Offline Storage | IndexedDB (browser) |
| Barcode | Odoo barcodes module (built-in) |

## Deployment

The system runs as a standard Odoo installation with custom addons:

```
odoo/
├── odoo/                    # Odoo core (from git)
├── addons/                  # Odoo standard addons
└── custom_addons/           # Our FMCG modules
    ├── fmcg_base/
    ├── fmcg_bank_cash/
    ├── fmcg_inventory/
    ├── fmcg_accounting/
    ├── fmcg_reports/
    ├── fmcg_pos_terminal/
    ├── fmcg_credit/
    ├── fmcg_persian/
    └── fmcg_offline/
```

Configuration: `--addons-path=odoo/addons,custom_addons`

## Requirements Traceability

| Requirement | Module(s) |
|-------------|-----------|
| R1: Bank Account Definition | fmcg_bank_cash |
| R2: Cash Register Management | fmcg_bank_cash |
| R3: Multiple Operators | fmcg_base (extends res.users) |
| R4: Inventory Management | fmcg_inventory |
| R5: Basic Accounting | fmcg_accounting |
| R6: General Reports | fmcg_reports |
| R7: POS Terminal Integration | fmcg_pos_terminal |
| R8: Cash Payment Support | point_of_sale (core) + fmcg_bank_cash |
| R9: Credit/Deferred Payment | fmcg_credit |
| R10: Persian/Farsi Localization | fmcg_persian |
| R11: Offline Mode with Sync | fmcg_offline |
