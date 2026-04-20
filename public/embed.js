/**
 * 5elements Sports — Chat Widget Loader
 * ─────────────────────────────────────
 * Add to WordPress via Appearance → Customise → Additional JavaScript
 * OR any "Custom HTML" block / footer code plugin.
 *
 *   <script src="https://YOUR-VERCEL-URL.vercel.app/embed.js" async></script>
 *
 * Replace YOUR-VERCEL-URL with your actual Vercel deployment URL.
 * No iframe — the widget is injected directly into the page DOM.
 */
;(function () {
  'use strict'

  // Prevent double-load
  if (document.getElementById('fiveelements-chat-root')) return

  // Derive the bot's base URL from this script's own src — no hardcoding needed
  var scripts = document.querySelectorAll('script[src*="embed.js"]')
  var scriptEl = scripts[scripts.length - 1]
  var BOT_ORIGIN = scriptEl
    ? new URL(scriptEl.src).origin
    : 'https://YOUR-VERCEL-URL.vercel.app'

  // Expose the API base URL so the React bundle can call the right domain
  window.__FIVEELEMENTS_API_BASE__ = BOT_ORIGIN

  // Load the self-contained React widget bundle
  var script = document.createElement('script')
  script.src = BOT_ORIGIN + '/chatbot.js'
  script.async = true
  document.body.appendChild(script)
})()
