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
  description?: string
  price?: string
  categories?: string[]
  sku?: string
  stock_status?: string
  url?: string
  scraped_at?: string
}

interface ProductData {
  products: Product[]
  metadata?: {
    total_products: number
    scraped_at: string
  }
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
    // File doesn't exist yet (before scraping) — return empty list
    _cachedProducts = []
  }

  return _cachedProducts
}

/** Reload products from disk (call after re-indexing) */
export function reloadProducts(): Product[] {
  _cachedProducts = null
  return loadProducts()
}

/**
 * Score a product against a query using keyword overlap.
 * Weights: exact product name match > category match > description match.
 */
function scoreProduct(product: Product, queryTerms: string[]): number {
  const nameLower = product.name.toLowerCase()
  const descLower = (product.description ?? '').toLowerCase()
  const catLower = (product.categories ?? []).join(' ').toLowerCase()
  const skuLower = (product.sku ?? '').toLowerCase()

  let score = 0

  for (const term of queryTerms) {
    if (term.length < 2) continue

    if (nameLower.includes(term)) score += 4
    if (catLower.includes(term)) score += 2
    if (descLower.includes(term)) score += 1
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
    return `• ${p.name}${price}${url}`
  })

  return header + lines.join('\n')
}
