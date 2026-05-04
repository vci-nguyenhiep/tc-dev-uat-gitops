---
name: ba-skill
description: |
  Skill dành riêng cho Business Analyst (BA) — sinh & quản lý tài liệu PRD/Spec
  chuẩn .md. Hỗ trợ 4 chế độ: Generate (sinh PRD mới), Structure (cấu trúc hoá
  thông tin rời rạc), Update (cập nhật spec + changelog + CR), Audit (gap
  detection + code-spec comparison).
  Dùng khi user nói "tạo spec", "viết PRD", "tạo tài liệu BA", "cấu trúc lại",
  "có meeting notes", "cập nhật spec", "sửa spec", "thêm BR", "kiểm tra spec",
  "audit spec", "so sánh code spec".
  Về Mockup UI → dùng skill riêng `fe-ui-mockup`.
---

# Goal

Giúp BA sinh tài liệu PRD/Spec chuẩn .md trong 10 phút (thay vì 2-3 giờ),
đảm bảo output đủ chi tiết để Dev implement và QA test không cần hỏi lại.

# Instructions

## Bước 0: Nhận diện chế độ

Khi user kích hoạt skill, phân tích câu hỏi để tự chọn mode:

| Trigger keywords | Mode |
|-----------------|------|
| "tạo spec", "viết PRD", "tạo tài liệu" | **Generate** |
| "cấu trúc lại", "có meeting notes", "ghi chú cuộc họp" | **Structure** |
| "cập nhật spec", "sửa spec", "thêm BR" | **Update** |
| "kiểm tra spec", "so sánh code", "audit" | **Audit** |

> Mockup UI → chuyển sang skill `fe-ui-mockup` (đã tách riêng).

Ngôn ngữ output: chuẩn template, đầy đủ Level 1-4, tiếng Việt cho business,
tiếng Anh cho technical terms.

---

## Mode 1: Generate — Sinh PRD mới

📚 **Template chi tiết:** `references/prd_template.md`

1. Hỏi BA thông tin tối thiểu:
   - Feature ID & tên (VD: `IMS_NK_01` - Nhập kho vật tư)
   - Mục tiêu nghiệp vụ (bài toán giải quyết)
   - User chính (roles)
   - Luồng nghiệp vụ tổng quát
2. Sinh tài liệu PRD 4 level theo template `references/prd_template.md`:
   - **Level 1**: Product Overview (PM, BA)
   - **Level 2**: Epic/Module (Architect, PM)
   - **Level 3**: Feature Detail — User Story, State Machine, Button Matrix
   - **Level 4**: Sub-feature — UI Spec, Business Rules, Validation, API, AC
3. Tự động sinh Mermaid diagrams (**BẮT BUỘC** — không được bỏ qua):
   - 📚 Sử dụng mẫu từ `references/mermaid_patterns.md`
   - **State Machine diagram** cho vòng đời trạng thái — **LUÔN LUÔN tạo**, kể cả feature đơn giản (mọi feature đều có ít nhất 1 state transition: initial → active, enabled → disabled, v.v.)
   - Screen Flow diagram cho navigation
   - ERD cho data model
   - Sequence diagram cho các flow chính (login, submit, approval, v.v.)
4. Tự động thêm các section bonus:
   - Glossary (từ điển nghiệp vụ)
   - Notification Rules (ai nhận noti khi nào)
   - Audit Trail (action nào cần log)
   - Risk Assessment + Estimation Hints
   - Data Migration Notes (nếu ảnh hưởng DB hiện có)
   - Review Status: `Draft`
5. Tạo output theo cấu trúc folder:
   ```
   docs/specs/{module}/{Feature_ID}_{tên_snake_case}/
   ├── spec.md          ← Tài liệu PRD chính (có Auto TOC + Mermaid inline)
   └── diagrams.md      ← (Optional) Tách riêng nếu spec > 500 dòng
   ```
6. Tạo/update `docs/specs/{module}/README.md` — index features
7. ✅ VERIFY: Chạy gap detection tự động
   - 📚 `references/gap_detection_rules.md`
   - **AUTO-FIX**: Nếu phát hiện gap 🔴 Critical → tự bổ sung ngay vào spec
     trước khi trả output. Chỉ báo cáo gap 🟡 Warning và 🟢 Info.

---

## Mode 2: Structure — Cấu trúc hoá thông tin rời rạc

1. Nhận input: meeting notes, Jira tickets, email, hoặc text tự do
2. Trích xuất: features, rules, roles, flows, fields, edge cases
3. Sinh PRD chuẩn template (giống Mode 1, bước 2-7)
4. Đánh dấu `[⚠️ CẦN XÁC NHẬN]` ở những chỗ AI không chắc chắn
5. ✅ VERIFY: gap detection

---

## Mode 3: Update — Cập nhật spec đã có

1. Đọc spec hiện tại (user chỉ đường dẫn hoặc AI tìm trong `docs/specs/`)
2. Thực hiện thay đổi theo yêu cầu BA
3. **Auto Changelog**: Thêm dòng mới vào bảng Lịch sử thay đổi
   - Ngày: lấy ngày hiện tại
   - Người: đọc từ `git config user.name`, nếu không có → hỏi
   - Nội dung: AI tóm tắt thay đổi
   - Version: tự tăng (minor cho thêm section, patch cho sửa nhỏ)
