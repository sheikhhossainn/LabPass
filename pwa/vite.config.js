import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LabPass',
        short_name: 'LabPass',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#0b1020',
        icons: [],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});