import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';

export interface Attachment {
    uuid: string;
    file_type: string;
    file_url: string;
    thumbnail_url?: string;
    original_filename?: string;
    duration?: number;
}

export interface FormField {
    id: string;
    type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
    label: string;
    placeholder?: string;
    required: boolean;
    options?: string[];
    min?: number;
    max?: number;
}

export interface FormFieldResponse {
    value: string | number | boolean;
    filled_by: { user_uuid: string; username: string };
    filled_at: string;
}

export interface InteractiveMessageData {
    is_interactive: boolean;
    form_data?: {
        fields: FormField[];
        responses: Record<string, FormFieldResponse>;
    };
    can_submit?: boolean;
    initiator_uuid?: string;
    initiator_username?: string;
    agent_uuid?: string;
    hidden_meta?: { is_form_response: boolean; agent_uuid: string };
}

export interface Message {
    id: number;
    uuid: string;
    sender_username: string;
    sender_uuid?: string;
    sender_avatar_url?: string;
    content: string;
    created_at: string | number;
    is_read?: boolean;
    is_ai_generated?: boolean;
    message_type?: 'user' | 'system' | 'ai_generated' | string;
    conversation_uuid?: string;
    attachments?: Attachment[];
    parent_message_uuid?: string | null;
    interactive_data?: InteractiveMessageData;
    // Agent metadata
    framework_agent_name?: string;
    framework_agent_uuid?: string;
    agent_info?: { name?: string; uuid?: string };
    ai_agent_name?: string;
    ai_agent_uuid?: string;
    // Optimistic flags
    isPending?: boolean;
    sendError?: boolean;
    deliveredButNotRead?: boolean;
}

interface SendMessageParams {
    conversationId: string;
    content: string;
    parentMessageUuid?: string | null;
    files?: File[];
}

interface MessagesPage {
    messages: Message[];
    nextPageUrl: string | null;
}

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const fetchMessagesPage = async ({ pageParam = null as string | null }): Promise<MessagesPage> => {
        if (!conversationId) return { messages: [], nextPageUrl: null };
        const url = pageParam || `${API_BASE_URL}/messaging/conversations/${conversationId}/messages/?limit=50&ordering=-created_at`;
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error('Failed to fetch messages');
        const data = await res.json();
        const results = Array.isArray(data) ? data : data.results || data.messages || [];
        return {
            messages: results,
            nextPageUrl: data.next || null,
        };
    };

    const messagesQuery = useInfiniteQuery({
        queryKey: ['messages', conversationId],
        queryFn: fetchMessagesPage,
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => lastPage.nextPageUrl,
        enabled: !!conversationId && !!user,
        staleTime: 60_000,
        refetchOnWindowFocus: true,
    });

    const sendMessageMutation = useMutation({
        mutationFn: async ({ conversationId, content, parentMessageUuid, files }: SendMessageParams) => {
            const tempUuid = `temp-${Date.now()}`;

            // Optimistic update
            queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
                if (!oldData) return oldData;
                const newMessage: Message = {
                    id: Date.now(),
                    uuid: tempUuid,
                    sender_username: user?.username || 'Vous',
                    sender_uuid: user?.uuid,
                    content,
                    created_at: new Date().toISOString(),
                    isPending: true,
                    parent_message_uuid: parentMessageUuid,
                };
                const newPages = [...oldData.pages];
                const firstPage = { ...newPages[0] };
                firstPage.messages = [newMessage, ...firstPage.messages];
                newPages[0] = firstPage;
                return { ...oldData, pages: newPages };
            });

            let res: Response;

            if (files && files.length > 0) {
                // Send with attachments
                const formData = new FormData();
                if (content.trim()) formData.append('content', content);
                if (parentMessageUuid) formData.append('parent_message_uuid', parentMessageUuid);
                files.forEach((file) => formData.append('files', file));
                res = await fetchWithAuth(
                    `${API_BASE_URL}/messaging/conversations/${conversationId}/messages/create-with-attachments/`,
                    { method: 'POST', body: formData }
                );
            } else {
                res = await fetchWithAuth(
                    `${API_BASE_URL}/messaging/conversations/${conversationId}/messages/create/`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content, parent_message_uuid: parentMessageUuid }),
                    }
                );
            }

            if (!res.ok) {
                // Mark optimistic message as failed
                queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
                    if (!oldData) return oldData;
                    const newPages = oldData.pages.map((page: MessagesPage) => ({
                        ...page,
                        messages: page.messages.map((m: Message) =>
                            m.uuid === tempUuid ? { ...m, isPending: false, sendError: true } : m
                        ),
                    }));
                    return { ...oldData, pages: newPages };
                });
                throw new Error('Failed to send message');
            }

            return await res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
        },
    });

    const markAsReadMutation = useMutation({
        mutationFn: async () => {
            if (!conversationId) return;
            const res = await fetchWithAuth(
                `${API_BASE_URL}/messaging/conversations/${conversationId}/mark-as-seen/`,
                { method: 'POST' }
            );
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
        },
    });

    const allMessages = messagesQuery.data?.pages.flatMap((p) => p.messages) || [];

    return {
        messages: allMessages,
        isLoading: messagesQuery.isLoading,
        isFetchingMore: messagesQuery.isFetchingNextPage,
        hasMore: messagesQuery.hasNextPage,
        loadMore: messagesQuery.fetchNextPage,
        sendMessage: sendMessageMutation,
        markAsRead: markAsReadMutation.mutate,
    };
}
