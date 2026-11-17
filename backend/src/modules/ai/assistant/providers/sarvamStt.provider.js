'use strict';

/**
 * Sarvam Streaming & REST Speech-to-Text Provider (`sarvamStt.provider.js`).
 *
 * Verified against `sarvamai@1.1.19` and live subscription:
 *   - Uses `client.speechToTextStreaming.connect({ model: 'saaras:v3', 'language-code': 'unknown',
 *     input_audio_codec: 'pcm_s16le', sample_rate: '16000', vad_signals: 'true', flush_signal: 'true' })`
 *     (`speechToTextRealtimeStreaming` is unauthorized for standard plans).
 *   - Buffers PCM16 frames arriving before `waitForOpen()` resolves and flushes them in order so
 *     initial syllables are never dropped.
 *   - Coalesces small browser PCM frames (~100 ms / 3,200 bytes) and passes base64 audio to
 *     `socket.transcribe({ audio: base64, sample_rate: 16000, encoding: 'audio/wav' })`.
 *   - Surfaces Sarvam server VAD (`START_SPEECH` / `END_SPEECH`) so turns auto-commit cleanly,
 *     while keeping an HTTP fallback (`transcribeAudioBuffer`) for `/voice/transcribe`.
 */

const { getAssistantConfig } = require('../config/assistant.config');
const { getSarvamClient, classifySarvamError } = require('./sarvamClient');

const COALESCE_TARGET_BYTES = 3200; // 100 ms @ 16 kHz 16-bit mono PCM
const COALESCE_INTERVAL_MS = 65;
const MAX_PRE_OPEN_BYTES = 16000 * 2 * 12; // 12s safety cap while connecting
const POST_FLUSH_SETTLE_MS = 220;

let injectedSttImpl = null;

function setSttImplForTest(fn) {
  injectedSttImpl = fn;
}

function mergeTranscriptSegment(segments, nextRaw) {
  const clean = String(nextRaw || '').trim();
  if (!clean) return;
  if (segments.length === 0) {
    segments.push(clean);
    return;
  }
  const prev = segments[segments.length - 1];
  if (clean === prev) return;
  if (clean.startsWith(prev)) {
    segments[segments.length - 1] = clean;
    return;
  }
  segments.push(clean);
}

