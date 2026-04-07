import React, { useEffect, useState } from 'react';
import {
    IoChevronBack, IoSettingsOutline, IoPeopleOutline, IoPersonOutline,
    IoSparklesOutline, IoArchiveOutline, IoBanOutline, IoExitOutline,
    IoCopyOutline, IoRefreshOutline, IoChevronDown, IoChevronUp,
    IoCheckmarkCircleOutline, IoPersonAddOutline, IoStar, IoStarOutline,
} from 'react-icons/io5';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '../contexts/NavigationContext';
import type { Conversation } from '../hooks/useConversations';
import './ConversationManagementPage.css';

interface Props {
    conversation: Conversation;
}

interface GroupMember {
    uuid: string;
    username: string;
    surnom?: string;
    photo_profil_url?: string;
    role?: 'owner' | 'moderator' | 'member';
}

interface GroupDetails {
    uuid: string;
    name: string;
    description?: string;
    avatar?: string;
    invite_code?: string;
    members?: GroupMember[];
    my_membership?: { role: 'owner' | 'moderator' | 'member' };
    members_count?: number;
}

interface UserProfile {
    uuid: string;
    username: string;
    surnom?: string;
    photo_profil_url?: string;
    bio?: string;
    nb_connexions?: number;
    date_inscription?: string;
}

interface AgentDetail {
    uuid: string;
    name: string;
    description?: string;
    avatar_url?: string;
    system_prompt?: string;
    is_favorite?: boolean;
}

