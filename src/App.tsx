import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { JarvisProvider } from './contexts/JarvisContext'
import { NavigationProvider } from './contexts/NavigationContext'
import AppLayout from './components/layout/AppLayout'
import type { PageId } from './components/layout/Sidebar'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import PlaceholderPage from './pages/PlaceholderPage'
import ConversationsPage from './pages/ConversationsPage'
import ConversationsPanel from './components/panels/ConversationsPanel'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function AppContent() {
  const { isLoggedIn, loading } = useAuth();

  const renderPage = (activePage: PageId) => {
    if (loading) return null;
    if (!isLoggedIn) return <LoginPage />;

    switch (activePage) {
      case 'home':
        return <HomePage />;
      case 'conversations':
      case 'groups':
      case 'agents':
        return <ConversationsPage />;
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

    const filterMap: Partial<Record<PageId, 'private' | 'groups' | 'agents'>> = {
      conversations: 'private',
      groups: 'groups',
      agents: 'agents',
    };
    const filter = filterMap[activePage];
    if (!filter) return null;
    return <ConversationsPanel filter={filter} />;
  };

  return (
    <AppLayout panelContent={renderPanelContent}>
      {renderPage}
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavigationProvider>
          <JarvisProvider>
            <AppContent />
          </JarvisProvider>
        </NavigationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App
