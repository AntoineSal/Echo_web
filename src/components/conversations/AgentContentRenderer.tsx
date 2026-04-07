/**
 * Web renderer for the structured JSON agent content (ui.v1 schema).
 * Mirrors the mobile AgentRenderContent component for the most common node types.
 */
import React, { useState } from 'react';
import './AgentContentRenderer.css';

interface Node {
    type: string;
    text?: string;
    items?: string[];
    key?: string;
    value?: string;
    rows?: string[][];
    headers?: string[];
    label?: string;
    value_num?: number;
    max?: number;
    color?: string;
    children?: Node[];
    nodes?: Node[];
    action?: { type: string; text?: string; url?: string };
    [key: string]: unknown;
}

interface AgentContentRendererProps {
    content: string;
}

function renderNode(node: Node, idx: number): React.ReactNode {
    const key = `node-${idx}-${node.type}`;

    switch (node.type) {
        case 'title':
            return <h2 key={key} className="acr-title">{node.text}</h2>;
        case 'subtitle':
            return <h3 key={key} className="acr-subtitle">{node.text}</h3>;
        case 'heading':
            return <h4 key={key} className="acr-heading">{node.text}</h4>;
        case 'text':
            return <p key={key} className="acr-text">{node.text}</p>;
        case 'caption':
            return <p key={key} className="acr-caption">{node.text}</p>;
        case 'quote':
            return <blockquote key={key} className="acr-quote">{node.text}</blockquote>;
        case 'code':
            return <pre key={key} className="acr-code"><code>{node.text}</code></pre>;
        case 'list':
            return (
                <ul key={key} className="acr-list">
                    {(node.items || []).map((item, i) => <li key={i}>{item}</li>)}
                </ul>
            );
        case 'ordered_list':
            return (
                <ol key={key} className="acr-list acr-list--ordered">
                    {(node.items || []).map((item, i) => <li key={i}>{item}</li>)}
                </ol>
            );
        case 'checklist':
            return (
                <ul key={key} className="acr-checklist">
                    {(node.items || []).map((item, i) => (
                        <li key={i} className="acr-checklist__item">
                            <span className="acr-checklist__box">☐</span> {item}
                        </li>
                    ))}
                </ul>
            );
        case 'kv':
            return (
                <div key={key} className="acr-kv">
                    <span className="acr-kv__key">{node.key}</span>
                    <span className="acr-kv__value">{String(node.value ?? '')}</span>
                </div>
            );
        case 'table':
            return (
                <div key={key} className="acr-table-wrap">
                    <table className="acr-table">
                        {node.headers && (
                            <thead>
                                <tr>{node.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                            </thead>
                        )}
                        <tbody>
                            {(node.rows || []).map((row, ri) => (
                                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'metric':
            return (
                <div key={key} className="acr-metric">
                    <span className="acr-metric__value">{String(node.value_num ?? node.value ?? '')}</span>
                    {node.label && <span className="acr-metric__label">{node.label}</span>}
                </div>
            );
        case 'progress':
            const pct = Math.min(100, Math.max(0, ((node.value_num ?? 0) / (node.max ?? 100)) * 100));
            return (
                <div key={key} className="acr-progress">
                    {node.label && <span className="acr-progress__label">{node.label}</span>}
                    <div className="acr-progress__track">
                        <div className="acr-progress__fill" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            );
        case 'badge':
            return <span key={key} className="acr-badge">{node.text}</span>;
        case 'chips':
            return (
                <div key={key} className="acr-chips">
                    {(node.items || []).map((chip, i) => <span key={i} className="acr-chip">{chip}</span>)}
                </div>
            );
        case 'divider':
            return <hr key={key} className="acr-divider" />;
        case 'spacer':
            return <div key={key} className="acr-spacer" />;
        case 'callout':
            return (
                <div key={key} className={`acr-callout acr-callout--${node.color || 'green'}`}>
                    {node.text}
                </div>
            );
        case 'button':
            return <ActionButton key={key} node={node} />;
        case 'buttons':
            return (
                <div key={key} className="acr-buttons">
                    {((node.items as unknown as Node[]) || []).map((btn, i) => <ActionButton key={i} node={btn} />)}
                </div>
            );
        case 'section':
        case 'group':
            return (
                <div key={key} className={`acr-section`}>
                    {node.text && <div className="acr-section__title">{node.text}</div>}
                    {(node.nodes || node.children || []).map((child: Node, i: number) => renderNode(child, i))}
                </div>
            );
        default:
            if (node.text) return <p key={key} className="acr-text">{node.text}</p>;
            return null;
    }
}

function ActionButton({ node }: { node: Node }) {
    const [revealed, setRevealed] = useState<string | null>(null);

    const handleClick = () => {
        if (!node.action) return;
        const { type, text, url } = node.action;
        if (type === 'reveal' || type === 'toggle_reveal') {
            setRevealed(prev => prev ? null : (text || ''));
        } else if (type === 'open_url' && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (type === 'copy_text' && text) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
    };

    return (
        <div className="acr-button-wrap">
            <button className="acr-button" onClick={handleClick}>{node.text}</button>
            {revealed && <div className="acr-revealed">{revealed}</div>}
        </div>
    );
}

export function AgentContentRenderer({ content }: AgentContentRendererProps) {
    try {
        const parsed = JSON.parse(content);

        // Structured UI schema
        if (parsed?.mode === 'structured' && parsed?.data?.nodes) {
            return (
                <div className="acr-root">
                    {parsed.data.nodes.map((node: Node, i: number) => renderNode(node, i))}
                </div>
            );
        }

        // Plain JSON fallback — show as code block
        if (typeof parsed === 'object') {
            const fallback = parsed.fallback_text || parsed.text || JSON.stringify(parsed, null, 2);
            return <div className="acr-root"><p className="acr-text">{fallback}</p></div>;
        }

        return <div className="acr-root"><p className="acr-text">{String(parsed)}</p></div>;
    } catch {
        // Not JSON — plain text
        return <div className="acr-root"><p className="acr-text">{content}</p></div>;
    }
}
