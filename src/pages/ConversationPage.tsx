import React, { useMemo } from 'react';
import { useMessages } from '@mobile/hooks/useMessages';
import { useConversationInfo } from '@mobile/hooks/useConversationInfo';
import { useAuth } from '../contexts/AuthContext';
import { MessageBubble } from '@mobile/components/MessageBubble';
import { IoChevronBackOutline } from 'react-icons/io5';
import './ConversationPage.css';
import { PageId } from '../components/layout/Sidebar';

interface ConversationPageProps {
    conversationId: string;
    onBack: () => void;
}

export default function ConversationPage({ conversationId, onBack }: ConversationPageProps) {
    const { user } = useAuth();
    const { messages, isLoading } = useMessages(conversationId);
    const { data: conversationInfo } = useConversationInfo(conversationId);

    // Determine header title and avatar
    const headerTitle = useMemo(() => {
        if (!conversationInfo) return 'Chargement...';
        if (conversationInfo.is_group) return conversationInfo.name || 'Groupe';
        if (conversationInfo.agent_info) return conversationInfo.agent_info.name || 'Agent IA';
        if (conversationInfo.conversation_type === 'agent') return 'Agent IA';

        const otherParticipant = conversationInfo.other_participant ||
            conversationInfo.participants_detail?.find((p: any) => p.username !== user?.username);
        return otherParticipant?.surnom || otherParticipant?.username || 'Conversation';
    }, [conversationInfo, user]);

    const avatarUrl = useMemo(() => {
        if (!conversationInfo) return undefined;
        if (conversationInfo.is_group) return conversationInfo.avatar;

        const otherParticipant = conversationInfo.other_participant ||
            conversationInfo.participants_detail?.find((p: any) => p.username !== user?.username);
        return otherParticipant?.photo_profil_url;
    }, [conversationInfo, user]);

    return (
        <div className="conversation-page">
            {/* Header */}
            <div className="conversation-page__header">
                <button className="conversation-page__back-btn" onClick={onBack}>
                    <IoChevronBackOutline size={24} />
                </button>
                <div className="conversation-page__header-info">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt={headerTitle} className="conversation-page__header-avatar" />
                    ) : (
                        <div className="conversation-page__header-avatar-placeholder">
                            {headerTitle.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="conversation-page__header-text">
                        <span className="conversation-page__header-name">{headerTitle}</span>
                        {/* Optionally add online status dot here */}
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="conversation-page__messages-container">
                {isLoading && messages.length === 0 ? (
                    <div className="conversation-page__loading">Chargement des messages...</div>
                ) : (
                    <div className="conversation-page__messages-list">
                        {messages.map((msg: any, index: number) => {
                            const isMe = msg.sender_uuid === user?.uuid;
                            // Check same sender for grouping
                            const prevMessage = messages[index + 1]; // next older message in array
                            const nextMessage = messages[index - 1]; // newer message in array

                            const isSameSenderAsPrev = prevMessage?.sender_uuid === msg.sender_uuid;
                            const isSameSenderAsNext = nextMessage?.sender_uuid === msg.sender_uuid;

                            // Minimal react-native-web wrapper wrapper to ensure standard block formatting if necessary
                            return (
                                <div key={msg.uuid} className={`conversation-page__message-wrapper ${isMe ? 'mine' : 'theirs'}`}>
                                    <MessageBubble
                                        message={msg}
                                        isMe={isMe}
                                        isFirstInGroup={!isSameSenderAsPrev}
                                        isLastInGroup={!isSameSenderAsNext}
                                        isSameSenderAsPrev={isSameSenderAsPrev}
                                        isSameSenderAsNext={isSameSenderAsNext}
                                        conversationUuid={conversationId}
                                        isGroupConversation={!!conversationInfo?.is_group}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
