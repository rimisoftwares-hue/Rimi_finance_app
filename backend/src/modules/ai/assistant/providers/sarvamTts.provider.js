'use strict';

/**
 * Sarvam HTTP Streaming Text-to-Speech Provider (`sarvamTts.provider.js`).
 *
 * Verified live against `sarvamai@1.1.19`:
 *   - Uses the SINGLE globally configured model + speaker in `assistant.config.js`:
 *     `bulbul:v4-flash` + `aarti_hi_customer` (`pace = 1`, `speech_sample_rate = 24000`).
 *   - Uses `client.textToSpeech.convertStream(...)` (`BinaryResponse` consumed via
 *     `for await (const chunk of res.stream())`) for BOTH:
 *       1. Realtime per-clause streaming (`createStreamingTtsTurn`) with bounded parallel
 *          prefetch (`MAX_PREFETCH_IN_FLIGHT = 2`) and strict `seq` emission order.
 *       2. HTTP `/api/ai/assistant/voice/synthesize` fallback (`synthesizeSpeechBuffer`),
 *          returning a clean 44-byte WAV buffer with exact `RIFF` and `data` byte lengths.
 *   - Parses and strips the initial 44-byte streaming RIFF/WAVE header (`0xFFFFFFFF` sizes) once
 *     (even if split across TCP reads), ignores empty/header-only chunks, and carries odd trailing
 *     bytes across TCP chunks so every emitted `audio/pcm` frame has an even byte length.
 */

const { getAssistantConfig, SDK_TTS_LANGUAGES, redactSecrets } = require('../config/assistant.config');
const { sanitizeForTts } = require('../services/ttsSanitizer');
const { getSarvamClient, classifySarvamError } = require('./sarvamClient');

const RIFF_HEADER_BYTES = 44;
const MAX_WAV_HEADER_SCAN_BYTES = 4096;
const MAX_PREFETCH_IN_FLIGHT = 2;
const STREAM_CHUNK_IDLE_TIMEOUT_MS = 10000;
const RETRY_BACKOFF_MS = 80;

let injectedTtsSynthesizeImpl = null;
let injectedConvertStreamImpl = null;

function setTtsSynthesizeImplForTest(fn) {
  injectedTtsSynthesizeImpl = fn;
}

function setConvertStreamImplForTest(fn) {
  injectedConvertStreamImpl = fn;
}

/**
 * Resolves a BCP-47 language code to one supported by Sarvam TTS (`SDK_TTS_LANGUAGES`).
 * Logs a diagnostic line when falling back to `'en-IN'` (unsupported Latin language) or
 * skipping audio (`null`, unsupported non-Latin script such as Arabic/CJK/Cyrillic/Hangul).
 */
function resolveTtsTargetLanguage(languageCode, textSample = '', options = {}) {
  const logger =
    options.logger ||
    (process.env.NODE_ENV === 'test' ? null : console);

  const normalized = String(languageCode || '').trim();
  if (SDK_TTS_LANGUAGES.size === 0) {
    return normalized || 'en-IN';
  }
  if (SDK_TTS_LANGUAGES.has(normalized)) {
    return normalized;
  }
  const base = normalized.split('-')[0].toLowerCase();
  const baseMap = {
    ta: 'ta-IN',
    en: 'en-IN',
    hi: 'hi-IN',
    te: 'te-IN',
    ml: 'ml-IN',
    kn: 'kn-IN',
    mr: 'mr-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    pa: 'pa-IN',
    or: 'od-IN',
    od: 'od-IN',
  };
  if (baseMap[base] && SDK_TTS_LANGUAGES.has(baseMap[base])) {
    return baseMap[base];
  }
  // Non-Indic / non-Latin scripts (Arabic, CJK, Cyrillic, Hangul) skip audio cleanly rather than garble
  if (textSample && /[\u0400-\u06FF\u3040-\u9FFF\uAC00-\uD7AF]/.test(textSample)) {
    if (logger && typeof logger.info === 'function') {
      logger.info(
        `[AI-TTS] Skipping TTS audio for unsupported non-Latin language "${normalized || 'unknown'}"; delivering text reply.`
      );
    }
    return null;
  }
  if (normalized && logger && typeof logger.info === 'function') {
    logger.info(
      `[AI-TTS] Unsupported TTS language "${normalized}"; falling back to "en-IN" for audio.`
    );
  }
  return 'en-IN';
}

