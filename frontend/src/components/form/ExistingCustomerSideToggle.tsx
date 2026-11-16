import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import type { DeepViewCustomerSeed } from '../CustomerDeepView';
import type { ExistingCustomerMatch } from '../../api/customerCheckApi';
import type { CreditBand, RiskLevel } from '../../api/riskApi';
import type {
  ExistingCustomerPanelState,
  FieldMatchSummary,
} from '../../hooks/existingCustomerCheckModel';
import {
  formatExtraMatchesLabel,
  formatInlineFieldChipText,
  formatMatchedReasonBadges,
  formatMatchRoleHeadline,
  formatPoliteMatchAnnouncement,
  formatStepContextLabel,
  toDeepViewCustomerSeed,
  type StepCheckContext,
} from './existingCustomerCheckPresenter';

const formatINR = (value: number | null | undefined) =>
  `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;

function riskToneClasses(level?: RiskLevel | null): string {
  switch (level) {
    case 'critical':
      return 'bg-red-600/15 text-red-700 dark:text-red-300 border-red-500/40';
    case 'high':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40';
    case 'warning':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40';
    case 'safe':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40';
    default:
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40';
  }
}

function creditBandClasses(band: CreditBand): string {
  switch (band) {
    case 'Excellent':
      return 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/35';
    case 'Good':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35';
    case 'Fair':
      return 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/35';
    case 'Poor':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35';
  }
}

function loanStatusClasses(status?: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'seized') {
    return 'bg-red-600/15 text-red-700 dark:text-red-300 border-red-500/40';
  }
  if (s === 'active') {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/35';
  }
  if (s === 'close' || s === 'closed') {
    return 'bg-muted text-muted-foreground border-border';
  }
  return 'bg-secondary text-secondary-foreground border-border';
}

function formatLoanStatusLabel(status?: string | null, hasLoan?: boolean): string {
  if (!hasLoan && !status) return 'No Loan';
  const s = (status || '').toLowerCase();
  if (s === 'close') return 'Closed';
  if (!s) return hasLoan ? 'Active' : 'Consulting';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useExistingCustomerOverlayController(
  setPanelState: (next: ExistingCustomerPanelState) => void
) {
  const [deepViewCustomer, setDeepViewCustomer] = useState<DeepViewCustomerSeed | null>(null);
  const [deepViewOpen, setDeepViewOpen] = useState(false);
  const pillButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  const openDeepView = useCallback(
    (match: ExistingCustomerMatch, triggerEl: HTMLButtonElement | null) => {
      lastTriggerRef.current = triggerEl;
      setPanelState('collapsed');
      setDeepViewCustomer(toDeepViewCustomerSeed(match));
      setDeepViewOpen(true);
    },
    [setPanelState]
  );

  const closeDeepView = useCallback(() => {
    setDeepViewOpen(false);
    setPanelState('collapsed');
    setTimeout(() => {
      const trigger = lastTriggerRef.current;
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      } else {
        pillButtonRef.current?.focus();
      }
    }, 0);
  }, [setPanelState]);

  const expandFromChip = useCallback(() => {
    setDeepViewOpen(false);
    setPanelState('expanded');
  }, [setPanelState]);

  return {
    deepViewCustomer,
    deepViewOpen,
    pillButtonRef,
    openDeepView,
    closeDeepView,
    expandFromChip,
  };
}

export interface IdentityMatchInlineChipProps {
  summary: FieldMatchSummary | null | undefined;
  onClick: () => void;
}

export const IdentityMatchInlineChip: React.FC<IdentityMatchInlineChipProps> = ({
  summary,
  onClick,
}) => {
  if (!summary || summary.matchCount === 0) return null;

  const isStrong = summary.strength === 'strong';
  const chipClasses = isStrong
    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
    : 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/40 hover:bg-sky-500/25';

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${chipClasses}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>{formatInlineFieldChipText(summary)}</span>
      </button>
    </div>
  );
};

export interface ExistingCustomerSideToggleProps {
  stepContext: StepCheckContext;
  matches: ExistingCustomerMatch[];
  matchCount: number;
  loading: boolean;
  highestRiskLevel: RiskLevel | null;
  panelState: ExistingCustomerPanelState;
  onPanelStateChange: (next: ExistingCustomerPanelState) => void;
  drawerOpen: boolean;
  onOpenDeepView: (match: ExistingCustomerMatch, triggerEl: HTMLButtonElement | null) => void;
  pillButtonRef?: React.RefObject<HTMLButtonElement>;
}

export const ExistingCustomerSideToggle: React.FC<ExistingCustomerSideToggleProps> = ({
  stepContext,
  matches,
  matchCount,
  loading,
  highestRiskLevel,
  panelState,
  onPanelStateChange,
  drawerOpen,
  onOpenDeepView,
  pillButtonRef,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const internalPillRef = useRef<HTMLButtonElement>(null);
  const resolvedPillRef = pillButtonRef ?? internalPillRef;

  const hasMatches = matches.length > 0;
  const announcement = hasMatches
    ? formatPoliteMatchAnnouncement(matches, matchCount, stepContext)
    : '';

  // Collapse on Escape when the compact card is open and the drawer is closed
  useEffect(() => {
    if (drawerOpen || panelState !== 'expanded' || !hasMatches) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Ignore if a Radix Select / popover portal is currently open
        if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
        onPanelStateChange('collapsed');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, panelState, hasMatches, onPanelStateChange]);

  // Never cover the field currently being typed in: if focus moves to a form field
  // physically underneath the expanded card, collapse automatically to the pill.
  useEffect(() => {
    if (drawerOpen || panelState !== 'expanded' || !hasMatches) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const cardEl = cardRef.current;
      if (!target || !cardEl || cardEl.contains(target)) return;
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'SELECT' &&
        target.tagName !== 'TEXTAREA'
      ) {
        return;
      }
      const fieldRect = target.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const overlapsX = fieldRect.right > cardRect.left && fieldRect.left < cardRect.right;
      const overlapsY = fieldRect.bottom > cardRect.top && fieldRect.top < cardRect.bottom;
      if (overlapsX && overlapsY) {
        onPanelStateChange('collapsed');
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [drawerOpen, panelState, hasMatches, onPanelStateChange]);

  if (!loading && !hasMatches) {
    return null;
  }

  const contextLabel = formatStepContextLabel(stepContext);
  const extraLabel = formatExtraMatchesLabel(matchCount, matches.length);
  const riskPillClass = riskToneClasses(highestRiskLevel);

  return (
    <>
      {/* Polite screen-reader announcement for newly found matches */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Enforce single right-side overlay at a time: hide while CustomerDeepView drawer is open */}
      {!drawerOpen && (
        <>
          {/* Subtle loading indicator when checking with no prior matches shown */}
          {loading && !hasMatches && (
            <div
              data-testid="existing-customer-loading-pill"
              className="fixed right-0 top-14 z-[38] flex items-center gap-1.5 rounded-l-full border border-r-0 border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur-sm pointer-events-none"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Checking records...</span>
            </div>
          )}

          {/* Collapsed Pill at Right Edge (below h-10 top bar) */}
          {hasMatches && panelState !== 'expanded' && (
            <button
              ref={resolvedPillRef}
              type="button"
              data-testid="existing-customer-pill"
              onClick={() => onPanelStateChange('expanded')}
              aria-expanded={false}
              aria-label={`${contextLabel}: ${matchCount} existing match${matchCount === 1 ? '' : 'es'}. Click to expand`}
              className={`fixed right-0 top-14 z-[38] flex items-center gap-2 rounded-l-full border border-r-0 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition-transform hover:-translate-x-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${riskPillClass}`}
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-80" />
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
              </span>
              {highestRiskLevel && (
                <span className="rounded-full border border-current/25 bg-background/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  {highestRiskLevel}
                </span>
              )}
            </button>
          )}

          {/* Expanded Compact Card (~340px, max-h leaves bottom Back/Next/Submit uncovered) */}
          {hasMatches && panelState === 'expanded' && (
            <aside
              ref={cardRef}
              data-testid="existing-customer-card"
              aria-label="Existing customer and guarantor matches"
              className="fixed right-3 top-14 z-[38] flex w-[min(344px,calc(100vw-5rem))] max-h-[calc(100dvh-10.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2.5 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="text-xs font-bold text-foreground">
                      {matchCount} Existing {matchCount === 1 ? 'Record' : 'Records'}
                    </span>
                    {highestRiskLevel && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${riskPillClass}`}
                      >
                        {highestRiskLevel}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {contextLabel}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onPanelStateChange('collapsed')}
                  aria-label="Collapse existing customer panel"
                  title="Collapse to side pill"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Match Cards */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
                {matches.map((match) => {
                  const headline = formatMatchRoleHeadline(match);
                  const reasonBadges = formatMatchedReasonBadges(match.matchedFields);
                  const hplDisplay =
                    match.hplno !== null && match.hplno !== undefined && match.hplno !== ''
                      ? `HPL #${match.hplno}`
                      : 'No HPL';
                  const statusLabel = formatLoanStatusLabel(match.loanStatus, match.hasLoan);
                  const vehicleText = [match.vehicleNumber, match.vehicleName]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <div
                      key={match.customerId}
                      data-testid={`existing-match-item-${match.customerId}`}
                      className="rounded-lg border border-border bg-background/80 p-2.5 space-y-2 shadow-sm"
                    >
                      {/* Role-specific headline */}
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                          {headline.primary}
                        </p>
                        {headline.secondary && (
                          <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                            {headline.secondary}
                          </p>
                        )}
                      </div>

                      {/* Identity + Loan Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                              {hplDisplay}
                            </span>
                            <span className="text-xs font-semibold text-foreground truncate">
                              {match.customerName}
                            </span>
                          </div>
                          {match.relationLabel && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {match.relationLabel}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${loanStatusClasses(
                            match.loanStatus
                          )}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      {/* Matched reasons with strength */}
                      {reasonBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {reasonBadges.map((rb) => (
                            <span
                              key={rb.key}
                              title={rb.maskedValue}
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                                rb.strength === 'strong'
                                  ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                  : 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30'
                              }`}
                            >
                              {rb.label}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Risk & Credit Score Badges */}
                      {match.risk ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${creditBandClasses(
                              match.risk.creditBand
                            )}`}
                          >
                            Credit {match.risk.creditScore} · {match.risk.creditBand}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${riskToneClasses(
                              match.risk.riskLevel
                            )}`}
                          >
                            Due Risk {match.risk.dueRiskScore} · {match.risk.riskLevel}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground italic">
                          No loan record yet (consulting / profile only)
                        </div>
                      )}

                      {/* Vehicle + Pending/Overdue + Address */}
                      <div className="space-y-1 text-[11px] text-muted-foreground border-t border-border/60 pt-1.5">
                        {vehicleText && (
                          <div className="flex items-center gap-1.5 truncate">
                            <Car className="h-3 w-3 shrink-0" />
                            <span className="truncate">{vehicleText}</span>
                          </div>
                        )}

                        {match.loanSummary && (
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                            <span>
                              Pending:{' '}
                              <strong className="text-foreground">
                                {formatINR(match.loanSummary.pendingAmount)}
                              </strong>
                            </span>
                            {(match.loanSummary.overdueAmount > 0 ||
                              match.loanSummary.overdueDays > 0) && (
                              <span className="text-red-600 dark:text-red-400 font-medium">
                                Overdue {formatINR(match.loanSummary.overdueAmount)} (
                                {match.loanSummary.overdueDays}d)
                              </span>
                            )}
                          </div>
                        )}

                        {match.address && (
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate" title={match.address}>
                              {match.address}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* View Details Action */}
                      <div className="pt-0.5 flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => onOpenDeepView(match, e.currentTarget)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span>View details</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {extraLabel && (
                  <p className="py-1 text-center text-[11px] font-medium text-muted-foreground">
                    {extraLabel}
                  </p>
                )}
              </div>
            </aside>
          )}
        </>
      )}
    </>
  );
};
