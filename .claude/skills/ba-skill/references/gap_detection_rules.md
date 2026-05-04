# Gap Detection Rules & Code-Spec Comparison

Quy tắc cho AI khi chạy Audit mode — phát hiện thiếu sót trong spec
và so sánh code vs spec.

---

## 1. Spec Completeness Checklist

AI PHẢI kiểm tra tất cả items sau khi sinh hoặc audit spec:

### Level 1-2 Checks
- [ ] Có Overview + mục tiêu nghiệp vụ?
- [ ] Có User Personas với roles rõ ràng?
- [ ] Có Glossary (từ điển nghiệp vụ)?
- [ ] Có High-level Architecture diagram?
- [ ] Có Impact Matrix?
- [ ] Có Risk Assessment?
- [ ] Có Estimation Hints?

### Level 3 Checks
- [ ] Có User Story format chuẩn (As a / I want / So that)?
- [ ] Có Pre-conditions + Post-conditions?
- [ ] Có State Machine diagram?
- [ ] Mỗi State có ít nhất 1 transition ra?
- [ ] Có Button Matrix?
- [ ] Có Screen Flow diagram?
- [ ] Có Notification Rules?
- [ ] Có Audit Trail requirements?

### Level 4 Checks
- [ ] Mỗi sub-feature có Field Mapping table?
- [ ] Mỗi Field có Validation rule?
- [ ] Có Business Rules với pseudo-code?
- [ ] Có Cross-field Validation?
- [ ] Có API Contract?
- [ ] Có Acceptance Criteria (BDD)?
- [ ] Có Data Migration Notes (nếu ảnh hưởng DB hiện có)?

### Cross-reference Checks (QUAN TRỌNG)
- [ ] Mỗi Business Rule → có ít nhất 1 AC kiểm chứng?
- [ ] Mỗi State transition → có Button tương ứng trong Button Matrix?
- [ ] Mỗi Button trong Matrix → có Conditional Rendering logic?
- [ ] Mỗi API endpoint → có AC test nó?
- [ ] Mỗi Notification Rule → có Side Effect trong State Machine?
- [ ] **Ngược lại:** Mỗi State transition có Side Effect → có Notification Rule? (nếu không cần noti → ghi rõ lý do)
- [ ] Fields trong Form → khớp với Entity trong ERD?

### Auto-Fix Rules

Khi phát hiện gap, AI xử lý theo severity:
- **🔴 Critical** → TỰ ĐỘNG bổ sung vào spec trước khi trả output:
  - BR thiếu AC → sinh AC mới (BDD format)
  - State thiếu Button → thêm row vào Button Matrix
  - Field thiếu Validation → thêm validation rule
  - State transition thiếu Noti rule → thêm noti hoặc ghi `(Không cần noti: {lý do})`
- **🟡 Warning** → Báo cáo trong Gap Report, KHÔNG tự fix
- **🟢 Info** → Ghi nhận, không action

---

## 2. Gap Report Output Format

```markdown
## 🔍 GAP ANALYSIS REPORT

**Spec:** {Feature ID} - {Tên}
**Date:** {DD/MM/YYYY}
**Overall Completeness:** {X}% ({n}/{total} checks passed)

### 🔴 Critical (phải fix trước khi dev)
| # | Gap | Section | Issue | Recommendation |
|---|-----|---------|-------|----------------|
| 1 | BR_03 không có AC | 4.2 → 4.5 | BR "Chặn sửa đã duyệt" chưa có test scenario | Thêm AC: edge case trạng thái Approved |

### 🟡 Warning (nên fix)
| # | Gap | Section | Issue | Recommendation |
|---|-----|---------|-------|----------------|
| 1 | Thiếu error message | 4.3 | Field "Mã SP" check unique nhưng chưa ghi error msg | Thêm "Mã sản phẩm đã tồn tại" |

### 🟢 Info (tham khảo)
| # | Note | Section |
|---|------|---------|
| 1 | Chưa có Figma link | 4.1 |
```

