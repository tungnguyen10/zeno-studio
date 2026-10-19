# Tiến độ triển khai V1

Cập nhật: 2026-10-20. `Dev Neon` nghĩa là đã chạy trên nhánh development `codex-v1-dev`; **chưa phải nghiệm thu production**. [Flow hiện tại](./core-workflow.md) kết thúc ở kết quả đã chốt và folder/báo cáo trên máy.

Kiểm tra nhánh làm việc hiện tại: `npm test` đạt **118/118**, `npm run typecheck` và `npm run build` đạt, Chromium E2E đạt **68/68**. Các bài mới kiểm phiên bản snapshot khi tìm/lọc/xuất, manifest album Tạo nhanh, cookie quản trị, version khác album, quyền hết hạn/thu hồi, album lịch sử và endpoint cũ trả 404. Bộ lọc file mới chỉ được kiểm bằng filesystem giả lập; chưa chạy copy trên ổ thật của macOS/Windows. Migration 016–017 đã áp lên nhánh Neon development sau khi xác minh connection string. Folder Drive mẫu hiện trả 326 ảnh; 5 thumbnail mẫu và ảnh gốc của album đang báo lỗi tải được. Chưa chạy lại HTTP smoke trên Neon test/Preview cho flow mới vì thiếu Neon test URL.

| Task | Trạng thái | Đầu ra / phần chưa xong |
| --- | --- | --- |
| T00–T02 | Dev Neon | Spec Neon, Nuxt 4, TypeScript, Tailwind, Pinia, Vitest, Playwright, CI và lockfile. CI cần secret Neon test. |
| T03–T04 | Một phần | UI responsive cơ bản và domain rules có test; design system/a11y đầy đủ chưa kiểm. |
| T05–T07 | Dev Neon | 18 migration đã áp trên nhánh dev; migration 016–017 cho thumbnail và guest album kiểm bằng PGlite và đã áp lên Neon development. Production chưa migrate. |
| T08 | Dev Neon | Better Auth signup, verify, login, reset; mail transport trong bộ nhớ đạt. Chưa có SMTP thật. |
| T09 | Local | Tạo album guest không cần login, link quản trị bí mật, cookie, quản lý vòng đời, rate limit và claim vào studio sở hữu; RLS/HTTP và Chromium desktop/mobile test đạt. Chưa smoke trên Neon test/Preview. |
| T10 | Dev Neon | Mời, đổi vai trò, thu hồi thành viên và lời mời; HTTP + pooled test cũ. Flow mới không cho mời/đổi sang retoucher; thành viên retoucher cũ vẫn đọc album. Chưa chạy lại HTTP trên Neon. |
| T11–T13 | Một phần | API key Drive hợp lệ; folder công khai hiện trả 326 ảnh, ảnh gốc và thumbnail mẫu tải được. Chưa kiểm ảnh có resource key. |
| T14 | Một phần | Adapter Drive API chính thức; gallery dùng thumbnail Drive qua API Zeno và Focus dùng ảnh gốc, có test giả và E2E. Đã tải 5 thumbnail Drive thật; giới hạn album nâng lên 10.000 ảnh; gallery khách/studio/kết quả phân trang cursor + virtualization (E2E giả lập 10.000 ảnh), 4 layout (hàng đều, lưới, so le, danh sách). Chưa đo với folder Drive thật 1.000–10.000 ảnh. |
| T15–T16 | Chờ quyết định | Chỉ làm OAuth nếu T11–T13 cho thấy cần thiết. |
| T17–T19 | Một phần | Tạo album 307 ảnh, catalog, publish, cấp lại link khách từ danh sách và ảnh khách đã qua HTTP smoke trên Preview. Gate Drive mở ở local/Preview, Production vẫn khóa. Chưa có mật khẩu album và chia sẻ hệ thống/Zalo. |
| T20–T22 | Một phần | Danh sách và trang chi tiết album cơ bản; tìm/lọc/sắp xếp, settings và nhắc hạn còn thiếu. |
| T23–T30 | Một phần | Link khách tự vào album (không nhập tên; mọi thiết bị dùng chung một danh sách chọn), catalog phân trang, grid/list, chọn ảnh có giới hạn/version và polling 4 giây; thiếu password, masonry/justified, zoom/swipe, filter/sort phong phú và bulk. |
| T31–T32 | Dev Neon | Ghi chú chung cho mỗi ảnh, lịch sử phiên bản, conflict; UI focus panel cơ bản. |
| T33–T34 | Một phần | Danh sách chọn chung; studio chọn bộ cuối. Đã bỏ chế độ Individual/Voting và shortlist 2 vòng khỏi code (cột DB còn lại, chưa xóa). |
| T35–T37 | Dev Neon | Studio xem danh sách/phiếu, chốt snapshot bất biến; mở cycle mới kế thừa bộ chốt gần nhất và xem bộ cũ trong gallery studio. Test local và pooled Neon cho luồng gốc; thay đổi kế thừa đã kiểm local, chưa chạy lại pooled Neon. |
| T38–T42 | Local | Results khóa selection version khi tìm/lọc/xuất, có thumbnail và ghi chú; trang Filter Files của Studio và Tạo nhanh lấy manifest của đúng snapshot đã chốt. Browser quét metadata RAW, mặc định tạo `SELECTED` lúc xác nhận, hỗ trợ path con hoặc folder picker, xử lý mơ hồ/trùng tên, copy tuần tự và CSV báo cáo. Chưa nghiệm thu trên ổ thật macOS/Windows/Safari; cần chạy lại HTTP trên Neon test/Preview. |
| T43–T47 | Loại khỏi phạm vi | API/UI hậu kỳ, duyệt và bàn giao đã gỡ. Bảng và dữ liệu lịch sử được giữ; album `DELIVERED` cũ vẫn đọc kết quả và lọc file theo quyền. Không tạo `production_tasks` khi chốt mới và không ghi trạng thái “Đã lọc” trên server. |
| T48–T49 | Chưa làm | Analytics events, daily aggregation và North Star. |
| T50 | Dev Neon | Neon Function + schedule trigger đã chạy thật trên dev, khóa album và xóa metadata sau 30 ngày. Không dùng Vercel Cron. |
| T51–T57 | Một phần | Error states, RLS tests, Chromium E2E và Nitro Vercel preset build Node 24 đã kiểm tại máy. Preview `dpl_9cV4g4GzbKaLoxWmxofqBiKmfZPz` Ready; đăng nhập, tạo/publish album 307 ảnh, phân trang gallery và tải ảnh khách qua HTTP đều đạt. Chưa nối Git; SMTP, Safari/iOS/Android/Zalo WebView, gallery 1.000–3.000 ảnh, resource key, backup/rollback và production release còn thiếu. |

