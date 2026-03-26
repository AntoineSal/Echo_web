import { useState } from 'react';
import { IoSend, IoSparkles } from 'react-icons/io5';
import { useJarvis } from '../../contexts/JarvisContext';
import './WebBottomBar.css';

interface WebBottomBarProps {
    isChat: boolean;
    conversationName?: string;
    onJarvisInvoke?: () => void;
}

export default function WebBottomBar({ isChat, conversationName, onJarvisInvoke }: WebBottomBarProps) {
    const [text, setText] = useState('');
    const { sendJarvisMessage } = useJarvis();

    const handleSend = () => {
        if (!text.trim()) return;

        if (isChat) {
            console.log(`[Chat] ${text}`);
            // TODO: wire to conversation send logic
        } else {
            sendJarvisMessage(text);
            if (onJarvisInvoke) onJarvisInvoke();
        }

        setText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <footer className="web-bottom-bar">
            <div className="web-bottom-bar__inner">
                {/* Target indicator */}
                <div className="web-bottom-bar__target">
                    <IoSparkles size={14} />
                    <span>{isChat ? conversationName || 'Conversation' : 'Jarvis'}</span>
                </div>

                {/* Input area */}
                <div className="web-bottom-bar__input-wrap">
                    <input
                        className="web-bottom-bar__input"
                        type="text"
                        placeholder={isChat ? 'Message...' : 'Ask Jarvis anything...'}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        className={`web-bottom-bar__send ${text.trim() ? 'web-bottom-bar__send--active' : ''}`}
                        onClick={handleSend}
                        disabled={!text.trim()}
                    >
                        <IoSend size={16} />
                    </button>
                </div>
            </div>
        </footer>
    );
}
