# Tiến độ triển khai V1

Cập nhật: 2026-10-14. `Dev Neon` nghĩa là đã chạy trên nhánh development `codex-v1-dev`; **chưa phải nghiệm thu production**.

| Task | Trạng thái | Đầu ra / phần chưa xong |
| --- | --- | --- |
| T00–T02 | Dev Neon | Spec Neon, Nuxt 4, TypeScript, Tailwind, Pinia, Vitest, Playwright, CI và lockfile. CI cần secret Neon test. |
| T03–T04 | Một phần | UI responsive cơ bản và domain rules có test; design system/a11y đầy đủ chưa kiểm. |
| T05–T07 | Dev Neon | 16 migration đã áp trên nhánh dev; RLS tenant và participant, test pooled concurrency/context. Production chưa migrate. |
| T08 | Dev Neon | Better Auth signup, verify, login, reset; mail transport trong bộ nhớ đạt. Chưa có SMTP thật. |
| T09 | Chưa làm | Guest admin link và claim album. |
| T10 | Dev Neon | Mời, đổi vai trò, thu hồi thành viên và lời mời; HTTP + pooled test. |
| T11–T13 | Chờ Drive | Chưa có API key/folder mẫu để kết luận public/shared hay OAuth. |
| T14 | Một phần | Adapter Drive API chính thức và mock contract test; chưa có live/performance spike. |
| T15–T16 | Chờ quyết định | Chỉ làm OAuth nếu T11–T13 cho thấy cần thiết. |
| T17–T19 | Một phần | Form tạo album, catalog, publish và link khách có backend/UI; endpoint thật khóa bằng `NUXT_DRIVE_VERIFIED`. Chưa có mật khẩu album và chia sẻ hệ thống/Zalo. |
| T20–T22 | Một phần | Danh sách và trang chi tiết album cơ bản; tìm/lọc/sắp xếp, settings và nhắc hạn còn thiếu. |
| T23–T30 | Một phần | Link khách, participant token, catalog phân trang, grid/list, chọn ảnh có giới hạn/version và polling 4 giây; thiếu password, masonry/justified, zoom/swipe, filter/sort phong phú, bulk và shortlist 2 vòng. |
| T31–T32 | Dev Neon | Ghi chú riêng theo participant/photo, lịch sử phiên bản, conflict; UI focus panel cơ bản. |
| T33–T34 | Một phần | Shared/Individual/Voting lưu và xử lý phiếu; studio chọn bộ cuối. Thiếu mời/thu hồi link participant riêng và UI cộng tác đầy đủ. |
| T35–T37 | Dev Neon | Studio xem danh sách/phiếu, chốt snapshot bất biến, mở cycle mới; test local và pooled Neon. |
| T38–T42 | Một phần | Results, filename TXT/CSV, notes TXT/CSV, local matching/copy/report đã nối UI; còn vài option xuất. |
| T43–T47 | Một phần | Production state, review/revision rounds, link Drive ảnh chỉnh, khách duyệt và bàn giao theo snapshot có API/UI và test local + Neon; thiếu map ảnh chỉnh thủ công khi tên khác. |
| T48–T49 | Chưa làm | Analytics events, daily aggregation và North Star. |
| T50 | Dev Neon | Neon Function + schedule trigger đã chạy thật trên dev, khóa album và xóa metadata sau 30 ngày. Không dùng Vercel Cron. |
| T51–T57 | Một phần | Error states, RLS tests, Chromium E2E, build; Safari/iOS/Android/Zalo WebView, gallery 1.000–3.000 ảnh, staging hosting, SMTP, backup/rollback và production release còn thiếu. |

## Gate hiện tại

1. **Drive:** cần `NUXT_GOOGLE_API_KEY` và folder public/shared mẫu. `NUXT_DRIVE_VERIFIED` giữ `false` cho tới khi liệt kê, preview, quota và album lớn đạt. Backend dùng adapter giả chỉ trong test.
2. **Email:** cần SMTP thật để xác minh gửi/nhận email end to end.
3. **Dependency:** `npm audit --omit=dev` ngày 2026-10-14 còn 14 advisory (12 high, 2 critical). `npm audit fix --omit=dev` không giảm số lượng. Nguồn là `simple-git` trong `@nuxt/devtools`, `node-forge` trong `nitropack/listhen`, và `braces` trong `micromatch`; bản Nuxt mới nhất hiện là 4.6.1. `npm audit fix --force` đề xuất Nuxt 3.7.4 nên chưa áp vì phá vỡ mục tiêu Nuxt 4. Cần theo dõi bản vá upstream và kiểm lại trước release.
4. **Các task còn thiếu:** xem bảng trên. Chưa thể gọi V1 hoàn tất hoặc release chỉ vì ba phụ thuộc ngoài đã được nêu.
