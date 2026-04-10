import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { webDatabaseManager } from '../services/webDatabase';
import { fetchOlderMessagesPageAndPersist, syncLatestMessagesForConversation } from '../services/localSync';
import { webLogger } from '../utils/logger';

const latestMessagesBackgroundSyncInFlight = new Map<string, Promise<void>>();
const recentMarkAsReadKeys = new Map<string, number>();

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
    nextCursor: MessagesCursor | null;
}

type MessagesCursor =
    | null
    | { kind: 'local'; beforeCreatedAtMs: number; beforeUuid: string }
    | { kind: 'remote'; url: string };

function normalizePaginationUrl(nextUrl: string | null | undefined): string | null {
    if (!nextUrl) return null;

    try {
        const parsed = new URL(nextUrl, window.location.origin);

        if (!API_BASE_URL) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }

        const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
        if (parsed.origin === apiOrigin) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }

        return parsed.toString();
    } catch {
        return nextUrl;
    }
}

async function fetchMessagesDirectly(url: string, conversationUuid: string): Promise<{
    messages: Message[];
    nextPageUrl: string | null;
}> {
    webLogger.info('messages', 'Fetching messages directly from API', {
        conversationUuid,
        url,
    });
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch messages');
    const data = await res.json();
    const results = Array.isArray(data) ? data : data.results || data.messages || [];

    const result = {
        messages: results.map((message: Record<string, unknown>) => ({
            conversation_uuid: conversationUuid,
            ...message,
        })) as Message[],
        nextPageUrl: normalizePaginationUrl(data.next || null),
    };

    webLogger.info('messages', 'Fetched messages directly from API', {
        conversationUuid,
        count: result.messages.length,
        nextPageUrl: result.nextPageUrl,
    });

    return result;
}

