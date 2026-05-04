# 📌 Commit Message Rules

## 1. Cấu trúc bắt buộc

<type>(<scope>): <short message>

<description>

---

## 2. Quy định Title (bắt buộc)

Format:
<type>(<scope>): <short message>

### Type
feat: Thêm chức năng  
fix: Sửa lỗi  
refactor: Tối ưu code  
chore: Config, build  
docs: Tài liệu  
test: Test  

### Scope
- Module/chức năng (lowercase, dùng dấu - nếu nhiều từ)

Ví dụ:
income-framework  
task  
asset  
upload  

### Short message
- ≤ 72 ký tự  
- Dùng động từ hành động  
- Mô tả rõ đã làm gì  
- Không dấu chấm cuối  

✔ Ví dụ đúng:
feat(income-framework): add create api  
fix(task): handle null code generation  
refactor(asset): simplify form logic  

❌ Không dùng:
update code  
fix bug  
done  

---

## 3. Quy định Description (khuyến nghị)

Dùng khi:
- Thay đổi lớn hoặc nhiều phần  
- Logic phức tạp  
- Ảnh hưởng DB/API  

Format:
- change 1  
- change 2  
- change 3  

---

## 4. Ví dụ chuẩn

feat(income-framework): add create api

- add endpoint create income framework  
- validate duplicate name and code  
- save attachment data  

---

fix(task): handle null code generation

- prevent null exception  
- keep old records unchanged  
- update generation logic  

---

refactor(asset): simplify dynamic form

- split render logic by type  
- reduce nested conditions  
- keep behavior unchanged  

---

## 5. Rule bắt buộc

- Title đúng format  
- Có scope rõ ràng  
- Không dùng message chung chung  
- Viết tiếng Anh thống nhất  

---

## 6. Template

<type>(<scope>): <short message>

- change 1  
- change 2  
- change 3  

---

## 7. Checklist

- Title đúng format  
- Message rõ nghĩa  
- Code đã test  

---

## Nguyên tắc

Commit phải đủ rõ để người khác đọc hiểu ngay bạn đã làm gì.