---

## 3. Code-Spec Comparison Rules

### Khi nào chạy
- User yêu cầu "so sánh code với spec"
- User là Dev/Tech Lead dùng Audit mode
- Sau sprint, trước release

### Quy trình so sánh

1. **Đọc spec** → trích xuất:
   - Danh sách Business Rules (BR_01, BR_02...)
   - Danh sách AC (Scenario 1, 2...)
   - State Machine transitions
   - API endpoints + error codes
   - Validation rules

2. **Đọc code** (user chỉ folder hoặc AI tìm theo API path):
   - Controllers/Routes → so với API Contract
   - Services/Models → so với Business Rules
   - Middleware/Guards → so với State Machine permissions
   - Validators → so với Validation Rules
   - Tests → so với Acceptance Criteria

3. **Sinh Requirement Traceability Matrix (RTM)**:

```markdown
## 📊 REQUIREMENT TRACEABILITY MATRIX
| BR/AC | Spec | Code | Test | Status |
|-------|------|------|------|--------|
| BR_01 | 4.2 | ✅ order.service.ts:45 | ✅ TC_001 | ✅ Covered |
| BR_02 | 4.2 | ✅ order.guard.ts:12 | ❌ Missing | ⚠️ No test |
| AC_01 | 4.5 | ✅ | ✅ TC_001 | ✅ Pass |
| AC_02 | 4.5 | ❌ NOT IMPLEMENTED | ❌ | 🔴 Gap |
```

4. **Sinh Code Deviation Report**:

```markdown
## ⚠️ CODE DEVIATIONS FROM SPEC
| # | Type | Spec says | Code does | Severity | Fix |
|---|------|----------|-----------|----------|-----|
| 1 | Missing BR | BR_02: Chặn sửa khi Approved | No guard found | 🔴 Critical | Add status guard in middleware |
| 2 | Wrong logic | VAT = 10% | Code: VAT = 0.1 * subtotal (✅ correct) | 🟢 OK | N/A |
| 3 | Extra code | Not in spec | Code has "export PDF" button | 🟡 Scope creep | Remove or add to spec |
```

---

## 4. Tech Lead Review Checklist

Auto-generated from spec content:

### Architecture
- [ ] API follows RESTful conventions?
- [ ] State transitions validated in backend (not just frontend)?
- [ ] Business rules in Service layer (not Controller)?
- [ ] Database queries optimized (no N+1)?

### Performance
- [ ] List APIs have pagination?
- [ ] Search endpoints have DB index?
- [ ] Export has row limit?
- [ ] Heavy operations use async queue?

### Security
- [ ] RBAC enforced in middleware (not just UI)?
- [ ] Input sanitized for all string fields?
- [ ] SQL injection protection on search/filter?
- [ ] Audit log captures who/what/when/before/after?
- [ ] Sensitive data (SĐT, Email) encrypted?

### Tech Debt
- [ ] Hardcoded values → should be config?
- [ ] Copy-paste logic → should be shared service?
- [ ] Synchronous heavy operations → should be queue?
- [ ] Missing error handling → silent failures?

---

## 5. Cross-Feature Consistency Check

Khi có nhiều specs, AI kiểm tra:

| Check | Example |
|-------|---------|
| Cùng entity nhưng khác fields? | Spec A: Product có 10 fields, Spec B: Product có 12 fields |
| Cùng enum nhưng khác values? | Spec A: status = [draft, approved], Spec B: status = [draft, pending, approved] |
| Cùng API nhưng khác contract? | GET /products trả về khác nhau giữa 2 specs |
| Glossary mâu thuẫn? | Spec A: "Phiếu nhập" = Import Order, Spec B: "Phiếu nhập" = Receipt |

Output: cảnh báo mâu thuẫn + suggest unified definition.
