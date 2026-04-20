/**
 * FAQ search utility — keyword scoring over data/faq.json.
 * Same zero-cost, zero-dependency pattern as lib/search.ts.
 * Works on Vercel: reads the static JSON file at runtime.
 */

import path from 'path'
import fs from 'fs'

export interface FaqEntry {
  id: number
  question: string
  answer: string
}

interface FaqData {
  entries: FaqEntry[]
  metadata?: {
    source: string
    total_entries: number
    parse_strategy?: string
    indexed_at: string
  }
}

// ── Module-level cache (reused across warm Vercel function instances) ──
let _cachedFaq: FaqEntry[] | null = null

export function loadFaq(): FaqEntry[] {
  if (_cachedFaq) return _cachedFaq

  try {
    const filePath = path.join(process.cwd(), 'data', 'faq.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed: FaqData = JSON.parse(raw)
    _cachedFaq = parsed.entries ?? []
  } catch {
    // faq.json hasn't been generated yet — that's fine, FAQ context stays empty
    _cachedFaq = []
  }

  return _cachedFaq
}

/** Force a reload from disk (call after re-indexing the PDF). */
export function reloadFaq(): FaqEntry[] {
  _cachedFaq = null
  return loadFaq()
}

// ── Scoring ────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'you', 'have', 'i', 'we',
  'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'with', 'can',
  'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'ich', 'wir',
  'sie', 'er', 'es', 'hat', 'haben', 'auf', 'für', 'und', 'mit', 'kann',
])

function scoreFaqEntry(entry: FaqEntry, queryTerms: string[]): number {
  const questionLower = entry.question.toLowerCase()
  const answerLower   = entry.answer.toLowerCase()

  let score = 0
  for (const term of queryTerms) {
    if (term.length < 2) continue
    // Weight: question match > answer match
    if (questionLower.includes(term)) score += 4
    if (answerLower.includes(term))   score += 1
  }
  return score
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Search FAQ entries by free-text query. Returns up to `k` results.
 */
export function searchFaq(query: string, k = 3): FaqEntry[] {
  const entries = loadFaq()
  if (!entries.length) return []

  const queryTerms = query
    .toLowerCase()
    .split(/[\s,?!.;:()+\-/\\]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))

  return entries
    .map((e) => ({ entry: e, score: scoreFaqEntry(e, queryTerms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.entry)
}

/**
 * Format FAQ results as readable context for the LLM system prompt.
 * Returns an empty string when no relevant entries are found (no noise).
 */
export function formatFaqContext(entries: FaqEntry[], language: 'en' | 'de'): string {
  if (!entries.length) return ''

  const header = language === 'de'
    ? 'Relevante FAQ-Informationen:\n\n'
    : 'Relevant FAQ information:\n\n'

  const lines = entries.map((e) => `Q: ${e.question}\nA: ${e.answer}`)

  return header + lines.join('\n\n')
}
