from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from psd_tools import PSDImage


@dataclass
class TextLayerRecord:
    path: str
    text: str
    bbox: tuple[int, int, int, int]


def walk_text_layers(layer, prefix: str = "") -> list[TextLayerRecord]:
    records: list[TextLayerRecord] = []
    path = f"{prefix}/{layer.name}" if prefix else layer.name

    if getattr(layer, "kind", None) == "type":
      text = (getattr(layer, "text", "") or "").strip()
      records.append(TextLayerRecord(path=path, text=text, bbox=layer.bbox))

    if layer.is_group():
        for child in layer:
            records.extend(walk_text_layers(child, path))

    return records


def format_artboard_listing(index: int, artboard, records: list[TextLayerRecord]) -> str:
    return (
        f"[{index}] {artboard.name} | bbox={artboard.bbox} | text_layers={len(records)}"
    )


def render_records(records: Iterable[TextLayerRecord]) -> str:
    lines: list[str] = []

    for index, record in enumerate(records, 1):
        lines.append(f"[{index}] {record.path}")
        lines.append(f"bbox: {record.bbox}")
        lines.append(record.text.replace("\r", "\n"))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def resolve_artboard(psd: PSDImage, selector: str):
    if selector.isdigit():
        index = int(selector)
        if not 1 <= index <= len(psd):
            raise ValueError(f"画板编号超出范围，当前只有 {len(psd)} 个画板。")
        return index, psd[index - 1]

    matches = [(i + 1, layer) for i, layer in enumerate(psd) if layer.name == selector]

    if not matches:
        raise ValueError(f"没有找到名为“{selector}”的画板。")

    if len(matches) > 1:
        indexes = ", ".join(str(index) for index, _ in matches)
        raise ValueError(
            f"画板名“{selector}”有多个匹配，请改用编号选择：{indexes}"
        )

    return matches[0]


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract text layers from a PSD artboard.")
    parser.add_argument("psd_path", help="Path to the PSD file")
    parser.add_argument(
        "--artboard",
        help="Artboard index (1-based) or exact artboard name. Omit to list artboards.",
    )
    parser.add_argument(
        "--output",
        help="Optional output text file path. Prints to stdout when omitted.",
    )
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    psd_path = Path(args.psd_path)
    if not psd_path.exists():
        raise FileNotFoundError(f"PSD 文件不存在：{psd_path}")

    psd = PSDImage.open(psd_path)

    if not args.artboard:
        for index, artboard in enumerate(psd, 1):
            records = walk_text_layers(artboard)
            print(format_artboard_listing(index, artboard, records))
        return 0

    artboard_index, artboard = resolve_artboard(psd, args.artboard)
    records = walk_text_layers(artboard)

    output = [
        f"PSD: {psd_path}",
        f"Artboard: [{artboard_index}] {artboard.name}",
        f"Bounds: {artboard.bbox}",
        f"Text layers: {len(records)}",
        "",
        render_records(records).rstrip(),
        "",
    ]
    text = "\n".join(output)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(text, encoding="utf-8")
        print(f"已导出到 {output_path}")
    else:
        print(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
