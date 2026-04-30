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
 *
 * Forward match  (product field directly contains the query term): full score.
 * Reverse match  (query term contains a product-field token — used for German
 *                 compound words, e.g. "handschuhe" ⊂ "lederhandschuhe"):
 *                 reduced score so broad-name products don't dominate.
 *
 * Category matching uses token-exact logic: each category is split on
 * whitespace / "/" / "&" so that e.g. "KICKBOXEN/MUAYTHAI" becomes
 * ["kickboxen","muaythai"] and never wrongly matches the term "boxen".
 */
function scoreProduct(product: Product, queryTerms: string[]): number {
  const nameLower = product.name.toLowerCase()
  const descLower = (product.description ?? '').toLowerCase()
  const tagLower  = (product.tags ?? []).join(' ').toLowerCase()
  const skuLower  = (product.sku ?? '').toLowerCase()

  // Split each category into individual tokens (handles "KICKBOXEN/MUAYTHAI", "A & B", …)
  const catTokens = (product.categories ?? [])
    .join(' ')
    .toLowerCase()
    .split(/[\s\/&;,]+/)
    .filter(w => w.length > 0)

  // Flatten all attribute values into one searchable string
  const attrValues = Object.values(product.attributes ?? {}).flat().join(' ').toLowerCase()

  let score = 0

  for (const term of queryTerms) {
    if (term.length < 2) continue

    // Expand to colour synonyms so "rosa" matches "pink" etc.
    const variants = expandTerm(term)

    for (const v of variants) {
      if (v.length < 2) continue

      // ── Attributes ────────────────────────────────────────────────────────
      const attrFwd = attrValues.includes(v)
      const attrRev = attrValues.split(/\s+/).some(w => w.length >= 5 && v.includes(w))
      if (attrFwd) score += 5
      else if (attrRev) score += 2

      // ── Name ──────────────────────────────────────────────────────────────
      // Forward: product name contains the query term verbatim           → +4
      // Reverse: query term contains a product-name token (compound match) → +1
      //          (minimum token length 5 to avoid short noise like "hand")
      const nameFwd = nameLower.includes(v)
      const nameRev = !nameFwd && nameLower.split(/[\s\-]+/).some(w => w.length >= 5 && v.includes(w))
      if (nameFwd) score += 4
      else if (nameRev) score += 1

      // ── Categories (token-exact) ───────────────────────────────────────────
      // Forward: a category token equals the query term exactly           → +2
      // Reverse: query term contains a category token (compound match)   → +1
      //          (minimum token length 5, same reason as above)
      const catFwd = catTokens.some(w => w === v)
      const catRev = !catFwd && catTokens.some(w => w.length >= 5 && v.includes(w))
      if (catFwd) score += 2
      else if (catRev) score += 1

      // ── Tags ──────────────────────────────────────────────────────────────
      const tagFwd = tagLower.includes(v)
      const tagRev = !tagFwd && tagLower.split(/\s+/).some(w => w.length >= 5 && v.includes(w))
      if (tagFwd) score += 2
      else if (tagRev) score += 1

      // ── Description ───────────────────────────────────────────────────────
      const descFwd = descLower.includes(v)
      const descRev = !descFwd && descLower.split(/\s+/).some(w => w.length >= 5 && v.includes(w))
      if (descFwd) score += 1
      else if (descRev) score += 1
    }

    if (skuLower === term) score += 3
  }

  // Bonus: in-stock products rank higher
  if (product.stock_status === 'instock') score += 1

  return score
}

/** Parse a price string like "75,63 €" → 75.63, or Infinity when unknown/zero. */
export function parsePrice(priceStr?: string): number {
  if (!priceStr) return Infinity
  const numeric = parseFloat(priceStr.replace(/[^\d,]/g, '').replace(',', '.'))
  if (isNaN(numeric) || numeric === 0) return Infinity
  return numeric
}

// Map WooCommerce category display names to their URL slugs
const CATEGORY_SLUGS: Record<string, string> = {
  'Boxhandschuhe':                    'boxhandschuhe',
  'MMA Handschuhe':                   'mma-handschuhe',
  'Sandsackhandschuhe':               'sandsackhandschuhe',
  'Kopfschutz':                       'kopfschutz',
  'Schienbeinschutz':                 'schienbeinschutz',
  'Pratzen':                          'pratzen',
  'Bandagen':                         'bandagen',
  'Mundschutz':                       'mundschutz',
  'Tiefschutz':                       'tiefschutz',
  'MMA':                              'mma',
  'BOXEN':                            'boxen',
  'KICKBOXEN/MUAYTHAI':               'kickboxen-muaythai',
  'HANDSCHUHE':                       'handschuhe',
  'KARATE':                           'karate',
  'JUDO':                             'judo',
  'JU-JUTSU':                         'ju-jutsu',
  'TAEKWONDO':                        'taekwondo',
  'KUNGFU':                           'kungfu',
  'GRAPPLING':                        'grappling',
  'Hosen':                            'hosen',
  'BEKLEIDUNG':                       'bekleidung',
  'Casual':                           'casual',
  'Sandsack':                         'sandsack',
  'Boden/Matten':                     'boden-matten',
  'MMA Kompression':                  'mma-kompression',
  'Pointfight handschuhe':            'pointfight-handschuhe',
  'Pointfight/Semi Contact':          'pointfight-semi-contact',
  'Taekwondo und Karate Handschuhe':  'taekwondo-und-karate-handschuhe',
  'PRATZEN & AUSRÜSTUNG FÜR KAMPFSPORTSTUDIOS': 'pratzen-ausruestung-fuer-kampfsportstudios',
  'Zubehör':                          'zubehor',
  'ZUBEHÖR':                          'zubehor',
}

