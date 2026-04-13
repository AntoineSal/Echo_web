import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRenderPayload } from '../../utils/agentRenderPayload';
import { normalizeAgentRenderPayload, normalizeRawAgentContentText } from '../../utils/agentRenderPayload';
import { isFailedAssetUrl, markFailedAssetUrl } from '../../utils/failedAssetUrls';
import { renderFormattedText } from './richText';
import './AgentContentRenderer.css';

type NodeItem = Record<string, unknown>;
type ActionItem = Record<string, unknown>;
type SnakeDirection = 'up' | 'down' | 'left' | 'right';
type SnakeStatus = 'idle' | 'running' | 'paused' | 'game_over' | 'won';
type MemoryStatus = 'idle' | 'running' | 'won';

interface SnakeCell {
    x: number;
    y: number;
}

interface SnakeSession {
    gridSize: number;
    snake: SnakeCell[];
    food: SnakeCell;
    direction: SnakeDirection;
    pendingDirection: SnakeDirection | null;
    status: SnakeStatus;
    score: number;
    speedMs: number;
    wrap: boolean;
    highScore: number;
}

interface MemoryCard {
    id: string;
    value: string;
    matched: boolean;
}

interface MemorySession {
    cards: MemoryCard[];
    flipped: number[];
    locked: boolean;
    moves: number;
    matches: number;
    status: MemoryStatus;
    bestMoves: number | null;
}

interface AgentContentRendererProps {
    content: string;
    fallbackSuffix?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeKey = (value: unknown): string => {
    const text = value == null ? '' : String(value);
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .trim();
};

const normalizeComponentId = (value: unknown): string =>
    normalizeKey(value).replace(/[^a-z0-9_]/g, '_');

const toText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value);
};

const DISPLAY_VALUE_KEYS = [
    'text',
    'label',
    'title',
    'value',
    'message',
    'name',
    'content',
    'description',
    'caption',
    'url',
    'href',
] as const;

const MAX_DISPLAY_JSON_LENGTH = 260;

const serializeDisplayValue = (value: unknown): string => {
    try {
        const serialized = JSON.stringify(value);
        if (!serialized) return '';
        if (serialized.length <= MAX_DISPLAY_JSON_LENGTH) return serialized;
        return `${serialized.slice(0, MAX_DISPLAY_JSON_LENGTH - 3)}...`;
    } catch {
        return '';
    }
};

const toDisplayText = (value: unknown, depth: number = 0): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }

    if (Array.isArray(value)) {
        const joined = value
            .map((entry) => toDisplayText(entry, depth + 1).trim())
            .filter(Boolean)
            .join(', ');
        return joined || serializeDisplayValue(value);
    }

    if (isRecord(value)) {
        if (depth < 4) {
            for (const key of DISPLAY_VALUE_KEYS) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                const candidate = toDisplayText(value[key], depth + 1).trim();
                if (candidate) return candidate;
            }
        }
        return serializeDisplayValue(value);
    }

    return String(value);
};

const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const parseMaybeJsonObject = (value: unknown): Record<string, unknown> | null => {
    if (isRecord(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
        return null;
    }
    try {
        const parsed = JSON.parse(trimmed);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (isRecord(value)) return value;
    return parseMaybeJsonObject(value);
};

const toAction = (value: unknown, depth: number = 0): ActionItem | null => {
    if (depth > 4) return null;
    const record = toRecord(value);
    if (record) {
        const nestedCandidate =
            toRecord(record.action) ||
            toRecord(record.payload) ||
            toRecord(record.data) ||
            toRecord(record.command) ||
            toRecord(record.on_submit) ||
            toRecord(record.onSubmit);

        if (nestedCandidate && !record.type && !record.kind && typeof record.action !== 'string') {
            const normalizedNested = toAction(nestedCandidate, depth + 1);
            if (normalizedNested) {
                return { ...normalizedNested, ...record };
            }
        }
        return record;
    }

    if (typeof value === 'string' && value.trim()) {
        return { type: value.trim() };
    }
    return null;
};

const normalizeNodes = (payload: AgentRenderPayload | undefined): NodeItem[] => {
    if (!payload || payload.mode !== 'structured') return [];
    if (!isRecord(payload.data)) return [];

    const fromNodes = payload.data.nodes;
    if (Array.isArray(fromNodes)) {
        return fromNodes.filter((item) => isRecord(item)) as NodeItem[];
    }

    const fromBlocks = payload.data.blocks;
    if (Array.isArray(fromBlocks)) {
        return fromBlocks.filter((item) => isRecord(item)) as NodeItem[];
    }

    return [];
};

const normalizeChildNodes = (value: unknown): NodeItem[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => isRecord(item)) as NodeItem[];
};

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));

const templateWithValues = (text: string, values: Record<string, string>): string =>
    text.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');

const resolveEchoInternalRoute = (url: string): string => {
    const normalized = url.startsWith('echo://') && !url.startsWith('echo:///')
        ? url.replace('echo://', 'echo:///')
        : url;

    if (normalized.includes('oauth-connections')) {
        return '/oauth-connections';
    }

    const withoutScheme = normalized.replace(/^echo:\/\/\/?/, '');
    if (!withoutScheme) return '/';
    return withoutScheme.startsWith('/') ? withoutScheme : `/${withoutScheme}`;
};

const normalizeExternalUrl = (value: unknown): string => {
    let raw = toDisplayText(value).trim();
    if (!raw) return '';

    raw = raw
        .replace(/^<+|>+$/g, '')
        .replace(/^['"]+|['"]+$/g, '')
        .replace(/\\\//g, '/')
        .trim();

    if (!raw) return '';
    if (raw.startsWith('//')) raw = `https:${raw}`;

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    if (!hasScheme) {
        const looksLikeDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/|$)/.test(raw);
        if (!looksLikeDomain) return '';
        raw = `https://${raw}`;
    }

    try {
        const parsed = new URL(raw);
        if (
            parsed.protocol === 'http:' &&
            (parsed.hostname.endsWith('.shopify.com') || parsed.hostname.endsWith('.myshopify.com'))
        ) {
            parsed.protocol = 'https:';
        }
        return encodeURI(parsed.toString());
    } catch {
        return encodeURI(raw);
    }
};

const resolveComponentPayloadFromNode = (node: NodeItem): NodeItem => {
    const propPayload = isRecord(node.props) ? node.props : parseMaybeJsonObject(node.props);
    if (propPayload) return propPayload;

    const dataPayload = isRecord(node.data) ? node.data : parseMaybeJsonObject(node.data);
    if (dataPayload) return dataPayload;

    return {};
};

const inferGameTypeFromPayload = (payload: NodeItem): string => {
    const kind = normalizeComponentId(
        payload.game ||
        payload.engine ||
        payload.kind ||
        payload.mode ||
        payload.type ||
        payload.genre ||
        payload.category ||
        ''
    );
    const titleHint = normalizeComponentId(payload.title || payload.label || payload.name || '');
    const combined = `${kind} ${titleHint}`;

    if (combined.includes('snake') || combined.includes('serpent')) return 'snake';
    if (combined.includes('memory') || combined.includes('memoire') || combined.includes('pairs') || combined.includes('match')) return 'memory';
    return '';
};

const canonicalComponentKey = (node: NodeItem, payload: NodeItem): string => {
    const raw = normalizeComponentId(node.component || node.name || node.block || node.kind);

    if (raw === 'chart_v1' || raw === 'chart' || raw.includes('graph') || raw.includes('chart') || raw.includes('plot')) return 'chart_v1';
    if (raw === 'kanban_v1' || raw === 'kanban' || raw.includes('kanban') || raw.includes('board') || raw.includes('tableau')) return 'kanban_v1';
    if (raw === 'timeline_v1' || raw === 'timeline' || raw.includes('timeline') || raw.includes('chrono')) return 'timeline_v1';
    if (raw === 'form_v1' || raw === 'form' || raw.includes('form') || raw.includes('formulaire')) return 'form_v1';
    if (raw === 'gmail_compose_v1' || raw.includes('gmail') || raw.includes('compose_mail') || raw.includes('email_compose')) return 'gmail_compose_v1';
    if (raw === 'shopping_cards_v1' || raw === 'shopping_cards' || raw.includes('shopping') || raw.includes('product_cards')) return 'shopping_cards_v1';
    if (raw === 'game_snake_v1' || raw.includes('snake') || raw.includes('serpent')) return 'game_snake_v1';
    if (raw === 'game_memory_v1' || raw.includes('memory') || raw.includes('memoire') || raw.includes('pairs')) return 'game_memory_v1';
    if (raw === 'game_shell_v1' || raw === 'game' || raw.includes('jeu') || raw.includes('game_shell')) return 'game_shell_v1';

    if (payload.component || payload.type) {
        return canonicalComponentKey(payload, {});
    }

    return raw;
};

const isSnakeRuntimeComponentNode = (node: NodeItem): boolean => {
    const payload = resolveComponentPayloadFromNode(node);
    const componentName = canonicalComponentKey(node, payload);
    if (componentName === 'game_snake_v1') return true;
    if (componentName !== 'game_shell_v1') return false;
    return inferGameTypeFromPayload(payload) === 'snake';
};

const isMemoryRuntimeComponentNode = (node: NodeItem): boolean => {
    const payload = resolveComponentPayloadFromNode(node);
    const componentName = canonicalComponentKey(node, payload);
    if (componentName === 'game_memory_v1') return true;
    if (componentName !== 'game_shell_v1') return false;
    return inferGameTypeFromPayload(payload) === 'memory';
};

const clampInt = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(value)));

const cellsEqual = (a: SnakeCell, b: SnakeCell): boolean => a.x === b.x && a.y === b.y;

const normalizeSnakeDirection = (value: unknown): SnakeDirection => {
    const normalized = normalizeKey(value);
    if (normalized === 'up' || normalized === 'down' || normalized === 'left' || normalized === 'right') {
        return normalized;
    }
    return 'right';
};

const isOppositeDirection = (a: SnakeDirection, b: SnakeDirection): boolean =>
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left');

const getRandomFoodCell = (gridSize: number, snake: SnakeCell[]): SnakeCell => {
    const occupied = new Set(snake.map((cell) => `${cell.x}:${cell.y}`));
    const maxAttempts = gridSize * gridSize * 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const x = Math.floor(Math.random() * gridSize);
        const y = Math.floor(Math.random() * gridSize);
        const key = `${x}:${y}`;
        if (!occupied.has(key)) return { x, y };
    }

    for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
            const key = `${x}:${y}`;
            if (!occupied.has(key)) return { x, y };
        }
    }

    return { x: 0, y: 0 };
};

