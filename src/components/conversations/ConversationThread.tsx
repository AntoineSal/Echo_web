import React, { useEffect, useRef } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useWebSocketMessages } from '../../hooks/useWebSocketMessages';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import './ConversationThread.css';

interface ConversationThreadProps {
    conversationId: string;
    conversationName: string;
    conversationAvatar?: string;
}

export function ConversationThread({ conversationId, conversationName, conversationAvatar }: ConversationThreadProps) {
    const { messages, isLoading, sendMessage, markAsRead } = useMessages(conversationId);
    const { isConnected } = useWebSocketMessages(conversationId);
    const scrollEndRef = useRef<HTMLDivElement>(null);

    // Auto mark as read and scroll to bottom on load
    useEffect(() => {
        if (conversationId) {
            markAsRead();
        }
    }, [conversationId, markAsRead]);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages.length]);

    const handleSend = (text: string) => {
        sendMessage.mutate({ conversationId, content: text });
        setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    return (
        <div className="conversation-thread">
            {/* Thread Header */}
            <div className="thread-header">
                <div className="thread-header-info">
                    {conversationAvatar ? (
                        <img src={conversationAvatar} alt={conversationName} className="thread-header-avatar" />
                    ) : (
                        <div className="thread-header-avatar-placeholder">
                            {conversationName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="thread-header-text">
                        <h2 className="thread-header-name">{conversationName}</h2>
                        <span className="thread-header-status">
                            {isConnected ? 'En ligne' : 'Déconnecté'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="thread-messages">
                {isLoading && messages.length === 0 ? (
                    <div className="thread-loading">Chargement des messages...</div>
                ) : (
                    messages.slice().reverse().map((msg, index, arr) => {
                        const prevMsg = arr[index - 1];
                        const nextMsg = arr[index + 1];
                        
                        const isSameSenderAsPrev = prevMsg && prevMsg.sender_uuid === msg.sender_uuid;
                        const isSameSenderAsNext = nextMsg && nextMsg.sender_uuid === msg.sender_uuid;
                        
                        // Just basic groups logic
                        const isFirstInGroup = !isSameSenderAsPrev;
                        const isLastInGroup = !isSameSenderAsNext;

                        return (
                            <MessageBubble
                                key={msg.uuid || msg.id}
                                message={msg}
                                isFirstInGroup={isFirstInGroup}
                                isLastInGroup={isLastInGroup}
                                isSameSenderAsNext={isSameSenderAsNext}
                                isSameSenderAsPrev={isSameSenderAsPrev}
                            />
                        );
                    })
                )}
                <div ref={scrollEndRef} />
            </div>

            {/* Input Area */}
            <ChatInput onSend={handleSend} />
        </div>
    );
}
