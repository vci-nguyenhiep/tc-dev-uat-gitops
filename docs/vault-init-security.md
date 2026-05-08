# Hướng dẫn bảo mật vault-init.json

`vault-init.json` là file sinh ra sau lần `vault operator init` đầu tiên. Chứa 2 thứ
quan trọng nhất của toàn bộ hệ thống: **5 unseal keys** và **root token**.

Mất file này hoặc để lộ = mất kiểm soát hoàn toàn Vault.

---

## Nội dung file

```json
{
  "unseal_keys_b64": [
    "key-1...",
    "key-2...",
    "key-3...",
    "key-4...",
    "key-5..."
  ],
  "root_token": "hvs.xxxxxxxxxxxxxxxx"
}
```

| Thứ | Dùng để | Tần suất dùng |
|-----|---------|---------------|
| Unseal keys (3/5) | Unseal Vault sau mỗi lần restart | Mỗi khi server/pod restart |
| Root token | Login Vault với quyền admin tuyệt đối | Hiếm — chỉ khi setup hoặc emergency |

---

## Nguyên tắc lưu trữ

**Không được:**
- Lưu file nguyên vẹn ở 1 chỗ duy nhất
- Commit lên Git (dù là private repo)
- Để trên server sau khi đã copy
- Gửi qua Slack, email, Telegram

**Phải làm:**
- Tách unseal keys và root token ra lưu riêng
- Phân tán unseal keys để không ai một mình mở được Vault

---

## Cách lưu trữ khuyến nghị

### Root token → Password manager

Lưu vào 1Password / Bitwarden / KeePass như một entry bình thường:

```
Title:    Vault Root Token (production)
Username: root
Password: hvs.xxxxxxxxxxxxxxxx
URL:      https://vault.company.com
Notes:    Chỉ dùng khi emergency. Tạo admin token riêng để dùng hàng ngày.
```

### Unseal keys → Tách 3 nguồn

Không lưu cả 5 keys ở 1 chỗ — làm vậy thì cơ chế 3/5 không còn ý nghĩa.

```
Key 1, 2, 3  →  Password manager (3 entry riêng biệt)
Key 4        →  File mã hóa lưu trên USB offline (hoặc cloud encrypt riêng)
Key 5        →  In ra giấy, cất nơi an toàn vật lý
```

Để unseal cần có password manager **và** ít nhất 1 trong 2 nguồn offline
→ mất laptop hoặc bị hack account thôi vẫn chưa đủ 3 keys.

---

## Xử lý file sau khi đã copy

Sau khi đã lưu keys và token vào nơi an toàn, xóa file khỏi server ngay:

```bash
# Xóa file
rm vault-init.json

# Xóa khỏi shell history
history -c
```

Kiểm tra không còn file trên server:

```bash
find / -name "vault-init.json" 2>/dev/null
# Không có output = an toàn
```

---

## Tạo admin token riêng để dùng hàng ngày

Root token có quyền tuyệt đối, không nên dùng thường xuyên. Tạo token riêng với
quyền hạn chế hơn để thao tác hàng ngày:

```bash
# Login bằng root token
ROOT_TOKEN=$(cat vault-init.json | jq -r '.root_token')
kubectl exec vault-0 -n vault -- vault login $ROOT_TOKEN

# Tạo policy admin (đọc/ghi mọi secret, không xóa được auth/policy)
kubectl exec vault-0 -n vault -- vault policy write admin-policy - <<'EOF'
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "auth/*" {
  capabilities = ["read", "list"]
}
EOF

# Tạo token với policy admin, hết hạn sau 30 ngày
kubectl exec vault-0 -n vault -- vault token create \
  -policy="admin-policy" \
  -ttl="720h" \
  -display-name="admin-daily"
```

Lưu token này vào password manager. Dùng token này để đăng nhập Vault UI hàng ngày,
giữ root token offline.

---

## Checklist sau khi setup Vault

- [ ] Đã copy 5 unseal keys vào password manager (5 entry riêng)
- [ ] Đã copy root token vào password manager
- [ ] Đã lưu key 4 vào USB/cloud encrypt
- [ ] Đã in key 5, cất nơi an toàn
- [ ] Đã xóa `vault-init.json` khỏi server (`rm vault-init.json`)
- [ ] Đã chạy `history -c` để xóa command history
- [ ] Đã tạo admin token riêng, không dùng root token hàng ngày
- [ ] Đã test unseal thủ công 1 lần bằng keys đã lưu

---

## Unseal sau khi restart

Khi Vault pod restart vì bất kỳ lý do gì, lấy keys từ password manager và unseal:

```bash
kubectl exec vault-0 -n vault -- vault operator unseal <key-1>
kubectl exec vault-0 -n vault -- vault operator unseal <key-2>
kubectl exec vault-0 -n vault -- vault operator unseal <key-3>

# Xác nhận
kubectl exec vault-0 -n vault -- vault status | grep Sealed
# Sealed: false
```

Sau khi unseal, VSO tự động resume sync secrets — không cần thao tác thêm.
