/** Tailwind config scoped to the chat widget only */
module.exports = {
  content: ['./components/ChatWidget.tsx'],
  // Scope every utility to #fiveelements-chat-root so nothing leaks onto the host page
  important: '#fiveelements-chat-root',
  theme: { extend: {} },
  plugins: [],
}
