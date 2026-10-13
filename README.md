# Zeno Studio — Photo Workflow Platform V1

Ứng dụng Nuxt 4 cho luồng chọn ảnh, ghi chú và bàn giao của studio. [Đặc tả V1](docs/photo-workflow-platform-v1-spec.md) là nguồn yêu cầu sản phẩm; [tiến độ](docs/implementation-progress.md) ghi rõ phần đã kiểm thử và các gate còn mở.

## Chạy cục bộ

Yêu cầu Node.js 24 và npm. Tạo `.env` từ `.env.example`, sau đó:

```sh
npm ci
npm run dev
```

Các trang hiện có: `/` (giới thiệu), `/studio` (đăng ký/đăng nhập/khôi phục mật khẩu và danh sách studio), `/studio/members` (mời và quản lý thành viên), `/studio/invite` (nhận lời mời) và `/tools/file-filter` (lọc và copy file cục bộ). Công cụ lọc file dùng File System Access API; browser không hỗ trợ sẽ hiện hướng dẫn chuyển sang Chrome/Edge desktop. Báo cáo CSV ghi kết quả so khớp, lựa chọn thủ công và kết quả copy.

## Neon

1. Tạo project/branch Neon cho development và một branch hoặc database **riêng** cho integration test. Không dùng production cho `test:neon`.
2. Tạo database login role cho ứng dụng bằng SQL với `LOGIN NOBYPASSRLS NOCREATEROLE`, khác với role owner dùng migration. **Không dùng `neon roles create` trực tiếp cho runtime role:** role tạo từ CLI trên project này mặc định có `BYPASSRLS` và `CREATEROLE`. Điền URL pooled của role ứng dụng vào `NUXT_DATABASE_URL`, URL direct của role owner vào `NUXT_DATABASE_DIRECT_URL`.
3. Chạy `npm run db:migrate`. Lệnh tạo schema, role `app_runtime`, RLS và cấp role đó cho login role trong URL ứng dụng. Migration lưu SHA-256 checksum và báo lỗi nếu nội dung một file đã chạy bị thay đổi.
4. Điền URL tương ứng của branch test vào `NUXT_DATABASE_TEST_URL` (pooled) và `NUXT_DATABASE_TEST_DIRECT_URL` (direct), rồi chạy `npm run test:neon`. Script này tạo và xóa hai studio thử nghiệm, đồng thời kiểm tra hai request đồng thời và việc xóa ngữ cảnh RLS sau transaction. Đã chạy thành công trên nhánh `codex-v1-dev` ngày 2026-10-13.

Nitro chỉ dùng URL pooled. Migration chỉ dùng URL direct. Browser không nhận URL database. Các truy vấn tenant phải đi qua `withDatabaseContext`, đặt `app.studio_id`, `app.user_id`, `app.album_id` và `app.scope` trong **cùng transaction** với truy vấn. RLS kiểm tra user có thuộc studio trước khi chấp nhận `studio_id`; API xác thực session trước khi đặt context.

## Better Auth và email

Điền `NUXT_BETTER_AUTH_SECRET` (secret dài, ngẫu nhiên), `NUXT_BETTER_AUTH_URL` (origin của app), `NUXT_SMTP_URL` và `NUXT_MAIL_FROM`. Better Auth quản lý session studio, xác minh email và đặt lại mật khẩu. `npm run test:auth-neon` đã kiểm tra đăng ký, xác minh, đăng nhập và reset mật khẩu trên Neon dev bằng mail transport trong bộ nhớ. Chưa kiểm thử gửi email thật qua SMTP.

Chủ studio hoặc quản lý có thể tạo lời mời theo email; link được trả về một lần để copy. Token chỉ lưu dạng hash, có hạn 7 ngày, dùng một lần và có thể thu hồi. Người nhận cần đăng nhập bằng email đã xác minh đúng với lời mời. Chỉ chủ studio đổi vai trò hoặc thu hồi thành viên; không thể đổi hay thu hồi chủ studio. `npm run test:studio-http` chạy luồng HTTP thật trên build Nitro với Better Auth và Neon test branch; yêu cầu build trước.

## Google Drive

`GoogleDrivePhotoSource` sử dụng Google Drive API chính thức để liệt kê file ảnh, phân trang và đọc nội dung ảnh. Điền `NUXT_GOOGLE_API_KEY` để thực hiện spike với folder public/shared có thật. Quyết định có cần OAuth dựa vào kết quả thực tế về quyền, quota, preview và album 1.000–3.000 ảnh. Chưa mở luồng tạo album trước khi gate Drive hoàn tất.

## Kiểm tra

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- --project=chromium
```

CI chạy các bước trên; `test:neon`, `test:auth-neon` và `test:studio-http` chạy thêm khi secret test được cấu hình. `npm audit` hiện báo advisory trong cây dependency Nuxt; kiểm tra và giải quyết trước release, không ép downgrade từ Nuxt 4 sang Nuxt 3.

## Triển khai

Vercel chỉ là hosting ứng dụng dự kiến. Job hết hạn chạy bằng Neon Function `expirealbums` và Neon schedule trigger `album-expiry` lúc **02:00 UTC** (09:00 Việt Nam) hằng ngày, cấu hình trong `neon.ts`; không có Vercel Cron. Chạy `npm run neon:build` trước `neon config plan` hoặc `neon config apply`. Job khóa album hết hạn và xóa metadata sau 30 ngày. Function và trigger đã deploy trên nhánh `codex-v1-dev`; đã quan sát trigger thật chạy và dọn fixture theo đúng hai mốc hết hạn. Lịch hằng ngày đã khôi phục; production chưa deploy. Cần kiểm thử compatibility của Nuxt/Nitro, Better Auth, Neon pooled connection và Drive ở staging trước production. Quy trình backup/rollback chưa hoàn thành.
