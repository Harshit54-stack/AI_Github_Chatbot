import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./App.css";
import { AuthProvider } from "./context/AuthContext";
import { ChatProvider } from "./context/ChatContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import ExplorerPage from "./pages/ExplorerPage";
import ChunkExplorerPage from "./pages/ChunkExplorerPage";
import EmbeddingsDashboard from "./pages/EmbeddingsDashboard";
import VectorDashboard from "./pages/VectorDashboard";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          {/*
            ChatProvider wraps the entire router so that chat state (messages,
            sessionId, isLoading) lives at the application level and is never
            destroyed by route changes. State is cleared only when the user
            clicks "New Chat" or closes/refreshes the browser tab.
          */}
          <ChatProvider>
            <Routes>
              {/* Public authentication route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Public landing page — shows login/signup for unauthenticated users */}
              <Route path="/" element={<HomePage />} />

              {/* Protected application routes */}
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/explorer"
                element={
                  <ProtectedRoute>
                    <ExplorerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chunks"
                element={
                  <ProtectedRoute>
                    <ChunkExplorerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/embeddings"
                element={
                  <ProtectedRoute>
                    <EmbeddingsDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vector"
                element={
                  <ProtectedRoute>
                    <VectorDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ChatProvider>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
