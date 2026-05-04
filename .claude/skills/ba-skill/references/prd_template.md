# PRD/Spec Template — 4 Level

Template chuẩn cho tài liệu PRD/Spec. AI sử dụng template này khi chạy
Generate mode hoặc Structure mode.

---

## Auto Table of Contents

AI PHẢI sinh TOC tự động ở đầu file spec.md:

```markdown
# 📑 Mục lục
- [Thông tin quản lý](#thông-tin-quản-lý)
- [Level 1 – Product Overview](#level-1--product-overview)
- [Level 2 – Epic / Module](#level-2--epic--module)
- [Level 3 – Feature Detail](#level-3--feature-detail)
- [Level 4 – Sub-feature & Implementation](#level-4--sub-feature--implementation)
- [Thông tin bổ sung (NFR)](#thông-tin-bổ-sung)
- [Phụ lục](#phụ-lục)
```

---

## Template Sections

### 📋 THÔNG TIN QUẢN LÝ (Document Control)

```markdown
# PRODUCT REQUIREMENT DOCUMENT (PRD/SPEC)

---

## 📋 THÔNG TIN QUẢN LÝ
- **Feature ID & Name:** `{Feature_ID}` - {Tên tính năng}
- **Module:** {Tên module}
- **Author (BA):** {Tên BA — lấy từ git config user.name}
- **PM / Owner:** {Tên PM}
- **Status:** 🏷️ Draft | Reviewing | Approved | In Development | Done
- **Target Release / Sprint:** Sprint {X}
- **Created:** {DD/MM/YYYY}
- **Last Updated:** {DD/MM/YYYY}

### 🔄 Lịch sử thay đổi (Changelog)
| Ngày | Người thay đổi | Nội dung cập nhật | Version |
|------|----------------|-------------------|---------|
| {ngày tạo} | {tên BA} | Tạo mới spec | 1.0 |

### 📐 SCOPE BASELINE (Sau khi Approved)
| Metric | Count |
|--------|-------|
| Business Rules | {n} |
| Acceptance Criteria | {n} |
| API Endpoints | {n} |
| DB Tables affected | {n} |
| States in Machine | {n} |
| UI Fields | {n} |
| Estimated Effort | {S/M/L/XL} |

### 📋 CHANGE REQUEST LOG
| CR # | Ngày | Nguồn | Mô tả thay đổi | Before → After | Impact | Status |
|------|------|-------|-----------------|----------------|--------|--------|
| (Trống nếu chưa có CR) | | | | | | |
```

---

### LEVEL 1 – PRODUCT OVERVIEW (PM, BA)

```markdown
## LEVEL 1 – PRODUCT OVERVIEW

### 1.1. Overview (Mục tiêu)
* **Bài toán:** {Bài toán doanh nghiệp cần giải quyết}
* **Giá trị mang lại:** {Value for business}
* **Scope:** {Phạm vi tính năng — IN scope + OUT of scope}

### 1.2. User Personas
| Role | Tên vai trò | Quyền hạn chính | Tần suất sử dụng |
|------|------------|-----------------|-------------------|
| `role_code` | {Tên role} | {Quyền} | {Hàng ngày / Tuần / Tháng} |

### 1.3. Stakeholder / RACI Matrix
| Vai trò | Responsible | Accountable | Consulted | Informed |
|---------|-------------|-------------|-----------|----------|
| BA | ✅ | | | |
| PM | | ✅ | | |
| Dev | | | ✅ | |
| QA | | | | ✅ |

### 1.4. High-level Architecture / Data Flow
*(Mermaid diagram — tham khảo resources/mermaid_patterns.md)*

### 1.5. Glossary / Từ điển nghiệp vụ
| Thuật ngữ | Định nghĩa | Thuật ngữ EN |
|-----------|-----------|-------------|
| {VD: Phiếu nhập kho} | {Chứng từ ghi nhận hàng nhập vào kho} | Import Order |
```

---

### LEVEL 2 – EPIC / MODULE (System Architect, PM)

```markdown
## LEVEL 2 – EPIC / MODULE

### 2.1. Module & Main Workflows
* **Tên phân hệ:** {VD: Quản lý nhập kho}
* **Sơ đồ quy trình nghiệp vụ:**

*(Mermaid activity diagram)*

### 2.2. Feature & Impact Matrix
| Feature ID | Tên | Mục đích | Dependencies | Risk |
|-----------|-----|---------|-------------|------|
| {ID} | {Tên} | {Mô tả} | {Modules bị ảnh hưởng} | {Cao/TB/Thấp} |

### 2.3. Estimation Hints
| Metric | Count | Complexity |
|--------|-------|------------|
| Màn hình mới | {n} | |
| API endpoints | {n} | |
| Business Rules | {n} | |
| **Tổng ước lượng** | | **{S/M/L/XL}** |

### 2.4. Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| {Rủi ro} | {Cao/TB/Thấp} | {Cao/TB/Thấp} | {Giải pháp} |

### 2.5. Cross-feature Dependencies
| Feature này | Phụ thuộc vào | Loại | Link spec |
|------------|-------------|------|-----------|
| {ID} | {Feature ID khác} | {Data / API / UI} | {link} |
```

