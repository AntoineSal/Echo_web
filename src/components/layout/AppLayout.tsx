import Sidebar, { type PageId } from './Sidebar';
import WebBottomBar from './WebBottomBar';
import { getSidebarPanelWidthForColumns } from '../../styles/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import './AppLayout.css';

interface AppLayoutProps {
  children: (activePage: PageId) => React.ReactNode;
  panelContent: (activePage: PageId) => React.ReactNode | null;
}

const PAGES_WITH_PANEL: PageId[] = ['conversations', 'groups', 'agents', 'add-friend', 'add-group', 'add-agent'];

export default function AppLayout({ children, panelContent }: AppLayoutProps) {
  const { user, isLoggedIn, logout } = useAuth();
  const { currentPage, navigate, isSidebarPanelOpen, conversationView } = useNavigation();

  const isPanelOpen = PAGES_WITH_PANEL.includes(currentPage) && isSidebarPanelOpen;
  const isImmersivePage = currentPage === 'add-friend' || currentPage === 'add-group' || currentPage === 'add-agent' || currentPage === 'marketplace';
  const panelWidth = getSidebarPanelWidthForColumns(1);

  const userPhoto = user?.photo_profil_url || user?.photo_profil || null;
  const userName = user?.username || user?.first_name || undefined;

  return (
    <div className="app-layout">
      <div className="app-layout__body">
        <Sidebar
          activePage={currentPage}
          onNavigate={navigate}
          panelContent={isPanelOpen ? panelContent(currentPage) : null}
          panelWidth={panelWidth}
          isPanelOpen={isPanelOpen}
          isResizing={false}
          userPhoto={userPhoto}
          userName={userName}
          isLoggedIn={isLoggedIn}
          onLogout={logout}
        />

        <div className={`app-layout__foreground ${isPanelOpen ? 'app-layout__foreground--panel-open' : ''}`}>
          <main className={`app-layout__main ${currentPage === 'home' ? 'app-layout__main--home' : ''} ${currentPage === 'marketplace' ? 'app-layout__main--marketplace' : ''} ${PAGES_WITH_PANEL.includes(currentPage) ? 'app-layout__main--conversation' : ''}`}>
            {children(currentPage)}
          </main>

          {conversationView !== 'management' && !isImmersivePage && <WebBottomBar />}
        </div>
      </div>
    </div>
  );
}
