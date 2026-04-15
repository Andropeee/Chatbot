/**
 * 5elements Sports — Chat Widget Loader
 * ─────────────────────────────────────
 * Add this to WordPress via Appearance → Customise → Additional JavaScript
 * OR via any "Custom HTML" block / footer code plugin.
 *
 * ONE LINE TO PASTE:
 *   <script src="https://YOUR-VERCEL-URL.vercel.app/embed.js" async></script>
 *
 * Replace YOUR-VERCEL-URL with your actual Vercel deployment URL.
 */
;(function () {
  'use strict'

  // ── Config ──────────────────────────────────────────────────────────────
  // This file is served from Vercel, so we derive the bot's base URL from
  // the script's own src attribute — no hardcoding needed.
  var scripts = document.querySelectorAll('script[src*="embed.js"]')
  var scriptEl = scripts[scripts.length - 1]
  var BOT_ORIGIN = scriptEl
    ? new URL(scriptEl.src).origin
    : 'https://YOUR-VERCEL-URL.vercel.app' // fallback if loaded inline

  var WIDGET_URL = BOT_ORIGIN + '/widget'

  // ── Prevent double-load ─────────────────────────────────────────────────
  if (document.getElementById('fiveelements-chat-iframe')) return

  // ── Create iframe ───────────────────────────────────────────────────────
  var iframe = document.createElement('iframe')
  iframe.id = 'fiveelements-chat-iframe'
  iframe.src = WIDGET_URL
  iframe.title = '5elements Support Chat'
  iframe.setAttribute('aria-label', '5elements Support Chat')

  // Position fixed in the bottom-right corner; the widget manages its own
  // open/close state, so we size the iframe to cover the full viewport and
  // keep it transparent while closed.
  Object.assign(iframe.style, {
    position:       'fixed',
    bottom:         '0',
    right:          '0',
    width:          '100%',
    height:         '100%',
    border:         'none',
    zIndex:         '2147483647', // max z-index
    pointerEvents:  'none',       // click-through when chat is closed
    background:     'transparent',
    overflow:       'hidden',
  })

  // Allow the iframe to detect clicks when the widget is open.
  // The widget posts a message to the parent when it opens/closes.
  window.addEventListener('message', function (event) {
    if (event.origin !== BOT_ORIGIN) return
    if (event.data === 'chat:open')  iframe.style.pointerEvents = 'all'
    if (event.data === 'chat:close') iframe.style.pointerEvents = 'none'
  })

  document.body.appendChild(iframe)
})()
