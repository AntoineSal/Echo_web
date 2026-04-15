import { useCallback } from 'react';
import {
    IoSparklesOutline, IoCheckmarkCircleOutline,
    IoChatbubbleEllipsesOutline, IoPersonAddOutline,
    IoPeopleOutline, IoCalendarOutline,
    IoCloseOutline, IoCheckmarkOutline,
} from 'react-icons/io5';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useConversations } from '../hooks/useConversations';
import { useNotificationsSummary, type MessageSummary } from '../hooks/useNotificationsSummary';
import { useJarvisSuggestions, type JarvisSuggestion } from '../hooks/useJarvisSuggestions';
import { useFriendRequests } from '../hooks/useFriendRequests';
import { useGroupInvitations } from '../hooks/useGroupInvitations';
import { useJarvis } from '../contexts/JarvisContext';
import { useNavigation } from '../contexts/NavigationContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { AgentContentRenderer } from '../components/conversations/AgentContentRenderer';
import { renderFormattedText } from '../components/conversations/richText';
import { syncConversationsByType } from '../services/localSync';
import './HomePage.css';

// Map suggestion icon names to actual components
const ICON_MAP: Record<string, React.ReactNode> = {
    IoChatbubbleEllipsesOutline: <IoChatbubbleEllipsesOutline size={20} />,
    IoPersonAddOutline: <IoPersonAddOutline size={20} />,
    IoPeopleOutline: <IoPeopleOutline size={20} />,
    IoCalendarOutline: <IoCalendarOutline size={20} />,
    IoSparklesOutline: <IoSparklesOutline size={20} />,
};

