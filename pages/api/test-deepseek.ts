import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not set' })
  }

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
        temperature: 0,
      }),
    })

    const text = await response.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = null }

    return res.status(200).json({
      http_status: response.status,
      http_ok: response.ok,
      raw_body: text.slice(0, 500),
      parsed,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
