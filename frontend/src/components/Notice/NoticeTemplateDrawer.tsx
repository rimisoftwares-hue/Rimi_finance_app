import React, { useEffect } from "react";
import {
  AlertTriangle,
  Award,
  Briefcase,
  Building2,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  LayoutList,
  Percent,
  Phone,
  RotateCcw,
  SlidersHorizontal,
  Stamp,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import type { PrintDocTypeId, PrintThemeId } from "@/components/common/print";
import type {
  DocumentTemplateConfigMap,
  TemplateSettingsMap,
} from "./templateSettings";

export interface NoticeThemeOption {
  id: PrintThemeId;
  name: string;
  desc: string;
  accent: string;
  style?: React.CSSProperties;
}

export const NOTICE_THEMES: NoticeThemeOption[] = [
  { id: "classic", name: "Classic", desc: "Simple white", accent: "bg-white border-foreground/20" },
  { id: "modern", name: "Modern", desc: "Clean blue", accent: "bg-primary/5 border-primary/40" },
  {
    id: "premium",
    name: "Premium",
    desc: "Gradient + logo",
    accent: "border-warning/40",
    style: { background: "var(--gradient-primary)", color: "white" },
  },
  { id: "compact", name: "Compact", desc: "Minimal print", accent: "bg-secondary/30 border-border" },
];

export interface NoticeDocTypeMeta {
  id: PrintDocTypeId;
  name: string;
  desc: string;
}

export interface DetailToggleDescriptor<K extends PrintDocTypeId = PrintDocTypeId> {
  key: Exclude<keyof DocumentTemplateConfigMap[K], "theme" | "watermark" | "footer" | "showLogo"> &
    string;
  label: string;
  helperText: string;
  icon: LucideIcon;
  dependsOn?: Exclude<keyof DocumentTemplateConfigMap[K], "theme"> & string;
}

// Populated template-by-template across Phases 2–6 so every visible toggle is wired & verified.
export const DETAIL_TOGGLES_BY_DOC: {
  [K in PrintDocTypeId]: DetailToggleDescriptor<K>[];
} = {
  ledger: [
    {
      key: "showInterestRate",
      label: "Interest Rate",
      helperText: "Show loan interest rate row in financial details",
      icon: Percent,
    },
    {
      key: "showPenalty",
      label: "Penalty Details & Column",
      helperText: "Show daily penalty rate, total penalty card, and payment penalty column",
      icon: AlertTriangle,
    },
    {
      key: "showBroker",
      label: "Broker Name",
      helperText: "Show referring broker name in the top account status bar",
      icon: UserCheck,
    },
    {
      key: "showGuardian",
      label: "Guardian / Co-Applicant",
      helperText: "Show co-applicant details card and guarantor signature block",
      icon: Users,
    },
    {
      key: "showPhotos",
      label: "Profile Photos",
      helperText: "Show customer and guardian photo boxes inside detail cards",
      icon: ImageIcon,
    },
    {
      key: "showWorkDetails",
      label: "Work Office Details",
      helperText: "Show customer work office address and phone rows",
      icon: Briefcase,
    },
    {
      key: "showVehicleChassisEngine",
      label: "Chassis & Engine Numbers",
      helperText: "Show vehicle chassis and engine numbers in vehicle information",
      icon: Car,
    },
    {
      key: "showTerms",
      label: "Terms & Conditions",
      helperText: "Show standard loan terms list above the footer signatures",
      icon: FileCheck2,
      dependsOn: "footer",
    },
  ],
  due_card: [
    {
      key: "showGuarantor",
      label: "Guarantor Details",
      helperText: "Show guarantor details card on Page 1 and guarantor signature on Page 2",
      icon: Users,
    },
    {
      key: "showDatesBar",
      label: "Agreement & EMI Dates Bar",
      helperText: "Show agreement date, first EMI date, and last EMI date summary strip",
      icon: CalendarDays,
    },
    {
      key: "showVehicleModel",
      label: "Vehicle Model",
      helperText: "Show vehicle model name alongside registration number in the loan bar",
      icon: Car,
    },
    {
      key: "showInstructions",
      label: "Payment Instructions",
      helperText: "Show borrower payment instructions note in the Page 1 footer",
      icon: Info,
      dependsOn: "footer",
    },
    {
      key: "showSettlementSection",
      label: "Final Settlement Box",
      helperText: "Show loan closure, NOC, and final settlement block at the bottom of Page 2",
      icon: CheckCircle2,
      dependsOn: "footer",
    },
  ],
  seizing_letter: [
    {
      key: "showRefNo",
      label: "Reference Number",
      helperText: "Show generated SAC/SEIZE reference number opposite the notice date",
      icon: Hash,
    },
    {
      key: "showLoanSummaryBox",
      label: "Loan Account Summary Box",
      helperText: "Show structured account & overdue summary table above the letter body",
      icon: LayoutList,
    },
    {
      key: "showCopyToGuarantor",
      label: "Copy To Guarantor",
      helperText: "Show CC / Copy To guarantor block below the Tamil notice body",
      icon: Users,
    },
    {
      key: "showUrgentStamp",
      label: "Urgent Final Notice Stamp",
      helperText: "Show rotated URGENT FINAL NOTICE stamp box beside the signature",
      icon: AlertTriangle,
      dependsOn: "footer",
    },
  ],
  defaulter_customer: [
    {
      key: "showRefNo",
      label: "Reference Number",
      helperText: "Show generated DN/CUST reference number opposite the notice date",
      icon: Hash,
    },
    {
      key: "showLoanSummaryBox",
      label: "Loan & Overdue Particulars Box",
      helperText: "Show structured loan & overdue particulars grid above the legal text",
      icon: LayoutList,
    },
    {
      key: "showPaidInstallments",
      label: "Paid Installments Row",
      helperText: "Show completed EMI count and total paid row inside the particulars box",
      icon: CheckCircle2,
      dependsOn: "showLoanSummaryBox",
    },
    {
      key: "showCopyToGuarantor",
      label: "Copy To Guarantor",
      helperText: "Show CC / Copy To co-applicant block below the demand notice",
      icon: Users,
    },
    {
      key: "showUrgentStamp",
      label: "7-Day Demand Stamp",
      helperText: "Show rotated DEMAND NOTICE / 7 DAYS NOTICE stamp box beside signature",
      icon: AlertTriangle,
      dependsOn: "footer",
    },
  ],
  defaulter_coapplicant: [
    {
      key: "showRefNo",
      label: "Reference Number",
      helperText: "Show generated DN/GUAR reference number opposite the notice date",
      icon: Hash,
    },
    {
      key: "showLoanSummaryBox",
      label: "Borrower & Default Summary Box",
      helperText: "Show structured borrower & default summary grid above the legal text",
      icon: LayoutList,
    },
    {
      key: "showBorrowerPhone",
      label: "Principal Borrower Phone",
      helperText: "Show principal borrower contact numbers inside the summary box",
      icon: Phone,
      dependsOn: "showLoanSummaryBox",
    },
    {
      key: "showCopyToBorrower",
      label: "Copy To Principal Borrower",
      helperText: "Show CC / Copy To principal borrower block below the guarantor notice",
      icon: Users,
    },
    {
      key: "showUrgentStamp",
      label: "Joint Liability Stamp",
      helperText: "Show rotated GUARANTOR NOTICE / JOINT LIABILITY stamp beside signature",
      icon: AlertTriangle,
      dependsOn: "footer",
    },
  ],
};

// Exact right-side Sheet pattern from CustomerDeepView.tsx / Alerts.tsx:
// Matches Layout.tsx <header className="h-10 ... z-40"> (2.5rem) and
// Sidebar.tsx permanent w-16 (4rem) rail across all viewport widths.
const DRAWER_OVERLAY_CLASSES = "inset-auto top-10 right-0 bottom-0 left-16 z-[45]";
const DRAWER_CONTENT_CLASSES = [
  "inset-y-auto top-10 bottom-0 right-0 z-[48]",
  "flex flex-col gap-0 p-0",
  "h-[calc(100dvh-2.5rem)] w-[calc(100vw-4rem)] sm:max-w-2xl",
  "rounded-l-2xl rounded-r-none border-l border-t border-b border-border",
  "bg-card [background:var(--gradient-card)] shadow-2xl overflow-hidden",
  "[&>[data-sheet-close]]:top-4 [&>[data-sheet-close]]:right-4 [&>[data-sheet-close]]:rounded-lg [&>[data-sheet-close]]:p-1.5 [&>[data-sheet-close]]:hover:bg-secondary [&>[data-sheet-close]]:transition-colors",
].join(" ");

export function TemplateThumb({
  theme,
  docName,
}: {
  theme: NoticeThemeOption;
  docName: string;
}) {
  const isPremium = theme.id === "premium";
  return (
    <div
      className={`relative h-28 rounded-lg border-2 ${theme.accent} overflow-hidden p-2.5 flex flex-col gap-1`}
      style={theme.style}
    >
      <div className="flex items-center gap-1.5">
        <div className={`h-4 w-4 rounded ${isPremium ? "bg-white/30" : "bg-primary"}`} />
        <div className={`h-1.5 flex-1 rounded ${isPremium ? "bg-white/40" : "bg-foreground/30"}`} />
      </div>
      <div
        className={`text-[8px] font-bold tracking-wider ${
          isPremium ? "text-white" : "text-foreground"
        } text-center mt-1 truncate`}
      >
        {docName.toUpperCase()}
      </div>
      <div className="space-y-0.5 mt-1">
        <div className={`h-1 rounded w-3/4 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-2/3 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
        <div className={`h-1 rounded w-1/2 ${isPremium ? "bg-white/30" : "bg-foreground/15"}`} />
      </div>
      <div
        className={`mt-auto h-3 rounded ${
          isPremium
            ? "bg-white/40"
            : theme.id === "modern"
              ? "bg-primary/30"
              : "bg-foreground/20"
        }`}
      />
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  helperText: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SwitchSettingRow({
  id,
  icon: Icon,
  iconClassName = "text-primary",
  label,
  helperText,
  checked,
  disabled = false,
  onCheckedChange,
}: SwitchRowProps) {
  const descId = `${id}-desc`;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3 transition-colors ${
        disabled ? "opacity-55" : "hover:bg-secondary/30"
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 h-8 w-8 rounded-lg bg-secondary/70 flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${iconClassName}`} />
        </div>
        <div className="min-w-0">
          <Label
            htmlFor={id}
            className="text-sm font-medium text-foreground cursor-pointer block leading-snug"
          >
            {label}
          </Label>
          <p id={descId} className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {helperText}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descId}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export interface NoticeTemplateDrawerProps {
  open: boolean;
  onClose: () => void;
  docTypes: NoticeDocTypeMeta[];
  activeDocTypeId: PrintDocTypeId;
  onSelectDocType: (docTypeId: PrintDocTypeId) => void;
  settings: TemplateSettingsMap;
  onUpdateSettings: <K extends PrintDocTypeId>(
    docType: K,
    patch: Partial<DocumentTemplateConfigMap[K]>
  ) => void;
  onResetDocSettings: (docType: PrintDocTypeId) => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

export function NoticeTemplateDrawer({
  open,
  onClose,
  docTypes,
  activeDocTypeId,
  onSelectDocType,
  settings,
  onUpdateSettings,
  onResetDocSettings,
  returnFocusRef,
}: NoticeTemplateDrawerProps) {
  const activeDocMeta = docTypes.find((d) => d.id === activeDocTypeId) || docTypes[0];
  const activeConfig = settings[activeDocTypeId];
  const activeThemeMeta =
    NOTICE_THEMES.find((t) => t.id === activeConfig.theme) || NOTICE_THEMES[0];
  const detailToggles = DETAIL_TOGGLES_BY_DOC[activeDocTypeId] as DetailToggleDescriptor[];

  // Radix modal Dialog/Sheet sets `pointer-events: none` on <body> while open.
  // Re-enable pointer-events on the uncovered Layout <header data-tauri-drag-region>
  // so Tauri window dragging and header controls remain usable without making the
  // drawer non-modal.
  useEffect(() => {
    if (!open) return;
    const headerEl = document.querySelector<HTMLElement>("header[data-tauri-drag-region]");
    if (!headerEl) return;
    const prevPointerEvents = headerEl.style.pointerEvents;
    headerEl.style.pointerEvents = "auto";
    return () => {
      headerEl.style.pointerEvents = prevPointerEvents;
    };
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent
        overlayClassName={DRAWER_OVERLAY_CLASSES}
        className={DRAWER_CONTENT_CLASSES}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest?.(
              "header[data-tauri-drag-region], [data-radix-popper-content-wrapper]"
            )
          ) {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        {/* Sticky Header */}
        <SheetHeader className="shrink-0 p-6 pb-4 border-b border-border bg-card/95 backdrop-blur-sm text-left space-y-0">
          <div className="flex items-start justify-between gap-4 pr-10">
            <div className="min-w-0">
              <SheetTitle className="text-xl flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary shrink-0" />
                <span>Template Settings</span>
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                Customize visual variant, branding, and optional sections per document type
              </SheetDescription>
            </div>
          </div>

          {/* Document Selector (styled like Track.tsx Select) */}
          <div className="pt-3.5">
            <Label
              htmlFor="notice-drawer-doc-select"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block"
            >
              Document Template
            </Label>
            <Select
              value={activeDocTypeId}
              onValueChange={(val) => onSelectDocType(val as PrintDocTypeId)}
            >
              <SelectTrigger id="notice-drawer-doc-select" className="w-full">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <SelectValue placeholder="Select document type" />
                </div>
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {docTypes.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">{activeDocMeta.desc}</p>
          </div>
        </SheetHeader>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* 1. Template Variants (2x2 Grid) */}
          <section aria-labelledby="drawer-variants-heading">
            <div className="flex items-center justify-between mb-2.5">
              <h3
                id="drawer-variants-heading"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Template Variants
              </h3>
              <span className="text-xs font-medium text-primary">{activeThemeMeta.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Template Variants">
              {NOTICE_THEMES.map((t) => {
                const isSelected = activeConfig.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onUpdateSettings(activeDocTypeId, { theme: t.id })}
                    className={`rounded-xl border-2 transition-all overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 shadow-md"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <TemplateThumb theme={t} docName={activeDocMeta.name} />
                    <div className="p-2.5 bg-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Branding & Stamp Toggles */}
          <section aria-labelledby="drawer-branding-heading" className="space-y-2.5">
            <h3
              id="drawer-branding-heading"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Branding & Stamps
            </h3>
            <SwitchSettingRow
              id={`toggle-${activeDocTypeId}-showLogo`}
              icon={Building2}
              iconClassName="text-primary"
              label="Company Logo"
              helperText="Display your finance company logo in the document header"
              checked={activeConfig.showLogo}
              onCheckedChange={(checked) =>
                onUpdateSettings(activeDocTypeId, { showLogo: checked })
              }
            />
            <SwitchSettingRow
              id={`toggle-${activeDocTypeId}-watermark`}
              icon={Award}
              iconClassName="text-warning"
              label="Confidential Watermark"
              helperText="Overlay a diagonal CONFIDENTIAL watermark across each page"
              checked={activeConfig.watermark}
              onCheckedChange={(checked) =>
                onUpdateSettings(activeDocTypeId, { watermark: checked })
              }
            />
            <SwitchSettingRow
              id={`toggle-${activeDocTypeId}-footer`}
              icon={Stamp}
              iconClassName="text-primary"
              label="Company Seal & Footer"
              helperText="Include authorized signatory lines and official seal footer"
              checked={activeConfig.footer}
              onCheckedChange={(checked) =>
                onUpdateSettings(activeDocTypeId, { footer: checked })
              }
            />
          </section>

          {/* 3. Document-Specific Detail Toggles */}
          {detailToggles.length > 0 && (
            <section aria-labelledby="drawer-details-heading" className="space-y-2.5">
              <h3
                id="drawer-details-heading"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Optional Document Details
              </h3>
              {detailToggles.map((item) => {
                const rawRecord = activeConfig as unknown as Record<string, boolean>;
                const isChecked = rawRecord[item.key] !== false;
                const parentOff = item.dependsOn ? rawRecord[item.dependsOn] === false : false;

                return (
                  <SwitchSettingRow
                    key={item.key}
                    id={`toggle-${activeDocTypeId}-${item.key}`}
                    icon={item.icon}
                    label={item.label}
                    helperText={item.helperText}
                    checked={isChecked}
                    disabled={parentOff}
                    onCheckedChange={(checked) =>
                      onUpdateSettings(activeDocTypeId, {
                        [item.key]: checked,
                      } as Partial<DocumentTemplateConfigMap[typeof activeDocTypeId]>)
                    }
                  />
                );
              })}
            </section>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 px-6 py-3.5 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-semibold text-foreground">{activeDocMeta.name}</span> •{" "}
            <span>{activeThemeMeta.name}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs shrink-0"
            onClick={() => onResetDocSettings(activeDocTypeId)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
