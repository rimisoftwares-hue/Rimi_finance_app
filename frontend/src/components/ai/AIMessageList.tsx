// src/components/ai/AIMessageList.tsx
import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';
import { AIBotMascot } from './AIBotMascot';
import { AIMessageBubble } from './AIMessageBubble';
import type {
  AssistantChatMessage,
  AssistantVisualState,
} from '../../services/aiAssistant.service';

interface AIMessageListProps {
  messages: AssistantChatMessage[];
  partialTranscript: string;
  visualState: AssistantVisualState;
  audioLevel: number;
  isAiSpeaking: boolean;
  error: string | null;
  onQuickQuestion: (question: string) => void;
  onStartVoiceQuick: () => void;
}

const QUICK_PROMPTS = [
  {
    label: 'இன்றைய வசூல் எவ்வளவு?',
    prompt: 'இன்னைக்கு மொத்தம் எவ்வளவு collection வந்திருக்கு?',
  },
  {
    label: "Today's Overview",
    prompt: 'Give me a quick overview of active loans, pending dues, and today collection.',
  },
  {
    label: 'Overdue & Pending',
    prompt: 'எத்தனை கஸ்டமர்ஸ் overdue-ல இருக்காங்க? மொத்த pending எவ்வளவு?',
  },
  {
    label: 'Top Agent Collection',
    prompt: 'இந்த மாசம் எந்த agent அதிகமா collection பண்ணிருக்காங்க?',
  },
];

export function AIMessageList({
  messages,
  partialTranscript,
  visualState,
  audioLevel,
  isAiSpeaking,
  error,
  onQuickQuestion,
  onStartVoiceQuick,
}: AIMessageListProps) {
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, partialTranscript, error]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 scroll-smooth">
      {messages.length === 0 && !partialTranscript ? (
        <div className="flex flex-col items-center text-center pt-5 pb-2 px-2">
          <button
            type="button"
            onClick={onStartVoiceQuick}
            className="group relative rounded-full p-1 transition-transform active:scale-95 focus:outline-none cursor-pointer"
            title="Tap to speak"
          >
            <div className="pointer-events-none">
              <AIBotMascot state={visualState} audioLevel={audioLevel} size={76} />
            </div>
          </button>

          <h3 className="text-sm font-semibold text-foreground mt-1.5">
            How can I help you?
          </h3>

          <div className="w-full mt-4 grid grid-cols-1 gap-1.5">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onQuickQuestion(item.prompt)}
                className="text-left px-3 py-2 rounded-xl text-xs font-medium bg-secondary/60 hover:bg-secondary border border-border/60 hover:border-primary/35 text-foreground transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] text-primary shrink-0">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <AIMessageBubble
              key={msg.id}
              message={msg}
              isActivelySpeaking={isAiSpeaking && msg.id === lastAssistantId}
              audioLevel={audioLevel}
            />
          ))}

          {partialTranscript && (
            <div className="flex justify-end items-end gap-2">
              <div className="max-w-[84%] rounded-2xl rounded-br-sm px-3.5 py-2 bg-cyan-500/15 border border-cyan-500/35 text-foreground">
                <div className="flex items-center gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-300 font-medium mb-0.5">
                  <Mic className="w-3 h-3 animate-pulse" />
                  <span>Listening...</span>
                </div>
                <p className="text-[13px] italic opacity-90">{partialTranscript}</p>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="rounded-xl px-3 py-2 text-xs bg-destructive/10 border border-destructive/25 text-destructive">
          {error}
        </div>
      )}

      <div ref={bottomAnchorRef} />
    </div>
  );
}
