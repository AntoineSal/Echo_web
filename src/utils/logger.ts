const STORAGE_KEY = 'echo:web:debug';
const DEDUPE_WINDOW_MS = 800;

type LogDetails = Record<string, unknown> | undefined;
type LogLevel = 'off' | 'info' | 'debug';

type DebugWindow = Window & {
    echoWebDebug?: {
        enable: () => void;
        verbose: () => void;
        disable: () => void;
        level: () => LogLevel;
    };
    __echoWebDebugInstalled?: boolean;
};

const recentLogTimestamps = new Map<string, number>();

function readStoredFlag(): string | null {
    if (typeof window === 'undefined') return null;

    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function getWebDebugLevel(): LogLevel {
    const stored = readStoredFlag();

    if (stored === 'debug' || stored === 'verbose' || stored === '2') return 'debug';
    if (stored === '1' || stored === 'true' || stored === 'info') return 'info';
    if (stored === '0' || stored === 'false' || stored === 'off') return 'off';

    return import.meta.env.DEV ? 'info' : 'off';
}

export function isWebDebugEnabled(): boolean {
    return getWebDebugLevel() !== 'off';
}

function writeStoredFlag(value: '0' | '1' | 'debug'): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
        // Ignore storage failures; logging can still rely on dev mode.
    }
}

function formatPrefix(scope: string): string {
    return `[EchoWeb:${scope}]`;
}

function shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    if (level === 'warn' || level === 'error') return true;

    const debugLevel = getWebDebugLevel();
    if (debugLevel === 'off') return false;
    if (level === 'info') return true;
    return debugLevel === 'debug';
}

function stringifyValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
        return value.length > 80 ? `${value.slice(0, 77)}...` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stringifyValue(item)).join(', ')}]`;
    }

    try {
        const serialized = JSON.stringify(value);
        return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
    } catch {
        return String(value);
    }
}

function formatDetails(details?: LogDetails): string {
    if (!details || Object.keys(details).length === 0) return '';

    return Object.entries(details)
        .map(([key, value]) => `${key}=${stringifyValue(value)}`)
        .join(' ');
}

function shouldSuppressDuplicate(level: 'debug' | 'info' | 'warn' | 'error', scope: string, message: string, details?: LogDetails): boolean {
    if (level === 'warn' || level === 'error') return false;

    const signature = `${level}|${scope}|${message}|${formatDetails(details)}`;
    const now = Date.now();
    const previous = recentLogTimestamps.get(signature) ?? 0;
    recentLogTimestamps.set(signature, now);
    return now - previous < DEDUPE_WINDOW_MS;
}

function log(
    level: 'debug' | 'info' | 'warn' | 'error',
    scope: string,
    message: string,
    details?: LogDetails
): void {
    if (!shouldLog(level)) return;
    if (shouldSuppressDuplicate(level, scope, message, details)) return;

    const prefix = formatPrefix(scope);
    const suffix = formatDetails(details);
    console[level](suffix ? `${prefix} ${message} ${suffix}` : `${prefix} ${message}`);
}

export const webLogger = {
    debug: (scope: string, message: string, details?: LogDetails) => log('debug', scope, message, details),
    info: (scope: string, message: string, details?: LogDetails) => log('info', scope, message, details),
    warn: (scope: string, message: string, details?: LogDetails) => log('warn', scope, message, details),
    error: (scope: string, message: string, details?: LogDetails) => log('error', scope, message, details),
};

if (typeof window !== 'undefined') {
    const debugWindow = window as DebugWindow;

    if (!debugWindow.__echoWebDebugInstalled) {
        debugWindow.__echoWebDebugInstalled = true;
        debugWindow.echoWebDebug = {
            enable: () => {
                writeStoredFlag('1');
                console.info('[EchoWeb:debug] Logs enabled at info level');
            },
            verbose: () => {
                writeStoredFlag('debug');
                console.info('[EchoWeb:debug] Logs enabled at debug level');
            },
            disable: () => {
                writeStoredFlag('0');
                console.info('[EchoWeb:debug] Logs disabled');
            },
            level: () => getWebDebugLevel(),
        };

        if (isWebDebugEnabled()) {
            console.info(`[EchoWeb:debug] Logs enabled at ${getWebDebugLevel()} level`);
        }
    }
}
