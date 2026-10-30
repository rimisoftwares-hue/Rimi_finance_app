// // ConfigDialog.tsx
// import React, { useState, useCallback, useEffect } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogDescription,
// } from "../ui/dialog";
// import { Button } from "../ui/button";
// import { Switch } from "../ui/switch";
// import { Label } from "../ui/label";
// import { Badge } from "../ui/badge";
// import { toast } from "sonner";
// import { motion, AnimatePresence } from "framer-motion";
// import {
//   Settings,
//   ChevronDown,
//   ChevronRight,
//   RotateCcw,
//   BookOpen,
//   Users,
//   Landmark,
//   FileCheck,
//   Receipt,
//   EyeOff,
// } from "lucide-react";

// // ────────────────────────────────────────────────────────────
// // Types & Default Configuration
// // ────────────────────────────────────────────────────────────
// export interface ConfigState {
//   generalDetails: {
//     provideAliasesForName: boolean;
//     provideLanguageAliasesForName: boolean;
//     maintainBalancesBillByBill: boolean;
//     forNonTradingAccountsAlso: boolean;
//     useInventoryAllocationsForLedgers: boolean;
//     allocateAdditionalCosts: boolean;
//     provideOpeningBalances: boolean;
//     provideMSMERegistrationDetails: boolean;
//   };
//   partyDetails: {
//     provideMailingDetails: boolean;
//     incomeExpenseAccountsAlso: boolean;
//     provideContactDetails: boolean;
//     provideMultipleMobileNos: boolean;
//     defaultWhatsAppNo: boolean;
//     provideBankDetails: boolean;
//   };
//   bankDetails: {
//     provideBankAccountDetails: boolean;
//     bankReconciliationAndEPayments: boolean;
//     chequeBookAndPrinting: boolean;
//   };
//   partyTaxRegistrationDetails: {
//     gstRegistrationDetails: boolean;
//     assesseeOfOtherTerritory: boolean;
//     ledgerAsCommonParty: boolean;
//     ignorePrefixSuffixInDocNo: boolean;
//   };
//   gstDetails: {
//     provideGSTDetails: boolean;
//     forNonRevenueAccountsAlso: boolean;
//     provideHSNSACDetails: boolean;
//     provideHSNSACDescription: boolean;
//     selectNatureOfTransaction: boolean;
//     provideBreakupOfTaxRate: boolean;
//     provideCessRateDetails: boolean;
//     enableReverseChargeCalculation: boolean;
//     eligibleForInputTaxCredit: boolean;
//     selectTypeOfSupply: boolean;
//   };
// }

// export const DEFAULT_CONFIG: ConfigState = {
//   generalDetails: {
//     provideAliasesForName: true,
//     provideLanguageAliasesForName: false,
//     maintainBalancesBillByBill: true,
//     forNonTradingAccountsAlso: false,
//     useInventoryAllocationsForLedgers: false,
//     allocateAdditionalCosts: false,
//     provideOpeningBalances: true,
//     provideMSMERegistrationDetails: false,
//   },
//   partyDetails: {
//     provideMailingDetails: true,
//     incomeExpenseAccountsAlso: false,
//     provideContactDetails: false,
//     provideMultipleMobileNos: false,
//     defaultWhatsAppNo: false,
//     provideBankDetails: false,
//   },
//   bankDetails: {
//     provideBankAccountDetails: true,
//     bankReconciliationAndEPayments: true,
//     chequeBookAndPrinting: true,
//   },
//   partyTaxRegistrationDetails: {
//     gstRegistrationDetails: true,
//     assesseeOfOtherTerritory: false,
//     ledgerAsCommonParty: false,
//     ignorePrefixSuffixInDocNo: false,
//   },
//   gstDetails: {
//     provideGSTDetails: true,
//     forNonRevenueAccountsAlso: false,
//     provideHSNSACDetails: true,
//     provideHSNSACDescription: true,
//     selectNatureOfTransaction: false,
//     provideBreakupOfTaxRate: false,
//     provideCessRateDetails: false,
//     enableReverseChargeCalculation: false,
//     eligibleForInputTaxCredit: false,
//     selectTypeOfSupply: true,
//   },
// };

// // ────────────────────────────────────────────────────────────
// // Context
// // ────────────────────────────────────────────────────────────
// const ConfigContext = React.createContext<{
//   config: ConfigState;
//   updateConfig: <K1 extends keyof ConfigState, K2 extends keyof ConfigState[K1]>(
//     section: K1,
//     key: K2,
//     value: boolean
//   ) => void;
// } | null>(null);

// export function useConfig() {
//   const ctx = React.useContext(ConfigContext);
//   if (!ctx) throw new Error("useConfig must be used within ConfigProvider");
//   return ctx;
// }

// export function ConfigProvider({ children }: { children: React.ReactNode }) {
//   const [config, setConfig] = useState<ConfigState>(() => {
//     try {
//       const saved = localStorage.getItem("ledger:config");
//       return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
//     } catch {
//       return DEFAULT_CONFIG;
//     }
//   });

//   const updateConfig = useCallback(
//     <K1 extends keyof ConfigState, K2 extends keyof ConfigState[K1]>(
//       section: K1,
//       key: K2,
//       value: boolean
//     ) => {
//       setConfig((prev) => {
//         let newConfig = {
//           ...prev,
//           [section]: { ...prev[section], [key]: value },
//         };

//         // Tally Prime style dependency management
//         if (section === "partyDetails") {
//           if (key === "provideMailingDetails" && value === false) {
//             newConfig = {
//               ...newConfig,
//               partyDetails: {
//                 ...newConfig.partyDetails,
//                 provideContactDetails: false,
//                 provideMultipleMobileNos: false,
//                 defaultWhatsAppNo: false,
//                 provideBankDetails: false,
//               },
//             };
//           }
//           if (key === "provideContactDetails" && value === false) {
//             newConfig = {
//               ...newConfig,
//               partyDetails: {
//                 ...newConfig.partyDetails,
//                 provideMultipleMobileNos: false,
//                 defaultWhatsAppNo: false,
//               },
//             };
//           }
//         }

//         if (section === "gstDetails") {
//           if (key === "provideGSTDetails" && value === false) {
//             newConfig = {
//               ...newConfig,
//               gstDetails: {
//                 ...newConfig.gstDetails,
//                 forNonRevenueAccountsAlso: false,
//                 provideHSNSACDetails: false,
//                 selectNatureOfTransaction: false,
//                 provideBreakupOfTaxRate: false,
//                 provideCessRateDetails: false,
//                 enableReverseChargeCalculation: false,
//                 eligibleForInputTaxCredit: false,
//                 selectTypeOfSupply: false,
//               },
//             };
//           }
//           if (key === "provideHSNSACDetails" && value === false) {
//             newConfig = {
//               ...newConfig,
//               gstDetails: {
//                 ...newConfig.gstDetails,
//                 provideHSNSACDescription: false,
//               },
//             };
//           }
//           if (key === "provideBreakupOfTaxRate" && value === false) {
//             newConfig = {
//               ...newConfig,
//               gstDetails: {
//                 ...newConfig.gstDetails,
//                 provideCessRateDetails: false,
//               },
//             };
//           }
//         }

