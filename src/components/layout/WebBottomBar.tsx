import React, { useEffect, useRef, useState } from 'react';
import { IoSend, IoSparkles, IoAttach, IoClose, IoArrowUndoOutline } from 'react-icons/io5';
import { useJarvis } from '../../contexts/JarvisContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAgentFramework, type Agent } from '../../hooks/useAgentFramework';
import { useConversations } from '../../hooks/useConversations';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { useQueryClient } from '@tanstack/react-query';
import './WebBottomBar.css';

const getFirstNonEmptyLine = (text?: string): string => {
    if (!text) return 'Message sans texte';
    const firstLine = text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    if (!firstLine) return 'Message sans texte';
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
};

// ── Staged file preview item ───────────────────────────────────────────────
function StagedFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    return (
        <div className="wbb-staged-chip">
            {isImage && previewUrl ? (
                <img src={previewUrl} alt={file.name} className="wbb-staged-chip__thumb" />
            ) : (
                <div className="wbb-staged-chip__icon">📎</div>
            )}
            <span className="wbb-staged-chip__name">{file.name.length > 18 ? file.name.slice(0, 16) + '…' : file.name}</span>
            <button className="wbb-staged-chip__remove" onClick={onRemove} title="Retirer">
                <IoClose size={12} />
            </button>
        </div>
    );
}

