'use client'

import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import toast, { Toaster } from 'react-hot-toast'

// ════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════

type Language = 'en' | 'de'

interface Message {
  id: string
  role: 'user' | 'bot'
  content: string
  timestamp: Date
  language: Language
}

interface ContactInfo {
  name: string
  email: string
  phone: string
}

// ════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════

function detectLanguage(text: string): Language {
  if (/[äöüÄÖÜß]/.test(text)) return 'de'
  const lower = text.toLowerCase()
  const deHits = ['habt', 'gibt', 'haben', 'preis', 'bitte', 'danke', 'kaufen',
    'handschuhe', 'kickboxen', 'boxen', 'karate', 'versand', 'wie', 'was', 'ich',
    'nicht', 'auch', 'mit', 'nach', 'beim', 'sind', 'wird', 'kann', 'welche', 'welcher',
    'wo', 'finde', 'produkte', 'produkt', 'kontakt', 'kontaktieren', 'suche', 'suchen',
    'zeig', 'zeige', 'zeigen', 'gibt es', 'habt ihr', 'kostet', 'kosten', 'verfügbar',
    'verfuegbar', 'lieferung', 'liefern', 'bestellen', 'bestellung', 'shop', 'artikel',
    'empfehlen', 'empfehlung', 'für', 'fuer', 'mich', 'mir', 'dein', 'euer', 'eure']
    .filter((w) => lower.includes(w)).length
  const enHits = ['do you', 'have', 'what', 'size', 'price', 'please', 'thank',
    'buy', 'order', 'gloves', 'boxing', 'shipping']
    .filter((w) => lower.includes(w)).length
  return deHits >= enHits ? 'de' : 'en'
}

