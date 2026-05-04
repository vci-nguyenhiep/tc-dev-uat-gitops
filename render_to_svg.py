#!/usr/bin/env python3
"""Render Excalidraw JSON -> SVG (no CDN dependency)."""

import json
import sys
from pathlib import Path
from html import escape


def compute_bbox(elements):
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for el in elements:
        if el.get("isDeleted"):
            continue
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)
        if el.get("type") in ("arrow", "line") and "points" in el:
            for px, py in el["points"]:
                min_x = min(min_x, x + px)
                min_y = min(min_y, y + py)
                max_x = max(max_x, x + px)
                max_y = max(max_y, y + py)
        else:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + abs(w))
            max_y = max(max_y, y + abs(h))
    if min_x == float("inf"):
        return 0, 0, 800, 600
    return min_x, min_y, max_x, max_y


def stroke_dash(style, sw):
    if style == "dashed":
        d = sw * 8
        return f'stroke-dasharray="{d},{d//2}"'
    if style == "dotted":
        return f'stroke-dasharray="{sw},{sw*2}"'
    return ""


def roundness_val(el):
    r = el.get("roundness")
    if not r:
        return 0
    if r.get("type") == 3:
        return min(10, el.get("height", 100) * 0.08, el.get("width", 200) * 0.04)
    return 0


def render_rect(el, ox, oy):
    x = el["x"] + ox
    y = el["y"] + oy
    w = el.get("width", 0)
    h = el.get("height", 0)
    fill = el.get("backgroundColor", "transparent")
    stroke = el.get("strokeColor", "#000")
    sw = el.get("strokeWidth", 1)
    ss = el.get("strokeStyle", "solid")
    op = el.get("opacity", 100) / 100
    r = roundness_val(el)
    if fill == "transparent":
        fill = "none"
    dash = stroke_dash(ss, sw)
    return [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'{dash} opacity="{op:.2f}"/>']


def render_ellipse(el, ox, oy):
    x = el["x"]
    y = el["y"]
    w = el.get("width", 0)
    h = el.get("height", 0)
    cx = x + w / 2 + ox
    cy = y + h / 2 + oy
    fill = el.get("backgroundColor", "transparent")
    stroke = el.get("strokeColor", "#000")
    sw = el.get("strokeWidth", 1)
    ss = el.get("strokeStyle", "solid")
    op = el.get("opacity", 100) / 100
    if fill == "transparent":
        fill = "none"
    dash = stroke_dash(ss, sw)
    return [f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w/2:.1f}" ry="{h/2:.1f}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {dash} opacity="{op:.2f}"/>']


def render_text(el, ox, oy):
    raw = el.get("text", "").strip()
    if not raw:
        return []
    x = el["x"] + ox
    y = el["y"] + oy
    w = el.get("width", 200)
    h = el.get("height", 25)
    fs = el.get("fontSize", 14)
    color = el.get("strokeColor", "#000")
    op = el.get("opacity", 100) / 100
    ta = el.get("textAlign", "left")
    va = el.get("verticalAlign", "top")
    lh = el.get("lineHeight", 1.25)
    lines = raw.split("\n")
    line_h = fs * lh
    total_h = len(lines) * line_h

    if ta == "center":
        anchor = "middle"
        tx = x + w / 2
    elif ta == "right":
        anchor = "end"
        tx = x + w
    else:
        anchor = "start"
        tx = x + 4

    if va == "middle":
        ty = y + h / 2 - total_h / 2 + fs
    elif va == "bottom":
        ty = y + h - total_h + fs
    else:
        ty = y + fs + 4

    out = [f'<text x="{tx:.1f}" y="{ty:.1f}" font-family="\'Courier New\',monospace" '
           f'font-size="{fs}" text-anchor="{anchor}" fill="{color}" opacity="{op:.2f}">']
    for i, line in enumerate(lines):
        dy = line_h if i > 0 else 0
        safe = escape(line)
        out.append(f'  <tspan x="{tx:.1f}" dy="{dy:.1f}">{safe}</tspan>')
    out.append("</text>")
    return out


def render_arrow(el, ox, oy):
    x = el["x"]
    y = el["y"]
    pts = el.get("points", [[0, 0], [100, 0]])
    stroke = el.get("strokeColor", "#000")
    sw = el.get("strokeWidth", 2)
    ss = el.get("strokeStyle", "solid")
    op = el.get("opacity", 100) / 100
    start_ah = el.get("startArrowhead")
    end_ah = el.get("endArrowhead")
    dash = stroke_dash(ss, sw)

    abs_pts = [(x + px + ox, y + py + oy) for px, py in pts]
    path_d = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in abs_pts)

    cid = stroke.replace("#", "").strip()
    result = []

    ah_w = max(10, sw * 4)
    ah_h = max(7, sw * 3)

    if end_ah == "arrow":
        result.append(
            f'<defs><marker id="ae{cid}{el["id"]}" markerWidth="{ah_w}" markerHeight="{ah_h}" '
            f'refX="{ah_w-1}" refY="{ah_h/2:.1f}" orient="auto" markerUnits="userSpaceOnUse">'
            f'<polygon points="0 0, {ah_w} {ah_h/2:.1f}, 0 {ah_h}" fill="{stroke}"/>'
            f'</marker></defs>'
        )
    if start_ah == "arrow":
        result.append(
            f'<defs><marker id="as{cid}{el["id"]}" markerWidth="{ah_w}" markerHeight="{ah_h}" '
            f'refX="1" refY="{ah_h/2:.1f}" orient="auto-start-reverse" markerUnits="userSpaceOnUse">'
            f'<polygon points="0 0, {ah_w} {ah_h/2:.1f}, 0 {ah_h}" fill="{stroke}"/>'
            f'</marker></defs>'
        )

    markers = []
    if end_ah == "arrow":
        markers.append(f'marker-end="url(#ae{cid}{el["id"]})"')
    if start_ah == "arrow":
        markers.append(f'marker-start="url(#as{cid}{el["id"]})"')

    result.append(
        f'<path d="{path_d}" stroke="{stroke}" stroke-width="{sw}" '
        f'fill="none" {" ".join(markers)} {dash} opacity="{op:.2f}"/>'
    )
    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python render_to_svg.py <file.excalidraw> [output.svg]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else input_path.with_suffix(".svg")

    data = json.loads(input_path.read_text(encoding="utf-8"))
    elements = [e for e in data.get("elements", []) if not e.get("isDeleted")]

    padding = 60
    min_x, min_y, max_x, max_y = compute_bbox(elements)
    sw = max_x - min_x + padding * 2
    sh = max_y - min_y + padding * 2
    ox = -min_x + padding
    oy = -min_y + padding

    bg = data.get("appState", {}).get("viewBackgroundColor", "#ffffff")

    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw:.0f}" height="{sh:.0f}" '
        f'viewBox="0 0 {sw:.0f} {sh:.0f}">',
        f'<rect width="100%" height="100%" fill="{bg}"/>',
    ]

    for el in elements:
        t = el.get("type")
        if t == "rectangle":
            out.extend(render_rect(el, ox, oy))
        elif t == "ellipse":
            out.extend(render_ellipse(el, ox, oy))
        elif t == "text":
            out.extend(render_text(el, ox, oy))
        elif t == "arrow":
            out.extend(render_arrow(el, ox, oy))

    out.append("</svg>")
    output_path.write_text("\n".join(out), encoding="utf-8")
    print(f"SVG saved: {output_path}  ({sw:.0f}x{sh:.0f})")


if __name__ == "__main__":
    main()
