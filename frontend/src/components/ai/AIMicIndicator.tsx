// src/components/ai/AIMicIndicator.tsx
import { createPortal } from 'react-dom';
import { Mic, Square, Info, X } from 'lucide-react';
import type { VoicePhase } from '../../hooks/useAIAssistant';

interface AIMicIndicatorProps {
  voicePhase: VoicePhase;
  audioLevel: number;
  notice: string | null;
  micNoticeVisible: boolean;
  onStop: () => void;
  onOpen: () => void;
  onAcknowledgeNotice: () => void;
  onDismissNotice: () => void;
}

const PHASE_LABEL: Record<VoicePhase, string> = {
  off: '',
  connecting: 'Connecting…',
  listening: 'Listening',
  hearing: 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

/**
 * Always-visible privacy indicator for the always-on microphone. Rendered at app level, so it
 * stays on screen while the chat panel is minimised or the user is on another page.
 */
export function AIMicIndicator({
  voicePhase,
  audioLevel,
  notice,
  micNoticeVisible,
  onStop,
  onOpen,
  onAcknowledgeNotice,
  onDismissNotice,
}: AIMicIndicatorProps) {
  if (typeof document === 'undefined') return null;
  const active = voicePhase !== 'off';
  if (!active && !notice) return null;
  const level = Math.min(1, Math.max(0, audioLevel));

  return createPortal(
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {active && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`AutoFinex AI microphone is on: ${PHASE_LABEL[voicePhase]}`}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-card/95 backdrop-blur-xl border border-border/80 shadow-lg pl-2 pr-1 py-1 text-card-foreground"
        >
          <button
            type="button"
            onClick={onOpen}
            title="Open AutoFinex AI"
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-red-500/15">
              <span
                className="absolute inset-0 rounded-full bg-red-500/30 transition-transform duration-75"
                style={{ transform: `scale(${1 + level * 0.45})` }}
              />
              <Mic className="relative w-3.5 h-3.5 text-red-600" />
            </span>
            <span className="text-[11.5px] font-semibold whitespace-nowrap">
              Mic on · {PHASE_LABEL[voicePhase]}
            </span>
          </button>
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop Microphone"
            title="Stop microphone"
            className="flex items-center gap-1 rounded-full bg-destructive text-destructive-foreground px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            Stop
          </button>
        </div>
      )}

      {active && micNoticeVisible && (
        <div className="pointer-events-auto max-w-sm flex items-start gap-2 rounded-xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-lg px-3 py-2 text-[11.5px] text-card-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-500" />
          <span>
            The microphone stays on — even when the chat is minimised or you open another page — until you press{' '}
            <b>Stop</b>. It turns off automatically after 5 minutes of silence, on logout or when you switch company.
            Audio and transcripts are never stored.
          </span>
          <button
            type="button"
            onClick={onAcknowledgeNotice}
            className="shrink-0 rounded-md px-1.5 py-0.5 bg-primary text-primary-foreground text-[10.5px] font-semibold cursor-pointer"
          >
            Got it
          </button>
        </div>
      )}

      {!active && notice && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-card/95 backdrop-blur-xl border border-border/80 shadow-lg px-3 py-1 text-[11.5px] text-card-foreground">
          <Info className="w-3.5 h-3.5 text-sky-500" />
          <span>{notice}</span>
          <button type="button" onClick={onDismissNotice} aria-label="Dismiss notice" className="cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

