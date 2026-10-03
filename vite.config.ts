import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      id: '/',
      name: 'LokalPingu',
      short_name: 'LokalPingu',
      description: 'Offline customer replies from verified local business facts',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#173d37',
      background_color: '#f5f4ee',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
      ]
    },
    workbox: {
      globIgnores: ['**/models/**'],
      maximumFileSizeToCacheInBytes: 25 * 1024 * 1024
    }
  })]
});
