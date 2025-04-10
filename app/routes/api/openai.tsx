
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import OpenAI from 'openai'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const APIRoute = createAPIFileRoute('/api/openai')({
  POST: async ({ request }) => {
    try {
      // Check if API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return json({ error: 'OpenAI API key is not configured' }, { status: 500 })
      }
      
      // Get request body
      const body = await request.json()
      const userMessage = body.message || "Hello, OpenAI!"
      
      // Make API call to OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: userMessage }
        ],
        max_tokens: 100
      });
      
      // Return the response
      return json({ 
        message: completion.choices[0].message.content,
        model: completion.model,
        usage: completion.usage
      })
    } catch (error) {
      console.error('Error calling OpenAI API:', error)
      return json({ 
        error: 'Failed to get response from OpenAI API',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 })
    }
  }
})