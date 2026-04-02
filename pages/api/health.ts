import type { NextApiRequest, NextApiResponse } from 'next'
import { loadProducts } from '@/lib/search'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const products = loadProducts()

  res.status(200).json({
    status: 'ok',
    deepseek_key_set: !!process.env.DEEPSEEK_API_KEY,
    resend_key_set: !!process.env.RESEND_API_KEY,
    owner_email_set: !!process.env.OWNER_EMAIL,
    products_loaded: products.length,
  })
}
