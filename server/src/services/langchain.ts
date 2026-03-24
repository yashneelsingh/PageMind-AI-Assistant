import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { PromptTemplate } from '@langchain/core/prompts';
import { getCollection } from './mongo';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini Embeddings and LLM dynamically taking an optional user key
export function getEmbeddings(customKey?: string) {
  return new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-001",
    apiKey: customKey || process.env.GEMINI_API_KEY,
  });
}

export function getLLM(customKey?: string) {
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: customKey || process.env.GEMINI_API_KEY,
  });
}

// ── Check if a URL is already cached in MongoDB ──
export async function isUrlCached(url: string): Promise<boolean> {
  const collection = await getCollection();
  const existing = await collection.findOne({ url });
  return !!existing;
}

// ── Process and store page text with improved chunking ──
export async function processAndStoreText(url: string, title: string, text: string, customKey?: string) {
  // Delete old documents for this URL (re-extract = fresh data)
  const collection = await getCollection();
  await collection.deleteMany({ url });

  // Clean the text: 
  // 1. Remove pdf-parse injected page markers like "-- 1 of 130 --"
  // 2. Remove "fill in the blank" underscore lines (e.g. "_____")
  const cleanText = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '\n')
    .replace(/_{4,}/g, '') // remove 4 or more consecutive underscores
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines into 2
    .trim();

  // Improved chunking: larger overlap for better context continuity
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 300,
    separators: ['\n\n', '\n', '. ', '! ', '? ', ', ', ' ', ''],
  });

  // Create documents from the cleaned text
  const rawDocs = await textSplitter.createDocuments([cleanText], [{ url, title }]);

  // Filter out tiny/meaningless chunks that pollute the vector space
  const docs = rawDocs.filter(doc => doc.pageContent.trim().length >= 100);

  if (docs.length === 0) {
    console.log(`[RAG] Warning: No clean chunks extracted for ${url}`);
    return;
  }

  // Generate Embeddings and store via MongoDB Atlas Vector Search
  const embeddings = getEmbeddings(customKey);
  await MongoDBAtlasVectorSearch.fromDocuments(docs, embeddings, {
    collection: collection as any,
    indexName: "default",
    textKey: "text",
    embeddingKey: "embedding",
  });
}

// ── Generate RAG answer with follow-up awareness and multi-page context ──
export async function generateRAGAnswer(
  query: string,
  url: string,
  history: { role: string; content: string }[] = [],
  urls: string[] = [],
  customKey?: string
) {
  const collection = await getCollection();
  const embeddings = getEmbeddings(customKey);
  const llm = getLLM(customKey);

  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection: collection as any,
    indexName: "default",
    textKey: "text",
    embeddingKey: "embedding",
  });

  // Multi-page context: use all extracted URLs, fallback to single URL
  const targetUrls = urls.length > 0 ? urls : [url];
  const urlFilter = targetUrls.length === 1
    ? { preFilter: { url: { $eq: targetUrls[0] } } }
    : { preFilter: { url: { $in: targetUrls } } };

  const retriever = vectorStore.asRetriever({
    k: 6, // retrieve more chunks for better answers
    filter: urlFilter
  });

  const relevantDocs = await retriever.invoke(query);
  const context = relevantDocs.map((doc: any) => doc.pageContent).join("\n\n");
  console.log(`[RAG] Retriever filter: ${JSON.stringify(urlFilter)}`);
  console.log(`[RAG] Retrieved ${relevantDocs.length} documents. Total context size: ${context.length} chars.`);

  // Build conversation history string for follow-up awareness
  const historyStr = history.length > 0
    ? history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
    : 'No previous messages.';

  const promptTemplate = PromptTemplate.fromTemplate(`
    You are an AI Research Assistant. Your job is to help the user understand web page content.
    
    RULES:
    - Answer based strictly on the provided context from extracted pages.
    - If the answer is not in the context, say "I don't have enough information from the extracted pages to answer that."
    - Use markdown formatting for better readability (bold, lists, code blocks, etc.)
    - Be concise but thorough.
    - Consider the conversation history for follow-up questions.
    
    Conversation History:
    {history}

    Extracted Page Context:
    {context}

    User's Question:
    {question}

    Answer (use markdown formatting):
  `);

  const prompt = await promptTemplate.format({
    history: historyStr,
    context,
    question: query
  });

  const response = await llm.invoke(prompt);
  return response.content as string;
}

// ── Summarize endpoint ──
export async function summarizePage(url: string, urls: string[] = [], customKey?: string) {
  const collection = await getCollection();
  const embeddings = getEmbeddings(customKey);
  const llm = getLLM(customKey);

  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection: collection as any,
    indexName: "default",
    textKey: "text",
    embeddingKey: "embedding",
  });

  const targetUrls = urls.length > 0 ? urls : [url];
  const urlFilter = targetUrls.length === 1
    ? { preFilter: { url: { $eq: targetUrls[0] } } }
    : { preFilter: { url: { $in: targetUrls } } };

  const retriever = vectorStore.asRetriever({
    k: 10, // get more chunks for a comprehensive summary
    filter: urlFilter
  });

  const relevantDocs = await retriever.invoke("summarize the main content and key points");
  const context = relevantDocs.map((doc: any) => doc.pageContent).join("\n\n");

  const prompt = `You are an AI Research Assistant. Provide a comprehensive, well-structured summary of the following content using markdown formatting.

Include:
- **Main Topic**: What the page is about
- **Key Points**: The most important information (use bullet points)
- **Notable Details**: Any significant facts, figures, or conclusions

Content:
${context}

Summary (use markdown formatting):`;

  const response = await llm.invoke(prompt);
  return response.content as string;
}
