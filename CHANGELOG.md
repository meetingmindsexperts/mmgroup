# Changelog

All notable changes to the MMGroup chatbot project.

## [1.2.0] - 2026-02-03

### Added

- **Proactive Lead Capture System**
  - Automatic detection of user interest (pricing, demo, sales, partnership inquiries)
  - Intelligent name extraction from natural language patterns
  - Email extraction and validation (format + disposable domain check)
  - Phone number extraction with international format support
  - Lead data saved to Supabase `mmg_chat_leads` table
  - Secure API key authentication via `x-chatbot-key` header

- **Supabase Edge Functions**
  - `capture-lead` - Secure lead insertion with API key validation
  - `validate-email` - Server-side email validation (format + disposable check)
  - Service role authentication to bypass RLS

- **Conversation Memory**
  - Session-based conversation history stored in KV
  - 24-hour TTL for conversation data
  - Last 10 messages retained for context
  - Lead info accumulation across multiple messages
  - Prevents re-asking for contact info already provided

- **Contact Page Ingestion**
  - Ingested https://www.meetingmindsgroup.com/contact content
  - Sales email, phone numbers, and addresses available to chatbot

### Improved

- **Lead Detection Utilities** (`src/utils/leadDetection.ts`)
  - Fixed name extraction patterns to avoid false positives (e.g., "I am interested")
  - Added `NOT_NAMES` set to exclude common words from name detection
  - Standalone name detection for short messages (1-3 words)
  - Generic email prefix detection (info@, contact@, etc.)

- **System Prompt** (`src/config.ts`)
  - Lead capture marked as HIGHEST PRIORITY
  - Moved "contact sales" triggers from contact query to lead capture
  - Clear instructions for handling partial lead info
  - Specific trigger phrases for proactive lead capture

- **Chat Handler** (`src/routes/chat.ts`)
  - Pre-validates email BEFORE LLM response
  - Injects validation result into LLM context
  - Handles partial lead info (name only → ask for email, email only → confirm)
  - Checks if complete info already provided to avoid re-asking

### Configuration

- Added `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CHATBOT_API_KEY` environment variables
- New providers: `src/providers/leads/` for lead management

---

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

---

## Troubleshooting

### Lead Capture Issues

#### Bot not asking for contact info when user says "contact sales"
- **Cause**: System prompt priority or keyword detection
- **Fix**: Ensure `LEAD CAPTURE` section is marked as `(HIGHEST PRIORITY)` in system prompt
- **Check**: Verify "contact sales" is in lead capture triggers, not contact query triggers

#### Valid email being rejected
- **Cause**: Email validation happening after LLM response, LLM doesn't see validation result
- **Fix**: Ensure email validation happens BEFORE LLM call and result is injected into context
- **Check**: Look for `[SYSTEM: ... VALID email ...]` in the message context

#### Bot using email prefix as name (e.g., "Info" from info@company.com)
- **Cause**: Name extraction from email falling back to prefix
- **Fix**: Added `genericPrefixes` list in chat handler to skip generic prefixes like info, contact, sales, support
- **Check**: Verify `genericPrefixes` array includes the problematic prefix

#### Bot not recognizing standalone names (e.g., just "Krishna")
- **Cause**: Name patterns only matching explicit phrases like "my name is..."
- **Fix**: Added fallback in `extractName()` for short messages (1-3 words) that don't contain common words
- **Check**: Ensure message doesn't contain words in `NOT_NAMES` set

#### Bot asking for name/email again after already provided
- **Cause**: Conversation memory not enabled or not checking accumulated lead info
- **Fix**:
  1. Ensure `getConversation()` and `getAccumulatedLeadInfo()` are called
  2. Check for `alreadyHaveCompleteInfo` before prompting
- **Check**: Verify KV binding `VECTORS_KV` is configured in wrangler.jsonc

### Conversation Memory Issues

#### Bot not remembering previous messages
- **Cause**: KV storage not configured or sessionId not persisting
- **Fix**:
  1. Ensure `VECTORS_KV` binding in wrangler.jsonc
  2. Verify client sends same `sessionId` across requests
- **Check**: Test with `wrangler kv:key list --binding VECTORS_KV` to see stored conversations

#### Conversation data disappearing
- **Cause**: TTL expiration (24 hours by default)
- **Fix**: Adjust `CONVERSATION_TTL` in `src/utils/conversationMemory.ts` if needed
- **Note**: This is intentional for privacy - conversations auto-delete after 24 hours

### Lead Storage Issues

#### Leads not appearing in Supabase
- **Cause**: API key mismatch or RLS blocking inserts
- **Fix**:
  1. Verify `CHATBOT_API_KEY` secret matches Supabase edge function config
  2. Ensure edge function uses service role key (bypasses RLS)
  3. Check Supabase edge function logs for errors
- **Test**: Call edge function directly with test data

#### "Email already registered" error
- **Cause**: Duplicate email detection working as intended
- **Note**: This prevents duplicate leads - not an error

### Vector Store Issues

#### Chatbot not finding relevant content
- **Cause**: Content not ingested or relevance threshold too high
- **Fix**:
  1. Re-run `npm run scrape` to refresh content
  2. Check `/stats` endpoint to verify vector count
  3. Lower relevance threshold in `src/routes/chat.ts` (default: 0.3)

#### Contact page info not available
- **Cause**: Contact page not ingested into vector store
- **Fix**: Run targeted ingestion:
  ```bash
  curl -X POST https://your-worker.workers.dev/ingest \
    -H "Content-Type: application/json" \
    -d '{"url": "https://www.meetingmindsgroup.com/contact"}'
  ```

### Deployment Issues

#### Changes not reflecting in production
- **Cause**: Worker not redeployed or caching
- **Fix**:
  1. Run `npm run deploy`
  2. Clear browser cache / use incognito
  3. Check GitHub Actions for deployment errors

#### Environment variables not working
- **Cause**: Vars vs Secrets confusion
- **Fix**:
  - Public values (URLs): Add to `vars` in wrangler.jsonc
  - Secrets (API keys): Use `wrangler secret put SECRET_NAME`
- **Check**: Run `wrangler secret list` to verify secrets are set
