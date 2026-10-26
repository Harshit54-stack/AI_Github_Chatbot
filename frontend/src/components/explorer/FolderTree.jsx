import { useState } from "react";

/**
 * Language → icon mapping using simple text abbreviations.
 * Maps language names to a short tag displayed on file rows.
 */
const LANG_BADGE = {
  Python: { label: "PY", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  JavaScript: { label: "JS", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  TypeScript: { label: "TS", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  "React (JSX)": { label: "JSX", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  "React (TSX)": { label: "TSX", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  Java: { label: "JV", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  "C++": { label: "C++", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  C: { label: "C", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  Go: { label: "GO", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
  Rust: { label: "RS", color: "text-orange-300 bg-orange-400/10 border-orange-400/20" },
};

const DEFAULT_BADGE = { label: "?", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };

// ── File icon based on extension ──────────────────────────────────────────
function FileIcon({ ext }) {
  const icons = {
    ".py": "🐍",
    ".js": "⚡",
    ".jsx": "⚛️",
    ".ts": "🔷",
    ".tsx": "⚛️",
    ".java": "☕",
    ".cpp": "⚙️",
    ".c": "⚙️",
    ".go": "🐹",
    ".rs": "🦀",
    ".md": "📝",
    ".txt": "📄",
  };
  return <span className="text-xs">{icons[ext] || "📄"}</span>;
}

// ── Single file row ───────────────────────────────────────────────────────
function FileRow({ name, ext, path, parsedInfo, isSelected, onSelect }) {
  const badge = LANG_BADGE[parsedInfo?.language] || DEFAULT_BADGE;
  return (
    <button
      onClick={() => onSelect(path)}
      title={path}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all group ${
        isSelected
          ? "bg-violet-500/20 border border-violet-500/30"
          : "hover:bg-white/5 border border-transparent"
      }`}
    >
      <FileIcon ext={ext} />
      <span className={`flex-1 text-xs truncate ${isSelected ? "text-violet-200" : "text-slate-300 group-hover:text-white"}`}>
        {name}
      </span>
      {parsedInfo && (
        <span className={`text-[9px] border rounded px-1 py-0.5 font-mono ${badge.color}`}>
          {badge.label}
        </span>
      )}
    </button>
  );
}

// ── Directory row ─────────────────────────────────────────────────────────
function DirRow({ name, isOpen, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-all group"
    >
      <span
        className={`text-slate-500 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
        style={{ display: "inline-block" }}
      >
        ▶
      </span>
      <span className="text-xs">📁</span>
      <span className="text-xs text-slate-400 group-hover:text-white truncate font-medium">
        {name}
      </span>
    </button>
  );
}

// ── Recursive tree node ───────────────────────────────────────────────────
function TreeNodeComponent({ node, depth, selectedPath, onFileSelect, parsedFilesMap }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const indent = depth * 12;

  if (node.type === "file") {
    const ext = "." + (node.name.split(".").pop() || "");
    const parsedInfo = parsedFilesMap?.[node.path];
    return (
      <div style={{ paddingLeft: indent }}>
        <FileRow
          name={node.name}
          ext={ext}
          path={node.path}
          parsedInfo={parsedInfo}
          isSelected={selectedPath === node.path}
          onSelect={onFileSelect}
        />
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: indent }}>
      <DirRow name={node.name} isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} />
      {isOpen && node.children?.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onFileSelect={onFileSelect}
              parsedFilesMap={parsedFilesMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────
/**
 * FolderTree — collapsible file system tree.
 *
 * @param {{
 *   tree: Array,           // from GET /repository/tree
 *   selectedPath: string,  // currently selected file path
 *   onFileSelect: function,
 *   parsedFilesMap: object // { [relativePath]: FileListEntry }
 * }} props
 */
export default function FolderTree({ tree, selectedPath, onFileSelect, parsedFilesMap = {} }) {
  if (!tree || tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-2xl">📂</span>
        <p className="text-xs text-slate-600">No repository loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onFileSelect={onFileSelect}
          parsedFilesMap={parsedFilesMap}
        />
      ))}
    </div>
  );
}