const buildInitialSnake = (gridSize: number, initialLength: number): SnakeCell[] => {
    const length = clampInt(initialLength, 2, Math.max(2, gridSize - 1));
    const centerY = Math.floor(gridSize / 2);
    const headX = Math.max(length - 1, Math.floor(gridSize / 2));
    const cells: SnakeCell[] = [];

    for (let i = 0; i < length; i += 1) {
        cells.push({ x: headX - i, y: centerY });
    }

    return cells;
};

const createSnakeSession = (payload: NodeItem, highScore: number = 0): SnakeSession => {
    const gridSize = clampInt(
        toNumber(payload.grid_size ?? payload.gridSize ?? payload.board_size ?? payload.boardSize ?? payload.size) ?? 12,
        6,
        24
    );
    const speedMs = clampInt(toNumber(payload.speed_ms ?? payload.speedMs) ?? 220, 80, 600);
    const wrap = payload.wrap === true;
    const initialLength = clampInt(toNumber(payload.initial_length ?? payload.initialLength) ?? 3, 2, gridSize - 1);
    const direction = normalizeSnakeDirection(payload.initial_direction ?? payload.initialDirection);
    const snake = buildInitialSnake(gridSize, initialLength);
    const food = getRandomFoodCell(gridSize, snake);

    return {
        gridSize,
        snake,
        food,
        direction,
        pendingDirection: null,
        status: 'idle',
        score: 0,
        speedMs,
        wrap,
        highScore,
    };
};

const nextSnakeHead = (head: SnakeCell, direction: SnakeDirection): SnakeCell => {
    if (direction === 'up') return { x: head.x, y: head.y - 1 };
    if (direction === 'down') return { x: head.x, y: head.y + 1 };
    if (direction === 'left') return { x: head.x - 1, y: head.y };
    return { x: head.x + 1, y: head.y };
};

const normalizeWrappedCell = (cell: SnakeCell, gridSize: number): SnakeCell => ({
    x: ((cell.x % gridSize) + gridSize) % gridSize,
    y: ((cell.y % gridSize) + gridSize) % gridSize,
});

const advanceSnakeSession = (session: SnakeSession): SnakeSession => {
    if (session.status !== 'running' || session.snake.length === 0) return session;

    const requestedDirection = session.pendingDirection;
    const direction = requestedDirection && !isOppositeDirection(session.direction, requestedDirection)
        ? requestedDirection
        : session.direction;

    const currentHead = session.snake[0];
    const rawHead = nextSnakeHead(currentHead, direction);
    const head = session.wrap ? normalizeWrappedCell(rawHead, session.gridSize) : rawHead;

    const outOfBounds = head.x < 0 || head.y < 0 || head.x >= session.gridSize || head.y >= session.gridSize;
    if (outOfBounds && !session.wrap) {
        return {
            ...session,
            direction,
            pendingDirection: null,
            status: 'game_over',
            highScore: Math.max(session.highScore, session.score),
        };
    }

    const willEat = cellsEqual(head, session.food);
    const bodyForCollision = willEat ? session.snake : session.snake.slice(0, -1);
    const collidesWithBody = bodyForCollision.some((segment) => cellsEqual(segment, head));
    if (collidesWithBody) {
        return {
            ...session,
            direction,
            pendingDirection: null,
            status: 'game_over',
            highScore: Math.max(session.highScore, session.score),
        };
    }

    const nextSnake = willEat
        ? [head, ...session.snake]
        : [head, ...session.snake.slice(0, -1)];
    const nextScore = willEat ? session.score + 1 : session.score;
    const boardCapacity = session.gridSize * session.gridSize;
    const won = willEat && nextSnake.length >= boardCapacity;

    return {
        ...session,
        snake: nextSnake,
        food: willEat && !won ? getRandomFoodCell(session.gridSize, nextSnake) : session.food,
        direction,
        pendingDirection: null,
        score: nextScore,
        status: won ? 'won' : 'running',
        highScore: Math.max(session.highScore, nextScore),
    };
};

const shuffleValues = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const DEFAULT_MEMORY_SYMBOLS = ['🍎', '🍋', '🍒', '🍇', '🍊', '🥝', '🍉', '🍓', '🍍', '🥥', '🍑', '🫐'];

const createMemorySession = (payload: NodeItem, bestMoves: number | null = null): MemorySession => {
    const configuredItems = Array.isArray(payload.symbols)
        ? payload.symbols
        : (Array.isArray(payload.items) ? payload.items : []);
    const extracted = configuredItems
        .map((item) => {
            if (typeof item === 'string' || typeof item === 'number') return String(item);
            if (isRecord(item)) return toDisplayText(item.value || item.symbol || item.emoji || item.label || item.text);
            return '';
        })
        .filter(Boolean);

    const pairCount = clampInt(
        toNumber(payload.pairs ?? payload.pair_count ?? payload.pairCount ?? payload.count ?? payload.size) ?? 8,
        4,
        12
    );

    const base = extracted.length >= pairCount
        ? extracted.slice(0, pairCount)
        : [...extracted, ...DEFAULT_MEMORY_SYMBOLS].slice(0, pairCount);

    const deckValues = shuffleValues([...base, ...base]);
    const cards: MemoryCard[] = deckValues.map((value, index) => ({
        id: `${index}:${value}`,
        value,
        matched: false,
    }));

    return {
        cards,
        flipped: [],
        locked: false,
        moves: 0,
        matches: 0,
        status: 'idle',
        bestMoves,
    };
};

const renderRichText = (text: string, keyPrefix: string, className?: string): React.ReactNode =>
    renderFormattedText(text, keyPrefix, {
        textClassName: className,
        linkClassName: 'acr-link',
        inlineCodeClassName: 'acr-inline-code',
        codeBlockClassName: 'acr-code-block',
        headingClassName: 'acr-heading-md',
    });

