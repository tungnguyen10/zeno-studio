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
| `NUXT_DRIVE_VERIFIED` | `false` cho đến khi live Drive spike đạt. |
| `NUXT_GOOGLE_API_KEY` | Chỉ khi đã có key và folder mẫu để kiểm Drive. |
| `NUXT_SMTP_URL`, `NUXT_MAIL_FROM` | Chỉ khi có SMTP thật để kiểm email xác minh/reset. |

Preview hiện có `NUXT_DATABASE_URL` từ nhánh Neon dev, `NUXT_BETTER_AUTH_SECRET` tạo riêng và `NUXT_DRIVE_VERIFIED=false`, tất cả chỉ ở scope Preview và hiển thị Encrypted. Không đặt `NUXT_DATABASE_DIRECT_URL` trên Vercel: migration chạy riêng từ máy/CI với owner direct URL. `.vercelignore` loại `.env` cùng các artifact local khỏi nguồn upload. Không đưa URL hoặc secret vào Git, docs hoặc chat.

## Đưa repo lên preview

1. Local repo đã được liên kết với project đã có bằng `vercel link --yes --team zenocorp --project prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`; `.vercel/project.json` trỏ đúng ID và thư mục này đã được Git bỏ qua. Nếu cần triển khai tự động theo commit, kết nối đúng Git repository trong dashboard; thao tác đó cấp quyền đọc repo cho Vercel.
2. Env Preview đã được cấu hình; không dùng local `.env` nguyên trạng vì nó chứa URL direct của owner và origin localhost.
3. `vercel deploy` đã tạo [preview](https://zeno-studio-asqw0e9id-zenocorp.vercel.app) (`dpl_C19AAnt5XCbAkFNKNyHCj33ZKpYi`, Ready), không dùng `--prod`.
4. Smoke qua `vercel curl` với deployment protection: `/` và `/studio` trả 200; `/api/auth/get-session` trả 200/null khi chưa đăng nhập; POST sign-in bằng email giả không tồn tại trả 401 `INVALID_EMAIL_OR_PASSWORD` sau khi Better Auth truy vấn Neon pooled; `/api/studio` trả 401 đúng quyền. Cần kiểm tiếp signup/verify/login/reset khi có SMTP, gallery và file proxy khi Drive gate đạt. Không promote production trước khi các gate release còn lại đạt.

Kiểm tra tại máy ngày 2026-10-14: `npm test` 39/39, `npm run typecheck` thành công, `NITRO_PRESET=vercel npm run build` thành công; Vercel preview build và smoke HTTP ở trên đã chạy thật.
