// src/hooks/useRealtimeVoiceSession.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

interface UseRealtimeVoiceSessionOptions {
  /** Ref tracking whether AI TTS audio is currently playing (for higher barge-in VAD threshold) */
  isAiSpeakingRef: MutableRefObject<boolean>;
  /** Whether continuous multi-turn hands-free mode is active */
  handsFree: boolean;
  /** Fired immediately (<130ms) when user speaks over AI TTS playback */
  onBargeIn: () => void;
  /** Fired when VAD detects speech start (sends `audio.start` on WS) */
  onSpeechStart: () => void;
  /** Fired every ~32ms (512 samples @ 16kHz) during an active user utterance */
  onPcmFrame: (pcm16: Int16Array) => void;
  /** Fired when post-speech silence (or manual commit) ends the utterance */
  onSpeechCommit: (allUtteranceFrames: Int16Array[]) => void;
  /** Fired on mic permission or hardware failure */
  onError: (message: string) => void;
  /** Fired when the OS/browser ends the mic track unexpectedly (device unplugged, permission revoked) */
  onMicLost?: () => void;
}

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 512; // 32ms @ 16kHz
export const PRE_ROLL_FRAMES = 12; // ~384ms pre-roll so initial soft syllables are never clipped
export const SPEECH_RMS_THRESHOLD = 0.0085; // sensitive enough for laptop/headset mics without room-noise false triggers
export const SPEECH_SILENCE_FLOOR = 0.0055;
export const BARGE_IN_RMS_THRESHOLD = 0.042;
export const ONSET_CONSECUTIVE_FRAMES = 2; // ~64ms fast speech onset
export const BARGE_IN_CONSECUTIVE_FRAMES = 4; // ~128ms
export const SILENCE_COMMIT_FRAMES = 28; // ~896ms fallback commit (Sarvam server VAD is primary)
export const MIN_VOICED_FRAMES = 5; // ~160ms minimum voiced frames (ignores clicks/coughs)
export const MAX_UTTERANCE_FRAMES = 780; // ~25s safety auto-commit

// Box-filter decimation (averages every input sample inside each 16 kHz output period) gives
// basic anti-aliasing when the device runs at 44.1/48 kHz and ignores the 16 kHz constraint.
const WORKLET_PROCESSOR_CODE = `
class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._outBuf = new Int16Array(${FRAME_SAMPLES});
    this._outIdx = 0;
    this._sumSq = 0;
    this._acc = 0;
    this._accN = 0;
    this._phase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const channel = input[0];
    const ratio = sampleRate / ${TARGET_SAMPLE_RATE};

    for (let i = 0; i < channel.length; i++) {
      this._acc += channel[i] || 0;
      this._accN += 1;
      this._phase += 1;
      if (this._phase >= ratio) {
        this._phase -= ratio;
        const s = Math.max(-1, Math.min(1, this._acc / this._accN));
        this._acc = 0;
        this._accN = 0;
        this._sumSq += s * s;
        this._outBuf[this._outIdx++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        if (this._outIdx >= ${FRAME_SAMPLES}) {
          const rms = Math.sqrt(this._sumSq / ${FRAME_SAMPLES});
          const frameCopy = this._outBuf.slice(0);
          this.port.postMessage({ pcm16: frameCopy, rms }, [frameCopy.buffer]);
          this._outIdx = 0;
          this._sumSq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('autofinex-pcm16-capture', Pcm16CaptureProcessor);
`;

function describeGetUserMediaError(errName: string): string {
  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
    return 'Microphone permission denied. Allow microphone access (browser/OS settings) to use voice chat, or type your question.';
  }
  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    return 'No microphone found on this device.';
  }
  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    return 'The microphone is busy or unavailable (used by another app). Close other apps using it and try again.';
  }
  return 'Could not start microphone capture. Please try again.';
}

