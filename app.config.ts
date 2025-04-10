// app.config.ts
import { defineConfig } from '@tanstack/react-start/config'
import tsConfigPaths from 'vite-tsconfig-paths'
import WebSocket from 'ws'
import { Server } from 'http'

export default defineConfig({
  vite: {
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
  server: {
    // Set up WebSocket server when the HTTP server starts
    experimental: {
        websocket: true,
      },
  }
}).then((config) =>
    config.addRouter({
      name: "websocket",
      type: "http",
      handler: "./app/routes/api/ws.ts", // the file we created above
      target: "server",
      base: "/_ws",
    })
  );