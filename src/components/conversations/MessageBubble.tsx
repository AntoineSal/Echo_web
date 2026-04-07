import React, { useState, useCallback } from 'react';
import type { Message, InteractiveMessageData, FormField } from '../../hooks/useMessages';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { MessageContextMenu } from './MessageContextMenu';
import './MessageBubble.css';

interface MessageBubbleProps {
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    isSameSenderAsNext: boolean;
    isSameSenderAsPrev: boolean;
    isGroupConversation?: boolean;
    reactionEmojis?: string[];
    onReact?: (messageUuid: string, emoji: string) => void;
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
export function MessageBubble({
    message,
    isFirstInGroup,
    isLastInGroup,
    isSameSenderAsNext,
    isSameSenderAsPrev,
    isGroupConversation = false,
    reactionEmojis,
    onReact,
}: MessageBubbleProps) {
    const { user } = useAuth();
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    const isMe =
        (message.sender_uuid && user?.uuid && message.sender_uuid === user.uuid) ||
        message.sender_username?.toLowerCase() === user?.username?.toLowerCase();

    const isSystemMessage = message.message_type === 'system';

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const handleCopy = useCallback(() => {
        if (message.content) navigator.clipboard.writeText(message.content).catch(() => {});
    }, [message.content]);

    const handleReport = useCallback(() => {
        // TODO: open report modal
        alert('Signalement envoyé');
    }, []);

    const handleReact = useCallback((emoji: string) => {
        onReact?.(message.uuid, emoji);
    }, [message.uuid, onReact]);

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

    const renderContent = (content: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return content.split(urlRegex).map((part, i) =>
            part.match(urlRegex) ? (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer"
                   className={isMe ? 'my-link-text' : 'their-link-text'}>{part}</a>
            ) : part
        );
    };

    const attachments = message.attachments ?? [];
    const isInteractive = message.interactive_data?.is_interactive === true
        && !message.interactive_data?.hidden_meta?.is_form_response;

    return (
        <>
            <div
                className={`message-wrapper ${isMe ? 'message-wrapper-mine' : 'message-wrapper-theirs'}`}
                onContextMenu={handleContextMenu}
            >
                {!isMe && isFirstInGroup && isGroupConversation && (
                    <div className="sender-name">{message.sender_username}</div>
                )}

                <div className="message-content-row">
                    {isMe && (
                        <div className="timestamp-container-left">
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

                    <div className={bubbleClasses.join(' ')}>
                        {attachments.length > 0 && (
                            <div className="attachment-stack">
                                {attachments.map(att => (
                                    <div key={att.uuid} className="attachment-item">
                                        {att.file_type === 'image' ? (
                                            <img src={att.thumbnail_url || att.file_url} alt="Image"
                                                className="attachment-image"
                                                onClick={() => window.open(att.file_url, '_blank')}
                                                style={{ cursor: 'pointer' }} />
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
                    </div>

                    {!isMe && (
                        <div className="timestamp-container-right">
                            <span className="external-timestamp">{formattedTime}</span>
                        </div>
                    )}
                </div>

                {/* Reaction badges — outside the content row so they never shift the bubble */}
                {reactionEmojis && reactionEmojis.length > 0 && (
                    <div className={`reaction-badges ${isMe ? 'reaction-badges--mine' : 'reaction-badges--theirs'}`}>
                        {reactionEmojis.map((emoji, i) => (
                            <span key={i} className="reaction-badge">{emoji}</span>
                        ))}
                    </div>
                )}
            </div>

            {ctxMenu && (
                <MessageContextMenu
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    messageContent={message.content ?? ''}
                    onReact={handleReact}
                    onCopy={handleCopy}
                    onReport={handleReport}
                    onClose={() => setCtxMenu(null)}
                />
            )}
        </>
    );
}
