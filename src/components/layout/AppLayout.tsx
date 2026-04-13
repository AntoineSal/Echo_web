import { useState, useCallback } from 'react';
import Sidebar, { type PageId } from './Sidebar';
import SidebarResizer from './SidebarResizer';
import WebBottomBar from './WebBottomBar';
import {
  SIDEBAR_PANEL_MIN_WIDTH,
  SIDEBAR_PANEL_MAX_WIDTH,
  SIDEBAR_PANEL_DEFAULT_WIDTH,
  SIDEBAR_PANEL_SNAP_WIDTHS,
} from '../../styles/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import './AppLayout.css';

interface AppLayoutProps {
  children: (activePage: PageId) => React.ReactNode;
  panelContent: (activePage: PageId) => React.ReactNode | null;
}

const PAGES_WITH_PANEL: PageId[] = ['conversations', 'groups', 'agents', 'add-friend', 'add-group', 'add-agent'];

export default function AppLayout({ children, panelContent }: AppLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(SIDEBAR_PANEL_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const { user, isLoggedIn, logout } = useAuth();
  const { currentPage, navigate } = useNavigation();

  const isPanelOpen = PAGES_WITH_PANEL.includes(currentPage);

  const userPhoto = user?.photo_profil_url || user?.photo_profil || null;
  const userName = user?.username || user?.first_name || undefined;

  return (
    <div className="app-layout">
      <div className="app-layout__body">
        <Sidebar
          activePage={currentPage}
          onNavigate={navigate}
          panelContent={isPanelOpen ? panelContent(currentPage) : null}
          panelWidth={SIDEBAR_PANEL_DEFAULT_WIDTH}
          isPanelOpen={isPanelOpen}
          isResizing={false}
          userPhoto={userPhoto}
          userName={userName}
          isLoggedIn={isLoggedIn}
          onLogout={logout}
        />

        <main className="app-layout__main">
          {children(currentPage)}
        </main>
      </div>

      <WebBottomBar />
    </div>
  );
}
