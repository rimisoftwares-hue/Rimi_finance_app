
// /**
//  * AdvancedLedgerDialog — Tally Prime Advanced Ledger Creation panel.
//  *
//  * Strictly metadata-driven from tally-ledger-fields-reference.md:
//  *  • GROUP_MAP  → which Part-2 field-sets apply per Under Group
//  *  • Each field-set renders the exact fields/hierarchy from Part 1
//  *  • Parent → Child → Grandchild rows use `.tally-row.is-child / .is-grandchild`
//  *
//  * Improvements layered on top of the metadata engine:
//  *  1. Two-column split layout (LEFT = identity/accounting, RIGHT = mailing/banking/tax)
//  *     auto-rebalanced after Under-Group selection.
//  *  2. Tally-style keyboard navigation (Enter / Shift+Enter / Arrow / Tab) that
//  *     walks visible form controls only — hidden conditional fields are skipped.
//  *  3. Real-time conditional activation (Yes immediately reveals child fields).
//  *  4. Banking transaction-type sub-dialogs (Cheque / e-Fund / Card / ECS / DD-PO / Others)
//  *     storing per-type configuration on the form.
//  *  5. F12 / Alt+F12 open Config (callback up to parent).
//  */

// import {
//   useCallback,
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
//   type KeyboardEvent as ReactKeyboardEvent,
//   type ReactNode,
// } from "react";
// import { Save, Settings, ChevronDown, Search, X, Check } from "lucide-react";
// import { Button } from "../ui/button";
// import { Switch } from "../ui/switch";
// import { Checkbox } from "../ui/checkbox";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
//   DialogFooter,
// } from "../ui/dialog";
// import { toast } from "sonner";
// import {
//   useConditionalFields,
//   type ParentGroupInfo,
// } from "./ConfigDialog";

// /* ════════════════════════════════════════════════════════════════════════
//  * 1.  FORM SHAPE (extended — backward compatible)
//  * ════════════════════════════════════════════════════════════════════════ */

// export interface AdvancedLedgerForm {
//   // Basic
//   name: string;
//   alias: string;
//   group: string;
//   inventoryAffected: boolean;
//   effectiveDate: string;
//   openingBalance: string;
//   drCr: "Dr" | "Cr";
//   freezeBalance: boolean;

//   // Mailing
//   showMailingDetails: boolean;
//   mailingName: string;
//   addr1: string;
//   addr2: string;
//   addr3: string;
//   addr4: string;
//   city: string;
//   district: string;
//   state: string;
//   country: string;
//   pincode: string;
//   provideContactDetails: boolean;
//   contactPerson: string;
//   telephone: string;
//   mobile: string;
//   email: string;
//   website: string;
//   primaryMobile: string;

//   // Tax Registration
//   panIt: string;
//   registrationType:
//   | "Regular"
//   | "Composition"
//   | "Unregistered"
//   | "Consumer"
//   | "SEZ Unit"
//   | "SEZ Developer"
//   | "Deemed Export"
//   | "Tax Deductor"
//   | "Tax Collector (E-Commerce)"
//   | "Input Service Distributor"
//   | "Overseas"
//   | "UIN Holder";
//   gstin: string;
//   assesseeOtherTerritory: boolean;
//   territory: string;

//   // Statutory / GST
//   isGstApplicable: "Applicable" | "Not Applicable" | "Undefined" | "As per Company" | "As per Group";
//   setAlterGst: boolean;
//   gstDescription: string;
//   gstApplicableFrom: string;
//   gstHsnSacCode: string;
//   gstTypeOfSupply: "Goods" | "Services";
//   gstTaxability: "Taxable" | "Exempt" | "Nil Rated";
//   gstIgstRate: string;
//   gstCgstRate: string;
//   gstSgstRate: string;
//   gstCessRate: string;
//   gstCessType: "Valorem" | "Quantum";
//   gstReverseCharge: boolean;
//   includeInAssessable: boolean;
//   appropriateTo: "Goods" | "Services" | "Both";
//   methodOfAppropriation: "Based on Value" | "Based on Quantity";

//   // GST extensions (Quantum cess + lifecycle)
//   cessPerUnit: string;
//   cessUnit: string;
//   gstStatus: "Active" | "Cancelled" | "Suspended";
//   cancelledDate: string;

//   // TDS / TCS deductee & buyer categorization
//   taxType: "None" | "TDS" | "TCS";
//   deducteeType: "Individual" | "HUF" | "Firm" | "Company" | "Trust" | "Government" | "AOP";
//   buyerType: "Individual" | "Company" | "Government" | "Exporter" | "SEZ";

//   // Tax Deductor / Collector registration extras
//   tanNumber: string;
//   deductorCategory: string;
//   collectionAccountNo: string;

//   // MSME
//   msmeRegistered: boolean;
//   udyamNumber: string;

//   // e-Invoice
//   einvoiceApplicable: boolean;
//   defaultSupplyType: "B2B" | "SEZ" | "Export" | "Deemed Export";

//   // e-Way Bill
//   ewayBillApplicable: boolean;
//   defaultTransportMode: "Road" | "Rail" | "Air" | "Ship";
//   defaultDistance: string;


//   // Banking (party bank block)
//   provideBankDetails: boolean;
//   accountHolderName: string;
//   bankName: string;
//   branch: string;
//   accountNumber: string;
//   ifsc: string;
//   swift: string;
//   accountType: "Savings" | "Current" | "Cash Credit" | "Overdraft" | "Loan A/c";
//   bankTransactionTypes: string[];
//   /** Per-transaction-type configuration captured via the sub-dialog. */
//   txnConfigs: Record<string, Record<string, string>>;

//   // Bank Configuration (Bank Accounts group only)
//   effectiveDateForReconciliation: string;
//   setAlterChequeBooks: boolean;
//   chequeBookName: string;
//   chequeFrom: string;
//   chequeTo: string;
//   chequeNumberLength: string;
//   enableChequePrinting: boolean;
//   chequePrintBank: string;

//   // Bill-by-bill
//   maintainBillWise: boolean;
//   defaultCreditPeriod: string;
//   checkCreditDaysDuringEntry: boolean;

//   // Type of ledger / Rounding
//   typeOfLedger: "Not Applicable" | "Invoice Rounding" | "Discount";
//   roundingMethod: "Not Applicable" | "Normal Rounding" | "Downward Rounding" | "Upward Rounding";
//   roundingLimit: string;

//   // Appropriation
//   methodToAllocate: boolean;
//   allocationMethod: "Appropriate by Value" | "Appropriate by Quantity";

//   // Additional cost
//   useAsAdditionalCost: boolean;

//   // Duty/Tax (Duties & Taxes group)
//   typeOfDutyTax: "GST" | "TCS" | "TDS" | "Others";
//   dutyTaxType: string;
//   dutyPercentage: string;
//   dutyBasedOn: "On Total Sales" | "On Current Subtotal" | "On Item Rate" | "On TDS/TCS Assessable Value";
//   methodOfCalculationDuty: "On Total Sales" | "On Net Sales" | "On Assessable Value";

//   // HSN/SAC
//   hsnSacDetailsMode: "As per Company" | "As per Stock Group" | "Specify Details Here";
//   hsnSacSourceMode:
//   | "As per Company"
//   | "As per Stock Group"
//   | "As per Stock Item"
//   | "Specify Details Here";
//   hsnCode: string;
//   hsnDescription: string;
//   natureOfTransaction: string;

//   // Cost centres (config-driven)
//   maintainCostCenters: boolean;
//   costCentreAllocation: boolean;

//   // Narration / Notes
//   narration: string;

//   // Regional language alias (separate from primary alias)
//   aliasRegional: string;

//   // Ledger lifecycle
//   inactive: boolean;

//   // Reporting under (sub-group mapping)
//   reportingUnder: string;

//   // Behaviour options (Duties & Taxes group)
//   ledgerFlushingMethod: "Default" | "Cash Basis" | "Accrual Basis";
//   includeInBuyerLedger: boolean;
//   includeInSellerLedger: boolean;

//   // TDS/TCS e-filing
//   usedInTdsReturns: boolean;

//   // Cheque printing extras
//   chequePrintName: string;
//   chequeWidth: string;
//   chequeHeight: string;
// }

// const TODAY = new Date().toISOString().slice(0, 10);

// const DEFAULTS: AdvancedLedgerForm = {
//   name: "",
//   alias: "",
//   group: "",
//   inventoryAffected: false,
//   effectiveDate: TODAY,
//   openingBalance: "",
//   drCr: "Dr",
//   freezeBalance: false,

//   showMailingDetails: true,
//   mailingName: "",
//   addr1: "",
//   addr2: "",
//   addr3: "",
//   addr4: "",
//   city: "",
//   district: "",
//   state: "Tamil Nadu",
//   country: "India",
//   pincode: "",
//   provideContactDetails: false,
//   contactPerson: "",
//   telephone: "",
//   mobile: "",
//   email: "",
//   website: "",
//   primaryMobile: "",

//   panIt: "",
//   registrationType: "Regular",
//   gstin: "",
//   assesseeOtherTerritory: false,
//   territory: "",

//   isGstApplicable: "Applicable",
//   setAlterGst: false,
//   gstDescription: "",
//   gstApplicableFrom: TODAY,
//   gstHsnSacCode: "",
//   gstTypeOfSupply: "Goods",
//   gstTaxability: "Taxable",
//   gstIgstRate: "18",
//   gstCgstRate: "9",
//   gstSgstRate: "9",
//   gstCessRate: "0",
//   gstCessType: "Valorem",
//   gstReverseCharge: false,
//   includeInAssessable: false,
//   appropriateTo: "Goods",
//   methodOfAppropriation: "Based on Value",

//   cessPerUnit: "",
//   cessUnit: "",
//   gstStatus: "Active",
//   cancelledDate: "",

//   taxType: "None",
//   deducteeType: "Company",
//   buyerType: "Company",

//   tanNumber: "",
//   deductorCategory: "",
//   collectionAccountNo: "",

//   msmeRegistered: false,
//   udyamNumber: "",

//   einvoiceApplicable: false,
//   defaultSupplyType: "B2B",

//   ewayBillApplicable: false,
//   defaultTransportMode: "Road",
//   defaultDistance: "",


//   provideBankDetails: false,
//   accountHolderName: "",
//   bankName: "",
//   branch: "",
//   accountNumber: "",
//   ifsc: "",
//   swift: "",
//   accountType: "Current",
//   bankTransactionTypes: [],
//   txnConfigs: {},

//   effectiveDateForReconciliation: TODAY,
//   setAlterChequeBooks: false,
//   chequeBookName: "",
//   chequeFrom: "",
//   chequeTo: "",
//   chequeNumberLength: "6",
//   enableChequePrinting: false,
//   chequePrintBank: "",

//   maintainBillWise: false,
//   defaultCreditPeriod: "30",
//   checkCreditDaysDuringEntry: false,

//   typeOfLedger: "Not Applicable",
//   roundingMethod: "Not Applicable",
//   roundingLimit: "1",

//   methodToAllocate: false,
//   allocationMethod: "Appropriate by Value",

//   useAsAdditionalCost: false,

//   typeOfDutyTax: "GST",
//   dutyTaxType: "Central Tax",
//   dutyPercentage: "9",
//   dutyBasedOn: "On Total Sales",
//   methodOfCalculationDuty: "On Total Sales",

//   hsnSacDetailsMode: "As per Company",
//   hsnSacSourceMode: "As per Company",
//   hsnCode: "",
//   hsnDescription: "",
//   natureOfTransaction: "",

//   maintainCostCenters: false,
//   costCentreAllocation: false,

//   narration: "",
//   aliasRegional: "",
//   inactive: false,
//   reportingUnder: "",

//   ledgerFlushingMethod: "Default",
//   includeInBuyerLedger: false,
//   includeInSellerLedger: false,
//   usedInTdsReturns: false,

//   chequePrintName: "",
//   chequeWidth: "",
//   chequeHeight: "",
// };

// /* ════════════════════════════════════════════════════════════════════════
//  * 2.  REFERENCE OPTION LISTS
//  * ════════════════════════════════════════════════════════════════════════ */

// const COUNTRY_OPTIONS = [
//   "India", "United States", "United Kingdom", "Singapore", "UAE",
//   "Australia", "Canada", "Germany", "France", "Japan",
// ];
// const STATE_OPTIONS = [
//   "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
//   "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
//   "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
//   "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
//   "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
//   "Uttarakhand", "West Bengal",
// ];
// const BANK_OPTIONS = [
//   "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank",
//   "Kotak Mahindra Bank", "Yes Bank", "Punjab National Bank",
//   "Bank of Baroda", "Indian Bank", "Canara Bank", "Federal Bank",
//   "IDFC First Bank", "Union Bank of India", "IndusInd Bank", "Others",
// ];
// const ACCOUNT_TYPES = ["Savings", "Current", "Cash Credit", "Overdraft", "Loan A/c"] as const;
// const REG_TYPES = [
//   "Regular", "Composition", "Unregistered", "Consumer",
//   "SEZ Unit", "SEZ Developer", "Deemed Export",
//   "Tax Deductor", "Tax Collector (E-Commerce)",
//   "Input Service Distributor", "Overseas", "UIN Holder",
// ] as const;
// const TXN_TYPES = [
//   "ATM", "Card", "Cheque", "ECS", "e-Fund Transfer",
//   "Electronic Cheque", "Electronic DD/PO", "Others",
// ] as const;
// const DUTY_TAX_TYPE_OPTIONS: Record<AdvancedLedgerForm["typeOfDutyTax"], string[]> = {
//   GST: ["Central Tax", "State Tax", "Integrated Tax", "Cess"],
//   TCS: ["Sale of Goods", "Sale of Scrap", "Sale of Tendu Leaves", "Other"],
//   TDS: ["Salary", "Rent", "Professional Fees", "Commission", "Contract"],
//   Others: ["Not Applicable"],
// };

// /* Per-transaction-type sub-dialog schema. */
// const TXN_CONFIG_SCHEMA: Record<string, { title: string; fields: { key: string; label: string; type?: "text" | "date" | "number"; placeholder?: string }[] }> = {
//   "e-Fund Transfer": {
//     title: "e-Fund Transfer — Transaction Configuration",
//     fields: [
//       { key: "accountNumber", label: "Account Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "ifsc", label: "IFSC Code" },
//       { key: "branch", label: "Branch" },
//       { key: "refFormat", label: "Reference Format", placeholder: "e.g. NEFT/{date}/{seq}" },
//       { key: "txnIdentifier", label: "Transaction Identifier" },
//       { key: "narration", label: "Default Narration" },
//     ],
//   },
//   "Cheque": {
//     title: "Cheque — Configuration",
//     fields: [
//       { key: "chequeNo", label: "Cheque Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "branch", label: "Branch" },
//       { key: "printing", label: "Cheque Printing Enabled (Yes/No)" },
//       { key: "rangeFrom", label: "Cheque Range From", type: "number" },
//       { key: "rangeTo", label: "Cheque Range To", type: "number" },
//     ],
//   },
//   "Card": {
//     title: "Card — Configuration",
//     fields: [
//       { key: "cardType", label: "Card Type (Credit/Debit)" },
//       { key: "cardNumber", label: "Card Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "authRequired", label: "Authorization Required (Yes/No)" },
//     ],
//   },
//   "ECS": {
//     title: "ECS — Configuration",
//     fields: [
//       { key: "mandateNo", label: "Mandate Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "refNo", label: "Reference Number" },
//     ],
//   },
//   "Electronic DD/PO": {
//     title: "DD / PO — Configuration",
//     fields: [
//       { key: "instrumentNo", label: "Instrument Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "branch", label: "Branch" },
//       { key: "issueDate", label: "Issue Date", type: "date" },
//     ],
//   },
//   "Electronic Cheque": {
//     title: "Electronic Cheque — Configuration",
//     fields: [
//       { key: "chequeNo", label: "e-Cheque Number" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "branch", label: "Branch" },
//     ],
//   },
//   "ATM": {
//     title: "ATM — Configuration",
//     fields: [
//       { key: "atmId", label: "ATM Identifier" },
//       { key: "bankName", label: "Bank Name" },
//       { key: "narration", label: "Default Narration" },
//     ],
//   },
//   "Others": {
//     title: "Other Transaction — Custom Details",
//     fields: [
//       { key: "description", label: "Description" },
//       { key: "reference", label: "Reference" },
//       { key: "remarks", label: "Remarks" },
//     ],
//   },
// };

// /* ════════════════════════════════════════════════════════════════════════
//  * 3.  GROUP → FIELD-SET MAPPING (verbatim Part 2 of reference doc)
//  * ════════════════════════════════════════════════════════════════════════ */

// type FieldSetKey =
//   | "MAILING" | "MAILING_SHORT"
//   | "BANKING"
//   | "BANKCONFIG"
//   | "TAXREG" | "TAXREG_SHORT"
//   | "STATUTORY"
//   | "HSNSAC" | "HSNSAC_NODESC" | "HSNSAC_NOT"
//   | "BILLBYBILL"
//   | "INVAFFECT"
//   | "APPROPRIATION"
//   | "ADDCOST"
//   | "TYPEOFLEDGER"
//   | "DUTYTAX"
//   | "ROUNDING";

// const GROUP_MAP: Record<string, FieldSetKey[]> = {
//   "Bank Accounts": ["BANKCONFIG", "MAILING", "TAXREG"],
//   "Bank OD A/c": ["BANKCONFIG", "MAILING", "TAXREG"],
//   "Branch / Divisions": ["BILLBYBILL", "INVAFFECT", "MAILING", "BANKING", "TAXREG"],
//   "Capital Account": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Cash-in-Hand": ["MAILING_SHORT"],
//   "Current Asset": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Current Assets": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Current Liabilities": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Deposits (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Direct Expenses": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG_SHORT"],
//   "Direct Incomes": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Duties & Taxes": ["DUTYTAX", "BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "ROUNDING", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Fixed Assets": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG"],
//   "Indirect Expenses": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG_SHORT"],
//   "Indirect Incomes": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Investments (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Loans & Advances (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "HSNSAC_NOT", "MAILING", "BANKING", "TAXREG"],
//   "Loans & Advances (Liability)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Misc. Expenses (ASSET)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Miscellaneous Expenses (Asset)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Miscellaneous Income (ASSET)": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Primary": ["MAILING", "BANKING", "TAXREG"],
//   "Provisions": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Provisions (Current Liabilities)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Purchase Account": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Reserves & Surplus": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Sales Account": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Secured Loans": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Stock-in-Hand": ["INVAFFECT"],
//   // Sundry party groups: STATUTORY needed for GST/TDS/TCS/MSME/e-Invoice/e-Way Bill fields
//   "Sundry Creditors": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   "Sundry Debtors": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
//   // Depreciation & Retained Earnings — previously fell to DEFAULT_FIELDSET
//   "Depreciation": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Retained Earnings": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Suspense AC": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Suspense A/c": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Suspense Account": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
//   "Unsecured Loans": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
// };

