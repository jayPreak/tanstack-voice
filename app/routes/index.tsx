// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'

export const Route = createFileRoute('/')({
  component: WebSocketTest,
})


function WebSocketTest() {
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState('Disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  const sendPlay = () => {
    wsRef.current?.send(JSON.stringify({
      type: "play_sample",
      filename: "harvard.wav"
    }));
  }

  const connect = () => {
    setStatus('Connecting...');
    
    // Create WebSocket connection
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;
    
    // Connection opened
    ws.onopen = () => {
      setStatus('Connected! Sending sample request...');
      
      // Send the sample message
      
    };
    
    // Listen for messages
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log({data});
        console.log("fuck")
        
        // Display the payload if it's a media event
        if (data.event === 'media' && data.media && data.media.payload) {
          setResponse(data.media.payload);
          setStatus('Received media payload!');
        }
        else if (data.type === 'message') {
          console.log("WHAT")
          setResponse(data.message);
          setStatus('Received text message!');
        }
        else if (data.type === 'system') {
          // console.log(data.message)
          setResponse(data.message);
          setStatus('Received system message!');
        }
        else {
          setResponse(`Other data received: ${JSON.stringify(data)}`);
          setStatus('Received data');
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        setStatus('Error parsing response');
      }
    };
    
    // Handle errors
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Connection error');
    };
    
    // Handle connection close
    ws.onclose = () => {
      setStatus('Disconnected');
    };
  };

  console.log({response})
  
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '40px auto', 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center'
    }}>
      <h1>WebSocket Sample Audio Test</h1>
      
      <div style={{ margin: '20px 0' }}>
        <p>Status: <strong>{status}</strong></p>
      </div>
      
      <button
        onClick={connect}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          margin: '20px 0'
        }}
      >
        Connect
      </button>

      <button
        onClick={sendPlay}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          margin: '20px 0'
        }}
      >
        Play Sample
      </button>
      
      {response && (
        <div style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          border: '1px solid #ddd',
          textAlign: 'left',
          wordBreak: 'break-all'
        }}>
          <h3>Received Payload:</h3>
          <p style={{ fontSize: '14px', maxHeight: '300px', overflowY: 'auto' }}>
            {response}
          </p>
        </div>
      )}
    </div>
  );
}