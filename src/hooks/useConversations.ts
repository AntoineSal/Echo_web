// Web useConversations hook — aligned with mobile API response fields
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
    conversation_type: 'direct' | 'group' | 'agent' | 'group_chat' | 'ai_agent';

    last_message?: {
        content: string;
        created_at: string | null;
        sender_username: string;
    };

    // Direct conversation — API returns `other_participant`
    other_participant?: {
        username: string;
        surnom?: string;
        uuid?: string;
        photo_profil_url?: string;
        photo_profil?: string | null;
        is_online?: boolean;
    };

    // Group conversation
    group_info?: {
        uuid?: string;
        name: string;
        avatar: string | null;
        member_count?: number;
    };

    // Agent conversation
    framework_agent?: {
        name: string;
        avatar_url: string;
        uuid?: string;
        agent_type?: string;
        description?: string;
    };

    // Some API versions return agent data under agent_info
    agent_info?: {
        uuid?: string;
        name?: string;
        avatar_url?: string;
    };

    // Legacy / fallback fields from older API versions
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

    // Computed display fields (filled by enrichConversation)
    name: string;
    avatar_url: string;
}

const MAX_PAGES = 20;

function extractResultsAndNext(payload: unknown): { results: Conversation[]; next: string | null } {
    if (Array.isArray(payload)) return { results: payload as Conversation[], next: null };
    const p = payload as Record<string, unknown>;
    return {
        results: (p.results as Conversation[]) || [],
        next: (p.next as string) || null,
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

function normalizeConvType(conv: Conversation): 'direct' | 'group' | 'agent' {
    const t = conv.conversation_type as string;
    if (t === 'group_chat' || t === 'group') return 'group';
    if (t === 'ai_agent' || t === 'agent') return 'agent';
    return 'direct';
}

function computeDisplayName(conv: Conversation): string {
    if (conv.conversation_type === 'group') {
        return conv.group_info?.name || conv.group_name || 'Groupe';
    }
    if (conv.conversation_type === 'agent') {
        return (
            conv.framework_agent?.name ||
            conv.agent_info?.name ||
            (conv as any).ai_agent?.name ||
            (conv as any).agent?.name ||
            'Agent'
        );
    }
    // Direct conversation — prefer other_participant (current API), fall back to other_user (legacy)
    const p = conv.other_participant;
    const u = conv.other_user;
    return p?.surnom || p?.username || u?.username || 'Utilisateur';
}

function computeAvatarUrl(conv: Conversation): string {
    if (conv.conversation_type === 'group') {
        return conv.group_info?.avatar || conv.group_photo_url || conv.group_photo || '';
    }
    if (conv.conversation_type === 'agent') {
        return (
            conv.framework_agent?.avatar_url ||
            conv.agent_info?.avatar_url ||
            (conv as any).ai_agent?.avatar_url ||
            ''
        );
    }
    const p = conv.other_participant;
    const u = conv.other_user;
    return p?.photo_profil_url || u?.photo_profil_url || u?.photo_profil || '';
}

function enrichConversation(conv: Conversation): Conversation {
    const normalizedType = normalizeConvType(conv);
    return {
        ...conv,
        conversation_type: normalizedType,
        name: computeDisplayName({ ...conv, conversation_type: normalizedType }),
        avatar_url: computeAvatarUrl({ ...conv, conversation_type: normalizedType }),
    };
}

export function useConversations() {
    const { isLoggedIn } = useAuth();
    const queryClient = useQueryClient();

    const privateQuery = useQuery({
        queryKey: ['conversations', 'private'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/private/');
            return convs.map(enrichConversation);
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const groupQuery = useQuery({
        queryKey: ['conversations', 'groups'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/groups/');
            return convs.map(enrichConversation);
        },
        enabled: isLoggedIn,
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const agentQuery = useQuery({
        queryKey: ['conversations', 'agents'],
        queryFn: async () => {
            const convs = await fetchAllPages('/messaging/conversations/agents/');
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
        isRefetching: privateQuery.isRefetching || groupQuery.isRefetching || agentQuery.isRefetching,
        error: privateQuery.error || groupQuery.error || agentQuery.error,
        refreshAll,
    };
}
