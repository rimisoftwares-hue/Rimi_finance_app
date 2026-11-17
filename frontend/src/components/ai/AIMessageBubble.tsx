// src/components/ai/AIMessageBubble.tsx
import ReactMarkdown from 'react-markdown';
import { Mic } from 'lucide-react';
import { AIBotMascot } from './AIBotMascot';
import type { AssistantChatMessage } from '../../services/aiAssistant.service';

interface AIMessageBubbleProps {
  message: AssistantChatMessage;
  isActivelySpeaking?: boolean;
  audioLevel?: number;
}

export function AIMessageBubble({
  message,
  isActivelySpeaking = false,
  audioLevel = 0,
}: AIMessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end items-end gap-2">
        <div className="max-w-[84%] rounded-2xl rounded-br-sm px-3.5 py-2 bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-xs">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
          {message.viaVoice && (
            <div className="flex items-center justify-end gap-1 mt-0.5 opacity-75 text-[10px]">
              <Mic className="w-2.5 h-2.5" />
              <span>Voice</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isEmptyStreaming = message.streaming && !message.content.trim();

  return (
    <div className="flex justify-start items-start gap-2">
      <div className="shrink-0 mt-0.5 -ml-1">
        <AIBotMascot
          state={
            isActivelySpeaking
              ? 'speaking'
              : message.streaming
                ? 'thinking'
                : 'idle'
          }
          audioLevel={isActivelySpeaking ? audioLevel : 0}
          size={28}
        />
      </div>

      <div className="max-w-[86%] rounded-2xl rounded-tl-sm px-3.5 py-2 bg-secondary/75 dark:bg-secondary/50 border border-border/60 text-foreground shadow-xs">
        {isEmptyStreaming ? (
          <div className="flex items-center gap-1.5 py-1 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.25s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.12s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" />
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed break-words [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:my-1.5 [&>ul]:pl-4 [&>ol]:my-1.5 [&>ol]:pl-4 [&_strong]:font-semibold [&_strong]:text-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.streaming && (
              <span className="inline-block w-1.5 h-3.5 ml-1 align-middle rounded-xs bg-sky-500 animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
