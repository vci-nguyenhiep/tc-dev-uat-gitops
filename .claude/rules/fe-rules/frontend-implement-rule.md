---
description: Quy trình triển khai Frontend module + quy tắc chung
alwaysApply: true
---

# Quy Trình Triển Khai Frontend Module

Dự án sử dụng React + TypeScript + Ant Design + React Query + React Router + Formik + Yup + Zustand + Tailwind CSS.

---

## Quy tắc chung

- Dev **chỉ được phép sửa** các thư mục: `src/assets`, `src/context`, `src/modules`, `src/config/urls.ts`, `src/config/queryKeys.ts`, `src/types`, `src/hooks`, `src/routers`
- **BẮT BUỘC** dùng share-components từ `src/components/share-components` cho toàn bộ UI. Chỉ khi share-components KHÔNG có mới được fallback sang Ant Design. Chỉ khi Ant Design cũng không có mới viết custom (và phải đặt trong module, không tạo mới trong `share-components`)
- Mức độ ưu tiên (áp dụng theo thứ tự, dừng lại khi đủ): Share-components → Ant Design → HTML cơ bản
- **KHÔNG** được import trực tiếp `Button`, `Input`, `Select`, `DatePicker`, `Modal` (chỉ confirm — dùng `ModalConfirmComponent`), `Table`, `Tabs`, `Drawer`, `Switch`, `Upload`, `Tag`, `Typography` từ `antd` nếu share-components đã có bản wrap (xem bảng Catalog bên dưới)
- Button gọi API luôn phải có trạng thái loading
- Khi loading dữ liệu phải có skeleton hoặc spinner, không để giao diện trống — dùng `SkeletonComponent` / `SkeletonTableComponent` / `SkeletonFormComponent`
- Sử dụng React Query để quản lý server state, không dùng useState cho server state
- Icon từ `src/assets/icons` (160+ SVG components), không thêm thư viện icon mới
- Feature có upload file **BẮT BUỘC** theo workflow trong `.claude/rules/common/file-upload-workflow.md` — upload ngay khi chọn file, form state chỉ chứa `IAttachedFile[]` (id + fileName), save payload gửi JSON với `*FileIds: string[]` (không multipart). UI upload dùng `UploadComponent` / `UploadDraggerComponent`
- Notify toast dùng hook `useAntNotification()` (không gọi `notification.*` của Ant Design trực tiếp)
- Color dùng CSS variable tokens `var(--color-*)`, không hardcode hex
- Text dùng `TypographyComponent`, không dùng `text-sm`, `font-bold` trực tiếp cho content

---

## Catalog Shared Components (BẮT BUỘC — dùng khi có)

Nguồn: `src/components/share-components/index.ts`. Mọi feature phải tra bảng này TRƯỚC khi code UI.

### 1. Input & Form Controls

| Nhu cầu UI | Dùng (share-components) | Import | Fallback Ant Design |
|------------|-------------------------|--------|---------------------|
| Textbox thường | `InputIconComponent` (không truyền `prefixIcon`/`suffixIcon`) | `import { InputIconComponent } from 'src/components/share-components'` | `Input` |
| Ô tìm kiếm có icon | `InputIconComponent` (truyền `prefixIcon={<IconSearch />}`) | như trên | `Input.Search` |
| Input số (currency, integer, decimal) | — (share-components chưa có) | — | `InputNumber` (được phép) |
| Select 1 giá trị | `SelectComponent` | `import { SelectComponent } from 'src/components/share-components'` | `Select` |
| Select nhiều giá trị | `MultiSelectComponent` | `import { MultiSelectComponent } from 'src/components/share-components'` | `Select mode='multiple'` |
| Select cây (tree) | `TreeSelectComponent` | `import { TreeSelectComponent } from 'src/components/share-components'` | `TreeSelect` |
| Select load async từ API | `AsyncSelectComponent` | `import { AsyncSelectComponent } from 'src/components/share-components'` | (không có) |
| DatePicker / MonthPicker | `DatePickerComponent` | `import { DatePickerComponent } from 'src/components/share-components'` | `DatePicker` |
| Range date | `RangePickerComponent` | `import { RangePickerComponent } from 'src/components/share-components'` | `DatePicker.RangePicker` |
| TimePicker | `TimePickerComponent` | `import { TimePickerComponent } from 'src/components/share-components'` | `TimePicker` |
| Time range | `TimeRangePickerComponent` | `import { TimeRangePickerComponent } from 'src/components/share-components'` | `TimePicker.RangePicker` |
| Switch on/off | `SwitchComponent` | `import { SwitchComponent } from 'src/components/share-components'` | `Switch` |
| Upload file | `UploadComponent` / `UploadDraggerComponent` | `import { UploadComponent } from 'src/components/share-components'` | `Upload` |
| Formik error message | `FormikErrorMessage` | `import { FormikErrorMessage } from 'src/components/share-components'` | (tự render) |