export default function ConversationManagementPage({ conversation }: Props) {
    const { closeConversationManagement, closeConversation } = useNavigation();
    const queryClient = useQueryClient();

    const isGroup = conversation.conversation_type === 'group';
    const isAgent = conversation.conversation_type === 'agent';
    const isDirect = !isGroup && !isAgent;

    const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAllMembers, setShowAllMembers] = useState(false);
    const [promptExpanded, setPromptExpanded] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    const [actionMsg, setActionMsg] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const load = async () => {
            try {
                if (isGroup) {
                    const groupUuid = (conversation as any).group_info?.uuid || (conversation as any).group_uuid;
                    if (groupUuid) {
                        const res = await fetchWithAuth(`${API_BASE_URL}/groups/${groupUuid}/`);
                        if (res.ok) setGroupDetails(await res.json());
                    }
                } else if (isDirect) {
                    const partnerUuid = (conversation as any).other_participant?.uuid || (conversation as any).participant_uuid;
                    if (partnerUuid) {
                        const res = await fetchWithAuth(`${API_BASE_URL}/api/users/${partnerUuid}/`);
                        if (res.ok) setUserProfile(await res.json());
                    }
                } else if (isAgent) {
                    const agentUuid = (conversation as any).agent_info?.uuid || (conversation as any).agent_uuid || (conversation as any).framework_agent?.uuid;
                    if (agentUuid) {
                        const res = await fetchWithAuth(`${API_BASE_URL}/framework/agents/${agentUuid}/`);
                        if (res.ok) {
                            const data = await res.json();
                            setAgentDetail(data);
                            setIsFavorite(!!data.is_favorite);
                        }
                    }
                }
            } catch { /* silent */ }
            finally { setLoading(false); }
        };
        load();
    }, [conversation.uuid, isGroup, isDirect, isAgent]); // eslint-disable-line react-hooks/exhaustive-deps

    const notify = (msg: string) => {
        setActionMsg(msg);
        setTimeout(() => setActionMsg(null), 2500);
    };

    const handleArchive = async () => {
        if (!window.confirm('Archiver cette conversation ?')) return;
        try {
            await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/${conversation.uuid}/archive/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'archive' }),
            });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            closeConversation();
        } catch { notify('Erreur lors de l\'archivage'); }
    };

    const handleBlock = async () => {
        const partnerUuid = (conversation as any).other_participant?.uuid;
        if (!partnerUuid || !window.confirm('Bloquer cet utilisateur ?')) return;
        try {
            await fetchWithAuth(`${API_BASE_URL}/messaging/block-user/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_uuid: partnerUuid, action: 'block' }),
            });
            notify('Utilisateur bloqué');
            setTimeout(closeConversation, 1000);
        } catch { notify('Erreur lors du blocage'); }
    };

    const handleLeaveGroup = async () => {
        if (!groupDetails?.uuid || !window.confirm('Quitter ce groupe ?')) return;
        try {
            await fetchWithAuth(`${API_BASE_URL}/groups/${groupDetails.uuid}/leave/`, { method: 'POST' });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            closeConversation();
        } catch { notify('Impossible de quitter le groupe'); }
    };

    const handleCopyInviteCode = () => {
        if (groupDetails?.invite_code) {
            navigator.clipboard.writeText(groupDetails.invite_code).then(() => notify('Code copié !'));
        }
    };

    const handleRegenerateCode = async () => {
        if (!groupDetails?.uuid) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/groups/${groupDetails.uuid}/invite-code/regenerate/`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setGroupDetails(prev => prev ? { ...prev, invite_code: data.invite_code } : prev);
                notify('Nouveau code généré');
            }
        } catch { notify('Erreur lors de la régénération'); }
    };

    const handleToggleFavorite = async () => {
        if (!agentDetail?.uuid) return;
        try {
            const action = isFavorite ? 'unfavorite' : 'favorite';
            await fetchWithAuth(`${API_BASE_URL}/framework/agents/${agentDetail.uuid}/${action}/`, { method: 'POST' });
            setIsFavorite(f => !f);
        } catch { /* silent */ }
    };

    // ── Avatar / name resolution
    const displayAvatar = isGroup
        ? (groupDetails?.avatar || conversation.avatar_url)
        : isAgent
            ? (agentDetail?.avatar_url || conversation.avatar_url)
            : (userProfile?.photo_profil_url || conversation.avatar_url);

    const displayName = isGroup
        ? (groupDetails?.name || conversation.name)
        : isAgent
            ? (agentDetail?.name || conversation.name)
            : (userProfile?.surnom || userProfile?.username || conversation.name);

    const typeBadgeLabel = isGroup ? 'Groupe' : isAgent ? 'Agent IA' : 'Conversation directe';

    const membersToShow = showAllMembers
        ? (groupDetails?.members || [])
        : (groupDetails?.members || []).slice(0, 6);

    return (
        <div className="mgmt-page">
            {/* Floating header */}
            <div className="mgmt-page__header">
                <button className="mgmt-page__back-btn" onClick={closeConversationManagement}>
                    <IoChevronBack size={22} />
                </button>
                <IoSettingsOutline size={18} className="mgmt-page__header-icon" />
                <span className="mgmt-page__header-title">Gestion</span>
                {isAgent && (
                    <button className="mgmt-page__fav-btn" onClick={handleToggleFavorite}>
                        {isFavorite ? <IoStar size={20} color="rgba(10,145,104,1)" /> : <IoStarOutline size={20} color="#9ca3af" />}
                    </button>
                )}
            </div>

            {/* Toast notification */}
            {actionMsg && (
                <div className="mgmt-page__toast">
                    <IoCheckmarkCircleOutline size={16} />
                    {actionMsg}
                </div>
            )}

            <div className="mgmt-page__content">
                {loading ? (
                    <div className="mgmt-page__loading"><div className="mgmt-page__spinner" /></div>
                ) : (
                    <>
                        {/* ── Hero section ── */}
                        <div className="mgmt-page__hero">
                            <div className="mgmt-page__hero-bg" />
                            {displayAvatar ? (
                                <img src={displayAvatar} alt={displayName} className="mgmt-page__avatar" />
                            ) : (
                                <div className="mgmt-page__avatar-placeholder">
                                    {isGroup ? <IoPeopleOutline size={44} /> : isAgent ? <IoSparklesOutline size={44} /> : <IoPersonOutline size={44} />}
                                </div>
                            )}
                            <h1 className="mgmt-page__name">{displayName}</h1>
                            <span className="mgmt-page__type-badge">{typeBadgeLabel}</span>

                            {/* Group stats */}
                            {isGroup && groupDetails && (
                                <div className="mgmt-page__stats">
                                    <div className="mgmt-page__stat">
                                        <span className="mgmt-page__stat-value">{groupDetails.members_count ?? groupDetails.members?.length ?? '—'}</span>
                                        <span className="mgmt-page__stat-label">Membres</span>
                                    </div>
                                </div>
                            )}

                            {/* User stats */}
                            {isDirect && userProfile?.nb_connexions !== undefined && (
                                <div className="mgmt-page__stats">
                                    <div className="mgmt-page__stat">
                                        <span className="mgmt-page__stat-value">{userProfile.nb_connexions}</span>
                                        <span className="mgmt-page__stat-label">Connexions</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Description / Bio ── */}
                        {(isGroup && groupDetails?.description) && (
                            <section className="mgmt-page__section">
                                <h2 className="mgmt-page__section-title">À propos</h2>
                                <p className="mgmt-page__description">{groupDetails.description}</p>
                            </section>
                        )}
                        {(isDirect && userProfile?.bio) && (
                            <section className="mgmt-page__section">
                                <h2 className="mgmt-page__section-title">À propos</h2>
                                <p className="mgmt-page__description">{userProfile.bio}</p>
                            </section>
                        )}
                        {(isAgent && agentDetail?.description) && (
                            <section className="mgmt-page__section">
                                <h2 className="mgmt-page__section-title">À propos de l'agent</h2>
                                <p className="mgmt-page__description">{agentDetail.description}</p>
                            </section>
                        )}

                        {/* ── Agent: System prompt ── */}
                        {isAgent && agentDetail?.system_prompt && (
                            <section className="mgmt-page__section">
                                <button className="mgmt-page__expand-btn" onClick={() => setPromptExpanded(v => !v)}>
                                    <span>Prompt système</span>
                                    {promptExpanded ? <IoChevronUp size={16} /> : <IoChevronDown size={16} />}
                                </button>
                                {promptExpanded && (
                                    <pre className="mgmt-page__prompt">{agentDetail.system_prompt}</pre>
                                )}
                            </section>
                        )}

                        {/* ── Group: Invite code ── */}
                        {isGroup && groupDetails?.invite_code && (
                            <section className="mgmt-page__section">
                                <h2 className="mgmt-page__section-title">Code d'invitation</h2>
                                <div className="mgmt-page__code-row">
                                    <span className="mgmt-page__code">{groupDetails.invite_code}</span>
                                    <button className="mgmt-page__icon-btn" onClick={handleCopyInviteCode} title="Copier">
                                        <IoCopyOutline size={18} />
                                    </button>
                                    {groupDetails.my_membership?.role === 'owner' && (
                                        <button className="mgmt-page__icon-btn" onClick={handleRegenerateCode} title="Régénérer">
                                            <IoRefreshOutline size={18} />
                                        </button>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* ── Group: Members ── */}
                        {isGroup && (groupDetails?.members?.length ?? 0) > 0 && (
                            <section className="mgmt-page__section">
                                <h2 className="mgmt-page__section-title">
                                    <IoPeopleOutline size={16} />
                                    Membres ({groupDetails!.members!.length})
                                </h2>
                                <div className="mgmt-page__members">
                                    {membersToShow.map(member => (
                                        <div key={member.uuid} className="mgmt-page__member-row">
                                            {member.photo_profil_url ? (
                                                <img src={member.photo_profil_url} alt="" className="mgmt-page__member-avatar" />
                                            ) : (
                                                <div className="mgmt-page__member-avatar-placeholder">
                                                    {(member.surnom || member.username).charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="mgmt-page__member-info">
                                                <span className="mgmt-page__member-name">{member.surnom || member.username}</span>
                                                {member.role && member.role !== 'member' && (
                                                    <span className="mgmt-page__member-role">{member.role === 'owner' ? 'Propriétaire' : 'Modérateur'}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {(groupDetails?.members?.length ?? 0) > 6 && (
                                    <button className="mgmt-page__show-more" onClick={() => setShowAllMembers(v => !v)}>
                                        {showAllMembers ? 'Voir moins' : `Voir tous (${groupDetails!.members!.length})`}
                                    </button>
                                )}
                            </section>
                        )}

                        {/* ── Actions ── */}
                        <section className="mgmt-page__section">
                            <h2 className="mgmt-page__section-title">Actions</h2>
                            <div className="mgmt-page__actions">

                                {/* Archive — always */}
                                <button className="mgmt-page__action-row" onClick={handleArchive}>
                                    <div className="mgmt-page__action-icon"><IoArchiveOutline size={22} /></div>
                                    <span>Archiver la conversation</span>
                                </button>

                                {/* Block — direct only */}
                                {isDirect && (
                                    <button className="mgmt-page__action-row mgmt-page__action-row--danger" onClick={handleBlock}>
                                        <div className="mgmt-page__action-icon mgmt-page__action-icon--danger"><IoBanOutline size={22} /></div>
                                        <span>Bloquer cet utilisateur</span>
                                    </button>
                                )}

                                {/* Add friend — direct only */}
                                {isDirect && (
                                    <button className="mgmt-page__action-row">
                                        <div className="mgmt-page__action-icon"><IoPersonAddOutline size={22} /></div>
                                        <span>Envoyer une demande d'ami</span>
                                    </button>
                                )}

                                {/* Leave group */}
                                {isGroup && (
                                    <button className="mgmt-page__action-row mgmt-page__action-row--danger" onClick={handleLeaveGroup}>
                                        <div className="mgmt-page__action-icon mgmt-page__action-icon--danger"><IoExitOutline size={22} /></div>
                                        <span>Quitter le groupe</span>
                                    </button>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
