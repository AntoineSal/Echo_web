import React from 'react';
import type { Message } from '../../hooks/useMessages';
import { useAuth } from '../../contexts/AuthContext';
import './MessageBubble.css';

interface MessageBubbleProps {
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    isSameSenderAsNext: boolean;
    isSameSenderAsPrev: boolean;
}

export function MessageBubble({
    message,
    isFirstInGroup,
    isLastInGroup,
    isSameSenderAsNext,
    isSameSenderAsPrev,
}: MessageBubbleProps) {
    const { user } = useAuth();
    
    // Check if the message is from the current user
    const isMe = message.sender_uuid === user?.uuid || message.sender_username.toLowerCase() === user?.username.toLowerCase();
    
    // Simple mock for "System Messages" if any
    const isSystemMessage = message.message_type === 'system';

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

    // Dynamic styling classes to match mobile logic
    const bubbleClasses = ['message-bubble'];
    if (isMe) bubbleClasses.push('my-message');
    else bubbleClasses.push('their-message');

    if (isSameSenderAsNext) bubbleClasses.push(isMe ? 'same-next-mine' : 'same-next-theirs');
    else bubbleClasses.push(isMe ? 'not-same-next-mine' : 'not-same-next-theirs');

    if (isSameSenderAsPrev) bubbleClasses.push(isMe ? 'same-prev-mine' : 'same-prev-theirs');
    else bubbleClasses.push(isMe ? 'not-same-prev-mine' : 'not-same-prev-theirs');

    if (message.isPending) bubbleClasses.push('pending-message');

    const formattedTime = new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Linkify naive implementation
    const renderContent = (content: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return content.split(urlRegex).map((part, i) => {
            if (part.match(urlRegex)) {
                return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={isMe ? 'my-link-text' : 'their-link-text'}>{part}</a>;
            }
            return part;
        });
    };

    return (
        <div className={`message-wrapper ${isMe ? 'message-wrapper-mine' : 'message-wrapper-theirs'}`}>
            {/* Sender Name for groups */}
            {!isMe && isFirstInGroup && (
                <div className="sender-name">{message.sender_username}</div>
            )}

            <div className="message-content-row">
                {isMe && (
                    <div className="timestamp-container-left">
                        {/* Status Icon */}
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
                    {/* Attachments if any */}
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="attachment-stack">
                            {message.attachments.map(att => (
                                <div key={att.uuid} className="attachment-item">
                                    {att.file_type === 'image' ? (
                                        <img src={att.file_url} alt="Attachment" className="attachment-image" />
                                    ) : (
                                        <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="attachment-file">
                                            📎 {att.original_filename || 'Fichier'}
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Text logic */}
                    {message.content && (
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
        </div>
    );
}
