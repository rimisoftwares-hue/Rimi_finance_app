// src/hooks/useSpeechPlayback.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechPlaybackOptions {
  onPlaybackError?: (message: string) => void;
}

interface EnqueueBase64ChunkInput {
  turnId: string;
  seq: number;
  audioBase64: string;
  mimeType?: string;
  sampleRate?: number;
}

interface EnqueueBufferInput {
  turnId: string;
  seq: number;
  arrayBuffer: ArrayBuffer;
  mimeType?: string;
  sampleRate?: number;
}

type DecodedSlot =
  | { kind: 'audio'; buffer: AudioBuffer }
  | { kind: 'skip' };

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Synchronous decoder for 16-bit signed LE mono/stereo PCM (`audio/pcm` / `linear16`) and
 * RIFF/WAVE PCM16 buffers.
 *
 * Returns:
 *   - `{ kind: 'audio', buffer }` for valid playable audio frames
 *   - `{ kind: 'skip' }` for header-only (44-byte RIFF with 0 PCM bytes) or empty PCM frames so
 *     sequence numbering never deadlocks
 *   - `null` when input is compressed audio (MP3/Opus/Ogg) that should fall back to `decodeAudioData`
 */
function tryDecodePcm16OrWavSync(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer,
  mimeType = 'audio/pcm',
  fallbackSampleRate = 24000
): DecodedSlot | null {
  const byteLen = arrayBuffer.byteLength;
  if (byteLen === 0) {
    return { kind: 'skip' };
  }

  const view = new DataView(arrayBuffer);
  const isRiffWave =
    byteLen >= 44 &&
    view.getUint32(0, false) === 0x52494646 && // 'RIFF'
    view.getUint32(8, false) === 0x57415645; // 'WAVE'

  if (isRiffWave) {
    let offset = 12;
    let audioFormat = 1;
    let numChannels = 1;
    let sampleRate = fallbackSampleRate;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataBytes = 0;

    while (offset + 8 <= byteLen) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);
      const payloadStart = offset + 8;

      if (chunkId === 0x666d7420 && payloadStart + 16 <= byteLen) {
        audioFormat = view.getUint16(payloadStart, true);
        numChannels = view.getUint16(payloadStart + 2, true);
        sampleRate = view.getUint32(payloadStart + 4, true);
        bitsPerSample = view.getUint16(payloadStart + 14, true);
      } else if (chunkId === 0x64617461) {
        dataOffset = payloadStart;
        dataBytes = Math.min(chunkSize, byteLen - payloadStart);
        break;
      }

      offset = payloadStart + chunkSize + (chunkSize % 2);
    }

    if (dataOffset >= 0 && dataBytes < 2) {
      // Header-only WAV frame — advance sequence cleanly without stalling subsequent chunks
      return { kind: 'skip' };
    }

    if (
      audioFormat === 1 &&
      bitsPerSample === 16 &&
      numChannels >= 1 &&
      dataOffset >= 0 &&
      dataBytes >= 2
    ) {
      const bytesPerFrame = numChannels * 2;
      const frameCount = Math.floor(dataBytes / bytesPerFrame);
      if (frameCount <= 0) {
        return { kind: 'skip' };
      }

      const audioBuf = ctx.createBuffer(numChannels, frameCount, sampleRate || fallbackSampleRate);
      for (let ch = 0; ch < numChannels; ch += 1) {
        const channelOut = audioBuf.getChannelData(ch);
        let readPtr = dataOffset + ch * 2;
        for (let i = 0; i < frameCount; i += 1) {
          channelOut[i] = view.getInt16(readPtr, true) / 32768;
          readPtr += bytesPerFrame;
        }
      }
      return { kind: 'audio', buffer: audioBuf };
    }

    return null;
  }

  const normMime = mimeType.toLowerCase();
  if (normMime.includes('pcm') || normMime.includes('linear16') || normMime.includes('l16')) {
    if (byteLen < 2) {
      return { kind: 'skip' };
    }
    const frameCount = Math.floor(byteLen / 2);
    const audioBuf = ctx.createBuffer(1, frameCount, fallbackSampleRate);
    const channelOut = audioBuf.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      channelOut[i] = view.getInt16(i * 2, true) / 32768;
    }
    return { kind: 'audio', buffer: audioBuf };
  }

  return null;
}

