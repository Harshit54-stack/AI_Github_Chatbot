# 🤖 AI GitHub Repository Assistant — Phase 1

A production-quality full-stack application that allows users to paste a GitHub repository URL and chat with the codebase using **Google Gemini AI**. This is **Phase 1** — project foundation, Gemini integration, and frontend ↔ backend communication.

---

## 🏗️ Architecture Overview

```
ai-github-assistant/
├── backend/                   # FastAPI Python server
│   ├── app/
│   │   ├── api/               # Route definitions
│   │   │   ├── __init__.py
│   │   │   └── routes.py      # GET /, GET /health, POST /test-gemini
│   │   ├── models/            # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   └── chat.py
│   │   ├── services/          # Business logic / AI integrations
│   │   │   ├── __init__.py
│   │   │   └── gemini_service.py
│   │   ├── utils/             # Shared helpers
│   │   │   ├── __init__.py
│   │   │   └── helpers.py
│   │   ├── config.py          # Environment & settings
│   │   └── main.py            # FastAPI app factory + CORS
│   ├── .env.example
│   ├── .gitignore
│   └── requirements.txt
│
└── frontend/                  # React + Vite + Tailwind CSS app
    ├── src/
    │   ├── components/        # Reusable UI components
    │   │   ├── ChatInput.jsx
    │   │   ├── ErrorNotification.jsx
    │   │   ├── LoadingSpinner.jsx
    │   │   ├── MessageBubble.jsx
    │   │   └── Sidebar.jsx
    │   ├── hooks/             # Custom React hooks
    │   │   └── useChat.js     # Chat state + API orchestration
    │   ├── layouts/
    │   │   └── MainLayout.jsx # Full-viewport dark wrapper
    │   ├── pages/
    │   │   ├── HomePage.jsx   # URL input + Analyze button
    │   │   └── ChatPage.jsx   # Live Gemini chat interface
    │   ├── services/
    │   │   └── api.js         # Axios client + API methods
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env
    ├── index.html
    └── package.json
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ai-github-assistant.git
cd ai-github-assistant
```

---

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
copy .env.example .env       # Windows
cp .env.example .env          # macOS / Linux
```

Open `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
DEBUG=false
GEMINI_MODEL=gemini-1.5-flash
```

> **Get your free API key** → https://aistudio.google.com/app/apikey

---

### 3. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install
```

The `.env` file is already pre-configured:

```env
VITE_API_BASE_URL=http://localhost:8000
```

---

### 4. Run the Application

**Terminal 1 — Backend:**

```bash
cd backend
venv\Scripts\activate        # Windows
source venv/bin/activate      # macOS / Linux

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root status check |
| `GET` | `/health` | Health probe |
| `POST` | `/test-gemini` | Send message to Gemini AI |

### POST `/test-gemini`

**Request:**
```json
{ "message": "Hello, what can you do?" }
```

**Response:**
```json
{ "reply": "I'm Gemini, Google's AI model..." }
```

---

## 🛠️ Tech Stack

### Backend
| Package | Purpose |
|---------|---------|
| FastAPI | Async web framework |
| Uvicorn | ASGI server |
| Pydantic | Data validation & schemas |
| python-dotenv | Environment variable loading |
| google-generativeai | Gemini AI SDK |
| httpx | Async HTTP client (Phase 2+) |

### Frontend
| Package | Purpose |
|---------|---------|
| React 19 | UI library |
| Vite | Build tool & dev server |
| Tailwind CSS v4 | Utility-first CSS |
| Axios | HTTP client |
| React Router v7 | Client-side routing |

---

## 📐 Design Decisions

### Async Safety
The Gemini SDK uses a **synchronous** `generate_content()` call internally. To avoid blocking FastAPI's event loop under concurrent requests, the service layer uses `asyncio.to_thread()` to offload the blocking call to a thread pool.

### Separation of Concerns
- **Routes** (`api/routes.py`) — only handle HTTP request/response lifecycle
- **Services** (`services/gemini_service.py`) — contain all AI/business logic
- **Models** (`models/chat.py`) — Pydantic schemas for type safety
- **Config** (`config.py`) — single source of truth for environment settings

### API Service Layer (Frontend)
All HTTP calls go through `src/services/api.js`. **Components never call Axios directly.** This makes it trivial to swap the base URL, add auth headers, or mock in tests.

---

## 🗺️ Roadmap & Current Status

| Phase | Feature | Status |
|-------|---------|--------|
| ✅ **Phase 1** | Project foundation + Gemini chat | Completed |
| ✅ **Phase 2** | GitHub repository cloning + file tree parsing | Completed |
| ✅ **Phase 3** | Tree-sitter multi-language code parsing | Completed |
| ✅ **Phase 4** | Semantic code chunking (classes, functions, modules) | Completed |
| ✅ **Phase 5** | Embedding generation (`bge-base-en-v1.5`) + SHA-256 caching | Completed |
| ✅ **Phase 6** | FAISS vector store index + cosine similarity search | Completed |
| ✅ **Phase 7** | Grounded RAG pipeline + SSE token streaming | Completed |
| ✅ **Phase 8** | Query Intelligence (Evaluation & Rewriting) + Automated Tests | Completed |
| ✅ **Phase 9** | Hybrid Search (BM25 + FAISS) & Retrieval Enhancement | Completed |
| ✅ **Phase 10** | Cross-Encoder Reranking & Advanced RAG Context Selection | Completed |

---

## 🎯 Phase 10 — Cross-Encoder Reranking & Advanced RAG

Phase 10 adds a cross-encoder reranking layer on top of hybrid retrieval to maximize the precision of retrieved context before prompt construction.

### What is Reranking?
> A reranker takes candidate results from retrieval and reorders them according to their deep semantic and lexical relevance to the query.

### Why is Reranking needed?
- **Retrieval finds candidates; Reranking selects the strongest candidates.**
- First-stage retrievers (FAISS bi-encoder and BM25 sparse index) evaluate queries and chunks independently for high speed across large repositories.
- The Cross-Encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) performs simultaneous cross-attention over `(query, code_chunk)` pairs, capturing token interactions and exact intent that bi-encoders miss.

### End-to-End Retrieval Architecture
```text
User Query
    ↓
