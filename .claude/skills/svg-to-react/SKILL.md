---
name: svg-to-react
description: convert pasted svg markup or uploaded .svg icon files into react components. use when a user asks to turn an svg into tsx/jsx, build an icon component from an svg file, batch-convert svg icons, or standardize icon components with the format icon{objectname}, react svg props, root {...props}, and fill set to currentcolor on filled shapes.
---

# Svg to React

Convert SVG markup into a React component that follows this project convention:

```tsx
import React from 'react'

export default function IconCategory(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props}>
      ...
    </svg>
  )
}
```

## Batch convert with script

For bulk conversion, use the Node.js script bundled with this skill:

```bash
node skills/svg-to-react/convert-svg-to-react.mjs
```

- **Input:** `src/assets/Icon-svg/` — SVG files, supports nested folders (e.g. `Bell/Light.svg` → `IconBell`)
- **Output:** `src/assets/icons/` — one `.tsx` component per SVG
- Automatically skips duplicates and files > 10KB (multi-color icons)
- Fixes known typos in folder names (e.g. `Arrow đown` → `ArrowDown`)
- After running, update the barrel export in `src/assets/icons/index.ts`
- Preview all icons at `/icons` page in the app

## Workflow

1. Identify the source.
   - If the user pasted raw `<svg ...>...</svg>` markup, convert it directly in the response.
   - If the user wants to batch-convert all SVGs in `src/assets/Icon-svg/`, run the script above.

2. Derive the component name.
   - Use the SVG filename as the source of truth when a file exists.
   - Convert the filename to PascalCase and prefix it with `Icon`.
   - Examples:
     - `category.svg` -> `IconCategory`
     - `category-outline.svg` -> `IconCategoryOutline`
     - `arrow_left_circle.svg` -> `IconArrowLeftCircle`
   - If the user pasted SVG without a filename, infer a short object name from the icon meaning or ask only if the name is critical.

3. Generate the wrapper exactly in this shape.

```tsx
import React from 'react'

export default function IconName(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg ... {...props}>
      ...
    </svg>
  )
}
```

4. Apply JSX-safe SVG conversion rules.
   - Add `{...props}` on the root `<svg>` element.
   - Convert SVG attribute names to React/JSX names, for example:
     - `class` -> `className`
     - `fill-rule` -> `fillRule`
     - `clip-rule` -> `clipRule`
     - `clip-path` -> `clipPath`
     - `stroke-width` -> `strokeWidth`
     - `stroke-linecap` -> `strokeLinecap`
     - `stroke-linejoin` -> `strokeLinejoin`
     - `xmlns:xlink` -> `xmlnsXlink`
     - `xlink:href` -> `xlinkHref`
   - Preserve `viewBox`, `width`, `height`, `xmlns`, transforms, masks, defs, and gradients unless they must be renamed for JSX.

5. Normalize fill behavior.
   - Keep `fill='none'` when it is explicitly used on the root `<svg>` or on shapes that must remain empty.
   - For filled shapes that already have a `fill` value other than `none` or `url(...)`, rewrite it to `fill='currentColor'`.
   - Do not invent a new `fill` attribute on shapes that did not originally have one.
   - Do not rewrite gradient references such as `fill='url(#paint0_linear_1_2)'`.

6. Output style.
   - Default to returning only the component code unless the user asks for explanation.
   - For multiple files, return one component per file and keep the filename-based naming.
   - Prefer single quotes in generated code to match the requested style.


## Edge cases

- If the SVG contains inline `style="..."`, convert it to a JSX style object when straightforward.
- If the SVG depends on external CSS, embedded scripts, or unsupported constructs, convert the structure first and then warn briefly about the remaining manual cleanup.
- If a user asks for a different wrapper signature or export style, follow the user's explicit format instead of the default.
