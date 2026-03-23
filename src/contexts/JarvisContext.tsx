import React, { createContext, useContext, useState, useCallback } from 'react';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { useAuth } from './AuthContext';

export interface JarvisLiveTurn {
    id: string;
    inputType: 'text' | 'voice';
    userMessage: string;
    jarvisResponse: string;
    isProcessing: boolean;
}

interface JarvisContextType {
    liveTurns: JarvisLiveTurn[];
    sendJarvisMessage: (message: string) => Promise<void>;
    clearLiveTurns: () => void;
    removeLiveTurn: (id: string) => void;
    upsertLiveTurn: (turn: JarvisLiveTurn) => void;
}

const JarvisContext = createContext<JarvisContextType | undefined>(undefined);

export function JarvisProvider({ children }: { children: React.ReactNode }) {
    const { isLoggedIn } = useAuth();
    const [liveTurns, setLiveTurns] = useState<JarvisLiveTurn[]>([]);

    const upsertLiveTurn = useCallback((turn: JarvisLiveTurn) => {
        setLiveTurns(prev => {
            const idx = prev.findIndex(t => t.id === turn.id);
            if (idx === -1) return [...prev, turn];
            const next = [...prev];
            next[idx] = turn;
            return next;
        });
    }, []);

    const clearLiveTurns = useCallback(() => {
        setLiveTurns([]);
    }, []);

    const removeLiveTurn = useCallback((id: string) => {
        setLiveTurns(prev => prev.filter(turn => turn.id !== id));
    }, []);

    const sendJarvisMessage = useCallback(async (message: string) => {
        if (!message.trim() || !isLoggedIn) return;

        const turnId = Date.now().toString();
        const newTurn: JarvisLiveTurn = {
            id: turnId,
            inputType: 'text',
            userMessage: message.trim(),
            jarvisResponse: '',
            isProcessing: true,
        };

        upsertLiveTurn(newTurn);

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/jarvis/chat/?type=message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() }),
            });

            if (response.ok) {
                const data = await response.json();
                upsertLiveTurn({
                    ...newTurn,
                    jarvisResponse: data.response || 'Aucune réponse',
                    isProcessing: false,
                });
            } else {
                let errorMsg = `Erreur ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.detail) errorMsg += `: ${errorData.detail}`;
                    else if (errorData.error) errorMsg = errorData.error;
                    console.error('Jarvis API Error details:', errorData);
                } catch { }

                upsertLiveTurn({
                    ...newTurn,
                    jarvisResponse: errorMsg,
                    isProcessing: false,
                });
            }
        } catch {
            upsertLiveTurn({
                ...newTurn,
                jarvisResponse: 'Erreur réseau',
                isProcessing: false,
            });
        }
    }, [upsertLiveTurn, isLoggedIn]);

    return (
        <JarvisContext.Provider value={{ liveTurns, sendJarvisMessage, clearLiveTurns, removeLiveTurn, upsertLiveTurn }}>
            {children}
        </JarvisContext.Provider>
    );
}

export function useJarvis() {
    const context = useContext(JarvisContext);
    if (!context) throw new Error('useJarvis must be used within a JarvisProvider');
    return context;
}
