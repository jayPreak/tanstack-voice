import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.error('Error reading audio file:', error);
    return null;
  }
}

wss.on('connection', (ws) => {
  const clientId = Date.now();
  console.log(`Client connected (ID: ${clientId})`);
  
  let openaiWs = null;
  
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
        // Check for API key
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'OpenAI API key is not configured'
          }));
          return;
        }
        
        // Close existing connection if any
        if (openaiWs) {
          openaiWs.close();
          openaiWs = null;
        }
        
        console.log(`Connecting to OpenAI for client ${clientId}`);
        
        // Connect to OpenAI's Realtime API
        const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        
        openaiWs = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'openai-beta': 'realtime=v1'  // Add this beta header
          }
        });
        
        openaiWs.on('open', () => {
          console.log(`Connected to OpenAI for client ${clientId}`);
          ws.send(JSON.stringify({
            type: 'openai.connected'
          }));
          
          // Initialize session
          openaiWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              model: data.model || 'gpt-4o-realtime-preview-2024-12-17',
              voice: data.voice || 'alloy'
            }
          }));
        });
        
        openaiWs.on('message', (openaiMessage) => {
          // console.log(`OpenAI message received: ${openaiMessage.toString().substring(0, 100)}...`);
          console.log(`OpenAI message received: ${openaiMessage.toString()}...`);
          ws.send(openaiMessage.toString());
        });
        
        openaiWs.on('close', (code, reason) => {
          console.log(`OpenAI disconnected for client ${clientId}:`, code, reason.toString());
          ws.send(JSON.stringify({
            type: 'openai.disconnected',
            code,
            reason: reason.toString()
          }));
          openaiWs = null;
        });
        
        openaiWs.on('error', (error) => {
          console.error(`OpenAI WebSocket error for client ${clientId}:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Error in OpenAI connection: ' + error.message
          }));
        });
      }
      else if (data.type === 'play_sample') {
        // Check if we're connected to OpenAI
        if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Not connected to OpenAI'
          }));
          return;
        }
        
        // Path to sample audio file
        const samplePath = path.join(__dirname, 'public', 'harvard.wav');
        console.log(`Reading sample file from: ${samplePath}`);
        
        // Encode the audio file to base64
        const base64Audio = encodeAudioFileToBase64(samplePath);
        if (!base64Audio) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to read sample audio file'
          }));
          return;
        }
        
        console.log('Sample audio file encoded, sending to OpenAI...');
        
        // Send the audio to OpenAI
        openaiWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio
        }));
        
        // Commit the audio and request a response
        openaiWs.send(JSON.stringify({
          type: 'input_audio_buffer.commit'
        }));
        
        openaiWs.send(JSON.stringify({
          type: 'response.create'
        }));
        
        // Notify the client
        ws.send(JSON.stringify({
          type: 'system',
          message: 'Sample audio sent to OpenAI'
        }));
      }
      else if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        // Forward the message to OpenAI
        openaiWs.send(message.toString());
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
  
  ws.on('close', () => {
    console.log(`Client disconnected (ID: ${clientId})`);
    if (openaiWs) {
      openaiWs.close();
    }
  });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});