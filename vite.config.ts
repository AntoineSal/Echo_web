import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_URL = 'https://reseausocial-production.up.railway.app';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/messaging': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/notif': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/jarvis': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/relations': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/groups': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/framework': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/ws': { target: BACKEND_URL.replace('https', 'wss'), ws: true, changeOrigin: true, secure: true },
    },
  },
  resolve: {
    alias: [
      // ── Stubs: intercept mobile-only modules BEFORE catch-all ──
      // API config (uses relative URLs for proxy)
      { find: /^@(?:mobile)?\/config\/api$/, replacement: path.resolve(__dirname, './src/stubs/api.ts') },
      // Storage (removes expo-secure-store dependency)
      { find: /^@(?:mobile)?\/utils\/storage$/, replacement: path.resolve(__dirname, './src/stubs/storage.ts') },
      // Notifications (removes expo-notifications dependency)
      { find: /^@(?:mobile)?\/utils\/notifications$/, replacement: path.resolve(__dirname, './src/stubs/notifications.ts') },
      // DatabaseManager (removes expo-sqlite dependency)
      { find: /^@(?:mobile)?\/services\/DatabaseManager$/, replacement: path.resolve(__dirname, './src/stubs/DatabaseManager.ts') },
      // CacheManager (removes @react-native-async-storage dependency)
      { find: /^@(?:mobile)?\/utils\/CacheManager$/, replacement: path.resolve(__dirname, './src/stubs/CacheManager.ts') },
      // Network errors (web stub)
      { find: /^@(?:mobile)?\/utils\/networkErrors$/, replacement: path.resolve(__dirname, './src/stubs/networkErrors.ts') },
      // Route params (UUID validation)
      { find: /^@(?:mobile)?\/utils\/routeParams$/, replacement: path.resolve(__dirname, './src/stubs/routeParams.ts') },
      // ── Mobile source aliases ──
      { find: '@mobile', replacement: path.resolve(__dirname, './mobile_src') },
      { find: /^@\//, replacement: path.resolve(__dirname, './mobile_src') + '/' },
      // ── React Native Web ──
      { find: 'react-native', replacement: 'react-native-web' },
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
  },
  define: {
    __DEV__: JSON.stringify(true),
    'process.env': {},
  },
})

