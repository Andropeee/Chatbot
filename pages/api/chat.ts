import type { NextApiRequest, NextApiResponse } from 'next'
import { agent, detect_language } from '@/lib/graph'
import { sendEscalationEmail } from '@/lib/email'

interface ChatRequest {
  message: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  language?: 'en' | 'de'
}

interface ChatResponse {
  response: string
  escalated: boolean
  ask_for_contact: boolean
  language: 'en' | 'de'
}

interface ErrorResponse {
  error: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    message,
    customer_name,
    customer_email,
    customer_phone,
    language: userLanguage,
  } = (req.body ?? {}) as ChatRequest

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  // Sanitise inputs to prevent prompt injection
  const safeMessage = message.slice(0, 2000).trim()
  const safeName = customer_name?.slice(0, 200).trim()
  const safeEmail = customer_email?.slice(0, 200).trim()
  const safePhone = customer_phone?.slice(0, 50).trim()

  try {
    const language = userLanguage ?? detect_language(safeMessage)

    const result = await agent({
      message: safeMessage,
      language,
      customer_name: safeName,
      customer_phone: safePhone,
    })

    // Fire escalation email only when the agent flagged it
    if (result.is_escalated) {
      // Run in background — do not block the response
      sendEscalationEmail({
        customer_message: safeMessage,
        customer_name: safeName,
        customer_email: safeEmail,
        customer_phone: safePhone,
        language: result.language,
      }).catch((err) => console.error('[api/chat] email error:', err))
    }

    return res.status(200).json({
      response: result.response,
      escalated: result.is_escalated,
      ask_for_contact: result.is_escalated,
      language: result.language,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/chat] error:', message)
    // Return the real error message in non-production so it surfaces in Vercel logs
    return res.status(500).json({ error: message })
  }
}
