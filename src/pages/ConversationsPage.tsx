import React from 'react';
import { ConversationThread } from '../components/conversations/ConversationThread';
import PlaceholderPage from './PlaceholderPage';
import type { Conversation } from '../hooks/useConversations';

interface ConversationsPageProps {
    selectedConversation: Conversation | null;
}

export default function ConversationsPage({ selectedConversation }: ConversationsPageProps) {
    if (!selectedConversation) {
        return (
            <PlaceholderPage 
                title="Conversations" 
                description="Sélectionnez une conversation dans le panneau latéral pour commencer à discuter." 
            />
        );
    }

    return (
        <ConversationThread
            key={selectedConversation.uuid} // Reset state when conversation changes
            conversationId={selectedConversation.uuid}
            conversationName={selectedConversation.name}
            conversationAvatar={selectedConversation.avatar_url}
        />
    );
}