function hasWaveRiffSignature(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 12 &&
    buf[0] === 0x52 && // 'R'
    buf[1] === 0x49 && // 'I'
    buf[2] === 0x46 && // 'F'
    buf[3] === 0x46 && // 'F'
    buf[8] === 0x57 && // 'W'
    buf[9] === 0x41 && // 'A'
    buf[10] === 0x56 && // 'V'
    buf[11] === 0x45 // 'E'
  );
}

/**
 * Legacy single-chunk helper retained for compatibility.
 */
function normalizePcm16StreamChunk(rawBuffer, carryByte = null) {
  let payload = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer || []);
  if (payload.length >= RIFF_HEADER_BYTES && hasWaveRiffSignature(payload)) {
    payload = payload.subarray(RIFF_HEADER_BYTES);
  }

  const combined =
    carryByte && carryByte.length > 0 ? Buffer.concat([carryByte, payload]) : payload;

  if (combined.length === 0) {
    return { pcmBuffer: null, carryByte: null };
  }
  if (combined.length === 1) {
    return { pcmBuffer: null, carryByte: Buffer.from(combined) };
  }
  if (combined.length % 2 === 1) {
    const evenLen = combined.length - 1;
    return {
      pcmBuffer: combined.subarray(0, evenLen),
      carryByte: Buffer.from([combined[evenLen]]),
    };
  }
  return {
    pcmBuffer: combined,
    carryByte: null,
  };
}

/**
 * Stateful per-clause PCM16 stream assembler for `convertStream`:
 *   1. Parses & strips the RIFF/WAVE header once (even when split across initial TCP chunks).
 *   2. Extracts `sampleRate` from the `fmt ` subchunk when present.
 *   3. Carries any odd trailing byte across chunks so every emitted `pcmBuffer` has
 *      `pcmBuffer.length > 0 && pcmBuffer.length % 2 === 0`.
 */
function createPcm16StreamAssembler({ defaultSampleRate = 24000 } = {}) {
  let headerHandled = false;
  let headerAccum = Buffer.alloc(0);
  let detectedSampleRate = defaultSampleRate;
  let carryByte = null;

  function emitEvenPcm(rawPcm) {
    const combined =
      carryByte && carryByte.length > 0 ? Buffer.concat([carryByte, rawPcm]) : rawPcm;

    if (combined.length === 0) {
      carryByte = null;
      return null;
    }
    if (combined.length === 1) {
      carryByte = Buffer.from(combined);
      return null;
    }
    if (combined.length % 2 === 1) {
      const evenLen = combined.length - 1;
      carryByte = Buffer.from([combined[evenLen]]);
      return {
        pcmBuffer: Buffer.from(combined.subarray(0, evenLen)),
        sampleRate: detectedSampleRate,
      };
    }
    carryByte = null;
    return {
      pcmBuffer: Buffer.from(combined),
      sampleRate: detectedSampleRate,
    };
  }

  function push(rawChunk) {
    if (!rawChunk || rawChunk.length === 0) return null;
    const buf = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    if (buf.length === 0) return null;

    let pcmPayload = buf;

    if (!headerHandled) {
      headerAccum = headerAccum.length > 0 ? Buffer.concat([headerAccum, buf]) : buf;
      if (headerAccum.length < 12) {
        return null;
      }

      if (hasWaveRiffSignature(headerAccum)) {
        let offset = 12;
        let dataStart = -1;

        while (offset + 8 <= headerAccum.length) {
          const chunkId = headerAccum.toString('ascii', offset, offset + 4);
          const chunkSize = headerAccum.readUInt32LE(offset + 4);
          const payloadStart = offset + 8;

          if (chunkId === 'fmt ') {
            if (payloadStart + 16 > headerAccum.length) {
              return null; // wait for complete `fmt ` subchunk
            }
            const parsedRate = headerAccum.readUInt32LE(payloadStart + 4);
            if (parsedRate >= 8000 && parsedRate <= 96000) {
              detectedSampleRate = parsedRate;
            }
          } else if (chunkId === 'data') {
            dataStart = payloadStart;
            break;
          }

          if (chunkSize === 0xffffffff) {
            break;
          }
          offset = payloadStart + chunkSize + (chunkSize % 2);
        }

        if (dataStart === -1) {
          if (headerAccum.length < MAX_WAV_HEADER_SCAN_BYTES) {
            return null; // wait for `data` subchunk header
          }
          // Defensive cap: treat past 44 bytes as payload if non-standard header
          dataStart = Math.min(RIFF_HEADER_BYTES, headerAccum.length);
        }

        headerHandled = true;
        pcmPayload = headerAccum.subarray(dataStart);
        headerAccum = Buffer.alloc(0);
      } else {
        // Raw headerless PCM (`linear16`)
        headerHandled = true;
        pcmPayload = headerAccum;
        headerAccum = Buffer.alloc(0);
      }
    }

    return emitEvenPcm(pcmPayload);
  }

  function flush() {
    let out = null;
    if (!headerHandled && headerAccum.length > 0) {
      headerHandled = true;
      const pending = headerAccum;
      headerAccum = Buffer.alloc(0);
      if (!hasWaveRiffSignature(pending)) {
        out = emitEvenPcm(pending);
      }
    }
    carryByte = null;
    return out;
  }

  return {
    push,
    flush,
  };
}