// ── Agent call picker ──────────────────────────────────────────────────────
function AgentPicker({
    agents,
    allAgents,
    onSelect,
    onClose,
}: {
    agents: Agent[];
    allAgents: Agent[];
    onSelect: (agent: Agent) => void;
    onClose: () => void;
}) {
    const displayAgents = agents.length > 0 ? agents : allAgents;
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [onClose]);

    return (
        <div className="wbb-agent-dropdown" ref={pickerRef}>
            <div className="wbb-agent-dropdown__title">
                {agents.length > 0 ? 'Favoris' : 'Tous les agents'}
            </div>
            {displayAgents.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>
                    Aucun agent disponible
                </div>
            ) : (
                displayAgents.map(agent => (
                    <button
                        key={agent.uuid}
                        className="wbb-agent-dropdown__item"
                        onClick={() => onSelect(agent)}
                    >
                        <span className="wbb-agent-dropdown__item-name">
                            {agent.avatar_url ? '': '🤖 '}{agent.name}
                        </span>
                        {agent.description && (
                            <span className="wbb-agent-dropdown__item-desc">{agent.description}</span>
                        )}
                    </button>
                ))
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function WebBottomBar() {
    const { sendJarvisMessage } = useJarvis();
    const { selectedConversation, sendCallback, openConversation, navigate, replyTo, setReplyTo } = useNavigation();
    const { favoriteAgents, myAgents } = useAgentFramework();
    const { agentConversations } = useConversations();
    const queryClient = useQueryClient();

    const [text, setText] = useState('');
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [selectedAgentUuid, setSelectedAgentUuid] = useState<string | null>(null);
    const [agentPickerOpen, setAgentPickerOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isChat = !!selectedConversation;
    const canSend = text.trim().length > 0 || stagedFiles.length > 0;

    const handleSend = () => {
        if (!canSend) return;

        if (isChat && sendCallback.current) {
            if (stagedFiles.length > 0) {
                sendCallback.current.sendFiles(text.trim(), stagedFiles);
            } else {
                sendCallback.current.sendText(text.trim());
            }
        } else if (!isChat) {
            if (text.trim()) sendJarvisMessage(text.trim());
        }

        setText('');
        setStagedFiles([]);
        setSelectedAgentUuid(null);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    };

    const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setStagedFiles(prev => [...prev, ...files]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        setStagedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const toggleAgent = (uuid: string) => {
        setSelectedAgentUuid(prev => prev === uuid ? null : uuid);
    };

    const handleCallAgent = async (agent: Agent) => {
        setAgentPickerOpen(false);
        // Find existing agent conversation
        const existing = agentConversations.find(c =>
            c.framework_agent?.uuid === agent.uuid ||
            c.agent_info?.uuid === agent.uuid ||
            (c as any).agent_uuid === agent.uuid
        );
        if (existing) {
            openConversation(existing);
            return;
        }
        // Create new agent conversation
        try {
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
    };

    return (
        <footer className={`web-bottom-bar ${isChat ? 'web-bottom-bar--chat' : 'web-bottom-bar--jarvis'}`}>

            <div className="web-bottom-bar__inner">
                {/* Reply preview */}
                {isChat && replyTo && (
                    <div className="wbb-reply-preview">
                        <IoArrowUndoOutline size={13} className="wbb-reply-preview__icon" />
                        <div className="wbb-reply-preview__accent" />
                        <div className="wbb-reply-preview__text">
                            <span className="wbb-reply-preview__sender">Réponse à {replyTo.sender_username || 'message'}</span>
                            <span className="wbb-reply-preview__content">
                                {replyTo.attachments?.length ? '📎 Pièce jointe' : getFirstNonEmptyLine(replyTo.content)}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="wbb-reply-preview__close"
                            onClick={() => setReplyTo(null)}
                            aria-label="Annuler la réponse"
                        >
                            <IoClose size={14} />
                        </button>
                    </div>
                )}

                {/* Staged files row */}
                {stagedFiles.length > 0 && (
                    <div className="wbb-staged-row">
                        {stagedFiles.map((f, i) => (
                            <StagedFileChip key={i} file={f} onRemove={() => removeFile(i)} />
                        ))}
                    </div>
                )}

                {/* Agent pills row (chat mode only) */}
                {isChat && favoriteAgents.length > 0 && (
                    <div className="wbb-agent-pills">
                        {favoriteAgents.map(agent => (
                            <button
                                key={agent.uuid}
                                type="button"
                                className={`wbb-agent-pill ${selectedAgentUuid === agent.uuid ? 'wbb-agent-pill--active' : ''}`}
                                onClick={() => toggleAgent(agent.uuid)}
                                title={agent.description || agent.name}
                            >
                                🤖 {agent.name}
                                {selectedAgentUuid === agent.uuid && (
                                    <IoClose size={11} style={{ marginLeft: 2 }} />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Main input row */}
                <div className="web-bottom-bar__row">
                    {/* Attachment button (chat only) */}
                    {isChat && (
                        <>
                            <button
                                className="wbb-icon-btn"
                                title="Joindre un fichier"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <IoAttach size={20} />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                                style={{ display: 'none' }}
                                onChange={handleFilePick}
                            />
                        </>
                    )}

                    {/* Call agent button (chat mode only) */}
                    {isChat && (
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button
                                className={`wbb-icon-btn ${agentPickerOpen ? 'wbb-icon-btn--active' : ''}`}
                                title="Appeler un agent IA"
                                onClick={() => setAgentPickerOpen(v => !v)}
                            >
                                <IoSparkles size={18} />
                            </button>
                            {agentPickerOpen && (
                                <AgentPicker
                                    agents={favoriteAgents}
                                    allAgents={myAgents}
                                    onSelect={handleCallAgent}
                                    onClose={() => setAgentPickerOpen(false)}
                                />
                            )}
                        </div>
                    )}

                    {/* Input */}
                    <div className="web-bottom-bar__input-wrap">
                        <textarea
                            ref={textareaRef}
                            className="web-bottom-bar__input"
                            rows={1}
                            placeholder={isChat ? `Message pour ${selectedConversation.name || 'Conversation'}…` : 'Demande à Jarvis…'}
                            value={text}
                            onChange={handleTextChange}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            className={`web-bottom-bar__send ${canSend ? 'web-bottom-bar__send--active' : ''}`}
                            onClick={handleSend}
                            disabled={!canSend}
                        >
                            <IoSend size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
