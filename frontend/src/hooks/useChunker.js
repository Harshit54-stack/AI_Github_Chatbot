import { useState, useCallback } from "react";
import { generateChunks, listChunks, getChunk, getChunkStatistics } from "../services/api";

/**
 * useChunker — manages the Phase 4 chunk generation and exploration state.
 *
 * @returns {{
 *   generateSummary: object | null,     // GenerateResponse from POST /chunk/generate
 *   statistics: object | null,          // ChunkStatistics from GET /chunk/statistics
 *   chunks: Array,                      // filtered chunk list rows
 *   totalChunks: number,                // total matching the current filter
 *   selectedChunk: object | null,       // full Chunk detail
 *   isGenerating: boolean,
 *   isLoadingList: boolean,
 *   isLoadingChunk: boolean,
 *   generateError: string | null,
 *   listError: string | null,
 *   chunkError: string | null,
 *   triggerGenerate: (name?: string) => Promise<void>,
 *   applyFilters: (filters: object) => Promise<void>,
 *   selectChunk: (chunkId: string) => Promise<void>,
 *   clearChunk: () => void,
 *   clearErrors: () => void,
 * }}
 */
export function useChunker() {
  const [generateSummary, setGenerateSummary] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [selectedChunk, setSelectedChunk] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [listError, setListError] = useState(null);
  const [chunkError, setChunkError] = useState(null);

  /** Run the generation pipeline then load initial list + statistics. */
  const triggerGenerate = useCallback(async (repositoryName = "") => {
    setIsGenerating(true);
    setGenerateError(null);
    setSelectedChunk(null);

    try {
      const summary = await generateChunks(repositoryName);
      setGenerateSummary(summary);

      // Fetch statistics and initial unfiltered list in parallel
      const [stats, listResult] = await Promise.all([
        getChunkStatistics(),
        listChunks({ limit: 500 }),
      ]);
      setStatistics(stats);
      setChunks(listResult.chunks);
      setTotalChunks(listResult.total);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Chunk generation failed. Make sure the repository is parsed first.";
      setGenerateError(detail);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /** Re-fetch the chunk list with updated filters. */
  const applyFilters = useCallback(async (filters = {}) => {
    setIsLoadingList(true);
    setListError(null);

    try {
      const result = await listChunks({ limit: 500, ...filters });
      setChunks(result.chunks);
      setTotalChunks(result.total);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to load chunks.";
      setListError(detail);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  /** Load full detail for a selected chunk. */
  const selectChunk = useCallback(async (chunkId) => {
    setIsLoadingChunk(true);
    setChunkError(null);
    setSelectedChunk(null);

    try {
      const detail = await getChunk(chunkId);
      setSelectedChunk(detail);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to load chunk detail.";
      setChunkError(detail);
    } finally {
      setIsLoadingChunk(false);
    }
  }, []);

  const clearChunk = useCallback(() => setSelectedChunk(null), []);

  const clearErrors = useCallback(() => {
    setGenerateError(null);
    setListError(null);
    setChunkError(null);
  }, []);

  return {
    generateSummary,
    statistics,
    chunks,
    totalChunks,
    selectedChunk,
    isGenerating,
    isLoadingList,
    isLoadingChunk,
    generateError,
    listError,
    chunkError,
    triggerGenerate,
    applyFilters,
    selectChunk,
    clearChunk,
    clearErrors,
  };
}
