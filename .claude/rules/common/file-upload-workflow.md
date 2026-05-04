# File Upload Workflow — Chuẩn chung cho toàn hệ thống

> **Mọi feature có upload file (hợp đồng, quyết định, ảnh, đính kèm, v.v.) PHẢI tuân theo workflow 2 bước này.**
> Không được upload file trực tiếp trong handler `Create` / `Update` của domain.

---

## Triết lý

```
File upload là concern ĐỘC LẬP với domain save.
→ Tách storage ra khỏi business logic.
→ Handler domain chỉ biết về ID file, không biết về S3/binary/stream.
→ FE upload trước, nhận ID, rồi gửi ID đi cùng payload domain.
```

## Workflow 2 bước

### Bước 1 — Upload file ngay khi user chọn

```
User chọn file
   ↓
FE call POST /api/v1/FileUpload  (multipart/form-data: Files[], Folder?)
   ↓
BE lưu file lên S3 + tạo record `FileUpload` entity { Id, FileName, FileUrl, FileExt, FileSize }
   ↓
Response: { value: [{ id: Guid, fileName: string }] }
   ↓
FE giữ ID trong state, hiển thị tên file + cho xoá
```

### Bước 2 — Save domain chỉ truyền ID

```
User bấm "Lưu" / "Lưu nháp"
   ↓
FE gửi JSON (KHÔNG multipart) với field `<attachmentName>FileIds: Guid[]`
   ↓
BE handler Create/Update:
   - Query FileUpload entities theo IDs
   - Tạo domain attachment entity (vd: IncomeFrameworkAttachment) tham chiếu FileUpload.Id
   - KHÔNG gọi IS3Service, KHÔNG xử lý IFormFile
```

---

## Quy tắc Backend

### Command / payload

- KHÔNG dùng `List<IFormFile>` trong command của handler domain.
- Dùng `List<Guid> <AttachmentName>FileIds` hoặc `ICollection<Guid>`.
- Controller dùng `[FromBody]` với `Content-Type: application/json` — KHÔNG multipart.

```csharp
// ❌ KHÔNG làm
public record CreateFooCommand(
    string Name,
    List<IFormFile> Attachments) : ICommand;

// ✅ Làm
public record CreateFooCommand(
    string Name,
    List<Guid> AttachmentFileIds) : ICommand;
```

### Handler

- KHÔNG inject `IS3Service` vào handler domain.
- Inject `IRepositoryBase<FileUpload, Guid>` (hoặc repository tương đương) để resolve metadata từ ID.
- Tạo domain attachment entity từ FileUpload entity:

```csharp
var fileUploads = await _fileUploadRepository
    .FindAll(x => request.AttachmentFileIds.Contains(x.Id))
    .ToListAsync(cancellationToken);

if (fileUploads.Count != request.AttachmentFileIds.Count)
    return Result.Failure(new Error("FILE_NOT_FOUND", "Một số file không tồn tại"));

for (int i = 0; i < fileUploads.Count; i++)
{
    var fu = fileUploads[i];
    var attachment = new FooAttachment(
        fooId: entity.Id,
        fileId: fu.Id,            // trỏ về FileUpload.Id
        fileName: fu.FileName,
        fileUrl: fu.FileUrl,
        fileExt: fu.FileExt,
        fileSize: fu.FileSize,
        sortOrder: i);
    entity.Attachments.Add(attachment);
}
```

### Upload endpoint (dùng chung)

- Giữ nguyên `FileUploadController` + `FileUploadCommandHandler` + `IS3Service` làm endpoint upload chung.
- Response: `[{ id: Guid, fileName: string }]`.

### Update flow

- Command nhận `AttachmentFileIds: List<Guid>` — danh sách FileUpload.Id đại diện cho trạng thái attachments mong muốn sau update.
- Handler:
  - Load current attachments của aggregate.
  - Remove attachments có `FileId` không nằm trong danh sách mới.
  - Add attachments cho `FileId` mới (chưa có trong DB).
  - Không cần phân biệt "file cũ giữ lại" vs "file mới upload" — ID = FileUpload.Id là đủ.

---

## Quy tắc Frontend

### Upload service (dùng chung)

Tạo `src/modules/common/fileUpload/fileUpload.services.ts`:

