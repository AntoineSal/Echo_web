import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mobile': path.resolve(__dirname, './mobile_src'),
      'react-native': 'react-native-web'
    }
  },
  define: {
    'process.env': {}
  }
})
