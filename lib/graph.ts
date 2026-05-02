/**
 * Lightweight agent for 5elements chatbot.
 * Calls DeepSeek API directly via fetch — no LangChain, no cold-start timeout.
 *
 * Pipeline: retrieve -> classify -> answer | escalate
 */

import { searchProducts, formatProductContext, getPrimaryCategory, getCategoryUrl } from './search'
import { searchFaq, formatFaqContext } from './faq'

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
      max_tokens: 700,
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

  // Step 1: Retrieve matching products and FAQ entries
  const products = searchProducts(input.message, 8)
  const context = formatProductContext(products, language)
  const faqEntries = searchFaq(input.message, 3)
  const faqContext = formatFaqContext(faqEntries, language)

  // Build category link from matched products
  const primaryCategory = getPrimaryCategory(products)
  const categoryUrl = primaryCategory ? getCategoryUrl(primaryCategory) : null
  const categoryLine = language === 'de'
    ? (categoryUrl ? `\nWeitere Artikel in dieser Kategorie finden Sie unter: ${categoryUrl}` : '')
    : (categoryUrl ? `\nMore products in this category: ${categoryUrl}` : '')

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
  const faqSection = faqContext ? `

${faqContext}` : ''

  const systemPrompt = language === 'de'
    ? `Du bist ein freundlicher Kundenservice-Chatbot fuer 5elements-sports.com (Kampfsport-Shop).
Antworte auf Deutsch, kurz und hilfreich (max 180 Woerter).
WICHTIG: Nenne NUR URLs, die EXAKT in der Produktliste unten stehen. Erfinde KEINE URLs ausser dem Kategorie-Link am Ende.
Wenn Produkte gefunden wurden:
- Liste MINDESTENS 3 Produkte auf (oder alle verfuegbaren, falls weniger als 3 gefunden wurden). Die Produkte sind bereits nach Relevanz sortiert (teure und relevante Produkte zuerst).
- Zeige NUR Produkte, die zum Material/Typ der Anfrage passen. Wenn der Kunde nach "Leder" fragt, zeige KEINE Produkte mit nur "Kunstleder" in der Beschreibung.
- Schreibe die URL direkt hinter den Produktnamen in derselben Zeile, KEIN Zeilenumbruch und KEIN Emoji vor der URL. Beispiel: 5Elements Handschuh https://5elements-sports.com/product/...
- Fuege am Ende der Antwort folgende Zeile hinzu (exakt so): "${categoryLine.trim()}"
Wenn keine passenden Produkte gefunden wurden, sage ehrlich, dass du es nicht genau weisst, und empfehle dem Kunden, direkt auf https://5elements-sports.com/shop/ zu schauen oder den Kontakt aufzunehmen.${faqSection}

Verfuegbare Produkte (relevanteste zuerst):
${context}`
    : `You are a friendly customer service chatbot for 5elements-sports.com (martial arts shop).
Answer in English, briefly and helpfully (max 180 words).
IMPORTANT: Only ever include URLs that appear EXACTLY in the product list below. Never invent URLs except the category link at the end.
If products were found:
- List AT LEAST 3 products (or all available if fewer than 3 were found). Products are sorted by relevance.
- Only show products that match the material/type the customer asked for. If they ask for "Leder" (genuine leather), do NOT show products described as "Kunstleder" (synthetic leather).
- Write the URL directly after the product name on the same line, NO line break and NO emoji before the URL. Example: 5Elements Glove https://5elements-sports.com/product/...
- At the end of your answer add this line (exactly): "${categoryLine.trim()}"
If no matching products were found, honestly say you are not sure and recommend the customer browse https://5elements-sports.com/shop/ or get in touch.${faqSection}

Available products (most relevant first):
${context}`

  const response = await callDeepSeek(systemPrompt, input.message)
  return { response, is_escalated: false, language }
}
