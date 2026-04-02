/**
 * LangGraph-style agent for 5elements chatbot.
 *
 * Pipeline:  retrieve → classify → answer | escalate
 *
 * Uses DeepSeek (€0 via OpenAI-compatible API) for LLM calls.
 * Product retrieval uses keyword search from data/products.json (no embeddings needed).
 *
 * Designed to run inside Vercel API routes (Node.js runtime).
 */

import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages'
import { searchProducts, formatProductContext } from './search'

// ════════════════════════════════════════════════════
// LLM SETUP — DeepSeek via OpenAI-compatible endpoint
// ════════════════════════════════════════════════════

function createLLM() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set')

  return new ChatOpenAI({
    modelName: 'deepseek-chat',
    openAIApiKey: apiKey,
    configuration: {
      baseURL: 'https://api.deepseek.com/v1',
    },
    temperature: 0.7,
    maxTokens: 1000,
  })
}

// ════════════════════════════════════════════════════
// AGENT STATE
// ════════════════════════════════════════════════════

interface AgentState {
  messages: BaseMessage[]
  retrieved_context: string
  is_sales_inquiry: boolean
  language: 'en' | 'de'
  customer_name: string
  customer_phone: string
}

// ════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ════════════════════════════════════════════════════

export function detect_language(text: string): 'en' | 'de' {
  // Definitive: German umlauts
  if (/[äöüÄÖÜß]/.test(text)) return 'de'

  const textLower = text.toLowerCase()

  const germanKeywords = [
    'habt', 'gibt', 'haben', 'größe', 'preis', 'bitte', 'danke',
    'ist', 'sind', 'kaufen', 'bestellen', 'versand', 'lieferung',
    'produkten', 'handschuhe', 'kickboxen', 'karate', 'boxen',
  ]
  const englishKeywords = [
    'do you', 'have', 'what', 'size', 'price', 'please', 'thank',
    'shipping', 'delivery', 'buy', 'order', 'gloves', 'boxing',
    'kickboxing', 'karate',
  ]

  const deCount = germanKeywords.filter((kw) => textLower.includes(kw)).length
  const enCount = englishKeywords.filter((kw) => textLower.includes(kw)).length

  return deCount >= enCount ? 'de' : 'en'
}

// ════════════════════════════════════════════════════
// NODE 1: RETRIEVE
// ════════════════════════════════════════════════════

function retrieveNode(state: AgentState): Partial<AgentState> {
  const lastMessage = state.messages[state.messages.length - 1].content as string
  const products = searchProducts(lastMessage, 5)
  const context = formatProductContext(products, state.language)
  return { retrieved_context: context }
}

// ════════════════════════════════════════════════════
// NODE 2: CLASSIFY
// ════════════════════════════════════════════════════

const ESCALATION_TRIGGERS: Record<'en' | 'de', string[]> = {
  en: [
    'bulk order', 'bulk purchase', 'discount', 'wholesale',
    'corporate', 'custom branding', 'custom logo', 'partnership',
    'reseller', 'distributor', 'dropship', 'franchise',
    'negotiate', 'payment terms', 'net terms', 'credit',
    'sponsorship', 'agency', 'wholesale price', 'samples',
    'large order', 'volume order',
  ],
  de: [
    'großbestellung', 'großkauf', 'rabatt', 'großhandel',
    'corporate', 'custom branding', 'logo', 'partnerschaft',
    'reseller', 'distributor', 'dropship', 'franchise',
    'verhandeln', 'zahlungsziel', 'kreditlinie', 'sponsoring',
    'agentur', 'großhandelspreis', 'muster', 'mustermenge',
    'großkunde', 'mengenrabatt',
  ],
}

function classifyNode(state: AgentState): Partial<AgentState> {
  const lastMessage = (
    state.messages[state.messages.length - 1].content as string
  ).toLowerCase()

  const triggers = ESCALATION_TRIGGERS[state.language] ?? ESCALATION_TRIGGERS.en
  const isSalesInquiry = triggers.some((t) => lastMessage.includes(t))

  return { is_sales_inquiry: isSalesInquiry }
}

// ════════════════════════════════════════════════════
// NODE 3: ANSWER PRODUCT QUESTION
// ════════════════════════════════════════════════════

async function answerNode(
  state: AgentState,
  llm: ChatOpenAI
): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1].content as string
  const context = state.retrieved_context
  const lang = state.language

  let systemPrompt: string

  if (lang === 'de') {
    systemPrompt = `Du bist ein hilfreicher Kundenservice-Chatbot für 5elements-sports.com, einen deutschen Kampfsport-Shop.
Du sprichst fließend Deutsch und bist freundlich und professionell.

Verfügbare Produkte:
${context}

Antworte kurz und hilfreich auf Deutsch (max 150 Wörter).
Wenn Produktlinks enthalten sind, zeige sie deutlich und separat.
Wenn keine passenden Produkte gefunden wurden, entschuldige dich höflich.`
  } else {
    systemPrompt = `You are a helpful customer service chatbot for 5elements-sports.com, a German martial arts shop.
You are friendly and professional.

Available products:
${context}

Answer briefly and helpfully in English (max 150 words).
If product URLs are included, display them clearly and on separate lines.
If no matching products were found, apologise politely.`
  }

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(lastMessage),
  ])

  const newMessages = [
    ...state.messages,
    new AIMessage(response.content as string),
  ]

  return { messages: newMessages }
}

// ════════════════════════════════════════════════════
// NODE 4: ESCALATE BUSINESS INQUIRY
// ════════════════════════════════════════════════════

function escalateNode(state: AgentState): Partial<AgentState> {
  const lang = state.language

  const msg =
    lang === 'de'
      ? `Vielen Dank für dein Interesse! 🙌

Dies ist eine spezielle Anfrage, die unser Team persönlich bearbeitet.
Unser Kundenservice-Team wird sich bald bei dir melden.

Damit wir schneller antworten können, teile bitte:
• Deinen Namen
• Deine E-Mail-Adresse
• Deine Telefonnummer`
      : `Thank you for your interest! 🙌

This is a special request that our team handles personally.
Our support team will reach out to you shortly.

To help us respond faster, please share:
• Your name
• Your email address
• Your phone number`

  const newMessages = [...state.messages, new AIMessage(msg)]
  return { messages: newMessages, is_sales_inquiry: true }
}

// ════════════════════════════════════════════════════
// AGENT PIPELINE
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

  let state: AgentState = {
    messages: [new HumanMessage(input.message)],
    retrieved_context: '',
    is_sales_inquiry: false,
    language,
    customer_name: input.customer_name ?? '',
    customer_phone: input.customer_phone ?? '',
  }

  // Step 1: Retrieve products
  Object.assign(state, retrieveNode(state))

  // Step 2: Classify
  Object.assign(state, classifyNode(state))

  // Step 3: Answer or escalate
  if (state.is_sales_inquiry) {
    Object.assign(state, escalateNode(state))
  } else {
    const llm = createLLM()
    Object.assign(state, await answerNode(state, llm))
  }

  const lastMessage = state.messages[state.messages.length - 1]
  const response =
    typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content)

  return {
    response,
    is_escalated: state.is_sales_inquiry,
    language,
  }
}
