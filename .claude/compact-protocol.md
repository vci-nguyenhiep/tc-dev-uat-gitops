# Compact Protocol — Quy tắc bắt buộc sau mỗi task

Mọi agent **phải** thực hiện compact ngay sau khi hoàn thành task của mình.
Không compact = bước tiếp theo nhận context rác, sinh lỗi.

---

## Tại sao cần compact?

Mỗi agent khi chạy tích lũy trong context:
- Toàn bộ nội dung file đã đọc
- Các lần thử / sửa lỗi giữa chừng
- Output trung gian không cần thiết

Nếu không compact, agent thứ 4 (Frontend) phải mang context của cả 3 agent trước
→ chậm, tốn token, dễ bị hallucination vì context quá dài.

---

## Quy trình compact chuẩn (áp dụng cho mọi agent)

### Bước 1 — Viết handoff file

Ngay sau khi hoàn thành task, viết file:
```
openspec/changes/<feature>/handoff/<agent-name>.md
```

Format chuẩn:

```markdown
# Handoff: <Agent Name> → <Agent tiếp theo>

## Trạng thái
- Agent: <tên>
- Task: <feature-slug>
- Hoàn thành lúc: <timestamp>
- Kết quả: DONE / DONE_WITH_WARNINGS / BLOCKED

## Files đã tạo/sửa
- `đường/dẫn/file1` — mô tả ngắn
- `đường/dẫn/file2` — mô tả ngắn

## Quyết định quan trọng đã đưa ra
- [Quyết định 1]: [Lý do] — ảnh hưởng đến agent tiếp theo như thế nào
- [Quyết định 2]: ...

## Những gì agent tiếp theo CẦN BIẾT
- [Điểm 1 — cụ thể, không thừa]
- [Điểm 2]

## Những gì agent tiếp theo KHÔNG cần biết
(Liệt kê để xác nhận đã loại bỏ khỏi context)
- Chi tiết implement nội bộ không ảnh hưởng downstream
- Các lần thử sai đã được sửa

## Cảnh báo / Edge cases cần chú ý
- ⚠️ [Cảnh báo nếu có]

## Checklist bàn giao
- [ ] Tất cả files đã được lưu
- [ ] Tasks tương ứng đã check [x] trong tasks.md
- [ ] Pipeline log đã được cập nhật
- [ ] Handoff file này đã đủ để agent tiếp theo bắt đầu mà không cần đọc lại conversation
```

### Bước 2 — Cập nhật pipeline log trong tasks.md

```markdown
## Pipeline Log
- [10:30] PM: Tạo proposal.md ✅
- [10:45] BA: specs/ hoàn thành ✅ — handoff/ba.md
- [11:00] TechLead: design.md + tasks.md ✅ — handoff/techlead.md
- [13:00] Backend: 4 tasks BE-* ✅ — handoff/backend.md
- [14:00] Frontend: 3 tasks FE-* ✅ — handoff/frontend.md
- [14:30] TechLead: Review APPROVED ✅ — handoff/review.md
```

### Bước 3 — Tín hiệu compact cho Claude Code

Sau khi viết handoff file xong, agent kết thúc bằng đúng chuỗi này:

```
[COMPACT] <agent-name> done. Next: <agent-tiếp-theo> reads handoff/<agent-name>.md
```

Claude Code nhận tín hiệu `[COMPACT]` sẽ:
1. Lưu conversation hiện tại
2. Bắt đầu context mới
3. Load duy nhất các files cần thiết cho agent tiếp theo

---

## Agent tiếp theo bắt đầu như thế nào?

Agent tiếp theo **chỉ đọc**:
1. File handoff của agent trước: `openspec/changes/<feature>/handoff/<prev-agent>.md`
2. File spec của chính mình cần dùng (không đọc lại toàn bộ)
3. Không đọc lại conversation cũ

Ví dụ — Backend bắt đầu sau khi Tech Lead xong:
```
Đọc: handoff/techlead.md          ← biết Tech Lead đã quyết định gì
Đọc: design.md                    ← API contracts cần implement
Đọc: tasks.md (chỉ phần BE-*)    ← danh sách việc cần làm
KHÔNG đọc: conversation của TechLead, proposal.md, scenarios.md (đã được digest trong handoff)
```

---

## Quy tắc viết handoff hiệu quả

**Viết đủ để agent sau bắt đầu được ngay — không thừa, không thiếu.**

| Nên viết | Không nên viết |
|----------|----------------|
| Quyết định ảnh hưởng agent sau | Chi tiết implement nội bộ |
| Cảnh báo edge case quan trọng | Lý do chọn tên biến |
| File nào quan trọng nhất cần đọc | Toàn bộ nội dung đã làm |
| Điểm khác biệt so với spec gốc | Những gì đã đúng theo spec |

**Giới hạn:** Handoff file tối đa **150 dòng**. Nếu cần hơn → đang viết quá chi tiết.