//         localStorage.setItem("ledger:config", JSON.stringify(newConfig));
//         return newConfig;
//       });
//     },
//     []
//   );

//   return (
//     <ConfigContext.Provider value={{ config, updateConfig }}>
//       {children}
//     </ConfigContext.Provider>
//   );
// }

// // ────────────────────────────────────────────────────────────
// // Section metadata
// // ────────────────────────────────────────────────────────────
// const SECTION_META = {
//   generalDetails: {
//     label: "General Details",
//     icon: BookOpen,
//     color: "text-primary",
//     bg: "bg-primary/10",
//   },
//   partyDetails: {
//     label: "Party Details",
//     icon: Users,
//     color: "text-income",
//     bg: "bg-income/10",
//   },
//   bankDetails: {
//     label: "Bank Details",
//     icon: Landmark,
//     color: "text-pending",
//     bg: "bg-pending/10",
//   },
//   partyTaxRegistrationDetails: {
//     label: "Party Tax Registration",
//     icon: FileCheck,
//     color: "text-expense",
//     bg: "bg-expense/10",
//   },
//   gstDetails: {
//     label: "GST Details",
//     icon: Receipt,
//     color: "text-primary",
//     bg: "bg-primary/10",
//   },
// } as const;

// // ────────────────────────────────────────────────────────────
// // ConfigDialog — Hierarchical design matching LedgerGroups F12
// // ────────────────────────────────────────────────────────────
// interface ConfigDialogProps {
//   open: boolean;
//   onClose: () => void;
// }

// // ────────────────────────────────────────────────────────────
// // Column layout: LEFT = General + Party, RIGHT = Bank + TaxReg + GST
// // ────────────────────────────────────────────────────────────
// const LEFT_SECTIONS: (keyof typeof SECTION_META)[] = ["generalDetails", "partyDetails"];
// const RIGHT_SECTIONS: (keyof typeof SECTION_META)[] = ["bankDetails", "partyTaxRegistrationDetails", "gstDetails"];

// export function ConfigDialog({ open, onClose }: ConfigDialogProps) {
//   const { config, updateConfig } = useConfig();
//   const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
//     generalDetails: true,
//     partyDetails: true,
//     bankDetails: true,
//     partyTaxRegistrationDetails: true,
//     gstDetails: true,
//   });

//   const toggleSection = (section: string) =>
//     setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

//   const countEnabled = (section: keyof ConfigState) =>
//     Object.values(config[section]).filter(Boolean).length;
//   const countTotal = (section: keyof ConfigState) =>
//     Object.values(config[section]).length;

//   const handleReset = () => {
//     (Object.keys(DEFAULT_CONFIG) as (keyof ConfigState)[]).forEach((section) => {
//       (Object.keys(DEFAULT_CONFIG[section]) as (keyof ConfigState[typeof section])[]).forEach((key) => {
//         updateConfig(section, key, DEFAULT_CONFIG[section][key] as boolean);
//       });
//     });
//     toast.success("Configuration reset to defaults");
//   };

//   const isPartyFieldEnabled = (field: string): boolean => {
//     switch (field) {
//       case "incomeExpenseAccountsAlso": return true;
//       case "provideContactDetails": return config.partyDetails.provideMailingDetails;
//       case "provideMultipleMobileNos":
//       case "defaultWhatsAppNo":
//         return config.partyDetails.provideMailingDetails && config.partyDetails.provideContactDetails;
//       case "provideBankDetails": return config.partyDetails.provideMailingDetails;
//       default: return true;
//     }
//   };

//   const isGSTFieldEnabled = (field: string): boolean => {
//     switch (field) {
//       case "provideHSNSACDetails":
//       case "selectNatureOfTransaction":
//       case "provideBreakupOfTaxRate":
//       case "enableReverseChargeCalculation":
//       case "eligibleForInputTaxCredit":
//       case "selectTypeOfSupply":
//       case "forNonRevenueAccountsAlso":
//         return config.gstDetails.provideGSTDetails;
//       case "provideHSNSACDescription":
//         return config.gstDetails.provideGSTDetails && config.gstDetails.provideHSNSACDetails;
//       case "provideCessRateDetails":
//         return config.gstDetails.provideGSTDetails && config.gstDetails.provideBreakupOfTaxRate;
//       default: return true;
//     }
//   };

//   const getDependencyText = (section: string, field: string): string => {
//     if (section === "partyDetails") {
//       if (field === "provideContactDetails") return "Requires: Provide Mailing Details";
//       if (field === "provideMultipleMobileNos" || field === "defaultWhatsAppNo")
//         return "Requires: Mailing Details + Contact Details";
//       if (field === "provideBankDetails") return "Requires: Provide Mailing Details";
//     }
//     if (section === "gstDetails") {
//       if (["provideHSNSACDetails", "selectNatureOfTransaction", "provideBreakupOfTaxRate", "selectTypeOfSupply", "forNonRevenueAccountsAlso"].includes(field))
//         return "Requires: Provide GST Details";
//       if (field === "provideHSNSACDescription") return "Requires: Provide HSN/SAC Details";
//       if (field === "provideCessRateDetails") return "Requires: Provide Breakup of Tax Rate";
//     }
//     return "";
//   };

//   // Shared renderer for a single section panel
//   const renderSection = (sectionKey: keyof typeof SECTION_META) => {
//     const meta = SECTION_META[sectionKey];
//     const Icon = meta.icon;
//     const enabled = countEnabled(sectionKey as keyof ConfigState);
//     const total = countTotal(sectionKey as keyof ConfigState);
//     const isOpen = expandedSections[sectionKey];
//     const sectionConfig = config[sectionKey as keyof ConfigState];

//     return (
//       <div key={sectionKey} className="rounded-md border border-border/60 overflow-hidden">
//         {/* Section header */}
//         <button
//           onClick={() => toggleSection(sectionKey)}
//           className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors"
//         >
//           <div className="flex items-center gap-2.5">
//             <div className={`p-1 rounded ${meta.bg}`}>
//               <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
//             </div>
//             <span className="text-sm font-medium text-foreground">{meta.label}</span>
//             <Badge variant="secondary" className="text-[10px] tabular-nums">
//               {enabled}/{total}
//             </Badge>
//           </div>
//           <div className="flex items-center gap-2">
//             {!isOpen && enabled < total && (
//               <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
//                 <EyeOff className="h-3 w-3" />
//                 {total - enabled} hidden
//               </span>
//             )}
//             {isOpen
//               ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
//               : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
//           </div>
//         </button>

