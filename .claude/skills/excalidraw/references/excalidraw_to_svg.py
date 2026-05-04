"""Offline Excalidraw JSON → SVG renderer using pure Python + Playwright screenshot."""
from __future__ import annotations
import argparse, json, math, textwrap
from pathlib import Path
from playwright.sync_api import sync_playwright

FONT = "monospace"

def rx(roughness_obj):
    return 8 if roughness_obj else 0

def color(c, default="#333"):
    if not c or c == "transparent": return "none"
    return c

def build_elements_map(elements):
    return {e["id"]: e for e in elements if not e.get("isDeleted")}

def wrap_text_svg(text, x, y, width, font_size, fill, align, line_height=1.4):
    lines = text.split("\n")
    total_h = len(lines) * font_size * line_height
    anchor = {"center": "middle", "left": "start", "right": "end"}.get(align, "middle")
    tx = x
    if align == "center": tx = x + width / 2
    elif align == "left":  tx = x + 6
    parts = []
    for i, line in enumerate(lines):
        dy = i * font_size * line_height
        escaped = line.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"','&quot;')
        parts.append(f'<text x="{tx:.1f}" y="{y + dy:.1f}" font-family="{FONT}" font-size="{font_size}" fill="{fill}" text-anchor="{anchor}" dominant-baseline="hanging" xml:space="preserve">{escaped}</text>')
    return "\n".join(parts), total_h

def render_element(el, elmap, out):
    t = el.get("type")
    x, y = el.get("x", 0), el.get("y", 0)
    w, h = el.get("width", 0), el.get("height", 0)
    stroke = color(el.get("strokeColor"), "#333")
    bg = color(el.get("backgroundColor"), "none")
    sw = el.get("strokeWidth", 1)
    ss = el.get("strokeStyle", "solid")
    dash = "stroke-dasharray:6,4;" if ss == "dashed" else ("stroke-dasharray:2,4;" if ss == "dotted" else "")
    op = el.get("opacity", 100) / 100
    r_obj = el.get("roundness")

    if t == "rectangle":
        rx_val = 8 if r_obj else 0
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx_val}" fill="{bg}" stroke="{stroke}" stroke-width="{sw}" style="{dash}" opacity="{op}"/>')

    elif t == "ellipse":
        cx, cy = x + w/2, y + h/2
        out.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w/2:.1f}" ry="{h/2:.1f}" fill="{bg}" stroke="{stroke}" stroke-width="{sw}" style="{dash}" opacity="{op}"/>')

    elif t == "line":
        pts = el.get("points", [[0,0],[0,0]])
        coords = " ".join(f"{x+p[0]:.1f},{y+p[1]:.1f}" for p in pts)
        out.append(f'<polyline points="{coords}" fill="none" stroke="{stroke}" stroke-width="{sw}" style="{dash}" opacity="{op}"/>')

    elif t == "arrow":
        pts = el.get("points", [[0,0],[w,h]])
        if len(pts) < 2: return
        abs_pts = [(x + p[0], y + p[1]) for p in pts]
        coords = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in abs_pts)
        end = abs_pts[-1]
        prev = abs_pts[-2]
        angle = math.atan2(end[1]-prev[1], end[0]-prev[0])
        ah = 10
        arrow_pts = [
            (end[0] - ah*math.cos(angle-0.4), end[1] - ah*math.sin(angle-0.4)),
            end,
            (end[0] - ah*math.cos(angle+0.4), end[1] - ah*math.sin(angle+0.4)),
        ]
        ap = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in arrow_pts)
        out.append(f'<polyline points="{coords}" fill="none" stroke="{stroke}" stroke-width="{sw}" style="{dash}" opacity="{op}"/>')
        if el.get("endArrowhead") == "arrow":
            out.append(f'<polyline points="{ap}" fill="none" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"/>')

    elif t == "text":
        fs = el.get("fontSize", 14)
        fill = color(el.get("strokeColor"), "#333")
        align = el.get("textAlign", "left")
        v_align = el.get("verticalAlign", "top")
        text = el.get("text", "")
        cid = el.get("containerId")

        if cid and cid in elmap:
            container = elmap[cid]
            cx = container["x"] + container["width"] / 2
            cy = container["y"] + container["height"] / 2
            lines = text.split("\n")
            total_h = len(lines) * fs * 1.35
            ty = cy - total_h / 2
            tx = cx
            anchor = "middle"
            if align == "left":
                tx = container["x"] + 8
                anchor = "start"
            for i, line in enumerate(lines):
                ey = ty + i * fs * 1.35
                escaped = line.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"','&quot;')
                out.append(f'<text x="{tx:.1f}" y="{ey:.1f}" font-family="{FONT}" font-size="{fs}" fill="{fill}" text-anchor="{anchor}" dominant-baseline="hanging" opacity="{op}" xml:space="preserve">{escaped}</text>')
        else:
            ty = y
            anchor = "start"
            tx = x + 4
            if align == "center":
                tx = x + w/2; anchor = "middle"
            elif align == "right":
                tx = x + w; anchor = "end"
            lines = text.split("\n")
            for i, line in enumerate(lines):
                ey = ty + i * fs * 1.4
                escaped = line.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"','&quot;')
                out.append(f'<text x="{tx:.1f}" y="{ey:.1f}" font-family="{FONT}" font-size="{fs}" fill="{fill}" text-anchor="{anchor}" dominant-baseline="hanging" opacity="{op}" xml:space="preserve">{escaped}</text>')

