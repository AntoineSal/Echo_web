import { useState, useCallback, useRef, useEffect } from 'react';
import {
    IoSearch, IoSparkles, IoChevronForward,
    IoChatbubbleOutline, IoClose, IoExtensionPuzzleOutline,
} from 'react-icons/io5';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations } from '../hooks/useConversations';
import { useNavigation } from '../contexts/NavigationContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import {
    TOOL_CATEGORIES, TOOLS,
    getCategoryById, searchTools,
    type ToolItem,
} from '../data/toolsCatalog';
import './MarketplacePage.css';

// ── Rect of a card for expand animation ──
interface CardRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export default function MarketplacePage() {
    const { agentConversations } = useConversations();
    const { openConversation, navigate } = useNavigation();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null);
    const [originRect, setOriginRect] = useState<CardRect | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isStartingChat, setIsStartingChat] = useState(false);

    // Refs for all card elements
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Filtered tools
    const searchResults = search.trim() ? searchTools(search) : TOOLS;
    const displayedTools = activeCategory
        ? searchResults.filter(t => t.categoryId === activeCategory)
        : searchResults;

    // ── Open a tool: capture rect, then animate expand ──
    const handleCardClick = useCallback((tool: ToolItem) => {
        const el = cardRefs.current.get(tool.id);
        if (el) {
            const rect = el.getBoundingClientRect();
            setOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }
        setSelectedTool(tool);
        // Trigger expand on next frame so the DOM paints at origin first
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setIsExpanded(true));
        });
    }, []);

    // ── Close: animate back to origin ──
    const handleClose = useCallback(() => {
        setIsExpanded(false);
        // Wait for collapse animation to finish before unmounting
        setTimeout(() => {
            setSelectedTool(null);
            setOriginRect(null);
        }, 380);
    }, []);

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && selectedTool) handleClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedTool, handleClose]);

    // ── Start a new Jarvis conversation ──
    const startJarvisChat = useCallback(async () => {
        if (isStartingChat) return;
        setIsStartingChat(true);
        try {
            const agentsRes = await fetchWithAuth(`${API_BASE_URL}/framework/agents/`);
            if (agentsRes.ok) {
                const agentsData = await agentsRes.json();
                const agents = Array.isArray(agentsData) ? agentsData : agentsData.results || [];
                const jarvisAgent = agents.find((a: any) =>
                    a.name.toLowerCase().includes('jarvis')
                ) || agents[0];

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
                                .sort((a: any, b: any) =>
                                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                );
                            if (sorted[0]) {
                                openConversation({
                                    ...sorted[0],
                                    conversation_type: 'agent' as const,
                                    name: sorted[0].framework_agent?.name || jarvisAgent.name || 'Jarvis',
                                    avatar_url: sorted[0].framework_agent?.avatar_url || jarvisAgent.avatar_url || '',
                                });
                                handleClose();
                                return;
                            }
                        }
                    }
                }
            }
            navigate('agents');
            handleClose();
        } catch {
            navigate('agents');
            handleClose();
        } finally {
            setIsStartingChat(false);
        }
    }, [agentConversations, openConversation, navigate, queryClient, isStartingChat, handleClose]);

    // ── Expanded card target rect (centered, max 480×520) ──
    const getExpandedRect = (): React.CSSProperties => {
        const maxW = 480;
        const maxH = Math.min(540, window.innerHeight - 80);
        const w = Math.min(maxW, window.innerWidth - 48);
        return {
            top: (window.innerHeight - maxH) / 2,
            left: (window.innerWidth - w) / 2,
            width: w,
            height: maxH,
        };
    };

    const wrapStyle: React.CSSProperties = selectedTool
        ? isExpanded
            ? getExpandedRect()
            : originRect
                ? { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height }
                : getExpandedRect()
        : {};

    // Stagger counter
    let cardIdx = 0;

    return (
        <div className="cat-page">
            {/* ── Floating search bar ── */}
            <div className="cat-search-bar">
                <div className="cat-search-wrap">
                    <IoSearch size={17} className="cat-search-icon" />
                    <input
                        className="cat-search"
                        placeholder="Rechercher un outil..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="cat-search-clear" onClick={() => setSearch('')}>
                            <IoClose size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Category chips ── */}
            <div className="cat-chips">
                <button
                    className={`cat-chip ${activeCategory === null ? 'cat-chip--active' : ''}`}
                    onClick={() => setActiveCategory(null)}
                >
                    Tous
                </button>
                {TOOL_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        className={`cat-chip ${activeCategory === cat.id ? 'cat-chip--active' : ''}`}
                        onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* ── Scrollable grid ── */}
            <div className={`cat-scroll ${selectedTool ? 'cat-scroll--blurred' : ''}`}>
                {displayedTools.length === 0 ? (
                    <div className="cat-empty">
                        <IoExtensionPuzzleOutline size={48} className="cat-empty__icon" />
                        <p className="cat-empty__text">
                            Aucun outil trouvé pour « {search} »
                        </p>
                    </div>
                ) : (
                    <div className="cat-grid">
                        {displayedTools.map(tool => {
                            const cat = getCategoryById(tool.categoryId);
                            const delay = cardIdx * 0.035;
                            cardIdx++;
                            return (
                                <div
                                    key={tool.id}
                                    ref={el => { if (el) cardRefs.current.set(tool.id, el); }}
                                    className="cat-card"
                                    onClick={() => handleCardClick(tool)}
                                    style={{ animationDelay: `${delay}s` }}
                                >
                                    <div
                                        className="cat-card__icon"
                                        style={{
                                            background: (cat?.color || '#0a9168') + '12',
                                            border: `1.5px solid ${(cat?.color || '#0a9168')}20`,
                                        }}
                                    >
                                        {tool.icon}
                                    </div>
                                    <div className="cat-card__body">
                                        <span className="cat-card__name">{tool.name}</span>
                                        <span className="cat-card__desc">{tool.description}</span>
                                    </div>
                                    <IoChevronForward size={14} className="cat-card__chevron" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Expanded card (grows from clicked card position) ── */}
            {selectedTool && (
                <>
                    <div className="cat-expanded-backdrop" onClick={handleClose} />
                    <div
                        className="cat-expanded-wrap"
                        style={{
                            ...wrapStyle,
                            borderRadius: isExpanded ? 24 : 18,
                            overflow: 'hidden',
                        }}
                    >
                        <ExpandedCard
                            tool={selectedTool}
                            isExpanded={isExpanded}
                            onClose={handleClose}
                            onStartChat={startJarvisChat}
                            onExampleClick={startJarvisChat}
                            isStartingChat={isStartingChat}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ── Expanded card content ──
function ExpandedCard({ tool, isExpanded, onClose, onStartChat, onExampleClick, isStartingChat }: {
    tool: ToolItem;
    isExpanded: boolean;
    onClose: () => void;
    onStartChat: () => void;
    onExampleClick: (example: string) => void;
    isStartingChat: boolean;
}) {
    const category = getCategoryById(tool.categoryId);
    const catColor = category?.color || '#0a9168';

    if (!isExpanded) {
        // Mini preview matching the card layout (shown during collapse animation)
        return (
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, height: '100%', background: '#fff' }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: catColor + '12', border: `1.5px solid ${catColor}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0,
                }}>
                    {tool.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650, color: '#1a2620' }}>{tool.name}</div>
                    <div style={{ fontSize: 12, color: '#7d8f87', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tool.description}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="cat-expanded">
            <div className="cat-expanded__header">
                <div
                    className="cat-expanded__icon"
                    style={{ background: catColor + '14', border: `1.5px solid ${catColor}25` }}
                >
                    {tool.icon}
                </div>
                <div className="cat-expanded__titles">
                    <h2 className="cat-expanded__name">{tool.name}</h2>
                    <span className="cat-expanded__category">{category?.name}</span>
                </div>
                <button className="cat-expanded__close" onClick={onClose}>
                    <IoClose size={18} />
                </button>
            </div>

            <div className="cat-expanded__body">
                <p className="cat-expanded__desc">{tool.longDescription}</p>

                {tool.examples.length > 0 && (
                    <>
                        <h3 className="cat-expanded__examples-label">Exemples de requêtes</h3>
                        <div className="cat-expanded__examples">
                            {tool.examples.map((ex, i) => (
                                <button
                                    key={i}
                                    className="cat-expanded__example"
                                    onClick={() => onExampleClick(ex)}
                                >
                                    <IoChatbubbleOutline size={15} className="cat-expanded__example-icon" />
                                    « {ex} »
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <button
                    className="cat-expanded__cta"
                    onClick={onStartChat}
                    disabled={isStartingChat}
                    style={{ opacity: isStartingChat ? 0.6 : 1 }}
                >
                    <span className="cat-expanded__cta-icon"><IoSparkles size={18} /></span>
                    {isStartingChat ? 'Ouverture...' : 'Demander à Jarvis'}
                </button>
            </div>
        </div>
    );
}
