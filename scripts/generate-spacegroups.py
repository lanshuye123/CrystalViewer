#!/usr/bin/env python3
"""Generate the bundled space-group dataset for CryViewer.

The dataset is derived from two authoritative sources:

* spglib  - symmetry operations (rotation + translation), Hall/Hermann-Mauguin
            symbols and point groups.
* pyxtal  - Wyckoff positions (letter, multiplicity, site symmetry and the full
            list of equivalent coordinate expressions), based on the
            International Tables for Crystallography Vol. A.

Run with an isolated environment (pyxtal needs Python <= 3.13):

    uv run --python 3.13 --with pyxtal --with spglib scripts/generate-spacegroups.py

Outputs (relative to the repository root):

    src/data/spacegroups-index.json          eagerly loaded index
    src/data/spacegroups/<crystal_system>.json   lazily imported per crystal system
"""

from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np
import spglib
from pyxtal.symmetry import Group

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "src" / "data"
SG_DIR = DATA_DIR / "spacegroups"

# Crystal-system file slugs, ordered from low to high symmetry.
CRYSTAL_SYSTEMS = [
    "triclinic",
    "monoclinic",
    "orthorhombic",
    "tetragonal",
    "trigonal",
    "hexagonal",
    "cubic",
]

# Representative (normalised) lattice parameters in angstrom / degrees for each
# crystal system. These are display defaults only; the MVP does not edit cells.
DEFAULT_LATTICE_PARAMS = {
    "triclinic": {"a": 5.0, "b": 6.0, "c": 7.0, "alpha": 80.0, "beta": 85.0, "gamma": 95.0},
    "monoclinic": {"a": 5.0, "b": 6.0, "c": 7.0, "alpha": 90.0, "beta": 105.0, "gamma": 90.0},
    "orthorhombic": {"a": 5.0, "b": 6.0, "c": 7.0, "alpha": 90.0, "beta": 90.0, "gamma": 90.0},
    "tetragonal": {"a": 5.0, "b": 5.0, "c": 7.0, "alpha": 90.0, "beta": 90.0, "gamma": 90.0},
    "trigonal": {"a": 5.0, "b": 5.0, "c": 7.0, "alpha": 90.0, "beta": 90.0, "gamma": 120.0},
    "hexagonal": {"a": 4.0, "b": 4.0, "c": 7.0, "alpha": 90.0, "beta": 90.0, "gamma": 120.0},
    "cubic": {"a": 4.0, "b": 4.0, "c": 4.0, "alpha": 90.0, "beta": 90.0, "gamma": 90.0},
}

# Number ranges for the seven crystal systems (International Tables convention).
def crystal_system_of(number: int) -> str:
    if number <= 2:
        return "triclinic"
    if number <= 15:
        return "monoclinic"
    if number <= 74:
        return "orthorhombic"
    if number <= 142:
        return "tetragonal"
    if number <= 167:
        return "trigonal"
    if number <= 194:
        return "hexagonal"
    return "cubic"


TYPE_LABELS = {
    "identity": "恒等",
    "rotation": "旋转轴",
    "screw": "螺旋轴",
    "mirror": "镜面",
    "glide": "滑移面",
    "inversion": "反演",
    "rotoinversion": "旋转反演",
}


def format_fraction(value: float, tol: float = 1e-6) -> str:
    """Format a fractional translation component as a compact rational string."""
    frac = Fraction(value).limit_denominator(12)
    if abs(float(frac) - value) > tol:
        frac = Fraction(round(value, 4) if value % 1 else value).limit_denominator(1000)
    if frac.denominator == 1:
        return str(frac.numerator)
    return f"{frac.numerator}/{frac.denominator}"


def rotation_order(rotation: np.ndarray) -> int:
    identity = np.eye(3, dtype=int)
    current = rotation.copy()
    for order in range(1, 7):
        if np.array_equal(current, identity):
            return order
        current = current @ rotation
    return 6


def classify_operation(rotation: np.ndarray, translation: np.ndarray) -> str:
    rotation = np.rint(rotation).astype(int)
    determinant = int(round(np.linalg.det(rotation)))
    trace = int(round(np.trace(rotation)))
    order = rotation_order(rotation)
    residual = np.asarray(translation) % 1.0
    has_translation = bool(np.any(np.abs(residual - np.round(residual)) > 1e-6))

    if determinant > 0:
        if order == 1:
            return "identity"
        return "screw" if has_translation else "rotation"

    if trace <= -3:
        return "inversion"
    if order == 2:
        return "glide" if has_translation else "mirror"
    return "rotoinversion"


