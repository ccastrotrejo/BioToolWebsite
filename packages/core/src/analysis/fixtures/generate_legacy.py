"""Regenerate the golden fixture with Python stdlib and the preserved legacy code.

Run from the website root with a checkout of the original BioTool source:
    python3 packages/core/src/analysis/fixtures/generate_legacy.py /path/to/BioTool/biotool/app.py
"""

import ast
import argparse
import itertools
import json
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("legacy_app", type=Path, help="Path to the original biotool/app.py")
args = parser.parse_args()
legacy = ast.parse(args.legacy_app.read_text(encoding="utf-8"))
nodes = [
    node for node in legacy.body
    if (isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "Estructura"
                for target in node.targets))
    or (isinstance(node, ast.FunctionDef) and node.name in ("probAA", "estrAA"))
]
namespace = {}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "biotool/app.py", "exec"), namespace)
classes = {"alfa": "alpha", "beta": "beta", "giro beta": "turn", "azar": "random"}
rows = []
for amino_acids in itertools.product(namespace["Estructura"], repeat=3):
    triplet = "".join(amino_acids)
    scores = namespace["probAA"](triplet)[triplet]
    classification = classes[namespace["estrAA"](triplet)[triplet]]
    rows.append(f'  "{triplet}": {json.dumps([*scores, classification])}')
Path(__file__).with_name("legacy-triplets.json").write_text(
    "{\n" + ",\n".join(rows) + "\n}\n", encoding="utf-8",
)
