import { useState, useCallback } from "react";
import {
  buildVectorIndex,
  searchVector,
  getVectorStatistics,
  deleteVectorIndex,
} from "../services/api";

/**
 * useVectorStore — manages the Phase 6 FAISS vector database state.
 *
 * Handles:
 *  - Building the FAISS index
 *  - Running semantic similarity searches
 *  - Loading index statistics
 *  - Deleting the index
 *
 * @returns {{
 *   statistics: object | null,
 *   buildResult: object | null,
 *   searchResults: object | null,
 *   isBuilding: boolean,
 *   isSearching: boolean,
 *   buildError: string | null,
 *   searchError: string | null,
 *   statsError: string | null,
 *   triggerBuild: (name?: string) => Promise<void>,
 *   triggerSearch: (query: string, topK: number, name?: string) => Promise<void>,
 *   triggerDelete: (name?: string) => Promise<void>,
 *   clearErrors: () => void,
 *   clearResults: () => void,
 * }}
 */
export function useVectorStore() {
  const [statistics, setStatistics] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [searchResults, setSearchResults] = useState(null);

  const [isBuilding, setIsBuilding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [buildError, setBuildError] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [statsError, setStatsError] = useState(null);

  const loadStats = useCallback(async (repoName) => {
    try {
      const stats = await getVectorStatistics(repoName);
      setStatistics(stats);
      setStatsError(null);
    } catch (err) {
      // 404 means no index exists yet — that's fine on first visit
      if (err?.response?.status !== 404) {
        const detail =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          "Failed to load index statistics.";
        setStatsError(detail);
      }
    }
  }, []);

  const triggerBuild = useCallback(async (repositoryName = "") => {
    setIsBuilding(true);
    setBuildError(null);
    setStatsError(null);
    try {
      const result = await buildVectorIndex(repositoryName);
      setBuildResult(result);
      await loadStats(repositoryName);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Index build failed. Make sure embeddings are generated first.";
      setBuildError(detail);
    } finally {
      setIsBuilding(false);
    }
  }, [loadStats]);

  const triggerSearch = useCallback(async (query, topK = 5, repositoryName = "") => {
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const result = await searchVector({ query, top_k: topK }, repositoryName);
      setSearchResults(result);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Search failed. Build the vector index first.";
      setSearchError(detail);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const triggerDelete = useCallback(async (repositoryName = "") => {
    try {
      await deleteVectorIndex(repositoryName);
      setStatistics(null);
      setBuildResult(null);
      setSearchResults(null);
    } catch (err) {
      const detail = err?.response?.data?.detail || "Failed to delete index.";
      setStatsError(detail);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setBuildError(null);
    setSearchError(null);
    setStatsError(null);
  }, []);

  const clearResults = useCallback(() => setSearchResults(null), []);

  return {
    statistics,
    buildResult,
    searchResults,
    isBuilding,
    isSearching,
    buildError,
    searchError,
    statsError,
    loadStats,
    triggerBuild,
    triggerSearch,
    triggerDelete,
    clearErrors,
    clearResults,
  };
}
