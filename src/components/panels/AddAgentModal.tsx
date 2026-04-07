import React, { useState } from 'react';
import { IoClose, IoSparklesOutline, IoStar, IoStarOutline } from 'react-icons/io5';
import { useAgentFramework, type Agent } from '../../hooks/useAgentFramework';
import './AddAgentModal.css';

interface AddAgentModalProps {
    onClose: () => void;
}

export function AddAgentModal({ onClose }: AddAgentModalProps) {
    const { myAgents, publicAgents, isLoading, toggleFavorite } = useAgentFramework();
    const [tab, setTab] = useState<'mine' | 'public'>('mine');
    const [search, setSearch] = useState('');

    const agents = tab === 'mine' ? myAgents : publicAgents;
    const filtered = search.trim()
        ? agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
        : agents;

    return (
        <div className="aam-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="aam-modal">
                {/* Header */}
                <div className="aam-header">
                    <IoSparklesOutline size={20} />
                    <span className="aam-title">Agents IA</span>
                    <button className="aam-close" onClick={onClose}><IoClose size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="aam-tabs">
                    <button className={`aam-tab ${tab === 'mine' ? 'aam-tab--active' : ''}`} onClick={() => setTab('mine')}>
                        Mes agents
                    </button>
                    <button className={`aam-tab ${tab === 'public' ? 'aam-tab--active' : ''}`} onClick={() => setTab('public')}>
                        Agents publics
                    </button>
                </div>

                {/* Search */}
                <div className="aam-search-wrap">
                    <input
                        className="aam-search"
                        placeholder="Rechercher..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* List */}
                <div className="aam-list">
                    {isLoading ? (
                        <div className="aam-empty"><div className="aam-spinner" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="aam-empty">
                            <IoSparklesOutline size={48} color="rgba(10,145,104,0.25)" />
                            <p>{tab === 'mine' ? 'Aucun agent' : 'Aucun agent public'}</p>
                        </div>
                    ) : (
                        filtered.map(agent => (
                            <AgentRow key={agent.uuid} agent={agent} onFavorite={() => toggleFavorite(agent.uuid)} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function AgentRow({ agent, onFavorite }: { agent: Agent; onFavorite: () => void }) {
    return (
        <div className="aam-agent-row">
            <div className="aam-agent-avatar">
                {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} />
                ) : (
                    <IoSparklesOutline size={18} color="rgba(10,145,104,0.8)" />
                )}
            </div>
            <div className="aam-agent-info">
                <span className="aam-agent-name">{agent.name}</span>
                {agent.description && (
                    <span className="aam-agent-desc">{agent.description}</span>
                )}
            </div>
            <button
                className={`aam-fav-btn ${agent.is_favorite ? 'aam-fav-btn--active' : ''}`}
                onClick={onFavorite}
                title={agent.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
                {agent.is_favorite ? <IoStar size={18} /> : <IoStarOutline size={18} />}
            </button>
        </div>
    );
}
