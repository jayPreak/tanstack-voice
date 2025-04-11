// app/routes/api/openai.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/openai')({
  GET: async ({ request }) => {
    // Check if we have an API key configured
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return json({ error: 'OpenAI API key is not configured' }, { status: 500 })
    }
    
    return json({ 
      ready: true,
      message: 'OpenAI API key is configured and ready to use'
    })
  }
})