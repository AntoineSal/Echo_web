import React, { useEffect, useRef } from 'react';
import './MessageContextMenu.css';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageContent: string;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onReport: () => void;
  onClose: () => void;
}

export function MessageContextMenu({ x, y, messageContent, onReact, onCopy, onReport, onClose }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't go off-screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 1000,
  };

  return (
    <div ref={menuRef} className="msg-ctx-menu" style={menuStyle}>
      {/* Quick emoji reactions */}
      <div className="msg-ctx-menu__reactions">
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

      <div className="msg-ctx-menu__divider" />

      {/* Actions */}
      <button type="button" className="msg-ctx-menu__action" onClick={() => { onCopy(); onClose(); }}>
        <span className="msg-ctx-menu__action-icon">📋</span>
        Copier le texte
      </button>
      <button type="button" className="msg-ctx-menu__action msg-ctx-menu__action--danger" onClick={() => { onReport(); onClose(); }}>
        <span className="msg-ctx-menu__action-icon">🚩</span>
        Signaler
      </button>
    </div>
  );
}
