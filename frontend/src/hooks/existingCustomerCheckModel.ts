import type {
  ExistingCustomerCheckRequest,
  ExistingCustomerCheckResponse,
  ExistingCustomerMatch,
  IdentityEntityRole,
  IdentityMatchField,
  IdentityMatchStrength,
} from '../api/customerCheckApi.ts';
import type { RiskLevel } from '../api/riskApi.ts';

export type ExistingCustomerPanelState = 'hidden' | 'collapsed' | 'expanded';

export interface ContactCandidateInput {
  contact_type?: string | null;
  type?: string | null;
  number?: string | null;
}

export interface UseExistingCustomerCheckInput {
  /** ContactInput array — rows with type === 'work' are automatically excluded */
  contacts?: ContactCandidateInput[];
  /** Optional raw personal phone strings (work/office phones must NOT be passed here) */
  phones?: string[];
  aadhar?: string | null;
  otherGovtIdType?: string | null;
  otherGovtIdNumber?: string | null;
  excludeCustomerId?: string | null;
  /** Optional tenant scope key (e.g. currentFinance?.id) to isolate client cache across switches */
  financeScopeKey?: string | number | null;
}

export interface ExtractedIdentityPayload {
  hasValidInput: boolean;
  signature: string;
  requestBody: ExistingCustomerCheckRequest;
  /** Maps normalized requestBody.phones[i] back to original `contacts` array index */
  contactIndexByNormPhoneIndex: number[];
  normalizedPhones: string[];
  normalizedAadhar: string | null;
  normalizedGovtIdNumber: string | null;
}

export interface FieldMatchSummary {
  field: IdentityMatchField;
  strength: IdentityMatchStrength;
  matchCount: number;
  roles: IdentityEntityRole[];
  matches: ExistingCustomerMatch[];
}

export interface FieldMatchMap {
  /** Keyed by ContactInput row index (0, 1, ...) for matching personal phones */
  byContactIndex: Record<number, FieldMatchSummary>;
  /** Keyed by normalized 10-digit phone */
  byPhone: Record<string, FieldMatchSummary>;
  aadhar: FieldMatchSummary | null;
  otherGovtId: FieldMatchSummary | null;
}

export interface ExistingCustomerCheckSnapshot {
  matches: ExistingCustomerMatch[];
  matchCount: number;
  loading: boolean;
  error: string | null;
  highestRiskLevel: RiskLevel | null;
  fieldMatchMap: FieldMatchMap;
  panelState: ExistingCustomerPanelState;
  signature: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPECIFIC_GOVT_ID_TYPES = new Set(['pan_card', 'voter_id', 'driving_license']);
const MAX_PHONES = 6;
const MAX_CLIENT_CACHE = 50;

export const EMPTY_FIELD_MATCH_MAP: FieldMatchMap = Object.freeze({
  byContactIndex: {},
  byPhone: {},
  aadhar: null,
  otherGovtId: null,
});

export function normalizePersonalPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    d = d.slice(2);
  } else if (d.length === 11 && d.startsWith('0')) {
    d = d.slice(1);
  }
  if (d.length !== 10) return null;
  if (/^0+$/.test(d)) return null;
  return d;
}

export function normalizeAadharInput(raw?: string | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 12 || /^0+$/.test(d)) return null;
  return d;
}

export function normalizeGovtIdInput(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (s.length < 5 || s.length > 40) return null;
  return s;
}

