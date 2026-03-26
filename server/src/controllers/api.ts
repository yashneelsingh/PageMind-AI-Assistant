import { Request, Response } from 'express';
import { processAndStoreText, generateRAGAnswer, summarizePage, isUrlCached } from '../services/langchain';
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

export const extractPdf = async (req: Request, res: Response) => {
  try {
    const { url, title } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log(`[PDF] Parsing PDF from: ${url}`);

    // Fetch the PDF as a Blob
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) throw new Error(`Failed to fetch PDF: ${fetchRes.statusText}`);
    const blob = await fetchRes.blob();

    // Use WebPDFLoader which is Serverless-compatible (no native canvas dependencies)
    const loader = new WebPDFLoader(blob);
    const docs = await loader.load();
    
    const text = docs.map(doc => doc.pageContent).join('\n').trim();

    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'Could not extract text from PDF (may be scanned/image-only)' });
    }

    const totalPages = docs.length || 0;
    console.log(`[PDF] Extracted ${text.length} chars, ${totalPages} pages`);

    // Truncate to 200k chars for PDFs
    const truncatedText = text.substring(0, 200000);
    const pageTitle = title || `PDF (${totalPages} pages)`;

    // Process through the existing embedding pipeline
    const customKey = req.headers['x-gemini-api-key'] as string | undefined;
    await processAndStoreText(url, pageTitle, truncatedText, customKey);

    res.status(200).json({ success: true, message: 'PDF processed successfully.', pages: totalPages });
  } catch (error) {
    console.error('[PDF] Error extracting PDF:', error);
    res.status(500).json({ error: 'Failed to extract PDF' });
  }
};

export const processPage = async (req: Request, res: Response) => {
  try {
    const { url, title, text } = req.body;
    
    if (!url || !text) {
      return res.status(400).json({ error: 'Missing url or text' });
    }

    const customKey = req.headers['x-gemini-api-key'] as string | undefined;
    await processAndStoreText(url, title, text, customKey);
    res.status(200).json({ success: true, message: 'Page processed and stored successfully.' });
  } catch (error) {
    console.error('Error in processPage:', error);
    res.status(500).json({ error: 'Failed to process page' });
  }
};

export const chat = async (req: Request, res: Response) => {
  try {
    const { query, url, history = [], urls = [] } = req.body;

    if (!query || !url) {
      return res.status(400).json({ error: 'Missing query or url' });
    }
    
    console.log(`[CHAT API] query: "${query}", url: "${url}", urls: ${JSON.stringify(urls)}, history length: ${history.length}`);

    const customKey = req.headers['x-gemini-api-key'] as string | undefined;
    const answer = await generateRAGAnswer(query, url, history, urls, customKey);
    res.status(200).json({ success: true, answer });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: 'Failed to generate answer' });
  }
};

export const summarize = async (req: Request, res: Response) => {
  try {
    const { url, urls = [] } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    const customKey = req.headers['x-gemini-api-key'] as string | undefined;
    const summary = await summarizePage(url, urls, customKey);
    res.status(200).json({ success: true, answer: summary });
  } catch (error) {
    console.error('Error in summarize:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

export const checkCache = async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;

    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const cached = await isUrlCached(url);
    res.status(200).json({ cached });
  } catch (error) {
    console.error('Error in checkCache:', error);
    res.status(500).json({ error: 'Failed to check cache' });
  }
};
