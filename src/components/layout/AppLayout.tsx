import { useState, useCallback } from 'react';
import Sidebar, { type PageId } from './Sidebar';
import SidebarResizer from './SidebarResizer';
import WebBottomBar from './WebBottomBar';
import { SIDEBAR_PANEL_MIN_WIDTH, SIDEBAR_PANEL_MAX_WIDTH, SIDEBAR_PANEL_DEFAULT_WIDTH } from '../../styles/theme';
import { useAuth } from '../../contexts/AuthContext';
import './AppLayout.css';

interface AppLayoutProps {
    children: (activePage: PageId, navigate: (page: PageId) => void) => React.ReactNode;
    panelContent: (activePage: PageId, navigate: (page: PageId) => void) => React.ReactNode | null;
    selectedConversationId?: string | null;
}

const PAGES_WITH_PANEL: PageId[] = ['conversations', 'groups', 'agents'];

export default function AppLayout({ children, panelContent, selectedConversationId }: AppLayoutProps) {
    const [currentNav, setCurrentNav] = useState<PageId>('home');
    const [mainPage, setMainPage] = useState<PageId>('home');
    const [panelWidth, setPanelWidth] = useState(SIDEBAR_PANEL_DEFAULT_WIDTH);
    const { user, isLoggedIn, logout } = useAuth();

    const isPanelOpen = PAGES_WITH_PANEL.includes(currentNav);

    const handleNavigate = useCallback((page: PageId) => {
        setCurrentNav(page);
        if (!PAGES_WITH_PANEL.includes(page)) {
            setMainPage(page);
        }
    }, []);

    const currentPanelContent = panelContent(currentNav, handleNavigate);

    const handleResize = useCallback((newWidth: number) => {
        setPanelWidth(newWidth);
    }, []);

    const userPhoto = user?.photo_profil_url || user?.photo_profil || null;
    const userName = user?.username || user?.first_name || undefined;

    return (
        <div className="app-layout">
            <div className="app-layout__body">
                {/* Sidebar */}
                <Sidebar
                    activePage={currentNav}
                    onNavigate={handleNavigate}
                    panelContent={currentPanelContent}
                    panelWidth={panelWidth}
                    isPanelOpen={isPanelOpen}
                    userPhoto={userPhoto}
                    userName={userName}
                    isLoggedIn={isLoggedIn}
                    onLogout={logout}
                />

                {/* Resizer (only when panel is open) */}
                {isPanelOpen && (
                    <SidebarResizer
                        onResize={handleResize}
                        minWidth={SIDEBAR_PANEL_MIN_WIDTH}
                        maxWidth={SIDEBAR_PANEL_MAX_WIDTH}
                    />
                )}

                {/* Main content */}
                <main className="app-layout__main">
                    {children(mainPage, handleNavigate)}
                </main>
            </div>

            {/* Bottom bar */}
            <WebBottomBar
                isChat={mainPage === 'conversation_view'}
                conversationId={(mainPage === 'conversation_view' && selectedConversationId) || undefined}
                onJarvisInvoke={() => handleNavigate('home')}
            />
        </div>
    );
}

