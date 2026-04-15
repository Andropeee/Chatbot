/**
 * /widget — standalone page served inside an iframe on the client's website.
 * The ChatWidget is rendered full-screen here; embed.js injects the iframe.
 * API calls are relative so they always hit the same Vercel deployment.
 */
import Head from 'next/head'
import { ChatWidget } from '@/components/ChatWidget'

export default function WidgetPage() {
  return (
    <>
      <Head>
        <title>5elements Support</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {/* Transparent background — the widget floats over whatever is behind it */}
      <div style={{ background: 'transparent', width: '100%', height: '100%' }}>
        <ChatWidget />
      </div>
    </>
  )
}
