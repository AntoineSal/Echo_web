import React from 'react';

interface TextSegment {
    value: string;
    url?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    inlineCode?: boolean;
    codeBlock?: boolean;
}

interface RenderFormattedTextOptions {
    textClassName?: string;
    linkClassName?: string;
    inlineCodeClassName?: string;
    codeBlockClassName?: string;
    headingClassName?: string;
    headingToneClassName?: string;
}

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const URL_AT_START_REGEX = /^(?:https?:\/\/|www\.)[^\s]+/i;
const TRAILING_PUNCTUATION_REGEX = /[),.!?;:]+$/;
const MAX_PARSE_DEPTH = 10;

const normalizeUrl = (url: string): string => {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    return `https://${url}`;
};

const isAlphaNumeric = (char: string): boolean => /[a-z0-9]/i.test(char);

const hasNonSpaceBoundaries = (inner: string): boolean => {
    if (inner.length === 0) return false;
    if (inner.startsWith(' ') || inner.endsWith(' ')) return false;
    return /\S/.test(inner);
};

const findClosingDelimiter = (value: string, delimiter: string, fromIndex: number): number => {
    let index = fromIndex;
    while (index < value.length) {
        index = value.indexOf(delimiter, index);
        if (index === -1) return -1;

        const isEscaped = index > 0 && value[index - 1] === '\\';
        if (!isEscaped) return index;
        index += delimiter.length;
    }

    return -1;
};

const appendSegment = (segments: TextSegment[], incoming: TextSegment) => {
    if (!incoming.value) return;

    const last = segments[segments.length - 1];
    if (
        last &&
        last.url === incoming.url &&
        last.bold === incoming.bold &&
        last.italic === incoming.italic &&
        last.underline === incoming.underline &&
        last.strikethrough === incoming.strikethrough &&
        last.inlineCode === incoming.inlineCode &&
        last.codeBlock === incoming.codeBlock
    ) {
        last.value += incoming.value;
        return;
    }

    segments.push(incoming);
};

const pushAutoLinkSegment = (segments: TextSegment[], rawUrl: string, style: Partial<TextSegment>) => {
    const cleanedUrl = rawUrl.replace(TRAILING_PUNCTUATION_REGEX, '');
    const trailingText = rawUrl.slice(cleanedUrl.length);

    if (cleanedUrl.length > 0) {
        appendSegment(segments, { value: cleanedUrl, url: cleanedUrl, ...style });
    }

    if (trailingText.length > 0) {
        appendSegment(segments, { value: trailingText, ...style });
    }
};

const splitSimpleTextIntoSegments = (value: string, style: Partial<TextSegment>): TextSegment[] => {
    const segments: TextSegment[] = [];
    URL_REGEX.lastIndex = 0;

    let currentIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = URL_REGEX.exec(value)) !== null) {
        const rawUrl = match[0];
        const matchIndex = match.index;

        if (matchIndex > currentIndex) {
            appendSegment(segments, { value: value.slice(currentIndex, matchIndex), ...style });
        }

        pushAutoLinkSegment(segments, rawUrl, style);
        currentIndex = matchIndex + rawUrl.length;
    }

    if (currentIndex < value.length) {
        appendSegment(segments, { value: value.slice(currentIndex), ...style });
    }

    return segments;
};

const parseInlineMarkdown = (
    value: string,
    style: Partial<TextSegment> = {},
    depth = 0
): TextSegment[] => {
    if (!value) return [];
    if (depth >= MAX_PARSE_DEPTH) {
        return splitSimpleTextIntoSegments(value, style);
    }

    const segments: TextSegment[] = [];
    let buffer = '';
    let index = 0;

    const flushBuffer = () => {
        if (!buffer) return;
        splitSimpleTextIntoSegments(buffer, style).forEach((segment) => appendSegment(segments, segment));
        buffer = '';
    };

    const tryDelimited = (delimiter: string, patch: Partial<TextSegment>) => {
        if (!value.startsWith(delimiter, index)) return false;

        if (delimiter === '_' || delimiter === '__') {
            const previous = index > 0 ? value[index - 1] : '';
            if (previous && isAlphaNumeric(previous)) {
                return false;
            }
        }

        const closingIndex = findClosingDelimiter(value, delimiter, index + delimiter.length);
        if (closingIndex === -1) return false;

        const afterClosingIndex = closingIndex + delimiter.length;
        if (delimiter === '_' || delimiter === '__') {
            const nextChar = afterClosingIndex < value.length ? value[afterClosingIndex] : '';
            if (nextChar && isAlphaNumeric(nextChar)) {
                return false;
            }
        }

        const innerContent = value.slice(index + delimiter.length, closingIndex);
        if (!hasNonSpaceBoundaries(innerContent)) {
            return false;
        }

        flushBuffer();
        const childStyle = { ...style, ...patch };
        const childSegments = parseInlineMarkdown(innerContent, childStyle, depth + 1);
        childSegments.forEach((segment) => appendSegment(segments, segment));
        index = afterClosingIndex;
        return true;
    };

    while (index < value.length) {
        const char = value[index];

        if (char === '\\' && index + 1 < value.length) {
            buffer += value[index + 1];
            index += 2;
            continue;
        }

        if (char === '`') {
            const closingIndex = findClosingDelimiter(value, '`', index + 1);
            if (closingIndex !== -1) {
                const codeText = value.slice(index + 1, closingIndex);
                flushBuffer();
                appendSegment(segments, { value: codeText, ...style, inlineCode: true });
                index = closingIndex + 1;
                continue;
            }
        }

        if (char === '[') {
            const closingBracket = value.indexOf(']', index + 1);
            if (closingBracket !== -1 && value[closingBracket + 1] === '(') {
                const closingParen = value.indexOf(')', closingBracket + 2);
                if (closingParen !== -1) {
                    const label = value.slice(index + 1, closingBracket);
                    const rawUrl = value.slice(closingBracket + 2, closingParen).trim();
                    const looksLikeUrl = /^(?:https?:\/\/|www\.)/i.test(rawUrl);

                    if (label.length > 0 && looksLikeUrl) {
                        flushBuffer();
                        appendSegment(segments, { value: label, url: rawUrl, ...style });
                        index = closingParen + 1;
                        continue;
                    }
                }
            }
        }

        const rawUrlMatch = value.slice(index).match(URL_AT_START_REGEX);
        if (rawUrlMatch) {
            flushBuffer();
            pushAutoLinkSegment(segments, rawUrlMatch[0], style);
            index += rawUrlMatch[0].length;
            continue;
        }

        if (tryDelimited('***', { bold: true, italic: true })) continue;
        if (tryDelimited('**', { bold: true })) continue;
        if (tryDelimited('__', { bold: true })) continue;
        if (tryDelimited('++', { underline: true })) continue;
        if (tryDelimited('~~', { strikethrough: true })) continue;
        if (tryDelimited('*', { italic: true })) continue;
        if (tryDelimited('_', { italic: true })) continue;

        buffer += char;
        index += 1;
    }

    flushBuffer();
    return segments;
};