export function useRealtimeVoiceSession({
  isAiSpeakingRef,
  handsFree,
  onBargeIn,
  onSpeechStart,
  onPcmFrame,
  onSpeechCommit,
  onError,
  onMicLost,
}: UseRealtimeVoiceSessionOptions) {
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSpeakingUtterance, setIsSpeakingUtterance] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;

  const callbacksRef = useRef({ onBargeIn, onSpeechStart, onPcmFrame, onSpeechCommit, onError, onMicLost });
  callbacksRef.current = { onBargeIn, onSpeechStart, onPcmFrame, onSpeechCommit, onError, onMicLost };

  const streamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const workletBlobUrlRef = useRef<string | null>(null);
  const isMicActiveRef = useRef(false);
  /** Incremented on every stop; an in-flight start whose generation changed aborts itself. */
  const generationRef = useRef(0);
  const startingPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastLevelUpdateRef = useRef(0);

  const preRollRef = useRef<Int16Array[]>([]);
  const utteranceFramesRef = useRef<Int16Array[]>([]);
  const utteranceActiveRef = useRef<boolean>(false);
  const onsetCounterRef = useRef<number>(0);
  const silenceCounterRef = useRef<number>(0);
  const voicedCounterRef = useRef<number>(0);

  const resetVadCounters = useCallback(() => {
    preRollRef.current = [];
    utteranceFramesRef.current = [];
    utteranceActiveRef.current = false;
    onsetCounterRef.current = 0;
    silenceCounterRef.current = 0;
    voicedCounterRef.current = 0;
    setIsSpeakingUtterance(false);
  }, []);

  const releaseCaptureResources = useCallback(() => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {
        // node already disconnected
      }
      if ('port' in workletNodeRef.current) {
        workletNodeRef.current.port.onmessage = null;
      }
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.onended = null;
        try {
          track.stop();
        } catch {
          // track already stopped
        }
      }
      streamRef.current = null;
    }
    if (captureCtxRef.current && captureCtxRef.current.state !== 'closed') {
      captureCtxRef.current.close().catch(() => {
        // context already closing
      });
    }
    captureCtxRef.current = null;
    if (workletBlobUrlRef.current) {
      URL.revokeObjectURL(workletBlobUrlRef.current);
      workletBlobUrlRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    generationRef.current += 1;
    startingPromiseRef.current = null;
    resetVadCounters();
    releaseCaptureResources();
    isMicActiveRef.current = false;
    setMicLevel(0);
    setIsMicActive(false);
  }, [releaseCaptureResources, resetVadCounters]);

  const finishCurrentUtterance = useCallback(() => {
    if (!utteranceActiveRef.current) return;
    const frames = utteranceFramesRef.current;
    const voicedCount = voicedCounterRef.current;

    utteranceFramesRef.current = [];
    preRollRef.current = [];
    utteranceActiveRef.current = false;
    onsetCounterRef.current = 0;
    silenceCounterRef.current = 0;
    voicedCounterRef.current = 0;
    setIsSpeakingUtterance(false);

    if (voicedCount >= MIN_VOICED_FRAMES && frames.length > 0) {
      callbacksRef.current.onSpeechCommit(frames);
    }

    if (!handsFreeRef.current) {
      stopMic();
    }
  }, [stopMic]);

  const handleIncomingFrame = useCallback(
    (pcm16: Int16Array, rms: number) => {
      // Throttle UI level updates to ~15 fps to avoid re-rendering the whole app at 31 fps
      const nowMs = performance.now();
      if (nowMs - lastLevelUpdateRef.current > 66) {
        lastLevelUpdateRef.current = nowMs;
        const visualLevel = Math.min(1, Math.max(0, rms * 8.5));
        setMicLevel((prev) => prev * 0.4 + visualLevel * 0.6);
      }

      const aiCurrentlySpeaking = isAiSpeakingRef.current;

      if (!utteranceActiveRef.current) {
        preRollRef.current.push(pcm16);
        if (preRollRef.current.length > PRE_ROLL_FRAMES) {
          preRollRef.current.shift();
        }

        const requiredThreshold = aiCurrentlySpeaking ? BARGE_IN_RMS_THRESHOLD : SPEECH_RMS_THRESHOLD;
        const requiredFrames = aiCurrentlySpeaking ? BARGE_IN_CONSECUTIVE_FRAMES : ONSET_CONSECUTIVE_FRAMES;

        if (rms >= requiredThreshold) {
          onsetCounterRef.current += 1;
          if (onsetCounterRef.current >= requiredFrames) {
            if (aiCurrentlySpeaking) {
              callbacksRef.current.onBargeIn();
            }
            utteranceActiveRef.current = true;
            onsetCounterRef.current = 0;
            silenceCounterRef.current = 0;
            voicedCounterRef.current = requiredFrames;
            setIsSpeakingUtterance(true);

            callbacksRef.current.onSpeechStart();

            const buffered = preRollRef.current.splice(0, preRollRef.current.length);
            utteranceFramesRef.current = [...buffered];
            for (const preFrame of buffered) {
              callbacksRef.current.onPcmFrame(preFrame);
            }
          }
        } else {
          onsetCounterRef.current = Math.max(0, onsetCounterRef.current - 1);
        }
        return;
      }

      utteranceFramesRef.current.push(pcm16);
      callbacksRef.current.onPcmFrame(pcm16);

      if (rms >= SPEECH_SILENCE_FLOOR) {
        voicedCounterRef.current += 1;
        silenceCounterRef.current = 0;
      } else {
        silenceCounterRef.current += 1;
      }

      if (
        silenceCounterRef.current >= SILENCE_COMMIT_FRAMES ||
        utteranceFramesRef.current.length >= MAX_UTTERANCE_FRAMES
      ) {
        finishCurrentUtterance();
      }
    },
    [finishCurrentUtterance, isAiSpeakingRef]
  );

  const startMicInternal = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    const myGeneration = generationRef.current;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      callbacksRef.current.onError(
        'Microphone access is not available here (needs a secure context such as https://, http://localhost or the desktop app).'
      );
      return false;
    }

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });

      if (generationRef.current !== myGeneration) {
        // stopMic() was called while waiting for permission (e.g. StrictMode unmount)
        for (const t of stream.getTracks()) t.stop();
        return false;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        for (const t of stream.getTracks()) t.stop();
        callbacksRef.current.onError('WebAudio is unavailable on this device.');
        return false;
      }

      ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }

      const source = ctx.createMediaStreamSource(stream);
      const silentSink = ctx.createGain();
      silentSink.gain.value = 0;
      silentSink.connect(ctx.destination);

      let captureNodeConnected = false;
      if (ctx.audioWorklet && typeof Blob !== 'undefined') {
        try {
          const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          workletBlobUrlRef.current = blobUrl;
          await ctx.audioWorklet.addModule(blobUrl);

          const workletNode = new AudioWorkletNode(ctx, 'autofinex-pcm16-capture');
          workletNode.port.onmessage = (ev: MessageEvent<{ pcm16: Int16Array; rms: number }>) => {
            if (ev.data?.pcm16) {
              handleIncomingFrame(ev.data.pcm16, ev.data.rms);
            }
          };
          source.connect(workletNode);
          workletNode.connect(silentSink);
          workletNodeRef.current = workletNode;
          captureNodeConnected = true;
        } catch (workletErr: unknown) {
          // e.g. CSP blocking blob: worklet modules in some WebViews -> ScriptProcessor fallback
          console.warn(
            '[AI-Voice] AudioWorklet unavailable, using ScriptProcessor fallback:',
            (workletErr as Error)?.name || 'WorkletError'
          );
          captureNodeConnected = false;
        }
      }

      if (!captureNodeConnected) {
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        const ratio = ctx.sampleRate / TARGET_SAMPLE_RATE;
        let phase = 0;
        let acc = 0;
        let accN = 0;
        let outBuf = new Int16Array(FRAME_SAMPLES);
        let outIdx = 0;
        let sumSq = 0;

        processor.onaudioprocess = (audioEvent) => {
          const channel = audioEvent.inputBuffer.getChannelData(0);
          for (let i = 0; i < channel.length; i += 1) {
            acc += channel[i] || 0;
            accN += 1;
            phase += 1;
            if (phase >= ratio) {
              phase -= ratio;
              const s = Math.max(-1, Math.min(1, acc / accN));
              acc = 0;
              accN = 0;
              sumSq += s * s;
              outBuf[outIdx++] = s < 0 ? s * 0x8000 : s * 0x7fff;
              if (outIdx >= FRAME_SAMPLES) {
                const rms = Math.sqrt(sumSq / FRAME_SAMPLES);
                handleIncomingFrame(outBuf, rms);
                outBuf = new Int16Array(FRAME_SAMPLES);
                outIdx = 0;
                sumSq = 0;
              }
            }
          }
        };
        source.connect(processor);
        processor.connect(silentSink);
        workletNodeRef.current = processor;
      }

      if (generationRef.current !== myGeneration) {
        for (const t of stream.getTracks()) t.stop();
        ctx.close().catch(() => undefined);
        return false;
      }

      // Detect device unplug / OS permission revocation
      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          if (streamRef.current !== stream) return;
          console.warn('[AI-Voice] Microphone track ended unexpectedly');
          stopMic();
          if (callbacksRef.current.onMicLost) {
            callbacksRef.current.onMicLost();
          } else {
            callbacksRef.current.onError('Microphone disconnected.');
          }
        };
      }

      streamRef.current = stream;
      captureCtxRef.current = ctx;
      resetVadCounters();
      isMicActiveRef.current = true;
      setIsMicActive(true);

      // In single-turn (push-to-talk) mode begin streaming immediately on tap
      if (!handsFreeRef.current) {
        utteranceActiveRef.current = true;
        voicedCounterRef.current = MIN_VOICED_FRAMES;
        setIsSpeakingUtterance(true);
        callbacksRef.current.onSpeechStart();
      }
      return true;
    } catch (err: unknown) {
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => undefined);
      }
      const errName = (err as { name?: string })?.name || '';
      console.warn('[AI-Voice] getUserMedia/capture failed:', errName || 'UnknownError');
      if (generationRef.current === myGeneration) {
        callbacksRef.current.onError(describeGetUserMediaError(errName));
        stopMic();
      }
      return false;
    }
  }, [handleIncomingFrame, resetVadCounters, stopMic]);

  /** Idempotent: concurrent calls (double click / StrictMode) share one in-flight start. */
  const startMic = useCallback((): Promise<boolean> => {
    if (streamRef.current) return Promise.resolve(true);
    if (startingPromiseRef.current) return startingPromiseRef.current;
    const p = startMicInternal().finally(() => {
      if (startingPromiseRef.current === p) startingPromiseRef.current = null;
    });
    startingPromiseRef.current = p;
    return p;
  }, [startMicInternal]);

  const commitUtteranceNow = useCallback(() => {
    if (utteranceActiveRef.current) {
      voicedCounterRef.current = Math.max(voicedCounterRef.current, MIN_VOICED_FRAMES);
      finishCurrentUtterance();
    } else if (!handsFreeRef.current && isMicActiveRef.current) {
      stopMic();
    }
  }, [finishCurrentUtterance, stopMic]);

  /**
   * Called when Sarvam server-side VAD (`END_SPEECH`) committed the utterance first
   * (`transcript.final` / `transcript.empty`), preventing a duplicate client `audio.commit`.
   */
  const notifyServerVadCommitted = useCallback(() => {
    if (!utteranceActiveRef.current) return;
    resetVadCounters();
    if (!handsFreeRef.current) {
      stopMic();
    }
  }, [resetVadCounters, stopMic]);

  // Unmount-only cleanup (stopMic is stable)
  useEffect(() => {
    return () => {
      stopMic();
    };
  }, [stopMic]);

  return {
    isMicActive,
    isMicActiveRef,
    isSpeakingUtterance,
    micLevel,
    startMic,
    stopMic,
    commitUtteranceNow,
    notifyServerVadCommitted,
  };
}
