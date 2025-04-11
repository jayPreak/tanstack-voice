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
  
  // Check if OpenAI API is configured
  useEffect(() => {
    fetch('/api/openai')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setStatus(`Error: ${data.error}`)
        } else {
          setStatus('Ready to connect')
        }
      })
      .catch(err => {
        setStatus(`Error checking API: ${err.message}`)
      })
  }, [])
  

  const connectWebSocket = async () => {
    console.log("hii")
    try {
      setStatus('Connecting to WebSocket proxy...')
      
      // Connect to our local WebSocket proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      console.log({protocol})
      const wsUrl = `${protocol}//${window.location.host}/ws/openai`

      console.log({wsUrl})
      
      // Create WebSocket connection
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      
      ws.onopen = () => {
        setStatus('Connected to proxy, initializing OpenAI...')
        
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
          if (data.type === 'openai.connected') {
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
          else if (data.type === 'error') {
            setStatus(`Error: ${data.message}`)
          }
          // Handle other event types
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      }
      
      // Rest of the function remains the same
    } catch (error) {
      console.error('Error connecting:', error)
      setStatus(`Connection error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // Start recording from microphone
  const startListening = async () => {
    if (!isConnected) {
      await connectWebSocket()
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
          
          // Send to OpenAI
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
    console.log("hi")
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
        justifyContent: 'center'
      }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={!isConnected && isListening}
          style={{
            width: '200px',
            height: '200px',
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
      </div>
    </div>
  )
}