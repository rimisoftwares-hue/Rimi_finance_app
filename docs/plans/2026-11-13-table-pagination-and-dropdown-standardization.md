# Table Pagination & Dropdown Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize table pagination across the entire app (excluding `accounts/*`) using the Lead Calling style (`Page X of Y • [15, 25, 50 / page] ... [Prev] [Next]`) with Radix UI dropdowns, and harmonize dropdown styling across all pages to match the theme used in Vehicle and Payment forms.

**Architecture:** Build a high-performance reusable `TablePagination` component and `useClientPagination` hook under `frontend/src/components/common/table/`, accompanied by a lightweight `AppSelect` wrapper around Radix UI `@/components/ui/select`. Wire this consistent UI into all core tables (`Customers`, `UnpaidLoans`, `Loans`, `Bill`, `PendingCollections`, `KYCPending`, `StaffLoginReport`, `PaymentReport`, `Notices`, and `LeadCalling`), strictly preserving `accounts/*` (DayBook, Ledger, etc.) untouched.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Radix UI (`@radix-ui/react-select`), Vite.

---

### Task 1: Create Reusable `TablePagination` Component & `useClientPagination` Hook

**Files:**
- Create: `frontend/src/components/common/table/TablePagination.tsx`
- Create: `frontend/src/hooks/useClientPagination.ts`
- Create: `frontend/src/components/common/table/index.ts`

**Step 1: Write `useClientPagination` Hook**

```typescript
// frontend/src/hooks/useClientPagination.ts
import { useState, useMemo, useEffect } from 'react';

export interface UseClientPaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

export function useClientPagination<T>(
  items: T[],
  options: UseClientPaginationOptions = {}
) {
  const { initialPage = 1, initialPageSize = 15 } = options;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 if total item count changes significantly or filters re-apply
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Ensure current page is bounded
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  return {
    page: safePage,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
    hasPrevPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}
```

**Step 2: Create `TablePagination.tsx` Component**

```tsx
// frontend/src/components/common/table/TablePagination.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

export interface TablePaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  totalItems?: number;
  startIndex?: number;
  endIndex?: number;
  disabled?: boolean;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50],
  totalItems,
  startIndex,
  endIndex,
  disabled = false,
  className = '',
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  return (
    <div
      className={`px-4 py-3 border-t border-border bg-secondary/20 flex flex-wrap items-center justify-between gap-3 text-xs ${className}`}
    >
      {/* Left: Page count + Page Size Dropdown */}
      <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
        <span>
          Page <strong className="text-foreground">{safePage}</strong> of{' '}
          <strong className="text-foreground">{safeTotalPages}</strong>
        </span>
        {totalItems !== undefined && (
          <>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground hidden sm:inline">
              {startIndex !== undefined && endIndex !== undefined ? (
                <>
                  Showing <strong className="text-foreground">{startIndex}</strong>–
                  <strong className="text-foreground">{endIndex}</strong> of{' '}
                  <strong className="text-foreground">{totalItems}</strong>
                </>
              ) : (
                <><strong className="text-foreground">{totalItems}</strong> items</>
              )}
            </span>
          </>
        )}
        <span className="text-muted-foreground/60">•</span>
        <div className="w-[105px]">
          <Select
            value={String(pageSize)}
            onValueChange={(val) => onPageSizeChange(Number(val))}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 px-2 text-xs bg-background border-border text-foreground hover:bg-secondary/40 transition-colors">
              <SelectValue placeholder={`${pageSize} / page`} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)} className="text-xs">
                  {opt} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: Prev & Next buttons */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={safePage <= 1 || disabled}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="h-7 px-2.5 text-xs gap-1 hover:bg-secondary/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={safePage >= safeTotalPages || disabled}
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          className="h-7 px-2.5 text-xs gap-1 hover:bg-secondary/50"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
```

**Step 3: Export from Barrel**

```typescript
// frontend/src/components/common/table/index.ts
export * from './TablePagination';
```

**Step 4: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

---

### Task 2: Create Reusable `AppSelect` Dropdown Wrapper

**Files:**
- Create: `frontend/src/components/common/AppSelect.tsx`
- Modify: `frontend/src/components/common/index.ts`

**Step 1: Implement `AppSelect`**

