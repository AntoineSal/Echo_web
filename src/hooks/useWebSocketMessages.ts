import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@mobile/config/api';
import { useAuth } from '../contexts/AuthContext';

// Derive WS URL from HTTP URL
const API_BASE_WS_URL = API_BASE_URL.replace('http:', 'ws:').replace('https:', 'wss:');

export function useWebSocketMessages(conversationId: string | null) {
    const { user, accessToken } = useAuth();
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const typingUsersRef = useRef<Set<string>>(new Set());

    const connect = useCallback(() => {
        if (!conversationId || !user) return;
        
        // Use the same URL structure as mobile
        const wsUrl = `${API_BASE_WS_URL}/chat/${conversationId}/?token=${accessToken || ''}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WS] Connected to chat ${conversationId}`);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'chat_message') {
                    // Update the messages cache
                    queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
                        if (!oldData || !oldData.pages) return oldData;
                        
                        const newMsg = data.message;
                        // Avoid duplicates if we optimistically added it
                        const newPages = [...oldData.pages];
                        const firstPage = { ...newPages[0] };
                        
                        // Small check to replace temp message or add new
                        const existingIdx = firstPage.messages.findIndex((m: any) => m.uuid === newMsg.uuid || (m.isPending && m.content === newMsg.content));
                        
                        if (existingIdx >= 0) {
                            firstPage.messages[existingIdx] = { ...firstPage.messages[existingIdx], ...newMsg, isPending: false };
                        } else {
                            firstPage.messages = [newMsg, ...firstPage.messages];
                        }
                        
                        newPages[0] = firstPage;
                        return { ...oldData, pages: newPages };
                    });
                } else if (data.type === 'typing_start') {
                    if (data.user_uuid && data.user_uuid !== user.uuid) {
                        typingUsersRef.current.add(data.user_uuid);
                    }
                } else if (data.type === 'typing_stop') {
                    if (data.user_uuid) {
                        typingUsersRef.current.delete(data.user_uuid);
                    }
                } else if (data.type === 'message_read') {
                     // Invalidate unread status / update read receipts
                     queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                }
            } catch (err) {
                console.error('[WS] Error parsing message', err);
            }
        };

        ws.onclose = () => {
            console.log(`[WS] Disconnected from chat ${conversationId}`);
            // Attempt to reconnect if still mounted and conversationId is the same
            if (wsRef.current === ws) {
                reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
            }
        };

        ws.onerror = (error) => {
            console.error(`[WS] Error on chat ${conversationId}`, error);
        };
    }, [conversationId, queryClient, user]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    const sendTypingStart = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing_start', conversation_uuid: conversationId }));
        }
    }, [conversationId]);

    const sendTypingStop = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing_stop', conversation_uuid: conversationId }));
        }
    }, [conversationId]);

    const isConnected = wsRef.current?.readyState === WebSocket.OPEN;

    return {
        isConnected,
        sendTypingStart,
        sendTypingStop,
        typingUsers: Array.from(typingUsersRef.current)
    };
}
