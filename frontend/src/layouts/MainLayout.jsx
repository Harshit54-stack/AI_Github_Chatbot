/**
 * MainLayout — Full-viewport dark application canvas (#090A0F)
 * with subtle ambient depth for premium AI SaaS aesthetic.
 */
export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#090A0F] text-[#F5F5F7] antialiased selection:bg-violet-600/30 selection:text-white relative overflow-hidden">
      {/* Subtle background dot grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02] -z-10"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}
      />
      {children}
    </div>
  );
}
