// Web version of useJarvisSuggestions — swaps Ionicons for react-icons/io5 names
import { useMemo } from 'react';
import type { MessageSummary } from './useNotificationsSummary';
import { useAuth } from '../contexts/AuthContext';
import { useFriendRequests } from './useFriendRequests';
import { useGroupInvitations } from './useGroupInvitations';

export interface JarvisSuggestion {
    id: string;
    title: string;
    iconName: string; // react-icons Io5 icon name (e.g. 'IoChatbubbleEllipsesOutline')
    color: string;
    action: {
        type: 'navigate_conversation' | 'navigate_friend_requests' | 'navigate_group_invitations';
        conversationUuid?: string;
        initialText?: string;
        autoSend?: boolean;
    };
}

export const useJarvisSuggestions = (unreadSummaries: MessageSummary[]): JarvisSuggestion[] => {
    const { user } = useAuth();
    const { friendRequests } = useFriendRequests();
    const { groupInvitations } = useGroupInvitations();

    const suggestions = useMemo(() => {
        if (!user) return [];

        const items: JarvisSuggestion[] = [];

        // 1. Unread Messages
        const firstUnread = unreadSummaries.find(
            s => s.conversationUuid && s.id !== '0' && s.sender !== 'Messages'
        );
        if (firstUnread?.conversationUuid) {
            items.push({
                id: `unread_${firstUnread.conversationUuid}`,
                title: `Répondre à ${firstUnread.sender.split(' ')[0]}`,
                iconName: 'IoChatbubbleEllipsesOutline',
                color: '#0A9168',
                action: {
                    type: 'navigate_conversation',
                    conversationUuid: firstUnread.conversationUuid,
                },
            });
        }

        // 2. Pending Invitations
        if (friendRequests.length > 0) {
            items.push({
                id: 'pending_friends',
                title: 'Voir vos demandes d\'amis',
                iconName: 'IoPersonAddOutline',
                color: '#7C3AED',
                action: { type: 'navigate_friend_requests' },
            });
        } else if (groupInvitations.length > 0) {
            items.push({
                id: 'pending_groups',
                title: 'Voir vos invitations de groupe',
                iconName: 'IoPeopleOutline',
                color: '#7C3AED',
                action: { type: 'navigate_group_invitations' },
            });
        }

        // 3. Default Suggestion
        if (items.length < 2) {
            items.push({
                id: 'jarvis_general',
                title: 'Organiser ma semaine',
                iconName: 'IoCalendarOutline',
                color: '#3B82F6',
                action: {
                    type: 'navigate_conversation',
                    conversationUuid: 'jarvis',
                    initialText: 'Pouvons-nous organiser ma semaine ?',
                },
            });
        }

        return items.slice(0, 3);
    }, [user, unreadSummaries, friendRequests.length, groupInvitations.length]);

    return suggestions;
};
