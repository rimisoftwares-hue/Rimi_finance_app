import type {
  OverdueSummary,
  PrintCustomerData,
  PrintFinanceData,
  PrintLoanRecord,
  PrintPaymentRecord,
  PrintPhotoValue,
  PrintTemplateOptions,
} from './types';

/**
 * Shared HTML escaping helper. All customer, guardian, vehicle, and finance
 * values interpolated into generated HTML must pass through this function.
 */
export const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Fetches an image URL (such as a presigned S3 print logo URL) once and converts
 * it to an inline base64 data URI so that browser print windows, Tauri print webviews,
 * and Word (.doc) exports can reliably render the image without expiring or failing
 * on remote network loads. Falls back safely to null (no logo) on any failure.
 */
export const inlineImageAsDataUri = async (url?: string | null): Promise<string | null> => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(trimmed, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const getImageUrl = (photo: PrintPhotoValue): string | null => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo;
  if (photo.signed_url) return photo.signed_url;
  if (photo.original_url) return photo.original_url;
  return null;
};

/**
 * Preloads customer & guardian profile photos across a batch into inline base64 data URIs
 * (deduplicating identical URLs) so offline/iframe/Word exports never drop images.
 */
export const preloadBatchImagesAsDataUris = async <T extends PrintCustomerData>(
  items: T[]
): Promise<T[]> => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const urlCache = new Map<string, Promise<string | null>>();
  const resolveCached = (rawUrl: string | null): Promise<string | null> => {
    if (!rawUrl) return Promise.resolve(null);
    let pending = urlCache.get(rawUrl);
    if (!pending) {
      pending = inlineImageAsDataUri(rawUrl).then((uri) => uri || rawUrl);
      urlCache.set(rawUrl, pending);
    }
    return pending;
  };

  return Promise.all(
    items.map(async (item) => {
      const cUrl = getImageUrl(item.customer?.cphoto);
      const gUrl = getImageUrl(item.guardian?.gphoto);
      const [cInline, gInline] = await Promise.all([resolveCached(cUrl), resolveCached(gUrl)]);

      return {
        ...item,
        customer: item.customer
          ? { ...item.customer, cphoto: cInline ?? item.customer.cphoto }
          : item.customer,
        guardian: item.guardian
          ? { ...item.guardian, gphoto: gInline ?? item.guardian.gphoto }
          : item.guardian,
      };
    })
  );
};

export const formatDate = (dateString?: string | null): string => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateString);
  }
};

export const computeOverdueSummary = (
  loan?: PrintLoanRecord | null,
  payments?: PrintPaymentRecord[] | null
): OverdueSummary => {
  const activePayments = Array.isArray(payments) ? payments : [];
  const totalPaid = activePayments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  const totalPenaltyPaid = activePayments.reduce((sum, p) => sum + (Number(p?.penalty) || 0), 0);
  const hpAmount = Number(loan?.hpAmount ?? loan?.hp_amount ?? 0);
  const dueMonth = Math.max(0, Number(loan?.dueMonth ?? loan?.due_month ?? 0));
  const dueAmount = Number(loan?.dueAmount ?? loan?.due_amount ?? 0);
  const netPayableRaw = Number(loan?.net_payable ?? 0);
  const totalLoan =
    netPayableRaw > 0
      ? netPayableRaw
      : dueAmount > 0 && dueMonth > 0
        ? dueAmount * dueMonth
        : hpAmount;
  const emiAmount =
    dueAmount > 0 ? dueAmount : dueMonth > 0 ? Math.round(totalLoan / dueMonth) : 0;
  const paidEmis =
    emiAmount > 0
      ? Math.floor(totalPaid / emiAmount)
      : activePayments.filter((p) => Number(p?.amount) > 0).length;

  let expectedEmis = dueMonth;
  const baseDateStr = loan?.hpDate || loan?.hp_date || loan?.dueDate || loan?.due_date;
  if (baseDateStr) {
    const baseDate = new Date(baseDateStr);
    if (!isNaN(baseDate.getTime())) {
      const diffDays = Math.max(0, (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      expectedEmis = Math.min(dueMonth, Math.max(0, Math.floor(diffDays / 30)));
    }
  }

  const overdueEmis = Math.max(0, expectedEmis - paidEmis);
  const totalBalance = Math.max(0, totalLoan - totalPaid);
  const overdueAmount =
    overdueEmis > 0 && emiAmount > 0
      ? Math.min(totalBalance, overdueEmis * emiAmount)
      : totalBalance;
  const loanPenalty = Number(loan?.penaltyAmount ?? loan?.penalty_amount ?? 0);
  const penaltyTotal = Math.max(loanPenalty, totalPenaltyPaid);

  return {
    hpAmount,
    dueMonth,
    emiAmount,
    totalLoan,
    totalPaid,
    paidEmis,
    overdueEmis,
    overdueAmount,
    totalBalance,
    penaltyTotal,
  };
};

export const renderWatermarkHtml = (options?: PrintTemplateOptions): string => {
  if (!options?.watermark) return '';
  return `<div class="print-watermark">CONFIDENTIAL</div>`;
};

export const renderLogoTag = (
  finance?: PrintFinanceData | null,
  maxHeight = 44,
  options?: PrintTemplateOptions
): string => {
  if (options?.showLogo === false) return '';
  const logoSrc = finance?.print_logo_url || null;
  if (!logoSrc) return '';
  return `<img src="${escapeHtml(logoSrc)}" alt="Logo" class="company-print-logo" style="max-height:${maxHeight}px; max-width:130px; object-fit:contain; display:block;" />`;
};

export const formatFinancePhoneDisplay = (finance?: PrintFinanceData | null): string => {
  if (!finance) return '';
  if (Array.isArray(finance.phone_numbers)) {
    return finance.phone_numbers.filter(Boolean).join(', ');
  }
  return finance.phone_numbers || finance.phone || '';
};

export const formatFinanceEmailDisplay = (finance?: PrintFinanceData | null): string => {
  if (!finance) return '';
  if (Array.isArray(finance.emails)) {
    return finance.emails.filter(Boolean).join(', ');
  }
  return finance.emails || finance.email || '';
};