function AgentContentRendererComponent({ content, fallbackSuffix = '' }: AgentContentRendererProps) {
    const [revealedByKey, setRevealedByKey] = useState<Record<string, boolean>>({});
    const [revealedTextByKey, setRevealedTextByKey] = useState<Record<string, string>>({});
    const [visibilityByNodeId, setVisibilityByNodeId] = useState<Record<string, boolean>>({});
    const [valuesByKey, setValuesByKey] = useState<Record<string, string>>({});
    const [checkByKey, setCheckByKey] = useState<Record<string, boolean>>({});
    const [failedImageByCardId, setFailedImageByCardId] = useState<Record<string, boolean>>({});
    const [, setFailedImageVersion] = useState(0);
    const [snakeSessions, setSnakeSessions] = useState<Record<string, SnakeSession>>({});
    const [memorySessions, setMemorySessions] = useState<Record<string, MemorySession>>({});
    const snakeIntervalsRef = useRef<Record<string, number | null>>({});
    const memoryFlipTimeoutsRef = useRef<Record<string, number | null>>({});

    const cleanedRawContent = normalizeRawAgentContentText(content);
    const payload = normalizeAgentRenderPayload(content, cleanedRawContent);
    const fallbackText = `${cleanedRawContent}${fallbackSuffix}`;
    const nodes = useMemo(() => normalizeNodes(payload), [payload]);

    const resolveNodeId = (node: NodeItem, fallbackKey: string): string => {
        const explicitId = toText(node.id);
        return explicitId || fallbackKey;
    };

    const isBlockedImageUrl = (url: string): boolean =>
        !!url && isFailedAssetUrl(url);

    const markImageUrlAsFailed = (url: string): void => {
        if (!url || isFailedAssetUrl(url)) return;
        markFailedAssetUrl(url);
        setFailedImageVersion((value) => value + 1);
    };

    const stopSnakeLoop = (nodeId: string): void => {
        const timer = snakeIntervalsRef.current[nodeId];
        if (timer) {
            window.clearInterval(timer);
            snakeIntervalsRef.current[nodeId] = null;
        }
    };

    const startSnakeLoop = (nodeId: string, speedMs: number): void => {
        stopSnakeLoop(nodeId);
        snakeIntervalsRef.current[nodeId] = window.setInterval(() => {
            let shouldStop = false;
            setSnakeSessions((prev) => {
                const current = prev[nodeId];
                if (!current || current.status !== 'running') return prev;
                const next = advanceSnakeSession(current);
                if (next.status !== 'running') {
                    shouldStop = true;
                }
                return {
                    ...prev,
                    [nodeId]: next,
                };
            });
            if (shouldStop) {
                stopSnakeLoop(nodeId);
            }
        }, speedMs);
    };

    const stopMemoryFlipTimer = (nodeId: string): void => {
        const timer = memoryFlipTimeoutsRef.current[nodeId];
        if (timer) {
            window.clearTimeout(timer);
            memoryFlipTimeoutsRef.current[nodeId] = null;
        }
    };

    useEffect(() => {
        const intervals = snakeIntervalsRef.current;
        const memoryTimers = memoryFlipTimeoutsRef.current;
        return () => {
            Object.keys(intervals).forEach((nodeId) => {
                const timer = intervals[nodeId];
                if (timer) {
                    window.clearInterval(timer);
                    intervals[nodeId] = null;
                }
            });
            Object.keys(memoryTimers).forEach((nodeId) => {
                const timer = memoryTimers[nodeId];
                if (timer) {
                    window.clearTimeout(timer);
                    memoryTimers[nodeId] = null;
                }
            });
        };
    }, []);

    useEffect(() => {
        const collectSnakeNodeIds = (candidateNodes: NodeItem[], parentKey: string): string[] => {
            const ids: string[] = [];

            candidateNodes.forEach((node, index) => {
                const nodeId = resolveNodeId(node, `${parentKey}-${index}`);
                const type = normalizeKey(node.type || 'text');

                if (type === 'component' && isSnakeRuntimeComponentNode(node)) {
                    ids.push(nodeId);
                }

                const nested = normalizeChildNodes(node.nodes || node.children || node.blocks);
                if (nested.length > 0) {
                    ids.push(...collectSnakeNodeIds(nested, nodeId));
                }
            });

            return ids;
        };

        const activeSnakeNodeIds = new Set(collectSnakeNodeIds(nodes, 'root'));

        Object.keys(snakeIntervalsRef.current).forEach((nodeId) => {
            if (!activeSnakeNodeIds.has(nodeId)) {
                stopSnakeLoop(nodeId);
            }
        });

        setSnakeSessions((prev) => {
            const next: Record<string, SnakeSession> = {};
            let changed = false;
            Object.entries(prev).forEach(([nodeId, session]) => {
                if (activeSnakeNodeIds.has(nodeId)) {
                    next[nodeId] = session;
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [nodes]);

    useEffect(() => {
        const collectMemoryNodeIds = (candidateNodes: NodeItem[], parentKey: string): string[] => {
            const ids: string[] = [];

            candidateNodes.forEach((node, index) => {
                const nodeId = resolveNodeId(node, `${parentKey}-${index}`);
                const type = normalizeKey(node.type || 'text');

                if (type === 'component' && isMemoryRuntimeComponentNode(node)) {
                    ids.push(nodeId);
                }

                const nested = normalizeChildNodes(node.nodes || node.children || node.blocks);
                if (nested.length > 0) {
                    ids.push(...collectMemoryNodeIds(nested, nodeId));
                }
            });

            return ids;
        };

        const activeMemoryNodeIds = new Set(collectMemoryNodeIds(nodes, 'root'));

        Object.keys(memoryFlipTimeoutsRef.current).forEach((nodeId) => {
            if (!activeMemoryNodeIds.has(nodeId)) {
                stopMemoryFlipTimer(nodeId);
            }
        });

        setMemorySessions((prev) => {
            const next: Record<string, MemorySession> = {};
            let changed = false;
            Object.entries(prev).forEach(([nodeId, session]) => {
                if (activeMemoryNodeIds.has(nodeId)) {
                    next[nodeId] = session;
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [nodes]);

    const isVisible = (node: NodeItem, nodeId: string): boolean => {
        const defaultVisible = node.hidden !== true;
        if (visibilityByNodeId[nodeId] === undefined) return defaultVisible;
        return visibilityByNodeId[nodeId];
    };

    const showInlineReveal = (key: string, text: string): void => {
        if (!text.trim()) return;
        setRevealedTextByKey((prev) => ({ ...prev, [key]: text }));
        setRevealedByKey((prev) => ({ ...prev, [key]: true }));
    };

    const executeAction = async (
        actionInput: unknown,
        sourceKey: string,
        fallbackRevealText?: string,
        templateValuesOverride?: Record<string, string>
    ): Promise<void> => {
        const action = toAction(actionInput);
        const templateValues = templateValuesOverride || valuesByKey;
        if (!action) {
            if (fallbackRevealText?.trim()) {
                setRevealedByKey((prev) => ({ ...prev, [sourceKey]: !prev[sourceKey] }));
                setRevealedTextByKey((prev) => ({ ...prev, [sourceKey]: fallbackRevealText }));
            }
            return;
        }

        const actionType = normalizeKey(toDisplayText(action.type || action.action || action.kind || action.command));
        const actionText = templateWithValues(
            toDisplayText(
                action.text ??
                action.reveal_text ??
                action.revealText ??
                action.value ??
                action.message ??
                action.result
            ),
            templateValues
        );
        const actionTarget = templateWithValues(
            toDisplayText(action.target || action.node_id || action.nodeId || action.id),
            templateValues
        ).trim();
        const actionUrl = templateWithValues(toDisplayText(action.url || action.href), templateValues).trim();
        const actionKey = templateWithValues(
            toDisplayText(action.key || action.name || action.field || action.value_key),
            templateValues
        ).trim();

        try {
            switch (actionType) {
                case 'reveal': {
                    if (actionTarget) {
                        setVisibilityByNodeId((prev) => ({ ...prev, [actionTarget]: true }));
                        break;
                    }
                    if (actionText.trim()) {
                        showInlineReveal(sourceKey, actionText);
                        break;
                    }
                    if (fallbackRevealText?.trim()) {
                        setRevealedByKey((prev) => ({ ...prev, [sourceKey]: !prev[sourceKey] }));
                        setRevealedTextByKey((prev) => ({ ...prev, [sourceKey]: fallbackRevealText }));
                    }
                    break;
                }

                case 'toggle_reveal': {
                    setRevealedByKey((prev) => ({ ...prev, [sourceKey]: !prev[sourceKey] }));
                    if (actionText.trim()) {
                        setRevealedTextByKey((prev) => ({ ...prev, [sourceKey]: actionText }));
                    } else if (fallbackRevealText?.trim()) {
                        setRevealedTextByKey((prev) => ({ ...prev, [sourceKey]: fallbackRevealText }));
                    }
                    break;
                }

                case 'show':
                case 'show_node': {
                    if (!actionTarget) break;
                    setVisibilityByNodeId((prev) => ({ ...prev, [actionTarget]: true }));
                    break;
                }

                case 'hide':
                case 'hide_node': {
                    if (!actionTarget) break;
                    setVisibilityByNodeId((prev) => ({ ...prev, [actionTarget]: false }));
                    break;
                }

                case 'toggle':
                case 'toggle_node': {
                    if (!actionTarget) break;
                    setVisibilityByNodeId((prev) => ({ ...prev, [actionTarget]: !(prev[actionTarget] ?? true) }));
                    break;
                }

                case 'open':
                case 'open_link':
                case 'open_url': {
                    if (!actionUrl) break;
                    const deepLinkNormalizedActionUrl =
                        actionUrl.startsWith('echo://') && !actionUrl.startsWith('echo:///')
                            ? actionUrl.replace('echo://', 'echo:///')
                            : actionUrl;
                    const isInternalEchoLink = deepLinkNormalizedActionUrl.startsWith('echo://');

                    if (isInternalEchoLink) {
                        const routePath = resolveEchoInternalRoute(deepLinkNormalizedActionUrl);
                        window.open(routePath, '_blank', 'noopener,noreferrer');
                        break;
                    }

                    const normalizedActionUrl = normalizeExternalUrl(deepLinkNormalizedActionUrl);
                    if (!normalizedActionUrl) break;

                    window.open(normalizedActionUrl, '_blank', 'noopener,noreferrer');
                    break;
                }

                case 'copy':
                case 'copy_text': {
                    const textToCopy = actionText || fallbackRevealText || '';
                    if (!textToCopy) break;
                    await navigator.clipboard.writeText(textToCopy);
                    break;
                }

                case 'set':
                case 'set_value': {
                    if (!actionKey) break;
                    const nextValue = actionText || templateWithValues(toDisplayText(action.value), templateValues);
                    setValuesByKey((prev) => ({ ...prev, [actionKey]: nextValue }));
                    break;
                }

                case 'notify':
                case 'alert': {
                    const title = toDisplayText(action.title || 'Information');
                    const message = actionText || fallbackRevealText || '';
                    window.alert([title, message].filter(Boolean).join('\n\n'));
                    break;
                }

                default: {
                    if (fallbackRevealText?.trim()) {
                        setRevealedByKey((prev) => ({ ...prev, [sourceKey]: !prev[sourceKey] }));
                        setRevealedTextByKey((prev) => ({ ...prev, [sourceKey]: fallbackRevealText }));
                    }
                    break;
                }
            }
        } catch (error) {
            console.warn('[AgentContentRenderer] Action execution error:', error);
        }
    };

    const renderList = (
        items: unknown[],
        key: string,
        ordered: boolean = false,
        checklist: boolean = false
    ): React.ReactNode => {
        if (!items.length) return null;

        if (checklist) {
            return (
                <div key={key} className="acr-checklist">
                    {items.map((rawItem, index) => {
                        const itemKey = `${key}-item-${index}`;
                        const parsedItem = isRecord(rawItem) ? rawItem : null;
                        const label = templateWithValues(
                            toDisplayText(parsedItem?.label || parsedItem?.text || parsedItem?.value || rawItem),
                            valuesByKey
                        );
                        const checkedDefault = parsedItem?.checked === true;
                        const checked = checkByKey[itemKey] ?? checkedDefault;
                        return (
                            <button
                                type="button"
                                key={itemKey}
                                className={`acr-checklist__item${checked ? ' acr-checklist__item--checked' : ''}`}
                                onClick={() => setCheckByKey((prev) => ({ ...prev, [itemKey]: !checked }))}
                            >
                                <span className="acr-checklist__box">{checked ? '☑' : '☐'}</span>
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            );
        }

        const ListTag = ordered ? 'ol' : 'ul';
        return (
            <ListTag key={key} className={`acr-list${ordered ? ' acr-list--ordered' : ''}`}>
                {items.map((rawItem, index) => {
                    const parsedItem = isRecord(rawItem) ? rawItem : null;
                    const label = templateWithValues(
                        toDisplayText(parsedItem?.label || parsedItem?.text || parsedItem?.value || rawItem),
                        valuesByKey
                    );
                    return <li key={`${key}-${index}`}>{renderRichText(label, `${key}-${index}`)}</li>;
                })}
            </ListTag>
        );
    };

    const renderTable = (node: NodeItem, key: string): React.ReactNode => {
        const rawHeaders = Array.isArray(node.headers) ? node.headers : [];
        const headers = rawHeaders.map((header) => templateWithValues(toDisplayText(header), valuesByKey)).filter(Boolean);
        const rawRows = Array.isArray(node.rows) ? node.rows : [];

        if (!headers.length || !rawRows.length) return null;

        return (
            <div key={key} className="acr-table-wrap">
                <table className="acr-table">
                    <thead>
                        <tr>
                            {headers.map((header, index) => (
                                <th key={`${key}-h-${index}`}>{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rawRows.map((row, rowIndex) => {
                            const cells = Array.isArray(row) ? row : [];
                            return (
                                <tr key={`${key}-r-${rowIndex}`}>
                                    {headers.map((_, cellIndex) => (
                                        <td key={`${key}-r-${rowIndex}-c-${cellIndex}`}>
                                            {renderRichText(templateWithValues(toDisplayText(cells[cellIndex]), valuesByKey), `${key}-${rowIndex}-${cellIndex}`)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderChartComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.label || 'Chart'), valuesByKey);
        const toLooseNumber = (value: unknown): number | null => {
            const direct = toNumber(value);
            if (direct !== null) return direct;
            if (typeof value !== 'string') return null;

            const normalized = value.replace(/\s+/g, '').replace(/,/g, '');
            const match = normalized.match(/-?\d+(\.\d+)?/);
            if (!match) return null;
            const parsed = Number.parseFloat(match[0]);
            return Number.isFinite(parsed) ? parsed : null;
        };

        const normalizedItems: { label: string; value: number; color: string }[] = [];
        const pushChartItem = (labelInput: unknown, valueInput: unknown, colorInput: unknown = ''): void => {
            const numeric = toLooseNumber(valueInput);
            if (numeric === null) return;
            const label = templateWithValues(toDisplayText(labelInput || `Series ${normalizedItems.length + 1}`), valuesByKey);
            normalizedItems.push({
                label,
                value: Math.max(0, numeric),
                color: toDisplayText(colorInput || ''),
            });
        };

        const readRows = (rows: unknown[]): void => {
            rows.forEach((item, index) => {
                if (isRecord(item)) {
                    pushChartItem(
                        item.label || item.name || item.key || item.x || `Series ${index + 1}`,
                        item.value ?? item.y ?? item.amount ?? item.count,
                        item.color || item.backgroundColor || item.borderColor
                    );
                    return;
                }
                pushChartItem(`Series ${index + 1}`, item);
            });
        };

        const readDatasets = (labelsRaw: unknown, datasetsRaw: unknown): void => {
            if (!Array.isArray(datasetsRaw)) return;
            const labels = Array.isArray(labelsRaw) ? labelsRaw : [];
            const hasMultipleDatasets = datasetsRaw.length > 1;

            datasetsRaw.forEach((datasetRaw, datasetIndex) => {
                if (!isRecord(datasetRaw)) return;

                const datasetName = toDisplayText(datasetRaw.label || datasetRaw.name || `Series ${datasetIndex + 1}`);
                const points = Array.isArray(datasetRaw.data)
                    ? datasetRaw.data
                    : (Array.isArray(datasetRaw.values) ? datasetRaw.values : []);
                const colors = Array.isArray(datasetRaw.backgroundColor)
                    ? datasetRaw.backgroundColor
                    : [];

                points.forEach((point, pointIndex) => {
                    if (isRecord(point)) {
                        const pointLabel = toDisplayText(point.label || point.name || point.x || labels[pointIndex] || `Point ${pointIndex + 1}`);
                        const value = point.value ?? point.y ?? point.amount ?? point.count;
                        const label = hasMultipleDatasets ? `${datasetName} · ${pointLabel}` : pointLabel;
                        pushChartItem(label, value, point.color || colors[pointIndex] || datasetRaw.color || datasetRaw.backgroundColor);
                        return;
                    }

                    const pointLabel = toDisplayText(labels[pointIndex] || `Point ${pointIndex + 1}`);
                    const label = hasMultipleDatasets ? `${datasetName} · ${pointLabel}` : pointLabel;
                    pushChartItem(label, point, colors[pointIndex] || datasetRaw.color || datasetRaw.backgroundColor || datasetRaw.borderColor);
                });
            });
        };

        const rootRows =
            (Array.isArray(payloadNode.series) ? payloadNode.series : null) ||
            (Array.isArray(payloadNode.items) ? payloadNode.items : null) ||
            (Array.isArray(payloadNode.data) ? payloadNode.data : null);
        if (rootRows) {
            readRows(rootRows);
        }

        const rootLabels = Array.isArray(payloadNode.labels) ? payloadNode.labels : null;
        const rootValues = Array.isArray(payloadNode.values) ? payloadNode.values : null;
        if (normalizedItems.length === 0 && rootLabels && rootValues) {
            rootLabels.forEach((label, index) => {
                pushChartItem(label, rootValues[index]);
            });
        }

        if (normalizedItems.length === 0) {
            const mapRecord = isRecord(payloadNode.values_by_label)
                ? payloadNode.values_by_label
                : (isRecord(payloadNode.value_map) ? payloadNode.value_map : null);
            if (mapRecord) {
                Object.entries(mapRecord).forEach(([label, value]) => {
                    pushChartItem(label, value);
                });
            }
        }

        if (normalizedItems.length === 0) {
            readDatasets(payloadNode.labels, payloadNode.datasets);
        }

        const nestedDataRecord = isRecord(payloadNode.data) ? payloadNode.data : null;
        if (normalizedItems.length === 0 && nestedDataRecord) {
            const nestedRows =
                (Array.isArray(nestedDataRecord.series) ? nestedDataRecord.series : null) ||
                (Array.isArray(nestedDataRecord.items) ? nestedDataRecord.items : null) ||
                (Array.isArray(nestedDataRecord.data) ? nestedDataRecord.data : null);
            if (nestedRows) {
                readRows(nestedRows);
            }
            if (normalizedItems.length === 0) {
                readDatasets(nestedDataRecord.labels, nestedDataRecord.datasets);
            }
        }

        const chartRecord = isRecord(payloadNode.chart) ? payloadNode.chart : null;
        const configRecord = isRecord(payloadNode.config) ? payloadNode.config : null;
        const chartDataRecord = chartRecord && isRecord(chartRecord.data) ? chartRecord.data : null;
        const configDataRecord = configRecord && isRecord(configRecord.data) ? configRecord.data : null;

        if (normalizedItems.length === 0 && chartDataRecord) {
            const nestedRows = Array.isArray(chartDataRecord.series)
                ? chartDataRecord.series
                : (Array.isArray(chartDataRecord.items) ? chartDataRecord.items : null);
            if (nestedRows) {
                readRows(nestedRows);
            }
            if (normalizedItems.length === 0) {
                readDatasets(chartDataRecord.labels, chartDataRecord.datasets);
            }
        }

        if (normalizedItems.length === 0 && configDataRecord) {
            const nestedRows = Array.isArray(configDataRecord.series)
                ? configDataRecord.series
                : (Array.isArray(configDataRecord.items) ? configDataRecord.items : null);
            if (nestedRows) {
                readRows(nestedRows);
            }
            if (normalizedItems.length === 0) {
                readDatasets(configDataRecord.labels, configDataRecord.datasets);
            }
        }

        if (!normalizedItems.length) {
            return (
                <div key={nodeId} className="acr-component-card">
                    <div className="acr-component-title">{title}</div>
                    <div className="acr-empty-text">
                        {templateWithValues(toDisplayText(payloadNode.empty_text || payloadNode.emptyText || 'No chart data provided.'), valuesByKey)}
                    </div>
                </div>
            );
        }

        const values = normalizedItems.map((item) => item.value);
        const maxValue = Math.max(...values, 1);

        return (
            <div key={nodeId} className="acr-component-card">
                <div className="acr-component-title">{title}</div>
                <div className="acr-chart-stack">
                    {normalizedItems.map((item, index) => {
                        const label = item.label || `Series ${index + 1}`;
                        const value = item.value;
                        const widthRatio = Math.max(4, Math.round((value / maxValue) * 100));
                        const color = item.color || '#0A9168';
                        return (
                            <div key={`${nodeId}-chart-${index}`} className="acr-chart-row">
                                <div className="acr-chart-top-row">
                                    <span className="acr-chart-label">{label}</span>
                                    <span className="acr-chart-value">{value}</span>
                                </div>
                                <div className="acr-chart-track">
                                    <div className="acr-chart-fill" style={{ width: `${widthRatio}%`, backgroundColor: color }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderKanbanComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.label || 'Board'), valuesByKey);
        const columnsRaw = Array.isArray(payloadNode.columns) ? payloadNode.columns : [];
        const columns = columnsRaw.map((column) => (isRecord(column) ? column : null)).filter(Boolean) as NodeItem[];
        if (!columns.length) return null;

        return (
            <div key={nodeId} className="acr-component-card">
                <div className="acr-component-title">{title}</div>
                <div className="acr-kanban-row">
                    {columns.map((column, colIndex) => {
                        const columnTitle = templateWithValues(toDisplayText(column.title || column.label || `Column ${colIndex + 1}`), valuesByKey);
                        const cardsRaw = Array.isArray(column.cards) ? column.cards : (Array.isArray(column.items) ? column.items : []);
                        const cards = cardsRaw.map((card) => (isRecord(card) ? card : ({ title: toDisplayText(card) }))).filter(Boolean) as NodeItem[];
                        return (
                            <div key={`${nodeId}-col-${colIndex}`} className="acr-kanban-column">
                                <div className="acr-kanban-column-title">{columnTitle}</div>
                                <div className="acr-kanban-cards">
                                    {cards.map((card, cardIndex) => {
                                        const cardTitle = templateWithValues(toDisplayText(card.title || card.text || card.name || `Card ${cardIndex + 1}`), valuesByKey);
                                        const cardMeta = templateWithValues(toDisplayText(card.meta || card.subtitle || card.status || ''), valuesByKey);
                                        return (
                                            <div key={`${nodeId}-card-${colIndex}-${cardIndex}`} className="acr-kanban-card">
                                                <div className="acr-kanban-card-title">{cardTitle}</div>
                                                {!!cardMeta && <div className="acr-kanban-card-meta">{cardMeta}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderTimelineComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.label || 'Timeline'), valuesByKey);
        const itemsRaw = Array.isArray(payloadNode.items) ? payloadNode.items : [];
        const items = itemsRaw.map((item) => (isRecord(item) ? item : null)).filter(Boolean) as NodeItem[];
        if (!items.length) return null;

        return (
            <div key={nodeId} className="acr-component-card">
                <div className="acr-component-title">{title}</div>
                <div className="acr-timeline-list">
                    {items.map((item, index) => {
                        const itemTitle = templateWithValues(toDisplayText(item.title || item.text || `Step ${index + 1}`), valuesByKey);
                        const itemTime = templateWithValues(toDisplayText(item.time || item.date || item.when || ''), valuesByKey);
                        const itemDescription = templateWithValues(toDisplayText(item.description || item.detail || ''), valuesByKey);
                        const isLast = index === items.length - 1;
                        return (
                            <div key={`${nodeId}-timeline-${index}`} className="acr-timeline-row">
                                <div className="acr-timeline-rail">
                                    <div className="acr-timeline-dot" />
                                    {!isLast && <div className="acr-timeline-line" />}
                                </div>
                                <div className="acr-timeline-content">
                                    <div className="acr-timeline-header">
                                        <div className="acr-timeline-title">{itemTitle}</div>
                                        {!!itemTime && <div className="acr-timeline-time">{itemTime}</div>}
                                    </div>
                                    {!!itemDescription && <div className="acr-timeline-description">{renderRichText(itemDescription, `${nodeId}-desc-${index}`)}</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderFormComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.label || 'Form'), valuesByKey);
        const fieldsRaw = Array.isArray(payloadNode.fields) ? payloadNode.fields : [];
        const fields = fieldsRaw.map((item) => (isRecord(item) ? item : null)).filter(Boolean) as NodeItem[];
        if (!fields.length) return null;

        const submitLabel = templateWithValues(toDisplayText(payloadNode.submit_label || payloadNode.submitLabel || 'Submit'), valuesByKey);
        const submitKey = `${nodeId}:submit`;
        const submitRevealText = revealedTextByKey[submitKey] || '';
        const submitIsRevealed = revealedByKey[submitKey] === true;

        return (
            <div key={nodeId} className="acr-component-card">
                <div className="acr-component-title">{title}</div>
                <div className="acr-form-stack">
                    {fields.map((field, index) => {
                        const fieldId = templateWithValues(
                            toDisplayText(field.id || `field_${index + 1}`),
                            valuesByKey
                        ).trim() || `field_${index + 1}`;
                        const valueKey = `${nodeId}:${fieldId}`;
                        const fieldType = normalizeKey(field.type || 'text');
                        const fieldLabel = templateWithValues(toDisplayText(field.label || field.name || fieldId), valuesByKey);
                        const fieldValue = valuesByKey[valueKey] ?? templateWithValues(toDisplayText(field.value || ''), valuesByKey);
                        const placeholder = templateWithValues(toDisplayText(field.placeholder || ''), valuesByKey);

                        if (fieldType === 'select' && Array.isArray(field.options)) {
                            return (
                                <div key={`${nodeId}-field-${index}`} className="acr-form-field">
                                    <label className="acr-form-label">{fieldLabel}</label>
                                    <div className="acr-form-options-row">
                                        {field.options.map((option, optionIndex) => {
                                            const optionRecord = isRecord(option) ? option : null;
                                            const optionValue = templateWithValues(
                                                toDisplayText(optionRecord?.value || optionRecord?.id || option),
                                                valuesByKey
                                            );
                                            const optionText = templateWithValues(
                                                toDisplayText(optionRecord?.label || optionRecord?.text || optionValue),
                                                valuesByKey
                                            );
                                            const isSelected = fieldValue === optionValue;
                                            return (
                                                <button
                                                    type="button"
                                                    key={`${nodeId}-field-${index}-option-${optionIndex}`}
                                                    className={`acr-form-option${isSelected ? ' acr-form-option--active' : ''}`}
                                                    onClick={() => {
                                                        setValuesByKey((prev) => ({ ...prev, [valueKey]: optionValue }));
                                                    }}
                                                >
                                                    {optionText}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        if (fieldType === 'checkbox') {
                            const normalizedValue = fieldValue.trim().toLowerCase();
                            const checked = normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes' || normalizedValue === 'on';
                            return (
                                <button
                                    type="button"
                                    key={`${nodeId}-field-${index}`}
                                    className="acr-form-checkbox-row"
                                    onClick={() => {
                                        setValuesByKey((prev) => ({ ...prev, [valueKey]: checked ? 'false' : 'true' }));
                                    }}
                                >
                                    <span className={`acr-form-checkbox-icon${checked ? ' acr-form-checkbox-icon--active' : ''}`}>{checked ? '☑' : '☐'}</span>
                                    <span className="acr-form-label">{fieldLabel}</span>
                                </button>
                            );
                        }

                        const sharedProps = {
                            className: 'acr-form-input',
                            value: fieldValue,
                            placeholder,
                            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                                setValuesByKey((prev) => ({ ...prev, [valueKey]: event.target.value }));
                            },
                        };

                        return (
                            <div key={`${nodeId}-field-${index}`} className="acr-form-field">
                                <label className="acr-form-label">{fieldLabel}</label>
                                {fieldType === 'textarea' ? (
                                    <textarea {...sharedProps} rows={4} />
                                ) : (
                                    <input {...sharedProps} type={fieldType === 'number' ? 'number' : 'text'} />
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    className="acr-button"
                    onClick={() => {
                        const result: Record<string, string> = {};
                        const missingLabels: string[] = [];
                        const summaryLines: string[] = [];

                        fields.forEach((field, fieldIndex) => {
                            const fieldId = templateWithValues(
                                toDisplayText(field.id || `field_${fieldIndex + 1}`),
                                valuesByKey
                            ).trim() || `field_${fieldIndex + 1}`;
                            const label = templateWithValues(toDisplayText(field.label || field.name || fieldId), valuesByKey);
                            const value = (valuesByKey[`${nodeId}:${fieldId}`] ?? '').trim();
                            if (field.required === true && !value) {
                                missingLabels.push(label);
                            }
                            result[fieldId] = value;
                            if (value) {
                                summaryLines.push(`${label}: ${value}`);
                            }
                        });

                        if (missingLabels.length > 0) {
                            window.alert(`Champs requis: ${missingLabels.join(', ')}`);
                            return;
                        }

                        const summary = summaryLines.join('\n');

                        if (payloadNode.on_submit) {
                            void executeAction(payloadNode.on_submit, submitKey, summary || 'Form submitted');
                            return;
                        }

                        showInlineReveal(submitKey, summary || 'Form submitted');
                    }}
                >
                    {submitLabel}
                </button>
                {submitIsRevealed && !!submitRevealText && (
                    <div className="acr-form-submit-result">
                        {renderRichText(submitRevealText, `${nodeId}-submit-result`)}
                    </div>
                )}
            </div>
        );
    };

    const renderGmailComposeComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(
            toDisplayText(payloadNode.title || payloadNode.label || 'Brouillon Gmail'),
            valuesByKey
        );
        const subtitle = templateWithValues(
            toDisplayText(payloadNode.subtitle || 'Verifiez le mail avant envoi.'),
            valuesByKey
        );
        const helperText = templateWithValues(
            toDisplayText(payloadNode.helper_text || payloadNode.helperText || ''),
            valuesByKey
        );
        const submitLabel = templateWithValues(
            toDisplayText(payloadNode.submit_label || payloadNode.submitLabel || 'Envoyer'),
            valuesByKey
        );
        const successText = templateWithValues(
            toDisplayText(payloadNode.success_text || payloadNode.successText || 'Confirmation locale enregistree.'),
            valuesByKey
        );
        const submitKey = `${nodeId}:gmail_submit`;
        const submitRevealText = revealedTextByKey[submitKey] || '';
        const submitIsRevealed = revealedByKey[submitKey] === true;

        const toKey = `${nodeId}:to`;
        const subjectKey = `${nodeId}:subject`;
        const bodyKey = `${nodeId}:body`;

        const toValue = valuesByKey[toKey] ?? templateWithValues(toDisplayText(payloadNode.to || ''), valuesByKey);
        const subjectValue = valuesByKey[subjectKey] ?? templateWithValues(toDisplayText(payloadNode.subject || ''), valuesByKey);
        const bodyValue = valuesByKey[bodyKey] ?? templateWithValues(toDisplayText(payloadNode.body || ''), valuesByKey);
        const replyContext = templateWithValues(
            toDisplayText(payloadNode.reply_context || payloadNode.replyContext || payloadNode.reply_to_message_id || payloadNode.replyToMessageId || ''),
            valuesByKey
        );

        return (
            <div key={nodeId} className="acr-component-card acr-gmail-compose-card">
                <div className="acr-component-title">{title}</div>
                {!!subtitle && <div className="acr-gmail-compose-subtitle">{subtitle}</div>}
                {!!helperText && <div className="acr-gmail-compose-helper">{helperText}</div>}

                {!!replyContext && (
                    <div className="acr-gmail-compose-meta-pill">
                        {replyContext}
                    </div>
                )}

                <div className="acr-form-field">
                    <label className="acr-form-label">Destinataire</label>
                    <input
                        className="acr-form-input"
                        value={toValue}
                        onChange={(event) => setValuesByKey((prev) => ({ ...prev, [toKey]: event.target.value }))}
                        placeholder={templateWithValues(toDisplayText(payloadNode.to_placeholder || payloadNode.toPlaceholder || 'alice@example.com'), valuesByKey)}
                    />
                </div>

                <div className="acr-form-field">
                    <label className="acr-form-label">Objet</label>
                    <input
                        className="acr-form-input"
                        value={subjectValue}
                        onChange={(event) => setValuesByKey((prev) => ({ ...prev, [subjectKey]: event.target.value }))}
                        placeholder={templateWithValues(toDisplayText(payloadNode.subject_placeholder || payloadNode.subjectPlaceholder || "Objet de l'email"), valuesByKey)}
                    />
                </div>

                <div className="acr-form-field">
                    <label className="acr-form-label">Message</label>
                    <textarea
                        className="acr-form-input acr-gmail-compose-body-input"
                        value={bodyValue}
                        onChange={(event) => setValuesByKey((prev) => ({ ...prev, [bodyKey]: event.target.value }))}
                        placeholder={templateWithValues(toDisplayText(payloadNode.body_placeholder || payloadNode.bodyPlaceholder || "Ecrivez votre email"), valuesByKey)}
                        rows={7}
                    />
                </div>

                <button
                    type="button"
                    className="acr-button"
                    onClick={() => {
                        if (!toValue.trim()) {
                            window.alert('Destinataire requis');
                            return;
                        }

                        const summary = [
                            `To: ${toValue.trim()}`,
                            `Subject: ${subjectValue.trim() || '(sans objet)'}`,
                            bodyValue.trim() ? `Body:\n${bodyValue.trim()}` : '',
                        ].filter(Boolean).join('\n\n');

                        const gmailTemplateValues = {
                            ...valuesByKey,
                            to: toValue,
                            subject: subjectValue,
                            body: bodyValue,
                            recipient: toValue,
                            destinataire: toValue,
                            objet: subjectValue,
                            message: bodyValue,
                        };

                        if (payloadNode.on_submit) {
                            void executeAction(payloadNode.on_submit, submitKey, summary || successText, gmailTemplateValues);
                            return;
                        }

                        showInlineReveal(submitKey, successText || summary || 'Brouillon pret.');
                    }}
                >
                    {submitLabel}
                </button>

                {submitIsRevealed && !!submitRevealText && (
                    <div className="acr-form-submit-result acr-gmail-compose-result">
                        {renderRichText(submitRevealText, `${nodeId}-gmail-result`)}
                    </div>
                )}
            </div>
        );
    };

    const renderGameShellComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.game || 'Game'), valuesByKey);
        const subtitle = templateWithValues(toDisplayText(payloadNode.subtitle || payloadNode.status || ''), valuesByKey);
        const controls = Array.isArray(payloadNode.controls) ? payloadNode.controls.map((value) => templateWithValues(toDisplayText(value), valuesByKey)).filter(Boolean) : [];
        const stats = isRecord(payloadNode.stats) ? payloadNode.stats : null;
        const actionsRaw = Array.isArray(payloadNode.actions) ? payloadNode.actions : [];
        const actions = actionsRaw.map((item) => (isRecord(item) ? item : null)).filter(Boolean) as NodeItem[];

        return (
            <div key={nodeId} className="acr-component-card acr-game-shell-card">
                <div className="acr-component-title acr-game-shell-title">{title}</div>
                {!!subtitle && <div className="acr-game-shell-subtitle">{subtitle}</div>}

                {stats && (
                    <div className="acr-game-stats-grid">
                        {Object.entries(stats).map(([label, value]) => (
                            <div key={`${nodeId}-stat-${label}`} className="acr-game-stat-item">
                                <div className="acr-game-stat-label">{templateWithValues(label, valuesByKey)}</div>
                                <div className="acr-game-stat-value">{templateWithValues(toDisplayText(value), valuesByKey)}</div>
                            </div>
                        ))}
                    </div>
                )}

                {!!controls.length && (
                    <div className="acr-game-controls-row">
                        {controls.map((control, index) => (
                            <div key={`${nodeId}-control-${index}`} className="acr-game-control-chip">
                                {control}
                            </div>
                        ))}
                    </div>
                )}

                {!!actions.length && (
                    <div className="acr-game-action-row">
                        {actions.map((action, index) => (
                            <button
                                type="button"
                                key={`${nodeId}-action-${index}`}
                                className="acr-game-action-button"
                                onClick={() => { void executeAction(action.action || action, `${nodeId}-action-${index}`, templateWithValues(toDisplayText(action.reveal_text), valuesByKey)); }}
                            >
                                {templateWithValues(toDisplayText(action.text || action.label || `Action ${index + 1}`), valuesByKey)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const setSnakeDirection = (nodeId: string, direction: SnakeDirection): void => {
        setSnakeSessions((prev) => {
            const current = prev[nodeId];
            if (!current || (current.status !== 'running' && current.status !== 'paused')) return prev;
            if (isOppositeDirection(current.direction, direction)) return prev;
            return {
                ...prev,
                [nodeId]: {
                    ...current,
                    pendingDirection: direction,
                },
            };
        });
    };

    const startOrRestartSnake = (nodeId: string, payloadNode: NodeItem, forceRestart: boolean = false): void => {
        let speedMs = 220;
        setSnakeSessions((prev) => {
            const existing = prev[nodeId];
            const nextSession = forceRestart || !existing
                ? createSnakeSession(payloadNode, existing?.highScore ?? 0)
                : existing;
            speedMs = nextSession.speedMs;
            return {
                ...prev,
                [nodeId]: {
                    ...nextSession,
                    status: 'running',
                    pendingDirection: null,
                },
            };
        });
        startSnakeLoop(nodeId, speedMs);
    };

    const pauseSnake = (nodeId: string): void => {
        stopSnakeLoop(nodeId);
        setSnakeSessions((prev) => {
            const current = prev[nodeId];
            if (!current || current.status !== 'running') return prev;
            return {
                ...prev,
                [nodeId]: {
                    ...current,
                    status: 'paused',
                },
            };
        });
    };

    const resumeSnake = (nodeId: string): void => {
        let speedMs = 220;
        setSnakeSessions((prev) => {
            const current = prev[nodeId];
            if (!current || current.status !== 'paused') return prev;
            speedMs = current.speedMs;
            return {
                ...prev,
                [nodeId]: {
                    ...current,
                    status: 'running',
                },
            };
        });
        startSnakeLoop(nodeId, speedMs);
    };

    const renderGameSnakeComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const baseSession = snakeSessions[nodeId] || createSnakeSession(payloadNode);
        const title = templateWithValues(toDisplayText(payloadNode.title || payloadNode.game || 'Snake'), valuesByKey);
        const outcomeLabel =
            baseSession.status === 'game_over' ? 'Game over' :
                baseSession.status === 'won' ? 'You win' :
                    '';

        const snakeCells = new Set(baseSession.snake.map((cell) => `${cell.x}:${cell.y}`));
        const head = baseSession.snake[0];
        const foodKey = `${baseSession.food.x}:${baseSession.food.y}`;

        return (
            <div key={nodeId} className="acr-component-card acr-game-shell-card">
                <div className="acr-snake-header-row">
                    <div className="acr-component-title acr-game-shell-title">{title}</div>
                    <div className="acr-snake-stats-row">
                        <div className="acr-snake-stat-pill">
                            <span className="acr-snake-stat-label">Score</span>
                            <span className="acr-snake-stat-value">{baseSession.score}</span>
                        </div>
                        <div className="acr-snake-stat-pill">
                            <span className="acr-snake-stat-label">Best</span>
                            <span className="acr-snake-stat-value">{baseSession.highScore}</span>
                        </div>
                    </div>
                </div>

                <div className="acr-snake-board" style={{ gridTemplateColumns: `repeat(${baseSession.gridSize}, 1fr)` }}>
                    {Array.from({ length: baseSession.gridSize * baseSession.gridSize }).map((_, index) => {
                        const colIndex = index % baseSession.gridSize;
                        const rowIndex = Math.floor(index / baseSession.gridSize);
                        const cellKey = `${colIndex}:${rowIndex}`;
                        const isHead = head ? head.x === colIndex && head.y === rowIndex : false;
                        const isSnake = snakeCells.has(cellKey);
                        const isFood = foodKey === cellKey;
                        return (
                            <div
                                key={`${nodeId}-cell-${colIndex}-${rowIndex}`}
                                className={[
                                    'acr-snake-cell',
                                    isSnake ? 'acr-snake-cell--body' : '',
                                    isHead ? 'acr-snake-cell--head' : '',
                                    isFood ? 'acr-snake-cell--food' : '',
                                ].filter(Boolean).join(' ')}
                            />
                        );
                    })}
                </div>
                {!!outcomeLabel && (
                    <div className="acr-snake-outcome-text">{outcomeLabel}</div>
                )}

                <div className="acr-snake-controls-panel">
                    <div className="acr-snake-dpad-top">
                        <button type="button" className="acr-snake-dpad-button" onClick={() => setSnakeDirection(nodeId, 'up')}>↑</button>
                    </div>
                    <div className="acr-snake-dpad-row">
                        <button type="button" className="acr-snake-dpad-button" onClick={() => setSnakeDirection(nodeId, 'left')}>←</button>
                        <button type="button" className="acr-snake-dpad-button" onClick={() => setSnakeDirection(nodeId, 'down')}>↓</button>
                        <button type="button" className="acr-snake-dpad-button" onClick={() => setSnakeDirection(nodeId, 'right')}>→</button>
                    </div>
                </div>

                <div className="acr-game-action-row">
                    {baseSession.status !== 'running' && (
                        <button type="button" className="acr-game-action-button" onClick={() => startOrRestartSnake(nodeId, payloadNode, false)}>
                            {baseSession.status === 'paused' ? 'Resume' : (baseSession.status === 'idle' ? 'Start' : 'Play again')}
                        </button>
                    )}
                    {baseSession.status === 'running' && (
                        <button type="button" className="acr-game-action-button" onClick={() => pauseSnake(nodeId)}>
                            Pause
                        </button>
                    )}
                    <button type="button" className="acr-game-action-button acr-game-action-button--ghost" onClick={() => startOrRestartSnake(nodeId, payloadNode, true)}>
                        Restart
                    </button>
                    {baseSession.status === 'paused' && (
                        <button type="button" className="acr-game-action-button" onClick={() => resumeSnake(nodeId)}>
                            Continue
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const startOrRestartMemory = (nodeId: string, payloadNode: NodeItem, forceRestart: boolean = false): void => {
        stopMemoryFlipTimer(nodeId);
        setMemorySessions((prev) => {
            const existing = prev[nodeId];
            if (!forceRestart && existing) {
                return {
                    ...prev,
                    [nodeId]: {
                        ...existing,
                        status: existing.status === 'won' ? 'won' : 'running',
                    },
                };
            }

            return {
                ...prev,
                [nodeId]: {
                    ...createMemorySession(payloadNode, existing?.bestMoves ?? null),
                    status: 'running',
                },
            };
        });
    };

    const flipMemoryCard = (nodeId: string, payloadNode: NodeItem, index: number): void => {
        setMemorySessions((prev) => {
            const existing = prev[nodeId] || createMemorySession(payloadNode);
            if (existing.locked || existing.status === 'won') return prev;

            const card = existing.cards[index];
            if (!card || card.matched || existing.flipped.includes(index)) return prev;

            const nextFlipped = [...existing.flipped, index];
            const nextStatus: MemoryStatus = existing.status === 'idle' ? 'running' : existing.status;

            if (nextFlipped.length < 2) {
                return {
                    ...prev,
                    [nodeId]: {
                        ...existing,
                        flipped: nextFlipped,
                        status: nextStatus,
                    },
                };
            }

            const [firstIndex, secondIndex] = nextFlipped;
            const firstCard = existing.cards[firstIndex];
            const secondCard = existing.cards[secondIndex];
            const nextMoves = existing.moves + 1;

            if (firstCard && secondCard && firstCard.value === secondCard.value) {
                const nextCards = existing.cards.map((entry, entryIndex) => (
                    entryIndex === firstIndex || entryIndex === secondIndex
                        ? { ...entry, matched: true }
                        : entry
                ));
                const nextMatches = existing.matches + 1;
                const won = nextMatches * 2 >= nextCards.length;

                return {
                    ...prev,
                    [nodeId]: {
                        ...existing,
                        cards: nextCards,
                        flipped: [],
                        moves: nextMoves,
                        matches: nextMatches,
                        status: won ? 'won' : nextStatus,
                        bestMoves: won
                            ? (existing.bestMoves === null ? nextMoves : Math.min(existing.bestMoves, nextMoves))
                            : existing.bestMoves,
                    },
                };
            }

            stopMemoryFlipTimer(nodeId);
            memoryFlipTimeoutsRef.current[nodeId] = window.setTimeout(() => {
                setMemorySessions((currentState) => {
                    const current = currentState[nodeId];
                    if (!current) return currentState;
                    return {
                        ...currentState,
                        [nodeId]: {
                            ...current,
                            flipped: [],
                            locked: false,
                        },
                    };
                });
                stopMemoryFlipTimer(nodeId);
            }, 650);

            return {
                ...prev,
                [nodeId]: {
                    ...existing,
                    flipped: nextFlipped,
                    moves: nextMoves,
                    status: nextStatus,
                    locked: true,
                },
            };
        });
    };

    const renderGameMemoryComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const session = memorySessions[nodeId] || createMemorySession(payloadNode);
        const title = templateWithValues(
            toDisplayText(payloadNode.title || payloadNode.game || payloadNode.label || 'Memory'),
            valuesByKey
        );
        const cardsPerRow = clampInt(
            toNumber(payloadNode.columns ?? payloadNode.cols ?? payloadNode.cards_per_row ?? payloadNode.cardsPerRow) ?? 4,
            3,
            6
        );
        const lockedByWin = session.status === 'won';

        return (
            <div key={nodeId} className="acr-component-card acr-memory-card-container">
                <div className="acr-memory-header">
                    <div className="acr-memory-title">{title}</div>
                    <div className="acr-memory-stats-row">
                        <span className="acr-memory-stat-text">Moves {session.moves}</span>
                        {!!session.bestMoves && <span className="acr-memory-stat-text">Best {session.bestMoves}</span>}
                    </div>
                </div>

                <div className="acr-memory-grid" style={{ gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))` }}>
                    {session.cards.map((card, cardIndex) => {
                        const isFlipped = session.flipped.includes(cardIndex) || card.matched;
                        return (
                            <button
                                type="button"
                                key={`${nodeId}-memory-${card.id}-${cardIndex}`}
                                className={`acr-memory-tile${isFlipped ? ' acr-memory-tile--open' : ''}`}
                                disabled={session.locked || lockedByWin}
                                onClick={() => flipMemoryCard(nodeId, payloadNode, cardIndex)}
                            >
                                {isFlipped ? card.value : '?'}
                            </button>
                        );
                    })}
                </div>

                {session.status === 'won' && (
                    <div className="acr-memory-win-text">Well played</div>
                )}

                <div className="acr-game-action-row">
                    {session.status !== 'running' && session.status !== 'won' && (
                        <button type="button" className="acr-game-action-button" onClick={() => startOrRestartMemory(nodeId, payloadNode, false)}>
                            Start
                        </button>
                    )}

                    <button type="button" className="acr-game-action-button acr-game-action-button--ghost" onClick={() => startOrRestartMemory(nodeId, payloadNode, true)}>
                        {session.status === 'won' ? 'Play again' : 'Restart'}
                    </button>
                </div>
            </div>
        );
    };

    const renderShoppingCardsComponent = (nodeId: string, payloadNode: NodeItem): React.ReactNode => {
        const title = templateWithValues(
            toDisplayText(payloadNode.title || payloadNode.label || `Shopping: ${toDisplayText(payloadNode.query || 'resultats')}`),
            valuesByKey
        );
        const subtitle = templateWithValues(
            toDisplayText(payloadNode.subtitle || payloadNode.description || ''),
            valuesByKey
        );
        const emptyText = templateWithValues(
            toDisplayText(payloadNode.empty_text || payloadNode.emptyText || 'Aucun produit disponible.'),
            valuesByKey
        );
        const buyButtonText = templateWithValues(
            toDisplayText(payloadNode.buy_button_text || payloadNode.buyButtonText || "Voir l'offre"),
            valuesByKey
        ) || "Voir l'offre";

        const cardsRaw =
            (Array.isArray(payloadNode.cards) ? payloadNode.cards : null) ||
            (Array.isArray(payloadNode.items) ? payloadNode.items : null) ||
            [];
        const cards = cardsRaw.map((entry) => toRecord(entry)).filter((entry): entry is NodeItem => Boolean(entry));

        if (!cards.length) {
            return (
                <div key={nodeId} className="acr-component-card acr-shopping-container">
                    {!!title && <div className="acr-component-title">{title}</div>}
                    {!!subtitle && <div className="acr-shopping-subtitle">{subtitle}</div>}
                    <div className="acr-empty-text">{emptyText}</div>
                </div>
            );
        }

        return (
            <div key={nodeId} className="acr-component-card acr-shopping-container">
                {!!title && <div className="acr-component-title">{title}</div>}
                {!!subtitle && <div className="acr-shopping-subtitle">{subtitle}</div>}

                <div className="acr-shopping-cards-row">
                    {cards.map((card, index) => {
                        const cardId = `${nodeId}-shop-card-${index}`;
                        const cardTitle = templateWithValues(
                            toDisplayText(card.title || card.name || `Produit ${index + 1}`),
                            valuesByKey
                        );
                        const merchant = templateWithValues(
                            toDisplayText(card.merchant || card.vendor || card.shop || ''),
                            valuesByKey
                        );
                        const priceLabel = templateWithValues(
                            toDisplayText(card.price_label || card.priceLabel || card.price || ''),
                            valuesByKey
                        );
                        const scoreLabel = templateWithValues(
                            toDisplayText(card.score_label || card.scoreLabel || ''),
                            valuesByKey
                        );
                        const imageUrl = templateWithValues(
                            toDisplayText(card.image_url || card.imageUrl || card.image || card.photo || ''),
                            valuesByKey
                        );
                        const buyUrlRaw = templateWithValues(
                            toDisplayText(card.buy_url || card.buyUrl || card.url || card.href || ''),
                            valuesByKey
                        );
                        const buyUrl = normalizeExternalUrl(buyUrlRaw);
                        const normalizedImageUrl = normalizeExternalUrl(imageUrl);
                        const isImageFailed = failedImageByCardId[cardId] === true || isBlockedImageUrl(normalizedImageUrl);
                        const badgesRaw = Array.isArray(card.badges) ? card.badges : [];
                        const badges = badgesRaw
                            .map((badge) => templateWithValues(toDisplayText(badge), valuesByKey).trim())
                            .filter(Boolean)
                            .slice(0, 3);

                        return (
                            <div key={cardId} className="acr-shopping-card">
                                {normalizedImageUrl && !isImageFailed ? (
                                    <img
                                        src={normalizedImageUrl}
                                        alt={cardTitle}
                                        className="acr-shopping-card-image"
                                        onLoad={() => {
                                            setFailedImageByCardId((prev) => {
                                                if (!prev[cardId]) return prev;
                                                const next = { ...prev };
                                                delete next[cardId];
                                                return next;
                                            });
                                        }}
                                        onError={() => {
                                            markImageUrlAsFailed(normalizedImageUrl);
                                            setFailedImageByCardId((prev) => ({ ...prev, [cardId]: true }));
                                        }}
                                    />
                                ) : (
                                    <div className="acr-shopping-card-image acr-shopping-card-image--fallback">
                                        Image indisponible
                                    </div>
                                )}

                                <div className="acr-shopping-card-body">
                                    <div className="acr-shopping-card-title">{cardTitle}</div>
                                    {!!merchant && (
                                        <div className="acr-shopping-card-merchant">{merchant}</div>
                                    )}
                                    {!!priceLabel && <div className="acr-shopping-card-price">{priceLabel}</div>}
                                    {!!scoreLabel && <div className="acr-shopping-card-score">{scoreLabel}</div>}

                                    {!!badges.length && (
                                        <div className="acr-shopping-badges-row">
                                            {badges.map((badge, badgeIndex) => (
                                                <div key={`${cardId}-badge-${badgeIndex}`} className="acr-shopping-badge">
                                                    {badge}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        className="acr-button acr-shopping-buy-button"
                                        disabled={!buyUrl}
                                        onClick={() => {
                                            if (!buyUrl) return;
                                            void executeAction({ type: 'open_url', url: buyUrl }, `${cardId}-open`);
                                        }}
                                    >
                                        {buyButtonText}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderComponentNode = (node: NodeItem, nodeId: string): React.ReactNode => {
        const payloadNode = resolveComponentPayloadFromNode(node);
        const componentName = canonicalComponentKey(node, payloadNode);

        if (componentName === 'game_shell_v1' && isSnakeRuntimeComponentNode(node)) {
            return renderGameSnakeComponent(nodeId, payloadNode);
        }
        if (componentName === 'game_shell_v1' && isMemoryRuntimeComponentNode(node)) {
            return renderGameMemoryComponent(nodeId, payloadNode);
        }

        const registry: Record<string, () => React.ReactNode> = {
            chart_v1: () => renderChartComponent(nodeId, payloadNode),
            kanban_v1: () => renderKanbanComponent(nodeId, payloadNode),
            timeline_v1: () => renderTimelineComponent(nodeId, payloadNode),
            form_v1: () => renderFormComponent(nodeId, payloadNode),
            gmail_compose_v1: () => renderGmailComposeComponent(nodeId, payloadNode),
            shopping_cards_v1: () => renderShoppingCardsComponent(nodeId, payloadNode),
            game_shell_v1: () => renderGameShellComponent(nodeId, payloadNode),
            game_snake_v1: () => renderGameSnakeComponent(nodeId, payloadNode),
            game_memory_v1: () => renderGameMemoryComponent(nodeId, payloadNode),
        };

        const renderer = registry[componentName];
        if (!renderer) {
            return (
                <div key={nodeId} className="acr-component-unknown">
                    <div className="acr-component-unknown-title">Unsupported component</div>
                    <div className="acr-component-unknown-name">{toDisplayText(node.component || 'unknown')}</div>
                </div>
            );
        }

        return renderer();
    };

    const renderNode = (node: NodeItem, index: number, parentKey: string = 'root'): React.ReactNode => {
        const fallbackKey = `${parentKey}-${index}`;
        const nodeId = resolveNodeId(node, fallbackKey);
        if (!isVisible(node, nodeId)) return null;

        const type = normalizeKey(node.type || 'text');
        const text = templateWithValues(toDisplayText(node.text || node.value || node.content), valuesByKey);

        if (type === 'title' || type === 'heading') {
            return <div key={nodeId} className="acr-title">{renderRichText(text, `${nodeId}-title`)}</div>;
        }

        if (type === 'subtitle') {
            return <div key={nodeId} className="acr-subtitle">{renderRichText(text, `${nodeId}-subtitle`)}</div>;
        }

        if (type === 'caption') {
            return <div key={nodeId} className="acr-caption">{renderRichText(text, `${nodeId}-caption`)}</div>;
        }

        if (type === 'quote') {
            return (
                <blockquote key={nodeId} className="acr-quote">
                    {renderRichText(text, `${nodeId}-quote`)}
                </blockquote>
            );
        }

        if (type === 'code' || type === 'json') {
            const codeText = type === 'json' && isRecord(node.data)
                ? JSON.stringify(node.data, null, 2)
                : (text || toDisplayText(node.data));
            return (
                <pre key={nodeId} className="acr-code">
                    <code>{codeText}</code>
                </pre>
            );
        }

        if (type === 'list') {
            return renderList(Array.isArray(node.items) ? node.items : [], nodeId, false, false);
        }

        if (type === 'ordered_list') {
            return renderList(Array.isArray(node.items) ? node.items : [], nodeId, true, false);
        }

        if (type === 'checklist') {
            return renderList(Array.isArray(node.items) ? node.items : [], nodeId, false, true);
        }

        if (type === 'kv' && Array.isArray(node.items)) {
            const items = node.items.filter((entry) => isRecord(entry)) as NodeItem[];
            if (!items.length) return null;
            return (
                <div key={nodeId} className="acr-block">
                    {items.map((entry, entryIndex) => {
                        const label = templateWithValues(toDisplayText(entry.label), valuesByKey);
                        const value = templateWithValues(toDisplayText(entry.value), valuesByKey);
                        if (!label && !value) return null;
                        return (
                            <div key={`${nodeId}-kv-${entryIndex}`} className="acr-kv">
                                {!!label && <span className="acr-kv__key">{label}</span>}
                                {!!value && <span className="acr-kv__value">{renderRichText(value, `${nodeId}-kv-${entryIndex}`)}</span>}
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (type === 'kv') {
            const label = templateWithValues(toDisplayText(node.key || node.label), valuesByKey);
            const value = templateWithValues(toDisplayText(node.value), valuesByKey);
            return (
                <div key={nodeId} className="acr-kv">
                    {!!label && <span className="acr-kv__key">{label}</span>}
                    {!!value && <span className="acr-kv__value">{renderRichText(value, `${nodeId}-kv-single`)}</span>}
                </div>
            );
        }

        if (type === 'table') {
            return renderTable(node, nodeId);
        }

        if (type === 'metric') {
            const label = templateWithValues(toDisplayText(node.label), valuesByKey);
            const value = templateWithValues(toDisplayText(node.value ?? node.value_num), valuesByKey);
            const trend = templateWithValues(toDisplayText(node.trend || node.delta), valuesByKey);
            return (
                <div key={nodeId} className="acr-metric">
                    {!!label && <span className="acr-metric__label">{label}</span>}
                    {!!value && <span className="acr-metric__value">{value}</span>}
                    {!!trend && <span className="acr-metric__trend">{trend}</span>}
                </div>
            );
        }

        if (type === 'progress') {
            const label = templateWithValues(toDisplayText(node.label), valuesByKey);
            const rawValue = toNumber(node.value ?? node.percent ?? node.percentage) ?? 0;
            const value = clampPercentage(rawValue);
            return (
                <div key={nodeId} className="acr-progress">
                    {!!label && <span className="acr-progress__label">{label}</span>}
                    <div className="acr-progress__track">
                        <div className="acr-progress__fill" style={{ width: `${value}%` }} />
                    </div>
                    <span className="acr-progress__value">{Math.round(value)}%</span>
                </div>
            );
        }

        if (type === 'badge') {
            const badgeText = templateWithValues(toDisplayText(node.text || node.label || node.value), valuesByKey);
            return (
                <span key={nodeId} className="acr-badge">
                    {badgeText}
                </span>
            );
        }

        if (type === 'chips' && Array.isArray(node.items)) {
            const chips = node.items.map((item) => templateWithValues(toDisplayText(item), valuesByKey)).filter(Boolean);
            return (
                <div key={nodeId} className="acr-chips">
                    {chips.map((chip, chipIndex) => (
                        <span key={`${nodeId}-chip-${chipIndex}`} className="acr-chip">
                            {chip}
                        </span>
                    ))}
                </div>
            );
        }

        if (type === 'divider') {
            return <hr key={nodeId} className="acr-divider" />;
        }

        if (type === 'spacer') {
            const size = toNumber(node.size) ?? 12;
            return <div key={nodeId} className="acr-spacer" style={{ height: Math.max(0, size) }} />;
        }

        if (type === 'image') {
            const url = normalizeExternalUrl(templateWithValues(toDisplayText(node.url || node.src), valuesByKey));
            if (!url || isBlockedImageUrl(url)) return null;
            const caption = templateWithValues(toDisplayText(node.caption), valuesByKey);
            const height = Math.max(80, toNumber(node.height) ?? 180);
            return (
                <div key={nodeId} className="acr-image-block">
                    <img
                        src={url}
                        className="acr-image"
                        style={{ height }}
                        alt={templateWithValues(toDisplayText(node.alt || node.title || 'Image'), valuesByKey)}
                        onError={() => {
                            markImageUrlAsFailed(url);
                        }}
                    />
                    {!!caption && <div className="acr-caption">{renderRichText(caption, `${nodeId}-image-caption`)}</div>}
                </div>
            );
        }

        if (type === 'button') {
            const buttonText = templateWithValues(toDisplayText(node.text || node.label || node.title || 'Action'), valuesByKey);
            const revealText = templateWithValues(
                toDisplayText(node.reveal_text || node.revealText || node.resultText),
                valuesByKey
            );
            const action = node.action;
            const isRevealed = revealedByKey[nodeId] === true;
            const inlineRevealText = revealedTextByKey[nodeId] || revealText;

            return (
                <div key={nodeId} className="acr-button-wrap">
                    <button
                        type="button"
                        className="acr-button"
                        onClick={() => { void executeAction(action, nodeId, revealText); }}
                    >
                        {buttonText}
                    </button>
                    {isRevealed && !!inlineRevealText && (
                        <div className="acr-revealed">
                            {renderRichText(inlineRevealText, `${nodeId}-revealed`)}
                        </div>
                    )}
                </div>
            );
        }

        if (type === 'buttons' && Array.isArray(node.items || node.buttons)) {
            const items = Array.isArray(node.items) ? node.items : (node.buttons as unknown[]);
            return (
                <div key={nodeId} className="acr-buttons">
                    {items.map((rawButton, buttonIndex) => {
                        const button = isRecord(rawButton) ? rawButton : null;
                        if (!button) return null;
                        const buttonKey = `${nodeId}-btn-${buttonIndex}`;
                        const buttonText = templateWithValues(
                            toDisplayText(button.text || button.label || button.title || `Action ${buttonIndex + 1}`),
                            valuesByKey
                        );
                        const revealText = templateWithValues(
                            toDisplayText(button.reveal_text || button.revealText || button.resultText),
                            valuesByKey
                        );
                        const inlineRevealText = revealedTextByKey[buttonKey] || revealText;
                        const isRevealed = revealedByKey[buttonKey] === true;
                        return (
                            <div key={buttonKey} className="acr-button-wrap">
                                <button
                                    type="button"
                                    className="acr-button acr-button--small"
                                    onClick={() => { void executeAction(button.action || button, buttonKey, revealText); }}
                                >
                                    {buttonText}
                                </button>
                                {isRevealed && !!inlineRevealText && (
                                    <div className="acr-revealed">
                                        {renderRichText(inlineRevealText, `${buttonKey}-revealed`)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (type === 'callout') {
            const tone = normalizeKey(node.tone || node.variant || node.color || 'info');
            const nestedNodes = normalizeChildNodes(node.nodes || node.children || node.blocks);
            const title = templateWithValues(toDisplayText(node.title || node.label), valuesByKey);
            const description = templateWithValues(toDisplayText(node.text || node.description), valuesByKey);
            return (
                <div key={nodeId} className={`acr-callout acr-callout--${tone}`}>
                    {!!title && <div className="acr-callout__title">{title}</div>}
                    {!!description && <div className="acr-callout__body">{renderRichText(description, `${nodeId}-callout`)}</div>}
                    {nestedNodes.map((nestedNode, nestedIndex) => renderNode(nestedNode, nestedIndex, nodeId))}
                </div>
            );
        }

        if (type === 'section' || type === 'group') {
            const title = templateWithValues(toDisplayText(node.title || node.label), valuesByKey);
            const description = templateWithValues(toDisplayText(node.text || node.description), valuesByKey);
            const nestedNodes = normalizeChildNodes(node.nodes || node.children || node.blocks);

            return (
                <div key={nodeId} className="acr-section">
                    {!!title && <div className="acr-section__title">{title}</div>}
                    {!!description && <div className="acr-section__description">{renderRichText(description, `${nodeId}-section`)}</div>}
                    {nestedNodes.map((nestedNode, nestedIndex) => renderNode(nestedNode, nestedIndex, nodeId))}
                </div>
            );
        }

        if (type === 'component' || type === 'super_node' || type === 'widget' || Boolean(node.component || node.block)) {
            return renderComponentNode(node, nodeId);
        }

        return (
            <div key={nodeId} className="acr-text">
                {renderRichText(text, `${nodeId}-default`)}
            </div>
        );
    };

    if (!payload) {
        return (
            <div className="acr-root">
                <div className="acr-text">{renderRichText(fallbackText, 'fallback')}</div>
            </div>
        );
    }

    if (payload.mode === 'text') {
        return (
            <div className="acr-root">
                <div className="acr-text">
                    {renderRichText(`${templateWithValues(payload.text || cleanedRawContent, valuesByKey)}${fallbackSuffix}`, 'text')}
                </div>
            </div>
        );
    }

    if (nodes.length === 0) {
        return (
            <div className="acr-root">
                <div className="acr-text">{renderRichText(payload.fallback_text || fallbackText, 'structured-fallback')}</div>
            </div>
        );
    }

    return (
        <div className="acr-root">
            {nodes.map((node, index) => renderNode(node, index, 'root'))}
        </div>
    );
}

export const AgentContentRenderer = React.memo(AgentContentRendererComponent, (prev, next) => (
    prev.content === next.content && prev.fallbackSuffix === next.fallbackSuffix
));