def excalidraw_to_svg(data: dict, padding=60) -> str:
    elements = [e for e in data.get("elements", []) if not e.get("isDeleted")]
    elmap = build_elements_map(elements)

    # Compute bounding box
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for el in elements:
        ex, ey = el.get("x", 0), el.get("y", 0)
        ew, eh = el.get("width", 0), el.get("height", 0)
        # For arrows, check all points
        if el.get("type") in ("arrow", "line"):
            pts = el.get("points", [[0,0],[ew,eh]])
            for p in pts:
                min_x = min(min_x, ex + p[0])
                min_y = min(min_y, ey + p[1])
                max_x = max(max_x, ex + p[0])
                max_y = max(max_y, ey + p[1])
        else:
            min_x = min(min_x, ex)
            min_y = min(min_y, ey)
            max_x = max(max_x, ex + ew)
            max_y = max(max_y, ey + eh)

    vb_x = min_x - padding
    vb_y = min_y - padding
    vb_w = (max_x - min_x) + padding * 2
    vb_h = (max_y - min_y) + padding * 2

    bg = data.get("appState", {}).get("viewBackgroundColor", "#ffffff")

    out = []
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}" width="{vb_w:.0f}" height="{vb_h:.0f}">')
    out.append(f'<rect x="{vb_x}" y="{vb_y}" width="{vb_w}" height="{vb_h}" fill="{bg}"/>')

    # Render non-text first, then text on top
    for el in elements:
        if el.get("type") != "text":
            render_element(el, elmap, out)
    for el in elements:
        if el.get("type") == "text":
            render_element(el, elmap, out)

    out.append("</svg>")
    return "\n".join(out)

def render_to_png(excalidraw_path: Path, output_path: Path, scale: int = 2):
    data = json.loads(excalidraw_path.read_text(encoding="utf-8"))
    svg_content = excalidraw_to_svg(data)

    html = f"""<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>* {{margin:0;padding:0;box-sizing:border-box;}} body {{background:#fff;}}</style>
</head><body>{svg_content}</body></html>"""

    html_path = output_path.with_suffix(".html")
    html_path.write_text(html, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(device_scale_factor=scale)
        page.goto(html_path.as_uri())
        page.wait_for_timeout(500)
        svg_el = page.query_selector("svg")
        if svg_el:
            svg_el.screenshot(path=str(output_path))
            print(f"Rendered: {output_path}")
        else:
            page.screenshot(path=str(output_path), full_page=True)
            print(f"Rendered (full page): {output_path}")
        browser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", "-o", type=Path, default=None)
    parser.add_argument("--scale", "-s", type=int, default=2)
    args = parser.parse_args()
    out = args.output or args.input.with_suffix(".png")
    render_to_png(args.input, out, args.scale)