Query Evaluation (app/services/rag/query_evaluator.py)
    ↓
Query Rewriting (app/services/rag/query_rewriter.py)
    ↓
Hybrid Retrieval
    ┌─────────────────────────┐
    │                         │
    ↓                         ↓
BM25 Keyword Search       FAISS Semantic Search
(bm25_retriever.py)       (retriever.py)
    │                         │
    ↓                         ↓
    └────────────┬────────────┘
                 ↓
      Score Normalisation (0 to 1)
                 ↓
      Weighted Fusion (alpha * FAISS + (1 - alpha) * BM25)
                 ↓
      Candidate Set (~10–15 chunks)
                 ↓
Cross-Encoder Reranker (app/services/rag/reranker.py)
(Full cross-attention re-scoring & normalisation)
                 ↓
      Top-K Best Relevant Chunks (e.g. 5)
                 ↓
Context Manager (app/services/rag/context_manager.py)
                 ↓
Prompt Builder (app/services/rag/prompt_builder.py)
                 ↓
Gemini 2.5 Flash Generation
                 ↓
SSE Streaming to Frontend
```

### Configuration Options (`.env`)
- `RERANKER_MODEL` (default: `"cross-encoder/ms-marco-MiniLM-L-6-v2"`): Local cross-encoder model.
- `RERANKER_ENABLED` (default: `true`): Feature toggle to enable or bypass reranking.
- `RERANKER_CANDIDATE_TOP_K` (default: `15`): Number of candidate chunks pulled from hybrid retrieval.
- `RERANKER_TOP_K_DEFAULT` (default: `5`): Final number of highest-scoring chunks passed to context manager.

---

## 🔍 Phase 9 — Hybrid Search & Retrieval Enhancement

Phase 9 introduces hybrid retrieval by pairing BM25 keyword search with FAISS dense vector search to provide high precision for exact code identifiers and high recall for conceptual queries.

### What is BM25?
> BM25 is a keyword-based information retrieval algorithm that ranks documents according to how relevant their terms are to a query.

### Why BM25 is used
BM25 excels at matching exact code tokens, including:
- Exact function and method names (`generate_embedding`, `build_index`)
- Class and interface names (`QueryRewriter`, `BM25Index`)
- Variable and identifier names
- File names and paths (`faiss_service.py`, `embedding_model.py`)
- Technical keywords and configuration flags

### Why FAISS is still used
FAISS semantic search maps queries and code chunks into a dense embedding space using `BAAI/bge-base-en-v1.5`. It excels at conceptual, semantic questions where the exact keywords may not appear in the source code (e.g., *"How does the system remember previous conversation context?"* or *"How does the assistant retrieve relevant code?"*).

### Why Hybrid Search is useful
```text
BM25  → exact keyword matching (high precision on identifiers)
FAISS → semantic similarity (high recall on concepts)
Hybrid → best of both worlds
```

### Retrieval Architecture & Result Fusion
```text
User Query
    ↓
