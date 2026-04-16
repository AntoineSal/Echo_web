import { useConversations, type Conversation } from '../../hooks/useConversations';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { IoSearchOutline, IoAdd } from 'react-icons/io5';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import './ConversationsPanel.css';

interface ConversationsPanelProps {
  filter: 'private' | 'groups' | 'agents';
}

export default function ConversationsPanel({ filter }: ConversationsPanelProps) {
  const { isLoggedIn } = useAuth();
  const { privateConversations, groupConversations, agentConversations, isLoading } = useConversations();
  const { openConversation, selectedConversation, navigate } = useNavigation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isStartingJarvis, setIsStartingJarvis] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="conv-panel">
        <p className="conv-panel__empty">Connectez-vous pour voir vos conversations.</p>
      </div>
    );
  }

  let conversations: Conversation[] = [];
  let emptyText = 'Aucune conversation';

  switch (filter) {
    case 'private':
      conversations = privateConversations;
      emptyText = 'Aucune conversation';
      break;
    case 'groups':
      conversations = groupConversations;
      emptyText = 'Aucun groupe';
      break;
    case 'agents':
      conversations = agentConversations;
      emptyText = 'Aucun agent';
      break;
  }

  const filtered = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const handleStartJarvis = async () => {
    if (isStartingJarvis) return;
    setIsStartingJarvis(true);
    try {
      const agentsRes = await fetchWithAuth(`${API_BASE_URL}/framework/agents/`);
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        const agents = Array.isArray(agentsData) ? agentsData : agentsData.results || [];
        const jarvisAgent = agents.find((a: any) => a.name.toLowerCase().includes('jarvis')) || agents[0];

        if (jarvisAgent) {
          const res = await fetchWithAuth(
            `${API_BASE_URL}/framework/agents/${jarvisAgent.uuid}/start-conversation/`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
          );
          if (res.ok) {
            await queryClient.invalidateQueries({ queryKey: ['conversations', 'agents'] });
            const listRes = await fetchWithAuth(`${API_BASE_URL}/messaging/conversations/agents/`);
            if (listRes.ok) {
              const data = await listRes.json();
              const convs = Array.isArray(data) ? data : data.results || [];
              const sorted = convs
                .filter((c: any) =>
                  c.framework_agent?.uuid === jarvisAgent.uuid ||
                  c.agent_info?.uuid === jarvisAgent.uuid
                )
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              if (sorted[0]) {
                openConversation({
                  ...sorted[0],
                  conversation_type: 'agent' as const,
                  name: sorted[0].framework_agent?.name || jarvisAgent.name || 'Jarvis',
                  avatar_url: sorted[0].framework_agent?.avatar_url || jarvisAgent.avatar_url || '',
                });
                return;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to start Jarvis conversation", e);
    } finally {
      setIsStartingJarvis(false);
    }
  };

  return (
    <div className="conv-panel">
      {/* Search bar — identical to mobile SearchBar */}
      <div className="conv-panel__search-wrap">
        <IoSearchOutline size={16} className="conv-panel__search-icon" />
        <input
          className="conv-panel__search"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="conv-panel__search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Grid scroll area */}
      <div className="conv-panel__grid-scroll">
        {isLoading ? (
          <div className="conv-panel__loading">
            <div className="conv-panel__spinner" />
            <span>Chargement...</span>
          </div>
        ) : (
          <>
            <div className="conv-panel__grid">
              {/* "+" new conversation square — always first */}
              <button
                className={`conv-square conv-square--add ${isStartingJarvis ? 'conv-square--disabled' : ''}`}
                title="Nouveau"
                disabled={isStartingJarvis}
                onClick={filter === 'agents' ? handleStartJarvis : () => navigate(filter === 'private' ? 'add-friend' : 'add-group')}
              >
                <IoAdd size={38} color="rgba(10, 145, 104, 1)" />
                <div className="conv-square__name-badge">
                  <span className="conv-square__name">{isStartingJarvis ? '...' : (filter === 'agents' ? 'Jarvis' : 'Nouveau')}</span>
                </div>
              </button>

              {filtered.map(conv => {
                const isSelected = selectedConversation?.uuid === conv.uuid;
                const hasUnread = conv.unread_count > 0;
                const isAgentConversation = conv.conversation_type === 'agent';
                const usesFullAgentNamePlaceholder = isAgentConversation && !conv.avatar_url;

                return (
                  <button
                    key={conv.uuid}
                    className={`conv-square ${hasUnread ? 'conv-square--unread' : ''} ${isSelected ? 'conv-square--selected' : ''} ${isAgentConversation ? 'conv-square--agent' : ''} ${usesFullAgentNamePlaceholder ? 'conv-square--agent-textual' : ''}`}
                    onClick={() => openConversation(conv)}
                    title={conv.name}
                  >
                    {conv.avatar_url ? (
                      <img src={conv.avatar_url} alt={conv.name} className="conv-square__avatar" />
                    ) : usesFullAgentNamePlaceholder ? (
                      <div className="conv-square__agent-name-fill">
                        <span className="conv-square__agent-name-fill-text">{conv.name}</span>
                      </div>
                    ) : (
                      <div className="conv-square__avatar-placeholder">
                        {conv.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {hasUnread && (
                      <span className="conv-square__unread-badge">
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}

                    {!usesFullAgentNamePlaceholder && (
                      <div className={`conv-square__name-badge ${isAgentConversation ? 'conv-square__name-badge--agent' : ''}`}>
                        <span className={`conv-square__name ${isAgentConversation ? 'conv-square__name--agent' : ''}`}>{conv.name}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <p className="conv-panel__empty">{search ? 'Aucun résultat' : emptyText}</p>
            )}
          </>
        )}
      </div>

    </div>
  );
}
