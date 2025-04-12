// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'

export const Route = createFileRoute('/')({
  component: VoiceChat,
})

interface Message {
  role: string;
  content: string;
  audioUrl?: string;
  isPlaying?: boolean;
  timestamp: Date;
}

function VoiceChat() {
  const [status, setStatus] = useState('Ready')
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [currentAudio, setCurrentAudio] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  
  useEffect(() => {
    // Create audio element for playing responses
    const audioEl = new Audio();
    audioEl.onended = () => setCurrentAudio(null);
    audioPlayerRef.current = audioEl;
    
    return () => {
      audioEl.pause();
      audioEl.src = '';
    }
  }, [])
  
  const connectWebSocket = async () => {
    try {
      setStatus('Connecting to WebSocket server...')
      
      // Connect to the standalone WebSocket server at localhost:8080
      const wsUrl = 'ws://localhost:8080'
      console.log('Connecting to:', wsUrl)
      
      // Create WebSocket connection
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      
      ws.onopen = () => {
        setStatus('Connected to WebSocket server, initializing OpenAI...')
        
        // Request connection to OpenAI
        ws.send(JSON.stringify({
          type: 'connect',
          model: '4o-mini-realtime',
          voice: 'alloy'
        }))
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Received:', data)
          
          // Handle different event types
          if (data.type === 'system') {
            setStatus(data.message)
          }
          else if (data.type === 'openai.connected') {
            setIsConnected(true)
            setStatus('Connected to OpenAI')
          }
          else if (data.type === 'session.created' || data.type === 'session.updated') {
            setStatus('Session initialized')
          }
          else if (data.type === 'response.text.delta') {
            // Update the latest message with new text
            setMessages(prev => {
              const newMessages = [...prev]
              if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                newMessages[newMessages.length - 1].content += data.delta.text
              } else {
                newMessages.push({ 
                  role: 'assistant', 
                  content: data.delta.text,
                  timestamp: new Date()
                })
              }
              return newMessages
            })
          }
          else if (data.type === 'error') {
            setStatus(`Error: ${data.message}`)
          }
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      }
      
      ws.onclose = () => {
        setIsConnected(false)
        setStatus('Disconnected from WebSocket server')
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setStatus('WebSocket connection error')
      }
    } catch (error) {
      console.error('Error connecting:', error)
      setStatus(`Connection error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  // Function to send sample audio file
  const playSampleAudio = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isConnected) {
      setStatus('Please connect to OpenAI first')
      return
    }
    
    setStatus('Sending sample audio file...')
    
    // For sample audio, we'll just use a placeholder UI element
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: '🎤 Sample: harvard.wav',
      audioUrl: '/harvard.wav', // This is the actual path to your sample file
      timestamp: new Date()
    }])
    
    // Request to play the sample audio file
    wsRef.current.send(JSON.stringify({
      type: 'play_sample'
    }))
  }
  
  // Play recorded audio
  const playAudio = (url) => {
    if (!audioPlayerRef.current) return;
    
    if (currentAudio === url) {
      // If the same audio is playing, stop it
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setCurrentAudio(null);
    } else {
      // Stop any currently playing audio
      if (currentAudio) {
        audioPlayerRef.current.pause();
      }
      
      // Play the selected audio
      audioPlayerRef.current.src = url;
      audioPlayerRef.current.play().catch(err => console.error('Error playing audio:', err));
      setCurrentAudio(url);
    }
  };
  
  // Start recording from microphone
  const startListening = async () => {
    if (!isConnected) {
      await connectWebSocket()
      return
    }
    
    try {
      setStatus('Getting microphone access...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      
      // Collect audio data
      const audioChunks: Blob[] = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }
      
      // Send audio data when available
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        const audioUrl = URL.createObjectURL(audioBlob)
        
        // Convert blob to base64
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          const base64Audio = reader.result as string
          // Remove the data URL prefix (data:audio/webm;base64,)
          const base64Data = base64Audio.split(',')[1]
          
          // Add message to UI with playable audio
          setMessages(prev => [...prev, { 
            role: 'user', 
            content: '🎤 Audio Message',
            audioUrl: audioUrl,
            timestamp: new Date()
          }])
          
          // Send to WebSocket server
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Data
            }))
            
            // Commit the audio and request a response
            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }))
            
            wsRef.current.send(JSON.stringify({
              type: 'response.create'
            }))
          }
        }
      }
      
      // Start recording
      mediaRecorder.start(100) // Collect in 100ms chunks
      setIsListening(true)
      setStatus('Listening...')
    } catch (error) {
      console.error('Error accessing microphone:', error)
      setStatus(`Microphone error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  // Stop recording
  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      // Stop all tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
    }
    
    setIsListening(false)
    setStatus(isConnected ? 'Connected (not listening)' : 'Ready')
  }
  
  // Disconnect WebSocket
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
    }
    
    setIsConnected(false)
    setIsListening(false)
    setStatus('Disconnected')
  }
  
  // Format time for messages
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  console.log({messages})
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      }
      
      // Revoke object URLs to prevent memory leaks
      messages.forEach(msg => {
        if (msg.audioUrl && msg.audioUrl !== '#sample') {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    }
  }, [messages])
  
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>OpenAI Voice Chat</h1>
      
      <div style={{
        marginBottom: '20px',
        padding: '10px',
        backgroundColor: '#f0f0f0',
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <strong>Status:</strong> {status}
        </div>
        <div>
          {!isConnected ? (
            <button 
              onClick={connectWebSocket}
              style={{
                padding: '8px 12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Connect
            </button>
          ) : (
            <button 
              onClick={disconnect}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
      
      <div style={{
        border: '1px solid #ccc',
        height: '400px',
        overflowY: 'auto',
        marginBottom: '20px',
        padding: '10px',
        backgroundColor: '#f9f9f9',
        borderRadius: '5px'
      }}>
        {messages.map((msg, index) => (
          <div 
            key={index} 
            style={{
              margin: '8px 0',
              padding: '10px',
              borderRadius: '8px',
              maxWidth: '80%',
              backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#f1f8e9',
              marginLeft: msg.role === 'user' ? 'auto' : '0',
              marginRight: msg.role === 'assistant' ? 'auto' : '0',
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '5px', 
              fontSize: '0.8em', 
              color: '#666' 
            }}>
              <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
              <span>{formatTime(msg.timestamp)}</span>
            </div>
            
            {msg.audioUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => msg.audioUrl !== '#sample' && playAudio(msg.audioUrl)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: currentAudio === msg.audioUrl ? '#f44336' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: msg.audioUrl !== '#sample' ? 'pointer' : 'not-allowed',
                    fontSize: '16px'
                  }}
                >
                  {currentAudio === msg.audioUrl ? '■' : '▶'}
                </button>
                <div style={{ 
                  flex: 1, 
                  height: '36px', 
                  backgroundColor: '#e0e0e0',
                  borderRadius: '18px',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    height: '100%',
                    width: currentAudio === msg.audioUrl ? '100%' : '0',
                    backgroundColor: '#bbdefb',
                    transition: 'width 0.1s linear'
                  }}></div>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '15px',
                    transform: 'translateY(-50%)',
                    zIndex: 1
                  }}>
                    <span>{msg.content}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>{msg.content}</div>
            )}
          </div>
        ))}
      </div>
      
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={!isConnected && isListening}
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            backgroundColor: isListening ? '#f44336' : '#4CAF50',
            color: 'white',
            border: 'none',
            fontSize: '18px',
            cursor: isConnected || !isListening ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
          }}
        >
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </button>
        
        <button
          onClick={playSampleAudio}
          disabled={!isConnected}
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            fontSize: '18px',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
          }}
        >
          Play Sample Audio
        </button>
      </div>
    </div>
  )
}