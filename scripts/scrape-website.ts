/**
 * Website Scraper for RAG Ingestion
 *
 * Scrapes multiple MMG brand websites and ingests content into the vector store.
 *
 * Usage:
 *   npm run scrape                    # Scrape all configured websites
 *   npm run scrape -- --site=mmg      # Scrape only meetingmindsgroup.com
 *   npm run scrape -- --site=experts  # Scrape only meetingmindsexperts.com
 *   npm run scrape -- --site=medulive # Scrape only medulive.online
 *   npm run scrape -- --site=medcom   # Scrape only medicalmindsexperts.com
 *   npm run scrape -- URL1 URL2 ...   # Scrape specific URLs only
 *
 * Environment variables:
 *   API_URL - The worker URL (default: https://mmgroup.krishna-94f.workers.dev)
 */

const API_URL = process.env.API_URL || 'https://mmgroup.krishna-94f.workers.dev';

// MMG Brand Websites Configuration
const WEBSITES = {
  mmg: {
    name: 'Meeting Minds Group',
    url: 'https://meetingmindsgroup.com',
    brand: 'Meeting Minds',
    maxPages: 50,
  },
  experts: {
    name: 'Meeting Minds Experts',
    url: 'https://meetingmindsexperts.com',
    brand: 'Meeting Minds Experts',
    maxPages: 50,
  },
  medulive: {
    name: 'MedULive',
    url: 'https://medulive.online',
    brand: 'MedULive',
    maxPages: 50,
  },
  medcom: {
    name: 'Medical Minds Experts',
    url: 'https://medicalmindsexperts.com',
    brand: 'Medical Minds (MedCom)',
    maxPages: 50,
  },
} as const;

type SiteKey = keyof typeof WEBSITES;

interface Page {
  url: string;
  title: string;
  content: string;
  brand: string;
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
    if (
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      continue;
    }

    // Convert relative URLs to absolute
    if (href.startsWith('/')) {
      href = new URL(href, baseUrl).href;
    } else if (!href.startsWith('http')) {
      href = new URL(href, baseUrl).href;
    }

    // Only include links from the same domain
    try {
      const url = new URL(href);
      const base = new URL(baseUrl);
      if (url.hostname === base.hostname) {
        // Remove hash and query params for deduplication
        url.hash = '';
        links.push(url.href);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return [...new Set(links)];
}

// Fetch a page
async function fetchPage(url: string, brand: string): Promise<Page | null> {
  try {
    console.log(`  Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MMGroup-Scraper/1.0 (Content Ingestion Bot)',
      },
    });

    if (!response.ok) {
      console.error(`    Failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.log(`    Skipped: Not HTML (${contentType})`);
      return null;
    }

    const html = await response.text();
    const title = extractTitle(html);
    const content = htmlToText(html);

    // Skip pages with very little content
    if (content.length < 100) {
      console.log(`    Skipped: Too little content (${content.length} chars)`);
      return null;
    }

    console.log(`    Success: "${title}" (${content.length} chars)`);
    return { url, title, content, brand };
  } catch (error) {
    console.error(`    Error: ${error}`);
    return null;
  }
}

// Crawl a single website
async function crawlWebsite(
  startUrl: string,
  brand: string,
  maxPages: number = 50
): Promise<Page[]> {
  const visited = new Set<string>();
  const toVisit = [startUrl];
  const pages: Page[] = [];

  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift()!;

    // Normalize URL
    const normalized = url.split('?')[0].split('#')[0];
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const page = await fetchPage(normalized, brand);
    if (page) {
      pages.push(page);

      // Fetch HTML again to extract links
      try {
        const response = await fetch(normalized);
        const html = await response.text();
        const links = extractLinks(html, startUrl);

        for (const link of links) {
          const linkNormalized = link.split('?')[0].split('#')[0];
          if (!visited.has(linkNormalized) && !toVisit.includes(linkNormalized)) {
            toVisit.push(linkNormalized);
          }
        }
      } catch {
        // Failed to fetch links, continue
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
      brand: page.brand,
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

// Parse command line arguments
interface ParsedArgs {
  mode: 'sites' | 'urls';
  sites?: SiteKey[];
  urls?: string[];
  brand?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // Check for --site flag
  const siteArg = args.find((arg: string) => arg.startsWith('--site='));

  // Check for --brand flag (used with URLs)
  const brandArg = args.find((arg: string) => arg.startsWith('--brand='));
  const brand = brandArg ? brandArg.split('=')[1] : 'MMG';

  // Check for URLs (any arg that starts with http)
  const urls = args.filter((arg: string) => arg.startsWith('http'));

  if (urls.length > 0) {
    return { mode: 'urls', urls, brand };
  }

  if (siteArg) {
    const site = siteArg.split('=')[1] as SiteKey;
    if (site in WEBSITES) {
      return { mode: 'sites', sites: [site] };
    }
    console.error(`Unknown site: ${site}`);
    console.error(`Available sites: ${Object.keys(WEBSITES).join(', ')}`);
    process.exit(1);
  }

  // Default: all sites
  return { mode: 'sites', sites: Object.keys(WEBSITES) as SiteKey[] };
}

// Main
async function main() {
  const args = parseArgs();

  console.log('='.repeat(60));
  console.log('Meeting Minds Group - Website Scraper');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);

  const allPages: Page[] = [];

  if (args.mode === 'urls' && args.urls) {
    // Scrape specific URLs
    console.log(`URLs to scrape: ${args.urls.length}`);
    console.log(`Brand: ${args.brand}`);
    console.log('='.repeat(60));
    console.log();

    for (const url of args.urls) {
      const page = await fetchPage(url, args.brand || 'MMG');
      if (page) {
        allPages.push(page);
      }
      // Small delay between pages
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } else if (args.mode === 'sites' && args.sites) {
    // Crawl entire sites
    console.log(`Sites to scrape: ${args.sites.map((s: SiteKey) => WEBSITES[s].name).join(', ')}`);
    console.log('='.repeat(60));
    console.log();

    for (const siteKey of args.sites) {
      const site = WEBSITES[siteKey];
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Crawling: ${site.name} (${site.url})`);
      console.log(`Brand: ${site.brand}`);
      console.log(`${'─'.repeat(60)}`);

      const pages = await crawlWebsite(site.url, site.brand, site.maxPages);
      allPages.push(...pages);

      console.log(`\nFound ${pages.length} pages from ${site.name}`);

      // Delay between sites
      if (args.sites.indexOf(siteKey) < args.sites.length - 1) {
        console.log('Waiting before next site...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  if (allPages.length === 0) {
    console.log('\nNo pages found to ingest.');
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total pages found: ${allPages.length}`);
  console.log(`${'='.repeat(60)}`);

  // Group by brand for summary
  const byBrand = allPages.reduce(
    (acc, page) => {
      acc[page.brand] = (acc[page.brand] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('\nPages by brand:');
  for (const [brand, count] of Object.entries(byBrand)) {
    console.log(`  - ${brand}: ${count} pages`);
  }

  // Ingest to the API
  await ingestPages(allPages);
}

main().catch(console.error);
