# CLAUDE.md - MMGroup Chatbot Project Guide

## Overview

MMGroup is a RAG-style AI chatbot for **Meeting Minds Group (MMG)**, a UAE-based healthcare communications and event management company. The chatbot serves multiple MMG brand websites and is deployed on Cloudflare Workers.

## MMG Brands & Websites

| Brand | Website | Description |
|-------|---------|-------------|
| Meeting Minds Group | meetingmindsgroup.com | Parent company, healthcare events |
| Meeting Minds Experts | meetingmindsexperts.com | Expert speakers & KOLs |
| MedULive | medulive.online | Virtual medical education platform |
| Medical Minds (MedCom) | medicalmindsexperts.com | Medical communications |

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Vector Storage**: KV-based (Vectorize upgrade path available)
- **LLM**: OpenAI gpt-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Deployment**: Wrangler CLI + GitHub Actions (auto-deploy on push)

## Project Structure

```
mmgroup/
├── src/
│   ├── index.ts              # Main worker entry, request routing
│   ├── config.ts             # System prompt, RAG settings, model config
│   ├── types.ts              # TypeScript interfaces
│   ├── providers/
│   │   ├── embeddings/       # OpenAI & Workers AI embedding providers
│   │   ├── llm/              # OpenAI & Workers AI LLM providers
│   │   └── vectorstore/      # KV & Vectorize storage providers
│   ├── routes/
│   │   ├── chat.ts           # /chat and /chat/stream endpoints
│   │   ├── ingest.ts         # /ingest, /ingest/bulk, /stats endpoints
│   │   ├── analytics.ts      # /analytics and /analytics/export endpoints
│   │   ├── knowledgeGaps.ts  # Knowledge gap detection and /analytics/gaps endpoints
│   │   └── widget.ts         # /widget.js embeddable chat widget
│   └── utils/
│       ├── cors.ts           # CORS handling for Webflow
│       └── chunker.ts        # Text chunking for ingestion
├── scripts/
│   └── scrape-website.ts     # Multi-site website scraper
├── wrangler.jsonc            # Cloudflare Workers configuration
├── CLAUDE.md                 # This file
└── CHANGELOG.md              # Version history & roadmap
```

## Quick Commands

```bash
# Development
npm run dev                    # Start local dev server (localhost:8787)
npm run deploy                 # Deploy to Cloudflare Workers

# Content Ingestion
npm run scrape                 # Scrape ALL MMG brand websites
npm run scrape -- --site=mmg   # Scrape only meetingmindsgroup.com
npm run scrape -- --site=experts   # Scrape meetingmindsexperts.com
npm run scrape -- --site=medulive  # Scrape medulive.online
npm run scrape -- --site=medcom    # Scrape medicalmindsexperts.com

# Secrets
wrangler secret put OPENAI_API_KEY
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Send message, get AI response with RAG context |
| `/chat/stream` | POST | Streaming chat response (SSE) |
| `/ingest` | POST | Ingest single document |
| `/ingest/bulk` | POST | Ingest multiple documents at once |
| `/stats` | GET | Vector store statistics |
| `/analytics` | GET | Chat analytics dashboard |
| `/analytics/export` | GET | Export chat logs as CSV |
| `/analytics/gaps` | GET | Knowledge gaps (unanswered questions) |
| `/analytics/gaps/summary` | GET | Knowledge gaps summary + top 5 |
| `/analytics/gaps/:id/resolve` | PATCH | Mark a gap as resolved |
| `/widget.js` | GET | Embeddable chat widget JavaScript |
| `/health` | GET | Health check |

### Chat Request Example
```bash
curl -X POST https://mmgroup.krishna-94f.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What services does MMG offer?"}'
```

### Ingest Request Example
```bash
curl -X POST https://mmgroup.krishna-94f.workers.dev/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Your content here...",
    "metadata": {
      "title": "Page Title",
      "url": "https://example.com/page",
      "brand": "Meeting Minds"
    }
  }'
```

## Widget Integration

Add to any website (works on Webflow, WordPress, etc.):

```html
<script src="https://mmgroup.krishna-94f.workers.dev/widget.js"></script>
```

### Customization Options

```html
<!-- Custom title, color, and position -->
<script src="https://mmgroup.krishna-94f.workers.dev/widget.js?title=Ask%20MMG&color=%23007bff&position=left"></script>
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `title` | "Chat with us" | Chat header title |
| `color` | #2eb2ff | Primary color (hex) |
| `position` | right | Bubble position (left/right) |

### Widget Features
- Floating chat bubble (40x40px)
- Clickable links: emails (mailto:), phones (tel:), locations (Google Maps)
- Markdown formatting: **bold**, bullet points, line breaks
- Session persistence via localStorage
- Typing indicator animation
- Mobile responsive
- Subtle inline email capture (chat input placeholder swap, no form UI)

### Lead Capture Flow
1. User sends first message → bot asks for name (does NOT answer questions yet)
2. User provides name → bot greets by name and answers any pending question
3. User asks next question → bot asks for email (input placeholder changes to "Enter your email address...")
4. User provides valid email → lead saved, normal chat resumes

## Environment Configuration