### 2. Buttons

| Nhu cầu UI | Dùng (share-components) | Import | Fallback |
|------------|-------------------------|--------|----------|
| Nút chính (submit, save, confirm) | `PrimaryButtonComponent` | `import { PrimaryButtonComponent } from 'src/components/share-components'` | `Button type='primary'` |
| Nút phụ (cancel, back, icon action) | `DefaultButtonComponent` | `import { DefaultButtonComponent } from 'src/components/share-components'` | `Button` |

### 3. Data Display

| Nhu cầu UI | Dùng (share-components) | Import | Fallback Ant Design |
|------------|-------------------------|--------|---------------------|
| Bảng dữ liệu | `TableComponent` | `import { TableComponent } from 'src/components/share-components'` | `Table` |
| Config ẩn/hiện cột bảng | `TableConfigColumnComponent` | `import { TableConfigColumnComponent } from 'src/components/share-components'` | (không có) |
| Phân trang bảng | `TablePaginationComponent` | `import { TablePaginationComponent } from 'src/components/share-components'` | `Pagination` |
| Tabs | `TabsComponent` | `import { TabsComponent } from 'src/components/share-components'` | `Tabs` |
| Badge trạng thái (Draft/Active/Locked…) | `StatusTagComponent` | `import { StatusTagComponent } from 'src/components/share-components'` | `Tag` |
| Text, heading, label, caption | `TypographyComponent` | `import { TypographyComponent } from 'src/components/share-components'` | `Typography.*` |
| Breadcrumb | `BreadcrumbComponent` | `import { BreadcrumbComponent } from 'src/components/share-components'` | `Breadcrumb` |

### 4. Feedback / Overlay

| Nhu cầu UI | Dùng (share-components) | Import | Fallback Ant Design |
|------------|-------------------------|--------|---------------------|
| Modal confirm (xoá, submit, cảnh báo) | `ModalConfirmComponent` | `import { ModalConfirmComponent } from 'src/components/share-components'` | `Modal.confirm` |
| Modal xem trước file / custom modal khác | — (share-components chưa có) | — | `Modal` (được phép) |
| Drawer (form tạo/sửa, chi tiết) | `DrawerComponent` | `import { DrawerComponent } from 'src/components/share-components'` | `Drawer` |
| Notification / toast | `useAntNotification()` hook | `import { useAntNotification } from 'src/components/share-components'` | `notification.*` |
| Skeleton loading chung | `SkeletonComponent` | `import { SkeletonComponent } from 'src/components/share-components'` | `Skeleton` |
| Skeleton loading cho bảng | `SkeletonTableComponent` | `import { SkeletonTableComponent } from 'src/components/share-components'` | `Skeleton` (custom) |
| Skeleton loading cho form | `SkeletonFormComponent` | `import { SkeletonFormComponent } from 'src/components/share-components'` | `Skeleton` (custom) |

