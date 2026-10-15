# Vercel preview — zeno-studio

Project: `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Project đã chọn Nuxt và Node.js 24.x; Vercel CLI đã đăng nhập và liên kết local repo đúng project ID. Preview từ repo đã deploy ngày 2026-10-14; production trên dashboard vẫn là bản từ v0. Project chưa nối Git.

## Cấu hình build

- Framework Preset: **Nuxt** (`nuxtjs`). Build Command: mặc định `nuxt build` qua `npm run build`; không dùng `nuxt generate` vì Nitro API cần SSR.
- Node.js: **24.x**. `package.json` và `nuxt.config.ts` giữ Node build/function cùng major version. `NITRO_PRESET=vercel npm run build` đã tạo `.vercel/output/functions/__fallback.func/.vc-config.json` với `runtime: nodejs24.x`.
- Install: dùng `npm ci` từ `package-lock.json` trong CI. Vercel build log của preview đã ghi build Nuxt và Nitro preset `vercel` thành công.
- Cron: không cấu hình Vercel Cron. Neon Function/trigger trong `neon.ts` chịu trách nhiệm hết hạn và dọn dữ liệu.

## Biến môi trường cần cho preview chạy thật

Thiết lập ở Vercel **Preview**, dùng Neon branch riêng đã migrate và runtime role không có `BYPASSRLS`:

| Biến | Giá trị cần cung cấp |
| --- | --- |
| `NUXT_DATABASE_URL` | Neon **pooled** URL của runtime role; không dùng owner/direct URL. |
| `NUXT_BETTER_AUTH_SECRET` | Secret ngẫu nhiên tối thiểu 32 ký tự, riêng cho preview. |
| `NUXT_BETTER_AUTH_URL` | Không cần cho URL preview mặc định: server dùng `https://${VERCEL_URL}`. Đặt origin HTTPS cố định khi dùng alias/domain riêng. |
| `NUXT_DRIVE_VERIFIED` | `true` ở Preview sau live test và HTTP smoke với folder 307 ảnh; Production tiếp tục `false`. |
| `NUXT_GOOGLE_API_KEY` | API key Google Cloud cho Drive API, lưu Sensitive ở Preview; không dùng OAuth Client ID. |
| `NUXT_SMTP_URL`, `NUXT_MAIL_FROM` | Chỉ khi có SMTP thật để kiểm email xác minh/reset. |

Preview hiện có `NUXT_DATABASE_URL` từ nhánh Neon dev, `NUXT_BETTER_AUTH_SECRET` riêng, `NUXT_GOOGLE_API_KEY` và `NUXT_DRIVE_VERIFIED=true`; các biến chỉ ở scope Preview và lưu dạng Sensitive/Encrypted. Không đặt `NUXT_DATABASE_DIRECT_URL` trên Vercel: migration chạy riêng từ máy/CI với owner direct URL. `.vercelignore` loại `.env` cùng các artifact local khỏi nguồn upload. Không đưa URL hoặc secret vào Git, docs hoặc chat.

Ngày 2026-10-15, folder mẫu 307 ảnh đã qua `test:drive-live`, HTTP local và HTTP Preview: đăng nhập, POST tạo album, xác nhận 307 ảnh, publish, phân trang gallery và tải ảnh khách có `content-type: image/*`. Kết quả live báo `scaleVerified=false` và `resourceKeySampled=false`; hai phần này cần mẫu bổ sung trước Production. Giữ Production `NUXT_DRIVE_VERIFIED=false`. Nếu Preview phát sinh lỗi quyền hoặc Google API, tắt gate Preview để điều tra.

## Đưa repo lên preview

1. Local repo đã được liên kết với project đã có bằng `vercel link --yes --team zenocorp --project prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`; `.vercel/project.json` trỏ đúng ID và thư mục này đã được Git bỏ qua. Nếu cần triển khai tự động theo commit, kết nối đúng Git repository trong dashboard; thao tác đó cấp quyền đọc repo cho Vercel.
2. Env Preview đã được cấu hình; không dùng local `.env` nguyên trạng vì nó chứa URL direct của owner và origin localhost.
3. `vercel deploy` đã tạo [preview Drive](https://zeno-studio-45uysrtq3-zenocorp.vercel.app) (`dpl_AaSpQJ1k6gcwWFC6VgH4kEf3ZojD`, Ready), không dùng `--prod`.
4. Smoke qua `vercel curl` trên bản ngay trước chỉnh sửa accessibility cuối: Better Auth đăng nhập tài khoản fixture, POST album 307 ảnh, danh sách studio, publish, cấp link khách mới từ album đã xuất bản, gallery đủ 307 ảnh qua link mới và endpoint ảnh trả nội dung ảnh thật. Bản mới nhất đã build/deploy thành công; tài khoản fixture đã được xóa. Cần kiểm tiếp SMTP thật và gallery lớn. Không promote production trước khi các gate release còn lại đạt.

Kiểm tra tại máy ngày 2026-10-15: `test:drive-live` đạt với 307 ảnh; local và Preview HTTP smoke đạt với cùng folder. Vercel Preview build và smoke HTTP ở trên đã chạy thật. Kết quả test/typecheck hiện tại ghi tại tiến độ triển khai.
