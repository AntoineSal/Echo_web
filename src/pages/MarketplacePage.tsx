import { useState, useCallback, useRef, useEffect } from 'react';
import {
    IoSearch, IoSparkles, IoChevronForward,
    IoChatbubbleOutline, IoClose, IoExtensionPuzzleOutline,
} from 'react-icons/io5';
import { useQuery } from '@tanstack/react-query';
import { useJarvis } from '../contexts/JarvisContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import {
    TOOL_CATEGORIES,
    getCategoryById, enrichAgent,
    type ToolItem, type BackendAgent,
} from '../data/toolsCatalog';
import './MarketplacePage.css';

interface CardRect {
    top: number; left: number; width: number; height: number;
}

export default function MarketplacePage() {
    const { sendJarvisMessage } = useJarvis();

    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null);
    const [originRect, setOriginRect] = useState<CardRect | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isStartingChat, setIsStartingChat] = useState(false);

    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // ── Fetch agents publics depuis le backend ──
    const { data: tools = [], isLoading } = useQuery({
        queryKey: ['agents', 'public', 'catalog'],
        queryFn: async (): Promise<ToolItem[]> => {
            const res = await fetchWithAuth(`${API_BASE_URL}/framework/agents/public/`);
            if (!res.ok) return [];
            const data = await res.json();
            const agents: BackendAgent[] = Array.isArray(data) ? data : data.results || [];
            return agents.map(enrichAgent);
        },
        staleTime: 5 * 60_000,
    });

    // ── Filtrage ──
    const q = search.trim().toLowerCase();
    const searchResults = q
        ? tools.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.examples.some(e => e.toLowerCase().includes(q))
          )
        : tools;

    const displayedTools = activeCategory
        ? searchResults.filter(t => t.categoryId === activeCategory)
        : searchResults;

    // ── Expand / collapse animations ──
    const handleCardClick = useCallback((tool: ToolItem) => {
        const el = cardRefs.current.get(tool.id);
        if (el) {
            const rect = el.getBoundingClientRect();
            setOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }
        setSelectedTool(tool);
        requestAnimationFrame(() => requestAnimationFrame(() => setIsExpanded(true)));
    }, []);

    const handleClose = useCallback(() => {
        setIsExpanded(false);
        setTimeout(() => { setSelectedTool(null); setOriginRect(null); }, 380);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && selectedTool) handleClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedTool, handleClose]);

    // ── V0: demander a Jarvis d'utiliser le tool selectionne ──
    const askJarvisWithTool = useCallback(async (example?: string) => {
        if (isStartingChat) return;
        if (!selectedTool) return;
        setIsStartingChat(true);
        try {
            const prompt = example || `Utilise si pertinent le tool "${selectedTool.name}" pour m'aider.`;
            await sendJarvisMessage([
                `Tool souhaite: ${selectedTool.name}`,
                `Description: ${selectedTool.description}`,
                `Demande: ${prompt}`,
            ].join('\n'));
            handleClose();
        } catch {
            handleClose();
        } finally {
            setIsStartingChat(false);
        }
    }, [handleClose, isStartingChat, selectedTool, sendJarvisMessage]);

    // ── Rect de la carte expandée ──
    const getExpandedRect = (): React.CSSProperties => {
        const maxW = 480;
        const maxH = Math.min(540, window.innerHeight - 80);
        const w = Math.min(maxW, window.innerWidth - 48);
        return { top: (window.innerHeight - maxH) / 2, left: (window.innerWidth - w) / 2, width: w, height: maxH };
    };

    const wrapStyle: React.CSSProperties = selectedTool
        ? isExpanded
            ? getExpandedRect()
            : originRect
                ? { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height }
                : getExpandedRect()
        : {};

    let cardIdx = 0;

    return (
        <div className="cat-page">
            {/* Barre de recherche */}
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

            {/* Chips catégories */}
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

            {/* Grille */}
            <div className={`cat-scroll ${selectedTool ? 'cat-scroll--blurred' : ''}`}>
                {isLoading ? (
                    <div className="cat-skeleton-grid">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="cat-skeleton-card" style={{ animationDelay: `${i * 0.06}s` }} />
                        ))}
                    </div>
                ) : displayedTools.length === 0 ? (
                    <div className="cat-empty">
                        <IoExtensionPuzzleOutline size={48} className="cat-empty__icon" />
                        <p className="cat-empty__text">
                            {search ? `Aucun outil trouvé pour « ${search} »` : 'Aucun outil disponible'}
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

            {/* Carte expandée */}
            {selectedTool && (
                <>
                    <div className="cat-expanded-backdrop" onClick={handleClose} />
                    <div
                        className="cat-expanded-wrap"
                        style={{ ...wrapStyle, borderRadius: isExpanded ? 24 : 18, overflow: 'hidden' }}
                    >
                        <ExpandedCard
                            tool={selectedTool}
                            isExpanded={isExpanded}
                            onClose={handleClose}
                            onStartChat={() => askJarvisWithTool()}
                            onExampleClick={(example) => askJarvisWithTool(example)}
                            isStartingChat={isStartingChat}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ── Carte expandée ──
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
                <div className="cat-expanded__icon" style={{ background: catColor + '14', border: `1.5px solid ${catColor}25` }}>
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
                                <button key={i} className="cat-expanded__example" onClick={() => onExampleClick(ex)}>
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
                    {isStartingChat ? 'Envoi...' : 'Demander à Jarvis'}
                </button>
            </div>
        </div>
    );
}
