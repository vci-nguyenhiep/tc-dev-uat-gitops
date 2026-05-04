# Conversion rules

## Naming
- Base the component name on the SVG filename.
- Convert the filename to PascalCase.
- Prefix the result with `Icon`.

Examples:
- `category.svg` -> `IconCategory`
- `category-outline.svg` -> `IconCategoryOutline`
- `user_add.svg` -> `IconUserAdd`

## Wrapper
Always generate:

```tsx
import React from 'react'

export default function IconName(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props}>
      ...
    </svg>
  )
}
```

## JSX conversion
Convert SVG/XML attribute names into React-friendly attribute names when needed.

Common examples:
- `class` -> `className`
- `fill-rule` -> `fillRule`
- `clip-path` -> `clipPath`
- `stroke-width` -> `strokeWidth`
- `stroke-linecap` -> `strokeLinecap`
- `stroke-linejoin` -> `strokeLinejoin`
- `xlink:href` -> `xlinkHref`

## Fill rule
- Keep `fill='none'` where it is intentionally used.
- Rewrite existing non-`none` fill values on filled shapes to `fill='currentColor'`.
- Preserve gradient references such as `fill='url(#paint0_linear_1_2)'`.
- Do not add a new fill attribute to shapes that did not have one originally.
