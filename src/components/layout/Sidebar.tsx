import { useState, useCallback } from 'react';
import {
    IoHomeOutline, IoHome,
    IoChatbubblesOutline, IoChatbubbles,
    IoPeopleOutline, IoPeople,
    IoSparklesOutline, IoSparkles,
    IoStorefrontOutline, IoStorefront,
    IoPersonOutline, IoPerson,
    IoLogOutOutline,
} from 'react-icons/io5';
import './Sidebar.css';

export type PageId = 'home' | 'conversations' | 'groups' | 'agents' | 'marketplace' | 'profile' | 'add-friend' | 'add-group' | 'add-agent';

interface NavItem {
    id: PageId;
    label: string;
    icon: React.ReactNode;
    iconActive: React.ReactNode;
    hasPanel: boolean; // whether this page expands the sidebar panel
}

const NAV_ITEMS: NavItem[] = [
    { id: 'home', label: 'Accueil', icon: <IoHomeOutline size={22} />, iconActive: <IoHome size={22} />, hasPanel: false },
    { id: 'conversations', label: 'Conversations', icon: <IoChatbubblesOutline size={22} />, iconActive: <IoChatbubbles size={22} />, hasPanel: true },
    { id: 'groups', label: 'Groupes', icon: <IoPeopleOutline size={22} />, iconActive: <IoPeople size={22} />, hasPanel: true },
    { id: 'agents', label: 'Agents', icon: <IoSparklesOutline size={22} />, iconActive: <IoSparkles size={22} />, hasPanel: true },
    { id: 'marketplace', label: 'Marketplace', icon: <IoStorefrontOutline size={22} />, iconActive: <IoStorefront size={22} />, hasPanel: false },
    { id: 'profile', label: 'Profil', icon: <IoPersonOutline size={22} />, iconActive: <IoPerson size={22} />, hasPanel: false },
];

interface SidebarProps {
    activePage: PageId;
    onNavigate: (page: PageId) => void;
    panelContent: React.ReactNode | null;
    panelWidth: number;
    isPanelOpen: boolean;
    userPhoto?: string | null;
    userName?: string;
    isLoggedIn: boolean;
    onLogout: () => void;
}

export default function Sidebar({ activePage, onNavigate, panelContent, panelWidth, isPanelOpen, userPhoto, userName, isLoggedIn, onLogout }: SidebarProps) {
    const [hoveredItem, setHoveredItem] = useState<PageId | null>(null);

    const handleClick = useCallback((item: NavItem) => {
        onNavigate(item.id);
    }, [onNavigate]);

    // Total green body width = icon rail + panel (when open)
    const greenBodyWidth = isPanelOpen ? 60 + panelWidth : 60;

    return (
        <div className="sidebar">
            <div
                className="sidebar__green-body"
                style={{ width: greenBodyWidth }}
            >
                {/* Icon rail */}
                <nav className="sidebar__rail">
                    <div className="sidebar__logo">
                        <span className="sidebar__logo-text">E</span>
                    </div>

                    <div className="sidebar__nav-items">
                        {NAV_ITEMS.map((item) => {
                            const isActive = activePage === item.id;
                            const isHovered = hoveredItem === item.id;

                            return (
                                <button
                                    key={item.id}
                                    className={`sidebar__nav-btn ${isActive ? 'sidebar__nav-btn--active' : ''}`}
                                    onClick={() => handleClick(item)}
                                    onMouseEnter={() => setHoveredItem(item.id)}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    title={item.label}
                                >
                                    <span className="sidebar__nav-icon">
                                        {isActive ? item.iconActive : item.icon}
                                    </span>
                                    {/* Tooltip */}
                                    {isHovered && !isPanelOpen && (
                                        <span className="sidebar__tooltip">{item.label}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* User section at bottom */}
                    {isLoggedIn && (
                        <div className="sidebar__user-section">
                            <button
                                className={`sidebar__nav-btn ${activePage === 'profile' ? 'sidebar__nav-btn--active' : ''}`}
                                onClick={() => onNavigate('profile')}
                                title={userName || 'Profil'}
                            >
                                <div className="sidebar__user-avatar">
                                    {userPhoto ? (
                                        <img src={userPhoto} alt={userName} className="sidebar__user-avatar-img" />
                                    ) : (
                                        <span>{(userName || 'U').charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            </button>
                            <button
                                className="sidebar__nav-btn sidebar__logout-btn"
                                onClick={onLogout}
                                title="Déconnexion"
                            >
                                <IoLogOutOutline size={18} />
                            </button>
                        </div>
                    )}
                </nav>

                {/* Panel inside the green body */}
                <div
                    className={`sidebar__panel ${isPanelOpen ? 'sidebar__panel--open' : ''}`}
                    style={{ width: isPanelOpen ? panelWidth : 0 }}
                >
                    {isPanelOpen && (
                        <div className="sidebar__panel-content">
                            {panelContent}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
