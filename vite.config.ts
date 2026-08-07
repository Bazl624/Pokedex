import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The app is deployed to GitHub Pages at https://<user>.github.io/Pokedex/,
// so production assets must be served from the "/Pokedex/" base path. Local
// dev keeps the root base so http://localhost:5173/ works normally.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Pokedex/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pokeball.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pokémon TCG Collection',
        short_name: 'TCG Cards',
        description:
          'Track your Pokémon trading card collection, conditions, and values.',
        theme_color: '#1b1b2f',
        background_color: '#1b1b2f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
}))