const splitTextIntoSegments = (value: string): TextSegment[] => {
    const segments: TextSegment[] = [];
    const codeBlockRegex = /```([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(value)) !== null) {
        const start = match.index;
        const end = codeBlockRegex.lastIndex;
        const codeContent = match[1] ?? '';

        if (start > lastIndex) {
            parseInlineMarkdown(value.slice(lastIndex, start)).forEach((segment) => appendSegment(segments, segment));
        }

        appendSegment(segments, { value: codeContent, inlineCode: true, codeBlock: true });
        lastIndex = end;
    }

    if (lastIndex < value.length) {
        parseInlineMarkdown(value.slice(lastIndex)).forEach((segment) => appendSegment(segments, segment));
    }

    return segments;
};

const wrapStyledContent = (
    content: React.ReactNode,
    segment: TextSegment,
    options: RenderFormattedTextOptions,
    key: string
): React.ReactNode => {
    let node = content;

    if (segment.inlineCode) {
        node = (
            <code
                key={`${key}-code`}
                className={segment.codeBlock ? options.codeBlockClassName : options.inlineCodeClassName}
            >
                {node}
            </code>
        );
    }
    if (segment.bold) node = <strong key={`${key}-bold`}>{node}</strong>;
    if (segment.italic) node = <em key={`${key}-italic`}>{node}</em>;
    if (segment.underline) node = <u key={`${key}-underline`}>{node}</u>;
    if (segment.strikethrough) node = <s key={`${key}-strike`}>{node}</s>;
    if (segment.url) {
        node = (
            <a
                key={`${key}-link`}
                href={normalizeUrl(segment.url)}
                target="_blank"
                rel="noopener noreferrer"
                className={options.linkClassName}
            >
                {node}
            </a>
        );
    }

    return node;
};

export function renderFormattedText(
    text: string,
    keyPrefix: string,
    options: RenderFormattedTextOptions = {}
): React.ReactNode {
    const lines = (text || '').split('\n');
    if (!lines.length) {
        return options.textClassName ? <span className={options.textClassName} /> : null;
    }

    return (
        <>
            {lines.map((line, lineIndex) => {
                const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

                if (headingMatch && options.headingClassName) {
                    const level = headingMatch[1].length;
                    const headingText = headingMatch[2];
                    const headingSegments = splitTextIntoSegments(headingText);
                    return (
                        <React.Fragment key={`${keyPrefix}-line-${lineIndex}`}>
                            <span className={`${options.headingClassName} ${options.headingToneClassName || ''} ${options.headingClassName}--${level}`.trim()}>
                                {headingSegments.map((segment, index) => {
                                    const content = <>{segment.value}</>;
                                    return (
                                        <React.Fragment key={`${keyPrefix}-line-${lineIndex}-seg-${index}`}>
                                            {wrapStyledContent(content, segment, options, `${keyPrefix}-line-${lineIndex}-seg-${index}`)}
                                        </React.Fragment>
                                    );
                                })}
                            </span>
                            {lineIndex < lines.length - 1 ? <br /> : null}
                        </React.Fragment>
                    );
                }

                const segments = splitTextIntoSegments(line);
                return (
                    <React.Fragment key={`${keyPrefix}-line-${lineIndex}`}>
                        {segments.map((segment, index) => {
                            const content = options.textClassName
                                ? <span className={options.textClassName}>{segment.value}</span>
                                : <>{segment.value}</>;
                            return (
                                <React.Fragment key={`${keyPrefix}-line-${lineIndex}-seg-${index}`}>
                                    {wrapStyledContent(content, segment, options, `${keyPrefix}-line-${lineIndex}-seg-${index}`)}
                                </React.Fragment>
                            );
                        })}
                        {lineIndex < lines.length - 1 ? <br /> : null}
                    </React.Fragment>
                );
            })}
        </>
    );
}
