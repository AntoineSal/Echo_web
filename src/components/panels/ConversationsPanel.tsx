import { useConversations, type Conversation } from '../../hooks/useConversations';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { IoSearchOutline } from 'react-icons/io5';
import { useState } from 'react';
import './ConversationsPanel.css';

interface ConversationsPanelProps {
  filter: 'private' | 'groups' | 'agents';
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  const msPerDay = 86_400_000;
  const diffDays = (now.getTime() - date.getTime()) / msPerDay;
  if (diffDays < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function getLastMessagePreview(conv: Conversation, currentUsername?: string): string {
  const msg = conv.last_message;
  if (!msg?.content) return 'Aucun message';
  const isMe = msg.sender_username === currentUsername;
  const prefix = isMe ? 'Vous : ' : `${msg.sender_username} : `;
  const text = conv.conversation_type === 'direct' && isMe
    ? `Vous : ${msg.content}`
    : conv.conversation_type === 'direct'
      ? msg.content
      : `${prefix}${msg.content}`;
  return text.length > 42 ? text.slice(0, 42) + '…' : text;
}

export default function ConversationsPanel({ filter }: ConversationsPanelProps) {
  const { isLoggedIn, user } = useAuth();
  const { privateConversations, groupConversations, agentConversations, isLoading } = useConversations();
  const { openConversation, selectedConversation } = useNavigation();
  const [search, setSearch] = useState('');

  if (!isLoggedIn) {
    return (
      <div className="conv-panel">
        <p className="conv-panel__empty">Connectez-vous pour voir vos conversations.</p>
      </div>
    );
  }

  let conversations: Conversation[] = [];
  let title = 'Conversations';
  let emptyText = 'Aucune conversation';

  switch (filter) {
    case 'private':
      conversations = privateConversations;
      title = 'Conversations';
      emptyText = 'Aucune conversation';
      break;
    case 'groups':
      conversations = groupConversations;
      title = 'Groupes';
      emptyText = 'Aucun groupe';
      break;
    case 'agents':
      conversations = agentConversations;
      title = 'Agents';
      emptyText = 'Aucun agent';
      break;
  }

  const filtered = search.trim()
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <div className="conv-panel">
      {/* Header */}
      <div className="conv-panel__header">
        <h3 className="conv-panel__title">{title}</h3>
      </div>

      {/* Search */}
      <div className="conv-panel__search-wrap">
        <IoSearchOutline size={14} className="conv-panel__search-icon" />
        <input
          className="conv-panel__search"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="conv-panel__list">
        {isLoading ? (
          <div className="conv-panel__loading">
            <div className="conv-panel__spinner" />
            <span>Chargement...</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="conv-panel__empty">{search ? 'Aucun résultat' : emptyText}</p>
        ) : (
          filtered.map(conv => {
            const isSelected = selectedConversation?.uuid === conv.uuid;
            const hasUnread = conv.unread_count > 0;
            const preview = getLastMessagePreview(conv, user?.username);
            const time = formatTime(conv.last_message?.created_at);

            return (
              <button
                key={conv.uuid}
                className={`conv-panel__item ${isSelected ? 'conv-panel__item--selected' : ''}`}
                onClick={() => openConversation(conv)}
              >
                {/* Avatar */}
                <div className="conv-panel__avatar">
                  {conv.avatar_url ? (
                    <img src={conv.avatar_url} alt={conv.name} className="conv-panel__avatar-img" />
                  ) : (
                    <span className="conv-panel__avatar-letter">
                      {conv.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {hasUnread && <span className="conv-panel__dot" />}
                </div>

                {/* Content */}
                <div className="conv-panel__content">
                  <div className="conv-panel__row-top">
                    <span className={`conv-panel__name ${hasUnread ? 'conv-panel__name--bold' : ''}`}>
                      {conv.name}
                    </span>
                    {time && <span className={`conv-panel__time ${hasUnread ? 'conv-panel__time--unread' : ''}`}>{time}</span>}
                  </div>
                  <div className="conv-panel__row-bottom">
                    <span className={`conv-panel__preview ${hasUnread ? 'conv-panel__preview--bold' : ''}`}>
                      {preview}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="conv-panel__badge">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
