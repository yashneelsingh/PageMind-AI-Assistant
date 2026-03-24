/// <reference types="chrome" />

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.action === 'EXTRACT_PAGE') {
    handleExtractPage(message.tabId, message.url).then(sendResponse);
    return true;
  }
  if (message.action === 'CHAT') {
    handleChat(message.query, message.url, message.history, message.urls).then(sendResponse);
    return true;
  }
  if (message.action === 'SUMMARIZE') {
    handleSummarize(message.url, message.urls).then(sendResponse);
    return true;
  }
  if (message.action === 'CHECK_CACHE') {
    handleCheckCache(message.url).then(sendResponse);
    return true;
  }
});

async function getServerUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['ai_research_settings'], (result) => {
      // Remove trailing slash if present
      const settings = result.ai_research_settings as { serverUrl?: string } | undefined;
      const rawUrl = settings?.serverUrl || 'http://localhost:3000';
      resolve(rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl);
    });
  });
}

async function getGeminiKey(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['gemini_api_key'], (result) => {
      resolve((result.gemini_api_key as string) || '');
    });
  });
}

// Lightweight fallback extraction (no querySelectorAll('*'))
async function fallbackExtract(tabId: number): Promise<{ content: string; title: string }> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME']);
      const NOISE_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE']);

      const noisy = new Set<Node>();
      try {
        document.querySelectorAll('nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .sidebar, .navbar, .ad, .advertisement').forEach(el => noisy.add(el));
      } catch {}

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          try {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (SKIP.has(p.tagName) || NOISE_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
            let anc: HTMLElement | null = p;
            for (let d = 0; d < 3 && anc; d++) {
              if (noisy.has(anc)) return NodeFilter.FILTER_REJECT;
              anc = anc.parentElement;
            }
            const s = window.getComputedStyle(p);
            if (s.display === 'none' || s.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          } catch { return NodeFilter.FILTER_REJECT; }
        }
      });

      const chunks: string[] = [];
      let total = 0;
      let n: Node | null;
      while ((n = walker.nextNode()) && total < 50000) {
        const t = (n.textContent || '').trim();
        if (t.length > 1) { chunks.push(t); total += t.length; }
      }
      return { content: chunks.join('\n').substring(0, 50000), title: document.title };
    }
  });
  return results[0]?.result || { content: '', title: '' };
}

function isPdfUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.pdf');
  } catch {
    return false;
  }
}

async function handleExtractPage(tabId: number, url: string) {
  try {
    // PDF files can't be scraped by content scripts — send URL to server for parsing
    if (isPdfUrl(url)) {
      const tab = await chrome.tabs.get(tabId);
      const title = tab.title || 'PDF Document';
      const serverUrl = await getServerUrl();
      const geminiKey = await getGeminiKey();
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (geminiKey) headers['x-gemini-api-key'] = geminiKey;

      const apiRes = await fetch(`${serverUrl}/api/extract-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url, title })
      });

      if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Server failed to extract PDF');
      }
      return { success: true, isPdf: true };
    }

    // Normal HTML page extraction via content script
    let response: { content: string; title: string } | undefined;

    try {
      response = await chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_PAGE' });
    } catch {
      // Content script not available
    }

    if (!response || !response.content) {
      response = await fallbackExtract(tabId);
    }

    if (!response.content) {
      throw new Error('No content could be extracted from the page');
    }

    const serverUrl = await getServerUrl();
    const geminiKey = await getGeminiKey();
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (geminiKey) headers['x-gemini-api-key'] = geminiKey;

    const apiRes = await fetch(`${serverUrl}/api/process-page`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, title: response.title, text: response.content })
    });

    if (!apiRes.ok) throw new Error('API failed to process page');
    return { success: true };
  } catch (error) {
    console.error('Extraction error:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleChat(
  query: string, url: string,
  history: { role: string; content: string }[] = [],
  urls: string[] = []
) {
  try {
    const serverUrl = await getServerUrl();
    const geminiKey = await getGeminiKey();
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (geminiKey) headers['x-gemini-api-key'] = geminiKey;

    const apiRes = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, url, history, urls })
    });
    if (!apiRes.ok) throw new Error('API failed to generate answer');
    const data = await apiRes.json();
    return { success: true, data: data.answer };
  } catch (error) {
    console.error('Chat error:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleSummarize(url: string, urls: string[] = []) {
  try {
    const serverUrl = await getServerUrl();
    const geminiKey = await getGeminiKey();
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (geminiKey) headers['x-gemini-api-key'] = geminiKey;

    const apiRes = await fetch(`${serverUrl}/api/summarize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, urls })
    });
    if (!apiRes.ok) throw new Error('API failed to generate summary');
    const data = await apiRes.json();
    return { success: true, data: data.answer };
  } catch (error) {
    console.error('Summarize error:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleCheckCache(url: string) {
  try {
    const serverUrl = await getServerUrl();
    const apiRes = await fetch(`${serverUrl}/api/check-cache?url=${encodeURIComponent(url)}`);
    if (!apiRes.ok) throw new Error('Cache check failed');
    const data = await apiRes.json();
    return { success: true, cached: data.cached };
  } catch {
    return { success: false, cached: false };
  }
}