### 5. Khi share-components KHÔNG có

Dùng Ant Design component tương ứng (checkbox, radio, slider, collapse, popover, tooltip, dropdown, card, divider, empty, spin, alert, message, result, steps, timeline, form, **InputNumber**, **Modal** custom, **Skeleton** custom, **Flex**…). KHÔNG tự build lại khi Ant Design đã đáp ứng.

> **Ghi chú**: Với nút icon-only borderless (row action `…`, toolbar icon) — dùng `DefaultButtonComponent` của share-components, chấp nhận UX có viền nhẹ. KHÔNG dùng `Button type='text'` từ antd.

### 6. Cấm

- Cấm import `Button`, `Input`, `Select`, `DatePicker`, `TimePicker`, `Switch`, `Upload`, `Tabs`, `Drawer`, `Table`, `Pagination`, `Breadcrumb`, `Tag`, `Typography` trực tiếp từ `antd` khi share-components đã có wrap (xem bảng trên). Trường hợp `Modal`: chỉ cấm dùng `Modal.confirm` (phải dùng `ModalConfirmComponent`); `Modal` custom (preview file, dialog đặc biệt) vẫn được phép.
- Cấm tạo component mới trong `src/components/share-components/` — đây là thư mục dùng chung, chỉ core team được sửa. Nếu cần mở rộng shared component, đề xuất qua spec/issue, KHÔNG tự thêm
- Cấm copy-paste logic từ share-components sang module để "chỉnh sửa riêng" — dùng prop/compose thay vì fork

---

## Thứ tự triển khai module mới

### Bước 1 — Định nghĩa URL (`src/config/urls.ts`)

```ts
web: {
  moduleName: {
    list: '/module-name',
    detail: '/module-name/:id',
    create: '/module-name/create'
  }
}
api: {
  moduleName: {
    getList: '/module-name',
    getDetail: '/module-name/:id',
    create: '/module-name',
    update: '/module-name/:id',
    delete: '/module-name/:id'
  }
}
```

- Web URL: path tuyệt đối (`/`), API: path tương đối
- Param động: `:paramName`, thay bằng `.replace(':paramName', value)`

### Bước 2 — Đăng ký query keys (`src/config/queryKeys.ts`)

```ts
moduleName: {
  list: 'module_name_list',
  detail: 'module_name_detail'
}
```

Key dạng snake_case, mỗi query có key riêng để `invalidateQueries` chính xác.

### Bước 3 — Định nghĩa Types

Types được đặt gần với nơi sử dụng, không tập trung vào `src/types/`:

**Shared types** (dùng chung nhiều sub-module): đặt trong `src/modules/<moduleName>/types/`
```
src/modules/moduleName/
└── types/
    └── moduleName.type.ts   ← enums, interfaces dùng chung (List, Detail, Create, Update...)
```

**Module-specific types** (chỉ dùng trong 1 sub-module): đặt trong sub-module tương ứng
```
src/modules/moduleName/
└── moduleNameCreate/
    └── types/
        └── moduleNameCreate.type.ts   ← form model, request/response riêng của Create
```

```ts
// shared: src/modules/moduleName/types/moduleName.type.ts
export enum ModuleStatus { Draft = 1, Active = 2 }

export interface IModuleNameSummary {
  id: string
  name: string
  status: ModuleStatus
}

// module-specific: src/modules/moduleName/moduleNameCreate/types/moduleNameCreate.type.ts
import type { ModuleStatus } from '../../types/moduleName.type'

export interface IModuleNameCreateForm {
  name: string
  // UI-only fields...
}

export interface ICreateModuleNameRequest {
  name: string
  // API payload...
}
```

- Interface bắt đầu bằng `I` (PascalCase)
- Response wrap trong `SuccessResponse<T>` hoặc `SuccessResponse<IResponsePagination<T>>`
- **Không** đặt types vào `src/types/<moduleName>/` — thư mục đó chỉ dành cho types dùng toàn app (base, common)

