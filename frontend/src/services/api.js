import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60000, // 60 s — enough for parse & chunk
});

/** Dedicated client with longer timeout for clone requests (large repos). */
const cloneClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 180000, // 3 minutes
});

/** Dedicated client for embedding & FAISS — can take 1-2 min on large repos. */
const longRunningClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 600000, // 10 minutes
});

/**
 * Health check – returns { status: "healthy" } or throws.
 */
export const healthCheck = async () => {
  const { data } = await apiClient.get("/health");
  return data;
};

/**
 * Send a message to Gemini via the backend.
 * @param {string} message
 * @returns {Promise<{ reply: string }>}
 */
export const sendMessageToGemini = async (message) => {
  const { data } = await apiClient.post("/test-gemini", { message });
  return data;
};

// ---------------------------------------------------------------------------
// Repository endpoints
// ---------------------------------------------------------------------------

/**
 * Clone a public GitHub repository.
 * @param {string} repositoryUrl
 * @returns {Promise<import('../types').RepositoryMeta>}
 */
export const cloneRepository = async (repositoryUrl) => {
  const { data } = await cloneClient.post("/repository/clone", {
    repository_url: repositoryUrl,
  });
  return data;
};

/**
 * Fetch all supported source files in the active repository clone.
 * @returns {Promise<{ files: Array, total: number }>}
 */
export const getRepositoryFiles = async () => {
  const { data } = await apiClient.get("/repository/files");
  return data;
};

/**
 * Fetch the directory tree of the active repository clone.
 * @returns {Promise<{ tree: Array }>}
 */
export const getRepositoryTree = async () => {
  const { data } = await apiClient.get("/repository/tree");
  return data;
};

/**
 * Delete the currently cloned repository from disk.
 * @returns {Promise<{ status: string, message: string }>}
 */
export const deleteRepository = async () => {
  const { data } = await apiClient.delete("/repository");
  return data;
};

// ---------------------------------------------------------------------------
// Parser endpoints
// ---------------------------------------------------------------------------

/**
 * Parse the currently cloned repository.
 * @param {string} [repositoryName]
 * @returns {Promise<{ status: string, files_parsed: number, classes: number, functions: number, languages: string[] }>}
 */
export const parseRepository = async (repositoryName = "") => {
  const { data } = await apiClient.post("/parser/parse", {
    repository_name: repositoryName,
  });
  return data;
};

/**
 * Get the list of all parsed files with counts.
 * @returns {Promise<{ files: Array, total: number }>}
 */
export const getParsedFiles = async () => {
  const { data } = await apiClient.get("/parser/files");
  return data;
};

/**
 * Get full parsed detail for a single file.
 * @param {string} filePath  relative path from repo root
 * @returns {Promise<ParsedFile>}
 */
export const getParsedFile = async (filePath) => {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, "/");
  const { data } = await apiClient.get(`/parser/file/${encoded}`);
  return data;
};

/**
 * Get aggregate repository summary from the parsed index.
 * @returns {Promise<{ total_files: number, total_classes: number, total_functions: number, languages: string[] }>}
 */
export const getRepositorySummary = async () => {
  const { data } = await apiClient.get("/parser/repository-summary");
  return data;
};

// ---------------------------------------------------------------------------
// Chunk endpoints (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Generate semantic chunks from the parsed repository.
 * @param {string} [repositoryName]
 * @returns {Promise<GenerateResponse>}
 */
export const generateChunks = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await apiClient.post(`/chunk/generate${params}`);
  return data;
};

/**
 * List chunks with optional filters.
 * @param {{ language?: string, chunk_type?: string, search?: string, file_path?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<{ chunks: Array, total: number }>}
 */
export const listChunks = async (filters = {}) => {
  const { data } = await apiClient.get("/chunk/list", { params: filters });
  return data;
};

/**
 * Get full detail for a single chunk by ID.
 * @param {string} chunkId
 * @returns {Promise<Chunk>}
 */
export const getChunk = async (chunkId) => {
  const { data } = await apiClient.get(`/chunk/${chunkId}`);
  return data;
};

/**
 * Get aggregate chunk statistics.
 * @returns {Promise<ChunkStatistics>}
 */
export const getChunkStatistics = async () => {
  const { data } = await apiClient.get("/chunk/statistics");
  return data;
};

