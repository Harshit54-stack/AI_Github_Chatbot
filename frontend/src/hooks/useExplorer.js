import { useState, useCallback } from "react";
import {
  parseRepository,
  getParsedFiles,
  getParsedFile,
  getRepositorySummary,
} from "../services/api";

/**
 * useExplorer — manages the Repository Explorer state.
 *
 * Responsibilities:
 *  - Triggering a parse run and storing the summary
 *  - Fetching the flat file list and building a path → entry map
 *  - Fetching full ParsedFile detail on file selection
 *  - Fetching the aggregate repository summary
 *
 * @returns {{
 *   parseSummary: object | null,
 *   parsedFilesMap: object,       // { [relativePath]: FileListEntry }
 *   repoSummary: object | null,
 *   selectedFile: object | null,  // full ParsedFile detail
 *   selectedPath: string | null,
 *   isParsing: boolean,
 *   isLoadingFile: boolean,
 *   parseError: string | null,
 *   fileError: string | null,
 *   triggerParse: (name?: string) => Promise<void>,
 *   selectFile: (path: string) => Promise<void>,
 *   clearErrors: () => void,
 * }}
 */
export function useExplorer() {
  const [parseSummary, setParseSummary] = useState(null);
  const [parsedFilesMap, setParsedFilesMap] = useState({});
  const [repoSummary, setRepoSummary] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [fileError, setFileError] = useState(null);

  /** Run the full parse pipeline and populate the file map. */
  const triggerParse = useCallback(async (repositoryName = "") => {
    setIsParsing(true);
    setParseError(null);
    setSelectedFile(null);
    setSelectedPath(null);

    try {
      // 1. Parse
      const summary = await parseRepository(repositoryName);
      setParseSummary(summary);

      // 2. Fetch file list
      const { files } = await getParsedFiles();
      const map = {};
      for (const entry of files) {
        map[entry.file] = entry;
      }
      setParsedFilesMap(map);

      // 3. Fetch repo summary
      const repoSum = await getRepositorySummary();
      setRepoSummary(repoSum);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Parsing failed. Make sure a repository is cloned first.";
      setParseError(detail);
    } finally {
      setIsParsing(false);
    }
  }, []);

  /** Load full detail for the selected file. */
  const selectFile = useCallback(async (path) => {
    setSelectedPath(path);
    setSelectedFile(null);
    setFileError(null);
    setIsLoadingFile(true);

    try {
      const detail = await getParsedFile(path);
      setSelectedFile(detail);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Failed to load file details.";
      setFileError(detail);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setParseError(null);
    setFileError(null);
  }, []);

  return {
    parseSummary,
    parsedFilesMap,
    repoSummary,
    selectedFile,
    selectedPath,
    isParsing,
    isLoadingFile,
    parseError,
    fileError,
    triggerParse,
    selectFile,
    clearErrors,
  };
}
