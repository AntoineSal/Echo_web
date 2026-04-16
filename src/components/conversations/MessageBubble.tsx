import React, { useState, useCallback, useRef } from 'react';
import type { Message, InteractiveMessageData, FormField } from '../../hooks/useMessages';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { MessageContextMenu } from './MessageContextMenu';
import { isFailedAssetUrl, markFailedAssetUrl } from '../../utils/failedAssetUrls';
import { renderFormattedText } from './richText';
import './MessageBubble.css';

export const USER_COLORS = [
    '#e53935', // Red
    '#d81b60', // Pink
    '#8e24aa', // Purple
    '#5e35b1', // Deep Purple
    '#3949ab', // Indigo
    '#1e88e5', // Blue
    '#00897b', // Teal
    '#2e7d32', // Green
    '#ef6c00', // Orange
    '#d84315', // Deep Orange
    '#6d4c41', // Brown
    '#546e7a', // Blue Grey
    '#006064', // Dark Cyan
    '#33691e', // Dark Green
    '#b71c1c', // Dark Red
    '#1a237e'  // Dark Indigo
];

export const getUserColor = (username?: string | null, uuid?: string | null) => {
    const seed = uuid || username || "default";
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    // Mix to improve distribution
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
};

const getFirstNonEmptyLine = (text?: string): string => {
    if (!text) return 'Message sans texte';
    const firstLine = text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    if (!firstLine) return 'Message sans texte';
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
};

interface MessageBubbleProps {
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    isSameSenderAsNext: boolean;
    isSameSenderAsPrev: boolean;
    isGroupConversation?: boolean;
    reactionEmojis?: string[];
    replyParent?: Message | null;
    senderColor?: string;
    onReact?: (messageUuid: string, emoji: string) => void;
    onReply?: (message: Message) => void;
}

// ── Audio player ─────────────────────────────────────────────────────────────
function AudioAttachment({ url, isMe }: { url: string; isMe: boolean }) {
    return (
        <div className={`attachment-audio ${isMe ? 'attachment-audio--mine' : 'attachment-audio--theirs'}`}>
            <audio controls preload="none" style={{ maxWidth: '100%', height: 36 }}>
                <source src={url} />
            </audio>
        </div>
    );
}

// ── Video player ─────────────────────────────────────────────────────────────
function VideoAttachment({ url, thumbnailUrl }: { url: string; thumbnailUrl?: string }) {
    return (
        <div className="attachment-video">
            <video
                controls
                preload="none"
                poster={thumbnailUrl}
                style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8 }}
            >
                <source src={url} />
            </video>
        </div>
    );
}

function buildAttachmentKey(messageUuid: string, attachment: NonNullable<Message['attachments']>[number], index: number): string {
    return `${messageUuid}-${attachment.uuid || attachment.file_url || attachment.thumbnail_url || attachment.original_filename || 'attachment'}-${index}`;
}

function resolveAttachmentImageUrl(attachment: NonNullable<Message['attachments']>[number]): string {
    const thumbnailUrl = attachment.thumbnail_url || '';
    const fileUrl = attachment.file_url || '';

    if (thumbnailUrl && !isFailedAssetUrl(thumbnailUrl)) {
        return thumbnailUrl;
    }

    if (fileUrl && !isFailedAssetUrl(fileUrl)) {
        return fileUrl;
    }

    return '';
}

function renderImageAttachment(attachment: NonNullable<Message['attachments']>[number]): React.ReactNode {
    const initialImageUrl = resolveAttachmentImageUrl(attachment);
    if (!initialImageUrl) {
        return (
            <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="attachment-file">
                📎 {attachment.original_filename || 'Image'}
            </a>
        );
    }

    return (
        <img
            src={initialImageUrl}
            alt="Image"
            className="attachment-image"
            onError={(event) => {
                const image = event.currentTarget;
                markFailedAssetUrl(image.currentSrc || image.src);

                if (
                    attachment.thumbnail_url &&
                    image.currentSrc !== attachment.file_url &&
                    image.src !== attachment.file_url &&
                    attachment.file_url &&
                    !isFailedAssetUrl(attachment.file_url)
                ) {
                    image.src = attachment.file_url;
                    return;
                }

                image.style.display = 'none';
            }}
            onClick={() => window.open(attachment.file_url, '_blank')}
            style={{ cursor: 'pointer' }}
        />
    );
}

