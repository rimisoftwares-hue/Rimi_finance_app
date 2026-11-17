import type {
  PrintDocTypeId,
  PrintTemplateOptions,
  PrintThemeId,
} from '@/components/common/print';

export const TEMPLATE_SETTINGS_STORAGE_PREFIX = 'rimi:notices:template-settings:v1';
export const SELECTED_DOC_TYPE_STORAGE_PREFIX = 'rimi:notices:selected-doc-type:v1';

export const VALID_THEMES: readonly PrintThemeId[] = [
  'classic',
  'modern',
  'premium',
  'compact',
] as const;

export const VALID_DOC_TYPES: readonly PrintDocTypeId[] = [
  'ledger',
  'due_card',
  'seizing_letter',
  'defaulter_customer',
  'defaulter_coapplicant',
] as const;

export interface BaseTemplateConfig {
  theme: PrintThemeId;
  watermark: boolean;
  footer: boolean;
  showLogo: boolean;
}

export interface LedgerTemplateConfig extends BaseTemplateConfig {
  showInterestRate: boolean;
  showPenalty: boolean;
  showBroker: boolean;
  showGuardian: boolean;
  showPhotos: boolean;
  showWorkDetails: boolean;
  showVehicleChassisEngine: boolean;
  showTerms: boolean;
}

export interface DueCardTemplateConfig extends BaseTemplateConfig {
  showGuarantor: boolean;
  showDatesBar: boolean;
  showVehicleModel: boolean;
  showInstructions: boolean;
  showSettlementSection: boolean;
}

export interface SeizingLetterTemplateConfig extends BaseTemplateConfig {
  showRefNo: boolean;
  showLoanSummaryBox: boolean;
  showCopyToGuarantor: boolean;
  showUrgentStamp: boolean;
}

export interface DefaulterCustomerTemplateConfig extends BaseTemplateConfig {
  showRefNo: boolean;
  showLoanSummaryBox: boolean;
  showPaidInstallments: boolean;
  showCopyToGuarantor: boolean;
  showUrgentStamp: boolean;
}

export interface DefaulterCoApplicantTemplateConfig extends BaseTemplateConfig {
  showRefNo: boolean;
  showLoanSummaryBox: boolean;
  showBorrowerPhone: boolean;
  showCopyToBorrower: boolean;
  showUrgentStamp: boolean;
}

export interface DocumentTemplateConfigMap {
  ledger: LedgerTemplateConfig;
  due_card: DueCardTemplateConfig;
  seizing_letter: SeizingLetterTemplateConfig;
  defaulter_customer: DefaulterCustomerTemplateConfig;
  defaulter_coapplicant: DefaulterCoApplicantTemplateConfig;
}

