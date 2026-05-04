import React, { useState, useEffect, useRef } from 'react';
import {
    IoCalendarOutline, IoLogOutOutline, IoPeopleOutline,
    IoStatsChartOutline, IoDocumentTextOutline, IoFlagOutline,
    IoCloseOutline, IoTrashOutline,
    IoSettingsOutline, IoShieldCheckmarkOutline, IoSparklesOutline,
    IoBanOutline, IoArchiveOutline, IoPersonCircleOutline,
    IoLinkOutline, IoChevronDownOutline, IoChevronUpOutline
} from 'react-icons/io5';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { CGU_CONTENT, CGU_TITLE } from '@mobile/constants/cgu';
import ExpandedFriends from '../components/profile/ExpandedFriends';
import ExpandedStats from '../components/profile/ExpandedStats';
import ExpandedCalendar from '../components/profile/ExpandedCalendar';
import SettingsBlockedUsers from '../components/profile/SettingsBlockedUsers';
import SettingsMyReports from '../components/profile/SettingsMyReports';
import SettingsArchivedConversations from '../components/profile/SettingsArchivedConversations';
import SettingsAiFeatures from '../components/profile/SettingsAiFeatures';
import SettingsOAuth from '../components/profile/SettingsOAuth';
import ProfileReadme from '../components/profile/ProfileReadme';
import '../components/profile/SettingsPages.css';
import './ProfilePage.css';

interface ProfileStats {
    total_connexions: number;
    total_evenements: number;
    evenements_ce_mois: number;
    total_reponses: number;
    date_inscription: string;
    derniere_activite: string;
}

