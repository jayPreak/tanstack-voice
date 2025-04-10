// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: OpenAITest,
})

function OpenAITest() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const callOpenAI = async () => {
    setLoading(true)
    setError(null)
    setResponse(null)
    
    try {
      const res = await fetch('/api/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Unknown error occurred')
      }
      
      setResponse(data.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to call OpenAI API')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>OpenAI API Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter a message to send to OpenAI..."
          style={{ 
            width: '100%', 
            padding: '10px',
            height: '100px',
            marginBottom: '10px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        
        <button
          onClick={callOpenAI}
          disabled={loading || !message.trim()}
          style={{
            padding: '10px 15px',
            backgroundColor: loading ? '#cccccc' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Sending...' : 'Send to OpenAI'}
        </button>
      </div>
      
      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#ffdddd',
          borderRadius: '4px',
          marginBottom: '20px' 
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {response && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f0f7ff',
          borderRadius: '4px',
          border: '1px solid #d0e3ff'
        }}>
          <h3>OpenAI Response:</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{response}</p>
        </div>
      )}
    </div>
  )
}