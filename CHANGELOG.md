# Changelog

All notable changes to the MMGroup chatbot project.

## [1.1.0] - 2026-01-29

### Added

- **Multi-Site Website Scraper**
  - Support for all MMG brand websites:
    - meetingmindsgroup.com (--site=mmg)
    - meetingmindsexperts.com (--site=experts)
    - medulive.online (--site=medulive)
    - medicalmindsexperts.com (--site=medcom)
  - Brand metadata tagging for each ingested page
  - Selective site scraping via command line flags
  - Built-in rate limiting (500ms between pages, 2s between sites)

### Improved

- **CLAUDE.md Documentation**
  - Added MMG brands & websites table
  - Comprehensive command reference for multi-site scraping
  - Widget customization examples
  - Troubleshooting section
  - Key files reference table

---

## [1.0.0] - 2026-01-29

### Added

- **Core RAG Chatbot**
  - OpenAI GPT-4o-mini for chat responses
  - OpenAI text-embedding-3-small for embeddings
  - KV-based vector storage with cosine similarity search
  - Configurable relevance threshold (0.3)

- **Provider Abstraction Layer**
  - Swappable LLM providers (OpenAI, Workers AI)
  - Swappable embedding providers (OpenAI, Workers AI)
  - Swappable vector stores (KV, Vectorize)
  - Environment variable toggles for easy switching

- **API Endpoints**
  - `POST /chat` - Standard chat with RAG context
  - `POST /chat/stream` - Streaming chat responses
  - `POST /ingest` - Single document ingestion
  - `POST /ingest/bulk` - Bulk document ingestion
  - `GET /stats` - Vector store statistics
  - `GET /widget.js` - Embeddable chat widget
  - `GET /health` - Health check endpoint

- **Embeddable Chat Widget**
  - Floating chat bubble with customizable position
  - Customizable colors and title via query params
  - Auto-formatting of responses (bold, bullets, line breaks)
  - Clickable links for emails (mailto:), phones (tel:), and locations (Google Maps)
  - Session persistence via localStorage
  - Typing indicator animation
  - Mobile responsive design

- **Content Ingestion**
  - Text chunking (500 chars, 50 overlap)
  - Website scraper script (`npm run scrape`)
  - Metadata support (title, URL, source)

- **CORS Support**
  - meetingmindsgroup.com (production)
  - meetingmindsgroup.webflow.io (staging)
  - localhost/127.0.0.1 (development)

- **CI/CD**
  - GitHub Actions workflow for auto-deploy on push to main
  - Node.js 22 runtime
  - Cloudflare Wrangler action

- **Documentation**
  - CLAUDE.md project guide
  - Inline code comments

### Configuration

- System prompt optimized for MMG (healthcare communications company)
- Contact info fallback in system prompt
- RAG topK: 5, chunk size: 500, overlap: 50

---

## Planned / Future Enhancements

### Content & Ingestion
- [ ] PDF document ingestion support
- [ ] Word/DOCX document support
- [ ] Automatic website re-crawling on schedule
- [ ] Content versioning and updates
- [ ] Admin UI for content management

### Chat Features
- [ ] Conversation history persistence (D1 database)
- [ ] Multi-turn context awareness
- [ ] Suggested follow-up questions
- [ ] File/image upload support
- [ ] Voice input support

### Widget Enhancements
- [ ] Dark mode support
- [ ] Multi-language support
- [ ] Custom branding options
- [ ] Proactive greeting messages
- [ ] Offline fallback messages

### Infrastructure
- [ ] Upgrade to Vectorize for better search performance
- [ ] Rate limiting per session/IP
- [ ] Analytics dashboard
- [ ] Error tracking integration
- [ ] A/B testing for system prompts

### Security
- [ ] API key authentication for ingest endpoints
- [ ] Input sanitization improvements
- [ ] Content moderation

### Performance
- [ ] Response caching for common queries
- [ ] Embedding cache
- [ ] Lazy loading of widget assets

---

## Migration Guides

### Switching to Vectorize

1. Create Vectorize index:
   ```bash
   wrangler vectorize create mmgroup-vectors --dimensions=1536 --metric=cosine
   ```

2. Update `wrangler.jsonc`:
   ```jsonc
   "vectorize": [{
     "binding": "VECTORS_INDEX",
     "index_name": "mmgroup-vectors"
   }]
   ```

3. Change environment variable:
   ```jsonc
   "VECTOR_STORE": "vectorize"
   ```

4. Re-ingest all content (Vectorize uses different storage)

### Switching to Workers AI

1. Update `wrangler.jsonc`:
   ```jsonc
   "ai": { "binding": "AI" }
   ```

2. Change environment variables:
   ```jsonc
   "LLM_PROVIDER": "workers-ai",
   "EMBEDDING_PROVIDER": "workers-ai"
   ```

3. Note: Workers AI uses different embedding dimensions (768 vs 1536), requiring re-ingestion
