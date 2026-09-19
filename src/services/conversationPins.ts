import type { Conversation } from '../hooks/useConversations';

const STORAGE_PREFIX = 'echo:pinned-conversations:';
export const CONVERSATION_PINS_EVENT = 'echo:conversation-pins-changed';

const storageKey = (ownerUuid: string) => `${STORAGE_PREFIX}${ownerUuid}`;

export function getPinnedConversationUuids(ownerUuid?: string): string[] {
    if (!ownerUuid) return [];
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(ownerUuid)) || '[]');
        return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export function isConversationPinned(ownerUuid: string | undefined, conversationUuid: string): boolean {
    return getPinnedConversationUuids(ownerUuid).includes(conversationUuid);
}

export function setConversationPinned(ownerUuid: string, conversation: Conversation, pinned: boolean): void {
    const current = new Set(getPinnedConversationUuids(ownerUuid));
    if (pinned) current.add(conversation.uuid);
    else current.delete(conversation.uuid);
    localStorage.setItem(storageKey(ownerUuid), JSON.stringify([...current]));
    window.dispatchEvent(new CustomEvent(CONVERSATION_PINS_EVENT, { detail: { conversationUuid: conversation.uuid, pinned } }));
}
