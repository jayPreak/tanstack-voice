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
  timestamp: Date;
}

function VoiceChat() {
  const [status, setStatus] = useState('Ready')
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [currentAudio, setCurrentAudio] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState(0)
  
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const audioChunksRef = useRef<ArrayBuffer[]>([])
  
  useEffect(() => {
    // Create audio element for playing responses
    const audioEl = new Audio();
    audioEl.onended = () => {
      setCurrentAudio(null);
      setAudioProgress(0);
    };
    audioEl.ontimeupdate = () => {
      if (audioEl.duration) {
        setAudioProgress((audioEl.currentTime / audioEl.duration) * 100);
      }
    };
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
        console.log({event})
        try {
          const data = JSON.parse(event.data)
          console.log('Received:', data.type)
          
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
          else if (data.type === 'response.audio.delta') {
            // Handle audio response from OpenAI
            if (data.delta) {
              try {
                // Convert base64 to an audio buffer
                const audioData = atob(data.delta);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                  view[i] = audioData.charCodeAt(i);
                }
                
                // Store the audio chunk
                audioChunksRef.current.push(arrayBuffer);
                
                // If this is the first chunk, add a message for the assistant
                if (audioChunksRef.current.length === 1) {
                  setMessages(prev => [
                    ...prev, 
                    { 
                      role: 'assistant', 
                      content: '🔊 Voice Response',
                      timestamp: new Date()
                    }
                  ]);
                }
              } catch (error) {
                console.error('Error processing audio chunk:', error);
              }
            }
          }
          else if (data.type === 'response.audio.done') {
            // When audio is complete, combine all chunks and create a playable URL
            if (audioChunksRef.current.length > 0) {
              const combinedBuffer = new Blob(audioChunksRef.current, { type: 'audio/wav' });
              const audioUrl = URL.createObjectURL(combinedBuffer);
              
              // Update the assistant's message with the audio URL
              setMessages(prev => {
                const newMessages = [...prev];
                const lastAssistantIndex = [...newMessages].reverse().findIndex(m => m.role === 'assistant');
                if (lastAssistantIndex !== -1) {
                  const actualIndex = newMessages.length - 1 - lastAssistantIndex;
                  newMessages[actualIndex] = {
                    ...newMessages[actualIndex],
                    audioUrl: audioUrl
                  };
                }
                return newMessages;
              });
              
              // Reset audio chunks for next response
              audioChunksRef.current = [];
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
    
    // For sample audio, we'll just use a placeholder UI element
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: '🎤 Sample: harvard.wav',
      audioUrl: '/harvard.wav', // This is the actual path to your sample file
      timestamp: new Date()
    }])
    
    // Request to play the sample audio file
    wsRef.current.send(JSON.stringify({
      type: 'play_sample',
      filename: 'harvard.wav' // Specify the filename to the server
    }))
  }
  
  // Play recorded audio
  const playAudio = (url: string) => {
    if (!audioPlayerRef.current) return;
    
    if (currentAudio === url) {
      // If the same audio is playing, stop it
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setCurrentAudio(null);
      setAudioProgress(0);
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
          
          // Reset the OpenAI audio chunks before sending new audio
          audioChunksRef.current = [];
          
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
        if (msg.audioUrl && !msg.audioUrl.startsWith('/')) {
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
              margin: '12px 0',
              padding: '12px',
              borderRadius: '12px',
              maxWidth: '80%',
              backgroundColor: msg.role === 'user' ? '#DCF8C6' : '#EAEAEA', // WhatsApp-style colors
              marginLeft: msg.role === 'user' ? 'auto' : '0',
              marginRight: msg.role === 'assistant' ? 'auto' : '0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>{msg.content}</div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => playAudio(msg.audioUrl!)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: currentAudio === msg.audioUrl ? '#f44336' : '#0B93F6',
                      color: 'white',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    {currentAudio === msg.audioUrl ? '■' : '▶'}
                  </button>
                  
                  <div style={{ 
                    flex: 1, 
                    position: 'relative',
                  }}>
                    {/* Background track */}
                    <div style={{
                      height: '4px',
                      backgroundColor: '#E0E0E0',
                      borderRadius: '2px',
                      width: '100%'
                    }}></div>
                    
                    {/* Progress overlay */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '4px',
                      width: `${currentAudio === msg.audioUrl ? audioProgress : 0}%`,
                      backgroundColor: '#0B93F6',
                      borderRadius: '2px',
                      transition: 'width 0.1s linear'
                    }}></div>
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