import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, FileText, Loader2, Sparkles, Trash2, X, Globe, Settings } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import Toast from './Toast';
import type { ToastType } from './Toast';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedPage {
  url: string;
  title: string;
}

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

// Chat histories keyed by URL (or '__all__' for cross-page)
type ChatHistories = Record<string, ChatMessage[]>;

const STORAGE_KEY = 'ai_research_chat';
const ALL_PAGES_KEY = '__all__';
const MAX_MESSAGES = 50;

export default function Popup() {
  const [chatHistories, setChatHistories] = useState<ChatHistories>({});
  const [input, setInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [activeTab, setActiveTab] = useState<string>(ALL_PAGES_KEY);
  const [extractProgress, setExtractProgress] = useState({ step: '', percent: 0, active: false });
  const [typingContent, setTypingContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoaded = useRef(false);
  const activeTabRef = useRef(activeTab);

  // Keep ref in sync with state
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Current tab's messages
  const messages = chatHistories[activeTab] || [];
  // Uses ref so the callback identity is stable (no stale closure during typing)
  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setChatHistories(prev => {
      const tab = activeTabRef.current;
      const current = prev[tab] || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [tab]: next.slice(-MAX_MESSAGES) };
    });
  }, []);

  // Restore on mount
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, 'gemini_api_key'], (result) => {
      if (result.gemini_api_key) setApiKey(result.gemini_api_key as string);
      if (result[STORAGE_KEY]) {
        try {
          const saved = JSON.parse(result[STORAGE_KEY] as string);
          if (saved.chatHistories) setChatHistories(saved.chatHistories);
          if (saved.extractedPages) setExtractedPages(saved.extractedPages);
          if (saved.activeTab) setActiveTab(saved.activeTab);
        } catch { /* corrupt data */ }
      }
      hasLoaded.current = true;
    });
  }, []);

  // Save on change
  useEffect(() => {
    if (!hasLoaded.current) return;
    chrome.storage.local.set({
      gemini_api_key: apiKey,
      [STORAGE_KEY]: JSON.stringify({ chatHistories, extractedPages, activeTab })
    });
  }, [chatHistories, extractedPages, activeTab, apiKey]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (typingTimerRef.current) clearInterval(typingTimerRef.current); };
  }, []);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const animateResponse = useCallback((fullText: string) => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setIsTyping(true);
    setTypingContent('');
    let i = 0;
    const chunkSize = Math.max(3, Math.ceil(fullText.length / 100));
    typingTimerRef.current = setInterval(() => {
      i += chunkSize;
      if (i >= fullText.length) {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setIsTyping(false);
        setTypingContent('');
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
      } else {
        setTypingContent(fullText.substring(0, i));
      }
    }, 30);
  }, []);

  const handleExtractContext = async () => {
    setIsExtracting(true);
    setExtractProgress({ step: 'Scraping page content...', percent: 20, active: true });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        setIsExtracting(false);
        setExtractProgress({ step: '', percent: 0, active: false });
        return;
      }

      if (extractedPages.some(p => p.url === tab.url)) {
        showToast('This page is already extracted!', 'info');
        setIsExtracting(false);
        setExtractProgress({ step: '', percent: 0, active: false });
        return;
      }

      const isPdf = tab.url.toLowerCase().endsWith('.pdf');
      setExtractProgress({
        step: isPdf ? 'Downloading & parsing PDF...' : 'Processing & embedding...',
        percent: 60,
        active: true
      });

      const response = await chrome.runtime.sendMessage({
        action: 'EXTRACT_PAGE',
        tabId: tab.id,
        url: tab.url
      });

      if (response?.success) {
        setExtractProgress({ step: 'Stored successfully!', percent: 100, active: true });
        const pageTitle = tab.title || new URL(tab.url).hostname;
        const newPage = { url: tab.url!, title: pageTitle };
        setExtractedPages(prev => [...prev, newPage]);
        // Add welcome message to the new page's chat
        setChatHistories(prev => ({
          ...prev,
          [tab.url!]: [{ role: 'assistant', content: `✅ **${isPdf ? 'PDF' : 'Page'} extracted:** *${pageTitle}*\n\nAsk me anything about this ${isPdf ? 'document' : 'page'}!` }]
        }));
        setActiveTab(tab.url!); // Switch to the new tab
        showToast(isPdf ? 'PDF extracted!' : 'Page extracted!', 'success');
        setTimeout(() => setExtractProgress({ step: '', percent: 0, active: false }), 2000);
      } else {
        setExtractProgress({ step: '', percent: 0, active: false });
        showToast(
          isPdf
            ? 'Failed to extract PDF. Is the backend server running?'
            : 'Failed to extract. Try refreshing the page first.',
          'error'
        );
      }
    } catch (error) {
      console.error(error);
      setExtractProgress({ step: '', percent: 0, active: false });
      showToast('Extraction error. Is the backend server running?', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSummarize = async () => {
    if (isSending || extractedPages.length === 0) return;
    setIsSending(true);
    setMessages(prev => [...prev, { role: 'user', content: '📋 Summarize this page' }]);
    try {
      const urls = activeTab === ALL_PAGES_KEY
        ? extractedPages.map(p => p.url)
        : [activeTab];
      if (urls.length === 0) { setIsSending(false); return; }
      const response = await chrome.runtime.sendMessage({
        action: 'SUMMARIZE',
        url: urls[0],
        urls
      });
      if (response?.success) {
        animateResponse(response.data);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Failed to generate summary.' }]);
        showToast('Summary generation failed', 'error');
      }
    } catch (error) { console.error(error); }
    finally { setIsSending(false); }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    const userQuery = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsSending(true);
    try {
      const urls = activeTab === ALL_PAGES_KEY
        ? extractedPages.map(p => p.url)
        : [activeTab];
      if (urls.length === 0) { setIsSending(false); return; }
      const response = await chrome.runtime.sendMessage({
        action: 'CHAT',
        query: userQuery,
        url: urls[0],
        urls,
        history: messages.slice(-6)
      });
      if (response?.success) {
        animateResponse(response.data);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error generating answer.' }]);
        showToast('Failed to generate answer', 'error');
      }
    } catch (error) { console.error(error); }
    finally { setIsSending(false); }
  };

  const handleRemoveTab = (url: string) => {
    setExtractedPages(prev => prev.filter(p => p.url !== url));
    setChatHistories(prev => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
    if (activeTab === url) setActiveTab(ALL_PAGES_KEY);
    showToast('Page removed', 'info');
  };

  const handleClearAll = () => {
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
    setIsTyping(false);
    setTypingContent('');
    setChatHistories({});
    setExtractedPages([]);
    setActiveTab(ALL_PAGES_KEY);
    chrome.storage.local.remove(STORAGE_KEY);
    showToast('All data cleared', 'info');
  };

  const hasContext = extractedPages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Header */}
      <header className="header">
        <span className="header__title">🔬 PageMind</span>
        <div className="header__actions">
          <button onClick={() => setShowSettings(!showSettings)} className="btn btn--ghost" title="Settings">
            <Settings className="icon" style={{ width: 14, height: 14 }} />
          </button>
          {hasContext && (
            <button onClick={handleSummarize} disabled={isSending} className="btn btn--ghost" title="Summarize">
              <Sparkles className="icon" />
            </button>
          )}
          <button onClick={handleExtractContext} disabled={isExtracting}
            className={`btn ${hasContext ? 'btn--ghost' : 'btn--primary'}`}>
            {isExtracting ? <Loader2 className="icon animate-spin" /> : <FileText className="icon" />}
            {hasContext ? '+ Page' : 'Extract'}
          </button>
          {hasContext && (
            <button onClick={handleClearAll} className="btn btn--ghost" title="Clear all" style={{ color: 'var(--error)' }}>
              <Trash2 className="icon" />
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      {extractProgress.active && (
        <div className="progress-bar">
          <div className="progress-bar__track">
            <div className="progress-bar__fill" style={{ width: `${extractProgress.percent}%` }} />
          </div>
          <div className="progress-bar__label">{extractProgress.step}</div>
        </div>
      )}

      {/* Settings View */}
      {showSettings && (
        <div style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Settings (Optional)</h3>
          <p style={{ fontSize: '12px', marginBottom: '12px', opacity: 0.8, lineHeight: 1.4 }}>
            Enter your free Google Gemini API key to avoid shared limits. If left blank, the server's default limits apply.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            autoComplete="off"
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid var(--border-color)', 
              backgroundColor: 'var(--bg-primary)', 
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          />
        </div>
      )}

      {/* Tab Bar */}
      {extractedPages.length > 0 && (
        <div className="tab-bar">
          {/* All Pages tab */}
          <button
            className={`tab-bar__tab ${activeTab === ALL_PAGES_KEY ? 'tab-bar__tab--active' : ''}`}
            onClick={() => !isTyping && setActiveTab(ALL_PAGES_KEY)}
            title="Ask across all pages"
          >
            <Globe style={{ width: 11, height: 11, flexShrink: 0 }} />
            <span>All</span>
          </button>

          {/* Individual page tabs */}
          {extractedPages.map((page) => (
            <button
              key={page.url}
              className={`tab-bar__tab ${activeTab === page.url ? 'tab-bar__tab--active' : ''}`}
              onClick={() => !isTyping && setActiveTab(page.url)}
              title={page.title}
            >
              <span className="tab-bar__tab-text">
                {page.title.length > 18 ? page.title.substring(0, 18) + '…' : page.title}
              </span>
              <span
                className="tab-bar__tab-close"
                onClick={(e) => { e.stopPropagation(); handleRemoveTab(page.url); }}
              >
                <X style={{ width: 10, height: 10 }} />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Chat Area */}
      <main className="chat-area">
        {messages.length === 0 && !isTyping && (
          <div className="chat-area__empty">
            <FileText className="chat-area__empty-icon" />
            {hasContext ? (
              <p>{activeTab === ALL_PAGES_KEY
                ? 'Ask a question across all extracted pages!'
                : 'Ask a question about this page!'}</p>
            ) : (
              <>
                <p>Click <strong>"Extract"</strong> to ingest the current page,<br />then ask me anything about it.</p>
                <p style={{ fontSize: 11, opacity: 0.6 }}>You can extract multiple pages for cross-page Q&A!</p>
              </>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message message--${msg.role}`}>
            <div className="message__bubble">
              {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
            </div>
          </div>
        ))}

        {isTyping && typingContent && (
          <div className="message message--assistant">
            <div className="message__bubble">
              <span className="markdown-body" style={{ whiteSpace: 'pre-wrap' }}>{typingContent}</span>
            </div>
          </div>
        )}

        {isSending && !isTyping && (
          <div className="message message--assistant">
            <div className="message__bubble">
              <div className="typing-indicator">
                <div className="typing-indicator__dot" />
                <div className="typing-indicator__dot" />
                <div className="typing-indicator__dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="input-footer">
        <form onSubmit={handleSendMessage} className="input-footer__form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasContext
              ? (activeTab === ALL_PAGES_KEY ? "Ask across all pages..." : "Ask about this page...")
              : "Extract a page first..."}
            className="input-footer__input"
            disabled={isSending || !hasContext}
          />
          <button type="submit" disabled={isSending || !input.trim() || !hasContext} className="input-footer__send">
            <Send className="icon" />
          </button>
        </form>
      </footer>
    </div>
  );
}
