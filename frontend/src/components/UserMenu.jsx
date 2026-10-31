import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * UserMenu — displays the authenticated user's avatar and a logout option.
 * Designed to be embedded in the Sidebar or a top header bar.
 */
export default function UserMenu({ dropdownPosition = "up", collapsed = false }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function onOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center ${
          collapsed ? "justify-center p-1.5" : "gap-2.5 px-2.5 py-1.5 w-full"
        } rounded-xl hover:bg-white/[0.06] border border-white/[0.08] bg-[#14151D] transition-all`}
        title={user.name}
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="w-7 h-7 rounded-full ring-1 ring-violet-500/40 shrink-0 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 ring-1 ring-white/10">
            <span className="text-[10px] font-bold text-white">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </span>
          </div>
        )}
        {!collapsed && (
          <>
            <span className="text-xs text-slate-200 font-medium truncate flex-1 text-left">
              {user.name}
            </span>
            <svg
              className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute ${
            dropdownPosition === "down"
              ? "top-full right-0 mt-2 w-56"
              : collapsed
              ? "bottom-0 left-full ml-2 w-56"
              : "bottom-full left-0 mb-1.5 w-full"
          } bg-[#14151D] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl`}
        >
          <div className="px-3 py-2 border-b border-white/5">
            <p className="text-[11px] text-slate-300 font-medium truncate">{user.name}</p>
            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors text-left"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
