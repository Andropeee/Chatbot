/**
 * Lightweight agent for 5elements chatbot.
 * Calls DeepSeek API directly via fetch — no LangChain, no cold-start timeout.
 *
 * Pipeline: retrieve -> classify -> answer | escalate
 */

import { searchProducts, formatProductContext } from './search'

// ════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ════════════════════════════════════════════════════

export function detect_language(text: string): 'en' | 'de' {
  if (/[äöüÄÖÜß]/.test(text)) return 'de'
  const lower = text.toLowerCase()
  const deHits = ['habt', 'gibt', 'haben', 'preis', 'bitte', 'danke', 'kaufen',
    'handschuhe', 'kickboxen', 'boxen', 'karate', 'versand']
    .filter(w => lower.includes(w)).length
  const enHits = ['do you', 'have', 'what', 'size', 'price', 'please', 'thank',
    'buy', 'order', 'gloves', 'boxing', 'shipping']
    .filter(w => lower.includes(w)).length
  return deHits >= enHits ? 'de' : 'en'
}

// ════════════════════════════════════════════════════
// ESCALATION KEYWORDS
// ════════════════════════════════════════════════════

const ESCALATION_TRIGGERS: Record<'en' | 'de', string[]> = {
  en: [
    'bulk order', 'bulk purchase', 'wholesale', 'corporate', 'custom branding',
    'custom logo', 'partnership', 'reseller', 'distributor', 'dropship',
    'franchise', 'negotiate', 'payment terms', 'net terms', 'credit',
    'sponsorship', 'wholesale price', 'large order', 'volume order',
  ],
  de: [
    'grossbestellung', 'grosshandel', 'corporate', 'custom branding',
    'partnerschaft', 'reseller', 'distributor', 'dropship', 'franchise',
    'verhandeln', 'zahlungsziel', 'kreditlinie', 'sponsoring', 'agentur',
    'grosshandelspreis', 'grosskunde', 'mengenrabatt',
  ],
}

function isEscalation(message: string, language: 'en' | 'de'): boolean {
  const lower = message.toLowerCase()
  return ESCALATION_TRIGGERS[language].some(t => lower.includes(t))
}

// ════════════════════════════════════════════════════
// DEEPSEEK API — direct fetch, no LangChain
// ════════════════════════════════════════════════════

async function callDeepSeek(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set')

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? 'No response from AI.'
}

// ════════════════════════════════════════════════════
// AGENT
// ════════════════════════════════════════════════════

export interface AgentResult {
  response: string
  is_escalated: boolean
  language: 'en' | 'de'
}

export async function agent(input: {
  message: string
  language?: 'en' | 'de'
  customer_name?: string
  customer_phone?: string
}): Promise<AgentResult> {
  const language = input.language ?? detect_language(input.message)

  // Step 1: Retrieve matching products
  const products = searchProducts(input.message, 5)
  const context = formatProductContext(products, language)

  // Step 2: Classify
  const escalated = isEscalation(input.message, language)

  // Step 3a: Business inquiry — canned response, no LLM needed
  if (escalated) {
    const msg = language === 'de'
      ? 'Vielen Dank fuer dein Interesse!\n\nDies ist eine spezielle Anfrage, die unser Team persoenlich bearbeitet. Wir melden uns bald bei dir.\n\nTeile bitte deine Kontaktdaten:\n- Name\n- E-Mail\n- Telefonnummer'
      : 'Thank you for your interest!\n\nThis is a special request our team handles personally. We will reach out to you shortly.\n\nPlease share your contact info:\n- Name\n- Email\n- Phone number'
    return { response: msg, is_escalated: true, language }
  }

  // Step 3b: Answer product question via DeepSeek
  const systemPrompt = language === 'de'
    ? `Du bist ein freundlicher Kundenservice-Chatbot fuer 5elements-sports.com (Kampfsport-Shop).\nAntworte auf Deutsch, kurz und hilfreich (max 120 Woerter).\nZeige Produktlinks deutlich auf separaten Zeilen.\nWenn keine Produkte gefunden wurden, entschuldige dich hoeflich.\n\nVerfuegbare Produkte:\n${context}`
    : `You are a friendly customer service chatbot for 5elements-sports.com (martial arts shop).\nAnswer in English, briefly and helpfully (max 120 words).\nShow product URLs clearly on separate lines.\nIf no products found, apologise politely.\n\nAvailable products:\n${context}`

  const response = await callDeepSeek(systemPrompt, input.message)
  return { response, is_escalated: false, language }
}