/**
 * Gapless Real-Time WebAudio TTS Queue (24 kHz PCM16 / WAV) + Live Amplitude Analyser (`0..1`).
 * Never swallows decode errors silently: logs non-sensitive diagnostics and notifies UI error callback.
 */
export function useSpeechPlayback(options?: UseSpeechPlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const [muted, setMutedState] = useState(false);

  const onPlaybackErrorRef = useRef(options?.onPlaybackError);
  onPlaybackErrorRef.current = options?.onPlaybackError;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const generationRef = useRef<number>(0);
  const activeTurnIdRef = useRef<string | null>(null);
  const expectedSeqRef = useRef<number>(0);
  const pendingSlotsRef = useRef<Map<number, DecodedSlot>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const mutedRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);

  const reportPlaybackWarning = useCallback((logDetail: string, userMessage?: string) => {
    console.warn(`[AI-Playback] ${logDetail}`);
    if (userMessage && onPlaybackErrorRef.current) {
      onPlaybackErrorRef.current(userMessage);
    }
  }, []);

  const ensureAudioGraph = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      reportPlaybackWarning(
        'WebAudio API unavailable in browser context',
        'Audio playback is not supported on this device.'
      );
      return null;
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;

      const gain = ctx.createGain();
      gain.gain.value = mutedRef.current ? 0 : 1;

      analyser.connect(gain);
      gain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      gainNodeRef.current = gain;
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch((err: unknown) => {
        console.warn(
          '[AI-Playback] AudioContext resume deferred until user gesture:',
          (err as Error)?.name || 'Suspended'
        );
      });
    }
    return audioCtxRef.current;
  }, [reportPlaybackWarning]);

  const stopMeterLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setPlaybackLevel(0);
  }, []);

  const startMeterLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    const sampleBuf = new Uint8Array(256);

    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser || activeSourcesRef.current.size === 0) {
        rafIdRef.current = null;
        setPlaybackLevel(0);
        return;
      }

      analyser.getByteTimeDomainData(sampleBuf);
      let sumSq = 0;
      for (let i = 0; i < sampleBuf.length; i += 1) {
        const norm = (sampleBuf[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / sampleBuf.length);
      const visual = Math.min(1, Math.max(0, rms * 4.2));
      setPlaybackLevel((prev) => prev * 0.35 + visual * 0.65);

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const primeAudioContext = useCallback(() => {
    const ctx = ensureAudioGraph();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => {
        console.warn('[AI-Playback] Gesture resume warning:', (err as Error)?.name || 'Suspended');
      });
    }
  }, [ensureAudioGraph]);

  const stopPlayback = useCallback(() => {
    generationRef.current += 1;
    activeTurnIdRef.current = null;
    expectedSeqRef.current = 0;
    pendingSlotsRef.current.clear();
    nextStartTimeRef.current = 0;

    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop(0);
        src.disconnect();
      } catch {
        // node already finished stopping
      }
    }
    activeSourcesRef.current.clear();
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopMeterLoop();
  }, [stopMeterLoop]);

  const flushSequentialBuffers = useCallback(() => {
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => {
        console.warn('[AI-Playback] Resume during playback failed:', (err as Error)?.name || 'Suspended');
      });
    }

    while (pendingSlotsRef.current.has(expectedSeqRef.current)) {
      const seq = expectedSeqRef.current;
      const slot = pendingSlotsRef.current.get(seq)!;
      pendingSlotsRef.current.delete(seq);
      expectedSeqRef.current += 1;

      if (slot.kind === 'skip') {
        continue;
      }

      const audioBuffer = slot.buffer;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.012, nextStartTimeRef.current);
      nextStartTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
      startMeterLoop();

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        try {
          source.disconnect();
        } catch {
          // already disconnected
        }
        if (activeSourcesRef.current.size === 0 && pendingSlotsRef.current.size === 0) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          stopMeterLoop();
        }
      };

      source.start(startAt);
    }
  }, [startMeterLoop, stopMeterLoop]);

  const enqueueRawAudioBuffer = useCallback(
    async ({
      turnId,
      seq,
      arrayBuffer,
      mimeType = 'audio/pcm',
      sampleRate = 24000,
    }: EnqueueBufferInput) => {
      if (mutedRef.current) return;

      const ctx = ensureAudioGraph();
      if (!ctx) return;

      if (activeTurnIdRef.current !== turnId) {
        activeTurnIdRef.current = turnId;
        expectedSeqRef.current = 0;
        pendingSlotsRef.current.clear();
        nextStartTimeRef.current = 0;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        pendingSlotsRef.current.set(seq, { kind: 'skip' });
        flushSequentialBuffers();
        return;
      }

      const capturedGen = generationRef.current;

      try {
        const syncSlot = tryDecodePcm16OrWavSync(ctx, arrayBuffer, mimeType, sampleRate);
        if (syncSlot) {
          if (generationRef.current !== capturedGen || activeTurnIdRef.current !== turnId) {
            return;
          }
          pendingSlotsRef.current.set(seq, syncSlot);
          flushSequentialBuffers();
          return;
        }

        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (generationRef.current !== capturedGen || activeTurnIdRef.current !== turnId) {
          return;
        }
        pendingSlotsRef.current.set(seq, { kind: 'audio', buffer: decoded });
        flushSequentialBuffers();
      } catch (err: unknown) {
        reportPlaybackWarning(
          `Failed to decode audio chunk seq=${seq} mime=${mimeType} bytes=${arrayBuffer.byteLength} (${(err as Error)?.name || 'DecodeError'})`,
          'Voice audio chunk could not be played cleanly.'
        );
        if (generationRef.current === capturedGen && activeTurnIdRef.current === turnId) {
          pendingSlotsRef.current.set(seq, { kind: 'skip' });
          flushSequentialBuffers();
        }
      }
    },
    [ensureAudioGraph, flushSequentialBuffers, reportPlaybackWarning]
  );

  const enqueueAudioChunk = useCallback(
    async ({ turnId, seq, audioBase64, mimeType, sampleRate }: EnqueueBase64ChunkInput) => {
      if (mutedRef.current) return;
      if (!audioBase64) {
        await enqueueRawAudioBuffer({
          turnId,
          seq,
          arrayBuffer: new ArrayBuffer(0),
          mimeType,
          sampleRate,
        });
        return;
      }
      try {
        const arrayBuffer = base64ToArrayBuffer(audioBase64);
        await enqueueRawAudioBuffer({ turnId, seq, arrayBuffer, mimeType, sampleRate });
      } catch (err: unknown) {
        reportPlaybackWarning(
          `Invalid base64 audio payload on seq=${seq} (${(err as Error)?.name || 'Base64Error'})`,
          'Received corrupted voice audio data.'
        );
      }
    },
    [enqueueRawAudioBuffer, reportPlaybackWarning]
  );

  const setMuted = useCallback(
    (nextMuted: boolean) => {
      mutedRef.current = nextMuted;
      setMutedState(nextMuted);
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setValueAtTime(nextMuted ? 0 : 1, audioCtxRef.current.currentTime);
      }
      if (nextMuted) {
        stopPlayback();
      }
    },
    [stopPlayback]
  );

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch((err: unknown) => {
          console.warn('[AI-Playback] AudioContext close warning:', (err as Error)?.name || 'CloseError');
        });
      }
      audioCtxRef.current = null;
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    isPlayingRef,
    playbackLevel,
    muted,
    setMuted,
    primeAudioContext,
    enqueueAudioChunk,
    enqueueRawAudioBuffer,
    stopPlayback,
  };
}
