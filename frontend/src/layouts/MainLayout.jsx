/**
 * MainLayout — full-viewport dark wrapper used by all pages.
 */
export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#0a0a12] text-slate-100 antialiased">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-700/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-indigo-700/20 blur-[100px]" />
      </div>
      {children}
    </div>
  );
}
