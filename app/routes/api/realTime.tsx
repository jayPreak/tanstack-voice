import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/realTime')({
  GET: ({ request, params }) => {
    console.log(process.env.OPENAI_API_KEY)
    return json({ message: 'Hello "/api/realTime"!' })
  },
})
