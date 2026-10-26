import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import ExplorerPage from "./pages/ExplorerPage";
import ChunkExplorerPage from "./pages/ChunkExplorerPage";
import EmbeddingsDashboard from "./pages/EmbeddingsDashboard";
import VectorDashboard from "./pages/VectorDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/chunks" element={<ChunkExplorerPage />} />
        <Route path="/embeddings" element={<EmbeddingsDashboard />} />
        <Route path="/vector" element={<VectorDashboard />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