// ---------------------------------------------------------------------------
// Embedding endpoints (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for all current chunks.
 * @param {string} [repositoryName]
 * @returns {Promise<EmbeddingGenerateResponse>}
 */
export const generateEmbeddings = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await longRunningClient.post(`/embeddings/generate${params}`);
  return data;
};

/**
 * Regenerate embeddings only for changed chunks.
 * @param {string} [repositoryName]
 * @returns {Promise<EmbeddingGenerateResponse>}
 */
export const regenerateEmbeddings = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await longRunningClient.post(`/embeddings/regenerate${params}`);
  return data;
};

/**
 * Get embedding generation statistics.
 * @returns {Promise<EmbeddingStatistics>}
 */
export const getEmbeddingStatistics = async () => {
  const { data } = await apiClient.get("/embeddings/statistics");
  return data;
};

/**
 * Get live generation progress snapshot.
 * @returns {Promise<EmbeddingProgress|null>}
 */
export const getEmbeddingProgress = async () => {
  const { data } = await apiClient.get("/embeddings/progress");
  return data;
};

/**
 * List embedding metadata (no vectors).
 * @param {{ language?: string, chunk_type?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<{ embeddings: Array, total: number }>}
 */
export const listEmbeddings = async (filters = {}) => {
  const { data } = await apiClient.get("/embeddings/list", { params: filters });
  return data;
};

// ---------------------------------------------------------------------------
// Vector Store endpoints (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Build the FAISS index from current embeddings.
 * @param {string} [repositoryName]
 * @returns {Promise<BuildResponse>}
 */
export const buildVectorIndex = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await longRunningClient.post(`/vector/build${params}`);
  return data;
};

/**
 * Semantic similarity search.
 * @param {{ query: string, top_k?: number }} body
 * @param {string} [repositoryName]
 * @returns {Promise<SearchResponse>}
 */
export const searchVector = async (body, repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await apiClient.post(`/vector/search${params}`, body);
  return data;
};

/**
 * Get FAISS index statistics.
 * @param {string} [repositoryName]
 * @returns {Promise<VectorStatistics>}
 */
export const getVectorStatistics = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await apiClient.get(`/vector/statistics${params}`);
  return data;
};

/**
 * Delete the FAISS index for a repository.
 * @param {string} [repositoryName]
 */
export const deleteVectorIndex = async (repositoryName = "") => {
  const params = repositoryName ? `?repository_name=${encodeURIComponent(repositoryName)}` : "";
  const { data } = await apiClient.delete(`/vector/index${params}`);
  return data;
};

export default apiClient;

// ---------------------------------------------------------------------------
// RAG Chat endpoints (Phase 7)
// ---------------------------------------------------------------------------

/** Dedicated client with generous timeout for AI generation. */
const chatClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 120000, // 2 minutes for long AI responses
});

/**
 * Send a question to the RAG pipeline (non-streaming).
 * @param {{ repository: string, question: string, top_k?: number, session_id?: string }} body
 * @returns {Promise<RAGResponse>}
 */
export const sendRAGMessage = async (body) => {
  const { data } = await chatClient.post("/chat", body);
  return data;
};

/**
 * Send a question to the RAG pipeline with SSE streaming.
 * Returns a ReadableStream decoder — caller drives iteration.
 *
 * @param {{ repository: string, question: string, top_k?: number, session_id?: string }} body
 * @param {(event: object) => void} onEvent  called for each parsed SSE JSON event
 * @param {() => void}              onDone   called when stream closes
 * @param {(err: Error) => void}    onError  called on fetch / parse error
 * @returns {Promise<void>}
 */
export const streamRAGMessage = async (body, onEvent, onDone, onError) => {
  try {
    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "Stream failed" }));
      throw new Error(err.detail || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr);
              onEvent(event);
            } catch {
              // non-JSON line, ignore
            }
          }
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err);
  }
};

/**
 * Retrieve conversation history for a session.
 * @param {string} sessionId
 * @returns {Promise<ChatHistoryResponse>}
 */
export const getChatHistory = async (sessionId) => {
  const { data } = await apiClient.get("/chat/history", {
    params: { session_id: sessionId },
  });
  return data;
};

/**
 * Clear conversation history for a session.
 * @param {string} sessionId
 */
export const clearChatHistory = async (sessionId) => {
  const { data } = await apiClient.delete("/chat/history", {
    params: { session_id: sessionId },
  });
  return data;
};