## Gate hiện tại

Benchmark bộ lọc cục bộ trên dữ liệu giả lập trong Node 24 (không gồm I/O ổ đĩa): quét 1.000/3.000/10.000 entry lần lượt 12/35/119 ms, match 2/4/12 ms. Số đo này chỉ kiểm thuật toán và khả năng giữ UI phản hồi; throughput copy, exFAT, quyền ổ ngoài và ngắt thiết bị cần kiểm trực tiếp trên macOS/Windows 11 với Chrome/Edge trước khi gọi luồng file cục bộ là nghiệm thu đa nền tảng.

1. **Drive:** `NUXT_GOOGLE_API_KEY` đã là API key hợp lệ; `test:drive-live` hiện đạt với folder 326 ảnh, thumbnail mẫu và ảnh gốc của album lỗi tải được. HTTP local/Preview với 307 ảnh là kết quả trước thay đổi thumbnail. `NUXT_DRIVE_VERIFIED=true` ở local/Preview; Production giữ `false`. Cần đo toàn trang gallery, thử folder 1.000–3.000 ảnh và ảnh có resource key trước production. Backend unit/database test dùng adapter giả.
2. **Email:** cần SMTP thật để xác minh gửi/nhận email end to end.
3. **Dependency:** `npm audit --omit=dev` ngày 2026-10-14 còn 14 advisory (12 high, 2 critical). `npm audit fix --omit=dev` không giảm số lượng. Nguồn là `simple-git` trong `@nuxt/devtools`, `node-forge` trong `nitropack/listhen`, và `braces` trong `micromatch`; bản Nuxt mới nhất hiện là 4.6.1. `node-forge@1.4.0` và `braces@3.0.3` vẫn là bản npm mới nhất nhưng nằm trong affected range; `simple-git@4.0.2` đã vá nhưng vượt major range của `@nuxt/devtools`. `npm audit fix --force` đề xuất Nuxt 3.7.4 nên chưa áp vì phá vỡ mục tiêu Nuxt 4. Cần theo dõi bản vá upstream và kiểm lại trước release.
4. **Các task còn thiếu:** xem bảng trên. Chưa thể gọi V1 hoàn tất hoặc release chỉ vì ba phụ thuộc ngoài đã được nêu.