### Bước 4 — Cấu trúc thư mục module

```
src/modules/moduleName/
├── moduleNameList/
│   ├── components/
│   │   ├── ModuleNameHeader.tsx
│   │   └── ModuleNameColumns.tsx
│   ├── services/
│   │   ├── moduleName.services.ts
│   │   ├── useModuleNameQueries.ts
│   │   ├── useModuleNameMutations.ts
│   │   └── useModuleNameHook.ts
│   ├── types/
│   │   ├── moduleNameList.type.ts
│   └── index.tsx
├── moduleNameDetail/
└── moduleNameCreate/
```

### Bước 5–9 — Implement theo pattern

> Xem chi tiết trong `patterns/api-module.md`, `patterns/forms.md`, `patterns/notifications.md`, `patterns/query-params-filter.md`

Tóm tắt thứ tự: Service → Queries/Mutations → Business hook → Components → Page

> **Trang danh sách có filter/search/pagination**: BẮT BUỘC dùng pattern trong `patterns/query-params-filter.md` — đồng bộ filter state với URL query params qua `useQueryParams` hook.

### Bước 10 — Đăng ký Route (`src/routers/main.routes.tsx`)

```tsx
import ModuleNamePage from 'src/modules/moduleName/moduleNameList'

{
  path: urls.web.moduleName.list,
  element: (
    <MustPermission permission='Admin.ModuleName.GetAll'>
      <ModuleNamePage />
    </MustPermission>
  )
}
```

---

## Quy tắc bổ sung

### CSS / Style conventions

**Thứ tự ưu tiên — áp dụng theo thứ tự này, dừng lại khi đủ:**

1. **Tailwind utility classes** — dùng cho mọi style cục bộ (layout, spacing, color, typography)
2. **Inline style** — chỉ dùng cho giá trị động không thể biết lúc build (`style={{ width: dynamicWidth }}`)
3. **CSS Module (`.module.css`)** — chỉ dùng khi cần override Ant Design internal selectors (dùng `:global(.ant-*)` bên trong)
4. **Plain CSS (`.css`)** — chỉ dùng cho shared components cần override Ant Design global class (không dùng trong module code)

```tsx
// ✅ Tailwind — dùng trước tiên
<div className='flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-sub)] rounded-lg'>

// ✅ Inline style — chỉ khi giá trị động
<div style={{ width: props.width, top: offsetTop }}>

// ✅ CSS Module — chỉ khi cần override Ant Design
// MyComponent.module.css
// :global(.ant-table-thead > tr > th) { background: var(--color-bg-table-header); }
import styles from './MyComponent.module.css'
<div className={styles.wrapper}>

// ❌ Không dùng CSS Module cho style thông thường
// ❌ Không hardcode hex color
// ❌ Không dùng inline style cho giá trị tĩnh
```

**Khi nào cần CSS Module:**
- Override `ant-*` class của Ant Design (dropdown, picker, table header, modal...)
- Style phụ thuộc pseudo-selector phức tạp không express được bằng Tailwind arbitrary values

**Không cần CSS Module khi:**
- Tailwind arbitrary values đủ dùng: `className='border border-[var(--color-border)]'`
- Style đơn giản như padding, margin, flexbox, color

### Commit message format

```
feat: add module-name list page
fix: resolve pagination bug in module-name
refactor: extract module-name hook logic
```

Không viết hoa chữ đầu, không dấu chấm cuối, không quá 50 ký tự.

---

## Component & Styling reference (đọc khi cần)

Khi implement component cụ thể, đọc docs chi tiết:
- `.claude/skills/frontend/references/components/` — Button, Input, Modal, Select, Table, Typography
- `.claude/skills/frontend/references/styling/` — Colors, Icons
- `.claude/skills/frontend/references/patterns/` — Query params filter, Formik form, API module structure, Notification workflow

