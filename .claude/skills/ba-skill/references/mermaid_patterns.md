# Mermaid Diagram Patterns

Các mẫu Mermaid diagram sẵn dùng cho AI khi sinh tài liệu spec.
Luôn quote labels chứa ký tự đặc biệt (ngoặc, dấu phẩy).

---

## 1. State Machine Diagram (Vòng đời trạng thái)

```mermaid
stateDiagram-v2
    [*] --> Nhap: Tạo mới
    Nhap --> ChoDuyet: Gửi duyệt
    ChoDuyet --> DaDuyet: Phê duyệt
    ChoDuyet --> Nhap: Từ chối
    DaDuyet --> DaHuy: Hủy phiếu
    Nhap --> DaHuy: Hủy phiếu

    state Nhap {
        [*] --> Editing
        Editing --> Saving: Lưu
        Saving --> Editing: Tiếp tục sửa
    }
```

**Quy tắc:**
- Mỗi state PHẢI có ít nhất 1 transition ra
- State `[*]` là điểm bắt đầu
- Label transition = Action name (khớp Button Matrix)

---

## 2. Screen Flow Diagram (Navigation)

```mermaid
graph LR
    A["📋 Danh sách phiếu"] -->|Click row| B["📄 Chi tiết phiếu"]
    A -->|Nút Tạo mới| C["📝 Form tạo mới"]
    C -->|Lưu thành công| A
    C -->|Hủy / ESC| A
    B -->|Nút Sửa| D["📝 Form chỉnh sửa"]
    D -->|Lưu| B
    B -->|Nút Xóa| E["⚠️ Modal xác nhận"]
    E -->|Xác nhận| A
    E -->|Hủy| B
```

**Quy tắc:**
- Mỗi node = 1 màn hình / modal
- Edge label = Action trigger (click, button, shortcut)
- Dùng emoji phân biệt loại: 📋 List, 📄 Detail, 📝 Form, ⚠️ Modal

---

## 3. ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    IMPORT_ORDERS ||--o{ ORDER_ITEMS : "has"
    IMPORT_ORDERS }o--|| SUPPLIERS : "from"
    IMPORT_ORDERS }o--|| WAREHOUSES : "to"
    ORDER_ITEMS }o--|| PRODUCTS : "contains"
    PRODUCTS }o--|| CATEGORIES : "belongs_to"

    IMPORT_ORDERS {
        uuid id PK
        string order_code UK
        enum status
        uuid supplier_id FK
        uuid warehouse_id FK
        date receive_date
        decimal total_amount
        int version
        timestamp created_at
        timestamp updated_at
    }

    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int quantity
        decimal unit_price
        decimal discount
        decimal vat_amount
        decimal subtotal
    }
```

**Quy tắc:**
- Ghi rõ PK, FK, UK (unique key)
- Ghi data type
- Dùng cardinality chuẩn: `||--o{` (one-to-many), `}o--||` (many-to-one)

---

## 4. Activity / Flow Diagram (Luồng nghiệp vụ)

```mermaid
graph TD
    Start(("🟢 Bắt đầu")) --> A["Thủ kho tạo phiếu nhập"]
    A --> B{"Đủ thông tin?"}
    B -->|Có| C["Lưu nháp"]
    B -->|Không| A
    C --> D["Gửi duyệt"]
    D --> E{"Quản lý duyệt?"}
    E -->|Duyệt| F["Cập nhật tồn kho"]
    E -->|Từ chối| G["Trả về Thủ kho"]
    G --> A
    F --> H["Ghi audit log"]
    H --> I["Gửi notification"]
    I --> End(("🔴 Kết thúc"))
```

**Quy tắc:**
- Dùng `{}` cho Decision nodes
- Dùng `(())` cho Start/End
- Dùng `[]` cho Action nodes
- Mỗi Decision PHẢI có ≥ 2 nhánh

---

## 5. Sequence Diagram (Tương tác API)

```mermaid
sequenceDiagram
    actor User as Thủ kho
    participant FE as Frontend
    participant API as Backend API
    participant DB as Database
    participant Noti as Notification Service

    User->>FE: Nhấn "Lưu"
    FE->>API: POST /import-orders
    API->>DB: Validate unique order_code
    alt order_code trùng
        DB-->>API: Conflict
        API-->>FE: 409 DUPLICATE_CODE
        FE-->>User: Hiển thị lỗi "Mã phiếu đã tồn tại"
    else OK
        DB-->>API: OK
        API->>DB: INSERT import_order
        API->>Noti: Emit order.created
        API-->>FE: 201 Created
        FE-->>User: Toast "Tạo thành công"
    end
```

**Quy tắc:**
- Dùng `actor` cho user
- Dùng `participant` cho system components
- Dùng `alt/else` cho branching
- Ghi rõ HTTP status code trong response

---

## 6. Data Flow Diagram

```mermaid
graph LR
    subgraph Input
        A["📥 Phiếu nhập kho"]
        B["📥 Phiếu xuất kho"]
    end
    subgraph Processing
        C["⚙️ Tính tồn kho"]
    end
    subgraph Output
        D["📊 Báo cáo tồn"]
        E["📊 Báo cáo XNK"]
    end
    A --> C
    B --> C
    C --> D
    C --> E
```