// const DEFAULT_FIELDSET: FieldSetKey[] = [
//   "BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG",
// ];

// function fieldSetsFor(group: string): FieldSetKey[] {
//   if (!group) return [];
//   return GROUP_MAP[group] ?? DEFAULT_FIELDSET;
// }

// function parentGroupInfoFor(group: string): ParentGroupInfo | null {
//   if (!group) return null;
//   const g = group.toLowerCase();
//   return {
//     name: group,
//     category:
//       /capital|reserve/.test(g) ? "Equity"
//         : /liab|creditor|provision|loan|overdraft|tax|duty/.test(g) ? "Liabilities"
//           : /income|sales/.test(g) ? "Income"
//             : /expense|depreciation/.test(g) ? "Expenses"
//               : "Assets",
//     isSundryParty: /sundry/.test(g),
//     isBankAccount: /^bank/.test(g),
//     isDutiesTaxes: /tax|duty/.test(g),
//     isLoanAccount: /loan/.test(g),
//     isCapitalAccount: /capital/.test(g),
//     isSalesPurchase: /sales|purchase/.test(g),
//   };
// }

// /* ════════════════════════════════════════════════════════════════════════
//  * 4.  PRIMITIVES — pure presentational, dense ERP styling
//  * ════════════════════════════════════════════════════════════════════════ */

// export function LedgerSectionHeader({ label }: { label: string }) {
//   return (
//     <div className="tally-section-header">
//       <span className="label">{label}</span>
//       <span className="rule" />
//     </div>
//   );
// }

// export function LedgerSection({ title, children }: { title: string; children: ReactNode }) {
//   return (
//     <section className="mb-3">
//       <LedgerSectionHeader label={title} />
//       <div className="flex flex-col">{children}</div>
//     </section>
//   );
// }

// type Indent = 0 | 1 | 2 | 3;
// export function LedgerFieldRow({
//   label,
//   required,
//   indent = 0,
//   children,
// }: {
//   label: string;
//   required?: boolean;
//   indent?: Indent;
//   children: ReactNode;
// }) {
//   const cls =
//     indent === 3 ? "tally-row is-grandchild" :
//       indent === 2 ? "tally-row is-grandchild"
//         : indent === 1 ? "tally-row is-child"
//           : "tally-row";
//   return (
//     <div className={cls}>
//       <label className="tally-label flex items-center gap-1">
//         <span>{label}</span>
//         {required && <span className="text-destructive">*</span>}
//         <span className="ml-auto pr-2 text-muted-foreground/60">:</span>
//       </label>
//       <div className="min-w-0">{children}</div>
//     </div>
//   );
// }

// export function LedgerInput(
//   props: React.InputHTMLAttributes<HTMLInputElement>,
// ) {
//   return <input {...props} className={`tally-input ${props.className ?? ""}`} />;
// }

// export function LedgerSelect<T extends string>({
//   value, onChange, options, disabled,
// }: {
//   value: T; onChange: (v: T) => void; options: readonly T[] | T[]; disabled?: boolean;
// }) {
//   return (
//     <div className="relative">
//       <select
//         value={value}
//         disabled={disabled}
//         onChange={(e) => onChange(e.target.value as T)}
//         className="tally-input appearance-none pr-7 cursor-pointer"
//       >
//         {options.map((o) => <option key={o} value={o}>{o}</option>)}
//       </select>
//       <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//     </div>
//   );
// }

// export function LedgerToggle({
//   value, onChange, yesLabel = "Yes", noLabel = "No",
// }: {
//   value: boolean; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string;
// }) {
//   return (
//     <div className="flex items-center gap-2">
//       <Switch checked={value} onCheckedChange={onChange} />
//       <span className="text-xs font-medium text-foreground">
//         {value ? yesLabel : noLabel}
//       </span>
//     </div>
//   );
// }

// export function LedgerAmountInput({
//   value, onChange, drCr, onDrCrChange, ...rest
// }: {
//   value: string; onChange: (v: string) => void;
//   drCr: "Dr" | "Cr"; onDrCrChange: (v: "Dr" | "Cr") => void;
// } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
//   return (
//     <div className="flex items-stretch gap-1">
//       <div className="relative flex-1">
//         <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
//         <input
//           {...rest}
//           type="text"
//           inputMode="decimal"
//           value={value}
//           onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
//           className="tally-input pl-6 text-right font-mono tabular-nums"
//         />
//       </div>
//       <div className="flex rounded-md border border-input overflow-hidden">
//         {(["Dr", "Cr"] as const).map((side) => (
//           <button
//             key={side} type="button"
//             onClick={() => onDrCrChange(side)}
//             className={`px-2.5 text-xs font-semibold transition-colors ${drCr === side
//               ? side === "Dr" ? "bg-primary text-primary-foreground" : "bg-income text-white"
//               : "bg-secondary text-muted-foreground hover:bg-secondary/70"
//               }`}
//           >{side}</button>
//         ))}
//       </div>
//     </div>
//   );
// }

// /** Tally-style auto-suggest input with keyboard navigation. */
// export function LedgerAutocomplete({
//   value, onChange, options, placeholder, onCreate, createLabel = "+ Create new",
// }: {
//   value: string; onChange: (v: string) => void; options: string[];
//   placeholder?: string; onCreate?: () => void; createLabel?: string;
// }) {
//   const [open, setOpen] = useState(false);
//   const [query, setQuery] = useState(value);
//   const [hi, setHi] = useState(0);
//   const ref = useRef<HTMLDivElement>(null);

//   useEffect(() => setQuery(value), [value]);
//   useEffect(() => {
//     const close = (e: MouseEvent) => {
//       if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
//     };
//     document.addEventListener("mousedown", close);
//     return () => document.removeEventListener("mousedown", close);
//   }, []);

//   const filtered = useMemo(() => {
//     const q = query.toLowerCase().trim();
//     if (!q) return options.slice(0, 80);
//     return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 80);
//   }, [options, query]);

//   const pick = (v: string) => { onChange(v); setQuery(v); setOpen(false); };

//   const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
//     if (!open && (e.key === "ArrowDown")) {
//       setOpen(true); setHi(0); e.preventDefault(); return;
//     }
//     if (!open) return;
//     if (e.key === "ArrowDown") {
//       e.preventDefault();
//       setHi((p) => (p + 1) % Math.max(1, filtered.length));
//     } else if (e.key === "ArrowUp") {
//       e.preventDefault();
//       setHi((p) => (p - 1 + filtered.length) % Math.max(1, filtered.length));
//     } else if (e.key === "Enter") {
//       if (filtered[hi]) {
//         e.preventDefault();
//         e.stopPropagation();
//         pick(filtered[hi]);
//       }
//     } else if (e.key === "Escape") {
//       e.preventDefault(); setOpen(false);
//     }
//   };

//   return (
//     <div ref={ref} className="relative">
//       <div className="relative">
//         <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
//         <input
//           value={query}
//           placeholder={placeholder}
//           onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
//           onFocus={() => setOpen(true)}
//           onKeyDown={onKey}
//           className="tally-input pl-7 pr-7"
//         />
//         {query && (
//           <button
//             type="button"
//             onClick={() => { setQuery(""); onChange(""); }}
//             className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
//           ><X className="h-3 w-3" /></button>
//         )}
//       </div>
//       {open && (
//         <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
//           {filtered.length === 0 && (
//             <div className="px-2 py-1.5 text-xs text-muted-foreground">No match — type to filter</div>
//           )}
//           {filtered.map((o, i) => (
//             <button
//               key={o} type="button"
//               onMouseEnter={() => setHi(i)}
//               onClick={() => pick(o)}
//               className={`flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors ${i === hi ? "bg-primary/10 text-primary" : "hover:bg-secondary"
//                 }`}
//             >
//               <span>{o}</span>
//               {o === value && <Check className="h-3 w-3 text-primary" />}
//             </button>
//           ))}
//           {onCreate && (
//             <button
//               type="button"
//               onClick={() => { setOpen(false); onCreate(); }}
//               className="flex w-full items-center px-2.5 py-1.5 text-xs text-primary border-t border-border hover:bg-primary/5"
//             >{createLabel}</button>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// /* ════════════════════════════════════════════════════════════════════════
//  * 5.  BANKING TRANSACTION SUB-DIALOG
//  * ════════════════════════════════════════════════════════════════════════ */

// function TransactionConfigDialog({
//   type, initial, onClose, onSave,
// }: {
//   type: string;
//   initial: Record<string, string>;
//   onClose: () => void;
//   onSave: (cfg: Record<string, string>) => void;
// }) {
//   const schema = TXN_CONFIG_SCHEMA[type] ?? TXN_CONFIG_SCHEMA["Others"];
//   const [draft, setDraft] = useState<Record<string, string>>(initial ?? {});

//   return (
//     <Dialog open onOpenChange={(v) => !v && onClose()}>
//       <DialogContent className="max-w-md">
//         <DialogHeader>
//           <DialogTitle className="text-sm">{schema.title}</DialogTitle>
//           <DialogDescription className="text-xs">
//             Per-ledger settings for the <span className="font-semibold">{type}</span> transaction type.
//           </DialogDescription>
//         </DialogHeader>
//         <div className="space-y-2 py-2">
//           {schema.fields.map((f) => (
//             <div key={f.key} className="tally-row">
//               <label className="tally-label">
//                 <span>{f.label}</span>
//                 <span className="ml-auto pr-2 text-muted-foreground/60">:</span>
//               </label>
//               <input
//                 type={f.type ?? "text"}
//                 value={draft[f.key] ?? ""}
//                 placeholder={f.placeholder}
//                 onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
//                 className="tally-input"
//               />
//             </div>
//           ))}
//         </div>
//         <DialogFooter>
//           <Button variant="outline" size="sm" onClick={onClose}>Cancel (Esc)</Button>
//           <Button size="sm" onClick={() => { onSave(draft); onClose(); }}>
//             Save Configuration
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// }

// /* ════════════════════════════════════════════════════════════════════════
//  * 6.  THE PANEL
//  * ════════════════════════════════════════════════════════════════════════ */

// interface PanelProps {
//   onClose: () => void;
//   onSave: (l: AdvancedLedgerForm) => void;
//   groups: string[];
//   onCreateGroup?: () => void;
//   onOpenConfig?: () => void;
//   initial?: Partial<AdvancedLedgerForm>;
// }

// export function AdvancedLedgerFormPanel({
//   onClose, onSave, groups, onCreateGroup, onOpenConfig, initial,
// }: PanelProps) {
//   const [form, setForm] = useState<AdvancedLedgerForm>({ ...DEFAULTS, ...initial });
//   const [errors, setErrors] = useState<Partial<Record<keyof AdvancedLedgerForm, string>>>({});
//   const nameRef = useRef<HTMLInputElement>(null);
//   const formRef = useRef<HTMLDivElement>(null);

//   const [txnDialog, setTxnDialog] = useState<string | null>(null);

//   const set = useCallback(
//     <K extends keyof AdvancedLedgerForm>(k: K, v: AdvancedLedgerForm[K]) =>
//       setForm((p) => ({ ...p, [k]: v })),
//     [],
//   );

//   const parentInfo = useMemo(() => parentGroupInfoFor(form.group), [form.group]);
//   const conditional = useConditionalFields(parentInfo);
//   const fieldSets = useMemo(() => fieldSetsFor(form.group), [form.group]);
//   const has = useCallback((k: FieldSetKey) => fieldSets.includes(k), [fieldSets]);

//   const handleSave = useCallback(() => {
//     const errs: typeof errors = {};
//     if (!form.name.trim()) errs.name = "Ledger Name is required";
//     if (!form.group.trim()) errs.group = "Under Group is required";
//     setErrors(errs);
//     if (Object.keys(errs).length) {
//       toast.error("Fix highlighted fields before saving");
//       return;
//     }
//     onSave(form);
//   }, [form, onSave]);

//   /* ── Global keyboard shortcuts: Ctrl+S save · Esc close · F12 / Alt+F12 config ── */
//   useEffect(() => {
//     const onKey = (e: KeyboardEvent) => {
//       if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "a")) {
//         e.preventDefault(); handleSave();
//       } else if (e.key === "Escape") {
//         // Don't bubble Escape from inside an open transaction sub-dialog
//         if (!txnDialog) onClose();
//       } else if (e.key === "F12") {
//         e.preventDefault();
//         onOpenConfig?.();
//       }
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [handleSave, onClose, onOpenConfig, txnDialog]);

//   useEffect(() => { nameRef.current?.focus(); }, []);

//   /* ── Tally-style field-to-field keyboard navigation ───────────────────
//      Enter / ArrowDown / Tab → next visible control
//      Shift+Enter / ArrowUp / Shift+Tab → previous visible control
//      Hidden conditional fields are naturally skipped because they aren't rendered.
//      ────────────────────────────────────────────────────────────────────── */
//   useEffect(() => {
//     const root = formRef.current;
//     if (!root) return;

//     const focusableSelector = [
//       "input:not([type=hidden]):not([disabled])",
//       "select:not([disabled])",
//       "textarea:not([disabled])",
//       "button[role='switch']:not([disabled])",
//     ].join(",");

//     const isVisible = (el: Element) => {
//       const rect = (el as HTMLElement).getBoundingClientRect();
//       const style = window.getComputedStyle(el as HTMLElement);
//       return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
//     };

//     const handler = (e: KeyboardEvent) => {
//       const target = e.target as HTMLElement | null;
//       if (!target || !root.contains(target)) return;

//       // Don't hijack inside textarea (Enter = newline) or sub-dialog
//       if (target.tagName === "TEXTAREA") return;
//       if (target.closest("[role='dialog']") && target.closest("[role='dialog']") !== root.closest("[role='dialog']")) return;

//       const isEnter = e.key === "Enter";
//       const isArrowDown = e.key === "ArrowDown" && (target.tagName === "INPUT" || target.tagName === "BUTTON");
//       const isArrowUp = e.key === "ArrowUp" && (target.tagName === "INPUT" || target.tagName === "BUTTON");

//       // Don't intercept ArrowDown/Up inside autocomplete dropdowns
//       if ((isArrowDown || isArrowUp) && target.closest(".relative") && target.parentElement?.querySelector(".absolute.z-50")) {
//         return;
//       }
//       // Skip Enter when inside a <select> (lets the browser confirm option)
//       if (isEnter && target.tagName === "SELECT") return;

//       if (!isEnter && !isArrowDown && !isArrowUp) return;
//       e.preventDefault();

//       const all = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisible);
//       const idx = all.indexOf(target);
//       if (idx === -1) return;

//       const goPrev = e.shiftKey || isArrowUp;
//       const nextIdx = goPrev
//         ? (idx - 1 + all.length) % all.length
//         : (idx + 1) % all.length;
//       const next = all[nextIdx];
//       next.focus();
//       if (next instanceof HTMLInputElement && next.type !== "checkbox" && next.type !== "date") {
//         try { next.select(); } catch { /* ignore */ }
//       }
//     };

//     root.addEventListener("keydown", handler);
//     return () => root.removeEventListener("keydown", handler);
//   }, []);

//   const toggleTxnType = (t: string) => {
//     setForm((p) => {
//       const cur = p.bankTransactionTypes ?? [];
//       const isOn = cur.includes(t);
//       const next = isOn ? cur.filter((x) => x !== t) : [...cur, t];
//       return { ...p, bankTransactionTypes: next };
//     });
//     // When turning ON, immediately open the config sub-dialog
//     if (!form.bankTransactionTypes.includes(t)) {
//       setTimeout(() => setTxnDialog(t), 0);
//     }
//   };

//   /* ════════════════════════════════════════════════════════════════════
//    *  Build section nodes once, then split into LEFT / RIGHT columns
//    * ════════════════════════════════════════════════════════════════════ */

//   const basicSection = (
//     <LedgerSection title="Basic Information">
//       <LedgerFieldRow label="Name" required>
//         <input
//           ref={nameRef}
//           value={form.name}
//           onChange={(e) => set("name", e.target.value)}
//           placeholder="e.g. Rajesh Kumar"
//           className={`tally-input ${errors.name ? "border-destructive" : ""}`}
//         />
//       </LedgerFieldRow>
//       {conditional.showAliasField && (
//         <LedgerFieldRow label="(alias)">
//           <LedgerInput value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short name" />
//         </LedgerFieldRow>
//       )}
//       {conditional.showLanguageAlias && (
//         <LedgerFieldRow label="(alias in regional language)">
//           <LedgerInput value={form.aliasRegional} onChange={(e) => set("aliasRegional", e.target.value)} placeholder="Regional alias" />
//         </LedgerFieldRow>
//       )}
//       <LedgerFieldRow label="Under" required>
//         <div className={errors.group ? "ring-1 ring-destructive rounded-md" : ""}>
//           <LedgerAutocomplete
//             value={form.group}
//             onChange={(v) => set("group", v)}
//             options={groups.length ? groups : Object.keys(GROUP_MAP)}
//             placeholder="Type to filter group…"
//             onCreate={onCreateGroup}
//             createLabel="+ Create new group"
//           />
//         </div>
//       </LedgerFieldRow>
//       {has("INVAFFECT") && (
//         <LedgerFieldRow label="Inventory values are affected?">
//           <LedgerToggle value={form.inventoryAffected} onChange={(v) => set("inventoryAffected", v)} />
//         </LedgerFieldRow>
//       )}
//       <LedgerFieldRow label="Inactive / Discontinued?">
//         <LedgerToggle value={form.inactive} onChange={(v) => set("inactive", v)} />
//       </LedgerFieldRow>
//     </LedgerSection>
//   );

