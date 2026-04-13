import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMessages, type Message } from '../../hooks/useMessages';
import { useWebSocketMessages } from '../../hooks/useWebSocketMessages';
import { useNavigation } from '../../contexts/NavigationContext';
import { useAuth } from '../../contexts/AuthContext';
import { MessageBubble } from './MessageBubble';
import { AgentContentRenderer } from './AgentContentRenderer';
import { buildMessageReactionContent, extractReactionMapFromMessages, isReactionEventMessage } from '../../utils/messageReactions';
import { IoChevronBack, IoChevronDown, IoChevronUp, IoChatbubbleOutline, IoSend, IoSparkles } from 'react-icons/io5';
import './ConversationThread.css';

interface ConversationThreadProps {
    conversationId: string;
    conversationName: string;
    conversationAvatar?: string;
    conversationType?: 'direct' | 'group' | 'agent' | 'group_chat' | 'ai_agent';
}

// ── Helper: is this message from an AI agent? ──────────────────────────────
function isAgentMessage(msg: Message): boolean {
    return (
        !!msg.is_ai_generated ||
        !!msg.framework_agent_name ||
        !!msg.framework_agent_uuid ||
        !!msg.agent_info?.name ||
        !!msg.agent_info?.uuid ||
        !!msg.ai_agent_name ||
        !!msg.ai_agent_uuid
    );
}

function resolveAgentName(msg: Message): string {
    return (
        msg.agent_info?.name ||
        msg.framework_agent_name ||
        msg.ai_agent_name ||
        msg.sender_username ||
        'Agent IA'
    );
}

/** Extract first non-empty text line for collapsed preview */
function getContentPreview(content: string): string {
    if (!content?.trim()) return '';
    try {
        const parsed = JSON.parse(content);
        if (parsed?.mode === 'structured' && parsed?.data?.nodes) {
            for (const node of parsed.data.nodes) {
                if (node.text?.trim()) return node.text.trim();
            }
        }
        if (parsed?.fallback_text) return parsed.fallback_text;
        if (parsed?.text) return parsed.text;
    } catch { /* plain text */ }
    const firstLine = content.split('\n').find(l => l.trim());
    return firstLine?.trim() ?? '';
}

// ── Agent message card ─────────────────────────────────────────────────────
interface AgentCardProps {
    msg: Message;
    threadMessages: Message[];
    conversationId: string;
    isAutoExpanded: boolean;
    onThreadSend: (text: string, parentUuid: string) => void;
    conversationAvatar?: string;
}

