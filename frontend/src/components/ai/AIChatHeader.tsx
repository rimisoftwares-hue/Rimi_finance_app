// src/components/ai/AIChatHeader.tsx
import {
  Volume2,
  VolumeX,
  Minus,
  Minimize2,
  Trash2,
} from 'lucide-react';
import { AIBotMascot } from './AIBotMascot';
import type { AssistantVisualState } from '../../services/aiAssistant.service';

interface AIChatHeaderProps {
  visualState: AssistantVisualState;
  audioLevel: number;
  ttsMuted: boolean;
  hasMessages: boolean;
  onToggleTtsMuted: () => void;
  onClearMessages: () => void;
  onRestoreCompact: () => void;
  onMinimizeToOrb: () => void;
}

const ACTIVE_STATE_TEXT: Partial<Record<AssistantVisualState, string>> = {
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

export function AIChatHeader({
  visualState,
  audioLevel,
  ttsMuted,
  hasMessages,
  onToggleTtsMuted,
  onClearMessages,
  onRestoreCompact,
  onMinimizeToOrb,
}: AIChatHeaderProps) {
  const liveLabel = ACTIVE_STATE_TEXT[visualState];

  return (
    <div className="relative border-b border-border/70 bg-card/95">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        {/* Left: Mascot + Clean Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 -ml-0.5">
            <AIBotMascot state={visualState} audioLevel={audioLevel} size={32} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">
              AutoFinex AI
            </h2>
            {liveLabel && (
              <p className="text-[11px] text-sky-500 font-medium leading-none mt-0.5">
                {liveLabel}
              </p>
            )}
          </div>
        </div>

        {/* Right: Mute, Clear, Compact, Minimize */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTtsMuted}
            title={ttsMuted ? 'Unmute Voice' : 'Mute Voice'}
            aria-label={ttsMuted ? 'Unmute Voice' : 'Mute Voice'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            {ttsMuted ? (
              <VolumeX className="w-4 h-4 text-destructive" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          {hasMessages && (
            <button
              type="button"
              onClick={onClearMessages}
              title="Clear session messages"
              aria-label="Clear session messages"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onRestoreCompact}
            title="Switch to Compact Floating Mode"
            aria-label="Switch to Compact Floating Mode"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onMinimizeToOrb}
            title="Minimize to Floating Mascot"
            aria-label="Minimize to Floating Mascot"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