//         {/* Animated body */}
//         <AnimatePresence initial={false}>
//           {isOpen && (
//             <motion.div
//               key="body"
//               initial={{ height: 0, opacity: 0 }}
//               animate={{ height: "auto", opacity: 1 }}
//               exit={{ height: 0, opacity: 0 }}
//               transition={{ duration: 0.2, ease: "easeInOut" }}
//               className="overflow-hidden border-t border-border/40"
//             >
//               <div className="divide-y divide-border/20">
//                 {(Object.keys(sectionConfig) as (keyof typeof sectionConfig)[]).map((key) => {
//                   const value = sectionConfig[key] as boolean;
//                   const isEnabled =
//                     sectionKey === "partyDetails"
//                       ? isPartyFieldEnabled(String(key))
//                       : sectionKey === "gstDetails"
//                       ? isGSTFieldEnabled(String(key))
//                       : true;
//                   const dependencyText = getDependencyText(sectionKey, String(key));
//                   const isDependent = !isEnabled;

//                   let indentLevel = 0;
//                   if (sectionKey === "partyDetails") {
//                     if (["provideContactDetails", "provideBankDetails"].includes(String(key))) indentLevel = 1;
//                     if (["provideMultipleMobileNos", "defaultWhatsAppNo"].includes(String(key))) indentLevel = 2;
//                   }
//                   if (sectionKey === "gstDetails") {
//                     if (["provideHSNSACDetails", "selectNatureOfTransaction", "provideBreakupOfTaxRate", "selectTypeOfSupply", "forNonRevenueAccountsAlso"].includes(String(key))) indentLevel = 1;
//                     if (["provideHSNSACDescription", "provideCessRateDetails"].includes(String(key))) indentLevel = 2;
//                   }

//                   return (
//                     <div
//                       key={String(key)}
//                       className={`flex items-center justify-between py-2.5 pr-4 transition-colors ${
//                         value ? "bg-primary/5" : "hover:bg-secondary/20"
//                       } ${isDependent ? "opacity-50" : ""}`}
//                       style={{ paddingLeft: `${16 + indentLevel * 20}px` }}
//                     >
//                       <div className="flex-1 min-w-0">
//                         <Label
//                           className={`text-xs cursor-pointer font-normal leading-snug ${
//                             isDependent ? "text-muted-foreground" : "text-foreground"
//                           }`}
//                         >
//                           {formatFieldLabel(String(key))}
//                         </Label>
//                         {dependencyText && !isEnabled && (
//                           <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
//                             ⚠ {dependencyText}
//                           </p>
//                         )}
//                       </div>
//                       <Switch
//                         checked={value && isEnabled}
//                         onCheckedChange={(v) => {
//                           if (isEnabled) {
//                             updateConfig(sectionKey as keyof ConfigState, key, v);
//                           } else if (v) {
//                             toast.warning("Enable parent options first", {
//                               description: dependencyText,
//                               duration: 2000,
//                             });
//                           }
//                         }}
//                         className="scale-[0.85] flex-shrink-0 ml-3"
//                         disabled={!isEnabled}
//                       />
//                     </div>
//                   );
//                 })}
//               </div>
//             </motion.div>
//           )}
//         </AnimatePresence>
//       </div>
//     );
//   };

//   return (
//     <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
//       {/* Wider dialog to accommodate two columns */}
//       <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden p-0 flex flex-col">
//         {/* Header */}
//         <DialogHeader className="px-6 py-3 border-b border-border flex-shrink-0">
//           <div className="flex items-center justify-between">
//             <DialogTitle className="flex items-center gap-2 text-base">
//               <Settings className="h-4 w-4" /> Configuration (F12)
//             </DialogTitle>
//             <button
//               onClick={handleReset}
//               className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary/50"
//               title="Reset to defaults"
//             >
//               <RotateCcw className="h-3 w-3" /> Reset Defaults
//             </button>
//           </div>
//           <DialogDescription className="text-xs">
//             General Settings — Ctrl+A to save, Esc to close
//           </DialogDescription>
//         </DialogHeader>

//         {/* Keyboard shortcut bar */}
//         <div className="flex gap-2 text-[11px] flex-wrap px-6 py-1.5 bg-secondary/30 border-b border-border flex-shrink-0">
//           {[["Ctrl+A", "Save All"], ["F12", "Open/Close"], ["Esc", "Close"]].map(([k, v]) => (
//             <span key={k} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary text-muted-foreground">
//               <kbd className="font-mono font-semibold text-foreground px-1">{k}</kbd> {v}
//             </span>
//           ))}
//           <span className="ml-auto text-muted-foreground italic text-[10px] self-center">
//             Settings saved automatically
//           </span>
//         </div>

//         {/* Column header labels — Tally Prime style */}
//         <div className="grid grid-cols-2 gap-0 border-b border-border flex-shrink-0">
//           <div className="px-4 py-2 bg-primary/5 border-r border-border flex items-center gap-2">
//             <BookOpen className="h-3.5 w-3.5 text-primary" />
//             <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
//               General &amp; Party Details
//             </span>
//           </div>
//           <div className="px-4 py-2 bg-pending/5 flex items-center gap-2">
//             <Landmark className="h-3.5 w-3.5 text-pending" />
//             <span className="text-[11px] font-semibold uppercase tracking-wide text-pending">
//               Bank, Tax &amp; GST Details
//             </span>
//           </div>
//         </div>

//         {/* Two-column scrollable body */}
//         <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-border/60 min-h-0">
//           {/* LEFT column: General Details + Party Details */}
//           <div className="overflow-y-auto px-3 py-3 space-y-2">
//             {LEFT_SECTIONS.map((sk) => renderSection(sk))}
//           </div>

//           {/* RIGHT column: Bank Details + Party Tax Registration + GST Details */}
//           <div className="overflow-y-auto px-3 py-3 space-y-2">
//             {RIGHT_SECTIONS.map((sk) => renderSection(sk))}
//           </div>
//         </div>

//         {/* Footer */}
//         <div className="flex justify-end gap-2 px-6 py-3 border-t border-border bg-secondary/5 flex-shrink-0">
//           <Button variant="outline" size="sm" onClick={onClose}>
//             Cancel (Esc)
//           </Button>
//           <Button size="sm" onClick={onClose}>
//             Save (Ctrl+A)
//           </Button>
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

