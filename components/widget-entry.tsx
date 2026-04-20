/**
 * Widget bundle entry point.
 * Compiled by tsup → public/chatbot.js
 * Loaded by public/embed.js on the client's website (no iframe).
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatWidget } from './ChatWidget'

;(function () {
  const w = window as Window & { __FIVEELEMENTS_API_BASE__?: string }
  const apiBase: string = w.__FIVEELEMENTS_API_BASE__ ?? ''

  // Inject widget CSS (compiled Tailwind — served from same Vercel origin)
  if (apiBase && !document.getElementById('fiveelements-chat-css')) {
    const link = document.createElement('link')
    link.id = 'fiveelements-chat-css'
    link.rel = 'stylesheet'
    link.href = `${apiBase}/chatbot.css`
    document.head.appendChild(link)
  }

  // Find or create mount point
  let container = document.getElementById('fiveelements-chat-root')
  if (!container) {
    container = document.createElement('div')
    container.id = 'fiveelements-chat-root'
    document.body.appendChild(container)
  }

  // Ensure the container never blocks page clicks but always sits above
  // WordPress / Elementor overlays (which can reach z-index ~99999).
  // pointer-events:none on the wrapper lets the widget children handle their
  // own pointer events via the explicit pointer-events:auto on the button/panel.
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '0',
    right: '0',
    width: '0',
    height: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  })

  createRoot(container).render(
    <React.StrictMode>
      <ChatWidget apiBase={apiBase} />
    </React.StrictMode>
  )
})()
