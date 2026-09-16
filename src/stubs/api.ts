// Web-specific API config
// Uses relative URLs so Vite's dev proxy can forward to the production backend
// In production build, this should be replaced with the actual API URL

// Use Vite's environment flag instead of checking the hostname: development
// previews may be served through a forwarded Codespaces domain rather than
// localhost, and still need the same-origin Vite proxy to avoid CORS issues.
const isDevServer = import.meta.env.DEV;

export const API_BASE_URL = isDevServer ? '' : 'https://reseausocial-production.up.railway.app';

export const WS_BASE_URL = isDevServer
    ? `ws://${window.location.host}`
    : 'wss://reseausocial-production.up.railway.app';

export const getApiUrl = (endpoint: string): string => {
    return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
