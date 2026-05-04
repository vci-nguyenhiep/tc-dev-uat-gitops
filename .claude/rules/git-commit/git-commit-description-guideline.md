# Quy định Description Commit Code Chuẩn

## 1. Cấu trúc commit message chuẩn

```bash
<type>(<scope>): <short summary>

<description>
- What: đã làm gì
- Why: vì sao cần thay đổi
- Impact: ảnh hưởng tới đâu
- Note: lưu ý thêm nếu có
```

## 2. Ý nghĩa từng phần

### Dòng 1: Title

Format:

```bash
<type>(<scope>): <short summary>
```

Ví dụ:

```bash
feat(income-framework): add api create income framework
fix(asset): prevent duplicate asset assignment
refactor(auth): simplify token validation logic
docs(openspec): update commit workflow guide
```

### Dòng 2 trở đi: Description

Nên viết ngắn gọn, tập trung vào 4 ý:

```bash
What:
- Thêm API tạo mới khung thu nhập
- Validate dữ liệu đầu vào
- Lưu lịch sử tạo bản ghi

Why:
- Đáp ứng chức năng tạo mới trên màn hình quản lý mức thu nhập

Impact:
- Ảnh hưởng BE module income-framework
- FE cần gọi API mới theo contract

Note:
- Chưa xử lý upload file
- Chưa bao gồm phân quyền chi tiết
```

## 3. Template khuyến nghị cho team

Bạn có thể dùng template này làm rule chung:

```bash
<type>(<scope>): <short summary>

What:
- ...

Why:
- ...

Impact:
- ...

Note:
- ...
```

## 4. Danh sách `type` nên dùng

```bash
feat      # thêm chức năng mới
fix       # sửa lỗi
refactor  # tối ưu / sửa cấu trúc nhưng không đổi business
docs      # cập nhật tài liệu
style     # format code, rename, clean code, không đổi logic
test      # thêm/sửa test
chore     # việc phụ trợ: config, package, pipeline, script
perf      # tối ưu hiệu năng
build     # build, dependency
ci        # CI/CD
revert    # rollback commit trước
```

## 5. Cách viết description chuẩn

Nên:
- Viết rõ **đã làm gì**
- Nêu **lý do thay đổi**
- Ghi rõ **phạm vi ảnh hưởng**
- Nếu chưa hoàn tất thì ghi rõ **giới hạn**

Không nên:
- Viết quá chung chung như: `update code`, `fix bug`, `handle logic`
- Copy toàn bộ chi tiết kỹ thuật quá dài vào commit
- Trộn nhiều chức năng không liên quan trong 1 commit

## 6. Ví dụ commit hoàn chỉnh

### Ví dụ 1: thêm chức năng

```bash
feat(income-framework): add create income framework api

What:
- Thêm API tạo mới khung thu nhập
- Validate mã, tên và thời gian áp dụng
- Lưu thông tin người tạo và thời gian tạo

Why:
- Đáp ứng chức năng tạo mới khung thu nhập theo URD

Impact:
- Ảnh hưởng module income-framework
- FE cần map request body theo API mới

Note:
- Chưa xử lý upload file đính kèm
```

### Ví dụ 2: sửa lỗi

```bash
fix(asset-allocation): prevent duplicate allocation record

What:
- Kiểm tra tài sản đã được cấp phát trước khi tạo bản ghi mới
- Chặn tạo trùng lịch sử cấp phát

Why:
- Tránh dữ liệu cấp phát bị trùng khi user bấm submit nhiều lần

Impact:
- Ảnh hưởng logic create allocation
- Không thay đổi cấu trúc database

Note:
- Cần FE disable button submit sau khi gửi request
```

### Ví dụ 3: refactor

```bash
refactor(auth): centralize permission validation

What:
- Tách logic kiểm tra quyền sang service dùng chung
- Loại bỏ validate lặp lại tại controller

Why:
- Giảm code trùng và dễ bảo trì hơn

Impact:
- Ảnh hưởng module auth và các API đang dùng permission check

Note:
- Không thay đổi output response
```

## 7. Rule ngắn gọn để áp dụng toàn team

```md
- Title format: <type>(<scope>): <summary>
- Description phải có tối thiểu:
  - What
  - Why
- Nếu ảnh hưởng module khác thì thêm:
  - Impact
- Nếu còn giới hạn/chưa xong thì thêm:
  - Note
- Một commit chỉ nên phục vụ một mục tiêu chính
- Summary dùng động từ rõ nghĩa: add / update / fix / remove / refactor
```

## 8. Mẫu ngắn gọn hơn nếu team muốn gọn

```bash
<type>(<scope>): <short summary>

- What: ...
- Why: ...
- Impact: ...
```

Ví dụ:

```bash
feat(payroll): add salary decision import api

- What: thêm API import quyết định lương từ file Excel
- Why: hỗ trợ nhập liệu hàng loạt
- Impact: BE payroll, cần FE tích hợp upload file
```
