import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import MainLayout from "../layouts/MainLayout";

export default function LoginPage() {
  const { user, isLoading, login, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, isLoading, navigate]);

  const handleSuccess = async (credentialResponse) => {
    clearAuthError();
    try {
      await login(credentialResponse.credential);
      navigate("/", { replace: true });
    } catch {
      // authError is set by login()
    }
  };

  const handleError = () => {
    // Google Sign-In popup closed or failed
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08090D] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        {/* Subtle radial ambient glow behind login card */}
        <div className="absolute w-[500px] h-[500px] rounded-full bg-violet-600/[0.08] blur-[120px] pointer-events-none -z-10" />

        <div className="w-full max-w-sm flex flex-col items-center gap-7">
          {/* Logo Mark */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-xl shadow-violet-600/30 ring-1 ring-white/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>

          {/* Heading */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              AI GitHub Assistant
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
              Autonomous codebase exploration, AST parsing, and conversational intelligence.
            </p>
          </div>

          {/* Elevated Glow Card (Reference 2 style) */}
          <div className="glow-card glow-card-violet w-full p-7 flex flex-col items-center gap-5 shadow-2xl">
            <div className="text-center space-y-1">
              <p className="text-slate-200 text-sm font-semibold">Sign in to workspace</p>
              <p className="text-slate-400 text-xs">Continue with your Google account</p>
            </div>

            {/* Error Notification */}
            {authError && (
              <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                <span className="text-red-400 text-xs shrink-0">⚠️</span>
                <p className="text-red-300 text-xs flex-1">{authError}</p>
                <button
                  onClick={clearAuthError}
                  className="text-red-400 hover:text-red-200 text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Google OAuth Component */}
            <div className="flex justify-center w-full py-1">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                theme="filled_black"
                size="large"
                shape="rectangular"
                text="continue_with"
                useOneTap={false}
              />
            </div>

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Your email is used only to securely identify your user session.
            </p>
          </div>

          <p className="text-xs text-slate-600 font-mono text-center">
            FastAPI · Google Gemini · FAISS · React
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
