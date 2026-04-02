import Head from 'next/head'
import { ChatWidget } from '@/components/ChatWidget'

export default function Home() {
  return (
    <>
      <Head>
        <title>5elements Sports — Martial Arts Equipment</title>
        <meta name="description" content="AI-powered customer support for 5elements-sports.com" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 flex items-center justify-center">
        {/* Demo page — in production this widget is embedded on 5elements-sports.com */}
        <div className="text-center text-white px-6">
          <div className="text-6xl mb-6">🥊</div>
          <h1 className="text-4xl font-bold mb-3">5elements Sports</h1>
          <p className="text-blue-200 text-lg mb-8 max-w-md mx-auto">
            AI-powered customer support. Ask about boxing gloves, MMA gear, protective equipment and more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-sm">
            {[
              { icon: '🌍', title: 'Multilingual', desc: 'German & English auto-detected' },
              { icon: '⚡', title: 'Instant', desc: 'Product answers in seconds' },
              { icon: '🔗', title: 'Direct Links', desc: 'Clickable product URLs included' },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20"
              >
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-semibold">{f.title}</div>
                <div className="text-blue-200 text-xs mt-1">{f.desc}</div>
              </div>
            ))}
          </div>

          <p className="text-blue-300 text-sm mt-10">
            👉 Click the chat button in the bottom-right corner to start
          </p>
        </div>

        {/* The chat widget — fixed position, always visible */}
        <ChatWidget />
      </main>
    </>
  )
}
