import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import './ChatInput.css';

interface ChatInputProps {
    onSend: (text: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

// In the web app, we can use react-icons if expo/vector-icons doesn't map well 
// but Echo_web has "react-icons" in package.json. 
// However, the project might use Ionicons from @expo/vector-icons if expo is setup.
// I will use standard HTML symbols or react-icons for simplicity, but let's try assuming a simple SVG.
import { IoSend } from 'react-icons/io5';

export function ChatInput({ onSend, placeholder = 'Votre message...', disabled = false }: ChatInputProps) {
    const [text, setText] = useState('');

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-input-container">
            <div className="chat-input-inner">
                <textarea
                    className="chat-input-textarea"
                    placeholder={placeholder}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                />
                <button
                    className={`chat-input-send-btn ${text.trim() ? 'active' : ''}`}
                    onClick={handleSend}
                    disabled={disabled || !text.trim()}
                >
                    <IoSend size={20} />
                </button>
            </div>
        </div>
    );
}