/**
 * Wraps raw 16-bit signed LE mono PCM bytes in a standard 44-byte RIFF/WAVE header with
 * exact `RIFF` (`36 + pcmLength`) and `data` (`pcmLength`) sizes.
 */
function buildWavBufferFromPcm16(pcmBuffer, sampleRate = 24000) {
  const pcm = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const evenLen = pcm.length - (pcm.length % 2);
  const cleanPcm = evenLen === pcm.length ? pcm : pcm.subarray(0, evenLen);

  const header = Buffer.alloc(RIFF_HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + cleanPcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM = 1
  header.writeUInt16LE(1, 22); // mono = 1
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byteRate = sampleRate * channels * 2
  header.writeUInt16LE(2, 32); // blockAlign = channels * 2
  header.writeUInt16LE(16, 34); // bitsPerSample = 16
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(cleanPcm.length, 40);

  return Buffer.concat([header, cleanPcm]);
}

async function* iterateBinaryResponse(res) {
  if (!res) return;
  const source = typeof res.stream === 'function' ? res.stream() : res;
  if (!source) return;

  if (typeof source[Symbol.asyncIterator] === 'function') {
    for await (const chunk of source) {
      if (chunk && chunk.length > 0) {
        yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      }
    }
    return;
  }

  if (typeof source.getReader === 'function') {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          yield Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }
}

function isAbortError(err, signal) {
  if (signal?.aborted) return true;
  const name = String(err?.name || '');
  const code = String(err?.code || '');
  return name === 'AbortError' || code === 'ABORT_ERR' || code === 'CLIENT_ABORTED';
}

function buildWrappedTtsError(err) {
  const classified = classifySarvamError(err);
  const safeMessage = redactSecrets(classified.message || 'Voice synthesis failed.');
  const wrapped = new Error(safeMessage);
  wrapped.code = `SARVAM_TTS_${String(classified.category || 'network').toUpperCase()}`;
  wrapped.category = classified.category || 'network';
  wrapped.detail = redactSecrets(classified.detail || '');
  wrapped.statusCode = classified.category === 'quota' ? 429 : 502;
  wrapped.clientSafe = true;
  return wrapped;
}

function isTransientRetryableTtsError(err) {
  const classified = classifySarvamError(err);
  return classified.category === 'network';
}

async function invokeConvertStream(requestBody, requestOptions) {
  if (injectedConvertStreamImpl) {
    return injectedConvertStreamImpl(requestBody, requestOptions);
  }
  const client = getSarvamClient();
  return client.textToSpeech.convertStream(requestBody, requestOptions);
}

/**
 * Streams a single sanitized clause through `convertStream` with 1 retry on transient failure
 * (provided no audio chunk from this clause was already emitted directly to the client).
 */
async function streamSingleClauseWithRetry({
  text,
  targetLang,
  cfg,
  parentSignal,
  onPcmChunk,
  canRetryNow,
  onResetBufferedBeforeRetry,
}) {
  let lastErr = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (parentSignal?.aborted) return;

    if (attempt === 1) {
      if (typeof onResetBufferedBeforeRetry === 'function') {
        onResetBufferedBeforeRetry();
      }
      await new Promise((resolve) => {
        const t = setTimeout(resolve, RETRY_BACKOFF_MS);
        if (typeof t.unref === 'function') t.unref();
      });
      if (parentSignal?.aborted) return;
    }

    const attemptCtrl = new AbortController();
    let timedOut = false;
    let idleTimer = null;

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        attemptCtrl.abort();
      }, STREAM_CHUNK_IDLE_TIMEOUT_MS);
      if (typeof idleTimer.unref === 'function') idleTimer.unref();
    };

    const onParentAbort = () => {
      attemptCtrl.abort();
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        attemptCtrl.abort();
      } else {
        parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    try {
      armIdle();
      const assembler = createPcm16StreamAssembler({
        defaultSampleRate: cfg.ttsSampleRate,
      });

      const response = await invokeConvertStream(
        {
          text,
          target_language_code: targetLang,
          language_code: targetLang,
          speaker: cfg.ttsVoice,
          model: cfg.ttsModel,
          pace: cfg.ttsPace,
          speech_sample_rate: cfg.ttsSampleRate,
          output_audio_codec: 'wav',
        },
        {
          abortSignal: attemptCtrl.signal,
          maxRetries: 0,
        }
      );

      for await (const rawChunk of iterateBinaryResponse(response)) {
        if (parentSignal?.aborted || attemptCtrl.signal.aborted) break;
        armIdle();
        const assembled = assembler.push(rawChunk);
        if (assembled && assembled.pcmBuffer.length > 0) {
          if (parentSignal?.aborted || attemptCtrl.signal.aborted) break;
          onPcmChunk(assembled);
        }
      }

      if (!parentSignal?.aborted && !attemptCtrl.signal.aborted) {
        const tail = assembler.flush();
        if (tail && tail.pcmBuffer.length > 0) {
          onPcmChunk(tail);
        }
      }
      return;
    } catch (err) {
      if (parentSignal?.aborted || (isAbortError(err, parentSignal) && !timedOut)) {
        return;
      }
      lastErr = timedOut ? new Error('Sarvam TTS stream timed out') : err;
      const mayRetry =
        attempt === 0 &&
        !parentSignal?.aborted &&
        (typeof canRetryNow === 'function' ? canRetryNow() : true) &&
        isTransientRetryableTtsError(lastErr);

      if (!mayRetry) {
        throw buildWrappedTtsError(lastErr);
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (parentSignal) {
        parentSignal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  if (lastErr) {
    throw buildWrappedTtsError(lastErr);
  }
}

function createStreamingTtsTurn({
  languageCode,
  signal,
  onAudioChunk,
  onFirstChunk,
  onError,
} = {}) {
  const cfg = getAssistantConfig();
  let seq = 0;
  let aborted = false;
  let firstChunkEmitted = false;

  // Legacy test injection path (preserves deterministic unit tests in `assistant.test.js`)
  if (injectedTtsSynthesizeImpl && !injectedConvertStreamImpl) {
    let chain = Promise.resolve();
    return {
      pushClause(rawClause) {
        if (aborted || signal?.aborted) return;
        const targetLang = resolveTtsTargetLanguage(languageCode, rawClause);
        if (!targetLang) return;
        const cleanText = sanitizeForTts(rawClause, targetLang);
        if (!cleanText) return;

        chain = chain.then(async () => {
          if (aborted || signal?.aborted) return;
          const res = await injectedTtsSynthesizeImpl({
            text: cleanText,
            languageCode: targetLang,
            voice: cfg.ttsVoice,
            ttsModel: cfg.ttsModel,
            signal,
          });
          if (aborted || signal?.aborted || !res?.audioBuffer || res.audioBuffer.length === 0) {
            return;
          }
          if (!firstChunkEmitted) {
            firstChunkEmitted = true;
            if (typeof onFirstChunk === 'function') onFirstChunk();
          }
          if (typeof onAudioChunk === 'function') {
            const currentSeq = seq++;
            onAudioChunk({
              seq: currentSeq,
              audioBuffer: res.audioBuffer,
              audioBase64: res.audioBuffer.toString('base64'),
              mimeType: res.mimeType || 'audio/pcm',
              sampleRate: res.sampleRate || cfg.ttsSampleRate,
            });
          }
        });
      },
      async finish() {
        await chain;
      },
      abort() {
        aborted = true;
      },
    };
  }

  const turnAbortCtrl = new AbortController();
  const clauses = [];
  let activeEmitIndex = 0;
  let inFlightCount = 0;
  let finishCalled = false;
  let fatalError = null;
  let settleFinish = null;
  let rejectFinish = null;

  const finishPromise = new Promise((resolve, reject) => {
    settleFinish = resolve;
    rejectFinish = reject;
  });

  const abortInternal = () => {
    if (aborted) return;
    aborted = true;
    try {
      turnAbortCtrl.abort();
    } catch {
      // ignore
    }
    if (settleFinish) {
      settleFinish();
    }
  };

  if (signal) {
    if (signal.aborted) {
      abortInternal();
    } else {
      signal.addEventListener('abort', abortInternal, { once: true });
    }
  }

  function emitSinglePcmFrame(frame) {
    if (aborted || signal?.aborted || fatalError) return;
    if (!frame?.pcmBuffer || frame.pcmBuffer.length === 0) return;
    if (!firstChunkEmitted) {
      firstChunkEmitted = true;
      if (typeof onFirstChunk === 'function') onFirstChunk();
    }
    if (typeof onAudioChunk === 'function') {
      const currentSeq = seq++;
      onAudioChunk({
        seq: currentSeq,
        audioBuffer: frame.pcmBuffer,
        audioBase64: frame.pcmBuffer.toString('base64'),
        mimeType: 'audio/pcm',
        sampleRate: frame.sampleRate || cfg.ttsSampleRate,
      });
    }
  }

  function checkCompletion() {
    if (aborted) {
      settleFinish();
      return;
    }
    if (fatalError && inFlightCount === 0) {
      if (typeof onError === 'function') {
        settleFinish();
      } else {
        rejectFinish(fatalError);
      }
      return;
    }
    if (finishCalled && inFlightCount === 0 && activeEmitIndex >= clauses.length) {
      settleFinish();
    }
  }

  function drainOrderedOutput() {
    if (aborted || signal?.aborted || fatalError) return;
    while (activeEmitIndex < clauses.length) {
      const current = clauses[activeEmitIndex];
      while (current.bufferedChunks.length > 0 && !aborted && !signal?.aborted && !fatalError) {
        const nextFrame = current.bufferedChunks.shift();
        emitSinglePcmFrame(nextFrame);
      }
      if (aborted || signal?.aborted || fatalError) return;
      if (current.done) {
        activeEmitIndex += 1;
      } else {
        break;
      }
    }
    checkCompletion();
  }

  function pumpQueue() {
    if (aborted || signal?.aborted || fatalError) {
      checkCompletion();
      return;
    }

    for (let i = 0; i < clauses.length; i += 1) {
      if (inFlightCount >= MAX_PREFETCH_IN_FLIGHT) break;
      const entry = clauses[i];
      if (entry.started || entry.done) continue;

      entry.started = true;
      inFlightCount += 1;

      (async () => {
        try {
          await streamSingleClauseWithRetry({
            text: entry.text,
            targetLang: entry.targetLang,
            cfg,
            parentSignal: turnAbortCtrl.signal,
            canRetryNow: () => entry.emittedDirectly === 0,
            onResetBufferedBeforeRetry: () => {
              entry.bufferedChunks.length = 0;
            },
            onPcmChunk: (assembled) => {
              if (aborted || signal?.aborted || fatalError) return;
              if (entry.index === activeEmitIndex && entry.bufferedChunks.length === 0) {
                entry.emittedDirectly += 1;
                emitSinglePcmFrame(assembled);
              } else {
                entry.bufferedChunks.push(assembled);
              }
            },
          });
          entry.done = true;
        } catch (err) {
          entry.done = true;
          if (!aborted && !signal?.aborted && !fatalError) {
            fatalError = err;
            try {
              turnAbortCtrl.abort();
            } catch {
              // ignore
            }
            if (typeof onError === 'function') {
              onError(err);
            }
          }
        } finally {
          inFlightCount -= 1;
          drainOrderedOutput();
          pumpQueue();
          checkCompletion();
        }
      })();
    }

    checkCompletion();
  }

  function pushClause(rawClause) {
    if (aborted || finishCalled || fatalError || signal?.aborted) return;
    const targetLang = resolveTtsTargetLanguage(languageCode, rawClause);
    if (!targetLang) return;

    const cleanText = sanitizeForTts(rawClause, targetLang);
    if (!cleanText) return;

    clauses.push({
      index: clauses.length,
      text: cleanText,
      targetLang,
      started: false,
      done: false,
      emittedDirectly: 0,
      bufferedChunks: [],
    });

    pumpQueue();
  }

  async function finish() {
    finishCalled = true;
    drainOrderedOutput();
    pumpQueue();
    checkCompletion();
    await finishPromise;
  }

  function abort() {
    abortInternal();
  }

  return {
    pushClause,
    finish,
    abort,
  };
}

/**
 * HTTP REST fallback for `/api/ai/assistant/voice/synthesize`.
 * Uses `convertStream` with the single configured `cfg.ttsModel` + `cfg.ttsVoice` (never client overrides)
 * and wraps assembled 16-bit PCM bytes in a standard 44-byte WAV header.
 */
async function synthesizeSpeechBuffer({ text, languageCode, signal } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const cfg = getAssistantConfig();
  const targetLang = resolveTtsTargetLanguage(languageCode, raw);
  if (!targetLang) return null;

  const cleanText = sanitizeForTts(raw, targetLang).slice(0, 2400);
  if (!cleanText) return null;

  if (injectedTtsSynthesizeImpl && !injectedConvertStreamImpl) {
    return injectedTtsSynthesizeImpl({
      text: cleanText,
      languageCode: targetLang,
      voice: cfg.ttsVoice,
      ttsModel: cfg.ttsModel,
      signal,
    });
  }

  const pcmChunks = [];
  let detectedRate = cfg.ttsSampleRate;

  await streamSingleClauseWithRetry({
    text: cleanText,
    targetLang,
    cfg,
    parentSignal: signal,
    canRetryNow: () => true,
    onResetBufferedBeforeRetry: () => {
      pcmChunks.length = 0;
    },
    onPcmChunk: (assembled) => {
      if (assembled?.pcmBuffer?.length > 0) {
        pcmChunks.push(assembled.pcmBuffer);
        if (assembled.sampleRate) detectedRate = assembled.sampleRate;
      }
    },
  });

  if (signal?.aborted || pcmChunks.length === 0) {
    return null;
  }

  const fullPcm = Buffer.concat(pcmChunks);
  if (fullPcm.length === 0) return null;

  return {
    audioBuffer: buildWavBufferFromPcm16(fullPcm, detectedRate),
    mimeType: 'audio/wav',
    sampleRate: detectedRate,
  };
}

module.exports = {
  resolveTtsTargetLanguage,
  normalizePcm16StreamChunk,
  createPcm16StreamAssembler,
  buildWavBufferFromPcm16,
  createStreamingTtsTurn,
  synthesizeSpeechBuffer,
  setTtsSynthesizeImplForTest,
  setConvertStreamImplForTest,
};
