"""
JavaScript/JSX analyzer — extracts imports, classes, and functions
from .js and .jsx files using the Tree-sitter JavaScript grammar.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from tree_sitter import Parser

from app.models.parsed_file import (
    ParsedClass,
    ParsedFile,
    ParsedFunction,
    ParsedParameter,
)
from .base_analyzer import BaseAnalyzer

logger = logging.getLogger(__name__)

# Node types that represent callable constructs in JS
_FUNCTION_TYPES = {
    "function_declaration",
    "function",
    "arrow_function",
    "generator_function_declaration",
    "generator_function",
}

_METHOD_TYPES = {
    "method_definition",
}


class JavaScriptAnalyzer(BaseAnalyzer):
    """Tree-sitter analyzer for JavaScript (.js) and JSX (.jsx) files."""

    def __init__(self, language: object, lang_name: str = "JavaScript") -> None:
        super().__init__(language)
        self._lang_name = lang_name

    def parse(self, file_path: Path, relative_path: str) -> ParsedFile:
        source = self._read_bytes(file_path)
        total_lines = self._line_count(source)
        file_size = file_path.stat().st_size if file_path.exists() else 0

        parser = Parser(self._language)
        tree = parser.parse(source)
        root = tree.root_node

        imports = self._extract_imports(root, source)
        classes = self._extract_classes(root, source)
        functions = self._extract_functions(root, source)

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

    def _extract_imports(self, root, source: bytes) -> List[str]:
        imports: List[str] = []
        for node in self._walk(root):
            if node.type == "import_statement":
                imports.append(self._node_text(node, source).strip())
        return imports

    def _extract_classes(self, root, source: bytes) -> List[ParsedClass]:
        classes: List[ParsedClass] = []
        for node in root.children:
            if node.type not in ("class_declaration", "class"):
                continue
            name_node = node.child_by_field_name("name")
            class_name = self._node_text(name_node, source) if name_node else "AnonymousClass"
            body_node = node.child_by_field_name("body")
            methods: List[ParsedFunction] = []

            if body_node:
                for child in body_node.children:
                    if child.type in _METHOD_TYPES:
                        methods.append(self._parse_method(child, source))

            classes.append(
                ParsedClass(
                    name=class_name,
                    methods=methods,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
            )
        return classes

    def _extract_functions(self, root, source: bytes) -> List[ParsedFunction]:
        """Extract top-level named functions and variable-bound arrow functions."""
        funcs: List[ParsedFunction] = []
        for node in root.children:
            if node.type in ("function_declaration", "generator_function_declaration"):
                funcs.append(self._parse_named_function(node, source))
            elif node.type in ("lexical_declaration", "variable_declaration"):
                # const foo = () => {}  or  const foo = function() {}
                for decl in node.children:
                    if decl.type == "variable_declarator":
                        val = decl.child_by_field_name("value")
                        if val and val.type in ("arrow_function", "function"):
                            name_node = decl.child_by_field_name("name")
                            name = self._node_text(name_node, source) if name_node else "?"
                            funcs.append(self._parse_anonymous_function(val, source, name))
        return funcs

    def _parse_named_function(self, node, source: bytes) -> ParsedFunction:
        name_node = node.child_by_field_name("name")
        name = self._node_text(name_node, source) if name_node else "?"
        return self._parse_anonymous_function(node, source, name)

    def _parse_anonymous_function(self, node, source: bytes, name: str) -> ParsedFunction:
        params_node = node.child_by_field_name("parameters") or node.child_by_field_name("parameter")
        parameters = self._extract_params(params_node, source)
        return ParsedFunction(
            name=name,
            parameters=parameters,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        )

    def _parse_method(self, node, source: bytes) -> ParsedFunction:
        name_node = node.child_by_field_name("name")
        name = self._node_text(name_node, source) if name_node else "?"
        params_node = node.child_by_field_name("parameters")
        parameters = self._extract_params(params_node, source)
        return ParsedFunction(
            name=name,
            parameters=parameters,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        )

    def _extract_params(self, params_node, source: bytes) -> List[ParsedParameter]:
        if not params_node:
            return []
        result: List[ParsedParameter] = []
        for p in params_node.children:
            if p.type == "identifier":
                result.append(ParsedParameter(name=self._node_text(p, source)))
            elif p.type in ("assignment_pattern", "rest_pattern"):
                # default params or ...rest
                left = p.children[0] if p.children else None
                if left:
                    result.append(ParsedParameter(name=self._node_text(left, source)))
        return result

    @staticmethod
    def _walk(node):
        """Yield all descendant nodes via BFS."""
        queue = list(node.children)
        while queue:
            current = queue.pop(0)
            yield current
            queue.extend(current.children)
