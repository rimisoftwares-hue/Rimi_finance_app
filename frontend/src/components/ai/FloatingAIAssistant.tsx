// src/components/ai/FloatingAIAssistant.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AIBotMascot } from './AIBotMascot';
import { AIChatPanel, AssistantViewMode } from './AIChatPanel';
import { AIMicIndicator } from './AIMicIndicator';
import { PermissionModal } from '../common/PermissionModal';
import { useAIAssistantSession } from '../../contexts/AIAssistantContext';

const ORB_SIZE = 62;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD_PX = 5;
const ORB_POS_STORAGE_KEY = 'af_ai_orb_pos';

interface StoredOrbState {
  x: number;
  y: number;
  docked: 'none' | 'left' | 'right';
}

function loadInitialOrbState(): StoredOrbState {
  if (typeof window === 'undefined') {
    return { x: 24, y: 500, docked: 'none' };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fallback: StoredOrbState = {
    x: Math.max(EDGE_MARGIN, vw - ORB_SIZE - 22),
    y: Math.max(EDGE_MARGIN + 40, vh - ORB_SIZE - 26),
    docked: 'none',
  };

  try {
    const raw = sessionStorage.getItem(ORB_POS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredOrbState>;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      const clampedX = Math.max(-ORB_SIZE * 0.4, Math.min(vw - ORB_SIZE * 0.6, parsed.x));
      const clampedY = Math.max(EDGE_MARGIN + 38, Math.min(vh - ORB_SIZE - EDGE_MARGIN, parsed.y));
      return {
        x: clampedX,
        y: clampedY,
        docked:
          parsed.docked === 'left' || parsed.docked === 'right' ? parsed.docked : 'none',
      };
    }
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Global Cross-Page Draggable Floating AI Assistant (`orb` -> `compact` -> `maximized`).
 *
 * Mounted once in `Layout.tsx` so switching between Dashboard, Customers, Pending, Reports,
 * Accounts, or any other page keeps the floating mascot in the exact `(x, y)` spot placed by the user!
 *
 * - State 1 (`orb`): Pure transparent `<AIBotMascot />` ONLY — zero outer circle or box.
 * - State 2 (`compact`): Lightweight floating agent bar + floating response bubble right beside mascot.
 * - State 3 (`maximized`): Full session conversation view loaded from local session cache.
 */
export function FloatingAIAssistant() {
  // Session lives in <AIAssistantProvider> (app shell), NOT in this component or the panel.
  const assistant = useAIAssistantSession();

  const initialOrb = loadInitialOrbState();
  const [viewMode, setViewMode] = useState<AssistantViewMode>('orb');
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: initialOrb.x,
    y: initialOrb.y,
  });
  const [edgeDocked, setEdgeDocked] = useState<'none' | 'left' | 'right'>(initialOrb.docked);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  // Persist orb position in sessionStorage so it never jumps on route changes or refreshes
  useEffect(() => {
    try {
      sessionStorage.setItem(
        ORB_POS_STORAGE_KEY,
        JSON.stringify({ x: position.x, y: position.y, docked: edgeDocked })
      );
    } catch {
      // ignore
    }
  }, [edgeDocked, position.x, position.y]);

  const openCompactAssistant = useCallback(() => {
    setEdgeDocked((prevDocked) => {
      if (prevDocked !== 'none' && typeof window !== 'undefined') {
        setPosition((prev) => ({
          x:
            prevDocked === 'left'
              ? EDGE_MARGIN
              : Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN),
          y: prev.y,
        }));
      }
      return 'none';
    });
    setViewMode((prev) => (prev === 'orb' ? 'compact' : prev));
    void assistant.ensureWebSocket();
    void assistant.verifyProviderHealth();
  }, [assistant]);

  // Listen for external open trigger (e.g. Dashboard header "AI Assistant" button)
  useEffect(() => {
    const handleOpenEvent = () => {
      openCompactAssistant();
    };
    window.addEventListener('autofinex:open-ai-assistant', handleOpenEvent);
    return () => {
      window.removeEventListener('autofinex:open-ai-assistant', handleOpenEvent);
    };
  }, [openCompactAssistant]);

  // Keep mascot inside viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const clampedY = Math.max(
          EDGE_MARGIN + 38,
          Math.min(vh - ORB_SIZE - EDGE_MARGIN, prev.y)
        );
        const clampedX = Math.max(
          EDGE_MARGIN,
          Math.min(vw - ORB_SIZE - EDGE_MARGIN, prev.x)
        );
        return { x: clampedX, y: clampedY };
      });
      setEdgeDocked('none');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Collapse floating panel back to mascot if active company switches
  useEffect(() => {
    const onSwitch = () => {
      setViewMode('orb');
    };
    window.addEventListener('autofinex:finance-switched', onSwitch);
    return () => window.removeEventListener('autofinex:finance-switched', onSwitch);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragRef.current;
    if (!st || !st.active || st.pointerId !== e.pointerId) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (!st.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      st.moved = true;
      setIsDragging(true);
      setEdgeDocked('none');
    }

    if (st.moved) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nextX = Math.max(-ORB_SIZE * 0.3, Math.min(vw - ORB_SIZE * 0.7, st.originX + dx));
      const nextY = Math.max(EDGE_MARGIN + 38, Math.min(vh - ORB_SIZE - EDGE_MARGIN, st.originY + dy));
      setPosition({ x: nextX, y: nextY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    setIsDragging(false);

    if (!st.moved) {
      if (viewMode !== 'orb') {
        setViewMode('orb');
      } else {
        openCompactAssistant();
      }
      return;
    }

    // Free placement anywhere on screen; only half-dock if dragged right onto extreme left/right edge
    const vw = window.innerWidth;
    if (position.x <= 2) {
      setEdgeDocked('left');
      setPosition((prev) => ({ x: -ORB_SIZE * 0.32, y: prev.y }));
    } else if (position.x + ORB_SIZE >= vw - 2) {
      setEdgeDocked('right');
      setPosition((prev) => ({ x: vw - ORB_SIZE * 0.68, y: prev.y }));
    } else {
      setEdgeDocked('none');
    }
  };

  if (typeof document === 'undefined') return null;

  const micPhase = assistant.micPermissionFlow.phase;

  return (
    <>
      {createPortal(
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="AutoFinex AI Assistant"
          title="AutoFinex AI (Drag anywhere • Click to talk)"
          style={{
            left: position.x,
            top: position.y,
            width: ORB_SIZE,
            height: ORB_SIZE,
            touchAction: 'none',
            transition: isDragging
              ? 'none'
              : 'left 0.25s cubic-bezier(0.22, 1, 0.36, 1), top 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease, transform 0.2s ease',
          }}
          className={`fixed z-[45] flex items-center justify-center bg-transparent border-0 shadow-none p-0 cursor-grab active:cursor-grabbing focus:outline-none hover:scale-105 ${
            edgeDocked !== 'none' && viewMode === 'orb'
              ? 'opacity-75 hover:opacity-100'
              : 'opacity-100'
          }`}
        >
          {/* Pure transparent animated robot mascot ONLY — no outer circle box! */}
          <AIBotMascot
            state={assistant.visualState}
            audioLevel={assistant.activeAudioLevel}
            size={ORB_SIZE}
          />
        </button>,
        document.body
      )}

      <AIChatPanel
        viewMode={viewMode}
        anchorPosition={position}
        orbSize={ORB_SIZE}
        messages={assistant.messages}
        partialTranscript={assistant.partialTranscript}
        visualState={assistant.visualState}
        audioLevel={assistant.activeAudioLevel}
        isMicActive={assistant.isMicActive}
        isSpeakingUtterance={assistant.isSpeakingUtterance}
        isAiSpeaking={assistant.isAiSpeaking}
        ttsMuted={assistant.ttsMuted}
        voicePhase={assistant.voicePhase}
        awaitingReply={assistant.awaitingReply}
        error={assistant.error}
        onSendMessage={(txt) => assistant.sendTextMessage(txt)}
        onToggleMic={assistant.toggleVoiceConversation}
        onCommitUtterance={assistant.commitVoiceUtterance}
        onInterruptSpeaking={assistant.interruptTurn}
        onToggleTtsMuted={assistant.toggleTtsMuted}
        onClearMessages={assistant.clearConversationMemory}
        onClearError={() => assistant.setError(null)}
        onChangeViewMode={setViewMode}
      />

      {/* Always-visible "mic is on" privacy pill (stays visible when minimised / on other pages) */}
      <AIMicIndicator
        voicePhase={assistant.voicePhase}
        audioLevel={assistant.activeAudioLevel}
        notice={assistant.notice}
        micNoticeVisible={assistant.micNoticeVisible}
        onStop={assistant.stopVoiceSession}
        onOpen={openCompactAssistant}
        onAcknowledgeNotice={assistant.acknowledgeMicNotice}
        onDismissNotice={() => assistant.setNotice(null)}
      />

      {/* Native AutoFinex Microphone Permission Prompt & Blocked-Retry Modal */}
      <PermissionModal
        open={micPhase === 'soft' || micPhase === 'blocked'}
        type="microphone"
        mode={micPhase === 'blocked' ? 'blocked' : 'soft'}
        busy={micPhase === 'requesting'}
        onAllow={assistant.micPermissionFlow.onAllow}
        onCancel={assistant.micPermissionFlow.onCancel}
        onRetry={assistant.micPermissionFlow.retryAfterSettings}
      />
    </>
  );
}
