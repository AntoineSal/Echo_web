import { useCallback } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

export function useWebSocketMessages(conversationId: string | null) {
    const { isConnected, sendWsMessage } = useWebSocketContext();

    const sendTypingStart = useCallback(() => {
        if (!conversationId) return;
        sendWsMessage({ type: 'typing_start', conversation_uuid: conversationId });
    }, [conversationId, sendWsMessage]);

    const sendTypingStop = useCallback(() => {
        if (!conversationId) return;
        sendWsMessage({ type: 'typing_stop', conversation_uuid: conversationId });
    }, [conversationId, sendWsMessage]);

    return {
        isConnected,
        sendTypingStart,
        sendTypingStop,
        typingUsers: [] as string[],
    };
}