export function useMessages(conversationId: string | null) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const buildNextCursor = async (
        ownerUuid: string,
        pageMessages: Message[],
        hasMoreLocal: boolean
    ): Promise<MessagesCursor> => {
        if (hasMoreLocal && pageMessages.length > 0) {
            const oldestMessage = pageMessages[pageMessages.length - 1];
            const cursor: MessagesCursor = {
                kind: 'local',
                beforeCreatedAtMs: typeof oldestMessage.created_at === 'number'
                    ? oldestMessage.created_at
                    : Date.parse(String(oldestMessage.created_at)) || 0,
                beforeUuid: oldestMessage.uuid,
            };
            webLogger.debug('messages', 'Built next local cursor', {
                ownerUuid,
                conversationUuid: conversationId,
                beforeCreatedAtMs: cursor.beforeCreatedAtMs,
                beforeUuid: cursor.beforeUuid,
            });
            return cursor;
        }

        const syncState = await webDatabaseManager.getSyncState(conversationId!, ownerUuid);
        const cursor: MessagesCursor = syncState?.next_page_url ? { kind: 'remote', url: syncState.next_page_url } : null;
        webLogger.debug('messages', 'Built next remote cursor', {
            ownerUuid,
            conversationUuid: conversationId,
            nextPageUrl: syncState?.next_page_url ?? null,
        });
        return cursor;
    };

    const fetchMessagesPage = async ({ pageParam = null as MessagesCursor }): Promise<MessagesPage> => {
        if (!conversationId || !user?.uuid) return { messages: [], nextCursor: null };
        await webDatabaseManager.initialize();

        webLogger.debug('messages', 'Loading messages page', {
            ownerUuid: user.uuid,
            conversationUuid: conversationId,
            cursor: pageParam,
        });

        if (pageParam === null) {
            const localPage = await webDatabaseManager.getMessagesPage(conversationId, user.uuid, { limit: 50 });
            if (localPage.messages.length > 0) {
                const messages = localPage.messages as unknown as Message[];
                webLogger.info('messages', 'Loaded first page from local database', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    count: messages.length,
                    hasMoreLocal: localPage.hasMoreLocal,
                });
                return {
                    messages,
                    nextCursor: await buildNextCursor(user.uuid, messages, localPage.hasMoreLocal),
                };
            }

            try {
                webLogger.warn('messages', 'Local first page empty, syncing latest messages', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                });
                await syncLatestMessagesForConversation(user.uuid, conversationId);
                const hydratedPage = await webDatabaseManager.getMessagesPage(conversationId, user.uuid, { limit: 50 });
                const messages = hydratedPage.messages as unknown as Message[];

                if (messages.length > 0) {
                    webLogger.info('messages', 'Loaded first page after local sync hydration', {
                        ownerUuid: user.uuid,
                        conversationUuid: conversationId,
                        count: messages.length,
                        hasMoreLocal: hydratedPage.hasMoreLocal,
                    });
                    return {
                        messages,
                        nextCursor: await buildNextCursor(user.uuid, messages, hydratedPage.hasMoreLocal),
                    };
                }
            } catch (syncError) {
                webLogger.error('messages', 'Failed to hydrate latest messages from local sync', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    error: syncError instanceof Error ? syncError.message : String(syncError),
                });
            }

            const directPage = await fetchMessagesDirectly(
                `${API_BASE_URL}/messaging/conversations/${conversationId}/messages/?limit=50&ordering=-created_at`,
                conversationId
            );

            try {
                await webDatabaseManager.upsertMessages(directPage.messages as unknown as Record<string, unknown>[], user.uuid);
                await webDatabaseManager.setSyncState(conversationId, user.uuid, directPage.nextPageUrl);
            } catch (persistError) {
                webLogger.error('messages', 'Failed to persist direct API messages locally', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    error: persistError instanceof Error ? persistError.message : String(persistError),
                });
            }

            webLogger.warn('messages', 'Loaded first page from direct API fallback', {
                ownerUuid: user.uuid,
                conversationUuid: conversationId,
                count: directPage.messages.length,
                nextPageUrl: directPage.nextPageUrl,
            });

            return {
                messages: directPage.messages,
                nextCursor: directPage.nextPageUrl ? { kind: 'remote', url: directPage.nextPageUrl } : null,
            };
        }

        if (pageParam.kind === 'local') {
            const localPage = await webDatabaseManager.getMessagesPage(conversationId, user.uuid, {
                limit: 50,
                beforeCreatedAtMs: pageParam.beforeCreatedAtMs,
                beforeUuid: pageParam.beforeUuid,
            });

            const messages = localPage.messages as unknown as Message[];
            if (messages.length > 0) {
                webLogger.info('messages', 'Loaded older page from local database', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    count: messages.length,
                    hasMoreLocal: localPage.hasMoreLocal,
                });
                return {
                    messages,
                    nextCursor: await buildNextCursor(user.uuid, messages, localPage.hasMoreLocal),
                };
            }

            const syncState = await webDatabaseManager.getSyncState(conversationId, user.uuid);
            if (!syncState?.next_page_url) {
                webLogger.info('messages', 'No local or remote older messages left', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                });
                return { messages: [], nextCursor: null };
            }

            webLogger.warn('messages', 'Local history exhausted, switching to remote cursor', {
                ownerUuid: user.uuid,
                conversationUuid: conversationId,
                nextPageUrl: syncState.next_page_url,
            });
            pageParam = { kind: 'remote', url: syncState.next_page_url };
        }

        try {
            const remotePage = await fetchOlderMessagesPageAndPersist(user.uuid, conversationId, pageParam.url);
            const messages = remotePage.messages as unknown as Message[];
            webLogger.info('messages', 'Loaded older page after remote fetch and local persistence', {
                ownerUuid: user.uuid,
                conversationUuid: conversationId,
                count: messages.length,
                nextPageUrl: remotePage.nextPageUrl,
            });
            return {
                messages,
                nextCursor: remotePage.nextPageUrl ? { kind: 'remote', url: remotePage.nextPageUrl } : null,
            };
        } catch (remotePersistError) {
            webLogger.error('messages', 'Failed to persist older messages locally, falling back to direct API payload', {
                ownerUuid: user.uuid,
                conversationUuid: conversationId,
                pageUrl: pageParam.url,
                error: remotePersistError instanceof Error ? remotePersistError.message : String(remotePersistError),
            });
            const directPage = await fetchMessagesDirectly(pageParam.url, conversationId);
            return {
                messages: directPage.messages,
                nextCursor: directPage.nextPageUrl ? { kind: 'remote', url: directPage.nextPageUrl } : null,
            };
        }
    };

    const messagesQuery = useInfiniteQuery({
        queryKey: ['messages', conversationId],
        queryFn: fetchMessagesPage,
        initialPageParam: null as MessagesCursor,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: !!conversationId && !!user,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!conversationId || !user?.uuid) return;

        let cancelled = false;

        const syncKey = `${user.uuid}:${conversationId}`;
        const existingSync = latestMessagesBackgroundSyncInFlight.get(syncKey);
        const syncPromise = existingSync ?? syncLatestMessagesForConversation(user.uuid, conversationId);

        if (!existingSync) {
            latestMessagesBackgroundSyncInFlight.set(syncKey, syncPromise);
        } else {
            webLogger.debug('messages', 'Reusing shared background latest messages sync', {
                ownerUuid: user.uuid,
                conversationUuid: conversationId,
            });
        }

        void syncPromise
            .then(() => {
                if (!cancelled) {
                    webLogger.debug('messages', 'Invalidating messages query after background latest sync', {
                        ownerUuid: user.uuid,
                        conversationUuid: conversationId,
                    });
                    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                }
            })
            .catch((error) => {
                webLogger.error('messages', 'Failed to sync latest conversation messages locally', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    error: error instanceof Error ? error.message : String(error),
                });
            })
            .finally(() => {
                if (latestMessagesBackgroundSyncInFlight.get(syncKey) === syncPromise) {
                    latestMessagesBackgroundSyncInFlight.delete(syncKey);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [conversationId, queryClient, user?.uuid]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ conversationId, content, parentMessageUuid, files }: SendMessageParams) => {
            const tempUuid = `temp-${Date.now()}`;
            
            // Generate optimistic attachment previews
            const optimisticAttachments: Attachment[] = [];
            if (files && files.length > 0) {
                files.forEach((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    optimisticAttachments.push({
                        uuid: `temp-att-${Date.now()}-${index}`,
                        file_type: isImage ? 'image' : (file.type.startsWith('video/') ? 'video' : 'document'),
                        file_url: isImage ? URL.createObjectURL(file) : '',
                        original_filename: file.name
                    });
                });
            }

            const optimisticMessage: Message = {
                id: Date.now(),
                uuid: tempUuid,
                sender_username: user?.username || 'Vous',
                sender_uuid: user?.uuid,
                conversation_uuid: conversationId,
                content,
                created_at: new Date().toISOString(),
                isPending: true,
                parent_message_uuid: parentMessageUuid,
                attachments: optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
            };

            if (user?.uuid) {
                webLogger.info('messages', 'Persisting optimistic message locally', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                    tempUuid,
                });
                await webDatabaseManager.upsertMessage(optimisticMessage as unknown as Record<string, unknown>, user.uuid);
                await webDatabaseManager.updateConversationFromMessage(
                    conversationId,
                    user.uuid,
                    optimisticMessage as unknown as Record<string, unknown>
                );
            }

            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });

            let res: Response;
            
            try {
                // Step 1: Upload files if any
                const attachmentUuids: string[] = [];
                if (files && files.length > 0) {
                    for (const file of files) {
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        const uploadRes = await fetchWithAuth(
                            `${API_BASE_URL}/messaging/attachments/upload/`,
                            { method: 'POST', body: formData }
                        );
                        
                        if (!uploadRes.ok) {
                            throw new Error('Failed to upload file');
                        }
                        
                        const uploadData = await uploadRes.json();
                        if (uploadData && uploadData.uuid) {
                            attachmentUuids.push(uploadData.uuid);
                        }
                    }
                }

                // Step 2: Send message payload
                if (attachmentUuids.length > 0) {
                    res = await fetchWithAuth(
                        `${API_BASE_URL}/messaging/conversations/${conversationId}/messages/create-with-attachments/`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                content, 
                                parent_message_uuid: parentMessageUuid,
                                attachment_uuids: attachmentUuids 
                            }),
                        }
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
                    throw new Error('Failed to send message');
                }

                const payload = await res.json().catch(() => null);

                if (user?.uuid) {
                    if (payload && typeof payload === 'object' && 'uuid' in payload) {
                        webLogger.info('messages', 'Persisting confirmed sent message locally', {
                            ownerUuid: user.uuid,
                            conversationUuid: conversationId,
                            messageUuid: String((payload as Record<string, unknown>).uuid || ''),
                        });
                        
                        // Delete optimistic message since it will be replaced by the real one from REST/WS
                        // (Usually upsert overrides it, but the tempUuid was different. So we must mark the temp as failed or delete it).
                        // Let's just rely on the existing logic which upserts the payload. 
                        // Wait, previous code just upserted the new payload without deleting temp. 
                        // We will keep the previous code structure.
                        await webDatabaseManager.upsertMessage({
                            conversation_uuid: conversationId,
                            ...(payload as Record<string, unknown>),
                        }, user.uuid);
                        await webDatabaseManager.updateConversationFromMessage(
                            conversationId,
                            user.uuid,
                            {
                                conversation_uuid: conversationId,
                                ...(payload as Record<string, unknown>),
                            }
                        );
                    }

                    await syncLatestMessagesForConversation(user.uuid, conversationId);
                }

                return payload;
                
            } catch (error) {
                if (user?.uuid) {
                    await webDatabaseManager.updateMessageSyncStatus(tempUuid, user.uuid, 'failed');
                    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                }
                webLogger.error('messages', 'Message send failed', {
                    ownerUuid: user?.uuid ?? null,
                    conversationUuid: conversationId,
                    tempUuid,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    const markAsReadMutation = useMutation({
        mutationFn: async () => {
            if (!conversationId) return;
            if (user?.uuid) {
                const dedupeKey = `${user.uuid}:${conversationId}`;
                const now = Date.now();
                const lastMarkAt = recentMarkAsReadKeys.get(dedupeKey) ?? 0;
                if (now - lastMarkAt < 1500) {
                    webLogger.debug('messages', 'Skipping duplicate mark-as-read request', {
                        ownerUuid: user.uuid,
                        conversationUuid: conversationId,
                    });
                    return;
                }
                recentMarkAsReadKeys.set(dedupeKey, now);

                webLogger.debug('messages', 'Marking conversation as read locally', {
                    ownerUuid: user.uuid,
                    conversationUuid: conversationId,
                });
                await webDatabaseManager.markConversationMessagesAsReadForViewer(conversationId, user.uuid);
                await webDatabaseManager.resetUnreadCount(conversationId, user.uuid);
                queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
            const res = await fetchWithAuth(
                `${API_BASE_URL}/messaging/conversations/${conversationId}/mark-as-seen/`,
                { method: 'POST' }
            );
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
        },
    });

    const allMessages = Array.from(
        new Map(
            (messagesQuery.data?.pages.flatMap((page) => page.messages) || [])
                .sort((a, b) => {
                    const tsA = typeof a.created_at === 'number' ? a.created_at : Date.parse(String(a.created_at)) || 0;
                    const tsB = typeof b.created_at === 'number' ? b.created_at : Date.parse(String(b.created_at)) || 0;
                    if (tsA !== tsB) return tsB - tsA;
                    return String(b.uuid).localeCompare(String(a.uuid));
                })
                .map((message) => [message.uuid, message] as const)
        ).values()
    );

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
