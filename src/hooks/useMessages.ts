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
    message_type?: string;
    conversation_uuid?: string;
    attachments?: Attachment[];
    
    // For threads
    parent_message_uuid?: string | null;
    
    // Optimistic flags
    isPending?: boolean;
    sendError?: boolean;
}

interface SendMessageParams {
    conversationId: string;
    content: string;
    parentMessageUuid?: string | null;
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
        
        if (!res.ok) {
            throw new Error('Failed to fetch messages');
        }
        
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

    // Send message via POST
    const sendMessageMutation = useMutation({
        mutationFn: async ({ conversationId, content, parentMessageUuid }: SendMessageParams) => {
            const tempUuid = `temp-${Date.now()}`;
            
            // Optimistic update
            queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
                if (!oldData) return oldData;
                
                const newMessage: Message = {
                    id: Date.now(),
                    uuid: tempUuid,
                    sender_username: user?.username || 'You',
                    sender_uuid: user?.uuid,
                    sender_avatar_url: user?.photo_profil_url,
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

            // Make the actual call
            // Notice: The backend endpoint might be /messaging/conversations/{id}/messages/ or we might need to send to WS.
            // Let's assume there is a POST endpoint. If not, we'll fall back to WS in the component or update this.
            const res = await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/${conversationId}/messages/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content,
                    message: content, // Sometimes it's message, sometimes content
                    parent_message_uuid: parentMessageUuid 
                }),
            });

            if (!res.ok) {
                // Remove optimistic message on error
                queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
                    if (!oldData) return oldData;
                    const newPages = [...oldData.pages];
                    const firstPage = { ...newPages[0] };
                    firstPage.messages = firstPage.messages.filter((m: Message) => m.uuid !== tempUuid);
                    newPages[0] = firstPage;
                    return { ...oldData, pages: newPages };
                });
                throw new Error('Failed to send message');
            }

            return await res.json();
        },
        onSuccess: (data, variables) => {
            // Invalidate to get the real message UUID from server, or let WS handle it
            // WS will broadcast message so it's usually fine
            queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
        }
    });

    const markAsReadMutation = useMutation({
        mutationFn: async () => {
            if (!conversationId) return;
            const res = await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/${conversationId}/seen/`, {
                method: 'POST',
            });
            if (res.ok) {
                 queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
        }
    });

    // Flatten pages into a single array
    const allMessages = messagesQuery.data?.pages.flatMap(p => p.messages) || [];

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
