# Technical Design — Phase 2: Custom Frontend

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Browser (React App)                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  Next.js 14 + Tailwind CSS + Vazirmatn        │  │
│  │  ├── /login          (Login page)             │  │
│  │  ├── /onboarding     (Setup wizard)           │  │
│  │  ├── /admin          (Dashboard)              │  │
│  │  ├── /admin/purchase (Purchase invoices)      │  │
│  │  ├── /admin/inventory(Products & stock)       │  │
│  │  ├── /admin/people   (People management)      │  │
│  │  ├── /admin/credits  (Customer credits)       │  │
│  │  ├── /admin/reports  (Reports)                │  │
│  │  ├── /admin/returns  (Sales returns)          │  │
│  │  ├── /admin/settings (Settings)               │  │
│  │  └── /pos            (POS full screen)        │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Service Worker + IndexedDB (Offline POS)     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │ JSON-RPC (HTTP POST)
┌─────────────────────┴───────────────────────────────┐
│              Odoo 18 Backend (existing)               │
│  - /jsonrpc (standard Odoo API)                      │
│  - All FMCG custom modules (already built)           │
│  - PostgreSQL database                               │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              (Root layout - RTL, Vazirmatn)
│   ├── page.tsx                (Redirect to /login)
│   ├── login/page.tsx          (Login form)
│   ├── onboarding/page.tsx     (Setup wizard)
│   ├── pos/page.tsx            (POS - full screen, no sidebar)
│   └── admin/
│       ├── layout.tsx          (Admin layout with sidebar)
│       ├── page.tsx            (Dashboard)
│       ├── purchase/page.tsx   (Purchase invoices)
│       ├── inventory/page.tsx  (Products)
│       ├── people/page.tsx     (People management)
│       ├── credits/page.tsx    (Customer credits)
│       ├── reports/page.tsx    (Reports)
│       ├── returns/page.tsx    (Sales returns)
│       └── settings/page.tsx   (Settings)
├── components/
│   ├── ui/                     (shadcn/ui components)
│   ├── Sidebar.tsx
│   ├── DashCard.tsx
│   ├── ProductGrid.tsx
│   ├── Cart.tsx
│   ├── PaymentDialog.tsx
│   └── OnboardingStep.tsx
├── lib/
│   ├── odoo-api.ts             (Odoo JSON-RPC client)
│   ├── auth.ts                 (Session management)
│   └── utils.ts                (Persian numbers, Jalali dates)
├── stores/
│   ├── auth-store.ts           (Auth state)
│   ├── cart-store.ts           (POS cart state)
│   └── pos-store.ts            (POS products/offline queue)
├── tailwind.config.ts
├── next.config.js
└── package.json
```

## Odoo API Integration

### Authentication
```typescript
// POST /jsonrpc
{
  "jsonrpc": "2.0",
  "method": "call",
  "params": {
    "service": "common",
    "method": "authenticate",
    "args": ["fmcg_shop", "admin", "admin", {}]
  }
}
```

### CRUD Operations
```typescript
// Search products
call('object', 'execute_kw', [db, uid, password, 'product.product', 'search_read', [[['active','=',true]]], {fields: ['name','barcode','list_price','qty_available']}])

// Create purchase invoice
call('object', 'execute_kw', [db, uid, password, 'account.move', 'create', [{...}]])
```

## Key Components

| Component | Role |
|-----------|------|
| `odoo-api.ts` | Single JSON-RPC client with session cookie management |
| `auth-store.ts` | Login state, role (admin/seller), session persistence |
| `cart-store.ts` | POS cart items, totals, payment processing |
| `pos-store.ts` | Product list cache, offline transaction queue |
| `Sidebar.tsx` | Admin navigation (Persian labels, icons) |
| `ProductGrid.tsx` | Responsive grid of products for POS |
| `PaymentDialog.tsx` | Cash/Card/Credit payment flow modal |

## Offline Strategy (POS)

1. On POS load: cache all products in IndexedDB
2. Sales work fully offline against local cache
3. Completed sales queued in IndexedDB
4. When online: sync queue to Odoo in chronological order
5. Visual indicator shows online/offline status
