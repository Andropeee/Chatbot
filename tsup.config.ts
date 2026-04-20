import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { chatbot: 'components/widget-entry.tsx' },
  outDir: 'public',
  format: ['iife'],
  platform: 'browser',
  target: 'es2017',
  bundle: true,
  minify: true,
  sourcemap: false,
  clean: false, // don't wipe public/ — other assets live there
  outExtension() {
    return { js: '.js' } // output as chatbot.js, not chatbot.global.js
  },
  esbuildOptions(options) {
    // Resolve the @ path alias used in the project
    options.alias = { '@': '.' }
  },
})