def seitz_string(rotation: np.ndarray, translation: np.ndarray) -> str:
    rotation = np.rint(rotation).astype(int)
    variables = ["x", "y", "z"]
    axes: list[str] = []
    for row in range(3):
        parts: list[str] = []
        for col in range(3):
            coeff = int(rotation[row, col])
            if coeff == 0:
                continue
            sign = "-" if coeff < 0 else "+"
            magnitude = abs(coeff)
            body = variables[col] if magnitude == 1 else f"{magnitude}{variables[col]}"
            parts.append((sign, body))
        trans = translation[row] % 1.0
        if abs(trans) > 1e-6 and abs(trans - 1.0) > 1e-6:
            parts.append(("+", format_fraction(trans)))
        if not parts:
            axes.append("0")
            continue
        expression = ""
        for index, (sign, body) in enumerate(parts):
            if index == 0:
                expression += ("-" if sign == "-" else "") + body
            else:
                expression += sign + body
        axes.append(expression)
    return ", ".join(axes)


def build_space_group(number: int) -> dict:
    group = Group(number)
    hall_number = group.hall_number
    sg_type = spglib.get_spacegroup_type(hall_number)
    assert sg_type is not None, f"missing spglib type for hall {hall_number}"

    symmetry = spglib.get_symmetry_from_database(hall_number)
    assert symmetry is not None, f"missing symmetry ops for hall {hall_number}"

    operations = []
    for rotation, translation in zip(symmetry["rotations"], symmetry["translations"]):
        rotation_list = np.rint(rotation).astype(int).tolist()
        translation_list = [round(float(x) % 1.0, 6) for x in translation]
        operations.append(
            {
                "seitz": seitz_string(rotation, translation),
                "rotation": rotation_list,
                "translation": translation_list,
                "type": classify_operation(rotation, translation),
            }
        )

    wyckoff_positions = []
    for wp in group.Wyckoff_positions:
        wp.get_site_symmetry()
        coordinates = [op.as_xyz_str() for op in wp.ops]
        wyckoff_positions.append(
            {
                "letter": wp.letter,
                "multiplicity": wp.multiplicity,
                "siteSymmetry": wp.site_symm,
                "representative": coordinates[0],
                "coordinates": coordinates,
            }
        )

    system = crystal_system_of(number)
    symbol = sg_type.international_short
    lattice_type = symbol[0] if symbol else "P"

    return {
        "number": number,
        "symbolHM": symbol,
        "symbolHall": sg_type.hall_symbol,
        "crystalSystem": system,
        "latticeType": lattice_type,
        "pointGroup": sg_type.pointgroup_international,
        "latticeParams": DEFAULT_LATTICE_PARAMS[system],
        "symmetryOperations": operations,
        "wyckoffPositions": wyckoff_positions,
    }


# Spot checks against the International Tables (letter -> (multiplicity, site symmetry)).
VALIDATION = {
    2: {"a": (1, "-1"), "i": (2, "1")},
    62: {"a": (4, "-1"), "b": (4, "-1"), "c": (4, ".m."), "d": (8, "1")},
    194: {"a": (2, "-3m."), "c": (2, "-6m2"), "f": (4, "3m."), "l": (24, "1")},
    225: {"a": (4, "m-3m"), "b": (4, "m-3m"), "c": (8, "-43m"), "d": (24, "m.mm"), "l": (192, "1")},
}


def validate(dataset: dict[int, dict]) -> None:
    problems: list[str] = []
    for number, expected in VALIDATION.items():
        positions = {wp["letter"]: wp for wp in dataset[number]["wyckoffPositions"]}
        for letter, (multiplicity, site) in expected.items():
            actual = positions.get(letter)
            if actual is None:
                problems.append(f"SG {number}: missing Wyckoff {letter}")
                continue
            if actual["multiplicity"] != multiplicity or actual["siteSymmetry"] != site:
                problems.append(
                    f"SG {number} {letter}: expected {multiplicity}/{site}, "
                    f"got {actual['multiplicity']}/{actual['siteSymmetry']}"
                )
    if problems:
        print("VALIDATION FAILED:", file=sys.stderr)
        for problem in problems:
            print(" -", problem, file=sys.stderr)
        raise SystemExit(1)
    print(f"validation passed for {len(VALIDATION)} space groups")


def main() -> None:
    SG_DIR.mkdir(parents=True, exist_ok=True)
    dataset = {number: build_space_group(number) for number in range(1, 231)}
    validate(dataset)

    grouped: dict[str, list[dict]] = {system: [] for system in CRYSTAL_SYSTEMS}
    for number in range(1, 231):
        grouped[dataset[number]["crystalSystem"]].append(dataset[number])

    for system, entries in grouped.items():
        path = SG_DIR / f"{system}.json"
        path.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")))
        print(f"wrote {path.relative_to(REPO_ROOT)} ({path.stat().st_size / 1024:.0f} KB, {len(entries)} groups)")

    index = [
        {
            "number": entry["number"],
            "symbol": entry["symbolHM"],
            "crystalSystem": entry["crystalSystem"],
            "pointGroup": entry["pointGroup"],
            "latticeType": entry["latticeType"],
        }
        for number in range(1, 231)
        for entry in [dataset[number]]
    ]
    index_path = DATA_DIR / "spacegroups-index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {index_path.relative_to(REPO_ROOT)} ({index_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