```ts
import axiosService from "src/_api/axios.service";
import { urls } from "src/config/urls";
import type { SuccessResponse } from "src/types/base/response.type";

export interface IUploadedFile {
  id: string;
  fileName: string;
}

export const fileUploadService = {
  async upload(files: File[], folder?: string): Promise<IUploadedFile[]> {
    const formData = new FormData();
    files.forEach((f) => formData.append("Files", f));
    if (folder) formData.append("Folder", folder);

    const res = await axiosService.post<SuccessResponse<IUploadedFile[]>>(
      urls.api.fileUpload.upload,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data.value;
  },

  async getLink(id: string): Promise<string> {
    const res = await axiosService.post<SuccessResponse<string>>(
      urls.api.fileUpload.getLink,
      id,
    );
    return res.data.value;
  },
};
```

### Form state shape

Dùng type chuẩn cho file đã upload:

```ts
// src/types/common/file.type.ts
export interface IAttachedFile {
  id: string; // FileUpload.Id từ BE
  fileName: string;
  size?: number; // optional, giữ từ local File nếu cần preview
  url?: string; // optional, lấy qua getLink khi cần download
}
```

Form values chứa `attachments: IAttachedFile[]`, KHÔNG chứa `File` object.

### Flow khi user chọn file

```tsx
const { mutate: uploadFile, isPending } = useUploadFile();

const handleFileSelect = (file: File) => {
  uploadFile([file], "feature-name", {
    onSuccess: (uploaded) => {
      setFieldValue("attachments", [
        ...values.attachments,
        { id: uploaded[0].id, fileName: uploaded[0].fileName, size: file.size },
      ]);
      notify({ variant: "success", message: "Upload file thành công" });
    },
    onError: () =>
      notify({ variant: "danger", message: "Upload file thất bại" }),
  });
};

const handleRemoveFile = (id: string) => {
  setFieldValue(
    "attachments",
    values.attachments.filter((a) => a.id !== id),
  );
  // KHÔNG cần call delete file trên BE — orphan FileUpload sẽ được GC riêng
};
```

### Save payload

```ts
// ❌ KHÔNG làm
const formData = new FormData();
values.attachments.forEach((f) => formData.append("decisionFiles", f.file));
axios.post(url, formData);

// ✅ Làm
axios.post(
  url,
  {
    name: values.name,
    attachmentFileIds: values.attachments.map((a) => a.id),
    // ... các field khác
  },
  { headers: { "Content-Type": "application/json" } },
);
```

### Disable Save khi đang upload

```tsx
<PrimaryButtonComponent
  loading={isSaving}
  disabled={isUploading}
  onClick={handleSave}
>
  Lưu
</PrimaryButtonComponent>
```

---

## Checklist khi implement feature có file

Backend:

- [ ] Command nhận `List<Guid> <Name>FileIds` (không phải `IFormFile`).
- [ ] Controller dùng `[FromBody]`, `Consumes("application/json")`.
- [ ] Handler inject `IRepositoryBase<FileUpload, Guid>`, KHÔNG inject `IS3Service`.
- [ ] Validate tất cả FileIds tồn tại trong `FileUpload` trước khi tạo attachment.
- [ ] Domain attachment entity có field `FileId` trỏ về `FileUpload.Id`.
- [ ] Update handler so sánh `AttachmentFileIds` mới với current để diff add/remove.

Frontend:

- [ ] Upload ngay khi user chọn file qua `fileUploadService.upload()`.
- [ ] Form state chứa `IAttachedFile[]` (id + fileName), KHÔNG chứa `File` binary.
- [ ] Save gửi JSON với `attachmentFileIds: string[]`.
- [ ] Hiển thị loading state khi upload, disable nút Lưu khi đang upload.
- [ ] Xoá file khỏi UI = chỉ bỏ khỏi state, không call API delete.

---

## Lý do dùng workflow này

1. **Progressive UX** — user upload file rồi mới điền form, không phải chờ lúc Save.
2. **Retry dễ** — nếu Save fail, file đã upload không mất; retry chỉ gửi ID.
3. **Handler thuần business** — Create/Update handler không phụ thuộc storage layer.
4. **Multipart chỉ ở 1 chỗ** — chỉ `FileUploadController` cần parse multipart, các controller domain dùng JSON.
5. **Test dễ** — mock FileUpload repository đơn giản hơn mock IS3Service + IFormFile.
