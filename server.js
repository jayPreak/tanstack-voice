// server.js - Minimal OpenAI Realtime WebSocket server
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
// Your OpenAI API key - replace with your actual key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
console.log({OPENAI_API_KEY})

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server started on port 8080');

// Single session for simplicity
let session = {
  frontendConn: null,
  openaiConn: null,
  isConnecting: false
};

// Handle new connections from frontend
wss.on('connection', (ws) => {
  console.log('Frontend client connected');
  
  // Store frontend connection
  session.frontendConn = ws;
  
  // Send initial system message
  jsonSend(ws, {
    type: 'system',
    message: 'Connected to WebSocket server'
  });
  
  // Handle messages from frontend
  ws.on('message', handleFrontendMessage);
  
  // Handle frontend disconnection
  ws.on('close', () => {
    console.log('Frontend client disconnected');
    session.frontendConn = null;
    
    // Clean up OpenAI connection if frontend disconnects
    if (session.openaiConn) {
      session.openaiConn.close();
      session.openaiConn = null;
    }
  });
  
  ws.on('error', (error) => {
    console.error('Frontend connection error:', error);
    session.frontendConn = null;
    
    // Clean up OpenAI connection on error
    if (session.openaiConn) {
      session.openaiConn.close();
      session.openaiConn = null;
    }
  });
});

// Handle messages from frontend
function handleFrontendMessage(data) {
  try {
    const message = JSON.parse(data.toString());
    console.log(`Received from frontend:`, message.type);
    
    // Handle different message types
    switch (message.type) {
      case 'connect':
        connectToOpenAI(message.model || '4o-mini-realtime', message.voice || 'alloy');
        break;
        
      case 'play_sample':
        if (!session.openaiConn || !isOpen(session.openaiConn)) {
          console.log('No active OpenAI connection, connecting first...');
          connectToOpenAI('4o-mini-realtime', 'alloy', () => {
            sendSampleAudio(message.filename || 'harvard.wav');
          });
        } else {
          // Already connected, just send sample
          sendSampleAudio(message.filename || 'harvard.wav');
        }
        break;
        
      default:
        // Forward anything else to OpenAI
        if (session.openaiConn && isOpen(session.openaiConn)) {
          session.openaiConn.send(data.toString());
        } else {
          console.log(`Cannot forward message: No active OpenAI connection`);
        }
    }
  } catch (error) {
    console.error('Error processing frontend message:', error);
  }
}

// Connect to OpenAI Realtime API
function connectToOpenAI(model, voice, callback) {
  if (session.isConnecting) {
    console.log('Already connecting to OpenAI, ignoring duplicate request');
    return;
  }
  
  // Clean up existing connection if any
  if (session.openaiConn) {
    session.openaiConn.close();
    session.openaiConn = null;
  }
  
  session.isConnecting = true;
  
  // Notify frontend
  if (session.frontendConn && isOpen(session.frontendConn)) {
    jsonSend(session.frontendConn, {
      type: 'system',
      message: 'Connecting to OpenAI...'
    });
  }
  
  console.log(`Connecting to OpenAI with model: ${model}, voice: ${voice}`);
  
  try {
    // Connect to OpenAI WebSocket
    const openaiConn = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        }
      }
    );
    
    // Handle OpenAI connection open
    openaiConn.on('open', () => {
      console.log('Connected to OpenAI WebSocket');
      session.openaiConn = openaiConn;
      session.isConnecting = false;
      
      // Initialize session with OpenAI
      jsonSend(openaiConn, {
        type: 'session.update',
        session: {
          modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        voice: "ash",
        input_audio_transcription: { model: "whisper-1" },
          input_audio_format: "pcm16",
          output_audio_format: "pcm16"
        },
        // model: model,
        // voice: voice
      });
      
      // Notify frontend
      if (session.frontendConn && isOpen(session.frontendConn)) {
        jsonSend(session.frontendConn, {
          type: 'openai.connected',
          // model: model,
          // voice: voice
        });
        
        // Send session created message
        jsonSend(session.frontendConn, {
          type: 'session.created'
        });
      }
      
      // Execute callback if provided
      if (callback && typeof callback === 'function') {
        callback();
      }
    });
    
    // Handle messages from OpenAI
    openaiConn.on('message', (data) => {
      // Forward all OpenAI messages to frontend
      // if (session.frontendConn && isOpen(session.frontendConn)) {
      //   session.frontendConn.send(data.toString());
      // }
      
      // Log non-audio message types (to avoid console flooding)
      try {
        const message = JSON.parse(data.toString());
        if (message.type !== 'response.audio.delta') {
          console.log("fuck")
          console.log({message})
          console.log(`OpenAI event:`, message.type);
          console.log(message.content)
        } else {
          console.log("hiii")

        }
      } catch (error) {
        // Ignore parsing errors
      }
    });
    
    // Handle OpenAI connection close
    openaiConn.on('close', () => {
      console.log('OpenAI WebSocket closed');
      session.openaiConn = null;
      session.isConnecting = false;
      
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
      session.isConnecting = false;
      
      if (session.frontendConn && isOpen(session.frontendConn)) {
        jsonSend(session.frontendConn, {
          type: 'error',
          message: `OpenAI error: ${error.message}`
        });
      }
    });
  } catch (error) {
    console.error('Error creating OpenAI connection:', error);
    session.isConnecting = false;
    
    if (session.frontendConn && isOpen(session.frontendConn)) {
      jsonSend(session.frontendConn, {
        type: 'error',
        message: `Connection error: ${error.message}`
      });
    }
  }
}

// Send sample audio to OpenAI
function sendSampleAudio(filename) {
  if (!session.openaiConn || !isOpen(session.openaiConn)) {
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
            // type: "input_audio",
            type: "input_text",
            // audio: base64Audio,
            text: "Hiiii can you please respond to this I like peanut butter a lot :D"
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
  if (session.openaiConn) {
    session.openaiConn.close();
    session.openaiConn = null;
  }
  
  if (session.frontendConn) {
    session.frontendConn.close();
    session.frontendConn = null;
  }
  
  // Close server
  wss.close(() => {
    console.log('Server shutdown complete');
    process.exit(0);
  });
});