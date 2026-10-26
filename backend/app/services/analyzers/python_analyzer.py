"""
Python analyzer — extracts imports, classes, functions, and docstrings
from .py files using the Tree-sitter Python grammar.
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


class PythonAnalyzer(BaseAnalyzer):
    """Tree-sitter analyzer for Python (.py) files."""

    def parse(self, file_path: Path, relative_path: str) -> ParsedFile:
        source = self._read_bytes(file_path)
        total_lines = self._line_count(source)
        file_size = file_path.stat().st_size if file_path.exists() else 0

        parser = Parser(self._language)
        tree = parser.parse(source)
        root = tree.root_node

        imports = self._extract_imports(root, source)
        classes = self._extract_classes(root, source)
        functions = self._extract_top_level_functions(root, source)

        return ParsedFile(
            filename=file_path.name,
            relative_path=relative_path,
            language="Python",
            imports=imports,
            classes=classes,
            functions=functions,
            total_lines=total_lines,
            file_size_bytes=file_size,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _extract_imports(self, root, source: bytes) -> List[str]:
        imports: List[str] = []
        for node in root.children:
            if node.type == "import_statement":
                imports.append(self._node_text(node, source).strip())
            elif node.type == "import_from_statement":
                imports.append(self._node_text(node, source).strip())
        return imports

    def _extract_classes(self, root, source: bytes) -> List[ParsedClass]:
        classes: List[ParsedClass] = []
        for node in root.children:
            if node.type != "class_definition":
                continue
            name_node = node.child_by_field_name("name")
            class_name = self._node_text(name_node, source) if name_node else "?"
            body_node = node.child_by_field_name("body")
            methods: List[ParsedFunction] = []
            docstring: Optional[str] = None

            if body_node:
                docstring = self._extract_docstring(body_node, source)
                for child in body_node.children:
                    if child.type == "function_definition":
                        methods.append(self._parse_function(child, source))

            classes.append(
                ParsedClass(
                    name=class_name,
                    methods=methods,
                    docstring=docstring,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
        return classes

    def _extract_top_level_functions(self, root, source: bytes) -> List[ParsedFunction]:
        funcs: List[ParsedFunction] = []
        for node in root.children:
            if node.type == "function_definition":
                funcs.append(self._parse_function(node, source))
        return funcs

    def _parse_function(self, node, source: bytes) -> ParsedFunction:
        name_node = node.child_by_field_name("name")
        name = self._node_text(name_node, source) if name_node else "?"

        params_node = node.child_by_field_name("parameters")
        parameters: List[ParsedParameter] = []
        if params_node:
            for p in params_node.children:
                if p.type in ("identifier",):
                    parameters.append(ParsedParameter(name=self._node_text(p, source)))
                elif p.type == "typed_parameter":
                    pname_node = p.child_by_field_name("name") or (p.children[0] if p.children else None)
                    ptype_node = p.child_by_field_name("type")
                    pname = self._node_text(pname_node, source) if pname_node else "?"
                    ptype = self._node_text(ptype_node, source) if ptype_node else None
                    parameters.append(ParsedParameter(name=pname, type_annotation=ptype))
                elif p.type == "default_parameter":
                    pname_node = p.child_by_field_name("name")
                    pname = self._node_text(pname_node, source) if pname_node else "?"
                    parameters.append(ParsedParameter(name=pname))

        return_node = node.child_by_field_name("return_type")
        return_type = self._node_text(return_node, source).lstrip("->").strip() if return_node else None

        body_node = node.child_by_field_name("body")
        docstring = self._extract_docstring(body_node, source) if body_node else None

        return ParsedFunction(
            name=name,
            parameters=parameters,
            return_type=return_type,
            docstring=docstring,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        )

    def _extract_docstring(self, body_node, source: bytes) -> Optional[str]:
        """Extract the first string literal from a function/class body."""
        for child in body_node.children:
            if child.type == "expression_statement":
                for sub in child.children:
                    if sub.type in ("string", "concatenated_string"):
                        raw = self._node_text(sub, source)
                        return raw.strip().strip('"""').strip("'''").strip('"').strip("'")
        return None
