import React, { useState } from 'react';
import { IoSearch, IoStar, IoStarOutline, IoSparklesOutline, IoChevronForward } from 'react-icons/io5';
import { useQueryClient } from '@tanstack/react-query';
import { useAgentFramework, type Agent } from '../hooks/useAgentFramework';
import { useConversations } from '../hooks/useConversations';
import { useNavigation } from '../contexts/NavigationContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import './MarketplacePage.css';

export default function MarketplacePage() {
    const { publicAgents, myAgents, favoriteAgents, isLoading, toggleFavorite } = useAgentFramework();
    const { agentConversations } = useConversations();
    const { openConversation, navigate } = useNavigation();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'all' | 'favorites' | 'mine'>('all');
    const [openingUuid, setOpeningUuid] = useState<string | null>(null);

    const baseList = tab === 'favorites' ? favoriteAgents : tab === 'mine' ? myAgents : publicAgents;
    const filtered = search.trim()
        ? baseList.filter(a =>
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            (a.description ?? '').toLowerCase().includes(search.toLowerCase())
          )
        : baseList;

    const handleOpen = async (agent: Agent) => {
        if (openingUuid) return;
        setOpeningUuid(agent.uuid);
        try {
            const existing = agentConversations.find(c =>
                c.framework_agent?.uuid === agent.uuid ||
                c.agent_info?.uuid === agent.uuid ||
                (c as any).agent_uuid === agent.uuid
            );
            if (existing) {
                openConversation(existing);
                return;
            }
            const res = await fetchWithAuth(`${API_BASE_URL}/framework/agents/${agent.uuid}/start-conversation/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                await queryClient.invalidateQueries({ queryKey: ['conversations', 'agents'] });
                const listRes = await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/agents/`);
                if (listRes.ok) {
                    const data = await listRes.json();
                    const convs = Array.isArray(data) ? data : data.results || [];
                    const newConv = convs.find((c: any) =>
                        c.framework_agent?.uuid === agent.uuid ||
                        c.agent_info?.uuid === agent.uuid
                    );
                    if (newConv) {
                        openConversation({
                            ...newConv,
                            conversation_type: 'agent' as const,
                            name: newConv.framework_agent?.name || agent.name || 'Agent',
                            avatar_url: newConv.framework_agent?.avatar_url || agent.avatar_url || '',
                        });
                        return;
                    }
                }
                navigate('agents');
            }
        } catch { /* silent */ }
        finally { setOpeningUuid(null); }
    };

    return (
        <div className="mkt-page">
            {/* Hero */}
            <div className="mkt-hero">
                <div className="mkt-hero__inner">
                    <div className="mkt-hero__icon">
                        <IoSparklesOutline size={28} />
                    </div>
                    <div>
                        <h1 className="mkt-hero__title">Marketplace</h1>
                        <p className="mkt-hero__sub">Découvrez et utilisez des agents IA</p>
                    </div>
                </div>

                {/* Search */}
                <div className="mkt-search-wrap">
                    <IoSearch size={16} className="mkt-search-icon" />
                    <input
                        className="mkt-search"
                        placeholder="Rechercher un agent..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Tabs */}
                <div className="mkt-tabs">
                    {(['all', 'favorites', 'mine'] as const).map(t => (
                        <button
                            key={t}
                            className={`mkt-tab ${tab === t ? 'mkt-tab--active' : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {t === 'all' ? 'Tous' : t === 'favorites' ? 'Favoris' : 'Mes agents'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="mkt-content">
                {isLoading ? (
                    <div className="mkt-empty">
                        <div className="mkt-spinner" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="mkt-empty">
                        <IoSparklesOutline size={52} className="mkt-empty__icon" />
                        <p className="mkt-empty__text">
                            {search ? 'Aucun agent trouvé' : tab === 'favorites' ? 'Aucun favori' : tab === 'mine' ? 'Aucun agent configuré' : 'Aucun agent disponible'}
                        </p>
                    </div>
                ) : (
                    <div className="mkt-grid">
                        {filtered.map(agent => (
                            <AgentCard
                                key={agent.uuid}
                                agent={agent}
                                isOpening={openingUuid === agent.uuid}
                                onOpen={() => handleOpen(agent)}
                                onFavorite={() => toggleFavorite(agent.uuid)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function AgentCard({ agent, isOpening, onOpen, onFavorite }: {
    agent: Agent;
    isOpening: boolean;
    onOpen: () => void;
    onFavorite: () => void;
}) {
    return (
        <div className={`mkt-card ${isOpening ? 'mkt-card--opening' : ''}`} onClick={onOpen}>
            <div className="mkt-card__avatar">
                {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} />
                ) : (
                    <IoSparklesOutline size={22} color="rgba(10,145,104,0.7)" />
                )}
            </div>
            <div className="mkt-card__body">
                <span className="mkt-card__name">{agent.name}</span>
                {agent.description && (
                    <span className="mkt-card__desc">{agent.description}</span>
                )}
            </div>
            <div className="mkt-card__actions">
                <button
                    className={`mkt-card__fav ${agent.is_favorite ? 'mkt-card__fav--active' : ''}`}
                    onClick={e => { e.stopPropagation(); onFavorite(); }}
                    title={agent.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                    {agent.is_favorite ? <IoStar size={18} /> : <IoStarOutline size={18} />}
                </button>
                <IoChevronForward size={16} className="mkt-card__arrow" />
            </div>
        </div>
    );
}
