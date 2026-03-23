import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppLayout from './components/layout/AppLayout'
import type { PageId } from './components/layout/Sidebar'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import PlaceholderPage from './pages/PlaceholderPage'
import ConversationPage from './pages/ConversationPage'
import ConversationsPanel from './components/panels/ConversationsPanel'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

import { useState } from 'react';

function AppContent() {
  const { isLoggedIn, loading } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const renderPage = (activePage: PageId, navigate: (page: PageId) => void) => {
    if (loading) return null;
    if (!isLoggedIn) return <LoginPage />;

    switch (activePage) {
      case 'home':
        return <HomePage />;
      case 'conversations':
        return <PlaceholderPage title="Conversations" description="Sélectionnez une conversation dans le panneau latéral pour commencer à discuter." />;
      case 'groups':
        return <PlaceholderPage title="Groupes" description="Sélectionnez un groupe dans le panneau latéral." />;
      case 'agents':
        return <PlaceholderPage title="Agents IA" description="Sélectionnez un agent dans le panneau latéral." />;
      case 'marketplace':
        return <PlaceholderPage title="Marketplace" description="Bientôt disponible — découvrez et installez des agents." />;
      case 'profile':
        return <ProfilePage />;
      case 'conversation_view':
        if (!selectedConversationId) return <HomePage />;
        return (
          <ConversationPage
            conversationId={selectedConversationId}
            onBack={() => {
              setSelectedConversationId(null);
              navigate('home');
            }}
          />
        );
      default:
        return <HomePage />;
    }
  };

  const renderPanelContent = (activePage: PageId, navigate: (page: PageId) => void) => {
    if (!isLoggedIn) return null;

    const handleSelect = (uuid: string) => {
      setSelectedConversationId(uuid);
      navigate('conversation_view');
    };

    switch (activePage) {
      case 'conversations':
        return <ConversationsPanel filter="private" onSelectConversation={handleSelect} />;
      case 'groups':
        return <ConversationsPanel filter="groups" onSelectConversation={handleSelect} />;
      case 'agents':
        return <ConversationsPanel filter="agents" onSelectConversation={handleSelect} />;
      default:
        return null;
    }
  };

  return (
    <AppLayout panelContent={renderPanelContent} selectedConversationId={selectedConversationId}>
      {renderPage}
    </AppLayout>
  );
}

import { JarvisProvider } from './contexts/JarvisContext'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <JarvisProvider>
          <AppContent />
        </JarvisProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App