export function extractValidIdentityPayload(
  input: UseExistingCustomerCheckInput
): ExtractedIdentityPayload {
  const normalizedPhones: string[] = [];
  const contactIndexByNormPhoneIndex: number[] = [];
  const seenPhones = new Set<string>();

  if (Array.isArray(input.contacts)) {
    input.contacts.forEach((ct, rowIdx) => {
      if (normalizedPhones.length >= MAX_PHONES) return;
      if (!ct || String(ct.type || '').trim().toLowerCase() === 'work') {
        return; // Strictly exclude work/office phones
      }
      const norm = normalizePersonalPhone(ct.number);
      if (norm && !seenPhones.has(norm)) {
        seenPhones.add(norm);
        normalizedPhones.push(norm);
        contactIndexByNormPhoneIndex.push(rowIdx);
      }
    });
  }

  if (Array.isArray(input.phones)) {
    input.phones.forEach((rawPhone, idx) => {
      if (normalizedPhones.length >= MAX_PHONES) return;
      const norm = normalizePersonalPhone(rawPhone);
      if (norm && !seenPhones.has(norm)) {
        seenPhones.add(norm);
        normalizedPhones.push(norm);
        contactIndexByNormPhoneIndex.push(idx);
      }
    });
  }

  const normalizedAadhar = normalizeAadharInput(input.aadhar);
  const normalizedGovtIdNumber = normalizeGovtIdInput(input.otherGovtIdNumber);

  const rawGtype = String(input.otherGovtIdType || '').trim().toLowerCase();
  const effectiveGovtIdType =
    normalizedGovtIdNumber && SPECIFIC_GOVT_ID_TYPES.has(rawGtype) ? rawGtype : undefined;

  const trimmedExclude = String(input.excludeCustomerId || '').trim();
  const validExcludeId = UUID_REGEX.test(trimmedExclude) ? trimmedExclude : undefined;

  const hasValidInput = Boolean(
    normalizedPhones.length > 0 || normalizedAadhar || normalizedGovtIdNumber
  );

  if (!hasValidInput) {
    return {
      hasValidInput: false,
      signature: '',
      requestBody: {},
      contactIndexByNormPhoneIndex: [],
      normalizedPhones: [],
      normalizedAadhar: null,
      normalizedGovtIdNumber: null,
    };
  }

  const requestBody: ExistingCustomerCheckRequest = {};
  if (normalizedPhones.length > 0) requestBody.phones = normalizedPhones;
  if (normalizedAadhar) requestBody.aadhar = normalizedAadhar;
  if (effectiveGovtIdType) requestBody.otherGovtIdType = effectiveGovtIdType;
  if (normalizedGovtIdNumber) requestBody.otherGovtIdNumber = normalizedGovtIdNumber;
  if (validExcludeId) requestBody.excludeCustomerId = validExcludeId;

  const scope = input.financeScopeKey != null ? String(input.financeScopeKey) : '';
  const signature = JSON.stringify({
    s: scope,
    p: normalizedPhones,
    a: normalizedAadhar || '',
    gt: effectiveGovtIdType || '',
    gn: normalizedGovtIdNumber || '',
    ex: validExcludeId || '',
  });

  return {
    hasValidInput: true,
    signature,
    requestBody,
    contactIndexByNormPhoneIndex,
    normalizedPhones,
    normalizedAadhar,
    normalizedGovtIdNumber,
  };
}

function mergeMatchIntoSummary(
  existing: FieldMatchSummary | undefined,
  field: IdentityMatchField,
  strength: IdentityMatchStrength,
  role: IdentityEntityRole,
  match: ExistingCustomerMatch
): FieldMatchSummary {
  if (!existing) {
    return {
      field,
      strength,
      matchCount: 1,
      roles: [role],
      matches: [match],
    };
  }

  const nextRoles = existing.roles.includes(role)
    ? existing.roles
    : [...existing.roles, role];
  const hasMatch = existing.matches.some((m) => m.customerId === match.customerId);
  const nextMatches = hasMatch ? existing.matches : [...existing.matches, match];
  const nextStrength: IdentityMatchStrength =
    existing.strength === 'strong' || strength === 'strong' ? 'strong' : 'possible';

  return {
    field,
    strength: nextStrength,
    matchCount: nextMatches.length,
    roles: nextRoles,
    matches: nextMatches,
  };
}