### wrangler.jsonc Variables
```jsonc
{
  "vars": {
    "VECTOR_STORE": "kv",           // or "vectorize"
    "LLM_PROVIDER": "openai",       // or "workers-ai"
    "EMBEDDING_PROVIDER": "openai", // or "workers-ai"
    "ALLOWED_ORIGIN": "https://meetingmindsgroup.com"
  }
}
```

### Secrets (via `wrangler secret put`)
- `OPENAI_API_KEY` - OpenAI API key for embeddings and chat

## RAG Configuration

In [src/config.ts](src/config.ts):
- `topK`: 5 (chunks retrieved per query)
- `chunkSize`: 500 characters
- `chunkOverlap`: 50 characters
- Relevance threshold: 0.3 (in chat.ts)

## Provider Architecture

The codebase uses a provider pattern for easy switching between services:

```typescript
// Providers are selected based on environment variables
const embeddings = createEmbeddingsProvider(env);  // EMBEDDING_PROVIDER
const llm = createLLMProvider(env);                // LLM_PROVIDER
const vectorStore = createVectorStoreProvider(env); // VECTOR_STORE
```

### Available Providers
| Component | Options | Dimensions |
|-----------|---------|------------|
| Embeddings | openai, workers-ai | 1536 / 768 |
| LLM | openai (gpt-4o-mini), workers-ai (llama-3.1-8b) | - |
| Vector Store | kv, vectorize | - |

## CORS Configuration

Allowed origins (in [src/utils/cors.ts](src/utils/cors.ts)):
- `https://meetingmindsgroup.com` (production)
- `https://meetingmindsgroup.webflow.io` (staging)
- `http://localhost:*` (development)
- `http://127.0.0.1:*` (development)

## Free Tier Limits

| Service | Limit |
|---------|-------|
| KV Storage | 1 GB total |
| KV Writes | 1,000/day |
| KV Reads | 100,000/day |
| Workers Requests | 100,000/day |
| OpenAI Embeddings | ~$0.02/1M tokens |
| OpenAI Chat | ~$0.15-0.60/1M tokens |

## Deployment

### Automatic (GitHub Actions)
Push to `main` branch triggers auto-deploy via [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

### Manual
```bash
npm run deploy
```

### Required Secrets
- GitHub Secret: `CLOUDFLARE_API_TOKEN`
- Worker Secret: `OPENAI_API_KEY`

## Troubleshooting

### Chat not finding relevant content
1. Check ingestion stats: `curl https://mmgroup.krishna-94f.workers.dev/stats`
2. Re-ingest content: `npm run scrape`
3. Lower relevance threshold in [src/routes/chat.ts](src/routes/chat.ts) (currently 0.3)

### CORS errors on Webflow
1. Ensure domain is in [src/utils/cors.ts](src/utils/cors.ts)
2. Check browser console for exact origin
3. Redeploy: `npm run deploy`

### OpenAI rate limits during ingestion
- Run scraper for one site at a time: `npm run scrape -- --site=mmg`
- The scraper has built-in delays (500ms between pages, 2s between sites)

## Knowledge Gap Detection

The chatbot automatically detects questions it can't answer well and logs them for content improvement.

**How it works:**
- After each chat, if all RAG similarity scores are ≤ 0.3, the question is flagged as a knowledge gap
- Greetings, short messages, contact info, and lead capture interactions are filtered out
- Gaps are deduplicated by normalized question text (lowercase, stripped punctuation)
- Occurrence count increments on repeat questions; up to 5 sample session IDs stored

**Reviewing gaps:**
```bash
# List active gaps (sorted by occurrence)
curl https://mmgroup.krishna-94f.workers.dev/analytics/gaps

# Summary with top 5 most-asked unanswered questions
curl https://mmgroup.krishna-94f.workers.dev/analytics/gaps/summary

# Mark a gap as resolved after adding content
curl -X PATCH https://mmgroup.krishna-94f.workers.dev/analytics/gaps/1/resolve \
  -H "Content-Type: application/json" \
  -d '{"note": "Added pricing page content"}'
```

**D1 Schema:** `knowledge_gaps` table in `schema.sql` (migrated via `wrangler d1 execute`)

## Key Files to Know

| File | Purpose |
|------|---------|
| [src/config.ts](src/config.ts) | System prompt, RAG settings |
| [src/routes/chat.ts](src/routes/chat.ts) | RAG chat logic, lead capture, gap detection |
| [src/routes/analytics.ts](src/routes/analytics.ts) | Chat analytics dashboard + CSV export |
| [src/routes/knowledgeGaps.ts](src/routes/knowledgeGaps.ts) | Knowledge gap detection and endpoints |
| [src/routes/widget.ts](src/routes/widget.ts) | Embeddable widget HTML/CSS/JS |
| [src/utils/conversationMemory.ts](src/utils/conversationMemory.ts) | Session-based conversation history in KV |
| [src/utils/leadDetection.ts](src/utils/leadDetection.ts) | Name/email/phone extraction |
| [scripts/scrape-website.ts](scripts/scrape-website.ts) | Multi-site scraper |
| [wrangler.jsonc](wrangler.jsonc) | Cloudflare config, KV bindings |