// ── Interactive message form ──────────────────────────────────────────────────
function InteractiveForm({ data, messageUuid, isMe }: {
    data: InteractiveMessageData;
    messageUuid: string;
    isMe: boolean;
}) {
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (!data.form_data) return null;

    const { fields, responses } = data.form_data;
    const canSubmit = data.can_submit !== false && !submitted;

    const handleSubmit = async () => {
        if (submitting || !canSubmit) return;
        setSubmitting(true);
        try {
            await fetchWithAuth(`${API_BASE_URL}/messaging/messages/${messageUuid}/interact/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ responses: values }),
            });
            setSubmitted(true);
        } catch {
            // Silently fail
        } finally {
            setSubmitting(false);
        }
    };

    const renderField = (field: FormField) => {
        const existingResponse = responses[field.id];
        if (existingResponse) {
            return (
                <div key={field.id} className="iform-field">
                    <label className="iform-label">{field.label}</label>
                    <div className="iform-response">
                        <span className="iform-response-value">{String(existingResponse.value)}</span>
                        <span className="iform-response-by">— {existingResponse.filled_by.username}</span>
                    </div>
                </div>
            );
        }
        const val = values[field.id];
        switch (field.type) {
            case 'checkbox':
                return (
                    <div key={field.id} className="iform-field iform-field--checkbox">
                        <input type="checkbox" id={field.id} checked={!!val}
                            onChange={e => setValues(v => ({ ...v, [field.id]: e.target.checked }))}
                            disabled={!canSubmit} />
                        <label htmlFor={field.id} className="iform-label">{field.label}</label>
                    </div>
                );
            case 'select':
                return (
                    <div key={field.id} className="iform-field">
                        <label className="iform-label">{field.label}</label>
                        <select className="iform-select" value={String(val ?? '')}
                            onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}
                            disabled={!canSubmit}>
                            <option value="">Choisir...</option>
                            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                );
            case 'textarea':
                return (
                    <div key={field.id} className="iform-field">
                        <label className="iform-label">{field.label}</label>
                        <textarea className="iform-textarea" placeholder={field.placeholder}
                            value={String(val ?? '')}
                            onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}
                            disabled={!canSubmit} rows={3} />
                    </div>
                );
            default:
                return (
                    <div key={field.id} className="iform-field">
                        <label className="iform-label">{field.label}</label>
                        <input className="iform-input" type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={field.placeholder} value={String(val ?? '')}
                            min={field.min} max={field.max}
                            onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}
                            disabled={!canSubmit} />
                    </div>
                );
        }
    };

    return (
        <div className={`interactive-form ${isMe ? 'interactive-form--mine' : ''}`}>
            {fields.map(renderField)}
            {canSubmit && (
                <button type="button" className="iform-submit" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? '...' : 'Envoyer'}
                </button>
            )}
            {submitted && <p className="iform-done">Réponse envoyée ✓</p>}
        </div>
    );
}

// ── Main MessageBubble ────────────────────────────────────────────────────────
function MessageBubbleComponent({
    message,
    isFirstInGroup,
    isLastInGroup,
    isSameSenderAsNext,
    isSameSenderAsPrev,
    isGroupConversation = false,
    reactionEmojis,
    replyParent,
    senderColor,
    onReact,
    onReply,
}: MessageBubbleProps) {
    const { user } = useAuth();
    const [ctxMenu, setCtxMenu] = useState<DOMRect | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);

    const isMe =
        (message.sender_uuid && user?.uuid && message.sender_uuid === user.uuid) ||
        message.sender_username?.toLowerCase() === user?.username?.toLowerCase();

    const isSystemMessage = message.message_type === 'system';

    const handleClick = useCallback((e: React.MouseEvent) => {
        // Don't open menu when clicking interactive elements inside the bubble
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea, audio, video')) return;
        if (bubbleRef.current) setCtxMenu(bubbleRef.current.getBoundingClientRect());
    }, []);

    const handleCopy = useCallback(() => {
        if (message.content) navigator.clipboard.writeText(message.content).catch(() => {});
    }, [message.content]);

    const handleReport = useCallback(() => {
        alert('Signalement envoyé');
    }, []);

    const handleReact = useCallback((emoji: string) => {
        onReact?.(message.uuid, emoji);
    }, [message.uuid, onReact]);

    const handleReply = useCallback(() => {
        onReply?.(message);
    }, [message, onReply]);

    if (isSystemMessage) {
        return (
            <div className="system-message-container">
                <span className="system-message-text">{message.content}</span>
                <span className="system-message-time">
                    {new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        );
    }

    const bubbleClasses = ['message-bubble'];
    if (isMe) {
        bubbleClasses.push('my-message');
        bubbleClasses.push(isSameSenderAsPrev ? 'same-prev-mine' : 'not-same-prev-mine');
        bubbleClasses.push(isSameSenderAsNext ? 'same-next-mine' : 'not-same-next-mine');
    } else {
        bubbleClasses.push('their-message');
        bubbleClasses.push(isSameSenderAsPrev ? 'same-prev-theirs' : 'not-same-prev-theirs');
        bubbleClasses.push(isSameSenderAsNext ? 'same-next-theirs' : 'not-same-next-theirs');
    }
    if (message.isPending) bubbleClasses.push('pending-message');

    const formattedTime = new Date(message.created_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit',
    });

    const renderContent = (content: string) => renderFormattedText(content, `msg-${message.uuid}`, {
        textClassName: isMe ? 'my-message-text' : 'their-message-text',
        linkClassName: isMe ? 'my-link-text' : 'their-link-text',
        inlineCodeClassName: isMe ? 'message-inline-code message-inline-code--mine' : 'message-inline-code message-inline-code--theirs',
        codeBlockClassName: isMe ? 'message-code-block message-code-block--mine' : 'message-code-block message-code-block--theirs',
        headingClassName: 'message-heading',
        headingToneClassName: isMe ? 'message-heading--mine' : 'message-heading--theirs',
    });

    const attachments = message.attachments ?? [];
    const isInteractive = message.interactive_data?.is_interactive === true
        && !message.interactive_data?.hidden_meta?.is_form_response;

    return (
        <>
            <div
                className={`message-wrapper ${isMe ? 'message-wrapper-mine' : 'message-wrapper-theirs'}${ctxMenu ? ' message-wrapper--active' : ''}`}
                style={ctxMenu ? { position: 'relative', zIndex: 9999 } : undefined}
            >
                <div className={`message-content-row${isMe ? ' message-content-row--mine' : ''}`}>
                    {!isMe && (
                        <div className="timestamp-container-left">
                            <span className="external-timestamp">{formattedTime}</span>
                        </div>
                    )}

                    <div
                        ref={bubbleRef}
                        className={`${bubbleClasses.join(' ')}${reactionEmojis && reactionEmojis.length > 0 ? ' has-reaction' : ''}${ctxMenu ? ' message-bubble--active' : ''}`}
                        onClick={handleClick}
                    >
                        {/* Sender name for group chats */}
                        {!isMe && isFirstInGroup && isGroupConversation && (
                            <div className="sender-name" style={{ color: senderColor || getUserColor(message.sender_username, message.sender_uuid), marginTop: 0, marginBottom: 4, marginLeft: 0 }}>
                                {message.sender_username}
                            </div>
                        )}
                        {/* Reply quote */}
                        {replyParent && (
                            <div className={`reply-quote ${isMe ? 'reply-quote--mine' : 'reply-quote--theirs'}`}>
                                <span className="reply-quote__sender">Réponse à {replyParent.sender_username || 'message'}</span>
                                <span className="reply-quote__text">
                                    {replyParent.attachments?.length ? '📎 Pièce jointe' : getFirstNonEmptyLine(replyParent.content)}
                                </span>
                            </div>
                        )}

                        {attachments.length > 0 && (
                            <div className="attachment-stack">
                                {attachments.map((att, index) => (
                                    <div key={buildAttachmentKey(message.uuid, att, index)} className="attachment-item">
                                        {att.file_type === 'image' ? (
                                            renderImageAttachment(att)
                                        ) : att.file_type === 'audio' ? (
                                            <AudioAttachment url={att.file_url} isMe={!!isMe} />
                                        ) : att.file_type === 'video' ? (
                                            <VideoAttachment url={att.file_url} thumbnailUrl={att.thumbnail_url} />
                                        ) : (
                                            <a href={att.file_url} target="_blank" rel="noopener noreferrer"
                                               className="attachment-file">
                                                📎 {att.original_filename || 'Fichier'}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {isInteractive && message.interactive_data && (
                            <InteractiveForm data={message.interactive_data} messageUuid={message.uuid} isMe={!!isMe} />
                        )}

                        {message.content && (!attachments.some(a => a.file_type === 'audio') || message.content.trim() !== 'Message vocal') && (
                            <div className={`message-text ${isMe ? 'my-message-text' : 'their-message-text'}`}>
                                {renderContent(message.content)}
                            </div>
                        )}

                        {/* Reaction chips — positioned absolutely on the bubble, toward screen center */}
                        {reactionEmojis && reactionEmojis.length > 0 && (
                            <div className={`reaction-badges ${isMe ? 'reaction-badges--mine' : 'reaction-badges--theirs'}`}>
                                {reactionEmojis.map((emoji, i) => (
                                    <span key={`${message.uuid}-${emoji}-${i}`} className="reaction-badge">{emoji}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {isMe && (
                        <div className="timestamp-container-right">
                            {message.isPending ? (
                                <span className="status-icon pending">◷</span>
                            ) : message.sendError ? (
                                <span className="status-icon error">!</span>
                            ) : message.is_read ? (
                                <span className="status-icon read">✓✓</span>
                            ) : (
                                <span className="status-icon delivered">✓</span>
                            )}
                            <span className="external-timestamp">{formattedTime}</span>
                        </div>
                    )}
                </div>
            </div>

            {ctxMenu && (
                <MessageContextMenu
                    bubbleRect={ctxMenu}
                    isMe={!!isMe}
                    messageContent={message.content ?? ''}
                    onReact={handleReact}
                    onReply={handleReply}
                    onCopy={handleCopy}
                    onReport={handleReport}
                    onClose={() => setCtxMenu(null)}
                />
            )}
        </>
    );
}

const areReactionListsEqual = (left?: string[], right?: string[]): boolean => {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
};

export const MessageBubble = React.memo(MessageBubbleComponent, (prev, next) => {
    return (
        prev.message === next.message &&
        prev.isFirstInGroup === next.isFirstInGroup &&
        prev.isLastInGroup === next.isLastInGroup &&
        prev.isSameSenderAsNext === next.isSameSenderAsNext &&
        prev.isSameSenderAsPrev === next.isSameSenderAsPrev &&
        prev.isGroupConversation === next.isGroupConversation &&
        prev.replyParent?.uuid === next.replyParent?.uuid &&
        prev.replyParent?.content === next.replyParent?.content &&
        areReactionListsEqual(prev.reactionEmojis, next.reactionEmojis)
    );
});