export function buildFieldMatchMap(
  matches: ExistingCustomerMatch[],
  extracted: ExtractedIdentityPayload
): FieldMatchMap {
  if (!matches.length || !extracted.hasValidInput) {
    return EMPTY_FIELD_MATCH_MAP;
  }

  const byContactIndex: Record<number, FieldMatchSummary> = {};
  const byPhone: Record<string, FieldMatchSummary> = {};
  let aadharSummary: FieldMatchSummary | null = null;
  let otherGovtIdSummary: FieldMatchSummary | null = null;

  for (const match of matches) {
    for (const mf of match.matchedFields || []) {
      if (mf.field === 'aadhar') {
        aadharSummary = mergeMatchIntoSummary(
          aadharSummary || undefined,
          'aadhar',
          mf.strength,
          mf.entityRole,
          match
        );
      } else if (mf.field === 'other_govt_id') {
        otherGovtIdSummary = mergeMatchIntoSummary(
          otherGovtIdSummary || undefined,
          'other_govt_id',
          mf.strength,
          mf.entityRole,
          match
        );
      } else if (mf.field === 'phone') {
        let normIdx =
          typeof mf.matchedInputIndex === 'number' && mf.matchedInputIndex >= 0
            ? mf.matchedInputIndex
            : -1;

        if (normIdx < 0 && mf.maskedValue) {
          const last4 = mf.maskedValue.slice(-4);
          normIdx = extracted.normalizedPhones.findIndex((p) => p.endsWith(last4));
        }

        if (normIdx >= 0 && normIdx < extracted.normalizedPhones.length) {
          const phone10 = extracted.normalizedPhones[normIdx];
          byPhone[phone10] = mergeMatchIntoSummary(
            byPhone[phone10],
            'phone',
            mf.strength,
            mf.entityRole,
            match
          );
          const contactRowIdx = extracted.contactIndexByNormPhoneIndex[normIdx];
          if (contactRowIdx !== undefined) {
            byContactIndex[contactRowIdx] = mergeMatchIntoSummary(
              byContactIndex[contactRowIdx],
              'phone',
              mf.strength,
              mf.entityRole,
              match
            );
          }
        }
      }
    }
  }

  return {
    byContactIndex,
    byPhone,
    aadhar: aadharSummary,
    otherGovtId: otherGovtIdSummary,
  };
}

/**
 * Checks whether auto-expanding the ~350px right-side card would overlap the
 * currently focused input or squeeze a narrow viewport (<1024px). When true,
 * defaults to the collapsed right-edge pill so typing is never obstructed.
 */
export function shouldDefaultToCollapsedInDom(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 1024 || vh < 560) {
    return true;
  }

  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') &&
    typeof active.getBoundingClientRect === 'function'
  ) {
    const rect = active.getBoundingClientRect();
    const cardLeft = vw - 372;
    const cardTop = 56;
    const cardBottom = Math.min(vh - 104, cardTop + 440);
    const overlapsHorizontally = rect.right > cardLeft && rect.left < vw;
    const overlapsVertically = rect.bottom > cardTop && rect.top < cardBottom;
    if (overlapsHorizontally && overlapsVertically) {
      return true;
    }
  }

  return false;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string };
  return (
    e.name === 'AbortError' ||
    e.name === 'CanceledError' ||
    e.code === 'ERR_CANCELED'
  );
}

export interface ControllerOptions {
  debounceMs?: number;
  fetcher: (
    body: ExistingCustomerCheckRequest,
    signal?: AbortSignal
  ) => Promise<ExistingCustomerCheckResponse>;
  shouldDefaultCollapsed?: () => boolean;
  onChange?: (snapshot: ExistingCustomerCheckSnapshot) => void;
}