export default function HomePage() {
    const { user, isLoggedIn } = useAuth();
    const queryClient = useQueryClient();
    const { privateConversations, groupConversations, agentConversations } = useConversations();
    const { summaries, loading, dismissSummary } = useNotificationsSummary();
    const { friendRequests, updateFriendRequest } = useFriendRequests();
    const { groupInvitations, updateGroupInvitation } = useGroupInvitations();
    const jarvisSuggestions = useJarvisSuggestions(summaries);
    const { liveTurns, clearLiveTurns, removeLiveTurn } = useJarvis();
    const { openConversation } = useNavigation();

    const allConversations = [...privateConversations, ...groupConversations, ...agentConversations];

    const handleOpenConversation = useCallback((conversationUuid: string | null) => {
        if (!conversationUuid) return;
        const conv = allConversations.find(c => c.uuid === conversationUuid);
        if (conv) openConversation(conv);
    }, [allConversations, openConversation]);

    const totalUnread = [...privateConversations, ...groupConversations, ...agentConversations]
        .reduce((sum, c) => sum + (c.unread_count || 0), 0);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 6) return 'Bonne nuit';
        if (hour < 12) return 'Bonjour';
        if (hour < 18) return 'Bon après-midi';
        return 'Bonsoir';
    };

    const displayName = user?.username || user?.first_name || 'Utilisateur';
    const photoUrl = user?.photo_profil_url || user?.photo_profil || null;

    // ── Friend request handlers ──
    const handleAcceptFriend = useCallback(async (requestId: number, demandeurUuid: string) => {
        try {
            const response = await fetchWithAuth(
                `${API_BASE_URL}/relations/connections/${requestId}/`,
                { method: 'PATCH', body: JSON.stringify({ statut: 'acceptee' }) }
            );
            if (response.ok) {
                updateFriendRequest(requestId, 'accept');
                // Create conversation
                await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recipient_uuid: demandeurUuid }),
                });
            }
        } catch (error) {
            console.error('Error accepting friend request', error);
        }
    }, [updateFriendRequest]);

    const handleDeclineFriend = useCallback(async (requestId: number) => {
        try {
            const response = await fetchWithAuth(
                `${API_BASE_URL}/relations/connections/${requestId}/`,
                { method: 'PATCH', body: JSON.stringify({ statut: 'refusee' }) }
            );
            if (response.ok) updateFriendRequest(requestId, 'reject');
        } catch (error) {
            console.error('Error declining friend request', error);
        }
    }, [updateFriendRequest]);

    // ── Group invitation handlers ──
    const handleAcceptGroup = useCallback(async (uuid: string) => {
        try {
            const response = await fetchWithAuth(
                `${API_BASE_URL}/groups/invitations/${uuid}/respond/`,
                { method: 'POST', body: JSON.stringify({ action: 'accept' }) }
            );
            if (response.ok) {
                updateGroupInvitation(uuid);
                // Sync group conversations immediately so the new group appears without delay
                if (user?.uuid) {
                    syncConversationsByType(user.uuid, 'group').then(() => {
                        queryClient.invalidateQueries({ queryKey: ['conversations', 'groups'] });
                    }).catch(console.error);
                }
            }
        } catch (error) {
            console.error('Error accepting group invitation', error);
        }
    }, [updateGroupInvitation, user?.uuid, queryClient]);

    const handleDeclineGroup = useCallback(async (uuid: string) => {
        try {
            const response = await fetchWithAuth(
                `${API_BASE_URL}/groups/invitations/${uuid}/respond/`,
                { method: 'POST', body: JSON.stringify({ action: 'decline' }) }
            );
            if (response.ok) updateGroupInvitation(uuid);
        } catch (error) {
            console.error('Error declining group invitation', error);
        }
    }, [updateGroupInvitation]);

    const hasPendingCards = friendRequests.length > 0 || groupInvitations.length > 0;

    return (
        <div className="home-page">
            <div className="home-page__main-column">
                {/* ═══ SECTION 1: HERO CARD ═══ */}
                <div className="home-page__hero">
                    <div className="home-page__hero-blob home-page__hero-blob--a" />
                    <div className="home-page__hero-blob home-page__hero-blob--b" />
                    <div className="home-page__hero-content">
                        <div className="home-page__avatar-placeholder">
                            {photoUrl ? (
                                <img src={photoUrl} alt={displayName} className="home-page__avatar-img" />
                            ) : (
                                displayName.charAt(0).toUpperCase()
                            )}
                        </div>
                        <div className="home-page__hero-text">
                            <span className="home-page__hello">{getGreeting()},</span>
                            <span className="home-page__name">{displayName}</span>
                            {totalUnread > 0 ? (
                                <span className="home-page__subtitle">
                                    {totalUnread} message{totalUnread > 1 ? 's' : ''} non lu{totalUnread > 1 ? 's' : ''}
                                </span>
                            ) : (
                                <span className="home-page__subtitle">Tout est sous contrôle.</span>
                            )}
                        </div>
                    </div>
                </div>


                {/* ═══ SECTION 3: FRIEND REQUEST CARDS ═══ */}
                {friendRequests.length > 0 && friendRequests.map((request) => {
                    const name = request.demandeur_info.surnom || request.demandeur_info.username;
                    return (
                        <div key={request.id} className="home-page__compact-card">
                            <div className="home-page__compact-row">
                                <div className="home-page__compact-avatar">
                                    {request.demandeur_info.photo_profil_url ? (
                                        <img
                                            src={request.demandeur_info.photo_profil_url}
                                            alt={name}
                                            className="home-page__compact-avatar-img"
                                        />
                                    ) : (
                                        <span>{name.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="home-page__compact-info">
                                    <p className="home-page__compact-title">
                                        <strong>{name}</strong> veut être votre ami.
                                    </p>
                                </div>
                                <div className="home-page__compact-actions">
                                    <button
                                        className="home-page__icon-btn home-page__icon-btn--decline"
                                        onClick={() => handleDeclineFriend(request.id)}
                                        title="Refuser"
                                    >
                                        <IoCloseOutline size={22} />
                                    </button>
                                    <button
                                        className="home-page__icon-btn home-page__icon-btn--accept"
                                        onClick={() => handleAcceptFriend(request.id, request.demandeur_info.uuid)}
                                        title="Accepter"
                                    >
                                        <IoCheckmarkOutline size={22} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* ═══ SECTION 4: GROUP INVITATION CARDS ═══ */}
                {groupInvitations.length > 0 && groupInvitations.map((invitation) => {
                    const inviterName = invitation.created_by?.surnom || invitation.created_by?.username || 'Utilisateur';
                    return (
                        <div key={invitation.uuid} className="home-page__compact-card">
                            <div className="home-page__compact-row">
                                <div className="home-page__compact-avatar home-page__compact-avatar--group">
                                    <IoPeopleOutline size={22} />
                                </div>
                                <div className="home-page__compact-info">
                                    <p className="home-page__compact-title">
                                        <strong>{invitation.group.name}</strong>
                                    </p>
                                    <p className="home-page__compact-subtitle">
                                        Invitation de <strong>{inviterName}</strong>
                                    </p>
                                </div>
                                <div className="home-page__compact-actions">
                                    <button
                                        className="home-page__icon-btn home-page__icon-btn--decline"
                                        onClick={() => handleDeclineGroup(invitation.uuid)}
                                        title="Refuser"
                                    >
                                        <IoCloseOutline size={22} />
                                    </button>
                                    <button
                                        className="home-page__icon-btn home-page__icon-btn--accept"
                                        onClick={() => handleAcceptGroup(invitation.uuid)}
                                        title="Accepter"
                                    >
                                        <IoCheckmarkOutline size={22} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* ═══ JARVIS LIVE TURNS ═══ */}
                {liveTurns.map((turn) => (
                    <div key={turn.id} className="home-page__summary-card home-page__jarvis-voice-card">
                        <button
                            className="home-page__summary-dismiss"
                            onClick={() => removeLiveTurn(turn.id)}
                            title="Fermer"
                        >
                            <IoCloseOutline size={14} />
                        </button>
                        <div className="home-page__summary-body">
                            <div className="home-page__jarvis-badge">
                                <IoSparklesOutline size={12} color="rgba(10, 145, 104, 1)" />
                                <span className="home-page__jarvis-badge-text">Jarvis</span>
                            </div>
                            <div className="home-page__jarvis-content">
                                <div className="home-page__jarvis-user-msg">
                                    <span className="home-page__jarvis-user-text">
                                        « {renderFormattedText(turn.userMessage, `jarvis-user-${turn.id}`, {
                                            textClassName: 'home-page__jarvis-user-text',
                                            linkClassName: 'home-page__jarvis-user-link',
                                            inlineCodeClassName: 'home-page__jarvis-inline-code home-page__jarvis-inline-code--user',
                                            codeBlockClassName: 'home-page__jarvis-code-block home-page__jarvis-code-block--user',
                                            headingClassName: 'home-page__jarvis-heading',
                                            headingToneClassName: 'home-page__jarvis-heading--user',
                                        })} »
                                    </span>
                                </div>
                                <div className="home-page__jarvis-response">
                                    {turn.isProcessing ? (
                                        <span className="home-page__jarvis-processing">Jarvis réfléchit...</span>
                                    ) : (
                                        <div className="home-page__jarvis-response-text">
                                            <AgentContentRenderer content={turn.jarvisResponse} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* ═══ SECTION 5: JARVIS AI NOTIFICATION SUMMARIES ═══ */}
                {loading && (
                    <div className="home-page__loading">
                        <div className="home-page__spinner" />
                        <p>Chargement des résumés...</p>
                    </div>
                )}

                {!loading && summaries.length === 0 && !hasPendingCards && (
                    <div className="home-page__empty">
                        <IoCheckmarkCircleOutline size={48} color="rgba(10, 145, 104, 0.4)" />
                        <h2 className="home-page__empty-title">Tout est à jour !</h2>
                        <p className="home-page__empty-text">
                            Vous n'avez aucune notification pour le moment.
                        </p>
                    </div>
                )}

                {!loading && summaries.map((item: MessageSummary) => (
                    <div key={item.id} className="home-page__summary-card">
                        {item.conversationUuid && (
                            <button
                                className="home-page__summary-dismiss"
                                onClick={() => dismissSummary(item.id)}
                                title="Masquer"
                            >
                                <IoCloseOutline size={14} />
                            </button>
                        )}
                        <button
                            className="home-page__summary-body"
                            onClick={() => handleOpenConversation(item.conversationUuid ?? null)}
                            disabled={!item.conversationUuid}
                        >
                            <span className="home-page__summary-sender">{item.sender}</span>
                            <span className="home-page__summary-message">{item.message}</span>
                        </button>
                    </div>
                ))}
            </div>

            {/* ═══ JARVIS SUGGESTIONS (Right Sidebar) ═══ */}
            {jarvisSuggestions.length > 0 && isLoggedIn && (
                <div className="home-page__sidebar-column">
                    <div className="home-page__suggestions">
                        <h3 className="home-page__section-title">
                            <IoSparklesOutline size={16} /> Suggestions de Jarvis
                        </h3>
                        <div className="home-page__suggestions-list">
                            {jarvisSuggestions.map((s: JarvisSuggestion) => (
                                <button
                                    key={s.id}
                                    className="home-page__suggestion-chip"
                                    onClick={() => {
                                        if (s.action.type === 'navigate_conversation' && s.action.conversationUuid) {
                                            handleOpenConversation(s.action.conversationUuid);
                                        }
                                    }}
                                >
                                    <span
                                        className="home-page__suggestion-icon"
                                        style={{ backgroundColor: s.color + '15', color: s.color }}
                                    >
                                        {ICON_MAP[s.iconName] || <IoSparklesOutline size={20} />}
                                    </span>
                                    <span className="home-page__suggestion-text">{s.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
