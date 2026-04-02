/**
 * Product search utility — BM25-style keyword scoring.
 * Loaded at runtime from data/products.json (no embedding API needed → €0 cost).
 * Replaces Chroma on Vercel where file persistence is not available.
 */

import path from 'path'
import fs from 'fs'

export interface Product {
  id?: string | number
  name: string
  type?: string
  description?: string
  price?: string
  regular_price?: string
  sale_price?: string
  categories?: string[]
  tags?: string[]
  sku?: string
  stock_status?: string
  url?: string
  image_url?: string
  /** All attribute options on the parent product, e.g. { "Farbe": ["Schwarz","Rosa"], "Größe": ["8oz","10oz"] } */
  attributes?: Record<string, string[]>
  /** Individual variation combos, e.g. [{"Farbe":"Rosa","Größe":"10oz"}, …] */
  variations?: Record<string, string>[]
  synced_at?: string
  // legacy field kept for backwards compat
  scraped_at?: string
}

interface ProductData {
  products: Product[]
  metadata?: {
    total_products: number
    synced_at?: string
    scraped_at?: string
  }
}

/**
 * German ↔ synonym expansions so "rosa" also matches "pink" and vice-versa.
 * Keys are the canonical German terms; values are all aliases (including the key itself).
 */
const COLOR_SYNONYMS: Record<string, string[]> = {
  rosa:    ['rosa', 'pink', 'rose'],
  rot:     ['rot', 'red', 'rouge'],
  blau:    ['blau', 'blue', 'bleu'],
  schwarz: ['schwarz', 'black', 'noir'],
  weiß:    ['weiß', 'weiss', 'white', 'blanc'],
  grün:    ['grün', 'grun', 'green', 'vert'],
  gelb:    ['gelb', 'yellow', 'jaune'],
  silber:  ['silber', 'silver', 'argent'],
  gold:    ['gold', 'golden'],
  grau:    ['grau', 'gray', 'grey'],
}

/** Expand a single query term into itself + any colour synonyms. */
function expandTerm(term: string): string[] {
  const expanded = new Set([term])
  for (const aliases of Object.values(COLOR_SYNONYMS)) {
    if (aliases.includes(term)) {
      aliases.forEach((a) => expanded.add(a))
    }
  }
  return Array.from(expanded)
}

// Cache loaded products in module scope (reused across warm function instances)
let _cachedProducts: Product[] | null = null

export function loadProducts(): Product[] {
  if (_cachedProducts) return _cachedProducts

  try {
    const filePath = path.join(process.cwd(), 'data', 'products.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed: ProductData = JSON.parse(raw)
    _cachedProducts = parsed.products ?? []
  } catch {
    // File doesn't exist yet (before first sync) — return empty list
    _cachedProducts = []
  }

  return _cachedProducts
}

/** Reload products from disk (call after re-syncing) */
export function reloadProducts(): Product[] {
  _cachedProducts = null
  return loadProducts()
}

/**
 * Score a product against a query using keyword overlap.
 * Weights: attribute match (colour/size) > name > category > description.
 */
function scoreProduct(product: Product, queryTerms: string[]): number {
  const nameLower = product.name.toLowerCase()
  const descLower = (product.description ?? '').toLowerCase()
  const catLower = (product.categories ?? []).join(' ').toLowerCase()
  const tagLower = (product.tags ?? []).join(' ').toLowerCase()
  const skuLower = (product.sku ?? '').toLowerCase()

  // Flatten all attribute values into one searchable string
  const attrValues = Object.values(product.attributes ?? {}).flat().join(' ').toLowerCase()

  let score = 0

  for (const term of queryTerms) {
    if (term.length < 2) continue

    // Expand to colour synonyms so "rosa" matches "pink" etc.
    const variants = expandTerm(term)

    for (const v of variants) {
      if (attrValues.includes(v)) score += 5   // colour/size match — highest weight
      if (nameLower.includes(v))  score += 4
      if (catLower.includes(v))   score += 2
      if (tagLower.includes(v))   score += 2
      if (descLower.includes(v))  score += 1
    }

    if (skuLower === term) score += 3
  }

  // Bonus: in-stock products rank higher
  if (product.stock_status === 'instock') score += 1

  return score
}

/**
 * Search products by free-text query. Returns up to `k` results.
 */
export function searchProducts(query: string, k = 5): Product[] {
  const products = loadProducts()

  if (!products.length) return []

  // Tokenise: lowercase, split on spaces/punctuation, remove stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'do', 'you', 'have', 'i', 'we',
    'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'with',
    'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'ich', 'wir',
    'sie', 'er', 'es', 'hat', 'haben', 'auf', 'für', 'und', 'mit',
  ])

  const queryTerms = query
    .toLowerCase()
    .split(/[\s,?!.;:]+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t))

  const scored = products
    .map((p) => ({ product: p, score: scoreProduct(p, queryTerms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.product)

  return scored
}

/**
 * Format search results as a readable context string including product URLs.
 */
export function formatProductContext(products: Product[], language: 'en' | 'de'): string {
  if (!products.length) {
    return language === 'de'
      ? 'Keine passenden Produkte gefunden.'
      : 'No matching products found.'
  }

  const header = language === 'de' ? 'Gefundene Produkte:\n\n' : 'Found products:\n\n'

  const lines = products.map((p) => {
    const price = p.price ? ` — ${p.price}` : ''
    const url = p.url ? `\n  🔗 ${p.url}` : ''

    const attrLines: string[] = []
    if (p.attributes) {
      for (const [attrName, options] of Object.entries(p.attributes)) {
        if (options.length) {
          attrLines.push(`  ${attrName}: ${options.join(', ')}`)
        }
      }
    }
    const attrBlock = attrLines.length ? '\n' + attrLines.join('\n') : ''

    return `• ${p.name}${price}${attrBlock}${url}`
  })

  return header + lines.join('\n\n')
}
