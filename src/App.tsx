import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppLayout from './components/layout/AppLayout'
import type { PageId } from './components/layout/Sidebar'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import PlaceholderPage from './pages/PlaceholderPage'
import ConversationsPage from './pages/ConversationsPage'
import ConversationsPanel from './components/panels/ConversationsPanel'
import './index.css'
import { useState } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function AppContent() {
  const { isLoggedIn, loading } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);

  const renderPage = (activePage: PageId) => {
    if (loading) return null;
    if (!isLoggedIn) return <LoginPage />;

    switch (activePage) {
      case 'home':
        return <HomePage />;
      case 'conversations':
      case 'groups':
      case 'agents':
        return <ConversationsPage selectedConversation={selectedConversation} />;
      case 'marketplace':
        return <PlaceholderPage title="Marketplace" description="Bientôt disponible — découvrez et installez des agents." />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <HomePage />;
    }
  };

  const renderPanelContent = (activePage: PageId) => {
    if (!isLoggedIn) return null;

    switch (activePage) {
      case 'conversations':
        return <ConversationsPanel filter="private" onSelect={setSelectedConversation} selectedId={selectedConversation?.uuid} />;
      case 'groups':
        return <ConversationsPanel filter="groups" onSelect={setSelectedConversation} selectedId={selectedConversation?.uuid} />;
      case 'agents':
        return <ConversationsPanel filter="agents" onSelect={setSelectedConversation} selectedId={selectedConversation?.uuid} />;
      default:
        return null;
    }
  };

  return (
    <AppLayout panelContent={renderPanelContent}>
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
