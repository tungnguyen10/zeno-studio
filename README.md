# Zeno Studio — Photo Workflow Platform V1

Ứng dụng Nuxt 4 cho luồng chọn ảnh, ghi chú và bàn giao của studio. [Đặc tả V1](docs/photo-workflow-platform-v1-spec.md) là nguồn yêu cầu sản phẩm; [tiến độ](docs/implementation-progress.md) ghi rõ phần đã kiểm thử và các gate còn mở.

## Chạy cục bộ

Yêu cầu Node.js 24 và npm. Tạo `.env` từ `.env.example`, sau đó:

```sh
npm ci
npm run dev
```

Các trang hiện có: `/` (giới thiệu), `/studio` (tài khoản, danh sách và tạo album), `/studio/members`, `/studio/invite`, `/studio/albums/:id` (chốt bộ ảnh), `/studio/albums/:id/results` (xuất kết quả, hậu kỳ, duyệt và bàn giao), `/album/:id?token=...` (gallery khách) và `/tools/file-filter` (lọc/copy file cục bộ). Công cụ lọc file dùng File System Access API; browser không hỗ trợ sẽ hiện hướng dẫn chuyển sang Chrome/Edge desktop.

Trong danh sách album tại `/studio`, album đã xuất bản có nút **Chia sẻ link khách hàng**. Nút cấp link khách mới và hiển thị ngay dưới album để mở hoặc sao chép. Link khách đã gửi trước đó vẫn hợp lệ cho đến khi album hết hạn hoặc token bị thu hồi.

## Neon

1. Tạo project/branch Neon cho development và một branch hoặc database **riêng** cho integration test. Không dùng production cho `test:neon`.
2. Tạo database login role cho ứng dụng bằng SQL với `LOGIN NOBYPASSRLS NOCREATEROLE`, khác với role owner dùng migration. **Không dùng `neon roles create` trực tiếp cho runtime role:** role tạo từ CLI trên project này mặc định có `BYPASSRLS` và `CREATEROLE`. Điền URL pooled của role ứng dụng vào `NUXT_DATABASE_URL`, URL direct của role owner vào `NUXT_DATABASE_DIRECT_URL`.
3. Chạy `npm run db:migrate`. Lệnh tạo schema, role `app_runtime`, RLS và cấp role đó cho login role trong URL ứng dụng. Migration lưu SHA-256 checksum và báo lỗi nếu nội dung một file đã chạy bị thay đổi.
4. Điền URL tương ứng của branch test vào `NUXT_DATABASE_TEST_URL` (pooled) và `NUXT_DATABASE_TEST_DIRECT_URL` (direct), rồi chạy `npm run test:neon` và `npm run test:album-neon`. Các script tạo/xóa fixtures và kiểm tra pooled concurrency, chọn ảnh, ghi chú, snapshot, review và bàn giao. Đã chạy trên nhánh `codex-v1-dev` ngày 2026-10-14.

Nitro chỉ dùng URL pooled. Migration chỉ dùng URL direct. Browser không nhận URL database. Các truy vấn tenant phải đi qua `withDatabaseContext`, đặt `app.studio_id`, `app.user_id`, `app.album_id`, `app.participant_id` và `app.scope` trong **cùng transaction** với truy vấn. RLS kiểm tra user có thuộc studio trước khi chấp nhận `studio_id`; API xác thực session hoặc token trước khi đặt context.

## Better Auth và email

Điền `NUXT_BETTER_AUTH_SECRET` (secret dài, ngẫu nhiên), `NUXT_BETTER_AUTH_URL` (origin của app), `NUXT_SMTP_URL` và `NUXT_MAIL_FROM`. Better Auth quản lý session studio, xác minh email và đặt lại mật khẩu. `npm run test:auth-neon` đã kiểm tra đăng ký, xác minh, đăng nhập và reset mật khẩu trên Neon dev bằng mail transport trong bộ nhớ. Chưa kiểm thử gửi email thật qua SMTP.

Chủ studio hoặc quản lý có thể tạo lời mời theo email; link được trả về một lần để copy. Token chỉ lưu dạng hash, có hạn 7 ngày, dùng một lần và có thể thu hồi. Người nhận cần đăng nhập bằng email đã xác minh đúng với lời mời. Chỉ chủ studio đổi vai trò hoặc thu hồi thành viên; không thể đổi hay thu hồi chủ studio. `npm run test:studio-http` chạy luồng HTTP thật trên build Nitro với Better Auth và Neon test branch; yêu cầu build trước.

