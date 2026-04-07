import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { WS_BASE_URL } from '@mobile/config/api';

interface WebSocketContextType {
    isConnected: boolean;
    sendWsMessage: (payload: object) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
    isConnected: false,
    sendWsMessage: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
    const { user, accessToken } = useAuth();
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const connect = useCallback(() => {
        if (!user || !accessToken) return;
        // Already open or connecting
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

        const wsUrl = `${WS_BASE_URL}/ws/chat/`;
        console.log('[WS] Connecting to', wsUrl);

        const ws = new WebSocket(wsUrl, ['access_token', accessToken]);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WS] Connected');
            setIsConnected(true);
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'chat_message') {
                    const newMsg = data.message;
                    const convUuid = newMsg?.conversation_uuid;
                    if (!convUuid) return;

                    queryClient.setQueryData(['messages', convUuid], (oldData: any) => {
                        if (!oldData?.pages) return oldData;

                        const newPages = [...oldData.pages];
                        const firstPage = { ...newPages[0], messages: [...newPages[0].messages] };

                        const existingIdx = firstPage.messages.findIndex(
                            (m: any) =>
                                m.uuid === newMsg.uuid ||
                                (m.isPending && m.content === newMsg.content && m.sender_uuid === newMsg.sender_uuid)
                        );

                        if (existingIdx >= 0) {
                            firstPage.messages[existingIdx] = {
                                ...firstPage.messages[existingIdx],
                                ...newMsg,
                                isPending: false,
                            };
                        } else {
                            firstPage.messages = [newMsg, ...firstPage.messages];
                        }

                        newPages[0] = firstPage;
                        return { ...oldData, pages: newPages };
                    });

                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                }
            } catch (err) {
                console.error('[WS] Parse error', err);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Closed — reconnecting in 3s');
            setIsConnected(false);
            if (wsRef.current === ws) {
                reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
            }
        };

        ws.onerror = () => {
            console.error('[WS] Error');
        };
    }, [user, accessToken, queryClient]);

    useEffect(() => {
        if (user && accessToken) {
            connect();
        }
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            const ws = wsRef.current;
            wsRef.current = null;
            ws?.close();
            setIsConnected(false);
        };
    }, [user, accessToken, connect]);

    const sendWsMessage = useCallback((payload: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
        }
    }, []);

    return (
        <WebSocketContext.Provider value={{ isConnected, sendWsMessage }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    return useContext(WebSocketContext);
}
