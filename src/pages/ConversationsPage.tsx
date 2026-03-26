import { IoChatbubblesOutline } from 'react-icons/io5';
import { ConversationThread } from '../components/conversations/ConversationThread';
import { useNavigation } from '../contexts/NavigationContext';
import './ConversationsPage.css';

export default function ConversationsPage() {
  const { selectedConversation } = useNavigation();

  if (!selectedConversation) {
    return (
      <div className="conversations-empty">
        <IoChatbubblesOutline size={56} className="conversations-empty__icon" />
        <h2 className="conversations-empty__title">Vos conversations</h2>
        <p className="conversations-empty__text">
          Sélectionnez une conversation dans le panneau latéral pour commencer à discuter.
        </p>
      </div>
    );
  }

  return (
    <ConversationThread
      key={selectedConversation.uuid}
      conversationId={selectedConversation.uuid}
      conversationName={selectedConversation.name}
      conversationAvatar={selectedConversation.avatar_url}
    />
  );
}
