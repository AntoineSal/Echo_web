import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IoCopyOutline, IoFlagOutline, IoArrowUndoOutline } from 'react-icons/io5';
import './MessageContextMenu.css';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥'];
const PANEL_WIDTH = 220;
const GAP = 10; // gap between bubble edge and panel

interface MessageContextMenuProps {
  bubbleRect: DOMRect;
  isMe: boolean;
  messageContent: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onReport: () => void;
  onClose: () => void;
}

export function MessageContextMenu({
  bubbleRect, isMe, messageContent, onReact, onReply, onCopy, onReport, onClose,
}: MessageContextMenuProps) {
  const reactionsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [positioned, setPositioned] = useState(false);
  const [reactionsStyle, setReactionsStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [actionsStyle, setActionsStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Compute positions after first render (to know panel heights)
  useLayoutEffect(() => {
    const rH = reactionsRef.current?.offsetHeight ?? 56;
    const aH = actionsRef.current?.offsetHeight ?? 140;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: align with the bubble's near edge
    const left = isMe
      ? Math.max(8, bubbleRect.right - PANEL_WIDTH)
      : Math.min(bubbleRect.left, vw - PANEL_WIDTH - 8);

    // Reactions above bubble, actions below — flip if not enough room
    const spaceAbove = bubbleRect.top - GAP;
    const spaceBelow = vh - bubbleRect.bottom - GAP;

    let reactTop: number;
    let actTop: number;

    if (spaceAbove >= rH && spaceBelow >= aH) {
      // Ideal: reactions above, actions below
      reactTop = bubbleRect.top - rH - GAP;
      actTop = bubbleRect.bottom + GAP;
    } else if (spaceBelow >= rH + aH + GAP) {
      // Both below
      reactTop = bubbleRect.bottom + GAP;
      actTop = bubbleRect.bottom + GAP + rH + GAP;
    } else {
      // Both above
      actTop = bubbleRect.top - aH - GAP;
      reactTop = actTop - rH - GAP;
    }

    setReactionsStyle({ position: 'fixed', top: Math.max(8, reactTop), left, width: PANEL_WIDTH });
    setActionsStyle({ position: 'fixed', top: Math.max(8, actTop), left, width: PANEL_WIDTH });
    setPositioned(true);
  }, [bubbleRect, isMe]);

  const visibility = positioned ? 'visible' : 'hidden';

  return (
    <>
      {/* Full-screen backdrop */}
      <div className="msg-ctx-backdrop" onMouseDown={onClose} />

      {/* Reactions panel — above bubble */}
      <div
        ref={reactionsRef}
        className="msg-ctx-reactions-panel"
        style={{ ...reactionsStyle, visibility }}
      >
        {QUICK_REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            className="msg-ctx-menu__emoji"
            onClick={() => { onReact(emoji); onClose(); }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Actions panel — below bubble */}
      <div
        ref={actionsRef}
        className="msg-ctx-actions-panel"
        style={{ ...actionsStyle, visibility }}
      >
        <button type="button" className="msg-ctx-menu__action" onClick={() => { onReply(); onClose(); }}>
          <IoArrowUndoOutline size={16} className="msg-ctx-menu__action-icon" />
          Répondre
        </button>

        {messageContent && (
          <button type="button" className="msg-ctx-menu__action" onClick={() => { onCopy(); onClose(); }}>
            <IoCopyOutline size={16} className="msg-ctx-menu__action-icon" />
            Copier le texte
          </button>
        )}

        <button type="button" className="msg-ctx-menu__action msg-ctx-menu__action--danger" onClick={() => { onReport(); onClose(); }}>
          <IoFlagOutline size={16} className="msg-ctx-menu__action-icon" />
          Signaler
        </button>
      </div>
    </>
  );
}