// // Utility: convert camelCase key → readable label
// function formatFieldLabel(key: string): string {
//   const labelMap: Record<string, string> = {
//     provideAliasesForName: "Provide Aliases for Name",
//     provideLanguageAliasesForName: "Provide Language Aliases for Name",
//     maintainBalancesBillByBill: "Maintain Balances Bill-by-Bill",
//     forNonTradingAccountsAlso: "For Non-Trading Accounts Also",
//     useInventoryAllocationsForLedgers: "Use Inventory Allocations for Ledgers",
//     allocateAdditionalCosts: "Allocate Additional Costs",
//     provideOpeningBalances: "Provide Opening Balances",
//     provideMSMERegistrationDetails: "Provide MSME Registration Details",
//     provideMailingDetails: "Provide Mailing Details",
//     incomeExpenseAccountsAlso: "For Income & Expense Accounts Also",
//     provideContactDetails: "Provide Contact Details",
//     provideMultipleMobileNos: "Provide Multiple Mobile Nos.",
//     defaultWhatsAppNo: "Set Default WhatsApp No.",
//     provideBankDetails: "Provide Bank Details",
//     provideBankAccountDetails: "Provide Bank Account Details",
//     bankReconciliationAndEPayments: "Bank Reconciliation & E-Payments",
//     chequeBookAndPrinting: "Cheque Book & Printing",
//     gstRegistrationDetails: "GST Registration Details",
//     assesseeOfOtherTerritory: "Assessee of Other Territory",
//     ledgerAsCommonParty: "Ledger as Common Party",
//     ignorePrefixSuffixInDocNo: "Ignore Prefix/Suffix in Document No.",
//     provideGSTDetails: "Provide GST Details",
//     forNonRevenueAccountsAlso: "For Non-Revenue Accounts Also",
//     provideHSNSACDetails: "Provide HSN/SAC Details",
//     provideHSNSACDescription: "Provide HSN/SAC Description",
//     selectNatureOfTransaction: "Select Nature of Transaction",
//     provideBreakupOfTaxRate: "Provide Breakup of Tax Rate",
//     provideCessRateDetails: "Provide Cess Rate Details",
//     enableReverseChargeCalculation: "Enable Reverse Charge Calculation",
//     eligibleForInputTaxCredit: "Eligible for Input Tax Credit",
//     selectTypeOfSupply: "Select Type of Supply",
//   };
//   return labelMap[key] || key
//     .replace(/([A-Z])/g, " $1")
//     .replace(/^./, (s) => s.toUpperCase())
//     .trim();
// }

// // ────────────────────────────────────────────────────────────
// // Hook to conditionally show fields based on parent group & config
// // ────────────────────────────────────────────────────────────
// export type ParentGroupInfo = {
//   name: string;
//   category: "Assets" | "Liabilities" | "Income" | "Expenses" | "Equity";
//   isSundryParty: boolean;
//   isBankAccount: boolean;
//   isDutiesTaxes: boolean;
//   isLoanAccount: boolean;
//   isCapitalAccount: boolean;
//   isSalesPurchase: boolean;
// };

// // ────────────────────────────────────────────────────────────
// // Minimum required fields per group category.
// // These fields ALWAYS show regardless of config switches,
// // because they are mandatory for the selected group to function.
// // ────────────────────────────────────────────────────────────
// function getMinimumRequired(parentGroup: ParentGroupInfo | null) {
//   if (!parentGroup) {
//     return {
//       mailingDetails: false,
//       bankAccountDetails: false,
//       gstRegistration: false,
//       gstDetails: false,
//       billWise: false,
//     };
//   }
//   return {
//     // Sundry Debtors/Creditors always need mailing + GST registration
//     mailingDetails: parentGroup.isSundryParty,
//     // Bank Accounts always need bank details
//     bankAccountDetails: parentGroup.isBankAccount,
//     // Tax/party ledgers always need GST registration block
//     gstRegistration:
//       parentGroup.isSundryParty ||
//       parentGroup.isSalesPurchase ||
//       parentGroup.isDutiesTaxes,
//     // GST details minimum for duty/tax group
//     gstDetails:
//       parentGroup.isDutiesTaxes || parentGroup.isSalesPurchase,
//     // Bill-wise tracking is minimum required for all party ledgers
//     billWise: parentGroup.isSundryParty,
//   };
// }

// // Safe version that returns default values if used outside provider
// export function useConditionalFields(parentGroup: ParentGroupInfo | null) {
//   let config: ConfigState;
//   try {
//     config = useConfig().config;
//   } catch {
//     const minReq = getMinimumRequired(parentGroup);
//     return {
//       showAliasField: true,
//       showLanguageAlias: false,
//       showBillWise: minReq.billWise || true,
//       showOpeningBalance: true,
//       showMSME: false,
//       showMailingDetails: minReq.mailingDetails,
//       showContactDetails: false,
//       showMultipleMobile: false,
//       showWhatsApp: false,
//       showPartyBankDetails: false,
//       showBankAccountDetails: minReq.bankAccountDetails,
//       showGSTRegistration: minReq.gstRegistration,
//       showAssesseeOtherTerritory: false,
//       showGSTDetails: minReq.gstDetails,
//       showHSNSAC: false,
//       showHSNSACDesc: false,
//       showNatureOfTransaction: false,
//       showTaxRateBreakup: false,
//       showCessRate: false,
//       showReverseCharge: false,
//       showInputTaxCredit: false,
//       showTypeOfSupply: false,
//     };
//   }

//   // Compute minimum required fields for the selected group
//   const minReq = getMinimumRequired(parentGroup);

//   // General Details — config-driven (no group minimum)
//   const showAliasField = config.generalDetails.provideAliasesForName;
//   const showLanguageAlias = config.generalDetails.provideLanguageAliasesForName;
//   // Bill-wise: show if config ON or if it's minimum required for the group
//   const showBillWise =
//     config.generalDetails.maintainBalancesBillByBill || minReq.billWise;
//   const showOpeningBalance = config.generalDetails.provideOpeningBalances;
//   const showMSME = config.generalDetails.provideMSMERegistrationDetails;

//   // Party Details — config-driven, with group minimum override for sundry parties
//   const partyEligible =
//     parentGroup?.isSundryParty || config.partyDetails.incomeExpenseAccountsAlso;
//   const showMailingDetails =
//     minReq.mailingDetails || // always show for sundry parties
//     (config.partyDetails.provideMailingDetails && partyEligible);
//   const showContactDetails =
//     config.partyDetails.provideContactDetails &&
//     (showMailingDetails || config.partyDetails.provideMailingDetails) &&
//     partyEligible;
//   const showMultipleMobile =
//     config.partyDetails.provideMultipleMobileNos && showContactDetails;
//   const showWhatsApp = config.partyDetails.defaultWhatsAppNo && showContactDetails;
//   const showPartyBankDetails =
//     config.partyDetails.provideBankDetails &&
//     (showMailingDetails || config.partyDetails.provideMailingDetails) &&
//     partyEligible;

