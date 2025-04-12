import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Enhanced configuration
const CONFIG = {
  OPENAI_API_BASE_URL: 'wss://api.openai.com/v1/realtime',
  DEFAULT_MODEL: 'gpt-4o-mini-realtime',
  DEFAULT_VOICE: 'alloy',
  RECONNECT_DELAY: 3000, // 3 seconds
  MAX_RECONNECT_ATTEMPTS: 3
};

// Load environment variables
dotenv.config();

// Get current directory for file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create HTTP server
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running');
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

// Function to encode audio file to base64
function encodeAudioFileToBase64(filePath) {
  try {
    const audioData = fs.readFileSync(filePath);
    return audioData.toString('base64');
  } catch (error) {
    console.error(`Error reading audio file ${filePath}:`, error);
    return null;
  }
}

// WebSocket connection manager
class OpenAIConnectionManager {
  constructor(clientWs, apiKey) {
    this.clientWs = clientWs;
    this.apiKey = apiKey;
    this.wsRef = null;
    this.reconnectAttempts = 0;
  }

  connect(options = {}) {
    const { 
      model = CONFIG.DEFAULT_MODEL, 
      voice = CONFIG.DEFAULT_VOICE 
    } = options;

    // Close existing connection if any
    this.disconnect();

    const url = `${CONFIG.OPENAI_API_BASE_URL}?model=${model}`;
    
    this.wsRef = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'openai-beta': 'realtime=v1'
      }
    });

    this.setupEventHandlers(model, voice);
  }

  setupEventHandlers(model, voice) {
    if (!this.wsRef) return;

    this.wsRef.on('open', () => {
      this.reconnectAttempts = 0;
      this.clientWs.send(JSON.stringify({
        type: 'openai.connected',
        model,
        voice
      }));

      // Initialize session
      this.wsRef.send(JSON.stringify({
        type: 'session.update',
        session: { model, voice }
      }));
    });
    console.log('fuck')
    console.log(this.wsRef)

    this.wsRef.on('message', (message) => {
      this.clientWs.send(message.toString());
    });

    this.wsRef.on('close', (code, reason) => {
      this.clientWs.send(JSON.stringify({
        type: 'openai.disconnected',
        code,
        reason: reason.toString()
      }));

      // Attempt reconnection
      if (this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), CONFIG.RECONNECT_DELAY);
      }
    });

    this.wsRef.on('error', (error) => {
      console.error('OpenAI WebSocket error:', error);
      this.clientWs.send(JSON.stringify({
        type: 'error',
        message: `OpenAI connection error: ${error.message}`
      }));
    });
  }

  send(message) {
    if (this.wsRef?.readyState === WebSocket.OPEN) {
      this.wsRef.send(message);
    } else {
      throw new Error('OpenAI WebSocket is not connected');
    }
  }

  disconnect() {
    if (this.wsRef) {
      this.wsRef.close();
      this.wsRef = null;
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = Date.now();
  console.log(`Client connected (ID: ${clientId})`);
  
  let connectionManager = null;
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to WebSocket proxy for OpenAI'
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received from client ${clientId}:`, data.type);
      
      if (data.type === 'connect') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'OpenAI API key is not configured'
          }));
          return;
        }
        
        // Create or reset connection manager
        if (connectionManager) {
          connectionManager.disconnect();
        }
        connectionManager = new OpenAIConnectionManager(ws, apiKey);
        
        // Connect with specified or default options
        connectionManager.connect({
          model: data.model || CONFIG.DEFAULT_MODEL,
          voice: data.voice || CONFIG.DEFAULT_VOICE
        });
      }
      else if (data.type === 'play_sample') {
        if (!connectionManager) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Not connected to OpenAI'
          }));
          return;
        }
        
        const samplePath = path.join(__dirname, 'public', 'harvard.wav');
        console.log(`Reading sample file from: ${samplePath}`);
        
        // Encode the audio file to base64
        const base64Audio = encodeAudioFileToBase64(samplePath);
        console.log({base64Audio})
        
        if (!base64Audio) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to read sample audio file'
          }));
          return;
        }
        
        try {
          connectionManager.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
          
          connectionManager.send(JSON.stringify({
            type: 'input_audio_buffer.commit'
          }));
          
          connectionManager.send(JSON.stringify({
            type: 'response.create'
          }));
          
          ws.send(JSON.stringify({
            type: 'system',
            message: 'Sample audio sent to OpenAI'
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to send audio: ${error.message}`
          }));
        }
      }
      else if (connectionManager) {
        // Forward other messages to OpenAI
        try {
          connectionManager.send(message.toString());
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Message forwarding error: ${error.message}`
          }));
        }
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
        message: `Error processing message: ${error instanceof Error ? error.message : String(error)}`
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected (ID: ${clientId})`);
    if (connectionManager) {
      connectionManager.disconnect();
    }
  });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});