//   const billByBillSection = has("BILLBYBILL") && conditional.showBillWise && (
//     <LedgerSection title="Bill-wise Details">
//       <LedgerFieldRow label="Maintain balances bill-by-bill?">
//         <LedgerToggle value={form.maintainBillWise} onChange={(v) => set("maintainBillWise", v)} />
//       </LedgerFieldRow>
//       {form.maintainBillWise && (
//         <>
//           <LedgerFieldRow label="Default Credit Period" indent={1}>
//             <div className="flex items-center gap-2">
//               <LedgerInput
//                 type="number"
//                 value={form.defaultCreditPeriod}
//                 onChange={(e) => set("defaultCreditPeriod", e.target.value)}
//                 className="w-24"
//               />
//               <span className="text-xs text-muted-foreground">days</span>
//             </div>
//           </LedgerFieldRow>
//           {form.group === "Sundry Debtors" && (
//             <LedgerFieldRow label="Check for credit days during voucher entry?" indent={2}>
//               <LedgerToggle
//                 value={form.checkCreditDaysDuringEntry}
//                 onChange={(v) => set("checkCreditDaysDuringEntry", v)}
//               />
//             </LedgerFieldRow>
//           )}
//         </>
//       )}
//     </LedgerSection>
//   );

//   const typeOfLedgerSection = has("TYPEOFLEDGER") && (
//     <LedgerSection title="Type of Ledger">
//       <LedgerFieldRow label="Type of Ledger">
//         <LedgerSelect
//           value={form.typeOfLedger}
//           onChange={(v) => set("typeOfLedger", v)}
//           options={["Not Applicable", "Invoice Rounding", "Discount"] as const}
//         />
//       </LedgerFieldRow>
//       {form.typeOfLedger === "Invoice Rounding" && (
//         <>
//           <LedgerFieldRow label="Rounding Method" indent={1}>
//             <LedgerSelect
//               value={form.roundingMethod}
//               onChange={(v) => set("roundingMethod", v)}
//               options={["Not Applicable", "Normal Rounding", "Downward Rounding", "Upward Rounding"] as const}
//             />
//           </LedgerFieldRow>
//           {form.roundingMethod !== "Not Applicable" && (
//             <LedgerFieldRow label="Rounding Limit" indent={2}>
//               <LedgerInput
//                 value={form.roundingLimit}
//                 onChange={(e) => set("roundingLimit", e.target.value)}
//                 className="w-24"
//               />
//             </LedgerFieldRow>
//           )}
//         </>
//       )}
//     </LedgerSection>
//   );

//   const roundingSection = has("ROUNDING") && (
//     <LedgerSection title="Rounding">
//       <LedgerFieldRow label="Rounding Method">
//         <LedgerSelect
//           value={form.roundingMethod}
//           onChange={(v) => set("roundingMethod", v)}
//           options={["Not Applicable", "Normal Rounding", "Downward Rounding", "Upward Rounding"] as const}
//         />
//       </LedgerFieldRow>
//       {form.roundingMethod !== "Not Applicable" && (
//         <LedgerFieldRow label="Rounding Limit" indent={1}>
//           <LedgerInput
//             value={form.roundingLimit}
//             onChange={(e) => set("roundingLimit", e.target.value)}
//             className="w-24"
//           />
//         </LedgerFieldRow>
//       )}
//     </LedgerSection>
//   );

//   const dutyTaxSection = has("DUTYTAX") && (
//     <LedgerSection title="Duty / Tax Details">
//       <LedgerFieldRow label="Type of Duty/Tax">
//         <LedgerSelect
//           value={form.typeOfDutyTax}
//           onChange={(v) => {
//             set("typeOfDutyTax", v);
//             set("dutyTaxType", DUTY_TAX_TYPE_OPTIONS[v][0]);
//           }}
//           options={["GST", "TCS", "TDS", "Others"] as const}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Tax Type" indent={1}>
//         <LedgerSelect
//           value={form.dutyTaxType}
//           onChange={(v) => set("dutyTaxType", v)}
//           options={DUTY_TAX_TYPE_OPTIONS[form.typeOfDutyTax]}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Percentage of Calculation" indent={1}>
//         <div className="flex items-center gap-2">
//           <LedgerInput value={form.dutyPercentage} onChange={(e) => set("dutyPercentage", e.target.value)} className="w-20" />
//           <span className="text-xs text-muted-foreground">%</span>
//         </div>
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Based on" indent={1}>
//         <LedgerSelect
//           value={form.dutyBasedOn}
//           onChange={(v) => set("dutyBasedOn", v)}
//           options={["On Total Sales", "On Current Subtotal", "On Item Rate", "On TDS/TCS Assessable Value"] as const}
//         />
//       </LedgerFieldRow>
//       {/* Missing field: Method of Calculation — shown when GST is selected */}
//       {form.typeOfDutyTax === "GST" && (
//         <LedgerFieldRow label="Method of Calculation" indent={1}>
//           <LedgerSelect
//             value={form.methodOfCalculationDuty}
//             onChange={(v) => set("methodOfCalculationDuty", v)}
//             options={["On Total Sales", "On Net Sales", "On Assessable Value"] as const}
//           />
//         </LedgerFieldRow>
//       )}
//     </LedgerSection>
//   );

//   const behaviourOptionsSection = has("DUTYTAX") && (
//     <LedgerSection title="Behaviour Options">
//       <LedgerFieldRow label="Ledger Flushing Method">
//         <LedgerSelect
//           value={form.ledgerFlushingMethod}
//           onChange={(v) => set("ledgerFlushingMethod", v)}
//           options={["Default", "Cash Basis", "Accrual Basis"] as const}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Include in Buyer's Ledger?">
//         <LedgerToggle value={form.includeInBuyerLedger} onChange={(v) => set("includeInBuyerLedger", v)} />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Include in Seller's Ledger?">
//         <LedgerToggle value={form.includeInSellerLedger} onChange={(v) => set("includeInSellerLedger", v)} />
//       </LedgerFieldRow>
//     </LedgerSection>
//   );

//   const appropriationSection = has("APPROPRIATION") && (
//     <LedgerSection title="Method of Appropriation">
//       <LedgerFieldRow label="Method to allocate when used in purchase invoice?">
//         <LedgerToggle value={form.methodToAllocate} onChange={(v) => set("methodToAllocate", v)} />
//       </LedgerFieldRow>
//       {form.methodToAllocate && (
//         <LedgerFieldRow label="Allocation Method" indent={1}>
//           <LedgerSelect
//             value={form.allocationMethod}
//             onChange={(v) => set("allocationMethod", v)}
//             options={["Appropriate by Value", "Appropriate by Quantity"] as const}
//           />
//         </LedgerFieldRow>
//       )}
//     </LedgerSection>
//   );

//   const addCostSection = has("ADDCOST") && (
//     <LedgerSection title="Additional Cost">
//       <LedgerFieldRow label="Use for Additional Costs in Purchase invoice?">
//         <LedgerToggle value={form.useAsAdditionalCost} onChange={(v) => set("useAsAdditionalCost", v)} />
//       </LedgerFieldRow>
//     </LedgerSection>
//   );

//   const statutorySection = has("STATUTORY") && (
//     <LedgerSection title="Statutory Details">
//       <LedgerFieldRow label="Is GST Applicable?">
//         <LedgerSelect
//           value={form.isGstApplicable}
//           onChange={(v) => set("isGstApplicable", v)}
//           options={["As per Company", "As per Group", "Applicable", "Not Applicable", "Undefined"] as const}
//         />
//       </LedgerFieldRow>

//       {(form.isGstApplicable === "Applicable") && (
//         <>
//           <LedgerFieldRow label="Set/Alter GST Details?" indent={1}>
//             <LedgerToggle value={form.setAlterGst} onChange={(v) => set("setAlterGst", v)} />
//           </LedgerFieldRow>

//           {form.setAlterGst && (
//             <>
//               <LedgerFieldRow label="Description" indent={2}>
//                 <LedgerInput value={form.gstDescription} onChange={(e) => set("gstDescription", e.target.value)} placeholder="GST rate description" />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="Applicable From" indent={2}>
//                 <LedgerInput type="date" value={form.gstApplicableFrom} onChange={(e) => set("gstApplicableFrom", e.target.value)} />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="HSN/SAC Code" indent={2}>
//                 <LedgerInput value={form.gstHsnSacCode} onChange={(e) => set("gstHsnSacCode", e.target.value)} />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="Type of Supply" indent={2}>
//                 <LedgerSelect
//                   value={form.gstTypeOfSupply}
//                   onChange={(v) => set("gstTypeOfSupply", v)}
//                   options={["Goods", "Services"] as const}
//                 />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="Taxability" indent={2}>
//                 <LedgerSelect
//                   value={form.gstTaxability}
//                   onChange={(v) => set("gstTaxability", v)}
//                   options={["Taxable", "Exempt", "Nil Rated"] as const}
//                 />
//               </LedgerFieldRow>
//               {form.gstTaxability === "Taxable" && (
//                 <>
//                   <LedgerFieldRow label="Integrated Tax (IGST)" indent={2}>
//                     <div className="flex items-center gap-2">
//                       <LedgerInput value={form.gstIgstRate} onChange={(e) => set("gstIgstRate", e.target.value)} className="w-20" />
//                       <span className="text-xs text-muted-foreground">%</span>
//                     </div>
//                   </LedgerFieldRow>
//                   <LedgerFieldRow label="Central Tax (CGST)" indent={2}>
//                     <div className="flex items-center gap-2">
//                       <LedgerInput value={form.gstCgstRate} onChange={(e) => set("gstCgstRate", e.target.value)} className="w-20" />
//                       <span className="text-xs text-muted-foreground">%</span>
//                     </div>
//                   </LedgerFieldRow>
//                   <LedgerFieldRow label="State Tax (SGST)" indent={2}>
//                     <div className="flex items-center gap-2">
//                       <LedgerInput value={form.gstSgstRate} onChange={(e) => set("gstSgstRate", e.target.value)} className="w-20" />
//                       <span className="text-xs text-muted-foreground">%</span>
//                     </div>
//                   </LedgerFieldRow>
//                   <LedgerFieldRow label="Cess" indent={2}>
//                     <div className="flex items-center gap-2">
//                       <LedgerInput value={form.gstCessRate} onChange={(e) => set("gstCessRate", e.target.value)} className="w-20" />
//                       <LedgerSelect
//                         value={form.gstCessType}
//                         onChange={(v) => set("gstCessType", v)}
//                         options={["Valorem", "Quantum"] as const}
//                       />
//                     </div>
//                   </LedgerFieldRow>
//                   {form.gstCessType === "Quantum" && (
//                     <>
//                       <LedgerFieldRow label="Cess per Unit" indent={3}>
//                         <LedgerInput
//                           value={form.cessPerUnit}
//                           onChange={(e) => set("cessPerUnit", e.target.value)}
//                           placeholder="0.0000"
//                           className="w-28"
//                         />
//                       </LedgerFieldRow>
//                       <LedgerFieldRow label="Cess Unit" indent={3}>
//                         <LedgerInput
//                           value={form.cessUnit}
//                           onChange={(e) => set("cessUnit", e.target.value)}
//                           placeholder="e.g. Litre, Kg, Nos"
//                           className="w-40"
//                         />
//                       </LedgerFieldRow>
//                     </>
//                   )}
//                 </>

//               )}
//               <LedgerFieldRow label="Reverse Charge Applicable?" indent={2}>
//                 <LedgerToggle value={form.gstReverseCharge} onChange={(v) => set("gstReverseCharge", v)} />
//               </LedgerFieldRow>
//             </>
//           )}

//           <LedgerFieldRow label="Include in assessable value calculation for GST?" indent={1}>
//             <LedgerToggle value={form.includeInAssessable} onChange={(v) => set("includeInAssessable", v)} />
//           </LedgerFieldRow>
//           {form.includeInAssessable && (
//             <>
//               <LedgerFieldRow label="Appropriate to" indent={2}>
//                 <LedgerSelect
//                   value={form.appropriateTo}
//                   onChange={(v) => set("appropriateTo", v)}
//                   options={["Goods", "Services", "Both"] as const}
//                 />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="Method of Calculation" indent={2}>
//                 <LedgerSelect
//                   value={form.methodOfAppropriation}
//                   onChange={(v) => set("methodOfAppropriation", v)}
//                   options={["Based on Value", "Based on Quantity"] as const}
//                 />
//               </LedgerFieldRow>
//             </>
//           )}

//           <LedgerFieldRow label="GST Registration Status" indent={1}>
//             <LedgerSelect
//               value={form.gstStatus}
//               onChange={(v) => set("gstStatus", v)}
//               options={["Active", "Cancelled", "Suspended"] as const}
//             />
//           </LedgerFieldRow>
//           {form.gstStatus === "Cancelled" && (
//             <LedgerFieldRow label="Cancelled Date" indent={2}>
//               <LedgerInput type="date" value={form.cancelledDate} onChange={(e) => set("cancelledDate", e.target.value)} />
//             </LedgerFieldRow>
//           )}
//         </>
//       )}

//       {/* Bug fix: TDS/TCS Tax Type was showing for ALL STATUTORY groups.
//           Tally shows this only for Sundry Debtors/Creditors (party ledgers). */}
//       {parentInfo?.isSundryParty && (
//         <>
//           <LedgerFieldRow label="Tax Type (TDS/TCS)">
//             <LedgerSelect
//               value={form.taxType}
//               onChange={(v) => set("taxType", v)}
//               options={["None", "TDS", "TCS"] as const}
//             />
//           </LedgerFieldRow>
//           {form.taxType === "TDS" && (
//             <LedgerFieldRow label="Deductee Type" indent={1}>
//               <LedgerSelect
//                 value={form.deducteeType}
//                 onChange={(v) => set("deducteeType", v)}
//                 options={["Individual", "HUF", "Firm", "Company", "Trust", "Government", "AOP"] as const}
//               />
//             </LedgerFieldRow>
//           )}
//           {form.taxType === "TCS" && (
//             <LedgerFieldRow label="Buyer Type" indent={1}>
//               <LedgerSelect
//                 value={form.buyerType}
//                 onChange={(v) => set("buyerType", v)}
//                 options={["Individual", "Company", "Government", "Exporter", "SEZ"] as const}
//               />
//             </LedgerFieldRow>
//           )}
//         </>
//       )}

//       {/* MSME (party ledgers) — gated by config: Provide MSME Registration Details */}
//       {parentInfo?.isSundryParty && conditional.showMSME && (
//         <>
//           <LedgerFieldRow label="MSME Registered?">
//             <LedgerToggle value={form.msmeRegistered} onChange={(v) => set("msmeRegistered", v)} />
//           </LedgerFieldRow>
//           {form.msmeRegistered && (
//             <LedgerFieldRow label="Udyam Registration Number" indent={1}>
//               <LedgerInput
//                 value={form.udyamNumber}
//                 onChange={(e) => set("udyamNumber", e.target.value.toUpperCase())}
//                 maxLength={19}
//                 placeholder="UDYAM-XX-00-0000000"
//                 className="font-mono uppercase"
//               />
//             </LedgerFieldRow>
//           )}

//           <LedgerFieldRow label="e-Invoice Applicable?">
//             <LedgerToggle value={form.einvoiceApplicable} onChange={(v) => set("einvoiceApplicable", v)} />
//           </LedgerFieldRow>
//           {form.einvoiceApplicable && (
//             <LedgerFieldRow label="Default Supply Type" indent={1}>
//               <LedgerSelect
//                 value={form.defaultSupplyType}
//                 onChange={(v) => set("defaultSupplyType", v)}
//                 options={["B2B", "SEZ", "Export", "Deemed Export"] as const}
//               />
//             </LedgerFieldRow>
//           )}

//           <LedgerFieldRow label="e-Way Bill Applicable?">
//             <LedgerToggle value={form.ewayBillApplicable} onChange={(v) => set("ewayBillApplicable", v)} />
//           </LedgerFieldRow>
//           {form.ewayBillApplicable && (
//             <>
//               <LedgerFieldRow label="Default Transport Mode" indent={1}>
//                 <LedgerSelect
//                   value={form.defaultTransportMode}
//                   onChange={(v) => set("defaultTransportMode", v)}
//                   options={["Road", "Rail", "Air", "Ship"] as const}
//                 />
//               </LedgerFieldRow>
//               <LedgerFieldRow label="Default Distance (km)" indent={1}>
//                 <LedgerInput
//                   type="number"
//                   value={form.defaultDistance}
//                   onChange={(e) => set("defaultDistance", e.target.value)}
//                   placeholder="0.00"
//                   className="w-32"
//                 />
//               </LedgerFieldRow>
//             </>
//           )}

//           {/* TDS/TCS e-filing */}
//           {(form.taxType === "TDS" || form.taxType === "TCS") && (
//             <LedgerFieldRow label="Include in TDS/TCS e-Filing Returns?">
//               <LedgerToggle value={form.usedInTdsReturns} onChange={(v) => set("usedInTdsReturns", v)} />
//             </LedgerFieldRow>
//           )}
//         </>
//       )}
//     </LedgerSection>
//   );


//   const hsnSection = (has("HSNSAC") || has("HSNSAC_NODESC") || has("HSNSAC_NOT")) && (
//     <LedgerSection title="HSN / SAC Details">
//       <LedgerFieldRow label="HSN/SAC Details">
//         <LedgerSelect
//           value={form.hsnSacDetailsMode}
//           onChange={(v) => set("hsnSacDetailsMode", v)}
//           options={["As per Company", "As per Stock Group", "Specify Details Here"] as const}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Source of Details">
//         <LedgerSelect
//           value={form.hsnSacSourceMode}
//           onChange={(v) => set("hsnSacSourceMode", v)}
//           options={["As per Company", "As per Stock Group", "As per Stock Item", "Specify Details Here"] as const}
//         />
//       </LedgerFieldRow>
//       {(form.hsnSacDetailsMode === "Specify Details Here" ||
//         form.hsnSacSourceMode === "Specify Details Here") && (
//           <>
//             <LedgerFieldRow label="HSN/SAC Code" indent={1}>
//               <LedgerInput value={form.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />
//             </LedgerFieldRow>
//             {!has("HSNSAC_NODESC") && (
//               <LedgerFieldRow label="Description" indent={1}>
//                 <LedgerInput value={form.hsnDescription} onChange={(e) => set("hsnDescription", e.target.value)} />
//               </LedgerFieldRow>
//             )}
//           </>
//         )}
//       {has("HSNSAC_NOT") && (
//         <>
//           <LedgerFieldRow label="Nature of Transaction">
//             <LedgerInput
//               value={form.natureOfTransaction}
//               onChange={(e) => set("natureOfTransaction", e.target.value)}
//               placeholder="Tax classification"
//             />
//           </LedgerFieldRow>
//         </>
//       )}
//     </LedgerSection>
//   );