//   // Bank Details — config-driven, with group minimum override for bank accounts
//   const showBankAccountDetails =
//     minReq.bankAccountDetails || // always show for bank account groups
//     (config.bankDetails.provideBankAccountDetails && (parentGroup?.isBankAccount ?? false));

//   // Party Tax Registration — config-driven, with group minimum override
//   const taxEligible =
//     parentGroup?.isSundryParty ||
//     parentGroup?.isSalesPurchase ||
//     parentGroup?.isDutiesTaxes;
//   const showGSTRegistration =
//     minReq.gstRegistration || // always show for tax-relevant groups
//     (config.partyTaxRegistrationDetails.gstRegistrationDetails && taxEligible);
//   const showAssesseeOtherTerritory =
//     config.partyTaxRegistrationDetails.assesseeOfOtherTerritory && showGSTRegistration;

//   // GST Details — config-driven, with group minimum override
//   const showGSTDetails =
//     minReq.gstDetails || // always show for duty/tax/sales groups
//     (config.gstDetails.provideGSTDetails && taxEligible);
//   const showHSNSAC = config.gstDetails.provideHSNSACDetails && showGSTDetails;
//   const showHSNSACDesc = config.gstDetails.provideHSNSACDescription && showHSNSAC;
//   const showNatureOfTransaction = config.gstDetails.selectNatureOfTransaction && showGSTDetails;
//   const showTaxRateBreakup = config.gstDetails.provideBreakupOfTaxRate && showGSTDetails;
//   const showCessRate = config.gstDetails.provideCessRateDetails && showTaxRateBreakup;
//   const showReverseCharge = config.gstDetails.enableReverseChargeCalculation && showGSTDetails;
//   const showInputTaxCredit = config.gstDetails.eligibleForInputTaxCredit && showGSTDetails;
//   const showTypeOfSupply = config.gstDetails.selectTypeOfSupply && showGSTDetails;

//   return {
//     showAliasField,
//     showLanguageAlias,
//     showBillWise,
//     showOpeningBalance,
//     showMSME,
//     showMailingDetails,
//     showContactDetails,
//     showMultipleMobile,
//     showWhatsApp,
//     showPartyBankDetails,
//     showBankAccountDetails,
//     showGSTRegistration,
//     showAssesseeOtherTerritory,
//     showGSTDetails,
//     showHSNSAC,
//     showHSNSACDesc,
//     showNatureOfTransaction,
//     showTaxRateBreakup,
//     showCessRate,
//     showReverseCharge,
//     showInputTaxCredit,
//     showTypeOfSupply,
//   };
// }

// ConfigDialog.tsx
import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch"
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  BookOpen,
  Users,
  Landmark,
  FileCheck,
  Receipt,
  EyeOff,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
// Types & Default Configuration
// ────────────────────────────────────────────────────────────
export interface ConfigState {
  generalDetails: {
    provideAliasesForName: boolean;
    provideLanguageAliasesForName: boolean;
    maintainBalancesBillByBill: boolean;
    forNonTradingAccountsAlso: boolean;
    useInventoryAllocationsForLedgers: boolean;
    allocateAdditionalCosts: boolean;
    provideOpeningBalances: boolean;
    provideMSMERegistrationDetails: boolean;
  };
  partyDetails: {
    provideMailingDetails: boolean;
    incomeExpenseAccountsAlso: boolean;
    provideContactDetails: boolean;
    provideMultipleMobileNos: boolean;
    defaultWhatsAppNo: boolean;
    provideBankDetails: boolean;
  };
  bankDetails: {
    provideBankAccountDetails: boolean;
    bankReconciliationAndEPayments: boolean;
    chequeBookAndPrinting: boolean;
  };
  partyTaxRegistrationDetails: {
    gstRegistrationDetails: boolean;
    assesseeOfOtherTerritory: boolean;
    ledgerAsCommonParty: boolean;
    ignorePrefixSuffixInDocNo: boolean;
  };
  gstDetails: {
    provideGSTDetails: boolean;
    forNonRevenueAccountsAlso: boolean;
    provideHSNSACDetails: boolean;
    provideHSNSACDescription: boolean;
    selectNatureOfTransaction: boolean;
    provideBreakupOfTaxRate: boolean;
    provideCessRateDetails: boolean;
    enableReverseChargeCalculation: boolean;
    eligibleForInputTaxCredit: boolean;
    selectTypeOfSupply: boolean;
  };
}

export const DEFAULT_CONFIG: ConfigState = {
  generalDetails: {
    provideAliasesForName: true,
    provideLanguageAliasesForName: false,
    maintainBalancesBillByBill: true,
    forNonTradingAccountsAlso: false,
    useInventoryAllocationsForLedgers: false,
    allocateAdditionalCosts: false,
    provideOpeningBalances: true,
    provideMSMERegistrationDetails: false,
  },
  partyDetails: {
    provideMailingDetails: true,
    incomeExpenseAccountsAlso: false,
    provideContactDetails: false,
    provideMultipleMobileNos: false,
    defaultWhatsAppNo: false,
    provideBankDetails: false,
  },
  bankDetails: {
    provideBankAccountDetails: true,
    bankReconciliationAndEPayments: true,
    chequeBookAndPrinting: true,
  },
  partyTaxRegistrationDetails: {
    gstRegistrationDetails: true,
    assesseeOfOtherTerritory: false,
    ledgerAsCommonParty: false,
    ignorePrefixSuffixInDocNo: false,
  },
  gstDetails: {
    provideGSTDetails: true,
    forNonRevenueAccountsAlso: false,
    provideHSNSACDetails: true,
    provideHSNSACDescription: true,
    selectNatureOfTransaction: false,
    provideBreakupOfTaxRate: false,
    provideCessRateDetails: false,
    enableReverseChargeCalculation: false,
    eligibleForInputTaxCredit: false,
    selectTypeOfSupply: true,
  },
};

// ────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────
const ConfigContext = React.createContext<{
  config: ConfigState;
  updateConfig: <K1 extends keyof ConfigState, K2 extends keyof ConfigState[K1]>(
    section: K1,
    key: K2,
    value: boolean
  ) => void;
} | null>(null);