type ExpandedViewType = 'friends' | 'calendar' | 'stats' | null;
type SettingsPageType = 'ai' | 'blocked' | 'archived' | 'reports' | 'oauth' | null;

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [isModerationExpanded, setIsModerationExpanded] = useState(false);
    const [isAccountExpanded, setIsAccountExpanded] = useState(false);
    const [showEulaModal, setShowEulaModal] = useState(false);
    const [settingsPage, setSettingsPage] = useState<SettingsPageType>(null);

    const [expandedView, setExpandedView] = useState<ExpandedViewType>(null);
    const [startRect, setStartRect] = useState<DOMRect | null>(null);

    const friendsCardRef = useRef<HTMLDivElement>(null);
    const calendarCardRef = useRef<HTMLDivElement>(null);
    const statsCardRef = useRef<HTMLDivElement>(null);

    const extendedUser = user as any;

    const { data: stats } = useQuery({
        queryKey: ['profile-stats', user?.uuid],
        queryFn: async () => {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/stats/`);
            if (!res.ok) return null;
            return await res.json() as ProfileStats;
        },
        enabled: !!user,
        staleTime: 5 * 60_000,
    });

    const { data: friendsCount } = useQuery({
        queryKey: ['friends-count', user?.uuid],
        queryFn: async () => {
            if (!user?.uuid) return 0;
            const res = await fetchWithAuth(`${API_BASE_URL}/relations/connections/my-connections/`);
            if (!res.ok) return 0;
            const data = await res.json();
            const connections = Array.isArray(data?.connexions) ? data.connexions : Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
            return connections.length;
        },
        enabled: !!user?.uuid,
        staleTime: 30_000,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedView(null); };
        if (expandedView) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [expandedView]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (settingsPage) { setSettingsPage(null); return; }
            setShowSettingsMenu(false);
            setIsModerationExpanded(false);
            setIsAccountExpanded(false);
            setShowEulaModal(false);
        };
        if (showSettingsMenu || showEulaModal || settingsPage) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSettingsMenu, showEulaModal, settingsPage]);

    const openView = (view: ExpandedViewType, ref: React.RefObject<HTMLDivElement | null>) => {
        if (ref.current) setStartRect(ref.current.getBoundingClientRect());
        setExpandedView(view);
    };

    const closeSettingsMenu = () => {
        setShowSettingsMenu(false);
        setIsModerationExpanded(false);
        setIsAccountExpanded(false);
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.")) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) await logout();
        } catch {
            alert('Erreur lors de la suppression du compte');
        }
    };

    const getExpandedRect = (): React.CSSProperties => {
        if (!startRect) return { top: '10vh', left: '10vw', width: '80vw', height: '80vh' };
        return {
            '--start-x': `${startRect.left}px`,
            '--start-y': `${startRect.top}px`,
            '--start-w': `${startRect.width}px`,
            '--start-h': `${startRect.height}px`,
            top: '40px',
            left: 'calc(50vw - min(45vw, 420px))',
            width: 'min(90vw, 840px)',
            height: 'calc(100vh - 120px)',
            animation: 'prof-expanded-in 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards'
        } as React.CSSProperties;
    };

    if (!user) return null;

    const displayName = user.username || extendedUser?.first_name || 'Utilisateur';
    const photoUrl = extendedUser?.photo_profil_url || extendedUser?.photo_profil || null;

    const registrationDate = stats?.date_inscription || extendedUser?.created_at;
    const parsedDate = registrationDate ? new Date(registrationDate) : null;
    const daysOnEcho = parsedDate && !isNaN(parsedDate.getTime()) ? Math.max(1, Math.ceil((Date.now() - parsedDate.getTime()) / 86_400_000)) : null;

    const eventsThisMonth = stats?.evenements_ce_mois ?? 0;
    const totalEvents = stats?.total_evenements ?? 0;
    const calendarValue = eventsThisMonth > 0 ? String(eventsThisMonth) : totalEvents > 0 ? String(totalEvents) : '—';
    const calendarLabel = eventsThisMonth > 0 ? 'Ce mois' : 'Événements';

    return (
        <div className="profile-page">
            <style>{`
                @keyframes prof-expanded-in {
                    0% {
                        top: var(--start-y); left: var(--start-x);
                        width: var(--start-w); height: var(--start-h);
                        border-radius: 16px;
                    }
                    100% {
                        top: 40px;
                        left: calc(50vw - min(45vw, 420px));
                        width: min(90vw, 840px);
                        height: calc(100vh - 120px);
                        border-radius: 24px;
                    }
                }
            `}</style>

            <div className={`prof-content-scroll ${(expandedView || settingsPage) ? 'prof-content-scroll--blurred' : ''}`}>
                {/* ── Hero ── */}
                <div className="prof-hero">
                    <div className="prof-hero-top-row">
                        <button
                            type="button"
                            className="prof-settings-btn"
                            onClick={() => { setIsModerationExpanded(false); setIsAccountExpanded(false); setShowSettingsMenu(true); }}
                            aria-label="Ouvrir les réglages"
                        >
                            <IoSettingsOutline size={22} color="rgba(10, 145, 104, 1)" />
                        </button>
                    </div>
                    <div className="prof-avatar">
                        {photoUrl
                            ? <img src={photoUrl} alt={displayName} className="prof-avatar__img" />
                            : <span className="prof-avatar__letter">{displayName.charAt(0).toUpperCase()}</span>
                        }
                    </div>
                    <h1 className="prof-name">{displayName}</h1>
                    {extendedUser?.surnom && <p className="prof-surnom">"{extendedUser.surnom}"</p>}
                    {extendedUser?.bio && <p className="prof-bio">{extendedUser.bio}</p>}

                    <div className="prof-stats">
                        <div className="prof-stat-card" ref={friendsCardRef} onClick={() => openView('friends', friendsCardRef)}>
                            <IoPeopleOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{friendsCount ?? stats?.total_connexions ?? extendedUser?.nb_connexions ?? 0}</span>
                            <span className="prof-stat-card__label">Amis</span>
                        </div>
                        <div className="prof-stat-card" ref={calendarCardRef} onClick={() => openView('calendar', calendarCardRef)}>
                            <IoCalendarOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{calendarValue}</span>
                            <span className="prof-stat-card__label">{calendarLabel}</span>
                        </div>
                        <div className="prof-stat-card" ref={statsCardRef} onClick={() => openView('stats', statsCardRef)}>
                            <IoStatsChartOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{daysOnEcho ? `${daysOnEcho}j` : '...'}</span>
                            <span className="prof-stat-card__label">Sur Echo</span>
                        </div>
                    </div>
                </div>

                {/* ── README ── */}
                <div className="prof-readme-wrap">
                    <ProfileReadme
                        name="Antoine"
                        birthdate="24 mars 2004"
                        memberSince="29 janvier 2026"
                        bio={extendedUser?.bio || undefined}
                        style="pokemon"
                        pokemonTypes={['psy', 'acier']}
                        pokemonEntry={721}
                        hp={880}
                    />
                </div>
            </div>

            {/* ── Expanded FLIP overlays ── */}
            {expandedView && (
                <>
                    <div className="prof-expanded-backdrop" onClick={() => setExpandedView(null)} />
                    <div className="prof-expanded-wrap" style={getExpandedRect()}>
                        <div className="prof-expanded">
                            <div className="prof-expanded__header">
                                <div className="prof-expanded__icon">
                                    {expandedView === 'friends'  && <IoPeopleOutline />}
                                    {expandedView === 'calendar' && <IoCalendarOutline />}
                                    {expandedView === 'stats'    && <IoStatsChartOutline />}
                                </div>
                                <div className="prof-expanded__titles">
                                    <h2 className="prof-expanded__name">
                                        {expandedView === 'friends'  && 'Mes Amis et Invitations'}
                                        {expandedView === 'calendar' && 'Mon Calendrier'}
                                        {expandedView === 'stats'    && 'Statistiques & Activité'}
                                    </h2>
                                </div>
                                <button className="prof-expanded__close" onClick={() => setExpandedView(null)}>
                                    <IoCloseOutline size={22} />
                                </button>
                            </div>
                            <div className="prof-expanded__body">
                                {expandedView === 'friends'  && <ExpandedFriends />}
                                {expandedView === 'calendar' && <ExpandedCalendar />}
                                {expandedView === 'stats'    && <ExpandedStats />}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Settings sub-pages ── */}
            {settingsPage && (() => {
                const PAGE_META: Record<NonNullable<SettingsPageType>, { title: string; icon: React.ReactNode }> = {
                    ai:       { title: 'Fonctionnalités IA',      icon: <IoSparklesOutline size={18} /> },
                    blocked:  { title: 'Utilisateurs bloqués',    icon: <IoBanOutline size={18} /> },
                    archived: { title: 'Conversations archivées', icon: <IoArchiveOutline size={18} /> },
                    reports:  { title: 'Mes signalements',        icon: <IoFlagOutline size={18} /> },
                    oauth:    { title: 'Connexions OAuth',        icon: <IoLinkOutline size={18} /> },
                };
                const { title, icon } = PAGE_META[settingsPage];
                return (
                    <div className="spage-overlay">
                        <div className="spage-backdrop" onClick={() => setSettingsPage(null)} />
                        <div className="spage-panel">
                            <div className="spage-header">
                                <button className="spage-back-btn" onClick={() => setSettingsPage(null)} aria-label="Retour">
                                    <IoChevronDownOutline size={18} style={{ transform: 'rotate(90deg)' }} />
                                </button>
                                <div className="spage-header-icon">{icon}</div>
                                <h2 className="spage-title">{title}</h2>
                            </div>
                            <div className="spage-body">
                                {settingsPage === 'ai'       && <SettingsAiFeatures />}
                                {settingsPage === 'blocked'  && <SettingsBlockedUsers />}
                                {settingsPage === 'archived' && <SettingsArchivedConversations />}
                                {settingsPage === 'reports'  && <SettingsMyReports />}
                                {settingsPage === 'oauth'    && <SettingsOAuth />}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Settings menu ── */}
            {showSettingsMenu && (
                <div className="prof-settings-overlay" onClick={closeSettingsMenu}>
                    <div className="prof-settings-menu" onClick={(e) => e.stopPropagation()}>

                        <div className="prof-settings-group" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                            <button
                                type="button"
                                className="prof-settings-accordion-trigger"
                                onClick={() => { setIsModerationExpanded(p => !p); setIsAccountExpanded(false); }}
                            >
                                <span className="prof-settings-accordion-left">
                                    <IoShieldCheckmarkOutline size={20} />
                                    <span>Modération</span>
                                </span>
                                {isModerationExpanded ? <IoChevronUpOutline size={20} /> : <IoChevronDownOutline size={20} />}
                            </button>
                            {isModerationExpanded && (
                                <div className="prof-settings-accordion-content">
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setSettingsPage('ai'); }}>
                                        <IoSparklesOutline size={20} /><span>Fonctionnalités IA</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setSettingsPage('blocked'); }}>
                                        <IoBanOutline size={20} /><span>Utilisateurs bloqués</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setSettingsPage('archived'); }}>
                                        <IoArchiveOutline size={20} /><span>Conversations archivées</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setSettingsPage('reports'); }}>
                                        <IoFlagOutline size={20} /><span>Mes signalements</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="prof-settings-group">
                            <button
                                type="button"
                                className="prof-settings-accordion-trigger"
                                onClick={() => { setIsAccountExpanded(p => !p); setIsModerationExpanded(false); }}
                            >
                                <span className="prof-settings-accordion-left">
                                    <IoPersonCircleOutline size={20} />
                                    <span>Compte</span>
                                </span>
                                {isAccountExpanded ? <IoChevronUpOutline size={20} /> : <IoChevronDownOutline size={20} />}
                            </button>
                            {isAccountExpanded && (
                                <div className="prof-settings-accordion-content">
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); openView('stats', statsCardRef); }}>
                                        <IoStatsChartOutline size={20} /><span>Statistiques</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setSettingsPage('oauth'); }}>
                                        <IoLinkOutline size={20} /><span>Connexions OAuth</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem" onClick={() => { closeSettingsMenu(); setShowEulaModal(true); }}>
                                        <IoDocumentTextOutline size={20} /><span>Conditions d&apos;utilisation</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem prof-settings-subitem--danger" onClick={() => { closeSettingsMenu(); void logout(); }}>
                                        <IoLogOutOutline size={20} /><span>Déconnexion</span>
                                    </button>
                                    <button type="button" className="prof-settings-subitem prof-settings-subitem--danger" onClick={() => { closeSettingsMenu(); void handleDeleteAccount(); }}>
                                        <IoTrashOutline size={20} /><span>Supprimer mon compte</span>
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* ── EULA ── */}
            {showEulaModal && (
                <div className="prof-eula-overlay" onClick={() => setShowEulaModal(false)}>
                    <div className="prof-eula-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="prof-eula-header">
                            <h3 className="prof-eula-title">{CGU_TITLE}</h3>
                            <button type="button" className="prof-eula-close" onClick={() => setShowEulaModal(false)}>
                                <IoCloseOutline size={24} />
                            </button>
                        </div>
                        <div className="prof-eula-body">
                            <p className="prof-eula-text">{CGU_CONTENT}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
