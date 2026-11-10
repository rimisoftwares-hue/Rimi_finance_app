// OCR (AI Scan) API client.
// apiClient already includes the /api prefix in its baseURL, so paths start with /ocr.
// S3 uploads use native fetch with the presigned URL only (never the backend Authorization header).

import apiClient from './apiClient';
import type { LoanType } from '../components/form/LoanTypeToggle';
import type {
  OcrConfig,
  OcrDirectScanResponse,
  OcrCreateBatchResponse,
  OcrBatchState,
  VehicleAvailability,
} from '../types/ocr';

interface Envelope<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
  error?: string;
}

/** User-facing messages for backend error codes. */
const OCR_ERROR_MESSAGES: Record<string, string> = {
  OCR_DISABLED: 'AI Scan is not enabled on this server.',
  OCR_NOT_PROVISIONED: 'AI Scan database tables are not set up on this server.',
  NOT_PROVISIONED: 'AI Scan database tables are not set up on this server.',
  NO_API_KEY: 'AI service is not configured correctly, please contact your administrator',
  MODEL_UNAVAILABLE: 'AI service is not configured correctly, please contact your administrator',
  OCR_CONFIG_ERROR: 'AI service is not configured correctly, please contact your administrator',
  PROVIDER_AUTH_FAILED: 'AI service is not configured correctly, please contact your administrator',
  PROVIDER_NOT_READY: 'AI service is not configured correctly, please contact your administrator',
  WORKER_DISABLED: 'AI Scan background worker is not running on this server.',
  DAILY_QUOTA_EXCEEDED: 'Scan limit reached, try later or contact admin',
  OCR_QUOTA_EXCEEDED: 'Scan limit reached, try later or contact admin',
  PROVIDER_QUOTA_EXHAUSTED: 'Scan limit reached, try later or contact admin',
  OCR_BUSY: 'AI is busy, try again in a few seconds',
  PROVIDER_RATE_LIMITED: 'AI is busy, try again in a few seconds',
  RATE_LIMITED: 'Too many scans in a short time. Please wait a minute and try again.',
  OCR_RATE_LIMITED: 'Too many scans in a short time. Please wait a minute and try again.',
  PROVIDER_TIMEOUT: 'The AI scan timed out. Please try again.',
  PROVIDER_UNAVAILABLE: 'The AI scan service is temporarily unavailable. Please try again.',
  OCR_UNAVAILABLE: 'The AI scan service is temporarily unavailable. Please try again.',
  INVALID_FILES: 'Please select a valid image file to scan.',
  INVALID_FILE_COUNT: 'Please select a valid number of images to scan.',
  INVALID_FILE_SIZE: 'Invalid image file size. Please choose a valid image.',
  INVALID_MIME: 'Please use a JPEG, PNG, or WebP photo.',
  UNSUPPORTED_TYPE: 'Please use a JPEG, PNG, or WebP photo.',
  FILE_TOO_LARGE: 'The photo is too large. Please use a smaller JPEG or PNG photo.',
  UPLOAD_MISMATCH: 'The upload could not be verified. Please try again.',
  OUTPUT_TRUNCATED: 'The card has too much text to read in one go. Try a closer, clearer photo.',
  BLOCKED_BY_PROVIDER: 'The AI service declined to read this image. Please enter the details manually.',
  INVALID_IMAGE: 'This file is not a readable image. Please use a JPEG or PNG photo.',
  INVALID_JSON_AFTER_REPAIR: 'The AI could not read this card reliably. Please try "Scan again".',
  SOURCE_MISSING: 'The photo is no longer available. Please scan again.',
  WORKER_STALLED: 'The scan took too long. Please try again.',
  RETRY_LIMIT: 'Retry limit reached. Please scan again.',
};

export class OcrApiError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const ocrErrorMessage = (code?: string | null, fallback = 'AI scan failed. Please try again.'): string =>
  (code && OCR_ERROR_MESSAGES[code]) || fallback;

const toOcrError = (err: unknown): OcrApiError => {
  const e = err as {
    response?: { status?: number; data?: { code?: string; message?: string; error?: string } };
    message?: string;
  };
  const status = e?.response?.status;
  const backendCode = e?.response?.data?.code;
  if (backendCode && OCR_ERROR_MESSAGES[backendCode]) {
    return new OcrApiError(backendCode, OCR_ERROR_MESSAGES[backendCode], status);
  }
  if (status === 404 && !backendCode) {
    return new OcrApiError(
      'OCR_SERVICE_NOT_FOUND',
      'AI Scan service not found. Please contact support.',
      404
    );
  }
  const code = backendCode || 'OCR_REQUEST_FAILED';
  const message =
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    e?.message ||
    'AI scan failed. Please try again.';
  return new OcrApiError(code, message, status);
};

const unwrap = async <T>(p: Promise<{ data: Envelope<T> }>): Promise<T> => {
  try {
    const res = await p;
    return res.data.data;
  } catch (err) {
    throw toOcrError(err);
  }
};

export const getOcrConfig = (): Promise<OcrConfig> =>
  unwrap<OcrConfig>(apiClient.get('/ocr/config'));

const SMALL_DIRECT_BYTES = 900 * 1024;

