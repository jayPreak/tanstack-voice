// app.config.ts
import { defineConfig } from '@tanstack/react-start/config'
import tsConfigPaths from 'vite-tsconfig-paths'
import WebSocket, { WebSocketServer } from 'ws'
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
    onStart: ({ httpServer }) => {
      if (!httpServer) return
      
      console.log('Setting up WebSocket server...')
      
      // Create WebSocket server for client connections
      const wss = new WebSocketServer({ 
        server: httpServer as Server,
        path: '/ws/openai' 
      })
      
      wss.on('connection', (ws) => {
        console.log('Client connected to WebSocket proxy')
        let openaiWs: WebSocket | null = null
        
        // Send welcome message to client
        ws.send(JSON.stringify({
          type: 'system',
          message: 'Connected to WebSocket proxy'
        }))
        
        // Handle messages from client
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString())
            console.log('Received from client:', data)
            
            if (data.type === 'connect') {
              // Create connection to OpenAI
              const apiKey = process.env.OPENAI_API_KEY
              if (!apiKey) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'OpenAI API key is not configured'
                }))
                return
              }
              
              // Connect to OpenAI's WebSocket API
              openaiWs = new WebSocket('wss://api.openai.com/v1/audio/speech')
              
              // Set up OpenAI WebSocket handlers
              openaiWs.onopen = () => {
                console.log('Connected to OpenAI WebSocket')
                ws.send(JSON.stringify({
                  type: 'openai.connected'
                }))
                
                // Initialize session with OpenAI
                openaiWs.send(JSON.stringify({
                  type: 'session.update',
                  session: {
                    model: data.model || '4o-mini-realtime',
                    voice: data.voice || 'alloy'
                  }
                }))
              }
              
              openaiWs.onmessage = (event) => {
                // Forward messages from OpenAI to client
                ws.send(event.data)
              }
              
              openaiWs.onclose = () => {
                console.log('Disconnected from OpenAI WebSocket')
                ws.send(JSON.stringify({
                  type: 'openai.disconnected'
                }))
                openaiWs = null
              }
              
              openaiWs.onerror = (error) => {
                console.error('OpenAI WebSocket error:', error)
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'OpenAI WebSocket error'
                }))
              }
            } 
            else if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
              // Forward other messages to OpenAI
              openaiWs.send(message.toString())
            } 
            else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not connected to OpenAI'
              }))
            }
          } catch (error) {
            console.error('Error handling message:', error)
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Error processing message'
            }))
          }
        })
        
        // Handle client disconnection
        ws.on('close', () => {
          console.log('Client disconnected from WebSocket proxy')
          if (openaiWs) {
            openaiWs.close()
          }
        })
        
        // Handle errors
        ws.on('error', (error) => {
          console.error('Client WebSocket error:', error)
        })
      })
      
      console.log('WebSocket proxy server set up at ws://localhost:3000/ws/openai')
    }
  }
})