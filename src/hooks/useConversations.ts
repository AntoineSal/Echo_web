// Web useConversations hook — simplified from mobile (API-only, no SQLite)
// Uses react-query + fetchWithAuth

import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

export interface Conversation {
    uuid: string;
    unread_count: number;
    is_pinned?: boolean;
    is_muted?: boolean;
    is_archived?: boolean;
    created_at?: string;
    updated_at?: string;
    last_message?: {
        content: string;
        created_at: string | null;
        sender_username: string;
    };
    conversation_type: 'direct' | 'group' | 'agent';
    other_user?: {
        username: string;
        uuid: string;
        photo_profil?: string | null;
        photo_profil_url?: string;
    };
    group_name?: string;
    group_photo?: string | null;
    group_photo_url?: string;
    members_count?: number;
    framework_agent?: {
        name: string;
        avatar_url: string;
        uuid?: string;
        agent_type?: string;
        description?: string;
    };
    // Computed display fields
    name: string;
    avatar_url: string;
}

const MAX_PAGES = 20;

function extractResultsAndNext(payload: Record<string, unknown>): { results: Conversation[]; next: string | null } {
    if (Array.isArray(payload)) return { results: payload, next: null };
    return {
        results: (payload.results as Conversation[]) || [],
        next: (payload.next as string) || null,
    };
}

async function fetchAllPages(endpoint: string): Promise<Conversation[]> {
    let url = `${API_BASE_URL}${endpoint}`;
    let all: Conversation[] = [];
    let pages = 0;

    while (url && pages < MAX_PAGES) {
        const res = await fetchWithAuth(url);
        if (!res.ok) break;
        const data = await res.json();
        const { results, next } = extractResultsAndNext(data);
        all = all.concat(results);
        url = next || '';
        pages++;
    }

    return all;
}

function computeDisplayName(conv: Conversation): string {
    if (conv.conversation_type === 'group') return conv.group_name || 'Groupe';
    if (conv.conversation_type === 'agent') return conv.framework_agent?.name || 'Agent';
    return conv.other_user?.username || 'Utilisateur';
}

function computeAvatarUrl(conv: Conversation): string {
    if (conv.conversation_type === 'group') return conv.group_photo_url || '';
    if (conv.conversation_type === 'agent') return conv.framework_agent?.avatar_url || '';
    return conv.other_user?.photo_profil_url || conv.other_user?.photo_profil || '';
}

function enrichConversation(conv: Conversation): Conversation {
    return {
        ...conv,
        name: computeDisplayName(conv),
        avatar_url: computeAvatarUrl(conv),
    };
}

export function useConversations() {
    const { isLoggedIn } = useAuth();
    const queryClient = useQueryClient();

    const privateQuery = useQuery({
        queryKey: ['conversations', 'private'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/?type=private');
            return convs.map(enrichConversation);
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const groupQuery = useQuery({
        queryKey: ['conversations', 'groups'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/?type=group');
            return convs.map(enrichConversation);
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const agentQuery = useQuery({
        queryKey: ['conversations', 'agents'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/?type=agent');
            return convs.map(enrichConversation);
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const refreshAll = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['conversations', 'private'] }),
            queryClient.invalidateQueries({ queryKey: ['conversations', 'groups'] }),
            queryClient.invalidateQueries({ queryKey: ['conversations', 'agents'] }),
        ]);
    };

    return {
        privateConversations: privateQuery.data ?? [],
        groupConversations: groupQuery.data ?? [],
        agentConversations: agentQuery.data ?? [],
        isLoading: privateQuery.isLoading || groupQuery.isLoading || agentQuery.isLoading,
        error: privateQuery.error || groupQuery.error || agentQuery.error,
        refreshAll,
    };
}
