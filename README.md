# 5elements Sports Chatbot

AI-powered customer support chatbot for **5elements-sports.com** — a German martial arts e-commerce shop.

**€0/month operating cost · German + English · Smart escalation · Direct product links**

---

## Features

| Feature | Detail |
|---------|--------|
| 🌍 Multilingual | Auto-detects German / English, responds in customer's language |
| ⚡ Instant answers | Product questions answered immediately with clickable links |
| 🚨 Smart escalation | Business inquiries (bulk orders, wholesale) trigger email to owner |
| 🔒 Zero noise | Owner only notified for real business leads |
| ☁️ Vercel | Frontend + backend deployed together, €0/month |

---

## Project Structure

```
├── pages/
│   ├── index.tsx          — Demo / standalone page with chat widget
│   ├── _app.tsx
│   └── api/
│       └── chat.ts        — POST /api/chat  (main API route)
├── components/
│   └── ChatWidget.tsx     — Floating chat button + panel
├── lib/
│   ├── graph.ts           — Agent pipeline (retrieve → classify → answer/escalate)
│   ├── search.ts          — Keyword-based product search from data/products.json
│   └── email.ts           — Resend email integration
├── data/
│   └── products.json      — Product catalogue (replace with real scraped data)
├── backend/
│   ├── graph.py           — Python LangGraph agent (local dev / testing)
│   └── data_pipeline/
│       ├── scrape_5elements.py   — Scrape 5elements-sports.com
│       ├── index_to_chroma.py    — Index products into Chroma vector DB
│       └── requirements.txt
├── .env.local.example
└── README.md
```

---

## Quick Start

### 1. Get API Keys (5 minutes each)

| Service | URL | Cost |
|---------|-----|------|
| DeepSeek | https://platform.deepseek.com | €0 (100k tokens/month free) |
| Resend | https://resend.com | €0 (100 emails/day free) |

### 2. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your keys
```

### 3. Install & Run

```bash
npm install
npm run dev
# Open http://localhost:3000
```

---

## Week 1: Scrape & Index Products

> Only needed once. Replaces the sample data in `data/products.json`.

```bash
cd backend/data_pipeline

# Create a Python virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

# 1. Scrape 5elements-sports.com → data/products.json
python scrape_5elements.py

# 2. (Optional) Also index into Chroma for local semantic search
python index_to_chroma.py
```

---

## API Reference

### `POST /api/chat`

**Request body:**
```json
{
  "message": "Do you have blue boxing gloves in size M?",
  "language": "en",           // optional — auto-detected if omitted
  "customer_name": "Jan",     // optional — used in escalation email
  "customer_email": "jan@example.com",
  "customer_phone": "+49 123 456789"
}
```

**Response:**
```json
{
  "response": "Yes! We have these options:\n• RDX Blue 10oz — €44.99\n  🔗 https://...",
  "escalated": false,
  "ask_for_contact": false,
  "language": "en"
}
```

When `ask_for_contact` is `true` the chat widget shows the contact form.

---

## Classification Logic

| Type | Examples | Action |
|------|----------|--------|
| Product question | "Do you have size M?", "Was kostet X?" | Answer instantly with product links |
| Business inquiry | "bulk order", "Großbestellung", "wholesale", "custom branding" | Ask for contact info + email owner |

---

## Deploying to Vercel

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USER/5elements-chatbot.git
git push -u origin main

# 2. Import on vercel.com → New Project → select repo → Deploy

# 3. Add Environment Variables in Vercel dashboard:
#    DEEPSEEK_API_KEY   = sk-xxx...
#    RESEND_API_KEY     = re-xxx...
#    OWNER_EMAIL        = owner@5elements-sports.com
```

**Done!** Live at `https://your-app.vercel.app`

---

## Embed on WordPress

### Option A — iframe (simplest)

```html
<iframe 
  src="https://your-app.vercel.app"
  style="width:100%; height:600px; border:none;">
</iframe>
```

### Option B — Link in navigation

```html
<a href="https://your-app.vercel.app" target="_blank">💬 Chat with us</a>
```

### Option C — Inject chat widget only (advanced)

For seamless embedding without iframes, build a standalone widget script
and add it to `header.php` or via a WordPress plugin like "Insert Headers & Footers".

---

## Tech Stack (100% Free)

| Component | Technology | Cost |
|-----------|-----------|------|
| LLM | DeepSeek (`deepseek-chat`) | €0 |
| Product search | Keyword scoring from JSON | €0 |
| Agent | TypeScript pipeline | €0 |
| Backend | Next.js API Routes | €0 |
| Frontend | Next.js + React + Tailwind | €0 |
| Hosting | Vercel Hobby | €0 |
| Email | Resend free tier | €0 |
| **TOTAL** | | **€0/month** |

---

## Testing Checklist

```
Product questions (no email sent):
☐ "Do you have blue boxing gloves?" → answer + links
☐ "What's the price of Fairtex gloves?" → price + link
☐ "Habt ihr Größe M?" → German answer + links

Business inquiries (email sent to owner):
☐ "Bulk order with discount?" → contact form shown + email sent
☐ "Custom branding?" → contact form shown + email sent
☐ "Großbestellung Mengenrabatt?" → German contact form + email

Language detection:
☐ German text → German response
☐ English text → English response
☐ Umlauts (ä/ö/ü/ß) → detected as German
```

---

## Business Model

```
Per client:
  Setup fee:     €2,000 (one-time)
  Monthly:       €300 (recurring)
  Your costs:    €0/month
  Your profit:   €300/month

3-year LTV per client: ~€12,800

At 20 clients:
  Monthly revenue:  €6,000
  Monthly costs:    €0
  Monthly profit:   €6,000
```