export type DocumentTemplateConfig = DocumentTemplateConfigMap[PrintDocTypeId];
export type TemplateSettingsMap = {
  [K in PrintDocTypeId]: DocumentTemplateConfigMap[K];
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_BASE_CONFIG: BaseTemplateConfig = {
  theme: 'classic',
  watermark: false,
  footer: true,
  showLogo: true,
};

export const DEFAULT_TEMPLATE_SETTINGS: Readonly<TemplateSettingsMap> = Object.freeze({
  ledger: Object.freeze({
    ...DEFAULT_BASE_CONFIG,
    showInterestRate: true,
    showPenalty: true,
    showBroker: true,
    showGuardian: true,
    showPhotos: true,
    showWorkDetails: true,
    showVehicleChassisEngine: true,
    showTerms: true,
  }),
  due_card: Object.freeze({
    ...DEFAULT_BASE_CONFIG,
    showGuarantor: true,
    showDatesBar: true,
    showVehicleModel: true,
    showInstructions: true,
    showSettlementSection: true,
  }),
  seizing_letter: Object.freeze({
    ...DEFAULT_BASE_CONFIG,
    showRefNo: true,
    showLoanSummaryBox: true,
    showCopyToGuarantor: true,
    showUrgentStamp: true,
  }),
  defaulter_customer: Object.freeze({
    ...DEFAULT_BASE_CONFIG,
    showRefNo: true,
    showLoanSummaryBox: true,
    showPaidInstallments: true,
    showCopyToGuarantor: true,
    showUrgentStamp: true,
  }),
  defaulter_coapplicant: Object.freeze({
    ...DEFAULT_BASE_CONFIG,
    showRefNo: true,
    showLoanSummaryBox: true,
    showBorrowerPhone: true,
    showCopyToBorrower: true,
    showUrgentStamp: true,
  }),
});

export function cloneDefaultTemplateSettings(): TemplateSettingsMap {
  return {
    ledger: { ...DEFAULT_TEMPLATE_SETTINGS.ledger },
    due_card: { ...DEFAULT_TEMPLATE_SETTINGS.due_card },
    seizing_letter: { ...DEFAULT_TEMPLATE_SETTINGS.seizing_letter },
    defaulter_customer: { ...DEFAULT_TEMPLATE_SETTINGS.defaulter_customer },
    defaulter_coapplicant: { ...DEFAULT_TEMPLATE_SETTINGS.defaulter_coapplicant },
  };
}

const normalizeFinanceScope = (financeId?: string | number | null): string | null => {
  if (financeId === null || financeId === undefined) return null;
  const trimmed = String(financeId).trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function getTemplateSettingsStorageKey(financeId?: string | number | null): string {
  const scope = normalizeFinanceScope(financeId);
  return scope
    ? `${TEMPLATE_SETTINGS_STORAGE_PREFIX}:${scope}`
    : TEMPLATE_SETTINGS_STORAGE_PREFIX;
}

export function getSelectedDocTypeStorageKey(financeId?: string | number | null): string {
  const scope = normalizeFinanceScope(financeId);
  return scope
    ? `${SELECTED_DOC_TYPE_STORAGE_PREFIX}:${scope}`
    : SELECTED_DOC_TYPE_STORAGE_PREFIX;
}

export function isValidTheme(value: unknown): value is PrintThemeId {
  return typeof value === 'string' && (VALID_THEMES as readonly string[]).includes(value);
}

export function isValidDocType(value: unknown): value is PrintDocTypeId {
  return typeof value === 'string' && (VALID_DOC_TYPES as readonly string[]).includes(value);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

function sanitizeDocumentConfig<K extends PrintDocTypeId>(
  docType: K,
  rawDocConfig: unknown
): DocumentTemplateConfigMap[K] {
  const defaults = { ...DEFAULT_TEMPLATE_SETTINGS[docType] };
  if (!isPlainObject(rawDocConfig)) {
    return defaults;
  }

  const next: Record<string, unknown> = { ...defaults };

  if (isValidTheme(rawDocConfig.theme)) {
    next.theme = rawDocConfig.theme;
  }

  for (const key of Object.keys(defaults)) {
    if (key === 'theme') continue;
    const candidate = rawDocConfig[key];
    if (typeof candidate === 'boolean') {
      next[key] = candidate;
    }
  }

  return next as unknown as DocumentTemplateConfigMap[K];
}

export function hydrateTemplateSettings(
  storage: StorageLike | null | undefined,
  financeId?: string | number | null
): TemplateSettingsMap {
  if (!storage) {
    return cloneDefaultTemplateSettings();
  }

  try {
    const key = getTemplateSettingsStorageKey(financeId);
    const raw = storage.getItem(key);
    if (!raw) {
      return cloneDefaultTemplateSettings();
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return cloneDefaultTemplateSettings();
    }

    return {
      ledger: sanitizeDocumentConfig('ledger', parsed.ledger),
      due_card: sanitizeDocumentConfig('due_card', parsed.due_card),
      seizing_letter: sanitizeDocumentConfig('seizing_letter', parsed.seizing_letter),
      defaulter_customer: sanitizeDocumentConfig('defaulter_customer', parsed.defaulter_customer),
      defaulter_coapplicant: sanitizeDocumentConfig(
        'defaulter_coapplicant',
        parsed.defaulter_coapplicant
      ),
    };
  } catch {
    return cloneDefaultTemplateSettings();
  }
}

export function hydrateSelectedDocType(
  storage: StorageLike | null | undefined,
  financeId?: string | number | null
): PrintDocTypeId {
  if (!storage) return 'ledger';
  try {
    const raw = storage.getItem(getSelectedDocTypeStorageKey(financeId));
    return isValidDocType(raw) ? raw : 'ledger';
  } catch {
    return 'ledger';
  }
}

export function persistSelectedDocTypeSync(
  storage: StorageLike | null | undefined,
  financeId: string | number | null | undefined,
  docType: PrintDocTypeId
): void {
  if (!storage || !isValidDocType(docType)) return;
  try {
    storage.setItem(getSelectedDocTypeStorageKey(financeId), docType);
  } catch {
    // Ignore storage quota / privacy errors safely
  }
}

export function persistTemplateSettingsSync(
  storage: StorageLike | null | undefined,
  financeId: string | number | null | undefined,
  settings: TemplateSettingsMap
): void {
  if (!storage) return;
  try {
    const key = getTemplateSettingsStorageKey(financeId);
    storage.setItem(key, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy errors safely
  }
}

export function createDebouncedSettingsWriter(
  storage: StorageLike | null | undefined,
  delayMs = 150
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { financeId: string | number | null | undefined; settings: TemplateSettingsMap } | null =
    null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      const { financeId, settings } = pending;
      pending = null;
      persistTemplateSettingsSync(storage, financeId, settings);
    }
  };

  const schedule = (
    financeId: string | number | null | undefined,
    settings: TemplateSettingsMap
  ) => {
    pending = { financeId, settings };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return { schedule, flush, cancel };
}

export function updateDocumentTemplateSettings<K extends PrintDocTypeId>(
  current: TemplateSettingsMap,
  docType: K,
  patch: Partial<DocumentTemplateConfigMap[K]>
): TemplateSettingsMap {
  const mergedCandidate = {
    ...current[docType],
    ...patch,
  };
  return {
    ...current,
    [docType]: sanitizeDocumentConfig(docType, mergedCandidate),
  };
}

export function resetDocumentTemplateSettings(
  current: TemplateSettingsMap,
  docType: PrintDocTypeId
): TemplateSettingsMap {
  return {
    ...current,
    [docType]: { ...DEFAULT_TEMPLATE_SETTINGS[docType] },
  };
}

export function toPrintTemplateOptions<K extends PrintDocTypeId>(
  _docType: K,
  config: DocumentTemplateConfigMap[K]
): PrintTemplateOptions {
  return { ...config };
}
