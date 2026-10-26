"""
TypeScript / TSX analyzer — extends JavaScript analysis with type annotations
and interface declarations.

Uses tree-sitter-typescript which ships two separate sub-languages:
  • language_typescript → for .ts files
  • language_tsx        → for .tsx files
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


class TypeScriptAnalyzer(BaseAnalyzer):
    """Tree-sitter analyzer for TypeScript (.ts) and TSX (.tsx) files."""

    def __init__(self, language: object, lang_name: str = "TypeScript") -> None:
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
        result: List[str] = []
        for node in root.children:
            if node.type == "import_statement":
                result.append(self._node_text(node, source).strip())
        return result

    def _extract_classes(self, root, source: bytes) -> List[ParsedClass]:
        classes: List[ParsedClass] = []
        for node in root.children:
            if node.type not in (
                "class_declaration",
                "abstract_class_declaration",
                "interface_declaration",
            ):
                continue

            name_node = node.child_by_field_name("name")
            class_name = self._node_text(name_node, source) if name_node else "?"
            body_node = node.child_by_field_name("body")
            methods: List[ParsedFunction] = []

            if body_node:
                for child in body_node.children:
                    if child.type in (
                        "method_definition",
                        "method_signature",
                        "public_field_definition",
                    ):
                        if child.type in ("method_definition", "method_signature"):
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
        funcs: List[ParsedFunction] = []
        for node in root.children:
            if node.type in ("function_declaration", "generator_function_declaration"):
                funcs.append(self._parse_function(node, source))
            elif node.type in ("lexical_declaration", "variable_declaration"):
                for decl in node.children:
                    if decl.type == "variable_declarator":
                        val = decl.child_by_field_name("value")
                        if val and val.type in ("arrow_function", "function"):
                            name_node = decl.child_by_field_name("name")
                            name = self._node_text(name_node, source) if name_node else "?"
                            funcs.append(self._parse_function(val, source, override_name=name))
        return funcs

    def _parse_function(self, node, source: bytes, override_name: Optional[str] = None) -> ParsedFunction:
        if override_name is None:
            name_node = node.child_by_field_name("name")
            name = self._node_text(name_node, source) if name_node else "?"
        else:
            name = override_name

        params_node = node.child_by_field_name("parameters") or node.child_by_field_name("parameter")
        parameters = self._extract_params(params_node, source)

        # TypeScript return type annotation: ": ReturnType"
        ret_node = node.child_by_field_name("return_type")
        return_type: Optional[str] = None
        if ret_node:
            return_type = self._node_text(ret_node, source).lstrip(":").strip()

        return ParsedFunction(
            name=name,
            parameters=parameters,
            return_type=return_type,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        )

    def _parse_method(self, node, source: bytes) -> ParsedFunction:
        name_node = node.child_by_field_name("name")
        name = self._node_text(name_node, source) if name_node else "?"
        params_node = node.child_by_field_name("parameters")
        parameters = self._extract_params(params_node, source)
        ret_node = node.child_by_field_name("return_type")
        return_type = self._node_text(ret_node, source).lstrip(":").strip() if ret_node else None
        return ParsedFunction(
            name=name,
            parameters=parameters,
            return_type=return_type,
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
            elif p.type == "required_parameter":
                pname_node = p.child_by_field_name("pattern")
                ptype_node = p.child_by_field_name("type")
                pname = self._node_text(pname_node, source) if pname_node else "?"
                ptype = self._node_text(ptype_node, source).lstrip(":").strip() if ptype_node else None
                result.append(ParsedParameter(name=pname, type_annotation=ptype))
            elif p.type == "optional_parameter":
                pname_node = p.child_by_field_name("pattern")
                pname = self._node_text(pname_node, source) if pname_node else "?"
                result.append(ParsedParameter(name=f"{pname}?"))
        return result