function AgentCard({ msg, threadMessages, conversationId, isAutoExpanded, onThreadSend, conversationAvatar }: AgentCardProps) {
    const { user } = useAuth();
    const [expanded, setExpanded] = useState(isAutoExpanded);
    const agentName = resolveAgentName(msg);
    const preview = getContentPreview(msg.content ?? '');

    const formattedTime = msg.created_at
        ? new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className={`agent-card ${expanded ? 'agent-card--expanded' : ''}`}>

            {/* ── Header (always visible) ──────────────────────────────── */}
            <button
                type="button"
                className="agent-card__header"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
            >
                <div className="agent-card__header-left">
                    {/* Avatar */}
                    {conversationAvatar ? (
                        <img src={conversationAvatar} alt={agentName} className="agent-card__avatar" />
                    ) : (
                        <div className="agent-card__avatar-placeholder">
                            <IoSparkles size={16} color="rgba(10,145,104,0.9)" />
                        </div>
                    )}

                    {/* Name + preview */}
                    <div className="agent-card__header-text">
                        <span className="agent-card__name">{agentName}</span>
                        {!expanded && preview && (
                            <span className="agent-card__preview">{preview}</span>
                        )}
                    </div>
                </div>

                <div className="agent-card__header-right">
                    {threadMessages.length > 0 && (
                        <span className="agent-card__reply-count">
                            <IoChatbubbleOutline size={12} />
                            {threadMessages.length}
                        </span>
                    )}
                    <span className="agent-card__time">{formattedTime}</span>
                    <span className="agent-card__chevron">
                        {expanded ? <IoChevronUp size={16} /> : <IoChevronDown size={16} />}
                    </span>
                </div>
            </button>

            {/* ── Expandable body ──────────────────────────────────────── */}
            <div className="agent-card__body">

                {/* Divider */}
                <div className="agent-card__body-divider" />

                {/* Agent response content */}
                {msg.content ? (
                    <div className="agent-card__content">
                        <AgentContentRenderer content={msg.content} />
                    </div>
                ) : (
                    <p className="agent-card__empty">Aucun contenu</p>
                )}

                {/* Thread replies */}
                {threadMessages.length > 0 && (
                    <div className="agent-card__thread">
                        <div className="agent-card__thread-label">
                            <IoChatbubbleOutline size={13} />
                            <span>{threadMessages.length} réponse{threadMessages.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="agent-card__thread-messages">
                            {threadMessages.map((tmsg) => {
                                const isAgentMsg = !!(tmsg.is_ai_generated || tmsg.framework_agent_uuid || tmsg.ai_agent_uuid);
                                const isMe = !isAgentMsg && ((tmsg.sender_uuid && user?.uuid)
                                    ? tmsg.sender_uuid === user.uuid
                                    : tmsg.sender_username === user?.username);
                                const tTime = tmsg.created_at
                                    ? new Date(tmsg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                                    : '';
                                return (
                                    <div
                                        key={tmsg.uuid}
                                        className={`agent-card__thread-msg ${isAgentMsg ? 'agent-card__thread-msg--agent' : isMe ? 'agent-card__thread-msg--mine' : 'agent-card__thread-msg--theirs'}`}
                                    >
                                        {isAgentMsg && (
                                            <span className="agent-card__thread-sender agent-card__thread-sender--agent">🤖 {tmsg.sender_username || 'Agent'}</span>
                                        )}
                                        {!isAgentMsg && !isMe && (
                                            <span className="agent-card__thread-sender">{tmsg.sender_username}</span>
                                        )}
                                        <div className={`agent-card__thread-bubble ${isAgentMsg ? 'agent-card__thread-bubble--agent' : isMe ? 'agent-card__thread-bubble--mine' : 'agent-card__thread-bubble--theirs'}`}>
                                            <span>{tmsg.content}</span>
                                            <span className="agent-card__thread-time">{tTime}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

// ── Main ConversationThread ──────────────────────────────────────────────────
export function ConversationThread({
    conversationId,
    conversationName,
    conversationAvatar,
    conversationType,
}: ConversationThreadProps) {
    const { user } = useAuth();
    const { messages, isLoading, isFetchingMore, hasMore, loadMore, sendMessage, markAsRead } = useMessages(conversationId);
    const { isConnected } = useWebSocketMessages(conversationId);
    const { closeConversation, registerSendCallback, openConversationManagement, replyTo, setReplyTo } = useNavigation();
    const replyToRef = useRef(replyTo);
    replyToRef.current = replyTo;

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const topHistorySentinelRef = useRef<HTMLDivElement>(null);
    const scrollEndRef = useRef<HTMLDivElement>(null);
    const initialScrollDoneRef = useRef(false);
    const shouldStickToBottomRef = useRef(true);
    const pendingHistoryAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
    const historyLoadInFlightRef = useRef(false);
    const lastHistoryLoadAtRef = useRef(0);
    const lastHistoryOldestUuidRef = useRef<string | null>(null);
    const lastHistoryMessageCountRef = useRef(-1);

    const sendMutateRef = useRef(sendMessage.mutate);
    sendMutateRef.current = sendMessage.mutate;

    const isGroupConversation = conversationType === 'group';
    const isAgentConversation = conversationType === 'agent';

    useEffect(() => {
        registerSendCallback({
            sendText: (text, parentMessageUuid) => {
                sendMutateRef.current({
                    conversationId,
                    content: text,
                    parentMessageUuid: parentMessageUuid ?? replyToRef.current?.uuid,
                });
                setReplyTo(null);
            },
            sendFiles: (text, files, parentMessageUuid) => {
                sendMutateRef.current({
                    conversationId,
                    content: text,
                    files,
                    parentMessageUuid: parentMessageUuid ?? replyToRef.current?.uuid,
                });
                setReplyTo(null);
            },
        });
        return () => registerSendCallback(null);
    }, [conversationId, registerSendCallback]);

    useEffect(() => {
        if (conversationId) markAsRead();
    }, [conversationId, markAsRead]);

    useEffect(() => {
        initialScrollDoneRef.current = false;
        shouldStickToBottomRef.current = true;
        pendingHistoryAnchorRef.current = null;
        historyLoadInFlightRef.current = false;
        lastHistoryLoadAtRef.current = 0;
        lastHistoryOldestUuidRef.current = null;
        lastHistoryMessageCountRef.current = -1;
    }, [conversationId]);

    const handleThreadSend = useCallback((text: string, parentUuid: string) => {
        sendMutateRef.current({ conversationId, content: text, parentMessageUuid: parentUuid });
    }, [conversationId]);

    const orderedMessages = useMemo(() => messages.slice().reverse(), [messages]);
    const oldestRenderedMessageUuid = orderedMessages[0]?.uuid ?? null;

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior });
    }, []);

    const triggerLoadOlderMessages = useCallback((reason: 'nearTop') => {
        const container = messagesContainerRef.current;
        if (!container) return;
        if (!hasMore || isFetchingMore) return;
        if (historyLoadInFlightRef.current) return;

        const now = Date.now();
        if (now - lastHistoryLoadAtRef.current < 500) return;

        const currentMessageCount = orderedMessages.length;
        const repeatedSameCursorWithoutProgress =
            !!oldestRenderedMessageUuid &&
            oldestRenderedMessageUuid === lastHistoryOldestUuidRef.current &&
            currentMessageCount === lastHistoryMessageCountRef.current;
        if (repeatedSameCursorWithoutProgress) return;

        const repeatedSameCursorTooSoon =
            !!oldestRenderedMessageUuid &&
            oldestRenderedMessageUuid === lastHistoryOldestUuidRef.current &&
            now - lastHistoryLoadAtRef.current < 1500;
        if (repeatedSameCursorTooSoon) return;

        pendingHistoryAnchorRef.current = {
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
        };
        historyLoadInFlightRef.current = true;
        lastHistoryLoadAtRef.current = now;
        lastHistoryOldestUuidRef.current = oldestRenderedMessageUuid;
        lastHistoryMessageCountRef.current = currentMessageCount;

        loadMore()
            .catch((error) => {
                console.warn('Failed to load older messages:', error);
                pendingHistoryAnchorRef.current = null;
                lastHistoryOldestUuidRef.current = null;
                lastHistoryMessageCountRef.current = -1;
            })
            .finally(() => {
                historyLoadInFlightRef.current = false;
            });
    }, [hasMore, isFetchingMore, loadMore, oldestRenderedMessageUuid, orderedMessages.length]);

    const handleMessagesScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        shouldStickToBottomRef.current = distanceToBottom < 96;

        if (container.scrollTop <= 120) {
            triggerLoadOlderMessages('nearTop');
        }
    }, [triggerLoadOlderMessages]);

    useLayoutEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        if (pendingHistoryAnchorRef.current) {
            const { scrollHeight, scrollTop } = pendingHistoryAnchorRef.current;
            const heightDelta = container.scrollHeight - scrollHeight;
            container.scrollTop = scrollTop + Math.max(0, heightDelta);
            pendingHistoryAnchorRef.current = null;
            return;
        }

        if (!initialScrollDoneRef.current && orderedMessages.length > 0) {
            scrollToBottom('auto');
            initialScrollDoneRef.current = true;
            shouldStickToBottomRef.current = true;
            return;
        }

        if (shouldStickToBottomRef.current) {
            scrollToBottom('auto');
        }
    }, [orderedMessages.length, scrollToBottom]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        const sentinel = topHistorySentinelRef.current;
        if (!container || !sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry?.isIntersecting) {
                    triggerLoadOlderMessages('nearTop');
                }
            },
            {
                root: container,
                threshold: 0.1,
                rootMargin: '120px 0px 0px 0px',
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [triggerLoadOlderMessages]);

    const childrenByParent = useMemo(() => {
        const map = new Map<string, Message[]>();
        for (const msg of orderedMessages) {
            if (!msg.parent_message_uuid) continue;
            const list = map.get(msg.parent_message_uuid) || [];
            list.push(msg);
            map.set(msg.parent_message_uuid, list);
        }
        return map;
    }, [orderedMessages]);

    const agentReplyUuids = useMemo(() => {
        const agentUuids = new Set(orderedMessages.filter(isAgentMessage).map(m => m.uuid));
        const replyUuids = new Set<string>();
        for (const msg of orderedMessages) {
            if (msg.parent_message_uuid && agentUuids.has(msg.parent_message_uuid)) {
                replyUuids.add(msg.uuid);
            }
        }
        return replyUuids;
    }, [orderedMessages]);

    // Build reaction map and set of reaction event UUIDs
    const { reactionByMessageUuid, reactionEventMessageUuids } = useMemo(
        () => extractReactionMapFromMessages(orderedMessages),
        [orderedMessages]
    );

    // Fast uuid → message lookup (for reply quotes)
    const messageByUuid = useMemo(() => {
        const map = new Map<string, Message>();
        for (const msg of orderedMessages) map.set(msg.uuid, msg);
        return map;
    }, [orderedMessages]);

    // Send a reaction
    const handleReact = useCallback((targetMessageUuid: string, emoji: string) => {
        const content = buildMessageReactionContent(targetMessageUuid, emoji);
        sendMutateRef.current({ conversationId, content });
    }, [conversationId]);

    const handleReply = useCallback((msg: Message) => {
        setReplyTo({ uuid: msg.uuid, sender_username: msg.sender_username, content: msg.content, attachments: msg.attachments });
    }, [setReplyTo]);

    const showStatusDot = isConnected && (isAgentConversation || conversationType === 'direct');

    return (
        <div className="conversation-thread">
            {/* Floating pill header */}
            <div className="thread-header">
                <button type="button" className="thread-back-btn" onClick={closeConversation} title="Retour">
                    <IoChevronBack size={22} color="rgba(60,60,60,0.9)" />
                </button>
                <div className="thread-header-info" onClick={openConversationManagement} style={{ cursor: 'pointer' }}>
                    {conversationAvatar ? (
                        <img src={conversationAvatar} alt={conversationName} className="thread-header-avatar" />
                    ) : (
                        <div className="thread-header-avatar-placeholder">
                            {conversationName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <span className="thread-header-name" title={conversationName}>
                        {conversationName}
                    </span>
                    {showStatusDot && <span className="thread-status-dot" />}
                </div>
            </div>

            {/* Messages area */}
            <div
                ref={messagesContainerRef}
                className="thread-messages"
                onScroll={handleMessagesScroll}
            >
                <div ref={topHistorySentinelRef} className="thread-history-sentinel" aria-hidden="true" />
                {isLoading && orderedMessages.length === 0 ? (
                    <div className="thread-loading">Chargement des messages...</div>
                ) : (
                    <>
                        {isFetchingMore && (
                            <div className="thread-history-loading">
                                <IoSparkles className="thread-history-spinner" size={14} color="rgba(10, 145, 104, 0.8)" />
                                Chargement de l&apos;historique...
                            </div>
                        )}
                        {orderedMessages.map((msg, index, arr) => {
                        if (agentReplyUuids.has(msg.uuid)) return null;

                        // Skip reaction event messages (they're virtual, not displayed)
                        if (isReactionEventMessage(msg.content)) return null;

                        // Agent message → expandable card
                        if (isAgentMessage(msg)) {
                            const threadMessages = childrenByParent.get(msg.uuid) || [];
                            return (
                                <AgentCard
                                    key={msg.uuid}
                                    msg={msg}
                                    threadMessages={threadMessages}
                                    conversationId={conversationId}
                                    isAutoExpanded={isAgentConversation}
                                    onThreadSend={handleThreadSend}
                                    conversationAvatar={conversationAvatar}
                                />
                            );
                        }

                        // System message
                        if (msg.message_type === 'system') {
                            return (
                                <div key={msg.uuid} className="system-message-container">
                                    <span className="system-message-text">{msg.content}</span>
                                </div>
                            );
                        }

                        // Normal message — grouping
                        const prevMsg = arr[index - 1] ?? null;
                        const nextMsg = arr[index + 1] ?? null;

                        const prevNormal = prevMsg && !agentReplyUuids.has(prevMsg.uuid) && !isAgentMessage(prevMsg) ? prevMsg : null;
                        const nextNormal = nextMsg && !agentReplyUuids.has(nextMsg.uuid) && !isAgentMessage(nextMsg) ? nextMsg : null;

                        const sameSender = (a: Message | null, b: Message) =>
                            !!a && ((a.sender_uuid && b.sender_uuid)
                                ? a.sender_uuid === b.sender_uuid
                                : a.sender_username === b.sender_username);

                        const replyParent = msg.parent_message_uuid
                            ? (messageByUuid.get(msg.parent_message_uuid) ?? null)
                            : null;

                        return (
                            <MessageBubble
                                key={msg.uuid || msg.id}
                                message={msg}
                                isFirstInGroup={!sameSender(prevNormal, msg)}
                                isLastInGroup={!sameSender(nextNormal, msg)}
                                isSameSenderAsNext={sameSender(nextNormal, msg)}
                                isSameSenderAsPrev={sameSender(prevNormal, msg)}
                                isGroupConversation={isGroupConversation}
                                reactionEmojis={reactionByMessageUuid[msg.uuid] || []}
                                replyParent={replyParent}
                                onReact={handleReact}
                                onReply={handleReply}
                            />
                        );
                        })}
                    </>
                )}
                <div ref={scrollEndRef} />
            </div>

        </div>
    );
}
