// server.js - Minimal OpenAI Realtime WebSocket server
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

// Your OpenAI API key - replace with your actual key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server started on port 8080');

// Track active connections
const sessions = new Map();

// Handle new connections from frontend
wss.on('connection', (ws) => {
  console.log('Frontend client connected');
  
  // Create a unique session ID
  const sessionId = Date.now().toString(36);
  
  // Initialize session
  sessions.set(sessionId, {
    frontendConn: ws,
    openaiConn: null
  });
  
  // Send initial system message
  jsonSend(ws, {
    type: 'system',
    message: 'Connected to WebSocket server'
  });
  
  // Handle messages from frontend
  ws.on('message', (data) => handleFrontendMessage(sessionId, data));
  
  // Handle frontend disconnection
  ws.on('close', () => handleFrontendDisconnect(sessionId));
  ws.on('error', (error) => {
    console.error('Frontend connection error:', error);
    handleFrontendDisconnect(sessionId);
  });
});

// Handle messages from frontend
function handleFrontendMessage(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  try {
    const message = JSON.parse(data.toString());
    console.log(`Received from frontend:`, message.type);
    
    // Handle different message types
    switch (message.type) {
      case 'connect':
        connectToOpenAI(sessionId, message.model || '4o-mini-realtime', message.voice || 'alloy');
        break;
        
      case 'play_sample':
        sendSampleAudio(sessionId, message.filename || 'harvard.wav');
        break;
        
      default:
        // Forward anything else to OpenAI
        if (session.openaiConn && isOpen(session.openaiConn)) {
          session.openaiConn.send(data.toString());
        }
    }
  } catch (error) {
    console.error('Error processing frontend message:', error);
  }
}

// Connect to OpenAI Realtime API
function connectToOpenAI(sessionId, model, voice) {
  const session = sessions.get(sessionId);
  if (!session || !session.frontendConn) return;
  
  // Clean up existing connection if any
  if (session.openaiConn) {
    session.openaiConn.close();
    session.openaiConn = null;
  }
  
  // Notify frontend
  jsonSend(session.frontendConn, {
    type: 'system',
    message: 'Connecting to OpenAI...'
  });
  
  console.log(`Connecting to OpenAI with model: ${model}, voice: ${voice}`);
  
  // Connect to OpenAI WebSocket
  const openaiConn =
  new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );
  
  // Handle OpenAI connection open
  openaiConn.on('open', () => {
    console.log('Connected to OpenAI WebSocket');
    session.openaiConn = openaiConn;
    
    // Initialize session with OpenAI
    jsonSend(openaiConn, {
      type: 'session.update',
      session: {
        input_audio_format: {
          sampling_rate: 16000,
          channels: 1,
          encoding: 'pcm_f32le'
        },
        output_audio_format: {
          sampling_rate: 24000,
          channels: 1,
          encoding: 'pcm_s16le'
        }
      },
      model: model,
      voice: voice
    });
    
    // Notify frontend
    jsonSend(session.frontendConn, {
      type: 'openai.connected',
      model: model,
      voice: voice
    });
    
    // Send session created message
    jsonSend(session.frontendConn, {
      type: 'session.created'
    });
  });
  
  // Handle messages from OpenAI
  openaiConn.on('message', (data) => {
    // Forward all OpenAI messages to frontend
    if (session.frontendConn && isOpen(session.frontendConn)) {
      console.log(data.toString());
      session.frontendConn.send(data.toString());
    }
    
    // Log non-audio message types (to avoid console flooding)
    try {
      const message = JSON.parse(data.toString());
      if (message.type !== 'response.audio.delta') {
        console.log(`OpenAI event:`, message.type);
      }
    } catch (error) {
      // Ignore parsing errors
    }
  });
  
  // Handle OpenAI connection close
  openaiConn.on('close', () => {
    console.log('OpenAI WebSocket closed');
    session.openaiConn = null;
    
    if (session.frontendConn && isOpen(session.frontendConn)) {
      jsonSend(session.frontendConn, {
        type: 'system',
        message: 'Disconnected from OpenAI'
      });
    }
  });
  
  // Handle OpenAI connection error
  openaiConn.on('error', (error) => {
    console.error('OpenAI connection error:', error);
    
    if (session.frontendConn && isOpen(session.frontendConn)) {
      jsonSend(session.frontendConn, {
        type: 'error',
        message: `OpenAI error: ${error.message}`
      });
    }
  });
}

// Send sample audio to OpenAI
function sendSampleAudio(sessionId, filename) {
  // connectToOpenAI(sessionId, message.model || '4o-mini-realtime', message.voice || 'alloy');
  const session = sessions.get(sessionId);
  if (!session || !session.openaiConn || !isOpen(session.openaiConn)) {
    console.error('Cannot send sample audio: No active OpenAI connection');
    return;
  }
  
  try {
    // Construct file path
    const filePath = path.join(process.cwd(), 'public', filename);
    console.log(`Reading sample audio from ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      const error = `Sample file not found: ${filePath}`;
      console.error(error);
      
      if (session.frontendConn && isOpen(session.frontendConn)) {
        jsonSend(session.frontendConn, {
          type: 'error',
          message: error
        });
      }
      return;
    }
    
    // Read file and convert to base64
    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString('base64');
    
    console.log('Sending full audio message to OpenAI...');
    
    // Method 1: Send as a complete conversation item
    jsonSend(session.openaiConn, {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_audio",
            audio: base64Audio,
          },
        ],
      }
    });
    
    console.log('Sample audio sent to OpenAI');
    
    if (session.frontendConn && isOpen(session.frontendConn)) {
      jsonSend(session.frontendConn, {
        type: 'system',
        message: 'Sample audio sent to OpenAI'
      });
    }
  } catch (error) {
    console.error('Error sending sample audio:', error);
    
    if (session.frontendConn && isOpen(session.frontendConn)) {
      jsonSend(session.frontendConn, {
        type: 'error',
        message: `Error sending sample audio: ${error.message}`
      });
    }
  }
}

// Handle frontend disconnection
function handleFrontendDisconnect(sessionId) {
  console.log('Frontend client disconnected');
  
  const session = sessions.get(sessionId);
  if (session) {
    // Clean up OpenAI connection
    if (session.openaiConn) {
      session.openaiConn.close();
    }
    
    // Remove session
    sessions.delete(sessionId);
  }
}

// Helper: Send JSON message
function jsonSend(ws, obj) {
  if (isOpen(ws)) {
    ws.send(JSON.stringify(obj));
  }
}

// Helper: Check if WebSocket is open
function isOpen(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Close all connections
  for (const [sessionId, session] of sessions.entries()) {
    if (session.openaiConn) {
      session.openaiConn.close();
    }
    if (session.frontendConn) {
      session.frontendConn.close();
    }
  }
  
  // Clear all sessions
  sessions.clear();
  
  // Close server
  wss.close(() => {
    console.log('Server shutdown complete');
    process.exit(0);
  });
});