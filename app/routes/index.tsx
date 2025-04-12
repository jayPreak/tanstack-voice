// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'

export const Route = createFileRoute('/')({
  component: VoiceChat,
})

function VoiceChat() {
  const [status, setStatus] = useState('Ready')
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([])
  
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  
  useEffect(() => {
    // Create audio element for playing responses
    if (!audioPlayerRef.current) {
      const audioEl = new Audio();
      audioEl.autoplay = false;
      audioPlayerRef.current = audioEl;
    }
    
    setStatus('Ready to connect to WebSocket server')
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
                newMessages.push({ role: 'assistant', content: data.delta.text })
              }
              return newMessages
            })
          }
          else if (data.type === 'response.audio.delta') {
            // Handle audio response from OpenAI
            if (data.delta && audioPlayerRef.current) {
              try {
                // Convert base64 to an audio blob
                const audioData = atob(data.delta);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                  view[i] = audioData.charCodeAt(i);
                }
                const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
                const url = URL.createObjectURL(blob);
                
                // Play the audio
                audioPlayerRef.current.src = url;
                audioPlayerRef.current.play();
              } catch (error) {
                console.error('Error playing audio:', error);
              }
            }
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
    
    // Add a sample message to the UI
    setMessages(prev => [...prev, { role: 'user', content: '🎤 [Sample Audio]' }])
    
    // Request to play the sample audio file
    wsRef.current.send(JSON.stringify({
      type: 'play_sample'
    }))
  }
  
  // Start recording from microphone
  const startListening = async () => {
    if (!isConnected) {
      await connectWebSocket()
      return
    }
    
    try {
      setStatus('Getting microphone access...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Initialize AudioContext for audio processing
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      
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
        
        // Convert blob to base64
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          const base64Audio = reader.result as string
          // Remove the data URL prefix (data:audio/webm;base64,)
          const base64Data = base64Audio.split(',')[1]
          
          // Add message to UI
          setMessages(prev => [...prev, { role: 'user', content: '🎤 [Audio Message]' }])
          
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
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      
      // Clean up audio element
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
    }
  }, [])
  
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
            <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong> {msg.content}
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
        
        {/* New Sample Audio Button */}
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