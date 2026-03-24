# PageMind - AI-Powered Web Research Assistant

PageMind is an AI-powered Google Chrome extension and backend service designed to extract, process, and query information from active web pages and PDFs. It uses a Retrieval-Augmented Generation (RAG) approach to answer contextual queries based on user research.

## Features
- **Multi-Tab Research Management**: A responsive frontend interface with horizontal scrolling to track and manage multiple research sessions simultaneously.
- **Context-Aware AI Assistant**: Uses LangChain and Google Gemini to provide intelligent responses based on page content.
- **MongoDB Vector Store**: Embeddings and semantic search built on MongoDB to quickly retrieve relevant information from scanned pages.
- **Bring Your Own Key (BYOK)**: A cost-management architecture that allows users to supply their own API keys (Gemini/OpenAI) if preferred.
- **Secure & Production Ready**: Implements strict backend API rate-limiting, CORS policies, and minimal Chrome Manifest V3 permissions.

## Tech Stack
- **Frontend (Chrome Extension):** React, TypeScript, Vite, Tailwind CSS
- **Backend (API Service):** Node.js, Express, TypeScript
- **Database:** MongoDB (Vector Search)
- **AI/ML:** LangChain, Google Gemini, Retrieval-Augmented Generation (RAG)

## Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas cluster (with Vector Search enabled)
- Google Gemini API Key

### 1. Backend Setup
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory with the following variables:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   ```
4. Start the backend development server:
   ```bash
   npm run dev
   ```

### 2. Extension Setup
1. Navigate to the `extension` directory:
   ```bash
   cd extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the `extension/dist` folder.

## Authors
- Yashneel Singh