export function createExistingCustomerCheckController(options: ControllerOptions) {
  const debounceMs = options.debounceMs ?? 400;
  const fetcher = options.fetcher;
  const shouldDefaultCollapsed = options.shouldDefaultCollapsed ?? shouldDefaultToCollapsedInDom;

  const cache = new Map<string, ExistingCustomerCheckResponse>();
  const collapsedSignatures = new Set<string>();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeAbortController: AbortController | null = null;
  let activeExtracted: ExtractedIdentityPayload = {
    hasValidInput: false,
    signature: '',
    requestBody: {},
    contactIndexByNormPhoneIndex: [],
    normalizedPhones: [],
    normalizedAadhar: null,
    normalizedGovtIdNumber: null,
  };

  let snapshot: ExistingCustomerCheckSnapshot = {
    matches: [],
    matchCount: 0,
    loading: false,
    error: null,
    highestRiskLevel: null,
    fieldMatchMap: EMPTY_FIELD_MATCH_MAP,
    panelState: 'hidden',
    signature: '',
  };

  const emit = (next: ExistingCustomerCheckSnapshot) => {
    snapshot = next;
    options.onChange?.(snapshot);
  };

  const cancelPending = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  };

  const applyResponse = (
    extracted: ExtractedIdentityPayload,
    res: ExistingCustomerCheckResponse
  ) => {
    const matches = Array.isArray(res.matches) ? res.matches : [];
    const matchCount = typeof res.matchCount === 'number' ? res.matchCount : matches.length;
    const highestRiskLevel = res.highestRiskLevel ?? null;
    const fieldMatchMap = buildFieldMatchMap(matches, extracted);

    let panelState: ExistingCustomerPanelState = 'hidden';
    if (matches.length > 0) {
      if (collapsedSignatures.has(extracted.signature)) {
        panelState = 'collapsed';
      } else {
        panelState = shouldDefaultCollapsed() ? 'collapsed' : 'expanded';
      }
    }

    emit({
      matches,
      matchCount,
      loading: false,
      error: null,
      highestRiskLevel,
      fieldMatchMap,
      panelState,
      signature: extracted.signature,
    });
  };

  const updateInput = (rawInput: UseExistingCustomerCheckInput) => {
    const extracted = extractValidIdentityPayload(rawInput);

    if (!extracted.hasValidInput) {
      cancelPending();
      activeExtracted = extracted;
      if (
        snapshot.signature !== '' ||
        snapshot.loading ||
        snapshot.matches.length > 0 ||
        snapshot.error !== null ||
        snapshot.panelState !== 'hidden'
      ) {
        emit({
          matches: [],
          matchCount: 0,
          loading: false,
          error: null,
          highestRiskLevel: null,
          fieldMatchMap: EMPTY_FIELD_MATCH_MAP,
          panelState: 'hidden',
          signature: '',
        });
      }
      return;
    }

    if (extracted.signature === activeExtracted.signature) {
      activeExtracted = extracted;
      if (!snapshot.loading && snapshot.matches.length > 0) {
        const refreshedMap = buildFieldMatchMap(snapshot.matches, extracted);
        emit({
          ...snapshot,
          fieldMatchMap: refreshedMap,
        });
      }
      return;
    }

    cancelPending();
    activeExtracted = extracted;

    const cached = cache.get(extracted.signature);
    if (cached) {
      applyResponse(extracted, cached);
      return;
    }

    const targetExtracted = extracted;
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const controller = new AbortController();
      activeAbortController = controller;

      emit({
        ...snapshot,
        loading: true,
        error: null,
        signature: targetExtracted.signature,
      });

      try {
        const res = await fetcher(targetExtracted.requestBody, controller.signal);
        if (controller.signal.aborted || activeExtracted.signature !== targetExtracted.signature) {
          return;
        }
        activeAbortController = null;

        if (cache.size >= MAX_CLIENT_CACHE) {
          const firstKey = cache.keys().next().value;
          if (firstKey !== undefined) cache.delete(firstKey);
        }
        cache.set(targetExtracted.signature, res);
        applyResponse(targetExtracted, res);
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        activeAbortController = null;
        emit({
          matches: [],
          matchCount: 0,
          loading: false,
          error: 'Could not check existing customer records',
          highestRiskLevel: null,
          fieldMatchMap: EMPTY_FIELD_MATCH_MAP,
          panelState: 'hidden',
          signature: targetExtracted.signature,
        });
      }
    }, debounceMs);
  };

  const setPanelState = (nextState: ExistingCustomerPanelState) => {
    if (snapshot.signature) {
      if (nextState === 'collapsed') {
        collapsedSignatures.add(snapshot.signature);
      } else if (nextState === 'expanded') {
        collapsedSignatures.delete(snapshot.signature);
      }
    }
    emit({
      ...snapshot,
      panelState: nextState,
    });
  };

  const dispose = () => {
    cancelPending();
    activeExtracted = {
      hasValidInput: false,
      signature: '',
      requestBody: {},
      contactIndexByNormPhoneIndex: [],
      normalizedPhones: [],
      normalizedAadhar: null,
      normalizedGovtIdNumber: null,
    };
  };

  return {
    updateInput,
    setPanelState,
    getSnapshot: () => snapshot,
    dispose,
  };
}