export function useConfig() {
  const ctx = React.useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within ConfigProvider");
  return ctx;
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigState>(() => {
    try {
      const saved = localStorage.getItem("ledger:config");
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const updateConfig = useCallback(
    <K1 extends keyof ConfigState, K2 extends keyof ConfigState[K1]>(
      section: K1,
      key: K2,
      value: boolean
    ) => {
      setConfig((prev) => {
        let newConfig = {
          ...prev,
          [section]: { ...prev[section], [key]: value },
        };

        // Tally Prime style dependency management
        if (section === "partyDetails") {
          if (key === "provideMailingDetails" && value === false) {
            newConfig = {
              ...newConfig,
              partyDetails: {
                ...newConfig.partyDetails,
                provideContactDetails: false,
                provideMultipleMobileNos: false,
                defaultWhatsAppNo: false,
                provideBankDetails: false,
              },
            };
          }
          if (key === "provideContactDetails" && value === false) {
            newConfig = {
              ...newConfig,
              partyDetails: {
                ...newConfig.partyDetails,
                provideMultipleMobileNos: false,
                defaultWhatsAppNo: false,
              },
            };
          }
        }

        if (section === "gstDetails") {
          if (key === "provideGSTDetails" && value === false) {
            newConfig = {
              ...newConfig,
              gstDetails: {
                ...newConfig.gstDetails,
                forNonRevenueAccountsAlso: false,
                provideHSNSACDetails: false,
                selectNatureOfTransaction: false,
                provideBreakupOfTaxRate: false,
                provideCessRateDetails: false,
                enableReverseChargeCalculation: false,
                eligibleForInputTaxCredit: false,
                selectTypeOfSupply: false,
              },
            };
          }
          if (key === "provideHSNSACDetails" && value === false) {
            newConfig = {
              ...newConfig,
              gstDetails: {
                ...newConfig.gstDetails,
                provideHSNSACDescription: false,
              },
            };
          }
          if (key === "provideBreakupOfTaxRate" && value === false) {
            newConfig = {
              ...newConfig,
              gstDetails: {
                ...newConfig.gstDetails,
                provideCessRateDetails: false,
              },
            };
          }
        }

        localStorage.setItem("ledger:config", JSON.stringify(newConfig));
        return newConfig;
      });
    },
    []
  );

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────
// Section metadata
// ────────────────────────────────────────────────────────────
const SECTION_META = {
  generalDetails: {
    label: "General Details",
    icon: BookOpen,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  partyDetails: {
    label: "Party Details",
    icon: Users,
    color: "text-income",
    bg: "bg-income/10",
  },
  bankDetails: {
    label: "Bank Details",
    icon: Landmark,
    color: "text-pending",
    bg: "bg-pending/10",
  },
  partyTaxRegistrationDetails: {
    label: "Party Tax Registration",
    icon: FileCheck,
    color: "text-expense",
    bg: "bg-expense/10",
  },
  gstDetails: {
    label: "GST Details",
    icon: Receipt,
    color: "text-primary",
    bg: "bg-primary/10",
  },
} as const;

// ────────────────────────────────────────────────────────────
// ConfigDialog — Hierarchical design matching LedgerGroups F12
// ────────────────────────────────────────────────────────────
interface ConfigDialogProps {
  open: boolean;
  onClose: () => void;
}

// ────────────────────────────────────────────────────────────
// Column layout: LEFT = General + Party, RIGHT = Bank + TaxReg + GST
// ────────────────────────────────────────────────────────────
const LEFT_SECTIONS: (keyof typeof SECTION_META)[] = ["generalDetails", "partyDetails"];
const RIGHT_SECTIONS: (keyof typeof SECTION_META)[] = ["bankDetails", "partyTaxRegistrationDetails", "gstDetails"];

export function ConfigDialog({ open, onClose }: ConfigDialogProps) {
  const { config, updateConfig } = useConfig();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    generalDetails: true,
    partyDetails: true,
    bankDetails: true,
    partyTaxRegistrationDetails: true,
    gstDetails: true,
  });

  const toggleSection = (section: string) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const countEnabled = (section: keyof ConfigState) =>
    Object.values(config[section]).filter(Boolean).length;
  const countTotal = (section: keyof ConfigState) =>
    Object.values(config[section]).length;

  const handleReset = () => {
    (Object.keys(DEFAULT_CONFIG) as (keyof ConfigState)[]).forEach((section) => {
      (Object.keys(DEFAULT_CONFIG[section]) as (keyof ConfigState[typeof section])[]).forEach((key) => {
        updateConfig(section, key, DEFAULT_CONFIG[section][key] as boolean);
      });
    });
    toast.success("Configuration reset to defaults");
  };

  const isPartyFieldEnabled = (field: string): boolean => {
    switch (field) {
      case "incomeExpenseAccountsAlso": return true;
      case "provideContactDetails": return config.partyDetails.provideMailingDetails;
      case "provideMultipleMobileNos":
      case "defaultWhatsAppNo":
        return config.partyDetails.provideMailingDetails && config.partyDetails.provideContactDetails;
      case "provideBankDetails": return config.partyDetails.provideMailingDetails;
      default: return true;
    }
  };

  const isGSTFieldEnabled = (field: string): boolean => {
    switch (field) {
      case "provideHSNSACDetails":
      case "selectNatureOfTransaction":
      case "provideBreakupOfTaxRate":
      case "enableReverseChargeCalculation":
      case "eligibleForInputTaxCredit":
      case "selectTypeOfSupply":
      case "forNonRevenueAccountsAlso":
        return config.gstDetails.provideGSTDetails;
      case "provideHSNSACDescription":
        return config.gstDetails.provideGSTDetails && config.gstDetails.provideHSNSACDetails;
      case "provideCessRateDetails":
        return config.gstDetails.provideGSTDetails && config.gstDetails.provideBreakupOfTaxRate;
      default: return true;
    }
  };

  const getDependencyText = (section: string, field: string): string => {
    if (section === "partyDetails") {
      if (field === "provideContactDetails") return "Requires: Provide Mailing Details";
      if (field === "provideMultipleMobileNos" || field === "defaultWhatsAppNo")
        return "Requires: Mailing Details + Contact Details";
      if (field === "provideBankDetails") return "Requires: Provide Mailing Details";
    }
    if (section === "gstDetails") {
      if (["provideHSNSACDetails", "selectNatureOfTransaction", "provideBreakupOfTaxRate", "selectTypeOfSupply", "forNonRevenueAccountsAlso"].includes(field))
        return "Requires: Provide GST Details";
      if (field === "provideHSNSACDescription") return "Requires: Provide HSN/SAC Details";
      if (field === "provideCessRateDetails") return "Requires: Provide Breakup of Tax Rate";
    }
    return "";
  };

  // Shared renderer for a single section panel
  const renderSection = (sectionKey: keyof typeof SECTION_META) => {
    const meta = SECTION_META[sectionKey];
    const Icon = meta.icon;
    const enabled = countEnabled(sectionKey as keyof ConfigState);
    const total = countTotal(sectionKey as keyof ConfigState);
    const isOpen = expandedSections[sectionKey];
    const sectionConfig = config[sectionKey as keyof ConfigState];

    return (
      <div key={sectionKey} className="rounded-md border border-border/60 overflow-hidden">
        {/* Section header */}
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1 rounded ${meta.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            </div>
            <span className="text-sm font-medium text-foreground">{meta.label}</span>
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {enabled}/{total}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {!isOpen && enabled < total && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <EyeOff className="h-3 w-3" />
                {total - enabled} hidden
              </span>
            )}
            {isOpen
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {/* Animated body */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden border-t border-border/40"
            >
              <div className="divide-y divide-border/20">
                {(Object.keys(sectionConfig) as (keyof typeof sectionConfig)[]).map((key) => {
                  const value = sectionConfig[key] as boolean;
                  const isEnabled =
                    sectionKey === "partyDetails"
                      ? isPartyFieldEnabled(String(key))
                      : sectionKey === "gstDetails"
                        ? isGSTFieldEnabled(String(key))
                        : true;
                  const dependencyText = getDependencyText(sectionKey, String(key));
                  const isDependent = !isEnabled;

                  let indentLevel = 0;
                  if (sectionKey === "partyDetails") {
                    if (["provideContactDetails", "provideBankDetails"].includes(String(key))) indentLevel = 1;
                    if (["provideMultipleMobileNos", "defaultWhatsAppNo"].includes(String(key))) indentLevel = 2;
                  }
                  if (sectionKey === "gstDetails") {
                    if (["provideHSNSACDetails", "selectNatureOfTransaction", "provideBreakupOfTaxRate", "selectTypeOfSupply", "forNonRevenueAccountsAlso"].includes(String(key))) indentLevel = 1;
                    if (["provideHSNSACDescription", "provideCessRateDetails"].includes(String(key))) indentLevel = 2;
                  }

                  return (
                    <div
                      key={String(key)}
                      className={`flex items-center justify-between py-2.5 pr-4 transition-colors ${value ? "bg-primary/5" : "hover:bg-secondary/20"
                        } ${isDependent ? "opacity-50" : ""}`}
                      style={{ paddingLeft: `${16 + indentLevel * 20}px` }}
                    >
                      <div className="flex-1 min-w-0">
                        <Label
                          className={`text-xs cursor-pointer font-normal leading-snug ${isDependent ? "text-muted-foreground" : "text-foreground"
                            }`}
                        >
                          {formatFieldLabel(String(key))}
                        </Label>
                        {dependencyText && !isEnabled && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                            ⚠ {dependencyText}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={value && isEnabled}
                        onCheckedChange={(v) => {
                          if (isEnabled) {
                            updateConfig(sectionKey as keyof ConfigState, key, v);
                          } else if (v) {
                            toast.warning("Enable parent options first", {
                              description: dependencyText,
                              duration: 2000,
                            });
                          }
                        }}
                        className="scale-[0.85] flex-shrink-0 ml-3"
                        disabled={!isEnabled}
                      />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Wider dialog to accommodate two columns */}
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" /> Configuration (F12)
            </DialogTitle>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary/50"
              title="Reset to defaults"
            >
              <RotateCcw className="h-3 w-3" /> Reset Defaults
            </button>
          </div>
          <DialogDescription className="text-xs">
            General Settings — Ctrl+A to save, Esc to close
          </DialogDescription>
        </DialogHeader>

        {/* Keyboard shortcut bar */}
        <div className="flex gap-2 text-[11px] flex-wrap px-6 py-1.5 bg-secondary/30 border-b border-border flex-shrink-0">
          {[["Ctrl+A", "Save All"], ["F12", "Open/Close"], ["Esc", "Close"]].map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary text-muted-foreground">
              <kbd className="font-mono font-semibold text-foreground px-1">{k}</kbd> {v}
            </span>
          ))}
          <span className="ml-auto text-muted-foreground italic text-[10px] self-center">
            Settings saved automatically
          </span>
        </div>

        {/* Column header labels — Tally Prime style */}
        <div className="grid grid-cols-2 gap-0 border-b border-border flex-shrink-0">
          <div className="px-4 py-2 bg-primary/5 border-r border-border flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              General &amp; Party Details
            </span>
          </div>
          <div className="px-4 py-2 bg-pending/5 flex items-center gap-2">
            <Landmark className="h-3.5 w-3.5 text-pending" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-pending">
              Bank, Tax &amp; GST Details
            </span>
          </div>
        </div>

        {/* Two-column scrollable body */}
        <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-border/60 min-h-0">
          {/* LEFT column: General Details + Party Details */}
          <div className="overflow-y-auto px-3 py-3 space-y-2">
            {LEFT_SECTIONS.map((sk) => renderSection(sk))}
          </div>

          {/* RIGHT column: Bank Details + Party Tax Registration + GST Details */}
          <div className="overflow-y-auto px-3 py-3 space-y-2">
            {RIGHT_SECTIONS.map((sk) => renderSection(sk))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-border bg-secondary/5 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel (Esc)
          </Button>
          <Button size="sm" onClick={onClose}>
            Save (Ctrl+A)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Utility: convert camelCase key → readable label
function formatFieldLabel(key: string): string {
  const labelMap: Record<string, string> = {
    provideAliasesForName: "Provide Aliases for Name",
    provideLanguageAliasesForName: "Provide Language Aliases for Name",
    maintainBalancesBillByBill: "Maintain Balances Bill-by-Bill",
    forNonTradingAccountsAlso: "For Non-Trading Accounts Also",
    useInventoryAllocationsForLedgers: "Use Inventory Allocations for Ledgers",
    allocateAdditionalCosts: "Allocate Additional Costs",
    provideOpeningBalances: "Provide Opening Balances",
    provideMSMERegistrationDetails: "Provide MSME Registration Details",
    provideMailingDetails: "Provide Mailing Details",
    incomeExpenseAccountsAlso: "For Income & Expense Accounts Also",
    provideContactDetails: "Provide Contact Details",
    provideMultipleMobileNos: "Provide Multiple Mobile Nos.",
    defaultWhatsAppNo: "Set Default WhatsApp No.",
    provideBankDetails: "Provide Bank Details",
    provideBankAccountDetails: "Provide Bank Account Details",
    bankReconciliationAndEPayments: "Bank Reconciliation & E-Payments",
    chequeBookAndPrinting: "Cheque Book & Printing",
    gstRegistrationDetails: "GST Registration Details",
    assesseeOfOtherTerritory: "Assessee of Other Territory",
    ledgerAsCommonParty: "Ledger as Common Party",
    ignorePrefixSuffixInDocNo: "Ignore Prefix/Suffix in Document No.",
    provideGSTDetails: "Provide GST Details",
    forNonRevenueAccountsAlso: "For Non-Revenue Accounts Also",
    provideHSNSACDetails: "Provide HSN/SAC Details",
    provideHSNSACDescription: "Provide HSN/SAC Description",
    selectNatureOfTransaction: "Select Nature of Transaction",
    provideBreakupOfTaxRate: "Provide Breakup of Tax Rate",
    provideCessRateDetails: "Provide Cess Rate Details",
    enableReverseChargeCalculation: "Enable Reverse Charge Calculation",
    eligibleForInputTaxCredit: "Eligible for Input Tax Credit",
    selectTypeOfSupply: "Select Type of Supply",
  };
  return labelMap[key] || key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ────────────────────────────────────────────────────────────
// Hook to conditionally show fields based on parent group & config
// ────────────────────────────────────────────────────────────
export type ParentGroupInfo = {
  name: string;
  category: "Assets" | "Liabilities" | "Income" | "Expenses" | "Equity";
  isSundryParty: boolean;
  isBankAccount: boolean;
  isDutiesTaxes: boolean;
  isLoanAccount: boolean;
  isCapitalAccount: boolean;
  isSalesPurchase: boolean;
};

// ────────────────────────────────────────────────────────────
// Minimum required fields per group category.
// These fields ALWAYS show regardless of config switches,
// because they are mandatory for the selected group to function.
// ────────────────────────────────────────────────────────────
function getMinimumRequired(parentGroup: ParentGroupInfo | null) {
  if (!parentGroup) {
    return {
      mailingDetails: false,
      bankAccountDetails: false,
      gstRegistration: false,
      gstDetails: false,
      billWise: false,
    };
  }
  return {
    // Sundry Debtors/Creditors always need mailing + GST registration
    mailingDetails: parentGroup.isSundryParty,
    // Bank Accounts always need bank details
    bankAccountDetails: parentGroup.isBankAccount,
    // Tax/party ledgers always need GST registration block
    gstRegistration:
      parentGroup.isSundryParty ||
      parentGroup.isSalesPurchase ||
      parentGroup.isDutiesTaxes,
    // GST details minimum for duty/tax group
    gstDetails:
      parentGroup.isDutiesTaxes || parentGroup.isSalesPurchase,
    // Bill-wise tracking is minimum required for all party ledgers
    billWise: parentGroup.isSundryParty,
  };
}

// Safe version that returns default values if used outside provider
export function useConditionalFields(parentGroup: ParentGroupInfo | null) {
  // Bug fix: useConfig() was always throwing (ConfigProvider not wrapping the panel),
  // so useConditionalFields always returned the catch-block defaults and config toggles
  // had zero effect. We now call useConfig safely without try/catch (hooks can't
  // conditionally throw), falling back to DEFAULT_CONFIG when the context is null.
  const configCtx = React.useContext(ConfigContext);
  const config: ConfigState = configCtx?.config ?? DEFAULT_CONFIG;

  // Compute minimum required fields for the selected group
  const minReq = getMinimumRequired(parentGroup);

  // General Details — config-driven (no group minimum)
  const showAliasField = config.generalDetails.provideAliasesForName;
  const showLanguageAlias = config.generalDetails.provideLanguageAliasesForName;
  // Bill-wise: show if config ON or if it's minimum required for the group
  const showBillWise =
    config.generalDetails.maintainBalancesBillByBill || minReq.billWise;
  const showOpeningBalance = config.generalDetails.provideOpeningBalances;
  const showMSME = config.generalDetails.provideMSMERegistrationDetails;

  // Party Details — config-driven, with group minimum override for sundry parties
  const partyEligible =
    parentGroup?.isSundryParty || config.partyDetails.incomeExpenseAccountsAlso;
  const showMailingDetails =
    minReq.mailingDetails || // always show for sundry parties
    (config.partyDetails.provideMailingDetails && partyEligible);
  const showContactDetails =
    config.partyDetails.provideContactDetails &&
    (showMailingDetails || config.partyDetails.provideMailingDetails) &&
    partyEligible;
  const showMultipleMobile =
    config.partyDetails.provideMultipleMobileNos && showContactDetails;
  const showWhatsApp = config.partyDetails.defaultWhatsAppNo && showContactDetails;
  const showPartyBankDetails =
    config.partyDetails.provideBankDetails &&
    (showMailingDetails || config.partyDetails.provideMailingDetails) &&
    partyEligible;

  // Bank Details — config-driven, with group minimum override for bank accounts
  const showBankAccountDetails =
    minReq.bankAccountDetails || // always show for bank account groups
    (config.bankDetails.provideBankAccountDetails && (parentGroup?.isBankAccount ?? false));

  // Party Tax Registration — config-driven, with group minimum override
  const taxEligible =
    parentGroup?.isSundryParty ||
    parentGroup?.isSalesPurchase ||
    parentGroup?.isDutiesTaxes;
  const showGSTRegistration =
    minReq.gstRegistration || // always show for tax-relevant groups
    (config.partyTaxRegistrationDetails.gstRegistrationDetails && taxEligible);
  const showAssesseeOtherTerritory =
    config.partyTaxRegistrationDetails.assesseeOfOtherTerritory && showGSTRegistration;

  // GST Details — config-driven, with group minimum override
  const showGSTDetails =
    minReq.gstDetails || // always show for duty/tax/sales groups
    (config.gstDetails.provideGSTDetails && taxEligible);
  const showHSNSAC = config.gstDetails.provideHSNSACDetails && showGSTDetails;
  const showHSNSACDesc = config.gstDetails.provideHSNSACDescription && showHSNSAC;
  const showNatureOfTransaction = config.gstDetails.selectNatureOfTransaction && showGSTDetails;
  const showTaxRateBreakup = config.gstDetails.provideBreakupOfTaxRate && showGSTDetails;
  const showCessRate = config.gstDetails.provideCessRateDetails && showTaxRateBreakup;
  const showReverseCharge = config.gstDetails.enableReverseChargeCalculation && showGSTDetails;
  const showInputTaxCredit = config.gstDetails.eligibleForInputTaxCredit && showGSTDetails;
  const showTypeOfSupply = config.gstDetails.selectTypeOfSupply && showGSTDetails;

  // Bug fix: maintainCostCenters was in the form interface but was never rendered.
  // Driven by the "Use Inventory Allocations for Ledgers" config toggle.
  const showCostCentres = config.generalDetails.useInventoryAllocationsForLedgers;

  return {
    showAliasField,
    showLanguageAlias,
    showBillWise,
    showOpeningBalance,
    showMSME,
    showMailingDetails,
    showContactDetails,
    showMultipleMobile,
    showWhatsApp,
    showPartyBankDetails,
    showBankAccountDetails,
    showGSTRegistration,
    showAssesseeOtherTerritory,
    showGSTDetails,
    showHSNSAC,
    showHSNSACDesc,
    showNatureOfTransaction,
    showTaxRateBreakup,
    showCessRate,
    showReverseCharge,
    showInputTaxCredit,
    showTypeOfSupply,
    showCostCentres,
  };
}