Query Evaluation (app/services/rag/query_evaluator.py)
    ↓
Query Rewriting (app/services/rag/query_rewriter.py)
    ↓
    ┌─────────────────────────┐
    │                         │
    ↓                         ↓
BM25 Keyword Search       FAISS Semantic Search
(app/services/rag/        (app/services/rag/
 bm25_retriever.py)        retriever.py)
    │                         │
    ↓                         ↓
    └────────────┬────────────┘
                 ↓
      Score Normalisation (min-max to [0, 1])
                 ↓
      Weighted Fusion (alpha * FAISS + (1 - alpha) * BM25)
                 ↓
      Deduplication by Chunk ID
                 ↓
      Final Top-K Ranking
                 ↓
      Context Management (app/services/rag/context_manager.py)
                 ↓
      Prompt Building (app/services/rag/prompt_builder.py)
                 ↓
      Gemini 2.5 Flash Generation
                 ↓
      SSE Streaming to Frontend
```

### Configuration Options (`.env`)
- `BM25_TOP_K` (default `10`): Number of candidate chunks retrieved by BM25.
- `FAISS_CANDIDATE_TOP_K` (default `10`): Number of candidate chunks retrieved by FAISS.
- `HYBRID_FINAL_TOP_K` (default `5`): Final number of chunks returned after fusion.
- `HYBRID_SEMANTIC_WEIGHT` (default `0.7`): Weight $\alpha$ given to FAISS semantic scores ($1 - \alpha$ goes to BM25).

---

## 🧠 Phase 8 — Query Intelligence & Testing

Phase 8 introduces pre-retrieval query intelligence and automated test coverage:

### 1. Query Evaluation (`app/services/rag/query_evaluator.py`)
- **Purpose**: Evaluates whether a user query is meaningful and suitable for repository retrieval *before* vector search.
- **Classification**: Classifies queries into `VALID`, `CODE_KEYWORD`, `GREETING`, `VAGUE`, or `EMPTY`.
- **Behavior**: Rejects non-repository greetings (e.g., "hello") and vague input early with informative feedback, saving compute and avoiding irrelevant searches. Short code keywords (e.g., "faiss", "embeddings") are marked as valid but flagged for rewriting.

### 2. Query Rewriting (`app/services/rag/query_rewriter.py`)
- **Purpose**: Transforms vague or telegraphic questions into clear, retrieval-oriented queries to improve FAISS nearest-neighbor matching.
- **Multi-turn Context**: Takes recent conversation history into account to resolve pronouns (e.g., "how does it work?" → "Explain how the Tree-sitter parser handles syntax trees in this repository.").
- **Fail-Safe Fallback**: If Gemini is unreachable or returns an error, the rewriter gracefully falls back to the original query without breaking the pipeline.

### Query Evaluation vs. Query Rewriting
- **Query Evaluation**: Decides **whether and how** a query should be processed (gatekeeper).
- **Query Rewriting**: **Reformulates and enriches** the query to maximize semantic similarity against code chunks (optimizer).

### 3. Automated Test Suite (`backend/tests/`)
Comprehensive pytest test suite with all external APIs (Gemini, FAISS) mocked:
- `backend/tests/test_query_evaluator.py` — Evaluator rules, intent classification, edge cases.
- `backend/tests/test_query_rewriter.py` — Rewriting prompts, history incorporation, fallback on failure.
- `backend/tests/test_bm25_retriever.py` — Tokenisation, exact identifier matching, indexing.
- `backend/tests/test_hybrid_retriever.py` — Score normalisation, fusion, deduplication, fallback isolation.
- `backend/tests/test_reranker.py` — Cross-encoder reranking, candidate re-ordering, fallback, normalisation.
- `backend/tests/test_rag_integration.py` — End-to-end RAG flow, SSE error events, and token streaming.

**Running Tests:**
```bash
cd backend
python -m pytest tests -v
```

---

## 🔑 Environment Variables Reference

### Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | **Required.** Your Google Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Model variant to use |
| `DEBUG` | `false` | Enable debug logging |

### Frontend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL |

---

## 🧪 Verify the Setup

```bash
# Backend health check
curl http://localhost:8000/health
# → {"status":"healthy"}

# Test Gemini connection
curl -X POST http://localhost:8000/test-gemini \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Say hello!\"}"
# → {"reply":"Hello! How can I help you today?"}
```