---

### LEVEL 3 – FEATURE DETAIL (Dev, QA)

```markdown
## LEVEL 3 – FEATURE DETAIL

### 3.1. User Story
**As a** `{Role}`, **I want to** `{Action}`, **so that** `{Value}`.

### 3.2. Pre-conditions & Post-conditions
* **Pre-conditions:** {VD: PO phải ở trạng thái "Đã duyệt"}
* **Post-conditions:** {VD: Trừ tồn kho, Ghi log audit, Gửi notification}

### 3.3. State Machine & Phân quyền Action
*(Mermaid state diagram — tham khảo resources/mermaid_patterns.md)*

| Trạng thái | Action | Trạng thái tiếp | Role | UI Element | Side Effects |
|-----------|--------|-----------------|------|-----------|-------------|
| Nháp | Gửi duyệt | Chờ duyệt | `người_tạo` | Nút Primary | Noti → `quản_lý` |

### 3.4. Button Matrix (Quyền thao tác theo trạng thái)
| Button | Nháp | Chờ duyệt | Đã duyệt | Hủy |
|--------|------|-----------|----------|-----|
| Sửa | ✅ Người tạo | ❌ | ❌ | ❌ |
| Xóa | ✅ Admin | ❌ | ❌ | ❌ |
| Duyệt | ❌ | ✅ Quản lý | ❌ | ❌ |
| In | ❌ | ❌ | ✅ All | ❌ |

### 3.5. Screen Flow Diagram
*(Mermaid flowchart — tham khảo resources/mermaid_patterns.md)*

### 3.6. Notification Rules
| Trigger Event | Channels | Recipients | Message Template |
|--------------|----------|-----------|-----------------|
| Gửi duyệt | Push + Email | `quản_lý` | "Phiếu {code} cần duyệt" |

### 3.7. Audit Trail Requirements
| Action | Log Fields | Retention |
|--------|-----------|-----------|
| Create/Update/Delete | who, when, before, after, IP | 2 years |
| Status change | who, when, old_status, new_status, reason | 5 years |
```

---

### LEVEL 4 – SUB-FEATURE & IMPLEMENTATION

```markdown
## LEVEL 4 – SUB-FEATURE: {Tên chức năng con}
*(Lặp lại Level 4 cho MỖI màn hình / chức năng con)*

### 4.1. UI/UX Specification
* **Design Link:** {Figma link}
* **Quyền truy cập:** {Roles nào thấy menu + url}
* **Mô tả:** {Chức năng màn hình}

**Data Grid / Form Detail:**
| Field | API/DB Name | Type | Required | Max | Reference | Validate / Logic |
|-------|------------|------|----------|-----|-----------|-----------------|
| {Tên} | `field_name` | String | Có | 255 | - | {Quy tắc} |

### 4.2. Business Rules
| Rule ID | Tên Rule | Logic (Pseudo-code) |
|---------|---------|---------------------|
| BR_01 | {Tên} | `{code logic}` |

### 4.3. Cross-field Validation
| Tình huống | Validation Logic | Error Message | Focus Field |
|-----------|-----------------|---------------|-------------|
| {Case} | `{condition}` | "{message}" | `{field}` |

### 4.4. API / Integration Contract
| Method | Path | Auth | Request Body | Response | Errors |
|--------|------|------|-------------|----------|--------|
| POST | /api/v1/{resource} | JWT | {DTO} | {Entity} | 400,403,409,422 |

### 4.5. Acceptance Criteria (BDD)

**Scenario 1: [Happy Case] {Tên}**
* **Given:** {Điều kiện}
* **When:** {Hành động}
* **Then:** {Kết quả}
* **And:** {Kết quả bổ sung}

**Scenario 2: [Edge Case] {Tên}**
* **Given:** {Điều kiện bất thường}
* **When:** {Hành động}
* **Then:** {Kết quả xử lý}

### 4.6. Data Migration Notes
| Change | Migration SQL | Rollback SQL |
|--------|-------------|-------------|
| {Mô tả} | `ALTER TABLE ...` | `ALTER TABLE ... DROP COLUMN` |
```

---

### THÔNG TIN BỔ SUNG (NFR)

```markdown
## THÔNG TIN BỔ SUNG (NFR)
* **Performance:** API list < 2s với {N} records. Export < 5s.
* **Security:** JWT token, RBAC, input sanitization, SQL injection prevention.
* **Availability:** 99.5% uptime.
* **Backup:** {Chiến lược backup}
```

---

### PHỤ LỤC

```markdown
## PHỤ LỤC

### Requirement Traceability Matrix (RTM)
| BR/AC ID | Requirement | Spec Section | Code File | Test Case | Status |
|----------|-------------|-------------|-----------|-----------|--------|
| BR_01 | {Tên} | 4.2 | {file:line} | TC_001 | ⬜ |

### UAT Script
| Step | Hành động | Expected Result | Pass? |
|------|----------|----------------|-------|
| 1 | {Action} | {Expected} | ☐ |

### Release Notes
**Version {X} — {DD/MM/YYYY}**
- ✅ {Feature mô tả ngắn}
- 🐛 {Bug fix}
```
