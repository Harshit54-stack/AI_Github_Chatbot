/**
 * ErrorNotification — dismissible banner shown when an API error occurs.
 *
 * @param {{ message: string, onDismiss: () => void }} props
 */
export default function ErrorNotification({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-red-500/15 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm">
      {/* icon */}
      <svg
        className="w-5 h-5 mt-0.5 shrink-0 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-auto text-red-400 hover:text-red-200 transition-colors"
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  );
}