function createStreamingSttSession({
  onPartialTranscript,
  onVadSpeechStart,
  onVadSpeechEnd,
  onError,
} = {}) {
  if (injectedSttImpl && typeof injectedSttImpl.createStreamingSession === 'function') {
    return injectedSttImpl.createStreamingSession({
      onPartialTranscript,
      onVadSpeechStart,
      onVadSpeechEnd,
      onError,
    });
  }

  const cfg = getAssistantConfig();
  let socket = null;
  let isOpen = false;
  let isClosed = false;
  let commitPromise = null;

  let preOpenChunks = [];
  let preOpenBytes = 0;

  let coalesceChunks = [];
  let coalesceBytes = 0;
  let coalesceTimer = null;

  const transcriptSegments = [];
  let detectedLanguageCode = null;
  let postCommitDataWaiters = [];

  const clearCoalesceTimer = () => {
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
  };

  const sendTranscribedChunk = (pcmBuf) => {
    if (!socket || !isOpen || isClosed || !pcmBuf || pcmBuf.length === 0) return;
    try {
      socket.transcribe({
        audio: pcmBuf.toString('base64'),
        sample_rate: 16000,
        encoding: 'audio/wav',
      });
    } catch (err) {
      const classified = classifySarvamError(err);
      if (typeof onError === 'function') {
        onError(Object.assign(new Error(classified.message), { category: classified.category }));
      }
    }
  };

  const flushCoalescedNow = () => {
    clearCoalesceTimer();
    if (coalesceBytes === 0 || !isOpen || isClosed) return;
    const merged =
      coalesceChunks.length === 1 ? coalesceChunks[0] : Buffer.concat(coalesceChunks, coalesceBytes);
    coalesceChunks = [];
    coalesceBytes = 0;
    sendTranscribedChunk(merged);
  };

  const notifyPostCommitWaiters = () => {
    for (const fn of postCommitDataWaiters) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
  };

  const closeSocketQuietly = () => {
    if (isClosed) return;
    isClosed = true;
    isOpen = false;
    clearCoalesceTimer();
    preOpenChunks = [];
    preOpenBytes = 0;
    coalesceChunks = [];
    coalesceBytes = 0;
    if (socket) {
      const s = socket;
      socket = null;
      try {
        s.close();
      } catch {
        // ignore close error
      }
    }
  };

  const openPromise = (async () => {
    try {
      const client = getSarvamClient();
      const ws = await client.speechToTextStreaming.connect({
        model: cfg.sttModel,
        'language-code': 'unknown',
        input_audio_codec: 'pcm_s16le',
        sample_rate: '16000',
        vad_signals: 'true',
        flush_signal: 'true',
        reconnectAttempts: 0,
      });

      if (isClosed) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        return null;
      }

      socket = ws;

      ws.on('message', (msg) => {
        if (isClosed || !msg || typeof msg !== 'object') return;

        if (msg.type === 'events') {
          const sig = msg.data?.signal_type || msg.signal_type;
          if (sig === 'START_SPEECH' && typeof onVadSpeechStart === 'function') {
            onVadSpeechStart();
          } else if (sig === 'END_SPEECH' && typeof onVadSpeechEnd === 'function') {
            onVadSpeechEnd();
          }
          return;
        }

        if (msg.type === 'data') {
          const dataObj = msg.data || msg;
          const segText = String(dataObj.transcript || '').trim();
          const lang = dataObj.language_code ? String(dataObj.language_code).trim() : null;
          if (lang && lang !== 'unknown') {
            detectedLanguageCode = lang;
          }
          if (segText) {
            mergeTranscriptSegment(transcriptSegments, segText);
            if (typeof onPartialTranscript === 'function') {
              onPartialTranscript({
                text: transcriptSegments.join(' ').trim(),
                languageCode: detectedLanguageCode,
              });
            }
          }
          notifyPostCommitWaiters();
          return;
        }

        if (msg.type === 'error') {
          const errMsg = msg.data?.message || msg.data?.error || msg.message || 'STT stream error';
          const classified = classifySarvamError(new Error(errMsg));
          if (typeof onError === 'function') {
            onError(Object.assign(new Error(classified.message), { category: classified.category }));
          }
          notifyPostCommitWaiters();
        }
      });

      ws.on('error', (err) => {
        if (isClosed) return;
        const classified = classifySarvamError(err);
        if (typeof onError === 'function') {
          onError(Object.assign(new Error(classified.message), { category: classified.category }));
        }
        notifyPostCommitWaiters();
      });

      ws.on('close', () => {
        isOpen = false;
        notifyPostCommitWaiters();
      });

      await ws.waitForOpen();
      if (isClosed) {
        closeSocketQuietly();
        return null;
      }

      isOpen = true;

      if (preOpenBytes > 0) {
        const allPreOpen = Buffer.concat(preOpenChunks, preOpenBytes);
        preOpenChunks = [];
        preOpenBytes = 0;
        for (let offset = 0; offset < allPreOpen.length; offset += COALESCE_TARGET_BYTES) {
          sendTranscribedChunk(allPreOpen.subarray(offset, offset + COALESCE_TARGET_BYTES));
        }
      }

      return ws;
    } catch (err) {
      const classified = classifySarvamError(err);
      if (!isClosed && typeof onError === 'function') {
        onError(Object.assign(new Error(classified.message), { category: classified.category }));
      }
      closeSocketQuietly();
      return null;
    }
  })();

  function pushPcmFrame(frameBuffer) {
    if (isClosed || commitPromise) return;
    const buf = Buffer.isBuffer(frameBuffer) ? frameBuffer : Buffer.from(frameBuffer);
    if (buf.length === 0) return;

    if (!isOpen) {
      if (preOpenBytes + buf.length <= MAX_PRE_OPEN_BYTES) {
        preOpenChunks.push(buf);
        preOpenBytes += buf.length;
      }
      return;
    }

    coalesceChunks.push(buf);
    coalesceBytes += buf.length;

    if (coalesceBytes >= COALESCE_TARGET_BYTES) {
      flushCoalescedNow();
    } else if (!coalesceTimer) {
      coalesceTimer = setTimeout(flushCoalescedNow, COALESCE_INTERVAL_MS);
    }
  }

  function commit({ timeoutMs = 2600 } = {}) {
    if (commitPromise) return commitPromise;

    commitPromise = (async () => {
      try {
        await Promise.race([
          openPromise,
          new Promise((resolve) => setTimeout(resolve, 1800)),
        ]);

        if (isOpen && socket && !isClosed) {
          flushCoalescedNow();
          try {
            socket.flush();
          } catch {
            // ignore flush error if socket closed concurrently
          }

          await new Promise((resolve) => {
            let settled = false;
            let settleTimer = null;
            const maxTimer = setTimeout(() => {
              finishWait();
            }, timeoutMs);

            const finishWait = () => {
              if (settled) return;
              settled = true;
              clearTimeout(maxTimer);
              if (settleTimer) clearTimeout(settleTimer);
              postCommitDataWaiters = postCommitDataWaiters.filter((w) => w !== onData);
              resolve();
            };

            const onData = () => {
              if (settleTimer) clearTimeout(settleTimer);
              settleTimer = setTimeout(finishWait, POST_FLUSH_SETTLE_MS);
            };

            postCommitDataWaiters.push(onData);

            if (transcriptSegments.length > 0) {
              settleTimer = setTimeout(finishWait, 320);
            }
          });
        }
      } finally {
        closeSocketQuietly();
      }

      return {
        text: transcriptSegments.join(' ').trim(),
        languageCode: detectedLanguageCode,
      };
    })();

    return commitPromise;
  }

  function abort() {
    closeSocketQuietly();
  }

  return {
    pushPcmFrame,
    commit,
    abort,
    close: closeSocketQuietly,
  };
}

async function transcribeAudioBuffer(
  audioBuffer,
  { mimeType = 'audio/wav', languageHint = 'unknown' } = {}
) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return { text: '', languageCode: null };
  }

  if (injectedSttImpl && typeof injectedSttImpl.transcribeAudioBuffer === 'function') {
    return injectedSttImpl.transcribeAudioBuffer(audioBuffer, { mimeType, languageHint });
  }

  const cfg = getAssistantConfig();
  try {
    const client = getSarvamClient();
    const res = await client.speechToText.transcribe({
      file: {
        data: audioBuffer,
        filename: 'utterance.wav',
        contentType: mimeType || 'audio/wav',
      },
      model: cfg.sttModel,
      language_code: languageHint || 'unknown',
    });

    return {
      text: String(res?.transcript || '').trim(),
      languageCode: res?.language_code && res.language_code !== 'unknown' ? res.language_code : null,
    };
  } catch (err) {
    const classified = classifySarvamError(err);
    const wrapped = new Error(classified.message);
    wrapped.code = `SARVAM_STT_${classified.category.toUpperCase()}`;
    wrapped.category = classified.category;
    wrapped.statusCode = classified.category === 'quota' ? 429 : 502;
    throw wrapped;
  }
}

module.exports = {
  createStreamingSttSession,
  transcribeAudioBuffer,
  setSttImplForTest,
};

