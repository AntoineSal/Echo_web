import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { webDatabaseManager } from './webDatabase';
import { webLogger } from '../utils/logger';

const MAX_PAGES = 20;

type ConversationListType = 'private' | 'group' | 'agent';

type SyncMessagesResult = {
    messages: Record<string, unknown>[];
    nextPageUrl: string | null;
};

const conversationSyncInFlight = new Map<string, Promise<void>>();
const latestMessagesSyncInFlight = new Map<string, Promise<void>>();

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

function extractResultsAndNext(payload: unknown): { results: Record<string, unknown>[]; next: string | null } {
    if (Array.isArray(payload)) {
        return { results: payload as Record<string, unknown>[], next: null };
    }

    const objectPayload = payload as Record<string, unknown>;
    return {
        results: (objectPayload.results as Record<string, unknown>[]) || [],
        next: normalizePaginationUrl(objectPayload.next as string | null | undefined),
    };
}

function normalizeConversationTypeForStore(type: ConversationListType): 'direct' | 'group' | 'agent' {
    if (type === 'group') return 'group';
    if (type === 'agent') return 'agent';
    return 'direct';
}

function getConversationEndpoint(type: ConversationListType): string {
    if (type === 'group') return '/messaging/conversations/groups/';
    if (type === 'agent') return '/messaging/conversations/agents/';
    return '/messaging/conversations/private/';
}

async function fetchAllPages(url: string): Promise<Record<string, unknown>[]> {
    const allResults: Record<string, unknown>[] = [];
    let nextUrl: string | null = url;
    let pageCount = 0;

    webLogger.debug('sync', 'Fetching paginated resource', { url });

    while (nextUrl && pageCount < MAX_PAGES) {
        const response = await fetchWithAuth(nextUrl);
        if (!response.ok) {
            webLogger.error('sync', 'Paginated fetch failed', {
                url: nextUrl,
                status: response.status,
            });
            throw new Error(`Failed to fetch paginated resource: ${response.status}`);
        }

        const payload = await response.json();
        const { results, next } = extractResultsAndNext(payload);
        allResults.push(...results);
        webLogger.debug('sync', 'Fetched paginated page', {
            url: nextUrl,
            pageIndex: pageCount,
            count: results.length,
            nextPageUrl: next,
        });
        nextUrl = next;
        pageCount += 1;
    }

    webLogger.info('sync', 'Completed paginated fetch', {
        url,
        pageCount,
        totalCount: allResults.length,
    });

    return allResults;
}

export async function syncConversationsByType(ownerUuid: string, type: ConversationListType): Promise<void> {
    const key = `${ownerUuid}:${type}`;
    const existingSync = conversationSyncInFlight.get(key);
    if (existingSync) {
        webLogger.debug('sync', 'Reusing in-flight conversations sync', { ownerUuid, type });
        return existingSync;
    }

    const syncPromise = (async () => {
        await webDatabaseManager.initialize();
        const endpoint = `${API_BASE_URL}${getConversationEndpoint(type)}`;
        webLogger.info('sync', 'Starting conversations sync', { ownerUuid, type, endpoint });
        const conversations = await fetchAllPages(endpoint);

        conversations.forEach((conversation) => {
            conversation.conversation_type = normalizeConversationTypeForStore(type);
        });

        await webDatabaseManager.upsertConversations(conversations, ownerUuid);
        await webDatabaseManager.deleteConversationsNotInSet(
            ownerUuid,
            normalizeConversationTypeForStore(type),
            new Set(conversations.map((conversation) => String(conversation.uuid || '')))
        );
        webLogger.info('sync', 'Completed conversations sync', {
            ownerUuid,
            type,
            count: conversations.length,
        });
    })().finally(() => {
        conversationSyncInFlight.delete(key);
    });

    conversationSyncInFlight.set(key, syncPromise);
    return syncPromise;
}

async function fetchMessagesPage(url: string): Promise<SyncMessagesResult> {
    webLogger.debug('sync', 'Fetching messages page', { url });
    const response = await fetchWithAuth(url);
    if (!response.ok) {
        webLogger.error('sync', 'Messages page fetch failed', {
            url,
            status: response.status,
        });
        throw new Error(`Failed to fetch messages page: ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload)
        ? payload as Record<string, unknown>[]
        : ((payload.results as Record<string, unknown>[]) || (payload.messages as Record<string, unknown>[]) || []);

    const result = {
        messages: results,
        nextPageUrl: normalizePaginationUrl((payload as Record<string, unknown>).next as string | null | undefined),
    };

    webLogger.debug('sync', 'Fetched messages page', {
        url,
        count: result.messages.length,
        nextPageUrl: result.nextPageUrl,
    });

    return result;
}

export async function syncLatestMessagesForConversation(
    ownerUuid: string,
    conversationUuid: string,
    pageLimit: number = 50
): Promise<void> {
    const key = `${ownerUuid}:${conversationUuid}`;
    const existingSync = latestMessagesSyncInFlight.get(key);
    if (existingSync) {
        webLogger.debug('sync', 'Reusing in-flight latest messages sync', {
            ownerUuid,
            conversationUuid,
        });
        return existingSync;
    }

    const syncPromise = (async () => {
        await webDatabaseManager.initialize();

        const url = `${API_BASE_URL}/messaging/conversations/${conversationUuid}/messages/?limit=${pageLimit}&ordering=-created_at`;
        webLogger.info('sync', 'Starting latest messages sync', {
            ownerUuid,
            conversationUuid,
            url,
            pageLimit,
        });
        const { messages, nextPageUrl } = await fetchMessagesPage(url);
        const withConversationUuid = messages.map((message) => ({
            conversation_uuid: conversationUuid,
            ...message,
        }));

        await webDatabaseManager.upsertMessages(withConversationUuid, ownerUuid);
        
        // Fix: Only update the pagination 'next_page_url' if this is effectively the first page
        // of messages we've ever grabbed, otherwise we destroy the older history cursor!
        const checkPage = await webDatabaseManager.getMessagesPage(conversationUuid, ownerUuid, { limit: pageLimit + 1 });
        if (checkPage.messages.length <= pageLimit) {
            await webDatabaseManager.setSyncState(conversationUuid, ownerUuid, nextPageUrl);
        }
        
        webLogger.info('sync', 'Completed latest messages sync', {
            ownerUuid,
            conversationUuid,
            count: withConversationUuid.length,
            nextPageUrl,
            didOverwriteCursor: checkPage.messages.length <= pageLimit
        });
    })().finally(() => {
        latestMessagesSyncInFlight.delete(key);
    });

    latestMessagesSyncInFlight.set(key, syncPromise);
    return syncPromise;
}

export async function fetchOlderMessagesPageAndPersist(
    ownerUuid: string,
    conversationUuid: string,
    pageUrl: string
): Promise<SyncMessagesResult> {
    await webDatabaseManager.initialize();
    webLogger.info('sync', 'Fetching older messages page', {
        ownerUuid,
        conversationUuid,
        pageUrl,
    });

    const { messages, nextPageUrl } = await fetchMessagesPage(pageUrl);
    const withConversationUuid = messages.map((message) => ({
        conversation_uuid: conversationUuid,
        ...message,
    }));

    await webDatabaseManager.upsertMessages(withConversationUuid, ownerUuid);
    await webDatabaseManager.setSyncState(conversationUuid, ownerUuid, nextPageUrl);

    webLogger.info('sync', 'Persisted older messages page', {
        ownerUuid,
        conversationUuid,
        count: withConversationUuid.length,
        nextPageUrl,
    });

    return {
        messages: withConversationUuid,
        nextPageUrl,
    };
}
