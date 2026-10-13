# Tiến độ triển khai V1

Cập nhật: 2026-10-13. Trạng thái `cục bộ` nghĩa là đã có code và test không dùng dịch vụ ngoài; chưa phải nghiệm thu production.

| Task | Trạng thái | Đầu ra / gate còn thiếu |
| --- | --- | --- |
| T00 | Xong | V1 spec đổi sang Neon, Better Auth, RLS transaction, polling và Vercel mặc định. |
| T01–T02 | Dev Neon | Nuxt 4, TypeScript, Tailwind, Pinia, lockfile, CI, Vitest và Playwright; integration test đã chạy trên Neon dev. CI cần cấu hình secret để chạy Neon. |
| T03 | Một phần | Landing, login và file filter responsive; component system và accessibility đầy đủ còn thiếu. |
| T04 | Cục bộ | Quy tắc selection, trạng thái production và quyền có unit test. |
| T05–T07 | Dev Neon | 10 migration đã chạy trên `codex-v1-dev`; test hai tenant đồng thời, membership và bootstrap qua pooled connection đạt, kể cả thử context bootstrap giả. Production chưa migrate. |
| T08 | Dev Neon | Đăng ký, xác minh, đăng nhập và reset Better Auth đã chạy trên Neon với mail transport trong bộ nhớ. SMTP thật chưa cấu hình/kiểm thử. |
| T09 | Chưa làm | Guest claim phụ thuộc luồng tạo album sau gate Drive. |
| T10 | Dev Neon | Mời bằng link theo email đã xác minh, đổi vai trò, thu hồi thành viên/lời mời; API, UI, integration test pooled Neon và luồng HTTP trên build Nitro đạt. SMTP thật chưa kiểm thử. |
| T11–T13 | Chờ Drive | Không có API credentials và folder mẫu nên chưa thể chốt public/shared hoặc OAuth. |
| T14 | Một phần | Adapter API chính thức và mock contract test; cần live spike và performance test. |
| T15–T16 | Chờ quyết định | OAuth chỉ triển khai nếu T11–T13 cho thấy cần thiết. |
| T17–T37 | Chờ gate Drive | Luồng album, gallery, selection, notes và finalize không mở trước khi nguồn ảnh đạt gate. |
| T38–T42 | Một phần | Export/matching/copy engine và file filter UI có test; báo cáo CSV gồm matching và kết quả copy. Kết nối Selection Results cần album/snapshot sau gate Drive. |
| T43–T49 | Chưa làm | Production, review, delivery và analytics. |
| T50 | Dev Neon | Neon Function và schedule trigger đã deploy trên `codex-v1-dev`; quan sát trigger thật khóa album và xóa fixture sau 30 ngày. Lịch 02:00 UTC đã khôi phục. |
| T51–T57 | Một phần | Test RLS cục bộ và Neon pooled, build/CI, Chromium E2E; kiểm thử thiết bị/hiệu năng, compatibility hosting và release còn thiếu. `npm audit --omit=dev` còn 14 advisory (12 high, 2 critical) trong cây Nuxt; chưa có bản sửa an toàn được áp. |

## Gate kế tiếp

1. Neon pooled RLS, Better Auth logic và Neon cron trên dev đã đạt. Cần SMTP thật để nghiệm thu email end-to-end.
2. Cấp Drive API key và folder public/shared mẫu; kiểm chứng liệt kê, preview, quota và album lớn. Ghi quyết định OAuth nếu cần.
3. Sau khi gate Drive đạt, triển khai luồng album → chọn → chốt; sau đó Results/filter/bàn giao và các cổng release.