```tsx
// frontend/src/components/common/AppSelect.tsx
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export interface AppSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface AppSelectProps<T extends string = string> {
  value: T;
  onValueChange: (val: T) => void;
  options: AppSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
}

export function AppSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select option',
  disabled = false,
  triggerClassName = '',
  size = 'md',
}: AppSelectProps<T>) {
  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={`bg-background border-input ${heightClass} ${triggerClassName}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border max-h-60 overflow-y-auto z-50">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              {opt.icon}
              <span>{opt.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Step 2: Export in `frontend/src/components/common/index.ts`**

Add:
```typescript
export * from './AppSelect';
export * from './table';
```

**Step 3: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 3: Upgrade `LeadCalling.tsx` Dropdown & Pagination

**Files:**
- Modify: `frontend/src/components/ai/LeadCalling.tsx:1918-1960`

**Step 1: Replace Native `<select>` in Desktop Table Pagination with `TablePagination`**

Replace lines 1918–1960 in `frontend/src/components/ai/LeadCalling.tsx`:
```tsx
        {/* Pagination Footer */}
        {pagination.totalItems > 0 && (
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            totalItems={pagination.totalItems}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            pageSizeOptions={[15, 25, 50]}
            disabled={isLoadingLeads}
          />
        )}
```

**Step 2: Check Mobile View Pagination in `LeadCalling.tsx` (lines 2064–2086)**

Harmonize mobile pagination with standard buttons and text.

**Step 3: Verify in Browser & Test Build**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 4: Standardize `Customers.tsx` & `UnpaidLoans.tsx`

**Files:**
- Modify: `frontend/src/pages/Customers.tsx`
- Modify: `frontend/src/pages/UnpaidLoans.tsx`

**Step 1: Update `Customers.tsx`**

1. Import `useClientPagination` and `TablePagination`.
2. Wrap `filteredCustomers` with:
   ```tsx
   const {
     paginatedItems: pagedCustomers,
     page,
     pageSize,
     setPage,
     setPageSize,
     totalPages,
     totalItems,
     startIndex,
     endIndex,
   } = useClientPagination(filteredCustomers, { initialPageSize: 15 });
   ```
3. Map over `pagedCustomers` in `<tbody>`.
4. Add `<TablePagination ... />` right below `</table></div>`.
5. Align table column header styling to match `LeadCalling.tsx` (`bg-secondary/50 border-b border-border text-muted-foreground uppercase text-xs tracking-wider font-semibold`).

**Step 2: Update `UnpaidLoans.tsx`**

1. Import `useClientPagination` and `TablePagination`.
2. Apply `useClientPagination(filteredCustomers, { initialPageSize: 15 })`.
3. Map over `pagedCustomers` in `<tbody>`.
4. Add `<TablePagination ... />` at the bottom of the table container.
5. Align table headers with `LeadCalling.tsx` visual design.

**Step 3: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 5: Standardize `Loans.tsx` & `Bill.tsx`

**Files:**
- Modify: `frontend/src/pages/Loans.tsx`
- Modify: `frontend/src/components/reports/Bill.tsx`

**Step 1: Update `Loans.tsx`**

1. Add `useClientPagination` for filtered loans with page size 15.
2. Render `TablePagination` at the bottom of the table card.
3. Map over `paginatedLoans`.

**Step 2: Update `Bill.tsx`**

1. Add `useClientPagination` for bills / receipts table.
2. Render `TablePagination` at the bottom of the card.
3. Compute table footer totals for current view vs overall total.

**Step 3: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 6: Harmonize `PendingCollections.tsx` & `KYCPending.tsx`

**Files:**
- Modify: `frontend/src/components/collections/PendingCollections.tsx`
- Modify: `frontend/src/components/collections/KYCPending.tsx`

**Step 1: Update `PendingCollections.tsx`**

1. Replace the custom numbered-buttons pagination footer (lines 839–899) with `TablePagination`:
   ```tsx
   {!loading && !error && pagination.total > 0 && (
     <TablePagination
       page={pagination.page}
       totalPages={pagination.totalPages}
       pageSize={pagination.limit}
       totalItems={pagination.total}
       startIndex={(pagination.page - 1) * pagination.limit + 1}
       endIndex={Math.min(pagination.page * pagination.limit, pagination.total)}
       onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
       onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, limit, page: 1 }))}
       pageSizeOptions={[15, 25, 50]}
       disabled={loading}
     />
   )}
   ```
2. Replace raw `<select className="input-field ...">` filters with Radix `AppSelect` / `@/components/ui/select`.

**Step 2: Update `KYCPending.tsx`**

1. Replace lines 971–1020 with `TablePagination`.
2. Ensure `pageSizeOptions={[15, 25, 50]}` updates `limit` and re-fetches cleanly.

**Step 3: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 7: Harmonize `StaffLoginReport.tsx` & `PaymentReport.tsx`

**Files:**
- Modify: `frontend/src/components/agents/StaffLoginReport.tsx`
- Modify: `frontend/src/components/PaymentReport/PaymentTable.tsx`
- Modify: `frontend/src/components/PaymentReport/PaymentFilter.tsx`

**Step 1: Update `StaffLoginReport.tsx`**

1. Add `useClientPagination` for `items` (default 15 rows).
2. Render `TablePagination` at the bottom of `<CardContent>`.
3. Clean up the `<SelectTrigger>` styling for the Role filter (`h-9 min-w-[130px] bg-background border-input`) so it looks identical to `PaymentDialog.tsx`.

**Step 2: Update `PaymentReport/PaymentTable.tsx` & `PaymentFilter.tsx`**

1. Add client-side pagination to `PaymentTable.tsx` using `useClientPagination` and `TablePagination`.
2. In `PaymentFilter.tsx`, replace raw `<select id="collectorFilter" ...>` with `AppSelect` or Radix `Select`.

**Step 3: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 8: Standardize Customer Table in `Notices.tsx`

**Files:**
- Modify: `frontend/src/components/Notice/Notices.tsx:1222-1268`

**Step 1: Replace Custom Number Buttons with `TablePagination`**

Replace lines 1222–1268 with `TablePagination`, allowing the user to select `15, 25, 50` records per page instead of the hardcoded 10-item limit.

**Step 2: Verify Compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 9: Strict Exclusions Audit & Final Project Build

**Files:**
- Audit: Verify zero modifications were made to `frontend/src/components/accounts/*`
- Build: Full Vite production build

**Step 1: Audit `git status` for Exclusions**

Run: `git status --porcelain frontend/src/components/accounts/`
Expected: No changes in `frontend/src/components/accounts/`.

**Step 2: Run Full Production Build**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

---

