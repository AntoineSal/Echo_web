import React, { useRef, useState } from 'react';
import { IoSend, IoSparkles, IoAttach, IoClose, IoArrowUndoOutline, IoConstructOutline } from 'react-icons/io5';
import { useQuery } from '@tanstack/react-query';
import { useJarvis } from '../../contexts/JarvisContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { enrichAgent, type BackendAgent, type ToolItem } from '../../data/toolsCatalog';
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

function ToolPicker({
    tools,
    selectedTool,
    onSelect,
}: {
    tools: ToolItem[];
    selectedTool: ToolItem | null;
    onSelect: (tool: ToolItem) => void;
}) {
    return (
        <div className="wbb-tool-menu">
            <div className="wbb-tool-menu__title">Tools Jarvis</div>
            {tools.length === 0 ? (
                <div className="wbb-tool-menu__empty">Aucun tool disponible</div>
            ) : (
                tools.slice(0, 8).map((tool) => (
                    <button
                        key={tool.id}
                        type="button"
                        className={`wbb-tool-menu__item ${selectedTool?.id === tool.id ? 'wbb-tool-menu__item--selected' : ''}`}
                        onClick={() => onSelect(tool)}
                    >
                        <span className="wbb-tool-menu__icon">{tool.icon}</span>
                        <span className="wbb-tool-menu__text">
                            <span className="wbb-tool-menu__name">{tool.name}</span>
                            <span className="wbb-tool-menu__desc">{tool.description}</span>
                        </span>
                    </button>
                ))
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function WebBottomBar() {
    const { sendJarvisMessage, sendJarvisInteraction } = useJarvis();
    const { selectedConversation, sendCallback, replyTo, setReplyTo } = useNavigation();

    const [text, setText] = useState('');
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [jarvisMode, setJarvisMode] = useState(false);
    const [toolPickerOpen, setToolPickerOpen] = useState(false);
    const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const sendLockRef = useRef(false);

    const isChat = !!selectedConversation;
    const canSend = jarvisMode ? text.trim().length > 0 : text.trim().length > 0 || stagedFiles.length > 0;

    const { data: tools = [] } = useQuery({
        queryKey: ['jarvis', 'tools', 'bottom-bar'],
        queryFn: async (): Promise<ToolItem[]> => {
            const res = await fetchWithAuth(`${API_BASE_URL}/framework/agents/public/`);
            if (!res.ok) return [];
            const data = await res.json();
            const agents: BackendAgent[] = Array.isArray(data) ? data : data.results || [];
            return agents.map(enrichAgent);
        },
        enabled: isChat && jarvisMode,
        staleTime: 5 * 60_000,
    });

    const handleSend = () => {
        if (!canSend) return;
        if (sendLockRef.current) return;
        sendLockRef.current = true;

        if (isChat && jarvisMode && selectedConversation) {
            void sendJarvisInteraction({
                message: text.trim(),
                mode: 'conversation_thread',
                toolMode: selectedTool ? 'force' : 'auto',
                conversationUuid: selectedConversation.uuid,
                conversationName: selectedConversation.name,
                conversationType: selectedConversation.conversation_type,
                parentMessageUuid: replyTo?.uuid ?? null,
                parentMessagePreview: replyTo ? getFirstNonEmptyLine(replyTo.content) : null,
                preferredToolId: selectedTool?.name ?? null,
            });
            setReplyTo(null);
        } else if (isChat && sendCallback.current) {
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
        setSelectedTool(null);
        setToolPickerOpen(false);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        window.setTimeout(() => {
            sendLockRef.current = false;
        }, 450);
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

    const selectTool = (tool: ToolItem) => {
        setSelectedTool((current) => current?.id === tool.id ? null : tool);
        setToolPickerOpen(false);
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

                {isChat && jarvisMode && (
                    <div className="wbb-jarvis-mode-row">
                        <span className="wbb-jarvis-mode-chip">
                            <IoSparkles size={13} />
                            Commencer un thread avec Jarvis
                        </span>
                        {selectedTool && (
                            <span className="wbb-jarvis-mode-chip wbb-jarvis-mode-chip--tool">
                                <IoConstructOutline size={13} />
                                {selectedTool.name}
                            </span>
                        )}
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

                    {/* Jarvis/thread mode button */}
                    {isChat && (
                        <>
                            <button
                                className={`wbb-icon-btn ${jarvisMode ? 'wbb-icon-btn--active' : ''}`}
                                title="Demander a Jarvis dans ce fil"
                                onClick={() => setJarvisMode(v => !v)}
                            >
                                <IoSparkles size={18} />
                            </button>
                            {jarvisMode && (
                                <div className="wbb-tool-picker-wrap">
                                    <button
                                        className={`wbb-icon-btn ${selectedTool || toolPickerOpen ? 'wbb-icon-btn--active' : ''}`}
                                        title="Choisir un tool pour Jarvis"
                                        onClick={() => setToolPickerOpen(v => !v)}
                                    >
                                        <IoConstructOutline size={18} />
                                    </button>
                                    {toolPickerOpen && (
                                        <ToolPicker
                                            tools={tools}
                                            selectedTool={selectedTool}
                                            onSelect={selectTool}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Input */}
                    <div className="web-bottom-bar__input-wrap">
                        <textarea
                            ref={textareaRef}
                            className="web-bottom-bar__input"
                            rows={1}
                            placeholder={isChat
                                ? jarvisMode
                                    ? `Demander a Jarvis dans ${selectedConversation.name || 'ce fil'}...`
                                    : `Message pour ${selectedConversation.name || 'Conversation'}...`
                                : 'Demande a Jarvis...'}
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
