# TASK: Add a frontend-only "AI Entry" (AI Ledger Scan) dialog to the Loan Entry page

You are working in an existing React + TypeScript + Vite project (Shadcn/Radix UI, Tailwind, Zustand, framer-motion, lucide-react). Work in the phases below, in order. Do NOT skip Phase 0.

---

## PHASE 0: INSPECT FIRST (read-only, no edits yet)

Before writing any code, open and read these, and note the real names:

1. `frontend/src/components/form/MultiStepLoanEntryForm.tsx`
   - Find the top bar where `LoanTypeToggle` is rendered (around lines 440-500).
   - Find `handleToggleRequest`. Check whether it opens a confirmation dialog or RESETS form data when the loan type changes. Report what it does.
2. `frontend/src/components/form/LoanTypeToggle.tsx` - confirm the exported `LoanType` type and its exact values (e.g. `'consulting' | 'vehicle'`).
3. The Zustand form store (search for `useFormStore`). Confirm:
   - the real import path (do NOT assume `@/types/formStore`),
   - the exact signatures of `updateCustomer`, `updateVehicle`, `updateLoan`, `updateGuardian`,
   - the exact field names and value types of customer, vehicle, loan and guardian objects (strings vs numbers, enums for `type` / `loan_type` / `pay_mode`).
4. The toast hook/util used elsewhere in the project (search for `toast(` usage) and confirm the import path.
5. Confirm these exist: `@/components/ui/dialog`, `@/components/ui/button`, `@/components/ui/label`, `framer-motion`, `lucide-react`. If `framer-motion` is missing, do NOT install it; use CSS transitions instead.
6. Confirm the edit screens: `ConsultingEdit.tsx`, `VehicleLoanEdit.tsx`, `MultiStepFormEdit.tsx`. They must stay untouched.

Output a short summary of findings (real import paths, store signatures, what `handleToggleRequest` does) before moving to Phase 1.

---

## PHASE 1: CREATE `frontend/src/components/form/AiEntryDialog.tsx`

Use the REAL import paths and REAL field names/types from Phase 0. Do not invent fields. If a mock value does not fit the real type, adapt it to the type.

### Props
```ts
interface AiEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLoanType: LoanType;
  onLoanTypeSwitch?: (type: LoanType) => void;
}
```

### UI (idle state)
- Compact dialog, `max-w-md`.
- Header: Sparkles icon + title "AI Ledger Scan" + one-line description.
- Single-image drop zone:
  - click-to-browse and drag & drop, accept `image/*` only (JPG/PNG/WebP), max 1 image,
  - invalid file -> destructive toast,
  - after selection: thumbnail (FileReader data URL), file name (truncated), size in KB, and an `X` button to remove (also reset the file input value).
- Loan category selector: two pill buttons "Consulting Loan" / "Vehicle Loan" (default = `activeLoanType`).
- Footer: "Cancel" and "Start AI Scan" (disabled until an image is selected).
- Reset all local state every time the dialog opens.

### Processing state (pure frontend simulation, NO API call)
- Total duration ~2.5 seconds, progress 0 -> 100.
- Implementation rules (important, avoid the common bugs):
  - Use ONE timer mechanism (a single `setInterval` or `requestAnimationFrame` loop) that computes progress from elapsed time. Do NOT mix a random-increment interval with a separate `setTimeout`.
  - Do NOT call `setState` (like `setStatusMessage`) inside another `setState` updater function. Derive the status message from `progress` instead:
    - 0-34%: "Scanning handwritten ledger card..."
    - 35-74%: "Extracting customer, vehicle & loan terms..."
    - 75-99%: "Calculating interest rates & EMI..."
    - 100%: "Verification Completed!"
  - Store timer ids in `useRef` and clear them in a `useEffect` cleanup (unmount / dialog close) so nothing fires after the dialog is gone.
  - While processing, block closing the dialog (ignore `onOpenChange(false)`, no outside-click close).
- Show: circular or linear progress with a percentage counter, status text, and a linear progress bar.
- At 100%: green animated `CheckCircle2` + "Verification Completed!" for ~900 ms, then fill the store, close the dialog, and show toast: title "AI Scan Completed!", description "Form pre-filled. Please review all details."