/** Render message text, making URLs clickable */
function MessageContent({ text, role }: { text: string; role: 'user' | 'bot' }) {
  if (role === 'user') {
    return <p className="text-sm whitespace-pre-wrap">{text}</p>
  }

  // Remove link emojis and collapse newlines before URLs so links stay inline
  // eslint-disable-next-line no-misleading-character-class
  const cleanText = text
    .replace(/[\uD800-\uDFFF]/g, '') // strip surrogate pairs (emoji)
    .replace(/\s*\n+\s*(https?:\/\/)/g, ' $1') // newline before URL -> space
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = cleanText.split(urlRegex)

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Chat Widget
// ════════════════════════════════════════════════════

const INITIAL_MESSAGE: Message = {
  id: '0',
  role: 'bot',
  content:
    'Hallo! 👋 Wie kann ich dir helfen?\n\nFrag mich nach Boxhandschuhen, MMA-Ausrüstung, Schutzausrüstung und mehr!',
  timestamp: new Date(),
  language: 'de',
}

export function ChatWidget({ apiBase = '' }: { apiBase?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState<Language>('de')
  const [showContactForm, setShowContactForm] = useState(false)
  const [contact, setContact] = useState<ContactInfo>({ name: '', email: '', phone: '' })
  const [contactSubmitted, setContactSubmitted] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showContactForm])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const detectedLang = detectLanguage(text)
    setLanguage(detectedLang)
    setInput('')
    setLoading(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      language: detectedLang,
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const { data } = await axios.post(`${apiBase}/api/chat`, {
        message: text,
        customer_name: contact.name || undefined,
        customer_email: contact.email || undefined,
        customer_phone: contact.phone || undefined,
        language: detectedLang,
      })

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: data.response,
        timestamp: new Date(),
        language: data.language ?? detectedLang,
      }
      setMessages((prev) => [...prev, botMsg])

      if (data.ask_for_contact && !contactSubmitted) {
        setShowContactForm(true)
      }
    } catch {
      const errMsg =
        detectedLang === 'de'
          ? 'Fehler beim Senden. Bitte versuche es erneut.'
          : 'Error sending message. Please try again.'
      toast.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleContactSubmit = () => {
    if (!contact.name && !contact.email && !contact.phone) {
      const msg = language === 'de' ? 'Bitte mindestens ein Feld ausfüllen.' : 'Please fill in at least one field.'
      toast.error(msg)
      return
    }
    setContactSubmitted(true)
    setShowContactForm(false)

    const confirmMsg: Message = {
      id: Date.now().toString(),
      role: 'bot',
      content:
        language === 'de'
          ? '✅ Danke! Unser Team meldet sich in Kürze bei dir.'
          : '✅ Thank you! Our team will be in touch shortly.',
      timestamp: new Date(),
      language,
    }
    setMessages((prev) => [...prev, confirmMsg])
  }

  // ── Closed state: floating button ──────────────────────────────────────

  if (!isOpen) {
    return (
      <>
        <Toaster position="bottom-left" />
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 w-16 h-16 hover:scale-110 transition-transform focus:outline-none drop-shadow-lg"
          style={{ zIndex: 2147483647, pointerEvents: 'auto', background: 'none', border: 'none', padding: 0 }}
          aria-label="Open chat"
          title="Chat with 5elements Support"
        >
          <img
            src={`${typeof window !== 'undefined' && (window as Window & { __FIVEELEMENTS_API_BASE__?: string }).__FIVEELEMENTS_API_BASE__ || ''}/chat-bubble.png`}
            alt="5elements Support Chat"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </button>
      </>
    )
  }

  // ── Open state: chat panel ──────────────────────────────────────────────

  return (
    <>
      <Toaster position="bottom-left" />

      <div
        role="dialog"
        aria-label="5elements Support Chat"
        className="chat-widget fixed bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        style={{ zIndex: 2147483647, pointerEvents: 'auto' }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="bg-[#0d0d0d] text-white p-4 rounded-t-2xl flex justify-between items-start flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 overflow-hidden p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${apiBase}/logotype.png`} alt="5elements logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">5elements Support</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {language === 'de'
                  ? 'KI-gestützt · Sofortige Antworten · 24/7'
                  : 'AI-powered · Instant answers · 24/7'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white text-xl leading-none ml-2 focus:outline-none transition-colors"
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>

        {/* ── Message list ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#E63B3B] text-white rounded-br-sm'
                    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                }`}
              >
                <MessageContent text={msg.content} role={msg.role} />
                <span className={`text-xs mt-1 block ${msg.role === 'user' ? 'text-red-200' : 'text-gray-400'}`}>
                  {msg.timestamp.toLocaleTimeString(msg.language === 'de' ? 'de-DE' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex space-x-1 items-center h-4">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-[#E63B3B] rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Contact form (only shown when escalated) ────────────── */}
        {showContactForm && !contactSubmitted && (
          <div className="bg-gray-900 border-t border-gray-700 p-3 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-300 mb-2">
              {language === 'de' ? '📬 Deine Kontaktdaten:' : '📬 Your contact info:'}
            </p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={language === 'de' ? 'Name' : 'Name'}
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:border-[#E63B3B]"
              />
              <input
                type="email"
                placeholder={language === 'de' ? 'E-Mail' : 'Email'}
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:border-[#E63B3B]"
              />
              <input
                type="tel"
                placeholder={language === 'de' ? 'Telefon' : 'Phone'}
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:border-[#E63B3B]"
              />
              <button
                onClick={handleContactSubmit}
                className="w-full bg-[#E63B3B] hover:bg-[#C42F2F] text-white py-2 rounded-lg text-sm font-semibold transition"
              >
                {language === 'de' ? 'Absenden ✓' : 'Submit ✓'}
              </button>
            </div>
          </div>
        )}

        {/* ── Input bar ─────────────────────────────────────────── */}
        <div className="bg-white border-t border-gray-200 p-3 rounded-b-2xl flex-shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder={
                language === 'de'
                  ? 'Frag nach Produkten…'
                  : 'Ask about products…'
              }
              disabled={loading}
              maxLength={2000}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:border-[#E63B3B] text-sm disabled:bg-gray-100"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-[#E63B3B] hover:bg-[#C42F2F] disabled:bg-gray-300 text-white px-3 py-2 rounded-xl transition font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-[#E63B3B]"
              aria-label="Send message"
            >
              {loading ? '⏳' : '➤'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            {language === 'de'
              ? '💬 Kostenlos · 🔒 Privat · ⚡ Sofort'
              : '💬 Free · 🔒 Private · ⚡ Instant'}
          </p>
        </div>
      </div>
    </>
  )
}