## Google Drive

`GoogleDriveAdapter` dùng Google Drive API để liệt kê ảnh, phân trang và đọc nội dung ảnh. V1 chỉ nhận folder đặt quyền **“Bất kỳ ai có đường liên kết”**. Tạo **API key** trong Google Cloud project đã bật Google Drive API, giới hạn key cho Drive API và đặt ở `NUXT_GOOGLE_API_KEY`. OAuth Client ID dùng cho đăng nhập Google (`...apps.googleusercontent.com`) không phải API key. Giữ key ở server; không đưa vào repo hay browser.

Đặt `NUXT_DRIVE_SAMPLE_FOLDER_URL` tới folder công khai có ảnh (tối đa 3.000 ảnh), rồi chạy `npm run test:drive-live`. Lệnh kiểm đủ trang, ID trùng và tải mẫu ảnh đầu/giữa/cuối; nếu có ảnh mang resource key, lệnh tải thêm ảnh đó. Kết quả có `scaleVerified` (đã thử ít nhất 1.000 ảnh) và `resourceKeySampled`; hai mục chưa đạt được ghi rõ thay vì chặn folder nhỏ. Đầu ra không in API key, ID ảnh hay link folder.

Folder mẫu hiện tại có 307 ảnh, một trang, không ảnh nào trả resource key. Ngày 2026-10-15, lệnh live, HTTP tạo album → xuất bản → xem ảnh khách trên local và Vercel Preview đều đạt với folder này. `NUXT_DRIVE_VERIFIED=true` đã bật cho local và Preview; Production tiếp tục khóa. Khi có folder 1.000–3.000 ảnh và ảnh có resource key, chạy lại kiểm chứng trước khi coi hai mục đó là đạt. HTTP smoke script `npm run test:drive-http` và `npm run test:drive-preview-http` cần `NUXT_DATABASE_TEST_URL`, `NUXT_DATABASE_TEST_DIRECT_URL`, `NUXT_DRIVE_SAMPLE_FOLDER_URL`; script Preview cần thêm `NUXT_DRIVE_PREVIEW_DEPLOYMENT`. Đặt `NUXT_DRIVE_EXPECTED_PHOTO_COUNT` khi kiểm folder khác; mặc định hiện là 307.

## Kiểm tra

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- --project=chromium
```

CI chạy các bước trên; `test:neon`, `test:auth-neon`, `test:studio-http` và `test:album-neon` chạy thêm khi secret test được cấu hình. `npm audit --omit=dev` còn 14 advisory trong cây Nuxt. Xem [tiến độ](docs/implementation-progress.md) trước release; không ép downgrade từ Nuxt 4 sang Nuxt 3.

## Triển khai

Project Vercel hiện có là `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Repo xuất Nitro Build Output API với preset `vercel`; build và function runtime dùng Node.js 24. Chạy `NITRO_PRESET=vercel npm run build` để kiểm tra artifact trong `.vercel/output` (được bỏ qua bởi Git). [Checklist triển khai Vercel](docs/vercel-deployment.md) ghi cấu hình, biến môi trường và kết quả kiểm thử [preview từ repo](https://zeno-studio-asqw0e9id-zenocorp.vercel.app). Production deployment hiện trên dashboard vẫn là bản tạo từ v0.

Job hết hạn chạy bằng Neon Function `expirealbums` và Neon schedule trigger `album-expiry` lúc **02:00 UTC** (09:00 Việt Nam) hằng ngày, cấu hình trong `neon.ts`; không có Vercel Cron. Chạy `npm run neon:build` trước `neon config plan` hoặc `neon config apply`. Job khóa album hết hạn và xóa metadata sau 30 ngày. Function và trigger đã deploy trên nhánh `codex-v1-dev`; đã quan sát trigger thật chạy và dọn fixture theo đúng hai mốc hết hạn. Lịch hằng ngày đã khôi phục; production chưa deploy. Better Auth, Neon pooled và luồng Drive 307 ảnh đã qua smoke test trên Vercel Preview; album lớn và resource key chưa kiểm. Quy trình backup/rollback chưa hoàn thành.