### Store fill order (important)
1. If `selectedCategory !== activeLoanType`, call `onLoanTypeSwitch(selectedCategory)` FIRST.
2. Then (in the next tick, e.g. `setTimeout(..., 0)` or after the switch resolves) call `updateCustomer`, `updateVehicle`, `updateLoan`, `updateGuardian`.
   Reason: if the loan-type switch resets or confirms-before-switching (check Phase 0 finding), filling first would lose the data. If `handleToggleRequest` opens a confirmation dialog, do NOT fight it: instead pass a switch handler that changes the loan type directly without confirmation, or fill only the matching category and show a toast telling the user to confirm. Choose the simplest option that works with the real code and explain the choice.

### Mock data (Tamil Nadu vehicle finance ledger style; adapt to real types)
Customer: name "S. Karthi", father "Subramaniam" (S/O), HP/ledger no "4820", mobiles 9842103456 and 9443217890, address 14/2 Gandhi Street, Saibaba Colony, Coimbatore, Coimbatore district, Tamil Nadu, 641011, near Vinayagar Temple, lat/long 11.0285 / 76.9421, aadhar 849201948291 (fake), profession "Business / Textile".

Consulting category: vehicle TN38DA4912 TVS King Deluxe Auto 2021 three-wheeler yellow-green; loan amount 65000, 18 months, due day 10, interest 2, EMI 4910, net payable 88380, cash.

Vehicle category: vehicle TN38CY8124 Hero Splendor Plus 2022 two-wheeler black-silver, engine JA05EM12491, chassis MBLHA10EM92041; loan amount 45000, 12 months, due day 5, interest 2, EMI 4650, net payable 55800, cash.

Guardian: "M. Palaniswamy", father "Marimuthu" (S/O), mobile 9789456123, address 8A Kamaraj Nagar, Peelamedu, Coimbatore, 641004, lat/long 11.0250 / 76.9950, aadhar 674109283741 (fake), profession "Agriculture". Link guardian to the customer HP/ledger no if the store has such a field.

Use today's date for the loan date. Put the mock data in a clearly named constant (e.g. `MOCK_LEDGER_DATA`) at the top of the file with a comment: `// TODO: replace with real OCR API response`.

---

## PHASE 2: INTEGRATE INTO `MultiStepLoanEntryForm.tsx` (create flow ONLY)

1. Import `AiEntryDialog` and `Sparkles`; add `const [isAiModalOpen, setIsAiModalOpen] = useState(false);`.
2. In the top bar, directly beside `LoanTypeToggle`, add a compact outline button labelled `AI Entry` with a Sparkles icon (amber accent, `h-9`, `text-xs`, disabled while `isSubmitting`). Wrap button + toggle in one `flex items-center gap-2` container, keeping the existing responsive classes.
3. Render `<AiEntryDialog ... />` once near the end of the component JSX, wired to `isAiModalOpen`, `loanType`, and a switch handler (see fill-order notes).
4. Do NOT modify `ConsultingEdit.tsx`, `VehicleLoanEdit.tsx`, `MultiStepFormEdit.tsx`, or any shared component in a way that makes the button appear there. If `MultiStepLoanEntryForm` is reused by an edit screen, gate the button behind an `isEdit`-style prop/condition so it only shows on the create page (`/loanFrom`).

---

## PHASE 3: VERIFY (mandatory)

1. Run the TypeScript check and lint (`npx tsc --noEmit` and the project's lint script). Fix all errors you introduced.
2. Run the build (`npm run build`) if feasible.
3. Manually trace (or run the dev server and test) these flows:
   - `/loanFrom`: "AI Entry" button sits beside `LoanTypeToggle`.
   - Dialog opens, image select / drag-drop / remove works, non-image is rejected.
   - Category pills switch.
   - "Start AI Scan" -> progress 0 to 100 smoothly, status text changes, green tick at 100%, dialog closes, toast shows.
   - Steps 1 (Customer), 2 (Vehicle & Loan), 3 (Guardian) are pre-filled and editable; no field is wrong-typed or shows `NaN` / `undefined`.
   - Choosing the other category than the active toggle: the toggle switches AND data is still present after the switch.
   - Close dialog mid-processing is blocked; closing/reopening afterwards starts clean; no console errors or state-update-after-unmount warnings.
   - Edit screens have NO AI Entry button.
4. Final report: list changed/created files, the real store field names you used, the decision you made about the loan-type switch, and anything you could not verify.

## RULES
- Frontend only. No new backend calls, no new npm packages.
- Minimal diff outside the two files above. Do not refactor unrelated code.
- Follow existing code style, naming, and UI components.
- If something in this prompt conflicts with the real code, trust the real code, adapt, and mention it in the final report.
