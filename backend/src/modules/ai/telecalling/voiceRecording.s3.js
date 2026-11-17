'use strict';

/**
 * S3 Presigning & Least-Privilege Voice Recording Key Helpers for AutoFinex Lead Calling.
 *
 * Responsibilities:
 * 1. Short-lived (`900s`) presigned `GetObject` URLs for customer KYC photos (`kyc_documents.file_path`)
 *    on the current paginated lead page (`<= 25` rows).
 * 2. Short-lived (`300s`) presigned `GetObject` URLs for call recording playback (`voice-recordings/...`),
 *    strictly enforcing prefix and tenant isolation before signing.
 * 3. Deterministic S3 key builder (`voice-recordings/{finance_id}/{yyyy}/{mm}/{dd}/{customer_id}/{call_id}.wav`)
 *    matching PostgreSQL `chk_atcl_recording_s3_prefix` (`^voice-recordings/[^/]+/[0-9]{4}/[0-9]{2}/[0-9]{2}/.+`).
 * 4. Least-privilege IAM policy generator (`s3:PutObject` ONLY on `voice-recordings/*` for the Voice Agent).
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const RECORDING_PREFIX_REGEX = /^voice-recordings\/[0-9a-fA-F-]{36}\/\d{4}\/\d{2}\/\d{2}\/[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]+\.(wav|mp3|ogg|webm|m4a)$/;

let cachedS3Client = null;
let cachedS3ConfigSig = null;

function resolveS3Config() {
  const bucketName = String(
    process.env.BUCKET_NAME || process.env.AWS_S3_BUCKET || ''
  ).trim();
  const region = String(
    process.env.BUCKET_REGION || process.env.AWS_REGION || ''
  ).trim();
  const accessKeyId = String(
    process.env.ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || ''
  ).trim();
  const secretAccessKey = String(
    process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || ''
  ).trim();

  if (!bucketName || !region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucketName,
    region,
    accessKeyId,
    secretAccessKey,
  };
}

function getS3Client() {
  const cfg = resolveS3Config();
  if (!cfg) return null;

  const sig = `${cfg.bucketName}:${cfg.region}:${cfg.accessKeyId.slice(0, 4)}`;
  if (!cachedS3Client || cachedS3ConfigSig !== sig) {
    cachedS3Client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    cachedS3ConfigSig = sig;
  }

  return { client: cachedS3Client, bucketName: cfg.bucketName };
}

/**
 * Extracts a safe relative S3 object key for a customer KYC/vehicle photo from either:
 *   - a relative key (`customers/1792425187560-878839104.jpg`), or
 *   - a same-bucket S3 HTTP/HTTPS URL stored by `uploadToS3` (`https://<bucket>.s3.<region>.amazonaws.com/<key>`
 *     or path-style `https://s3.<region>.amazonaws.com/<bucket>/<key>`).
 *
 * Rejects foreign buckets, non-S3 HTTP URLs, path traversal (`..`), and `voice-recordings/*` keys.
 */
function extractCustomerPhotoS3Key(filePath, bucketName) {
  const raw = String(filePath || '').trim();
  const cleanBucket = String(bucketName || '').trim();
  if (!raw || !cleanBucket) return null;

  // Reject raw or URL-encoded path traversal / backslashes / null bytes BEFORE WHATWG URL path normalization
  if (
    raw.includes('..') ||
    raw.includes('\\') ||
    raw.includes('\0') ||
    /%2e/i.test(raw) ||
    /%5c/i.test(raw) ||
    /%2f%2f/i.test(raw) ||
    /%00/i.test(raw)
  ) {
    return null;
  }

  let candidateKey = null;

  if (/^https?:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_err) {
      return null;
    }

    if (parsed.pathname.includes('//')) {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    const bucketLower = cleanBucket.toLowerCase();
    const isVirtualHostedBucket =
      host === `${bucketLower}.s3.amazonaws.com` ||
      (host.startsWith(`${bucketLower}.s3.`) && host.endsWith('.amazonaws.com')) ||
      (host.startsWith(`${bucketLower}.s3-`) && host.endsWith('.amazonaws.com'));

    if (isVirtualHostedBucket) {
      try {
        candidateKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      } catch (_err) {
        return null;
      }
    } else if (
      host === 's3.amazonaws.com' ||
      /^s3[.-][a-z0-9.-]+\.amazonaws\.com$/i.test(host)
    ) {
      const trimmedPath = parsed.pathname.replace(/^\/+/, '');
      const bucketPrefix = `${cleanBucket}/`;
      if (!trimmedPath.toLowerCase().startsWith(bucketPrefix.toLowerCase())) {
        return null;
      }
      try {
        candidateKey = decodeURIComponent(trimmedPath.slice(bucketPrefix.length));
      } catch (_err) {
        return null;
      }
    } else {
      return null;
    }
  } else {
    try {
      candidateKey = decodeURIComponent(raw.replace(/^\/+/, ''));
    } catch (_err) {
      candidateKey = raw.replace(/^\/+/, '');
    }
  }

  if (
    !candidateKey ||
    !candidateKey.includes('/') ||
    candidateKey.includes('..') ||
    candidateKey.includes('//') ||
    candidateKey.includes('\\') ||
    candidateKey.includes('\0') ||
    candidateKey.toLowerCase().startsWith('voice-recordings/')
  ) {
    return null;
  }

  return candidateKey;
}

