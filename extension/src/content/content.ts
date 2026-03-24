const MAX_CHARS = 50000;

// Tags to skip entirely
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'LINK', 'META'
]);

// Noise element tags
const NOISE_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE']);

// Noise roles
const NOISE_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'complementary', 'search']);

function extractPageContent(): string {
  const isPdf = document.contentType === 'application/pdf' ||
    window.location.pathname.endsWith('.pdf');
  return isPdf ? extractPdfContent() : extractHtmlContent();
}

function extractPdfContent(): string {
  const textLayers = document.querySelectorAll('.textLayer span, [data-page-number] span');
  if (textLayers.length > 0) {
    const chunks: string[] = [];
    textLayers.forEach(el => {
      const text = (el as HTMLElement).innerText?.trim();
      if (text && text.length > 1) chunks.push(text);
    });
    if (chunks.length > 0) return chunks.join(' ').substring(0, MAX_CHARS);
  }
  return extractHtmlContent();
}

function extractHtmlContent(): string {
  // Only query targeted noise selectors (NOT querySelectorAll('*'))
  const noisyElements = new Set<Node>();
  const noiseSelector = 'nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="search"], .sidebar, .navbar, .ad, .advertisement, .cookie-banner, .modal, .overlay, #sidebar, #footer, #nav';
  
  try {
    document.querySelectorAll(noiseSelector).forEach(el => noisyElements.add(el));
  } catch { /* invalid selector on some pages */ }

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        try {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (NOISE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;

          // Check role on parent only (not ancestor walk)
          const role = parent.getAttribute('role');
          if (role && NOISE_ROLES.has(role)) return NodeFilter.FILTER_REJECT;

          // Check up to 3 ancestors for noise (not full tree)
          let anc: HTMLElement | null = parent;
          for (let depth = 0; depth < 3 && anc; depth++) {
            if (noisyElements.has(anc)) return NodeFilter.FILTER_REJECT;
            anc = anc.parentElement;
          }

          // Skip hidden elements
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }
      }
    }
  );

  const chunks: string[] = [];
  let totalLength = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (totalLength >= MAX_CHARS) break;
    const text = (node.textContent || '').trim();
    if (text.length > 1) {
      chunks.push(text);
      totalLength += text.length;
    }
  }

  return chunks.join('\n').substring(0, MAX_CHARS);
}

// Only respond to messages, don't do anything on load
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'SCRAPE_PAGE') {
    try {
      const content = extractPageContent();
      sendResponse({ content, title: document.title });
    } catch (error) {
      console.error('Content extraction error:', error);
      sendResponse({ content: '', title: document.title });
    }
  }
  return true;
});

export {};
