import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PageId } from '../components/layout/Sidebar';
import type { Conversation } from '../hooks/useConversations';

export interface ChatSendCallback {
    sendText: (text: string, parentMessageUuid?: string | null) => void;
    sendFiles: (text: string, files: File[], parentMessageUuid?: string | null) => void;
}

/** Minimal message info needed to display a reply preview */
export interface ReplyTarget {
    uuid: string;
    sender_username: string;
    content: string;
    attachments?: { file_type: string }[];
}

interface NavigationContextType {
    currentPage: PageId;
    selectedConversation: Conversation | null;
    conversationView: 'thread' | 'management';
    navigate: (page: PageId) => void;
    openConversation: (conv: Conversation) => void;
    closeConversation: () => void;
    openConversationManagement: () => void;
    closeConversationManagement: () => void;
    /** Registered by ConversationThread so WebBottomBar can trigger sends */
    registerSendCallback: (cb: ChatSendCallback | null) => void;
    sendCallback: React.RefObject<ChatSendCallback | null>;
    /** Reply-to state shared between ConversationThread and WebBottomBar */
    replyTo: ReplyTarget | null;
    setReplyTo: (target: ReplyTarget | null) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const CONV_TYPE_TO_PAGE: Record<string, PageId> = {
    direct: 'conversations',
    group: 'groups',
    group_chat: 'groups',
    agent: 'agents',
    ai_agent: 'agents',
};

export function NavigationProvider({ children }: { children: React.ReactNode }) {
    const [currentPage, setCurrentPage] = useState<PageId>('home');
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [conversationView, setConversationView] = useState<'thread' | 'management'>('thread');
    const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
    const sendCallbackRef = useRef<ChatSendCallback | null>(null);

    const CONV_PAGES = new Set<PageId>(['conversations', 'groups', 'agents', 'add-friend', 'add-group', 'add-agent']);

    const navigate = useCallback((page: PageId) => {
        setCurrentPage(page);
        setConversationView('thread');
        setSelectedConversation(prev => {
            if (!prev) return prev;
            const convPage = CONV_TYPE_TO_PAGE[prev.conversation_type] ?? 'conversations';
            if (!CONV_PAGES.has(page)) { sendCallbackRef.current = null; return null; }
            // Switching to a different conversation type section — close the open thread
            if (page !== convPage && !page.startsWith('add-')) {
                sendCallbackRef.current = null;
                return null;
            }
            return prev;
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openConversation = useCallback((conv: Conversation) => {
        setSelectedConversation(conv);
        setConversationView('thread');
        setCurrentPage(CONV_TYPE_TO_PAGE[conv.conversation_type] ?? 'conversations');
        setReplyTo(null);
    }, []);

    const closeConversation = useCallback(() => {
        setSelectedConversation(null);
        setConversationView('thread');
        sendCallbackRef.current = null;
        setReplyTo(null);
    }, []);

    const openConversationManagement = useCallback(() => {
        setConversationView('management');
    }, []);

    const closeConversationManagement = useCallback(() => {
        setConversationView('thread');
    }, []);

    const registerSendCallback = useCallback((cb: ChatSendCallback | null) => {
        sendCallbackRef.current = cb;
    }, []);

    return (
        <NavigationContext.Provider value={{
            currentPage,
            selectedConversation,
            conversationView,
            navigate,
            openConversation,
            closeConversation,
            openConversationManagement,
            closeConversationManagement,
            registerSendCallback,
            sendCallback: sendCallbackRef,
            replyTo,
            setReplyTo,
        }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const ctx = useContext(NavigationContext);
    if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
    return ctx;
}
