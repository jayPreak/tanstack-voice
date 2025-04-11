import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Create HTTP server to serve a simple HTML client
const httpServer = createServer((req, res) => {
  if (req.url === '/') {
    // Serve a basic HTML page for testing
    fs.readFile(path.join(process.cwd(), 'client.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading client.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Create WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server: httpServer });

// Store active connections
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Date.now();
  clients.set(clientId, { ws, openaiWs: null });
  
  console.log(`Client connected (ID: ${clientId})`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to WebSocket proxy for OpenAI Realtime API',
    clientId: clientId
  }));
  
  // Handle messages from the client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received from client ${clientId}:`, data.type);
      console.log(data.type)
      
      // Get the client's state
      const clientState = clients.get(clientId);
      
      if (data.type === 'connect') {
        // Check if API key is available
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'OpenAI API key is not configured. Please add it to the .env file.'
          }));
          return;
        }
        
        // Close existing connection if any
        if (clientState.openaiWs) {
          clientState.openaiWs.close();
          clientState.openaiWs = null;
        }
        
        console.log(`Connecting to OpenAI for client ${clientId}`);
        
        // Connect to OpenAI's WebSocket API
        const openaiWs = new WebSocket('wss://api.openai.com/v1/audio/speech', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        // Store the OpenAI WebSocket connection
        clientState.openaiWs = openaiWs;
        
        // Handle OpenAI WebSocket events
        openaiWs.on('open', () => {
          console.log(`Connected to OpenAI for client ${clientId}`);
          ws.send(JSON.stringify({
            type: 'openai.connected'
          }));
          
          // Initialize session with OpenAI
          openaiWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              model: data.model || '4o-mini-realtime',
              voice: data.voice || 'alloy'
            }
          }));
        });
        
        openaiWs.on('message', (openaiMessage) => {
          // Forward messages from OpenAI to client
          ws.send(openaiMessage.toString());
          
          // Log OpenAI events for debugging
          try {
            const parsed = JSON.parse(openaiMessage.toString());
            console.log(`OpenAI event for client ${clientId}:`, parsed.type);
          } catch (e) {
            // Non-JSON message, ignore
          }
        });
        
        openaiWs.on('close', (code, reason) => {
          console.log(`OpenAI disconnected for client ${clientId}:`, code, reason.toString());
          ws.send(JSON.stringify({
            type: 'openai.disconnected',
            code,
            reason: reason.toString()
          }));
          clientState.openaiWs = null;
        });
        
        openaiWs.on('error', (error) => {
          console.error(`OpenAI WebSocket error for client ${clientId}:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Error in OpenAI connection: ' + error.message
          }));
        });
      } 
      else if (clientState.openaiWs && clientState.openaiWs.readyState === WebSocket.OPEN) {
        // Forward the message to OpenAI
        clientState.openaiWs.send(message.toString());
      } 
      else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Not connected to OpenAI. Please connect first.'
        }));
      }
    } catch (error) {
      console.error(`Error handling message from client ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing message: ' + error.message
      }));
    }
  });
  
  // Handle client disconnection
  ws.on('close', () => {
    console.log(`Client disconnected (ID: ${clientId})`);
    
    // Close the OpenAI connection if it exists
    const clientState = clients.get(clientId);
    if (clientState && clientState.openaiWs) {
      clientState.openaiWs.close();
    }
    
    // Remove the client from the map
    clients.delete(clientId);
  });
  
  // Handle client errors
  ws.on('error', (error) => {
    console.error(`Error in client connection ${clientId}:`, error);
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`HTTP server is running on http://localhost:${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Close all client connections
  for (const [clientId, { ws, openaiWs }] of clients.entries()) {
    if (openaiWs) {
      openaiWs.close();
    }
    ws.close();
  }
  
  // Close the WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});