4. **Scope Change Detection** (nếu spec đã Approved):
   - So sánh với Scope Baseline → tính % thay đổi
   - Nếu vượt baseline → tự tạo Change Request:
     - Phân loại: 🔵 Khách hàng / 🟡 Nội bộ / 🟢 Bug fix
     - Tính impact: effort (MD), risk, modules ảnh hưởng
   - Ghi vào CR Log trong spec
5. ✅ VERIFY: gap detection sau update

---

## Mode 4: Audit — Kiểm tra spec

📚 **Quy tắc chi tiết:** `references/gap_detection_rules.md`

1. Đọc spec (user chỉ file hoặc feature ID)
2. **Gap Detection** — kiểm tra thiếu sót:
   - Mỗi Business Rule có AC tương ứng?
   - Mỗi State có Button Matrix?
   - Mỗi Field có Validation?
   - Cross-feature consistency (cùng entity nhưng mô tả khác nhau?)
3. **Code-Spec Comparison** (optional, nếu BA yêu cầu hoặc phối hợp Dev):
   - Đọc source code liên quan (user chỉ folder hoặc AI tìm theo API endpoints)
   - So sánh: code implement đúng spec chưa?
   - Sinh Requirement Traceability Matrix (RTM): BR → AC → Code → Test → Status
4. Output: Gap Report + danh sách action items ưu tiên

> **Lưu ý:** Mode này có thể được Dev/Tech Lead tái sử dụng để architecture
> review, performance & security checklist. Phần BA tập trung vào gap
> detection + RTM.

---

> **Mockup Mode đã tách:** xem skill `fe-ui-mockup` (Skills/fe-ui-mockup/).

---

# Examples

## Ví dụ 1: BA tạo spec mới (Generate Mode)

**Input:**
> "Tạo spec cho tính năng nhập kho vật tư. Thủ kho tạo phiếu nhập, quản lý
> duyệt. Cần track số lượng, đơn giá, VAT."

**Output:** AI sinh spec đầy đủ 4 level vào
`docs/specs/inventory/IMS_NK_01_nhap_kho/spec.md`, bao gồm State Machine
(Nháp → Chờ duyệt → Đã duyệt), Business Rules (BR_01 tính tổng tiền),
Acceptance Criteria BDD, Button Matrix, và gap report cuối cùng.

## Ví dụ 2: BA cấu trúc hoá meeting notes (Structure Mode)

**Input:**
> "Đây là ghi chú họp về feature xuất kho: [paste text]. Cấu trúc lại giúp."

**Output:** AI trích xuất features/rules/roles/flows, sinh PRD chuẩn template
và đánh dấu các điểm cần xác nhận thêm.

## Ví dụ 3: BA cập nhật spec (Update Mode)

**Input:**
> "Thêm BR_05 vào spec IMS_NK_01: nếu đơn hàng > 50tr phải có duyệt GĐ."

**Output:** AI thêm BR_05 + AC tương ứng, auto changelog, detect scope change
(nếu spec đã Approved) và tạo CR log.

---

# Constraints

- 🚫 KHÔNG tự bịa dữ liệu — thiếu thông tin → hỏi user, đánh dấu `[⚠️ CẦN XÁC NHẬN]`
- 🚫 KHÔNG bỏ section nào trong template dù không có data — ghi "Chưa xác định"
- 🚫 KHÔNG hardcode API keys, passwords, tokens vào output
- ✅ LUÔN chạy gap detection sau khi sinh/update spec
- ✅ LUÔN auto-fix gap 🔴 Critical trước khi trả output
- ✅ LUÔN tạo Auto TOC ở đầu `spec.md`
- ✅ LUÔN tạo output theo cấu trúc folder `docs/specs/{module}/{Feature_ID}_{tên}/`
- ✅ LUÔN ghi Changelog khi update spec
- ✅ LUÔN đảm bảo Notification Rules phủ hết mọi State transition có Side Effect
- ⚠️ Khi spec đã Approved mà BA update → PHẢI tạo CR, không update lặng lẽ
- ⚠️ Mermaid diagrams PHẢI quote labels chứa ký tự đặc biệt
- ⚠️ SKILL.md reference `references/` cho chi tiết — KHÔNG copy template vào đây
- ✅ LUÔN sinh Mermaid diagrams phù hợp nghiệp vụ kể cả khi được gọi từ OpenSpec flow với custom `outputPath` — diagrams là phần bắt buộc của mọi spec output, không chỉ riêng `docs/specs/`
- ✅ **BẮT BUỘC tạo State Machine diagram** cho MỌI spec output — không có ngoại lệ. Nếu feature không có approval flow, vẫn phải vẽ state machine cho lifecycle của entity chính (ví dụ: Active/Inactive, Enabled/Disabled, Pending/Completed)

<!-- Version: 1.0.0 (tách từ vci-skill-cuongbx v1.1.1) -->
<!-- Scope: BA modes only (Generate, Structure, Update, Audit, Mockup) -->