const loadImageElement = (file: File): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> =>
  new Promise((resolve, reject) => {
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
        .then((bmp) => {
          resolve({
            source: bmp,
            width: bmp.width,
            height: bmp.height,
            cleanup: () => {
              if (typeof bmp.close === 'function') bmp.close();
            },
          });
        })
        .catch(() => {
          // Fallback to HTMLImageElement
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () =>
            resolve({
              source: img,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              cleanup: () => URL.revokeObjectURL(url),
            });
          img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
          };
          img.src = url;
        });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

/**
 * Safe browser-side pre-compression before OCR upload:
 * - Keeps JPEG/WebP <= 900 KB and <= maxEdge untouched.
 * - Scales larger images to fit within maxEdge (2048px) and exports JPEG at quality 0.86
 *   with a solid #FFFFFF background so transparent PNGs never turn black.
 * - Returns the original file if re-encoding produces a larger blob or fails.
 */
export const prepareFileForOcr = async (file: File, maxEdge = 2048, quality = 0.86): Promise<File> => {
  if (typeof document === 'undefined') return file;
  let loaded: { source: CanvasImageSource; width: number; height: number; cleanup: () => void } | null = null;
  try {
    loaded = await loadImageElement(file);
    const { source, width, height } = loaded;
    if (!width || !height) return file;

    const longest = Math.max(width, height);
    if (
      (file.type === 'image/jpeg' || file.type === 'image/webp') &&
      file.size <= SMALL_DIRECT_BYTES &&
      longest <= maxEdge
    ) {
      return file;
    }

    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(source, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob || blob.size === 0 || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'ledger';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (loaded) loaded.cleanup();
  }
};

const DIRECT_SCAN_TIMEOUT_MS = 95000;

/**
 * Direct single-image scan: posts raw image bytes to POST /api/ocr/scan?loanType=consulting|vehicle
 * and returns { mergedResult, modelUsed, fallbackUsed, durationMs } in the same HTTP response.
 */
export const scanSingleImageDirect = (
  loanType: LoanType,
  file: File,
  signal?: AbortSignal
): Promise<OcrDirectScanResponse> =>
  unwrap<OcrDirectScanResponse>(
    apiClient.post('/ocr/scan', file, {
      params: { loanType },
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      signal,
      timeout: DIRECT_SCAN_TIMEOUT_MS,
    })
  );

export const createOcrBatch = (
  loanType: LoanType,
  files: File[],
  forceRescan = false
): Promise<OcrCreateBatchResponse> =>
  unwrap<OcrCreateBatchResponse>(
    apiClient.post('/ocr/batches', {
      loanType,
      forceRescan,
      files: files.map((f) => ({ fileName: f.name, contentType: f.type, size: f.size })),
    })
  );

const extractJobIdFromUrl = (uploadUrl: string): string | null => {
  const m = uploadUrl.match(/\/ocr\/[0-9a-f-]+\/[0-9a-f-]+\/([0-9a-f-]{36})\.(?:jpg|png|webp)/i);
  return m ? m[1] : null;
};

/**
 * Uploads the image to S3 via the backend relay (/api/ocr/jobs/:jobId/upload) so browser
 * requests never fail on S3 bucket CORS preflight (403).
 */
export const uploadToPresignedUrl = async (
  uploadUrl: string,
  file: File,
  signal?: AbortSignal,
  jobId?: string
): Promise<void> => {
  const resolvedJobId = jobId || extractJobIdFromUrl(uploadUrl);
  if (resolvedJobId) {
    await unwrap(
      apiClient.put(`/ocr/jobs/${encodeURIComponent(resolvedJobId)}/upload`, file, {
        headers: { 'Content-Type': file.type },
        signal,
      })
    );
    return;
  }
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    signal,
  });
  if (!res.ok) {
    throw new OcrApiError('UPLOAD_FAILED', 'Upload failed. Please check your connection and try again.', res.status);
  }
};

export const completeOcrJob = (jobId: string): Promise<{ jobId: string; status: string }> =>
  unwrap(apiClient.post(`/ocr/jobs/${encodeURIComponent(jobId)}/complete`));

export const getOcrBatch = (batchId: string): Promise<OcrBatchState> =>
  unwrap<OcrBatchState>(apiClient.get(`/ocr/batches/${encodeURIComponent(batchId)}`));

export const retryOcrJob = (jobId: string): Promise<{ jobId: string; status: string }> =>
  unwrap(apiClient.post(`/ocr/jobs/${encodeURIComponent(jobId)}/retry`));

export const cancelOcrBatch = (batchId: string): Promise<{ batchId: string; status: string }> =>
  unwrap(apiClient.post(`/ocr/batches/${encodeURIComponent(batchId)}/cancel`));

export const checkVehicleAvailability = (
  number: string,
  engine?: string | null,
  chassis?: string | null
): Promise<VehicleAvailability> => {
  const params: Record<string, string> = { number };
  if (engine) params.engine = engine;
  if (chassis) params.chassis = chassis;
  return unwrap<VehicleAvailability>(apiClient.get('/vehicles/availability', { params }));
};

export const checkOcrDuplicates = (
  hplno?: string | null,
  aadhar?: string | null
): Promise<{ hplnoExists: boolean; aadharExists: boolean }> => {
  const params: Record<string, string> = {};
  if (hplno) params.hplno = hplno;
  if (aadhar) params.aadhar = aadhar;
  return unwrap(apiClient.get('/ocr/duplicates', { params }));
};