//   const openingSection = conditional.showOpeningBalance && (
//     <LedgerSection title="Opening Balance">
//       {/* Bug fix: effectiveDate was hardcoded as TODAY label — now editable */}
//       <LedgerFieldRow label="Effective Date">
//         <LedgerInput
//           type="date"
//           value={form.effectiveDate}
//           onChange={(e) => set("effectiveDate", e.target.value)}
//           className="w-44"
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label={`Opening Balance ( as on ${form.effectiveDate} )`}>
//         <LedgerAmountInput
//           value={form.openingBalance}
//           onChange={(v) => set("openingBalance", v)}
//           drCr={form.drCr}
//           onDrCrChange={(v) => set("drCr", v)}
//           placeholder="0.00"
//         />
//       </LedgerFieldRow>
//       {/* Missing field: Freeze Opening Balance toggle */}
//       <LedgerFieldRow label="Freeze Opening Balance?">
//         <LedgerToggle value={form.freezeBalance} onChange={(v) => set("freezeBalance", v)} />
//       </LedgerFieldRow>

//       {form.maintainBillWise && parseFloat(form.openingBalance || "0") > 0 && (
//         <div className="mt-2 rounded-md border border-dashed border-border bg-secondary/30 p-3">
//           <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
//             Bill-wise breakup
//           </div>
//           <table className="w-full text-xs">
//             <thead>
//               <tr className="text-left text-muted-foreground">
//                 <th className="py-1 font-medium">Ref. No.</th>
//                 <th className="py-1 font-medium">Due Date</th>
//                 <th className="py-1 font-medium text-right">Amount</th>
//                 <th className="py-1 font-medium">Dr/Cr</th>
//               </tr>
//             </thead>
//             <tbody>
//               <tr>
//                 <td className="py-1 pr-2"><LedgerInput placeholder="OPN-001" /></td>
//                 <td className="py-1 pr-2"><LedgerInput type="date" /></td>
//                 <td className="py-1 pr-2">
//                   <LedgerInput className="text-right font-mono" defaultValue={form.openingBalance} />
//                 </td>
//                 <td className="py-1">
//                   <LedgerSelect value={form.drCr} onChange={(v) => set("drCr", v)} options={["Dr", "Cr"] as const} />
//                 </td>
//               </tr>
//             </tbody>
//           </table>
//         </div>
//       )}
//     </LedgerSection>
//   );

//   /* ── RIGHT column: mailing / banking / tax registration ── */

//   const mailingSection = has("MAILING") && conditional.showMailingDetails && (
//     <LedgerSection title="Mailing Details">
//       <LedgerFieldRow label="Name">
//         <LedgerInput
//           value={form.mailingName || form.name}
//           onChange={(e) => set("mailingName", e.target.value)}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Address">
//         <div className="flex flex-col gap-1">
//           <LedgerInput value={form.addr1} onChange={(e) => set("addr1", e.target.value)} placeholder="Line 1" />
//           <LedgerInput value={form.addr2} onChange={(e) => set("addr2", e.target.value)} placeholder="Line 2" />
//           <LedgerInput value={form.addr3} onChange={(e) => set("addr3", e.target.value)} placeholder="Line 3" />
//           <LedgerInput value={form.addr4} onChange={(e) => set("addr4", e.target.value)} placeholder="Line 4" />
//         </div>
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Country">
//         <LedgerAutocomplete value={form.country} onChange={(v) => set("country", v)} options={COUNTRY_OPTIONS} />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="State">
//         <LedgerAutocomplete value={form.state} onChange={(v) => set("state", v)} options={STATE_OPTIONS} />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Pincode">
//         <LedgerInput
//           value={form.pincode}
//           onChange={(e) => set("pincode", e.target.value)}
//           maxLength={6}
//           className="w-32"
//         />
//       </LedgerFieldRow>
//       {/* Missing fields: city + district were in form shape but never rendered */}
//       <LedgerFieldRow label="City">
//         <LedgerInput value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Chennai" />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="District">
//         <LedgerInput value={form.district} onChange={(e) => set("district", e.target.value)} placeholder="e.g. Dindigul" />
//       </LedgerFieldRow>

//       <LedgerFieldRow label="Provide Contact Details?">
//         <LedgerToggle value={form.provideContactDetails} onChange={(v) => set("provideContactDetails", v)} />
//       </LedgerFieldRow>
//       {form.provideContactDetails && conditional.showContactDetails && (
//         <>
//           <LedgerFieldRow label="Contact Person" indent={1}>
//             <LedgerInput value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Telephone No." indent={1}>
//             <LedgerInput value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Mobile No." indent={1}>
//             <LedgerInput value={form.mobile} onChange={(e) => set("mobile", e.target.value)} maxLength={15} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="E-Mail" indent={1}>
//             <LedgerInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Website" indent={1}>
//             <LedgerInput value={form.website} onChange={(e) => set("website", e.target.value)} />
//           </LedgerFieldRow>
//         </>
//       )}
//     </LedgerSection>
//   );

//   const mailingShortSection = has("MAILING_SHORT") && !has("MAILING") && conditional.showMailingDetails && (
//     <LedgerSection title="Mailing Details">
//       <LedgerFieldRow label="Name">
//         <LedgerInput
//           value={form.mailingName || form.name}
//           onChange={(e) => set("mailingName", e.target.value)}
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Address">
//         <div className="flex flex-col gap-1">
//           <LedgerInput value={form.addr1} onChange={(e) => set("addr1", e.target.value)} placeholder="Line 1" />
//           <LedgerInput value={form.addr2} onChange={(e) => set("addr2", e.target.value)} placeholder="Line 2" />
//           <LedgerInput value={form.addr3} onChange={(e) => set("addr3", e.target.value)} placeholder="Line 3" />
//           <LedgerInput value={form.addr4} onChange={(e) => set("addr4", e.target.value)} placeholder="Line 4" />
//         </div>
//       </LedgerFieldRow>
//       <LedgerFieldRow label="Primary Mobile No.">
//         <LedgerInput value={form.primaryMobile} onChange={(e) => set("primaryMobile", e.target.value)} maxLength={15} />
//       </LedgerFieldRow>
//     </LedgerSection>
//   );

//   const bankingSection = has("BANKING") && conditional.showPartyBankDetails && (
//     <LedgerSection title="Banking Details">
//       <LedgerFieldRow label="Provide bank details?">
//         <LedgerToggle value={form.provideBankDetails} onChange={(v) => set("provideBankDetails", v)} />
//       </LedgerFieldRow>

//       {form.provideBankDetails && (
//         <>
//           <LedgerFieldRow label="Account Holder's Name" indent={1}>
//             <LedgerInput
//               value={form.accountHolderName || form.name}
//               onChange={(e) => set("accountHolderName", e.target.value)}
//             />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Account Number" indent={1}>
//             <LedgerInput value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="IFSC Code" indent={1}>
//             <LedgerInput
//               value={form.ifsc}
//               onChange={(e) => set("ifsc", e.target.value.toUpperCase())}
//               maxLength={11}
//               className="font-mono uppercase"
//             />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="SWIFT Code" indent={1}>
//             <LedgerInput value={form.swift} onChange={(e) => set("swift", e.target.value.toUpperCase())} className="font-mono uppercase" />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Bank Name" indent={1}>
//             <LedgerAutocomplete value={form.bankName} onChange={(v) => set("bankName", v)} options={BANK_OPTIONS} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Branch" indent={1}>
//             <LedgerInput value={form.branch} onChange={(e) => set("branch", e.target.value)} />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Account Type" indent={1}>
//             <LedgerSelect value={form.accountType} onChange={(v) => set("accountType", v)} options={ACCOUNT_TYPES} />
//           </LedgerFieldRow>

//           <LedgerFieldRow label="Transaction Types" indent={1}>
//             <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
//               {TXN_TYPES.map((t) => {
//                 const checked = form.bankTransactionTypes.includes(t);
//                 const hasCfg = !!form.txnConfigs[t] && Object.keys(form.txnConfigs[t]).length > 0;
//                 return (
//                   <div key={t} className="flex items-center justify-between gap-2 py-0.5">
//                     <label className="flex items-center gap-2 text-xs cursor-pointer min-w-0">
//                       <Checkbox
//                         checked={checked}
//                         onCheckedChange={() => toggleTxnType(t)}
//                       />
//                       <span className="truncate">{t}</span>
//                       {hasCfg && <span className="rounded bg-primary/10 text-primary text-[9px] px-1">cfg</span>}
//                     </label>
//                     {checked && (
//                       <button
//                         type="button"
//                         onClick={() => setTxnDialog(t)}
//                         className="text-muted-foreground hover:text-primary"
//                         title="Configure transaction type"
//                       >
//                         <Settings className="h-3 w-3" />
//                       </button>
//                     )}
//                   </div>
//                 );
//               })}
//             </div>
//           </LedgerFieldRow>
//         </>
//       )}
//     </LedgerSection>
//   );

//   const bankConfigSection = has("BANKCONFIG") && conditional.showBankAccountDetails && (
//     <>
//       <LedgerSection title="Bank Account Details">
//         <LedgerFieldRow label="Account Holder's Name" required>
//           <LedgerInput
//             value={form.accountHolderName || form.name}
//             onChange={(e) => set("accountHolderName", e.target.value)}
//           />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="Account Number" required>
//           <LedgerInput value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="IFSC Code" required>
//           <LedgerInput
//             value={form.ifsc}
//             onChange={(e) => set("ifsc", e.target.value.toUpperCase())}
//             maxLength={11}
//             className="font-mono uppercase"
//           />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="SWIFT Code">
//           <LedgerInput value={form.swift} onChange={(e) => set("swift", e.target.value.toUpperCase())} className="font-mono uppercase" />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="Bank Name" required>
//           <LedgerAutocomplete value={form.bankName} onChange={(v) => set("bankName", v)} options={BANK_OPTIONS} />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="Branch">
//           <LedgerInput value={form.branch} onChange={(e) => set("branch", e.target.value)} />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="Account Type">
//           <LedgerSelect value={form.accountType} onChange={(v) => set("accountType", v)} options={ACCOUNT_TYPES} />
//         </LedgerFieldRow>
//       </LedgerSection>

//       <LedgerSection title="Bank Configuration">
//         <LedgerFieldRow label="Effective Date for Reconciliation">
//           <LedgerInput
//             type="date"
//             value={form.effectiveDateForReconciliation}
//             onChange={(e) => set("effectiveDateForReconciliation", e.target.value)}
//           />
//         </LedgerFieldRow>
//         <LedgerFieldRow label="Set/Alter range for Cheque Books?">
//           <LedgerToggle value={form.setAlterChequeBooks} onChange={(v) => set("setAlterChequeBooks", v)} />
//         </LedgerFieldRow>
//         {form.setAlterChequeBooks && (
//           <>
//             <LedgerFieldRow label="Cheque Book Name" indent={1}>
//               <LedgerInput value={form.chequeBookName} onChange={(e) => set("chequeBookName", e.target.value)} />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="From No." indent={1}>
//               <LedgerInput value={form.chequeFrom} onChange={(e) => set("chequeFrom", e.target.value)} className="w-32" />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="To No." indent={1}>
//               <LedgerInput value={form.chequeTo} onChange={(e) => set("chequeTo", e.target.value)} className="w-32" />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="Cheque Number Length" indent={1}>
//               <LedgerInput value={form.chequeNumberLength} onChange={(e) => set("chequeNumberLength", e.target.value)} className="w-24" />
//             </LedgerFieldRow>
//           </>
//         )}
//         <LedgerFieldRow label="Enable Cheque Printing?">
//           <LedgerToggle value={form.enableChequePrinting} onChange={(v) => set("enableChequePrinting", v)} />
//         </LedgerFieldRow>
//         {form.enableChequePrinting && (
//           <>
//             <LedgerFieldRow label="Select Bank Name" indent={1}>
//               <LedgerAutocomplete value={form.chequePrintBank} onChange={(v) => set("chequePrintBank", v)} options={BANK_OPTIONS} />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="Name to Print on Cheque" indent={1}>
//               <LedgerInput
//                 value={form.chequePrintName}
//                 onChange={(e) => set("chequePrintName", e.target.value)}
//                 placeholder="Payee name as it appears on cheque"
//               />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="Cheque Width (mm)" indent={1}>
//               <LedgerInput
//                 value={form.chequeWidth}
//                 onChange={(e) => set("chequeWidth", e.target.value)}
//                 placeholder="e.g. 210"
//                 className="w-28"
//               />
//             </LedgerFieldRow>
//             <LedgerFieldRow label="Cheque Height (mm)" indent={1}>
//               <LedgerInput
//                 value={form.chequeHeight}
//                 onChange={(e) => set("chequeHeight", e.target.value)}
//                 placeholder="e.g. 99"
//                 className="w-28"
//               />
//             </LedgerFieldRow>
//           </>
//         )}
//       </LedgerSection>
//     </>
//   );

//   const taxRegSection = has("TAXREG") && conditional.showGSTRegistration && (
//     <LedgerSection title="Tax Registration Details">
//       <LedgerFieldRow label="Registration Type">
//         <LedgerSelect value={form.registrationType} onChange={(v) => set("registrationType", v)} options={REG_TYPES} />
//       </LedgerFieldRow>
//       {conditional.showAssesseeOtherTerritory && (
//         <LedgerFieldRow label="Assessee of Other Territory?">
//           <LedgerToggle value={form.assesseeOtherTerritory} onChange={(v) => set("assesseeOtherTerritory", v)} />
//         </LedgerFieldRow>
//       )}
//       {form.assesseeOtherTerritory && conditional.showAssesseeOtherTerritory && (
//         <LedgerFieldRow label="Territory" indent={1}>
//           <LedgerAutocomplete value={form.territory} onChange={(v) => set("territory", v)} options={STATE_OPTIONS} />
//         </LedgerFieldRow>
//       )}
//       <LedgerFieldRow label="GSTIN/UIN">
//         <LedgerInput
//           value={form.gstin}
//           onChange={(e) => set("gstin", e.target.value.toUpperCase())}
//           maxLength={15}
//           className="font-mono uppercase"
//         />
//       </LedgerFieldRow>
//       <LedgerFieldRow label="PAN/IT No.">
//         <LedgerInput
//           value={form.panIt}
//           onChange={(e) => set("panIt", e.target.value.toUpperCase())}
//           maxLength={10}
//           className="font-mono uppercase"
//         />
//       </LedgerFieldRow>

//       {form.registrationType === "Tax Deductor" && (
//         <>
//           <LedgerFieldRow label="TAN Number" indent={1}>
//             <LedgerInput
//               value={form.tanNumber}
//               onChange={(e) => set("tanNumber", e.target.value.toUpperCase())}
//               maxLength={10}
//               className="font-mono uppercase w-40"
//               placeholder="ABCD12345E"
//             />
//           </LedgerFieldRow>
//           <LedgerFieldRow label="Deductor Category" indent={1}>
//             <LedgerInput
//               value={form.deductorCategory}
//               onChange={(e) => set("deductorCategory", e.target.value)}
//               placeholder="e.g. Company, Govt., Individual"
//             />
//           </LedgerFieldRow>
//         </>
//       )}
//       {form.registrationType === "Tax Collector (E-Commerce)" && (
//         <LedgerFieldRow label="Tax Collection Account No." indent={1}>
//           <LedgerInput
//             value={form.collectionAccountNo}
//             onChange={(e) => set("collectionAccountNo", e.target.value.toUpperCase())}
//             maxLength={20}
//             className="font-mono uppercase"
//           />
//         </LedgerFieldRow>
//       )}
//     </LedgerSection>
//   );


//   const taxRegShortSection = has("TAXREG_SHORT") && !has("TAXREG") && conditional.showGSTRegistration && (
//     <LedgerSection title="Tax Registration Details">
//       <LedgerFieldRow label="PAN/IT No.">
//         <LedgerInput
//           value={form.panIt}
//           onChange={(e) => set("panIt", e.target.value.toUpperCase())}
//           maxLength={10}
//           className="font-mono uppercase"
//         />
//       </LedgerFieldRow>
//     </LedgerSection>
//   );

//   /* ════════════════════════════════════════════════════════════════════
//    *  COLUMN ASSIGNMENT — auto-balanced
//    *  LEFT  : identity, accounting, statutory, opening balance
//    *  RIGHT : mailing, banking, tax registration
//    * ════════════════════════════════════════════════════════════════════ */

//   const leftColumn = [
//     basicSection,
//     billByBillSection,
//     typeOfLedgerSection,
//     roundingSection,
//     dutyTaxSection,
//     behaviourOptionsSection,
//     appropriationSection,
//     addCostSection,
//     has("STATUTORY") && conditional.showGSTDetails ? statutorySection : false,
//     (has("HSNSAC") || has("HSNSAC_NODESC") || has("HSNSAC_NOT")) && conditional.showHSNSAC ? hsnSection : false,
//     conditional.showCostCentres ? (
//       <LedgerSection key="cost-centres" title="Cost Centres">
//         <LedgerFieldRow label="Maintain Cost Centres?">
//           <LedgerToggle value={form.maintainCostCenters} onChange={(v) => set("maintainCostCenters", v)} />
//         </LedgerFieldRow>
//         {form.maintainCostCenters && (
//           <LedgerFieldRow label="Cost Centre allocation for this ledger?" indent={1}>
//             <LedgerToggle value={form.costCentreAllocation} onChange={(v) => set("costCentreAllocation", v)} />
//           </LedgerFieldRow>
//         )}
//       </LedgerSection>
//     ) : false,
//   ].filter(Boolean);

//   const rightColumn = [
//     mailingSection,
//     mailingShortSection,
//     bankingSection,
//     bankConfigSection,
//     taxRegSection,
//     taxRegShortSection,
//   ].filter(Boolean);

//   /* ════════════════════════════════════════════════════════════════════ */

