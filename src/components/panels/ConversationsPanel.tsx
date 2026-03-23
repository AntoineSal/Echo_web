import { useConversations, type Conversation } from '../../hooks/useConversations';
import { useAuth } from '../../contexts/AuthContext';
import './ConversationsPanel.css';

interface ConversationsPanelProps {
    filter: 'private' | 'groups' | 'agents';
    onSelectConversation?: (uuid: string) => void;
}

export default function ConversationsPanel({ filter, onSelectConversation }: ConversationsPanelProps) {
    const { isLoggedIn } = useAuth();
    const { privateConversations, groupConversations, agentConversations, isLoading } = useConversations();

    if (!isLoggedIn) {
        return (
            <div className="conversations-panel">
                <p className="conversations-panel__empty">Connectez-vous pour voir vos conversations.</p>
            </div>
        );
    }

    let conversations: Conversation[] = [];
    let title = 'Conversations';

    switch (filter) {
        case 'private':
            conversations = privateConversations;
            title = 'Conversations';
            break;
        case 'groups':
            conversations = groupConversations;
            title = 'Groupes';
            break;
        case 'agents':
            conversations = agentConversations;
            title = 'Agents';
            break;
    }

    return (
        <div className="conversations-panel">
            <h3 className="conversations-panel__title">{title}</h3>

            {isLoading ? (
                <div className="conversations-panel__loading">
                    <div className="conversations-panel__spinner" />
                    <span>Chargement...</span>
                </div>
            ) : conversations.length === 0 ? (
                <p className="conversations-panel__empty">Aucune conversation</p>
            ) : (
                <div className="conversations-panel__grid">
                    {conversations.map((conv) => (
                        <button
                            key={conv.uuid}
                            className="conversations-panel__square"
                            onClick={() => onSelectConversation?.(conv.uuid)}
                        >
                            <div className="conversations-panel__avatar">
                                {conv.avatar_url ? (
                                    <img
                                        src={conv.avatar_url}
                                        alt={conv.name}
                                        className="conversations-panel__avatar-img"
                                    />
                                ) : (
                                    conv.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            {conv.unread_count > 0 && (
                                <span className="conversations-panel__badge">{conv.unread_count}</span>
                            )}
                            <span className="conversations-panel__name">{conv.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