/**
 * Generates a short-lived presigned URL for a customer's KYC photo (`kyc_documents.file_path`).
 * Never throws on missing S3 config or invalid key; returns `null` so lead listing stays resilient.
 */
async function presignCustomerPhoto(filePath, expiresInSeconds = 900, opts = {}) {
  const raw = String(filePath || '').trim();
  if (!raw) return null;

  const s3 = typeof opts.presignFn === 'function' ? null : getS3Client();
  const effectiveBucket =
    opts.bucketName ||
    (s3 ? s3.bucketName : String(process.env.BUCKET_NAME || process.env.AWS_S3_BUCKET || '').trim());

  const objectKey = extractCustomerPhotoS3Key(raw, effectiveBucket);
  if (!objectKey) return null;

  if (typeof opts.presignFn === 'function') {
    return opts.presignFn(objectKey, expiresInSeconds);
  }

  if (!s3) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: s3.bucketName,
      Key: objectKey,
    });
    return await getSignedUrl(s3.client, command, { expiresIn: expiresInSeconds });
  } catch (_err) {
    return null;
  }
}

/**
 * Validates that a recording S3 key strictly starts with `voice-recordings/{financeId}/YYYY/MM/DD/...`
 * and belongs to the authenticated `financeId`.
 */
function validateRecordingS3Key(recordingS3Key, financeId = null) {
  const key = String(recordingS3Key || '').trim();
  if (!key || key.includes('..') || key.includes('//')) {
    return { valid: false, reason: 'invalid_recording_s3_key' };
  }
  if (!RECORDING_PREFIX_REGEX.test(key)) {
    return { valid: false, reason: 'recording_key_prefix_violation' };
  }
  if (financeId) {
    const expectedPrefix = `voice-recordings/${String(financeId).trim()}/`;
    if (!key.startsWith(expectedPrefix)) {
      return { valid: false, reason: 'cross_tenant_recording_key_mismatch' };
    }
  }
  return { valid: true, reason: null, key };
}

/**
 * Generates a 300-second presigned playback URL for a verified tenant call recording.
 */
async function presignCallRecordingPlayback(
  recordingS3Key,
  { financeId = null, expiresInSeconds = 300, presignFn = null } = {}
) {
  const check = validateRecordingS3Key(recordingS3Key, financeId);
  if (!check.valid) {
    const err = new Error(`Invalid call recording key: ${check.reason}`);
    err.statusCode = 400;
    throw err;
  }

  if (typeof presignFn === 'function') {
    const url = await presignFn(check.key, expiresInSeconds);
    return {
      playbackUrl: url,
      expiresInSeconds,
      recordingS3Key: check.key,
    };
  }

  const s3 = getS3Client();
  if (!s3) {
    const err = new Error('S3 storage is not configured for recording playback');
    err.statusCode = 503;
    throw err;
  }

  const command = new GetObjectCommand({
    Bucket: s3.bucketName,
    Key: check.key,
    ResponseContentType: 'audio/wav',
  });

  const playbackUrl = await getSignedUrl(s3.client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    playbackUrl,
    expiresInSeconds,
    recordingS3Key: check.key,
  };
}

/**
 * Builds a deterministic S3 key matching `chk_atcl_recording_s3_prefix`:
 * `voice-recordings/{finance_id}/{yyyy}/{mm}/{dd}/{customer_id}/{call_id}.wav`
 */
function buildVoiceRecordingS3Key({ financeId, customerId, callId, startedAt = new Date() }) {
  const dt = startedAt instanceof Date && !Number.isNaN(startedAt.getTime()) ? startedAt : new Date();
  const yyyy = String(dt.getUTCFullYear());
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `voice-recordings/${String(financeId).trim()}/${yyyy}/${mm}/${dd}/${String(customerId).trim()}/${String(callId).trim()}.wav`;
}

/**
 * Least-privilege IAM policy for the Python Voice Agent S3 uploader:
 * allows `s3:PutObject` ONLY on `arn:aws:s3:::${bucketName}/voice-recordings/*`.
 */
function buildVoiceRecordingPutOnlyIamPolicy(bucketName = process.env.BUCKET_NAME || 'autofinex-media') {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AutoFinexVoiceAgentPutRecordingsOnly',
        Effect: 'Allow',
        Action: ['s3:PutObject'],
        Resource: [`arn:aws:s3:::${bucketName}/voice-recordings/*`],
      },
    ],
  };
}

module.exports = {
  extractSameBucketObjectKey: extractCustomerPhotoS3Key,
  extractCustomerPhotoS3Key,
  presignCustomerPhoto,
  validateRecordingS3Key,
  presignCallRecordingPlayback,
  buildVoiceRecordingS3Key,
  buildVoiceRecordingPutOnlyIamPolicy,
};