//   return (
//     <div ref={formRef} className="text-foreground animate-slide-up font-['Segoe_UI',_'Inter',_system-ui,_sans-serif] tracking-tight text-[13px] leading-relaxed">
//       {/* ─── Sticky toolbar ─── */}
//       <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
//         <div className="flex items-center gap-2 min-w-0">
//           <Settings className="h-4 w-4 text-primary shrink-0" />
//           <h2 className="text-sm font-semibold tracking-tight truncate">
//             Ledger Creation {initial?.name ? "— Alter" : ""}
//           </h2>
//           {form.group && (
//             <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground truncate">
//               {form.group}
//             </span>
//           )}
//           {/* Config-active indicator: shows when config gates are hiding fields */}
//           {(() => {
//             const hidden = [
//               !conditional.showAliasField,
//               !conditional.showBillWise,
//               !conditional.showMailingDetails,
//               !conditional.showGSTDetails,
//               !conditional.showHSNSAC,
//               !conditional.showBankAccountDetails,
//               !conditional.showGSTRegistration,
//               !conditional.showMSME,
//               !conditional.showOpeningBalance,
//             ].filter(Boolean).length;
//             return hidden > 0 ? (
//               <button
//                 type="button"
//                 onClick={() => onOpenConfig?.()}
//                 title="F12 — Open Configuration"
//                 className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
//               >
//                 <Settings className="h-2.5 w-2.5" />
//                 {hidden} field{hidden > 1 ? "s" : ""} hidden by Config
//               </button>
//             ) : null;
//           })()}
//         </div>
//         <div className="flex items-center gap-1.5 flex-wrap">
//           <kbd className="hidden md:inline rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">Enter ↵</kbd>
//           <kbd className="hidden md:inline rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">F12</kbd>
//           <kbd className="hidden md:inline rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">Ctrl+A</kbd>
//           <kbd className="hidden md:inline rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">Ctrl+S</kbd>
//           <Button size="sm" onClick={handleSave} className="h-7 gap-1.5 text-xs">
//             <Save className="h-3.5 w-3.5" /> Accept
//           </Button>
//           <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">Close</Button>
//         </div>
//       </div>

//       {/* ── Group not picked yet: hint banner ── */}
//       {!form.group && (
//         <div className="mb-3 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
//           Pick an <span className="font-semibold text-primary">Under Group</span> to load the
//           group-specific field-set. Layout will split into two columns automatically.
//         </div>
//       )}

//       {/* ── Two-column split layout ── */}
//       <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-0">
//         <div className="min-w-0">
//           {leftColumn.map((node, i) => (
//             <div key={`left-${i}`}>{node}</div>
//           ))}
//         </div>
//         <div className="min-w-0 xl:border-l xl:border-border/60 xl:pl-6">
//           {rightColumn.length === 0 && form.group ? (
//             <div className="text-xs text-muted-foreground italic pt-4">
//               No mailing / banking / tax fields apply to this group.
//             </div>
//           ) : (
//             rightColumn.map((node, i) => (
//               <div key={`right-${i}`}>{node}</div>
//             ))
//           )}
//         </div>
//       </div>

//       {/* ── Opening Balance — always anchored at the very bottom, full width ── */}
//       {form.group && (
//         <div className="mt-4 border-t-2 border-primary/30 pt-3">
//           {openingSection}
//         </div>
//       )}

//       {/* ─── Footer ─── */}
//       <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
//         <div className="text-[11px] text-muted-foreground space-x-1">
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Enter</kbd> next ·
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Shift+Enter</kbd> prev ·
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">F12</kbd> config ·
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Ctrl+A</kbd> accept ·
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Ctrl+S</kbd> save ·
//           <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Esc</kbd> close
//         </div>
//         <div className="flex gap-2">
//           <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">Cancel</Button>
//           <Button size="sm" onClick={handleSave} className="h-8 gap-1.5 text-xs">
//             <Save className="h-3.5 w-3.5" /> Accept
//           </Button>
//         </div>
//       </div>

//       {/* ─── Banking transaction sub-dialog ─── */}
//       {txnDialog && (
//         <TransactionConfigDialog
//           type={txnDialog}
//           initial={form.txnConfigs[txnDialog] ?? {}}
//           onClose={() => setTxnDialog(null)}
//           onSave={(cfg) =>
//             setForm((p) => ({
//               ...p,
//               txnConfigs: { ...p.txnConfigs, [txnDialog]: cfg },
//             }))
//           }
//         />
//       )}
//     </div>
//   );
// }

// export default AdvancedLedgerFormPanel;

/**
 * AdvancedLedgerDialog — Tally Prime Advanced Ledger Creation panel.
 *
 * Strictly metadata-driven from tally-ledger-fields-reference.md:
 *  • GROUP_MAP  → which Part-2 field-sets apply per Under Group
 *  • Each field-set renders the exact fields/hierarchy from Part 1
 *  • Parent → Child → Grandchild rows use `.tally-row.is-child / .is-grandchild`
 *
 * Improvements layered on top of the metadata engine:
 *  1. Two-column split layout (LEFT = identity/accounting, RIGHT = mailing/banking/tax)
 *     auto-rebalanced after Under-Group selection.
 *  2. Tally-style keyboard navigation (Enter / Shift+Enter / Arrow / Tab) that
 *     walks visible form controls only — hidden conditional fields are skipped.
 *  3. Real-time conditional activation (Yes immediately reveals child fields).
 *  4. Banking transaction-type sub-dialogs (Cheque / e-Fund / Card / ECS / DD-PO / Others)
 *     storing per-type configuration on the form.
 *  5. F12 / Alt+F12 open Config (callback up to parent).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Save, Settings, ChevronDown, Search, X, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { toast } from "sonner";
import {
  useConditionalFields,
  type ParentGroupInfo,
} from "./ConfigDialog";

/* ════════════════════════════════════════════════════════════════════════
 * 1.  FORM SHAPE (extended — backward compatible)
 * ════════════════════════════════════════════════════════════════════════ */

export interface AdvancedLedgerForm {
  // Basic
  name: string;
  alias: string;
  group: string;            // display name of selected "Under" group
  groupId: number | null;   // id of selected group (acc_group_master.id or acc_ledger_groups.id)
  groupSource: "system" | "custom" | null; // which table groupId belongs to
  inventoryAffected: boolean;
  effectiveDate: string;
  openingBalance: string;
  drCr: "Dr" | "Cr";
  freezeBalance: boolean;

  // Mailing
  showMailingDetails: boolean;
  mailingName: string;
  addr1: string;
  addr2: string;
  addr3: string;
  addr4: string;
  city: string;
  district: string;
  state: string;
  country: string;
  pincode: string;
  provideContactDetails: boolean;
  contactPerson: string;
  telephone: string;
  mobile: string;
  email: string;
  website: string;
  primaryMobile: string;

  // Tax Registration
  panIt: string;
  registrationType:
  | "Regular"
  | "Composition"
  | "Unregistered"
  | "Consumer"
  | "SEZ Unit"
  | "SEZ Developer"
  | "Deemed Export"
  | "Tax Deductor"
  | "Tax Collector (E-Commerce)"
  | "Input Service Distributor"
  | "Overseas"
  | "UIN Holder";
  gstin: string;
  assesseeOtherTerritory: boolean;
  territory: string;

  // Statutory / GST
  isGstApplicable: "Applicable" | "Not Applicable" | "Undefined" | "As per Company" | "As per Group";
  setAlterGst: boolean;
  gstDescription: string;
  gstApplicableFrom: string;
  gstHsnSacCode: string;
  gstTypeOfSupply: "Goods" | "Services";
  gstTaxability: "Taxable" | "Exempt" | "Nil Rated";
  gstIgstRate: string;
  gstCgstRate: string;
  gstSgstRate: string;
  gstCessRate: string;
  gstCessType: "Valorem" | "Quantum";
  gstReverseCharge: boolean;
  includeInAssessable: boolean;
  appropriateTo: "Goods" | "Services" | "Both";
  methodOfAppropriation: "Based on Value" | "Based on Quantity";

  // GST extensions (Quantum cess + lifecycle)
  cessPerUnit: string;
  cessUnit: string;
  gstStatus: "Active" | "Cancelled" | "Suspended";
  cancelledDate: string;

  // TDS / TCS deductee & buyer categorization
  taxType: "None" | "TDS" | "TCS";
  deducteeType: "Individual" | "HUF" | "Firm" | "Company" | "Trust" | "Government" | "AOP";
  buyerType: "Individual" | "Company" | "Government" | "Exporter" | "SEZ";

  // Tax Deductor / Collector registration extras
  tanNumber: string;
  deductorCategory: string;
  collectionAccountNo: string;

  // MSME
  msmeRegistered: boolean;
  udyamNumber: string;

  // e-Invoice
  einvoiceApplicable: boolean;
  defaultSupplyType: "B2B" | "SEZ" | "Export" | "Deemed Export";

  // e-Way Bill
  ewayBillApplicable: boolean;
  defaultTransportMode: "Road" | "Rail" | "Air" | "Ship";
  defaultDistance: string;


  // Banking (party bank block)
  provideBankDetails: boolean;
  accountHolderName: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  ifsc: string;
  swift: string;
  accountType: "Savings" | "Current" | "Cash Credit" | "Overdraft" | "Loan A/c";
  bankTransactionTypes: string[];
  /** Per-transaction-type configuration captured via the sub-dialog. */
  txnConfigs: Record<string, Record<string, string>>;

  // Bank Configuration (Bank Accounts group only)
  effectiveDateForReconciliation: string;
  setAlterChequeBooks: boolean;
  chequeBookName: string;
  chequeFrom: string;
  chequeTo: string;
  chequeNumberLength: string;
  enableChequePrinting: boolean;
  chequePrintBank: string;

  // Bill-by-bill
  maintainBillWise: boolean;
  defaultCreditPeriod: string;
  checkCreditDaysDuringEntry: boolean;

  // Type of ledger / Rounding
  typeOfLedger: "Not Applicable" | "Invoice Rounding" | "Discount";
  roundingMethod: "Not Applicable" | "Normal Rounding" | "Downward Rounding" | "Upward Rounding";
  roundingLimit: string;

  // Appropriation
  methodToAllocate: boolean;
  allocationMethod: "Appropriate by Value" | "Appropriate by Quantity";

  // Additional cost
  useAsAdditionalCost: boolean;

  // Duty/Tax (Duties & Taxes group)
  typeOfDutyTax: "GST" | "TCS" | "TDS" | "Others";
  dutyTaxType: string;
  dutyPercentage: string;
  dutyBasedOn: "On Total Sales" | "On Current Subtotal" | "On Item Rate" | "On TDS/TCS Assessable Value";
  methodOfCalculationDuty: "On Total Sales" | "On Net Sales" | "On Assessable Value";

  // HSN/SAC
  hsnSacDetailsMode: "As per Company" | "As per Stock Group" | "Specify Details Here";
  hsnSacSourceMode:
  | "As per Company"
  | "As per Stock Group"
  | "As per Stock Item"
  | "Specify Details Here";
  hsnCode: string;
  hsnDescription: string;
  natureOfTransaction: string;

  // Cost centres (config-driven)
  maintainCostCenters: boolean;
  costCentreAllocation: boolean;

  // Narration / Notes
  narration: string;

  // Regional language alias (separate from primary alias)
  aliasRegional: string;

  // Ledger lifecycle
  inactive: boolean;

  // Reporting under (sub-group mapping)
  reportingUnder: string;

  // Behaviour options (Duties & Taxes group)
  ledgerFlushingMethod: "Default" | "Cash Basis" | "Accrual Basis";
  includeInBuyerLedger: boolean;
  includeInSellerLedger: boolean;

  // TDS/TCS e-filing
  usedInTdsReturns: boolean;

  // Cheque printing extras
  chequePrintName: string;
  chequeWidth: string;
  chequeHeight: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

const DEFAULTS: AdvancedLedgerForm = {
  name: "",
  alias: "",
  group: "",
  groupId: null,
  groupSource: null,
  inventoryAffected: false,
  effectiveDate: TODAY,
  openingBalance: "",
  drCr: "Dr",
  freezeBalance: false,

  showMailingDetails: true,
  mailingName: "",
  addr1: "",
  addr2: "",
  addr3: "",
  addr4: "",
  city: "",
  district: "",
  state: "Tamil Nadu",
  country: "India",
  pincode: "",
  provideContactDetails: false,
  contactPerson: "",
  telephone: "",
  mobile: "",
  email: "",
  website: "",
  primaryMobile: "",

  panIt: "",
  registrationType: "Regular",
  gstin: "",
  assesseeOtherTerritory: false,
  territory: "",

  isGstApplicable: "Applicable",
  setAlterGst: false,
  gstDescription: "",
  gstApplicableFrom: TODAY,
  gstHsnSacCode: "",
  gstTypeOfSupply: "Goods",
  gstTaxability: "Taxable",
  gstIgstRate: "18",
  gstCgstRate: "9",
  gstSgstRate: "9",
  gstCessRate: "0",
  gstCessType: "Valorem",
  gstReverseCharge: false,
  includeInAssessable: false,
  appropriateTo: "Goods",
  methodOfAppropriation: "Based on Value",

  cessPerUnit: "",
  cessUnit: "",
  gstStatus: "Active",
  cancelledDate: "",

  taxType: "None",
  deducteeType: "Company",
  buyerType: "Company",

  tanNumber: "",
  deductorCategory: "",
  collectionAccountNo: "",

  msmeRegistered: false,
  udyamNumber: "",

  einvoiceApplicable: false,
  defaultSupplyType: "B2B",

  ewayBillApplicable: false,
  defaultTransportMode: "Road",
  defaultDistance: "",


  provideBankDetails: false,
  accountHolderName: "",
  bankName: "",
  branch: "",
  accountNumber: "",
  ifsc: "",
  swift: "",
  accountType: "Current",
  bankTransactionTypes: [],
  txnConfigs: {},

  effectiveDateForReconciliation: TODAY,
  setAlterChequeBooks: false,
  chequeBookName: "",
  chequeFrom: "",
  chequeTo: "",
  chequeNumberLength: "6",
  enableChequePrinting: false,
  chequePrintBank: "",

  maintainBillWise: false,
  defaultCreditPeriod: "30",
  checkCreditDaysDuringEntry: false,

  typeOfLedger: "Not Applicable",
  roundingMethod: "Not Applicable",
  roundingLimit: "1",

  methodToAllocate: false,
  allocationMethod: "Appropriate by Value",

  useAsAdditionalCost: false,

  typeOfDutyTax: "GST",
  dutyTaxType: "Central Tax",
  dutyPercentage: "9",
  dutyBasedOn: "On Total Sales",
  methodOfCalculationDuty: "On Total Sales",

  hsnSacDetailsMode: "As per Company",
  hsnSacSourceMode: "As per Company",
  hsnCode: "",
  hsnDescription: "",
  natureOfTransaction: "",

  maintainCostCenters: false,
  costCentreAllocation: false,

  narration: "",
  aliasRegional: "",
  inactive: false,
  reportingUnder: "",

  ledgerFlushingMethod: "Default",
  includeInBuyerLedger: false,
  includeInSellerLedger: false,
  usedInTdsReturns: false,

  chequePrintName: "",
  chequeWidth: "",
  chequeHeight: "",
};

/* ════════════════════════════════════════════════════════════════════════
 * 2.  REFERENCE OPTION LISTS
 * ════════════════════════════════════════════════════════════════════════ */

const COUNTRY_OPTIONS = [
  "India", "United States", "United Kingdom", "Singapore", "UAE",
  "Australia", "Canada", "Germany", "France", "Japan",
];
const STATE_OPTIONS = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
];
const BANK_OPTIONS = [
  "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank",
  "Kotak Mahindra Bank", "Yes Bank", "Punjab National Bank",
  "Bank of Baroda", "Indian Bank", "Canara Bank", "Federal Bank",
  "IDFC First Bank", "Union Bank of India", "IndusInd Bank", "Others",
];
const ACCOUNT_TYPES = ["Savings", "Current", "Cash Credit", "Overdraft", "Loan A/c"] as const;
const REG_TYPES = [
  "Regular", "Composition", "Unregistered", "Consumer",
  "SEZ Unit", "SEZ Developer", "Deemed Export",
  "Tax Deductor", "Tax Collector (E-Commerce)",
  "Input Service Distributor", "Overseas", "UIN Holder",
] as const;
const TXN_TYPES = [
  "ATM", "Card", "Cheque", "ECS", "e-Fund Transfer",
  "Electronic Cheque", "Electronic DD/PO", "Others",
] as const;
const DUTY_TAX_TYPE_OPTIONS: Record<AdvancedLedgerForm["typeOfDutyTax"], string[]> = {
  GST: ["Central Tax", "State Tax", "Integrated Tax", "Cess"],
  TCS: ["Sale of Goods", "Sale of Scrap", "Sale of Tendu Leaves", "Other"],
  TDS: ["Salary", "Rent", "Professional Fees", "Commission", "Contract"],
  Others: ["Not Applicable"],
};

