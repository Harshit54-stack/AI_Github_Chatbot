"""
Generic analyzer — fallback for languages without deep AST support.

Collects file-level metadata (lines, size, language name) without walking
the AST. This ensures all files appear in the repository index.

Currently used for: Java, C++, C, Go, Rust, Markdown, Text.
Language-specific node queries can be added per language in future phases
by subclassing GenericAnalyzer and overriding _extract_*.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from tree_sitter import Parser

from app.models.parsed_file import (
    ParsedClass,
    ParsedFile,
    ParsedFunction,
    ParsedParameter,
)
from .base_analyzer import BaseAnalyzer

logger = logging.getLogger(__name__)

# Per-language node type mappings for shallow extraction
_LANG_CONFIG = {
    "Java": {
        "class_types": {"class_declaration", "interface_declaration", "enum_declaration"},
        "func_types": {"method_declaration", "constructor_declaration"},
        "import_types": {"import_declaration"},
        "name_field": "name",
    },
    "C++": {
        "class_types": {"class_specifier", "struct_specifier"},
        "func_types": {"function_definition"},
        "import_types": {"preproc_include"},
        "name_field": "name",
    },
    "C": {
        "class_types": {"struct_specifier"},
        "func_types": {"function_definition"},
        "import_types": {"preproc_include"},
        "name_field": "name",
    },
    "Go": {
        "class_types": {"type_spec"},
        "func_types": {"function_declaration", "method_declaration"},
        "import_types": {"import_declaration"},
        "name_field": "name",
    },
    "Rust": {
        "class_types": {"struct_item", "enum_item", "trait_item"},
        "func_types": {"function_item"},
        "import_types": {"use_declaration"},
        "name_field": "name",
    },
}


class GenericAnalyzer(BaseAnalyzer):
    """
    Shallow AST analyzer for supported-but-not-deeply-parsed languages.

    If a Tree-sitter Language is available it attempts basic extraction;
    otherwise it falls back to pure file-level metadata.
    """

    def __init__(self, language: Optional[object], lang_name: str) -> None:
        super().__init__(language)
        self._lang_name = lang_name
        self._cfg = _LANG_CONFIG.get(lang_name, {})

    def parse(self, file_path: Path, relative_path: str) -> ParsedFile:
        source = self._read_bytes(file_path)
        total_lines = self._line_count(source)
        file_size = file_path.stat().st_size if file_path.exists() else 0

        imports: List[str] = []
        classes: List[ParsedClass] = []
        functions: List[ParsedFunction] = []

        if self._language and self._cfg:
            try:
                parser = Parser(self._language)
                tree = parser.parse(source)
                root = tree.root_node
                imports = self._extract_generic_imports(root, source)
                classes = self._extract_generic_classes(root, source)
                functions = self._extract_generic_functions(root, source)
            except Exception as exc:
                logger.warning("Generic parse failed for %s: %s", file_path, exc)

        return ParsedFile(
            filename=file_path.name,
            relative_path=relative_path,
            language=self._lang_name,
            imports=imports,
            classes=classes,
            functions=functions,
            total_lines=total_lines,
            file_size_bytes=file_size,
        )

    # ------------------------------------------------------------------

    def _extract_generic_imports(self, root, source: bytes) -> List[str]:
        import_types = self._cfg.get("import_types", set())
        result: List[str] = []
        for node in root.children:
            if node.type in import_types:
                result.append(self._node_text(node, source).strip())
        return result

    def _extract_generic_classes(self, root, source: bytes) -> List[ParsedClass]:
        class_types = self._cfg.get("class_types", set())
        name_field = self._cfg.get("name_field", "name")
        result: List[ParsedClass] = []
        for node in self._walk_shallow(root, depth=2):
            if node.type in class_types:
                name_node = node.child_by_field_name(name_field)
                class_name = self._node_text(name_node, source) if name_node else "?"
                result.append(
                    ParsedClass(
                        name=class_name,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )
        return result

    def _extract_generic_functions(self, root, source: bytes) -> List[ParsedFunction]:
        func_types = self._cfg.get("func_types", set())
        name_field = self._cfg.get("name_field", "name")
        result: List[ParsedFunction] = []
        for node in self._walk_shallow(root, depth=3):
            if node.type in func_types:
                name_node = node.child_by_field_name(name_field)
                func_name = self._node_text(name_node, source) if name_node else "?"
                result.append(
                    ParsedFunction(
                        name=func_name,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    )
                )
        return result

    @staticmethod
    def _walk_shallow(node, depth: int = 2):
        """BFS up to *depth* levels."""
        queue = [(child, 1) for child in node.children]
        while queue:
            current, d = queue.pop(0)
            yield current
            if d < depth:
                queue.extend((child, d + 1) for child in current.children)
