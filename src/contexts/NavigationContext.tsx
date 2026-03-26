import React, { createContext, useContext, useState, useCallback } from 'react';
import type { PageId } from '../components/layout/Sidebar';
import type { Conversation } from '../hooks/useConversations';

interface NavigationContextType {
  currentPage: PageId;
  selectedConversation: Conversation | null;
  navigate: (page: PageId) => void;
  openConversation: (conv: Conversation) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const CONV_TYPE_TO_PAGE: Record<string, PageId> = {
  direct: 'conversations',
  group: 'groups',
  agent: 'agents',
};

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const navigate = useCallback((page: PageId) => {
    setCurrentPage(page);
  }, []);

  const openConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
    setCurrentPage(CONV_TYPE_TO_PAGE[conv.conversation_type] ?? 'conversations');
  }, []);

  return (
    <NavigationContext.Provider value={{ currentPage, selectedConversation, navigate, openConversation }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
