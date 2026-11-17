// src/components/ai/AIChatPanel.tsx
import { useEffect, useState, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Maximize2,
  Minus,
  Square,
  Check,
  X,
} from 'lucide-react';
import { AIChatHeader } from './AIChatHeader';
import { AIMessageList } from './AIMessageList';
import { AIVoiceControls } from './AIVoiceControls';
import type {
  AssistantChatMessage,
  AssistantVisualState,
} from '../../services/aiAssistant.service';
import type { VoicePhase } from '../../hooks/useAIAssistant';

const VOICE_PHASE_LABEL: Record<VoicePhase, string> = {
  off: '',
  connecting: 'Connecting…',
  listening: 'Listening',
  hearing: 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

export type AssistantViewMode = 'orb' | 'compact' | 'maximized';

interface AIChatPanelProps {
  viewMode: AssistantViewMode;
  anchorPosition: { x: number; y: number };
  orbSize: number;
  messages: AssistantChatMessage[];
  partialTranscript: string;
  visualState: AssistantVisualState;
  audioLevel: number;
  isMicActive: boolean;
  isSpeakingUtterance: boolean;
  isAiSpeaking: boolean;
  ttsMuted: boolean;
  voicePhase?: VoicePhase;
  awaitingReply?: boolean;
  error: string | null;
  onSendMessage: (text: string) => void;
  onToggleMic: () => void;
  onCommitUtterance: () => void;
  onInterruptSpeaking: () => void;
  onToggleTtsMuted: () => void;
  onClearMessages: () => void;
  onClearError: () => void;
  onChangeViewMode: (next: AssistantViewMode) => void;
}

const COMPACT_WIDTH = 324;
const MAXIMIZED_WIDTH = 384;
const MAXIMIZED_HEIGHT = 510;
const VIEWPORT_MARGIN = 14;

function computeCompactAnchorStyle(anchor: { x: number; y: number }, orbSize: number) {
  if (typeof window === 'undefined') {
    return { left: 24, bottom: 24 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(COMPACT_WIDTH, vw - VIEWPORT_MARGIN * 2);

  const orbCenterX = anchor.x + orbSize / 2;
  const placeLeftOfOrb = orbCenterX > vw / 2;

  let left = placeLeftOfOrb
    ? anchor.x - width - 10
    : anchor.x + orbSize + 10;

  left = Math.max(VIEWPORT_MARGIN, Math.min(vw - width - VIEWPORT_MARGIN, left));

  const orbCenterY = anchor.y + orbSize / 2;
  if (orbCenterY >= vh * 0.42) {
    const bottom = Math.max(
      VIEWPORT_MARGIN,
      Math.min(vh - 110, vh - (anchor.y + orbSize))
    );
    return { left, bottom, width };
  }

  const top = Math.max(VIEWPORT_MARGIN + 42, Math.min(vh - 180, anchor.y));
  return { left, top, width };
}

function computeMaximizedCoords(anchor: { x: number; y: number }, orbSize: number) {
  if (typeof window === 'undefined') {
    return { left: 24, top: 80 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const orbCenterX = anchor.x + orbSize / 2;
  const preferLeftOfOrb = orbCenterX > vw / 2;

  let left = preferLeftOfOrb
    ? anchor.x - MAXIMIZED_WIDTH - 12
    : anchor.x + orbSize + 12;

  left = Math.max(VIEWPORT_MARGIN, Math.min(vw - MAXIMIZED_WIDTH - VIEWPORT_MARGIN, left));

  let top = anchor.y + orbSize - MAXIMIZED_HEIGHT;
  if (top < VIEWPORT_MARGIN + 44) {
    top = Math.min(anchor.y, vh - MAXIMIZED_HEIGHT - VIEWPORT_MARGIN);
  }
  top = Math.max(VIEWPORT_MARGIN + 44, Math.min(vh - MAXIMIZED_HEIGHT - VIEWPORT_MARGIN, top));

  return { left, top };
}

export function AIChatPanel({
  viewMode,
  anchorPosition,
  orbSize,
  messages,
  partialTranscript,
  visualState,
  audioLevel,
  isMicActive,
  isSpeakingUtterance,
  isAiSpeaking,
  ttsMuted,
  voicePhase = 'off',
  awaitingReply = false,
  error,
  onSendMessage,
  onToggleMic,
  onCommitUtterance,
  onInterruptSpeaking,
  onToggleTtsMuted,
  onClearMessages,
  onClearError,
  onChangeViewMode,
}: AIChatPanelProps) {
  const [compactDraft, setCompactDraft] = useState('');
  const [dismissedBubbleId, setDismissedBubbleId] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode === 'orb') return;
    const onKeyDown = (ev: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onChangeViewMode('orb');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, onChangeViewMode]);

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  useEffect(() => {
    if (latestAssistantMsg && latestAssistantMsg.streaming) {
      setDismissedBubbleId(null);
    }
  }, [latestAssistantMsg]);

  if (typeof document === 'undefined') return null;

  const handleCompactSend = () => {
    const clean = compactDraft.trim();
    if (!clean) return;
    setDismissedBubbleId(null);
    onSendMessage(clean);
    setCompactDraft('');
  };

  const handleCompactKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCompactSend();
    }
  };

  const clampedLevel = Math.min(1, Math.max(0, audioLevel));
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const showCompactResponseBubble =
    Boolean(partialTranscript) ||
    Boolean(error) ||
    Boolean(latestAssistantMsg && latestAssistantMsg.id !== dismissedBubbleId);

  const compactStyle = computeCompactAnchorStyle(anchorPosition, orbSize);
  const maxCoords = computeMaximizedCoords(anchorPosition, orbSize);

  return createPortal(
    <AnimatePresence mode="wait">
      {/* STATE 2: LIGHTWEIGHT COMPACT FLOATING AGENT BAR + RESPONSE BUBBLE */}
      {viewMode === 'compact' && (
        <motion.div
          key="af-ai-compact"
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 8 }}
          transition={{ type: 'spring', stiffness: 440, damping: 32 }}
          style={compactStyle}
          className="fixed z-[48] flex flex-col gap-2 pointer-events-auto"
        >
          {/* Floating Glass Response Bubble */}
          <AnimatePresence>
            {showCompactResponseBubble && (
              <motion.div
                key="af-ai-compact-bubble"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="relative rounded-2xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-xl px-3.5 py-2.5 text-card-foreground"
              >
                {error ? (
                  <div className="flex items-start justify-between gap-2 text-xs text-destructive">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={onClearError}
                      className="p-0.5 rounded-md hover:bg-destructive/10 shrink-0 cursor-pointer"
                      aria-label="Dismiss error"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : partialTranscript ? (
                  <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-300">
                    <Mic className="w-3.5 h-3.5 animate-pulse shrink-0" />
                    <span className="italic truncate">{partialTranscript}</span>
                  </div>
                ) : latestAssistantMsg ? (
                  <div className="relative pr-4 max-h-36 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setDismissedBubbleId(latestAssistantMsg.id)}
                      title="Hide bubble"
                      aria-label="Hide response bubble"
                      className="absolute top-0 right-0 p-0.5 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {latestAssistantMsg.streaming && !latestAssistantMsg.content.trim() ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.25s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.12s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" />
                      </div>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-[12.5px] leading-relaxed break-words [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_strong]:font-semibold">
                        <ReactMarkdown>{latestAssistantMsg.content}</ReactMarkdown>
                        {latestAssistantMsg.streaming && (
                          <span className="inline-block w-1.5 h-3 ml-1 align-middle rounded-xs bg-sky-500 animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact Floating Control Pill */}
          <div className="rounded-2xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-xl px-3 py-2 text-card-foreground">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold tracking-tight text-foreground truncate">
                  AutoFinex AI
                </span>
                {(visualState !== 'idle' || voicePhase !== 'off') && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-sky-500 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                    {voicePhase !== 'off'
                      ? VOICE_PHASE_LABEL[voicePhase]
                      : visualState === 'listening'
                        ? 'Listening'
                        : visualState === 'thinking' || awaitingReply
                          ? 'Thinking'
                          : 'Speaking'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {isSpeakingUtterance && (
                  <button
                    type="button"
                    onClick={onCommitUtterance}
                    title="Send speech now"
                    className="px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors cursor-pointer mr-0.5 inline-flex items-center gap-0.5"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>Send</span>
                  </button>
                )}

                {isAiSpeaking && (
                  <button
                    type="button"
                    onClick={onInterruptSpeaking}
                    title="Stop speaking"
                    aria-label="Stop speaking"
                    className="p-1 rounded-md text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleTtsMuted}
                  title={ttsMuted ? 'Unmute Voice' : 'Mute Voice'}
                  aria-label={ttsMuted ? 'Unmute Voice' : 'Mute Voice'}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  {ttsMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-destructive" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onChangeViewMode('maximized')}
                  title="Maximize Chat History"
                  aria-label="Maximize Chat Window"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onChangeViewMode('orb')}
                  title="Minimize to Floating Mascot"
                  aria-label="Minimize"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Compact Mic + Input + Send Row */}
            <div className="flex items-center gap-1.5">
              <div className="relative shrink-0">
                {isMicActive && (
                  <span
                    className="absolute inset-0 rounded-full bg-cyan-500/30 pointer-events-none transition-transform duration-75"
                    style={{
                      transform: `scale(${1.08 + clampedLevel * 0.38})`,
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={onToggleMic}
                  title={isMicActive ? 'Stop Microphone' : 'Tap to Speak'}
                  aria-label={isMicActive ? 'Stop Microphone' : 'Tap to Speak'}
                  className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full transition-all cursor-pointer ${
                    isMicActive
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 shadow-md'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border/70'
                  }`}
                >
                  {isMicActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              </div>

              <input
                type="text"
                value={compactDraft}
                onChange={(e) => setCompactDraft(e.target.value)}
                onKeyDown={handleCompactKeyDown}
                placeholder={isMicActive ? 'Listening...' : 'Ask or speak...'}
                className="flex-1 h-9 rounded-xl px-3 text-[12.5px] bg-secondary/60 dark:bg-secondary/40 border border-border/70 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground min-w-0"
              />

              <button
                type="button"
                onClick={handleCompactSend}
                disabled={!compactDraft.trim()}
                title="Send"
                aria-label="Send Message"
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground disabled:opacity-40 disabled:pointer-events-none hover:opacity-95 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* STATE 3: MAXIMIZED FULL SESSION CONVERSATION VIEW */}
      {viewMode === 'maximized' && (
        <>
          {isMobile && (
            <motion.div
              key="af-ai-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onChangeViewMode('orb')}
              className="fixed inset-0 z-[47] bg-black/40 backdrop-blur-[2px] sm:hidden"
            />
          )}

          <motion.section
            key="af-ai-maximized"
            role="dialog"
            aria-label="AutoFinex AI Session Chat"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 410, damping: 32 }}
            style={
              isMobile
                ? undefined
                : {
                    left: maxCoords.left,
                    top: maxCoords.top,
                    width: Math.min(MAXIMIZED_WIDTH, window.innerWidth - 24),
                    height: Math.min(MAXIMIZED_HEIGHT, window.innerHeight - 60),
                  }
            }
            className={
              isMobile
                ? 'fixed inset-x-2 bottom-2 z-[48] h-[80vh] max-h-[600px] flex flex-col rounded-2xl bg-card text-card-foreground border border-border/80 shadow-2xl overflow-hidden'
                : 'fixed z-[48] flex flex-col rounded-2xl bg-card/95 backdrop-blur-xl text-card-foreground border border-border/80 shadow-2xl overflow-hidden'
            }
          >
            <AIChatHeader
              visualState={visualState}
              audioLevel={audioLevel}
              ttsMuted={ttsMuted}
              hasMessages={messages.length > 0}
              onToggleTtsMuted={onToggleTtsMuted}
              onClearMessages={onClearMessages}
              onRestoreCompact={() => onChangeViewMode('compact')}
              onMinimizeToOrb={() => onChangeViewMode('orb')}
            />

            <AIMessageList
              messages={messages}
              partialTranscript={partialTranscript}
              visualState={visualState}
              audioLevel={audioLevel}
              isAiSpeaking={isAiSpeaking}
              error={error}
              onQuickQuestion={(q) => onSendMessage(q)}
              onStartVoiceQuick={onToggleMic}
            />

            <AIVoiceControls
              visualState={visualState}
              audioLevel={audioLevel}
              isMicActive={isMicActive}
              isSpeakingUtterance={isSpeakingUtterance}
              isAiSpeaking={isAiSpeaking}
              onSendMessage={onSendMessage}
              onToggleMic={onToggleMic}
              onCommitUtterance={onCommitUtterance}
              onInterruptSpeaking={onInterruptSpeaking}
            />
          </motion.section>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
