// Web-specific API config
// Uses relative URLs so Vite's dev proxy can forward to the production backend
// In production build, this should be replaced with the actual API URL

const isDevServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE_URL = isDevServer ? '' : 'https://reseausocial-production.up.railway.app';

export const WS_BASE_URL = isDevServer
    ? `ws://${window.location.host}`
    : 'wss://reseausocial-production.up.railway.app';

export const getApiUrl = (endpoint: string): string => {
    return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
