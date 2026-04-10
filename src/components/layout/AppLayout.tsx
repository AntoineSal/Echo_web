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

  const handleResize = useCallback((newWidth: number) => {
    setPanelWidth(newWidth);
  }, []);

  const handleResizeStart = useCallback(() => {
    setIsResizingSidebar(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizingSidebar(false);
  }, []);

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
          isResizing={isResizingSidebar}
          userPhoto={userPhoto}
          userName={userName}
          isLoggedIn={isLoggedIn}
          onLogout={logout}
        />

        {isPanelOpen && (
          <SidebarResizer
            onResize={handleResize}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            isResizing={isResizingSidebar}
            minWidth={SIDEBAR_PANEL_MIN_WIDTH}
            maxWidth={SIDEBAR_PANEL_MAX_WIDTH}
            snapPoints={SIDEBAR_PANEL_SNAP_WIDTHS}
            snapThreshold={48}
          />
        )}

        <main className={`app-layout__main ${isResizingSidebar ? 'app-layout__main--resizing' : ''}`}>
          {children(currentPage)}
        </main>
      </div>

      <WebBottomBar />
    </div>
  );
}
