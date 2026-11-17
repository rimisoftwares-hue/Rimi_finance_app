// src/components/ai/AIVoiceControls.tsx
import { useState, useRef, KeyboardEvent } from 'react';
import { Mic, MicOff, Send, Square, Check } from 'lucide-react';
import type { AssistantVisualState } from '../../services/aiAssistant.service';

interface AIVoiceControlsProps {
  visualState: AssistantVisualState;
  audioLevel: number;
  isMicActive: boolean;
  isSpeakingUtterance: boolean;
  isAiSpeaking: boolean;
  onSendMessage: (text: string) => void;
  onToggleMic: () => void;
  onCommitUtterance: () => void;
  onInterruptSpeaking: () => void;
}

export function AIVoiceControls({
  visualState,
  audioLevel,
  isMicActive,
  isSpeakingUtterance,
  isAiSpeaking,
  onSendMessage,
  onToggleMic,
  onCommitUtterance,
  onInterruptSpeaking,
}: AIVoiceControlsProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = () => {
    const clean = draft.trim();
    if (!clean) return;
    onSendMessage(clean);
    setDraft('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clampedLevel = Math.min(1, Math.max(0, audioLevel));

  return (
    <div className="px-3 py-2.5 border-t border-border/70 bg-card/95">
      {/* Compact Voice Action Strip only when Mic Active or AI Speaking */}
      {(isMicActive || isAiSpeaking) && (
        <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1 rounded-xl bg-secondary/65 border border-border/60 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isAiSpeaking
                  ? 'bg-sky-500 animate-pulse'
                  : isSpeakingUtterance
                    ? 'bg-cyan-500 animate-ping'
                    : 'bg-emerald-500'
              }`}
            />
            <span className="text-[11px] text-foreground truncate">
              {isAiSpeaking
                ? 'Speaking...'
                : isSpeakingUtterance
                  ? 'Listening — pause to send'
                  : 'Mic active — speak now'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isSpeakingUtterance && (
              <button
                type="button"
                onClick={onCommitUtterance}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors cursor-pointer"
                title="Send speech now"
              >
                <Check className="w-3 h-3" />
                <span>Send</span>
              </button>
            )}

            {isAiSpeaking && (
              <button
                type="button"
                onClick={onInterruptSpeaking}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors cursor-pointer"
                title="Stop voice"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Stop</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input Row: Mic + Auto-Expanding Textarea + Send */}
      <div className="flex items-end gap-2">
        <div className="relative shrink-0">
          {isMicActive && (
            <span
              className="absolute inset-0 rounded-full bg-cyan-500/30 pointer-events-none transition-transform duration-75"
              style={{
                transform: `scale(${1.08 + clampedLevel * 0.4})`,
              }}
            />
          )}
          <button
            type="button"
            onClick={onToggleMic}
            title={isMicActive ? 'Stop Microphone' : 'Speak with AutoFinex AI'}
            aria-label={isMicActive ? 'Stop Microphone' : 'Start Microphone'}
            className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full transition-all cursor-pointer ${
              isMicActive
                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 shadow-md'
                : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border/70'
            }`}
          >
            {isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 88)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask or speak..."
            disabled={visualState === 'thinking' && !draft}
            className="w-full resize-none rounded-xl px-3 py-2 text-[13px] leading-snug bg-secondary/60 dark:bg-secondary/40 border border-border/70 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground max-h-24"
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim()}
          aria-label="Send Message"
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground disabled:opacity-40 disabled:pointer-events-none hover:opacity-95 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
