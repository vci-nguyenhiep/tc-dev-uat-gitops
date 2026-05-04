/**
 * Batch convert SVG files in src/assets/Icon-svg/ to React icon components
 * in src/assets/icons/ following the svg-to-react skill convention.
 *
 * Usage: node scripts/convert-svg-to-react.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const INPUT_DIR = path.join(ROOT, 'src/assets/Icon-svg')
const OUTPUT_DIR = path.join(ROOT, 'src/assets/icons')

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert "Arrow-down-to-line" → "ArrowDownToLine" */
function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

/**
 * Derive component name from file path.
 * - Folder-based: Icon-svg/Bell/Light.svg → IconBell
 * - Root file:    Icon-svg/Bars.svg       → IconBars
 * - Special:      Icon-svg/Arrow đown/Light.svg → IconArrowDown
 */
function deriveComponentName(relPath) {
  const parts = relPath.replace(/\\/g, '/').split('/')
  const fileName = parts[parts.length - 1].replace('.svg', '')
  const isVariantFile = ['light', 'regular', 'soild', 'solid', 'right', 'default', 'upload'].includes(
    fileName.toLowerCase()
  )

  let baseName
  if (parts.length > 1 && isVariantFile) {
    // Use folder name as the icon name
    baseName = parts[parts.length - 2]
  } else {
    baseName = fileName
  }

  // Fix known typos/unicode in folder names
  baseName = baseName.replace('đown', 'down').replace('Salendar', 'Calendar')

  return 'Icon' + toPascalCase(baseName)
}

/** Convert SVG attribute names to JSX camelCase */
const ATTR_MAP = {
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'clip-path': 'clipPath',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  'xmlns:xlink': 'xmlnsXlink',
  'xlink:href': 'xlinkHref',
  'mask-type': 'maskType',
  class: 'className',
  tabindex: 'tabIndex',
  'xml:space': 'xmlSpace'
}

function convertAttributes(svgContent) {
  let result = svgContent

  // Convert style="..." to JSX style objects
  result = result.replace(/style="([^"]*)"/g, (_, styleStr) => {
    const pairs = styleStr
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const [prop, val] = pair.split(':').map((s) => s.trim())
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        return `${camelProp}: '${val}'`
      })
    return `style={{${pairs.join(', ')}}}`
  })

  // Convert kebab-case attributes to camelCase
  for (const [from, to] of Object.entries(ATTR_MAP)) {
    // Match attribute name followed by = (not inside a word)
    const regex = new RegExp(`(\\s)${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`, 'g')
    result = result.replace(regex, `$1${to}=`)
  }

  return result
}

/**
 * Normalize fill values per skill rules:
 * - Keep fill="none"
 * - Keep fill="url(...)"
 * - Rewrite other fill values to "currentColor"
 * - Don't add fill where it doesn't exist
 */
function normalizeFill(svgContent) {
  return svgContent.replace(/fill="([^"]*)"/g, (match, val) => {
    if (val === 'none' || val.startsWith('url(')) return match
    return 'fill="currentColor"'
  })
}

/** Add {...props} to the root <svg> element */
function addProps(svgContent) {
  return svgContent.replace(/<svg\b([^>]*)>/, (match, attrs) => {
    return `<svg${attrs} {...props}>`
  })
}

function generateComponent(name, svgBody) {
  return `import React from 'react'

export default function ${name}(props: React.SVGProps<SVGSVGElement>) {
  return (
    ${svgBody}
  )
}
`
}

// ─── Walk & Convert ─────────────────────────────────────────────────────────

function getAllSvgFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllSvgFiles(fullPath))
    } else if (entry.name.endsWith('.svg')) {
      results.push(fullPath)
    }
  }
  return results
}

// ─── Main ───────────────────────────────────────────────────────────────────

const svgFiles = getAllSvgFiles(INPUT_DIR)
const seen = new Map() // name → source path (detect duplicates)
let created = 0
let skipped = 0

for (const filePath of svgFiles) {
  const relPath = path.relative(INPUT_DIR, filePath)
  const name = deriveComponentName(relPath)
  const outFile = path.join(OUTPUT_DIR, `${name}.tsx`)

  // Handle duplicates — e.g. Diagram-subtask.svg AND Diagram-subtask/Light.svg
  if (seen.has(name)) {
    console.warn(`⚠ SKIP duplicate "${name}" from ${relPath} (already from ${seen.get(name)})`)
    skipped++
    continue
  }
  seen.set(name, relPath)

  // Skip files that are too large (likely multi-color/complex icons like Google Meet)
  const raw = fs.readFileSync(filePath, 'utf-8')
  if (raw.length > 10000) {
    console.warn(`⚠ SKIP "${name}" (${relPath}) — file too large (${raw.length} chars), likely multi-color`)
    skipped++
    continue
  }

  let svg = raw.trim()
  svg = normalizeFill(svg)
  svg = convertAttributes(svg)
  svg = addProps(svg)

  // Indent SVG body
  const indented = svg
    .split('\n')
    .map((line, i) => (i === 0 ? line : '    ' + line))
    .join('\n')

  const component = generateComponent(name, indented)
  fs.writeFileSync(outFile, component, 'utf-8')
  created++
}

console.log(`\n✅ Done: ${created} components created, ${skipped} skipped`)
console.log(`📁 Output: ${OUTPUT_DIR}`)
