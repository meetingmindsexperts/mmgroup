/**
 * Website Scraper for RAG Ingestion
 *
 * Usage:
 *   npx tsx scripts/scrape-website.ts
 *
 * Environment variables:
 *   API_URL - The worker URL (default: http://localhost:8787)
 *   WEBSITE_URL - The website to scrape (default: https://meetingmindsgroup.com)
 */

const API_URL = process.env.API_URL || 'http://localhost:8787';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://meetingmindsgroup.com';

interface Page {
  url: string;
  title: string;
  content: string;
}

// Simple HTML to text extraction
function htmlToText(html: string): string {
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove nav, header, footer elements
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Convert headings to text with emphasis
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
    // Convert paragraphs and divs to text
    .replace(/<(p|div)[^>]*>([\s\S]*?)<\/\1>/gi, '$2\n')
    // Convert list items
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

// Extract title from HTML
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : 'Untitled';
}

// Extract links from HTML
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let href = match[1];

    // Skip anchors, javascript, mailto, etc.
    if (href.startsWith('#') || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    // Convert relative URLs to absolute
    if (href.startsWith('/')) {
      href = new URL(href, baseUrl).href;
    } else if (!href.startsWith('http')) {
      href = new URL(href, baseUrl).href;
    }

    // Only include links from the same domain
    const url = new URL(href);
    const base = new URL(baseUrl);
    if (url.hostname === base.hostname) {
      // Remove hash and query params for deduplication
      url.hash = '';
      links.push(url.href);
    }
  }

  return [...new Set(links)];
}

// Fetch a page
async function fetchPage(url: string): Promise<Page | null> {
  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MMGroup-Scraper/1.0 (Content Ingestion Bot)',
      },
    });

    if (!response.ok) {
      console.error(`  Failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.log(`  Skipped: Not HTML (${contentType})`);
      return null;
    }

    const html = await response.text();
    const title = extractTitle(html);
    const content = htmlToText(html);

    // Skip pages with very little content
    if (content.length < 100) {
      console.log(`  Skipped: Too little content (${content.length} chars)`);
      return null;
    }

    console.log(`  Success: "${title}" (${content.length} chars)`);
    return { url, title, content };
  } catch (error) {
    console.error(`  Error: ${error}`);
    return null;
  }
}

// Crawl website
async function crawlWebsite(startUrl: string, maxPages: number = 50): Promise<Page[]> {
  const visited = new Set<string>();
  const toVisit = [startUrl];
  const pages: Page[] = [];

  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift()!;

    // Normalize URL
    const normalized = url.split('?')[0].split('#')[0];
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const page = await fetchPage(normalized);
    if (page) {
      pages.push(page);

      // Fetch HTML again to extract links (we could optimize this)
      const response = await fetch(normalized);
      const html = await response.text();
      const links = extractLinks(html, startUrl);

      for (const link of links) {
        const linkNormalized = link.split('?')[0].split('#')[0];
        if (!visited.has(linkNormalized) && !toVisit.includes(linkNormalized)) {
          toVisit.push(linkNormalized);
        }
      }
    }

    // Small delay to be nice to the server
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return pages;
}

// Ingest pages to the API
async function ingestPages(pages: Page[]): Promise<void> {
  console.log(`\nIngesting ${pages.length} pages to ${API_URL}...`);

  const documents = pages.map((page) => ({
    content: page.content,
    metadata: {
      url: page.url,
      title: page.title,
      type: 'webpage' as const,
    },
  }));

  try {
    const response = await fetch(`${API_URL}/ingest/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`\nSuccess! Ingested ${result.total} chunks from ${pages.length} pages.`);
      console.log('Results:', JSON.stringify(result, null, 2));
    } else {
      console.error('Ingestion failed:', result);
    }
  } catch (error) {
    console.error('Ingestion error:', error);
  }
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('Meeting Minds Group - Website Scraper');
  console.log('='.repeat(60));
  console.log(`Website: ${WEBSITE_URL}`);
  console.log(`API URL: ${API_URL}`);
  console.log('='.repeat(60));
  console.log();

  // Crawl the website
  const pages = await crawlWebsite(WEBSITE_URL);

  if (pages.length === 0) {
    console.log('No pages found to ingest.');
    return;
  }

  console.log(`\nFound ${pages.length} pages:`);
  for (const page of pages) {
    console.log(`  - ${page.title} (${page.url})`);
  }

  // Ingest to the API
  await ingestPages(pages);
}

main().catch(console.error);