/* Per-transaction-type sub-dialog schema. */
const TXN_CONFIG_SCHEMA: Record<string, { title: string; fields: { key: string; label: string; type?: "text" | "date" | "number"; placeholder?: string }[] }> = {
  "e-Fund Transfer": {
    title: "e-Fund Transfer — Transaction Configuration",
    fields: [
      { key: "accountNumber", label: "Account Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "ifsc", label: "IFSC Code" },
      { key: "branch", label: "Branch" },
      { key: "refFormat", label: "Reference Format", placeholder: "e.g. NEFT/{date}/{seq}" },
      { key: "txnIdentifier", label: "Transaction Identifier" },
      { key: "narration", label: "Default Narration" },
    ],
  },
  "Cheque": {
    title: "Cheque — Configuration",
    fields: [
      { key: "chequeNo", label: "Cheque Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "branch", label: "Branch" },
      { key: "printing", label: "Cheque Printing Enabled (Yes/No)" },
      { key: "rangeFrom", label: "Cheque Range From", type: "number" },
      { key: "rangeTo", label: "Cheque Range To", type: "number" },
    ],
  },
  "Card": {
    title: "Card — Configuration",
    fields: [
      { key: "cardType", label: "Card Type (Credit/Debit)" },
      { key: "cardNumber", label: "Card Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "authRequired", label: "Authorization Required (Yes/No)" },
    ],
  },
  "ECS": {
    title: "ECS — Configuration",
    fields: [
      { key: "mandateNo", label: "Mandate Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "refNo", label: "Reference Number" },
    ],
  },
  "Electronic DD/PO": {
    title: "DD / PO — Configuration",
    fields: [
      { key: "instrumentNo", label: "Instrument Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "branch", label: "Branch" },
      { key: "issueDate", label: "Issue Date", type: "date" },
    ],
  },
  "Electronic Cheque": {
    title: "Electronic Cheque — Configuration",
    fields: [
      { key: "chequeNo", label: "e-Cheque Number" },
      { key: "bankName", label: "Bank Name" },
      { key: "branch", label: "Branch" },
    ],
  },
  "ATM": {
    title: "ATM — Configuration",
    fields: [
      { key: "atmId", label: "ATM Identifier" },
      { key: "bankName", label: "Bank Name" },
      { key: "narration", label: "Default Narration" },
    ],
  },
  "Others": {
    title: "Other Transaction — Custom Details",
    fields: [
      { key: "description", label: "Description" },
      { key: "reference", label: "Reference" },
      { key: "remarks", label: "Remarks" },
    ],
  },
};

/* ════════════════════════════════════════════════════════════════════════
 * 3.  GROUP → FIELD-SET MAPPING (verbatim Part 2 of reference doc)
 * ════════════════════════════════════════════════════════════════════════ */

type FieldSetKey =
  | "MAILING" | "MAILING_SHORT"
  | "BANKING"
  | "BANKCONFIG"
  | "TAXREG" | "TAXREG_SHORT"
  | "STATUTORY"
  | "HSNSAC" | "HSNSAC_NODESC" | "HSNSAC_NOT"
  | "BILLBYBILL"
  | "INVAFFECT"
  | "APPROPRIATION"
  | "ADDCOST"
  | "TYPEOFLEDGER"
  | "DUTYTAX"
  | "ROUNDING";

const GROUP_MAP: Record<string, FieldSetKey[]> = {
  "Bank Accounts": ["BANKCONFIG", "MAILING", "TAXREG"],
  "Bank OD A/c": ["BANKCONFIG", "MAILING", "TAXREG"],
  "Branch / Divisions": ["BILLBYBILL", "INVAFFECT", "MAILING", "BANKING", "TAXREG"],
  "Capital Account": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Cash-in-Hand": ["MAILING_SHORT"],
  "Current Asset": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Current Assets": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Current Liabilities": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Deposits (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Direct Expenses": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG_SHORT"],
  "Direct Incomes": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Duties & Taxes": ["DUTYTAX", "BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "ROUNDING", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Fixed Assets": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG"],
  "Indirect Expenses": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING", "BANKING", "TAXREG_SHORT"],
  "Indirect Incomes": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Investments (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Loans & Advances (Asset)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "HSNSAC_NOT", "MAILING", "BANKING", "TAXREG"],
  "Loans & Advances (Liability)": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Misc. Expenses (ASSET)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Miscellaneous Expenses (Asset)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Miscellaneous Income (ASSET)": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Primary": ["MAILING", "BANKING", "TAXREG"],
  "Provisions": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Provisions (Current Liabilities)": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Purchase Account": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "APPROPRIATION", "ADDCOST", "STATUTORY", "HSNSAC_NODESC", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Reserves & Surplus": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Sales Account": ["BILLBYBILL", "INVAFFECT", "TYPEOFLEDGER", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Secured Loans": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Stock-in-Hand": ["INVAFFECT"],
  // Sundry party groups: STATUTORY needed for GST/TDS/TCS/MSME/e-Invoice/e-Way Bill fields
  "Sundry Creditors": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  "Sundry Debtors": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
  // Depreciation & Retained Earnings — previously fell to DEFAULT_FIELDSET
  "Depreciation": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Retained Earnings": ["BILLBYBILL", "INVAFFECT", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Suspense AC": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Suspense A/c": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Suspense Account": ["BILLBYBILL", "INVAFFECT", "APPROPRIATION", "ADDCOST", "MAILING_SHORT", "BANKING", "TAXREG_SHORT"],
  "Unsecured Loans": ["BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG"],
};

const DEFAULT_FIELDSET: FieldSetKey[] = [
  "BILLBYBILL", "INVAFFECT", "STATUTORY", "MAILING", "BANKING", "TAXREG",
];

function fieldSetsFor(group: string): FieldSetKey[] {
  if (!group) return [];
  return GROUP_MAP[group] ?? DEFAULT_FIELDSET;
}

function parentGroupInfoFor(group: string): ParentGroupInfo | null {
  if (!group) return null;
  const g = group.toLowerCase();
  return {
    name: group,
    category:
      /capital|reserve/.test(g) ? "Equity"
        : /liab|creditor|provision|loan|overdraft|tax|duty/.test(g) ? "Liabilities"
          : /income|sales/.test(g) ? "Income"
            : /expense|depreciation/.test(g) ? "Expenses"
              : "Assets",
    isSundryParty: /sundry/.test(g),
    isBankAccount: /^bank/.test(g),
    isDutiesTaxes: /tax|duty/.test(g),
    isLoanAccount: /loan/.test(g),
    isCapitalAccount: /capital/.test(g),
    isSalesPurchase: /sales|purchase/.test(g),
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * 4.  PRIMITIVES — pure presentational, dense ERP styling
 * ════════════════════════════════════════════════════════════════════════ */

export function LedgerSectionHeader({ label }: { label: string }) {
  return (
    <div className="tally-section-header">
      <span className="label">{label}</span>
      <span className="rule" />
    </div>
  );
}

export function LedgerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <LedgerSectionHeader label={title} />
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

type Indent = 0 | 1 | 2 | 3;
export function LedgerFieldRow({
  label,
  required,
  indent = 0,
  children,
}: {
  label: string;
  required?: boolean;
  indent?: Indent;
  children: ReactNode;
}) {
  const cls =
    indent === 3 ? "tally-row is-grandchild" :
      indent === 2 ? "tally-row is-grandchild"
        : indent === 1 ? "tally-row is-child"
          : "tally-row";
  return (
    <div className={cls}>
      <label className="tally-label flex items-center gap-1">
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
        <span className="ml-auto pr-1 text-muted-foreground/60">:</span>
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function LedgerInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={`tally-input ${props.className ?? ""}`} />;
}

export function LedgerSelect<T extends string>({
  value, onChange, options, disabled,
}: {
  value: T; onChange: (v: T) => void; options: readonly T[] | T[]; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="tally-input appearance-none pr-7 cursor-pointer"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

export function LedgerToggle({
  value, onChange, yesLabel = "Yes", noLabel = "No",
}: {
  value: boolean; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={value} onCheckedChange={onChange} />
      <span className="text-xs font-medium text-foreground">
        {value ? yesLabel : noLabel}
      </span>
    </div>
  );
}

export function LedgerAmountInput({
  value, onChange, drCr, onDrCrChange, ...rest
}: {
  value: string; onChange: (v: string) => void;
  drCr: "Dr" | "Cr"; onDrCrChange: (v: "Dr" | "Cr") => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="flex items-stretch gap-1">
      <div className="relative flex-1">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
        <input
          {...rest}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="tally-input pl-6 text-right font-mono tabular-nums"
        />
      </div>
      <div className="flex rounded-md border border-input overflow-hidden">
        {(["Dr", "Cr"] as const).map((side) => (
          <button
            key={side} type="button"
            onClick={() => onDrCrChange(side)}
            className={`px-2.5 text-xs font-semibold transition-colors ${drCr === side
              ? side === "Dr" ? "bg-primary text-primary-foreground" : "bg-income text-white"
              : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}
          >{side}</button>
        ))}
      </div>
    </div>
  );
}

/** Tally-style auto-suggest input with keyboard navigation. */
export function LedgerAutocomplete({
  value, onChange, options, placeholder, onCreate, createLabel = "+ Create new",
}: {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; onCreate?: () => void; createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options.slice(0, 80);
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 80);
  }, [options, query]);

  const pick = (v: string) => { onChange(v); setQuery(v); setOpen(false); };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown")) {
      setOpen(true); setHi(0); e.preventDefault(); return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((p) => (p + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((p) => (p - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter") {
      if (filtered[hi]) {
        e.preventDefault();
        e.stopPropagation();
        pick(filtered[hi]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault(); setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="tally-input pl-7 pr-7"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          ><X className="h-3 w-3" /></button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No match — type to filter</div>
          )}
          {filtered.map((o, i) => (
            <button
              key={o} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o)}
              className={`flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors ${i === hi ? "bg-primary/10 text-primary" : "hover:bg-secondary"
                }`}
            >
              <span>{o}</span>
              {o === value && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}
          {onCreate && (
            <button
              type="button"
              onClick={() => { setOpen(false); onCreate(); }}
              className="flex w-full items-center px-2.5 py-1.5 text-xs text-primary border-t border-border hover:bg-primary/5"
            >{createLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * 5.  BANKING TRANSACTION SUB-DIALOG
 * ════════════════════════════════════════════════════════════════════════ */

function TransactionConfigDialog({
  type, initial, onClose, onSave,
}: {
  type: string;
  initial: Record<string, string>;
  onClose: () => void;
  onSave: (cfg: Record<string, string>) => void;
}) {
  const schema = TXN_CONFIG_SCHEMA[type] ?? TXN_CONFIG_SCHEMA["Others"];
  const [draft, setDraft] = useState<Record<string, string>>(initial ?? {});

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{schema.title}</DialogTitle>
          <DialogDescription className="text-xs">
            Per-ledger settings for the <span className="font-semibold">{type}</span> transaction type.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {schema.fields.map((f) => (
            <div key={f.key} className="tally-row">
              <label className="tally-label">
                <span>{f.label}</span>
                <span className="ml-auto pr-2 text-muted-foreground/60">:</span>
              </label>
              <input
                type={f.type ?? "text"}
                value={draft[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                className="tally-input"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel (Esc)</Button>
          <Button size="sm" onClick={() => { onSave(draft); onClose(); }}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * 6.  THE PANEL
 * ════════════════════════════════════════════════════════════════════════ */

/** A selectable "Under" option — either a system master group or a custom group. */
export interface UnderGroupOption {
  id: number;
  group_name: string;
  source: "system" | "custom";
}

interface PanelProps {
  onClose: () => void;
  onSave: (l: AdvancedLedgerForm) => void;
  groups: string[];
  /** Same groups as `groups`, but carrying id + source so the ledger can be
   *  saved with the correct group_id (custom) / master_group_id (system)
   *  mapping. Falls back to name-only matching (groupId stays null) when
   *  not supplied, for backward compatibility. */
  groupOptions?: UnderGroupOption[];
  onCreateGroup?: () => void;
  onOpenConfig?: () => void;
  initial?: Partial<AdvancedLedgerForm>;
}

export function AdvancedLedgerFormPanel({
  onClose, onSave, groups, groupOptions, onCreateGroup, onOpenConfig, initial,
}: PanelProps) {
  const [form, setForm] = useState<AdvancedLedgerForm>({ ...DEFAULTS, ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof AdvancedLedgerForm, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [txnDialog, setTxnDialog] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof AdvancedLedgerForm>(k: K, v: AdvancedLedgerForm[K]) =>
      setForm((p) => ({ ...p, [k]: v })),
    [],
  );

  /** Selecting "Under" must resolve id + source so we know whether to write
   *  group_id (custom group) or master_group_id (system group) on save —
   *  never both. */
  const setGroup = useCallback(
    (name: string) => {
      const match = groupOptions?.find(
        (g) => g.group_name.toLowerCase() === name.toLowerCase(),
      );
      setForm((p) => ({
        ...p,
        group: name,
        groupId: match ? match.id : null,
        groupSource: match ? match.source : null,
      }));
    },
    [groupOptions],
  );

  const parentInfo = useMemo(() => parentGroupInfoFor(form.group), [form.group]);
  const conditional = useConditionalFields(parentInfo);
  const fieldSets = useMemo(() => fieldSetsFor(form.group), [form.group]);
  const has = useCallback((k: FieldSetKey) => fieldSets.includes(k), [fieldSets]);

  const handleSave = useCallback(() => {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = "Ledger Name is required";
    if (!form.group.trim()) errs.group = "Under Group is required";
    if (form.group.trim() && groupOptions?.length && (!form.groupId || !form.groupSource)) {
      errs.group = "Select a valid group from the list (system or custom)";
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Fix highlighted fields before saving");
      return;
    }
    onSave(form);
  }, [form, onSave, groupOptions]);

  /* ── Global keyboard shortcuts: Ctrl+S save · Esc close · F12 / Alt+F12 config ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "a")) {
        e.preventDefault(); handleSave();
      } else if (e.key === "Escape") {
        // Don't bubble Escape from inside an open transaction sub-dialog
        if (!txnDialog) onClose();
      } else if (e.key === "F12") {
        e.preventDefault();
        onOpenConfig?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, onClose, onOpenConfig, txnDialog]);

  useEffect(() => { nameRef.current?.focus(); }, []);

  /* ── Tally-style field-to-field keyboard navigation ───────────────────
     Enter / ArrowDown / Tab → next visible control
     Shift+Enter / ArrowUp / Shift+Tab → previous visible control
     Hidden conditional fields are naturally skipped because they aren't rendered.
     ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const root = formRef.current;
    if (!root) return;

    const focusableSelector = [
      "input:not([type=hidden]):not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "button[role='switch']:not([disabled])",
    ].join(",");

    const isVisible = (el: Element) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;

      // Don't hijack inside textarea (Enter = newline) or sub-dialog
      if (target.tagName === "TEXTAREA") return;
      if (target.closest("[role='dialog']") && target.closest("[role='dialog']") !== root.closest("[role='dialog']")) return;

      const isEnter = e.key === "Enter";
      const isArrowDown = e.key === "ArrowDown" && (target.tagName === "INPUT" || target.tagName === "BUTTON");
      const isArrowUp = e.key === "ArrowUp" && (target.tagName === "INPUT" || target.tagName === "BUTTON");

      // Don't intercept ArrowDown/Up inside autocomplete dropdowns
      if ((isArrowDown || isArrowUp) && target.closest(".relative") && target.parentElement?.querySelector(".absolute.z-50")) {
        return;
      }
      // Skip Enter when inside a <select> (lets the browser confirm option)
      if (isEnter && target.tagName === "SELECT") return;

      if (!isEnter && !isArrowDown && !isArrowUp) return;
      e.preventDefault();

      const all = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisible);
      const idx = all.indexOf(target);
      if (idx === -1) return;

      const goPrev = e.shiftKey || isArrowUp;
      const nextIdx = goPrev
        ? (idx - 1 + all.length) % all.length
        : (idx + 1) % all.length;
      const next = all[nextIdx];
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "checkbox" && next.type !== "date") {
        try { next.select(); } catch { /* ignore */ }
      }
    };

    root.addEventListener("keydown", handler);
    return () => root.removeEventListener("keydown", handler);
  }, []);

  const toggleTxnType = (t: string) => {
    setForm((p) => {
      const cur = p.bankTransactionTypes ?? [];
      const isOn = cur.includes(t);
      const next = isOn ? cur.filter((x) => x !== t) : [...cur, t];
      return { ...p, bankTransactionTypes: next };
    });
    // When turning ON, immediately open the config sub-dialog
    if (!form.bankTransactionTypes.includes(t)) {
      setTimeout(() => setTxnDialog(t), 0);
    }
  };

  /* ════════════════════════════════════════════════════════════════════
   *  Build section nodes once, then split into LEFT / RIGHT columns
   * ════════════════════════════════════════════════════════════════════ */

  const basicSection = (
    <LedgerSection title="Basic Information">
      <LedgerFieldRow label="Name" required>
        <input
          ref={nameRef}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Rajesh Kumar"
          className={`tally-input ${errors.name ? "border-destructive" : ""}`}
        />
      </LedgerFieldRow>
      {conditional.showAliasField && (
        <LedgerFieldRow label="(alias)">
          <LedgerInput value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short name" />
        </LedgerFieldRow>
      )}
      {conditional.showLanguageAlias && (
        <LedgerFieldRow label="(alias in regional language)">
          <LedgerInput value={form.aliasRegional} onChange={(e) => set("aliasRegional", e.target.value)} placeholder="Regional alias" />
        </LedgerFieldRow>
      )}
      <LedgerFieldRow label="Under" required>
        <div className={errors.group ? "ring-1 ring-destructive rounded-md" : ""}>
          <LedgerAutocomplete
            value={form.group}
            onChange={setGroup}
            options={groups.length ? groups : Object.keys(GROUP_MAP)}
            placeholder="Type to filter group…"
            onCreate={onCreateGroup}
            createLabel="+ Create new group"
          />
        </div>
      </LedgerFieldRow>
      {has("INVAFFECT") && (
        <LedgerFieldRow label="Inventory values are affected?">
          <LedgerToggle value={form.inventoryAffected} onChange={(v) => set("inventoryAffected", v)} />
        </LedgerFieldRow>
      )}
      <LedgerFieldRow label="Inactive / Discontinued?">
        <LedgerToggle value={form.inactive} onChange={(v) => set("inactive", v)} />
      </LedgerFieldRow>
    </LedgerSection>
  );

  const billByBillSection = has("BILLBYBILL") && conditional.showBillWise && (
    <LedgerSection title="Bill-wise Details">
      <LedgerFieldRow label="Maintain balances bill-by-bill?">
        <LedgerToggle value={form.maintainBillWise} onChange={(v) => set("maintainBillWise", v)} />
      </LedgerFieldRow>
      {form.maintainBillWise && (
        <>
          <LedgerFieldRow label="Default Credit Period" indent={1}>
            <div className="flex items-center gap-2">
              <LedgerInput
                type="number"
                value={form.defaultCreditPeriod}
                onChange={(e) => set("defaultCreditPeriod", e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </LedgerFieldRow>
          {form.group === "Sundry Debtors" && (
            <LedgerFieldRow label="Check for credit days during voucher entry?" indent={2}>
              <LedgerToggle
                value={form.checkCreditDaysDuringEntry}
                onChange={(v) => set("checkCreditDaysDuringEntry", v)}
              />
            </LedgerFieldRow>
          )}
        </>
      )}
    </LedgerSection>
  );

  const typeOfLedgerSection = has("TYPEOFLEDGER") && (
    <LedgerSection title="Type of Ledger">
      <LedgerFieldRow label="Type of Ledger">
        <LedgerSelect
          value={form.typeOfLedger}
          onChange={(v) => set("typeOfLedger", v)}
          options={["Not Applicable", "Invoice Rounding", "Discount"] as const}
        />
      </LedgerFieldRow>
      {form.typeOfLedger === "Invoice Rounding" && (
        <>
          <LedgerFieldRow label="Rounding Method" indent={1}>
            <LedgerSelect
              value={form.roundingMethod}
              onChange={(v) => set("roundingMethod", v)}
              options={["Not Applicable", "Normal Rounding", "Downward Rounding", "Upward Rounding"] as const}
            />
          </LedgerFieldRow>
          {form.roundingMethod !== "Not Applicable" && (
            <LedgerFieldRow label="Rounding Limit" indent={2}>
              <LedgerInput
                value={form.roundingLimit}
                onChange={(e) => set("roundingLimit", e.target.value)}
                className="w-24"
              />
            </LedgerFieldRow>
          )}
        </>
      )}
    </LedgerSection>
  );

  const roundingSection = has("ROUNDING") && (
    <LedgerSection title="Rounding">
      <LedgerFieldRow label="Rounding Method">
        <LedgerSelect
          value={form.roundingMethod}
          onChange={(v) => set("roundingMethod", v)}
          options={["Not Applicable", "Normal Rounding", "Downward Rounding", "Upward Rounding"] as const}
        />
      </LedgerFieldRow>
      {form.roundingMethod !== "Not Applicable" && (
        <LedgerFieldRow label="Rounding Limit" indent={1}>
          <LedgerInput
            value={form.roundingLimit}
            onChange={(e) => set("roundingLimit", e.target.value)}
            className="w-24"
          />
        </LedgerFieldRow>
      )}
    </LedgerSection>
  );

  const dutyTaxSection = has("DUTYTAX") && (
    <LedgerSection title="Duty / Tax Details">
      <LedgerFieldRow label="Type of Duty/Tax">
        <LedgerSelect
          value={form.typeOfDutyTax}
          onChange={(v) => {
            set("typeOfDutyTax", v);
            set("dutyTaxType", DUTY_TAX_TYPE_OPTIONS[v][0]);
          }}
          options={["GST", "TCS", "TDS", "Others"] as const}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Tax Type" indent={1}>
        <LedgerSelect
          value={form.dutyTaxType}
          onChange={(v) => set("dutyTaxType", v)}
          options={DUTY_TAX_TYPE_OPTIONS[form.typeOfDutyTax]}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Percentage of Calculation" indent={1}>
        <div className="flex items-center gap-2">
          <LedgerInput value={form.dutyPercentage} onChange={(e) => set("dutyPercentage", e.target.value)} className="w-20" />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </LedgerFieldRow>
      <LedgerFieldRow label="Based on" indent={1}>
        <LedgerSelect
          value={form.dutyBasedOn}
          onChange={(v) => set("dutyBasedOn", v)}
          options={["On Total Sales", "On Current Subtotal", "On Item Rate", "On TDS/TCS Assessable Value"] as const}
        />
      </LedgerFieldRow>
      {/* Missing field: Method of Calculation — shown when GST is selected */}
      {form.typeOfDutyTax === "GST" && (
        <LedgerFieldRow label="Method of Calculation" indent={1}>
          <LedgerSelect
            value={form.methodOfCalculationDuty}
            onChange={(v) => set("methodOfCalculationDuty", v)}
            options={["On Total Sales", "On Net Sales", "On Assessable Value"] as const}
          />
        </LedgerFieldRow>
      )}
    </LedgerSection>
  );

  const behaviourOptionsSection = has("DUTYTAX") && (
    <LedgerSection title="Behaviour Options">
      <LedgerFieldRow label="Ledger Flushing Method">
        <LedgerSelect
          value={form.ledgerFlushingMethod}
          onChange={(v) => set("ledgerFlushingMethod", v)}
          options={["Default", "Cash Basis", "Accrual Basis"] as const}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Include in Buyer's Ledger?">
        <LedgerToggle value={form.includeInBuyerLedger} onChange={(v) => set("includeInBuyerLedger", v)} />
      </LedgerFieldRow>
      <LedgerFieldRow label="Include in Seller's Ledger?">
        <LedgerToggle value={form.includeInSellerLedger} onChange={(v) => set("includeInSellerLedger", v)} />
      </LedgerFieldRow>
    </LedgerSection>
  );

  const appropriationSection = has("APPROPRIATION") && (
    <LedgerSection title="Method of Appropriation">
      <LedgerFieldRow label="Purchase Invoice Allocation?">
        <LedgerToggle value={form.methodToAllocate} onChange={(v) => set("methodToAllocate", v)} />
      </LedgerFieldRow>
      {form.methodToAllocate && (
        <LedgerFieldRow label="Allocation Method" indent={1}>
          <LedgerSelect
            value={form.allocationMethod}
            onChange={(v) => set("allocationMethod", v)}
            options={["Appropriate by Value", "Appropriate by Quantity"] as const}
          />
        </LedgerFieldRow>
      )}
    </LedgerSection>
  );

  const addCostSection = has("ADDCOST") && (
    <LedgerSection title="Additional Cost">
      <LedgerFieldRow label="Additional Costs in Purchase?">
        <LedgerToggle value={form.useAsAdditionalCost} onChange={(v) => set("useAsAdditionalCost", v)} />
      </LedgerFieldRow>
    </LedgerSection>
  );

  const statutorySection = has("STATUTORY") && (
    <LedgerSection title="Statutory Details">
      <LedgerFieldRow label="Is GST Applicable?">
        <LedgerSelect
          value={form.isGstApplicable}
          onChange={(v) => set("isGstApplicable", v)}
          options={["As per Company", "As per Group", "Applicable", "Not Applicable", "Undefined"] as const}
        />
      </LedgerFieldRow>

      {(form.isGstApplicable === "Applicable") && (
        <>
          <LedgerFieldRow label="Set/Alter GST Details?" indent={1}>
            <LedgerToggle value={form.setAlterGst} onChange={(v) => set("setAlterGst", v)} />
          </LedgerFieldRow>

          {form.setAlterGst && (
            <>
              <LedgerFieldRow label="Description" indent={2}>
                <LedgerInput value={form.gstDescription} onChange={(e) => set("gstDescription", e.target.value)} placeholder="GST rate description" />
              </LedgerFieldRow>
              <LedgerFieldRow label="Applicable From" indent={2}>
                <LedgerInput type="date" value={form.gstApplicableFrom} onChange={(e) => set("gstApplicableFrom", e.target.value)} />
              </LedgerFieldRow>
              <LedgerFieldRow label="HSN/SAC Code" indent={2}>
                <LedgerInput value={form.gstHsnSacCode} onChange={(e) => set("gstHsnSacCode", e.target.value)} />
              </LedgerFieldRow>
              <LedgerFieldRow label="Type of Supply" indent={2}>
                <LedgerSelect
                  value={form.gstTypeOfSupply}
                  onChange={(v) => set("gstTypeOfSupply", v)}
                  options={["Goods", "Services"] as const}
                />
              </LedgerFieldRow>
              <LedgerFieldRow label="Taxability" indent={2}>
                <LedgerSelect
                  value={form.gstTaxability}
                  onChange={(v) => set("gstTaxability", v)}
                  options={["Taxable", "Exempt", "Nil Rated"] as const}
                />
              </LedgerFieldRow>
              {form.gstTaxability === "Taxable" && (
                <>
                  <LedgerFieldRow label="Integrated Tax (IGST)" indent={2}>
                    <div className="flex items-center gap-2">
                      <LedgerInput value={form.gstIgstRate} onChange={(e) => set("gstIgstRate", e.target.value)} className="w-20" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </LedgerFieldRow>
                  <LedgerFieldRow label="Central Tax (CGST)" indent={2}>
                    <div className="flex items-center gap-2">
                      <LedgerInput value={form.gstCgstRate} onChange={(e) => set("gstCgstRate", e.target.value)} className="w-20" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </LedgerFieldRow>
                  <LedgerFieldRow label="State Tax (SGST)" indent={2}>
                    <div className="flex items-center gap-2">
                      <LedgerInput value={form.gstSgstRate} onChange={(e) => set("gstSgstRate", e.target.value)} className="w-20" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </LedgerFieldRow>
                  <LedgerFieldRow label="Cess" indent={2}>
                    <div className="flex items-center gap-2">
                      <LedgerInput value={form.gstCessRate} onChange={(e) => set("gstCessRate", e.target.value)} className="w-20" />
                      <LedgerSelect
                        value={form.gstCessType}
                        onChange={(v) => set("gstCessType", v)}
                        options={["Valorem", "Quantum"] as const}
                      />
                    </div>
                  </LedgerFieldRow>
                  {form.gstCessType === "Quantum" && (
                    <>
                      <LedgerFieldRow label="Cess per Unit" indent={3}>
                        <LedgerInput
                          value={form.cessPerUnit}
                          onChange={(e) => set("cessPerUnit", e.target.value)}
                          placeholder="0.0000"
                          className="w-28"
                        />
                      </LedgerFieldRow>
                      <LedgerFieldRow label="Cess Unit" indent={3}>
                        <LedgerInput
                          value={form.cessUnit}
                          onChange={(e) => set("cessUnit", e.target.value)}
                          placeholder="e.g. Litre, Kg, Nos"
                          className="w-40"
                        />
                      </LedgerFieldRow>
                    </>
                  )}
                </>

              )}
              <LedgerFieldRow label="Reverse Charge Applicable?" indent={2}>
                <LedgerToggle value={form.gstReverseCharge} onChange={(v) => set("gstReverseCharge", v)} />
              </LedgerFieldRow>
            </>
          )}

          <LedgerFieldRow label="GST Assessable Calc ?" indent={1}>
            <LedgerToggle value={form.includeInAssessable} onChange={(v) => set("includeInAssessable", v)} />
          </LedgerFieldRow>
          {form.includeInAssessable && (
            <>
              <LedgerFieldRow label="Appropriate to" indent={2}>
                <LedgerSelect
                  value={form.appropriateTo}
                  onChange={(v) => set("appropriateTo", v)}
                  options={["Goods", "Services", "Both"] as const}
                />
              </LedgerFieldRow>
              <LedgerFieldRow label="Method of Calculation" indent={2}>
                <LedgerSelect
                  value={form.methodOfAppropriation}
                  onChange={(v) => set("methodOfAppropriation", v)}
                  options={["Based on Value", "Based on Quantity"] as const}
                />
              </LedgerFieldRow>
            </>
          )}

          <LedgerFieldRow label="GST Registration Status" indent={1}>
            <LedgerSelect
              value={form.gstStatus}
              onChange={(v) => set("gstStatus", v)}
              options={["Active", "Cancelled", "Suspended"] as const}
            />
          </LedgerFieldRow>
          {form.gstStatus === "Cancelled" && (
            <LedgerFieldRow label="Cancelled Date" indent={2}>
              <LedgerInput type="date" value={form.cancelledDate} onChange={(e) => set("cancelledDate", e.target.value)} />
            </LedgerFieldRow>
          )}
        </>
      )}

      {/* Bug fix: TDS/TCS Tax Type was showing for ALL STATUTORY groups.
          Tally shows this only for Sundry Debtors/Creditors (party ledgers). */}
      {parentInfo?.isSundryParty && (
        <>
          <LedgerFieldRow label="Tax Type (TDS/TCS)">
            <LedgerSelect
              value={form.taxType}
              onChange={(v) => set("taxType", v)}
              options={["None", "TDS", "TCS"] as const}
            />
          </LedgerFieldRow>
          {form.taxType === "TDS" && (
            <LedgerFieldRow label="Deductee Type" indent={1}>
              <LedgerSelect
                value={form.deducteeType}
                onChange={(v) => set("deducteeType", v)}
                options={["Individual", "HUF", "Firm", "Company", "Trust", "Government", "AOP"] as const}
              />
            </LedgerFieldRow>
          )}
          {form.taxType === "TCS" && (
            <LedgerFieldRow label="Buyer Type" indent={1}>
              <LedgerSelect
                value={form.buyerType}
                onChange={(v) => set("buyerType", v)}
                options={["Individual", "Company", "Government", "Exporter", "SEZ"] as const}
              />
            </LedgerFieldRow>
          )}
        </>
      )}

      {/* MSME (party ledgers) — gated by config: Provide MSME Registration Details */}
      {parentInfo?.isSundryParty && conditional.showMSME && (
        <>
          <LedgerFieldRow label="MSME Registered?">
            <LedgerToggle value={form.msmeRegistered} onChange={(v) => set("msmeRegistered", v)} />
          </LedgerFieldRow>
          {form.msmeRegistered && (
            <LedgerFieldRow label="Udyam Registration Number" indent={1}>
              <LedgerInput
                value={form.udyamNumber}
                onChange={(e) => set("udyamNumber", e.target.value.toUpperCase())}
                maxLength={19}
                placeholder="UDYAM-XX-00-0000000"
                className="font-mono uppercase"
              />
            </LedgerFieldRow>
          )}

          <LedgerFieldRow label="e-Invoice Applicable?">
            <LedgerToggle value={form.einvoiceApplicable} onChange={(v) => set("einvoiceApplicable", v)} />
          </LedgerFieldRow>
          {form.einvoiceApplicable && (
            <LedgerFieldRow label="Default Supply Type" indent={1}>
              <LedgerSelect
                value={form.defaultSupplyType}
                onChange={(v) => set("defaultSupplyType", v)}
                options={["B2B", "SEZ", "Export", "Deemed Export"] as const}
              />
            </LedgerFieldRow>
          )}

          <LedgerFieldRow label="e-Way Bill Applicable?">
            <LedgerToggle value={form.ewayBillApplicable} onChange={(v) => set("ewayBillApplicable", v)} />
          </LedgerFieldRow>
          {form.ewayBillApplicable && (
            <>
              <LedgerFieldRow label="Default Transport Mode" indent={1}>
                <LedgerSelect
                  value={form.defaultTransportMode}
                  onChange={(v) => set("defaultTransportMode", v)}
                  options={["Road", "Rail", "Air", "Ship"] as const}
                />
              </LedgerFieldRow>
              <LedgerFieldRow label="Default Distance (km)" indent={1}>
                <LedgerInput
                  type="number"
                  value={form.defaultDistance}
                  onChange={(e) => set("defaultDistance", e.target.value)}
                  placeholder="0.00"
                  className="w-32"
                />
              </LedgerFieldRow>
            </>
          )}

          {/* TDS/TCS e-filing */}
          {(form.taxType === "TDS" || form.taxType === "TCS") && (
            <LedgerFieldRow label="Include in TDS/TCS e-Filing Returns?">
              <LedgerToggle value={form.usedInTdsReturns} onChange={(v) => set("usedInTdsReturns", v)} />
            </LedgerFieldRow>
          )}
        </>
      )}
    </LedgerSection>
  );


  const hsnSection = (has("HSNSAC") || has("HSNSAC_NODESC") || has("HSNSAC_NOT")) && (
    <LedgerSection title="HSN / SAC Details">
      <LedgerFieldRow label="HSN/SAC Details">
        <LedgerSelect
          value={form.hsnSacDetailsMode}
          onChange={(v) => set("hsnSacDetailsMode", v)}
          options={["As per Company", "As per Stock Group", "Specify Details Here"] as const}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Source of Details">
        <LedgerSelect
          value={form.hsnSacSourceMode}
          onChange={(v) => set("hsnSacSourceMode", v)}
          options={["As per Company", "As per Stock Group", "As per Stock Item", "Specify Details Here"] as const}
        />
      </LedgerFieldRow>
      {(form.hsnSacDetailsMode === "Specify Details Here" ||
        form.hsnSacSourceMode === "Specify Details Here") && (
          <>
            <LedgerFieldRow label="HSN/SAC Code" indent={1}>
              <LedgerInput value={form.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />
            </LedgerFieldRow>
            {!has("HSNSAC_NODESC") && (
              <LedgerFieldRow label="Description" indent={1}>
                <LedgerInput value={form.hsnDescription} onChange={(e) => set("hsnDescription", e.target.value)} />
              </LedgerFieldRow>
            )}
          </>
        )}
      {has("HSNSAC_NOT") && (
        <>
          <LedgerFieldRow label="Nature of Transaction">
            <LedgerInput
              value={form.natureOfTransaction}
              onChange={(e) => set("natureOfTransaction", e.target.value)}
              placeholder="Tax classification"
            />
          </LedgerFieldRow>
        </>
      )}
    </LedgerSection>
  );

  const openingSection = conditional.showOpeningBalance && (
    <LedgerSection title="Opening Balance">
      {/* Bug fix: effectiveDate was hardcoded as TODAY label — now editable */}
      <LedgerFieldRow label="Effective Date">
        <LedgerInput
          type="date"
          value={form.effectiveDate}
          onChange={(e) => set("effectiveDate", e.target.value)}
          className="w-44"
        />
      </LedgerFieldRow>
      <LedgerFieldRow label={`Opening Balance ( as on ${form.effectiveDate} )`}>
        <LedgerAmountInput
          value={form.openingBalance}
          onChange={(v) => set("openingBalance", v)}
          drCr={form.drCr}
          onDrCrChange={(v) => set("drCr", v)}
          placeholder="0.00"
          className="min-w-[120px]" // Add this line
        />
      </LedgerFieldRow>
      {/* Missing field: Freeze Opening Balance toggle */}
      <LedgerFieldRow label="Freeze Opening Balance?">
        <LedgerToggle value={form.freezeBalance} onChange={(v) => set("freezeBalance", v)} />
      </LedgerFieldRow>

      {form.maintainBillWise && parseFloat(form.openingBalance || "0") > 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border bg-secondary/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bill-wise breakup
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Ref. No.</th>
                <th className="py-1 font-medium">Due Date</th>
                <th className="py-1 font-medium text-right">Amount</th>
                <th className="py-1 font-medium">Dr/Cr</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-2"><LedgerInput placeholder="OPN-001" /></td>
                <td className="py-1 pr-2"><LedgerInput type="date" /></td>
                <td className="py-1 pr-2">
                  <LedgerInput className="text-right font-mono" defaultValue={form.openingBalance} />
                </td>
                <td className="py-1">
                  <LedgerSelect value={form.drCr} onChange={(v) => set("drCr", v)} options={["Dr", "Cr"] as const} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </LedgerSection>
  );

  /* ── RIGHT column: mailing / banking / tax registration ── */

  const mailingSection = has("MAILING") && conditional.showMailingDetails && (
    <LedgerSection title="Mailing Details">
      <LedgerFieldRow label="Name">
        <LedgerInput
          value={form.mailingName || form.name}
          onChange={(e) => set("mailingName", e.target.value)}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Address">
        <div className="flex flex-col gap-1">
          <LedgerInput value={form.addr1} onChange={(e) => set("addr1", e.target.value)} placeholder="Line 1" />
          <LedgerInput value={form.addr2} onChange={(e) => set("addr2", e.target.value)} placeholder="Line 2" />
          <LedgerInput value={form.addr3} onChange={(e) => set("addr3", e.target.value)} placeholder="Line 3" />
          <LedgerInput value={form.addr4} onChange={(e) => set("addr4", e.target.value)} placeholder="Line 4" />
        </div>
      </LedgerFieldRow>
      <LedgerFieldRow label="Country">
        <LedgerAutocomplete value={form.country} onChange={(v) => set("country", v)} options={COUNTRY_OPTIONS} />
      </LedgerFieldRow>
      <LedgerFieldRow label="State">
        <LedgerAutocomplete value={form.state} onChange={(v) => set("state", v)} options={STATE_OPTIONS} />
      </LedgerFieldRow>
      <LedgerFieldRow label="Pincode">
        <LedgerInput
          value={form.pincode}
          onChange={(e) => set("pincode", e.target.value)}
          maxLength={6}
          className="w-32"
        />
      </LedgerFieldRow>
      {/* Missing fields: city + district were in form shape but never rendered */}
      <LedgerFieldRow label="City">
        <LedgerInput value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Chennai" />
      </LedgerFieldRow>
      <LedgerFieldRow label="District">
        <LedgerInput value={form.district} onChange={(e) => set("district", e.target.value)} placeholder="e.g. Dindigul" />
      </LedgerFieldRow>

      <LedgerFieldRow label="Provide Contact Details?">
        <LedgerToggle value={form.provideContactDetails} onChange={(v) => set("provideContactDetails", v)} />
      </LedgerFieldRow>
      {form.provideContactDetails && conditional.showContactDetails && (
        <>
          <LedgerFieldRow label="Contact Person" indent={1}>
            <LedgerInput value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
          </LedgerFieldRow>
          <LedgerFieldRow label="Telephone No." indent={1}>
            <LedgerInput value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
          </LedgerFieldRow>
          <LedgerFieldRow label="Mobile No." indent={1}>
            <LedgerInput value={form.mobile} onChange={(e) => set("mobile", e.target.value)} maxLength={15} />
          </LedgerFieldRow>
          <LedgerFieldRow label="E-Mail" indent={1}>
            <LedgerInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </LedgerFieldRow>
          <LedgerFieldRow label="Website" indent={1}>
            <LedgerInput value={form.website} onChange={(e) => set("website", e.target.value)} />
          </LedgerFieldRow>
        </>
      )}
    </LedgerSection>
  );

  const mailingShortSection = has("MAILING_SHORT") && !has("MAILING") && conditional.showMailingDetails && (
    <LedgerSection title="Mailing Details">
      <LedgerFieldRow label="Name">
        <LedgerInput
          value={form.mailingName || form.name}
          onChange={(e) => set("mailingName", e.target.value)}
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="Address">
        <div className="flex flex-col gap-1">
          <LedgerInput value={form.addr1} onChange={(e) => set("addr1", e.target.value)} placeholder="Line 1" />
          <LedgerInput value={form.addr2} onChange={(e) => set("addr2", e.target.value)} placeholder="Line 2" />
          <LedgerInput value={form.addr3} onChange={(e) => set("addr3", e.target.value)} placeholder="Line 3" />
          <LedgerInput value={form.addr4} onChange={(e) => set("addr4", e.target.value)} placeholder="Line 4" />
        </div>
      </LedgerFieldRow>
      <LedgerFieldRow label="Primary Mobile No.">
        <LedgerInput value={form.primaryMobile} onChange={(e) => set("primaryMobile", e.target.value)} maxLength={15} />
      </LedgerFieldRow>
    </LedgerSection>
  );

  const bankingSection = has("BANKING") && conditional.showPartyBankDetails && (
    <LedgerSection title="Banking Details">
      <LedgerFieldRow label="Provide bank details?">
        <LedgerToggle value={form.provideBankDetails} onChange={(v) => set("provideBankDetails", v)} />
      </LedgerFieldRow>

      {form.provideBankDetails && (
        <>
          <LedgerFieldRow label="Account Holder's Name" indent={1}>
            <LedgerInput
              value={form.accountHolderName || form.name}
              onChange={(e) => set("accountHolderName", e.target.value)}
            />
          </LedgerFieldRow>
          <LedgerFieldRow label="Account Number" indent={1}>
            <LedgerInput value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
          </LedgerFieldRow>
          <LedgerFieldRow label="IFSC Code" indent={1}>
            <LedgerInput
              value={form.ifsc}
              onChange={(e) => set("ifsc", e.target.value.toUpperCase())}
              maxLength={11}
              className="font-mono uppercase"
            />
          </LedgerFieldRow>
          <LedgerFieldRow label="SWIFT Code" indent={1}>
            <LedgerInput value={form.swift} onChange={(e) => set("swift", e.target.value.toUpperCase())} className="font-mono uppercase" />
          </LedgerFieldRow>
          <LedgerFieldRow label="Bank Name" indent={1}>
            <LedgerAutocomplete value={form.bankName} onChange={(v) => set("bankName", v)} options={BANK_OPTIONS} />
          </LedgerFieldRow>
          <LedgerFieldRow label="Branch" indent={1}>
            <LedgerInput value={form.branch} onChange={(e) => set("branch", e.target.value)} />
          </LedgerFieldRow>
          <LedgerFieldRow label="Account Type" indent={1}>
            <LedgerSelect value={form.accountType} onChange={(v) => set("accountType", v)} options={ACCOUNT_TYPES} />
          </LedgerFieldRow>

          <LedgerFieldRow label="Transaction Types" indent={1}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              {TXN_TYPES.map((t) => {
                const checked = form.bankTransactionTypes.includes(t);
                const hasCfg = !!form.txnConfigs[t] && Object.keys(form.txnConfigs[t]).length > 0;
                return (
                  <div key={t} className="flex items-center justify-between gap-2 py-0.5">
                    <label className="flex items-center gap-2 text-xs cursor-pointer min-w-0">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTxnType(t)}
                      />
                      <span className="truncate">{t}</span>
                      {hasCfg && <span className="rounded bg-primary/10 text-primary text-[9px] px-1">cfg</span>}
                    </label>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => setTxnDialog(t)}
                        className="text-muted-foreground hover:text-primary"
                        title="Configure transaction type"
                      >
                        <Settings className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </LedgerFieldRow>
        </>
      )}
    </LedgerSection>
  );

  const bankConfigSection = has("BANKCONFIG") && conditional.showBankAccountDetails && (
    <>
      <LedgerSection title="Bank Account Details">
        <LedgerFieldRow label="Account Holder's Name" required>
          <LedgerInput
            value={form.accountHolderName || form.name}
            onChange={(e) => set("accountHolderName", e.target.value)}
          />
        </LedgerFieldRow>
        <LedgerFieldRow label="Account Number" required>
          <LedgerInput value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
        </LedgerFieldRow>
        <LedgerFieldRow label="IFSC Code" required>
          <LedgerInput
            value={form.ifsc}
            onChange={(e) => set("ifsc", e.target.value.toUpperCase())}
            maxLength={11}
            className="font-mono uppercase"
          />
        </LedgerFieldRow>
        <LedgerFieldRow label="SWIFT Code">
          <LedgerInput value={form.swift} onChange={(e) => set("swift", e.target.value.toUpperCase())} className="font-mono uppercase" />
        </LedgerFieldRow>
        <LedgerFieldRow label="Bank Name" required>
          <LedgerAutocomplete value={form.bankName} onChange={(v) => set("bankName", v)} options={BANK_OPTIONS} />
        </LedgerFieldRow>
        <LedgerFieldRow label="Branch">
          <LedgerInput value={form.branch} onChange={(e) => set("branch", e.target.value)} />
        </LedgerFieldRow>
        <LedgerFieldRow label="Account Type">
          <LedgerSelect value={form.accountType} onChange={(v) => set("accountType", v)} options={ACCOUNT_TYPES} />
        </LedgerFieldRow>
      </LedgerSection>

      <LedgerSection title="Bank Configuration">
        <LedgerFieldRow label="Effective Date for Reconciliation">
          <LedgerInput
            type="date"
            value={form.effectiveDateForReconciliation}
            onChange={(e) => set("effectiveDateForReconciliation", e.target.value)}
          />
        </LedgerFieldRow>
        <LedgerFieldRow label="Set/Alter range for Cheque Books?">
          <LedgerToggle value={form.setAlterChequeBooks} onChange={(v) => set("setAlterChequeBooks", v)} />
        </LedgerFieldRow>
        {form.setAlterChequeBooks && (
          <>
            <LedgerFieldRow label="Cheque Book Name" indent={1}>
              <LedgerInput value={form.chequeBookName} onChange={(e) => set("chequeBookName", e.target.value)} />
            </LedgerFieldRow>
            <LedgerFieldRow label="From No." indent={1}>
              <LedgerInput value={form.chequeFrom} onChange={(e) => set("chequeFrom", e.target.value)} className="w-32" />
            </LedgerFieldRow>
            <LedgerFieldRow label="To No." indent={1}>
              <LedgerInput value={form.chequeTo} onChange={(e) => set("chequeTo", e.target.value)} className="w-32" />
            </LedgerFieldRow>
            <LedgerFieldRow label="Cheque Number Length" indent={1}>
              <LedgerInput value={form.chequeNumberLength} onChange={(e) => set("chequeNumberLength", e.target.value)} className="w-24" />
            </LedgerFieldRow>
          </>
        )}
        <LedgerFieldRow label="Enable Cheque Printing?">
          <LedgerToggle value={form.enableChequePrinting} onChange={(v) => set("enableChequePrinting", v)} />
        </LedgerFieldRow>
        {form.enableChequePrinting && (
          <>
            <LedgerFieldRow label="Select Bank Name" indent={1}>
              <LedgerAutocomplete value={form.chequePrintBank} onChange={(v) => set("chequePrintBank", v)} options={BANK_OPTIONS} />
            </LedgerFieldRow>
            <LedgerFieldRow label="Name to Print on Cheque" indent={1}>
              <LedgerInput
                value={form.chequePrintName}
                onChange={(e) => set("chequePrintName", e.target.value)}
                placeholder="Payee name as it appears on cheque"
              />
            </LedgerFieldRow>
            <LedgerFieldRow label="Cheque Width (mm)" indent={1}>
              <LedgerInput
                value={form.chequeWidth}
                onChange={(e) => set("chequeWidth", e.target.value)}
                placeholder="e.g. 210"
                className="w-28"
              />
            </LedgerFieldRow>
            <LedgerFieldRow label="Cheque Height (mm)" indent={1}>
              <LedgerInput
                value={form.chequeHeight}
                onChange={(e) => set("chequeHeight", e.target.value)}
                placeholder="e.g. 99"
                className="w-28"
              />
            </LedgerFieldRow>
          </>
        )}
      </LedgerSection>
    </>
  );

  const taxRegSection = has("TAXREG") && conditional.showGSTRegistration && (
    <LedgerSection title="Tax Registration Details">
      <LedgerFieldRow label="Registration Type">
        <LedgerSelect value={form.registrationType} onChange={(v) => set("registrationType", v)} options={REG_TYPES} />
      </LedgerFieldRow>
      {conditional.showAssesseeOtherTerritory && (
        <LedgerFieldRow label="Assessee of Other Territory?">
          <LedgerToggle value={form.assesseeOtherTerritory} onChange={(v) => set("assesseeOtherTerritory", v)} />
        </LedgerFieldRow>
      )}
      {form.assesseeOtherTerritory && conditional.showAssesseeOtherTerritory && (
        <LedgerFieldRow label="Territory" indent={1}>
          <LedgerAutocomplete value={form.territory} onChange={(v) => set("territory", v)} options={STATE_OPTIONS} />
        </LedgerFieldRow>
      )}
      <LedgerFieldRow label="GSTIN/UIN">
        <LedgerInput
          value={form.gstin}
          onChange={(e) => set("gstin", e.target.value.toUpperCase())}
          maxLength={15}
          className="font-mono uppercase"
        />
      </LedgerFieldRow>
      <LedgerFieldRow label="PAN/IT No.">
        <LedgerInput
          value={form.panIt}
          onChange={(e) => set("panIt", e.target.value.toUpperCase())}
          maxLength={10}
          className="font-mono uppercase"
        />
      </LedgerFieldRow>

      {form.registrationType === "Tax Deductor" && (
        <>
          <LedgerFieldRow label="TAN Number" indent={1}>
            <LedgerInput
              value={form.tanNumber}
              onChange={(e) => set("tanNumber", e.target.value.toUpperCase())}
              maxLength={10}
              className="font-mono uppercase w-40"
              placeholder="ABCD12345E"
            />
          </LedgerFieldRow>
          <LedgerFieldRow label="Deductor Category" indent={1}>
            <LedgerInput
              value={form.deductorCategory}
              onChange={(e) => set("deductorCategory", e.target.value)}
              placeholder="e.g. Company, Govt., Individual"
            />
          </LedgerFieldRow>
        </>
      )}
      {form.registrationType === "Tax Collector (E-Commerce)" && (
        <LedgerFieldRow label="Tax Collection Account No." indent={1}>
          <LedgerInput
            value={form.collectionAccountNo}
            onChange={(e) => set("collectionAccountNo", e.target.value.toUpperCase())}
            maxLength={20}
            className="font-mono uppercase"
          />
        </LedgerFieldRow>
      )}
    </LedgerSection>
  );


  const taxRegShortSection = has("TAXREG_SHORT") && !has("TAXREG") && conditional.showGSTRegistration && (
    <LedgerSection title="Tax Registration Details">
      <LedgerFieldRow label="PAN/IT No.">
        <LedgerInput
          value={form.panIt}
          onChange={(e) => set("panIt", e.target.value.toUpperCase())}
          maxLength={10}
          className="font-mono uppercase"
        />
      </LedgerFieldRow>
    </LedgerSection>
  );

  /* ════════════════════════════════════════════════════════════════════
   *  COLUMN ASSIGNMENT — auto-balanced
   *  LEFT  : identity, accounting, statutory, opening balance
   *  RIGHT : mailing, banking, tax registration
   * ════════════════════════════════════════════════════════════════════ */

  const leftColumn = [
    basicSection,
    billByBillSection,
    typeOfLedgerSection,
    roundingSection,
    dutyTaxSection,
    behaviourOptionsSection,
    appropriationSection,
    addCostSection,
    has("STATUTORY") && conditional.showGSTDetails ? statutorySection : false,
    (has("HSNSAC") || has("HSNSAC_NODESC") || has("HSNSAC_NOT")) && conditional.showHSNSAC ? hsnSection : false,
    conditional.showCostCentres ? (
      <LedgerSection key="cost-centres" title="Cost Centres">
        <LedgerFieldRow label="Maintain Cost Centres?">
          <LedgerToggle value={form.maintainCostCenters} onChange={(v) => set("maintainCostCenters", v)} />
        </LedgerFieldRow>
        {form.maintainCostCenters && (
          <LedgerFieldRow label="Allocate Cost Centre ?" indent={1}>
            <LedgerToggle value={form.costCentreAllocation} onChange={(v) => set("costCentreAllocation", v)} />
          </LedgerFieldRow>
        )}
      </LedgerSection>
    ) : false,
  ].filter(Boolean);

  const rightColumn = [
    mailingSection,
    mailingShortSection,
    bankingSection,
    bankConfigSection,
    taxRegSection,
    taxRegShortSection,
  ].filter(Boolean);

  /* ════════════════════════════════════════════════════════════════════ */

  return (
    <div ref={formRef} className="text-foreground animate-slide-up font-['Segoe_UI',_'Inter',_system-ui,_sans-serif] tracking-tight text-[13px] leading-relaxed">
      {/* ─── Sticky toolbar ─── */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Settings className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold tracking-tight truncate">
            Ledger Creation {initial?.name ? "— Alter" : ""}
          </h2>
          {form.group && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground truncate">
              {form.group}
            </span>
          )}
          {/* Config-active indicator: shows when config gates are hiding fields */}
          {(() => {
            const hidden = [
              !conditional.showAliasField,
              !conditional.showBillWise,
              !conditional.showMailingDetails,
              !conditional.showGSTDetails,
              !conditional.showHSNSAC,
              !conditional.showBankAccountDetails,
              !conditional.showGSTRegistration,
              !conditional.showMSME,
              !conditional.showOpeningBalance,
            ].filter(Boolean).length;
            return hidden > 0 ? (
              <button
                type="button"
                onClick={() => onOpenConfig?.()}
                title="F12 — Open Configuration"
                className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
              >
                <Settings className="h-2.5 w-2.5" />
                {hidden} field{hidden > 1 ? "s" : ""} hidden by Config
              </button>
            ) : null;
          })()}
        </div>
      </div>

      {/* ── Group not picked yet: hint banner ── */}
      {!form.group && (
        <div className="mb-3 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Pick an <span className="font-semibold text-primary">Under Group</span> to load the
          group-specific field-set. Layout will split into two columns automatically.
        </div>
      )}

      {/* ── Two-column split layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-0">
        <div className="min-w-0">
          {leftColumn.map((node, i) => (
            <div key={`left-${i}`}>{node}</div>
          ))}
        </div>
        <div className="min-w-0 xl:border-l xl:border-border/60 xl:pl-6">
          {rightColumn.length === 0 && form.group ? (
            <div className="text-xs text-muted-foreground italic pt-4">
              No mailing / banking / tax fields apply to this group.
            </div>
          ) : (
            rightColumn.map((node, i) => (
              <div key={`right-${i}`}>{node}</div>
            ))
          )}
        </div>
      </div>

      {/* ── Opening Balance — always anchored at the very bottom, full width ── */}
      {form.group && (
        <div className="mt-4 border-t-2 border-primary/30 pt-3">
          {openingSection}
        </div>
      )}

      {/* ─── Footer ─── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-[11px] text-muted-foreground space-x-1">
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Enter</kbd> next ·
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Shift+Enter</kbd> prev ·
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">F12</kbd> config ·
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Ctrl+A</kbd> accept ·
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Ctrl+S</kbd> save ·
          <kbd className="rounded bg-secondary px-1 py-0.5 font-mono">Esc</kbd> close
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button size="sm" onClick={handleSave} className="h-8 gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" /> Accept
          </Button>
        </div>
      </div>

      {/* ─── Banking transaction sub-dialog ─── */}
      {txnDialog && (
        <TransactionConfigDialog
          type={txnDialog}
          initial={form.txnConfigs[txnDialog] ?? {}}
          onClose={() => setTxnDialog(null)}
          onSave={(cfg) =>
            setForm((p) => ({
              ...p,
              txnConfigs: { ...p.txnConfigs, [txnDialog]: cfg },
            }))
          }
        />
      )}
    </div>
  );
}

export default AdvancedLedgerFormPanel;