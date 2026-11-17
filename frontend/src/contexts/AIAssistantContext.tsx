// src/contexts/AIAssistantContext.tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useAIAssistant, type AIAssistantSession } from '../hooks/useAIAssistant';

const AIAssistantContext = createContext<AIAssistantSession | null>(null);

/**
 * App-level owner of the AI voice/chat session (mic stream, AudioContexts, WebSocket, state).
 *
 * Mounted once in the authenticated app shell (`Layout`), so minimising/closing the chat panel or
 * navigating between routes never stops the session. Leaving the shell (logout) unmounts it and
 * releases the microphone.
 */
export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const session = useAIAssistant();
  return <AIAssistantContext.Provider value={session}>{children}</AIAssistantContext.Provider>;
}

export function useAIAssistantSession(): AIAssistantSession {
  const ctx = useContext(AIAssistantContext);
  if (!ctx) {
    throw new Error('useAIAssistantSession must be used inside <AIAssistantProvider>');
  }
  return ctx;
}

