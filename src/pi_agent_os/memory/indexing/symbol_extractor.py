"""Symbol extractor for Python source files using the ast module."""
from __future__ import annotations
import ast
from typing import Optional


def extract_python_symbols(source: str, filepath: str) -> list[dict]:
    """
    Extract top-level function and class definitions from Python source.

    Returns a list of dicts with keys: name, kind, docstring, lineno.
    """
    symbols: list[dict] = []
    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError:
        return symbols

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            docstring = _get_docstring(node)
            symbols.append({
                "name": node.name,
                "kind": "function",
                "docstring": docstring,
                "lineno": node.lineno,
            })
        elif isinstance(node, ast.ClassDef):
            docstring = _get_docstring(node)
            symbols.append({
                "name": node.name,
                "kind": "class",
                "docstring": docstring,
                "lineno": node.lineno,
            })
            # Also extract methods
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
                    method_doc = _get_docstring(child)
                    symbols.append({
                        "name": f"{node.name}.{child.name}",
                        "kind": "method",
                        "docstring": method_doc,
                        "lineno": child.lineno,
                    })

    return symbols


def _get_docstring(node: ast.AST) -> Optional[str]:
    """Extract docstring from a function or class node."""
    try:
        docstring = ast.get_docstring(node)
        return docstring
    except Exception:
        return None