/** Build the WooCommerce category page URL for a given category name. */
export function getCategoryUrl(categoryName: string): string {
  const slug = CATEGORY_SLUGS[categoryName]
    ?? categoryName
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  return `https://5elements-sports.com/product-category/${slug}/`
}

/**
 * Get the most specific/relevant category from a list of matched products.
 * Prefers mixed-case specific sub-categories (e.g., "Boxhandschuhe") over
 * broad all-caps parent categories (e.g., "BOXEN").
 */
export function getPrimaryCategory(products: Product[]): string | null {
  const catCounts = new Map<string, number>()
  for (const p of products) {
    for (const cat of p.categories ?? []) {
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1)
    }
  }
  if (!catCounts.size) return null

  // Prefer mixed-case specific categories, then sort by count descending
  const sorted = Array.from(catCounts.entries()).sort((a, b) => {
    const aSpecific = a[0] !== a[0].toUpperCase()
    const bSpecific = b[0] !== b[0].toUpperCase()
    if (aSpecific && !bSpecific) return -1
    if (!aSpecific && bSpecific) return 1
    return b[1] - a[1]
  })

  return sorted[0]?.[0] ?? null
}

/**
 * Search products by free-text query.
 * Returns up to `k` results: candidates are ranked by relevance score,
 * then sorted cheapest-first (products with unknown/zero price come last).
 */
/**
 * Known German sport-vocabulary stems, sorted longest-first for greedy matching.
 * Used to split compound query words like "Kinderboxhandschuhe" → ["kinder","boxhandschuh"].
 */
const DE_STEMS: string[] = [
  'schienbeinschutz', 'schutzausrüstung', 'kampfsport',
  'boxhandschuh', 'sandsackhandschuh', 'mmahandschuh',
  'kopfschutz', 'mundschutz', 'tiefschutz',
  'handschuh', 'sandsack', 'bandage', 'pratzen',
  'kickboxen', 'muaythai', 'karate', 'taekwondo', 'jujutsu',
  'schutz', 'leder', 'kunstleder', 'kinder', 'profi', 'sport', 'kampf',
].sort((a, b) => b.length - a.length)

/**
 * Attempt to split a German compound word into known sub-stems.
 * e.g. "kinderboxhandschuhe" → ["kinder", "boxhandschuh"]
 *      "lederboxhandschuh"   → ["leder", "boxhandschuh"]
 *      "lederhandschuhe"     → ["leder", "handschuh"]
 * Returns the original term unchanged if no decomposition is found.
 */
function decompound(term: string): string[] {
  const parts: string[] = []
  let remaining = term

  while (remaining.length >= 3) {
    let matched = false
    for (const stem of DE_STEMS) {
      if (remaining.startsWith(stem)) {
        parts.push(stem)
        remaining = remaining.slice(stem.length)
        // strip plural/inflection glue between stems (e.g. "s", "e", "en")
        remaining = remaining.replace(/^(s|e|en|es|n)(?=[a-z]{3})/, '')
        matched = true
        break
      }
    }
    if (!matched) break
  }

  return parts.length > 1 ? parts.filter(p => p.length >= 3) : [term]
}

/**
 * Search products by free-text query.
 * Returns up to `k` results: candidates are ranked by relevance score,
 * then sorted cheapest-first (products with unknown/zero price come last).
 */
export function searchProducts(query: string, k = 5): Product[] {
  const products = loadProducts()

  if (!products.length) return []

  // Tokenise: lowercase, split on spaces/hyphens/punctuation, remove stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'do', 'you', 'have', 'i', 'we',
    'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'with',
    'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'ich', 'wir',
    'sie', 'er', 'es', 'hat', 'haben', 'habt', 'auf', 'für', 'und', 'mit',
    'ihr', 'bitte', 'noch', 'auch', 'gibt', 'mal', 'doch', 'ja', 'ne',
  ])

  const rawTerms = query
    .toLowerCase()
    .split(/[\s,?!.;:\-]+/)           // ← hyphens also split now
    .filter((t) => t.length >= 2 && !stopWords.has(t))

  // Expand each token: try German de-compounding for long compound words
  const queryTerms = rawTerms.flatMap(t => t.length >= 8 ? decompound(t) : [t])

  // Take a broader pool of candidates (3× k), then sort cheapest-first
  const poolSize = Math.max(k * 3, 15)
  const scored = products
    .map((p) => ({ product: p, score: scoreProduct(p, queryTerms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, poolSize)
    .sort((a, b) => parsePrice(a.product.price) - parsePrice(b.product.price))
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
    const parsedPrice = parsePrice(p.price)
    const price = isFinite(parsedPrice) ? ` — ${p.price}` : ''
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
