# Vercel deployment — zeno-studio

Project: `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Project dùng Nuxt và Node.js 24.x; Vercel CLI đã liên kết local repo đúng project ID. Production [studio.zenocorp.vn](https://studio.zenocorp.vn) đang chạy deployment `dpl_F7SvcDJKoXS6a88XfwJapy35z4dc` từ commit `174ecd8` (2026-10-27). Project chưa nối Git.

## Release Production ngày 2026-10-27

- Preview `dpl_6s2or3HB3d3gKQ2nfry93GGREMuv` Ready; `/`, `/create`, `/api/auth/get-session` trả 200.
- Neon branch `production` trước release chưa có schema ứng dụng; nay được tạo schema bằng 24 migration sau khi cùng bộ migration đạt trên branch tạm `release-20261027-test`. Không chuyển user/album từ `codex-v1-dev` sang nhánh mới. Branch `backup-before-release-20261027` giữ điểm khôi phục trước migration; branch test tự hết hạn ngày 2026-10-28. Vercel Production dùng `NUXT_DATABASE_URL` pooled với role riêng `LOGIN NOBYPASSRLS NOCREATEROLE`; `NUXT_DATABASE_DIRECT_URL` đã bỏ khỏi scope Production.
- Production deployment `dpl_F7SvcDJKoXS6a88XfwJapy35z4dc` Ready và alias `studio.zenocorp.vn` đã gắn. `/`, `/create`, `/studio`, `/api/auth/get-session` trả 200; Chromium trên trang chủ không thấy banner analytics hoặc request Google khi cờ tắt. Đây là smoke đọc, chưa kiểm luồng đăng ký/tạo album trên Production.
- `NUXT_DRIVE_VERIFIED=false`, nên luồng Drive còn khóa theo gate hiện tại. `NUXT_PUBLIC_GA4_MEASUREMENT_ID=G-2GD5P03B7S` và `NUXT_PUBLIC_GA4_ENABLED=false` chỉ ở Production. Trang chính sách bảo mật ngoài repo hiện là trang “sắp ra mắt”; chủ dự án sẽ cập nhật. Chưa xác nhận GA4 web stream/DebugView, nên chưa bật thu thập.
- Các biến `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` do tích hợp Neon cũ vẫn trỏ tới `codex-v1-dev`; mã app chỉ dùng `NUXT_DATABASE_URL`. Rà cấu hình tích hợp này trước khi dùng những biến đó cho job/tool khác.

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
| `NUXT_DOWNLOAD_TICKET_SECRET` | Secret ngẫu nhiên riêng cho Preview, tối thiểu 32 ký tự; ký vé tải ảnh gốc hạn 10 phút. Bắt buộc trước khi bật quyền tải. |
| `NUXT_SMTP_URL`, `NUXT_MAIL_FROM` | Chỉ khi có SMTP thật để kiểm email xác minh/reset. |
| `NUXT_PUBLIC_SITE_URL` | Origin HTTPS chính thức (không có `/` cuối) cho canonical, `og:*`, `sitemap.xml`, `robots.txt`, `llms.txt` và JSON-LD. Bắt buộc ở Production; nếu bỏ trống sẽ dùng origin của request. |

Preview hiện có `NUXT_DATABASE_URL` từ nhánh Neon dev, `NUXT_BETTER_AUTH_SECRET` riêng, `NUXT_GOOGLE_API_KEY` và `NUXT_DRIVE_VERIFIED=true`; các biến chỉ ở scope Preview và lưu dạng Sensitive/Encrypted. Không đặt `NUXT_DATABASE_DIRECT_URL` trên Vercel: migration chạy riêng từ máy/CI với owner direct URL. `.vercelignore` loại `.env` cùng các artifact local khỏi nguồn upload. Không đưa URL hoặc secret vào Git, docs hoặc chat.

Ngày 2026-10-15, folder mẫu 307 ảnh đã qua `test:drive-live`, HTTP local và HTTP Preview: đăng nhập, POST tạo album, xác nhận 307 ảnh, publish, phân trang gallery và tải ảnh khách có `content-type: image/*`. Kết quả live báo `scaleVerified=false` và `resourceKeySampled=false`; hai phần này cần mẫu bổ sung trước Production. Giữ Production `NUXT_DRIVE_VERIFIED=false`. Nếu Preview phát sinh lỗi quyền hoặc Google API, tắt gate Preview để điều tra.

### Gate riêng cho tải ảnh gốc

Thay đổi ngày 26/10/2026 thêm migration 021–023 cho cài đặt tải, RLS và rate limit. Trước khi thử trên Preview, chạy migration trên **branch test/Preview**, cấp runtime role đúng quyền, đặt `NUXT_DOWNLOAD_TICKET_SECRET` tại Preview và deploy build mới. Chạy `npm run test:drive-download` với Neon test branch và folder Drive thử; kiểm ZIP SHA-256, ảnh đơn, quyền mặc định/thu hồi. Sau đó đo 1/10/100/1.000/3.000 ảnh, file lớn, RAM, thời gian stream, quota/429 và function duration trên Preview; so gallery LCP và thử 4G. Kiểm iOS Safari, Android Chrome, Zalo/Messenger webview và Chrome/Edge/Safari desktop trên thiết bị thật. Chỉ nâng các giới hạn 50 ảnh/96 MiB mỗi ZIP và 12 ảnh/48 MiB mỗi share khi số đo hỗ trợ. Chưa có số đo Preview/function duration hoặc kết quả QA thiết bị cho tính năng này; chưa bật/release nó trên Production.

Gate Neon test branch tạm ngày 26/10 đã đạt: migration 021–023, SHA-256 của 6 ảnh JPEG qua tải đơn/ZIP, quyền mặc định/thu hồi, plan 326 ảnh thành 49 phần và smoke HTTP gallery cũ. Branch thử đã xóa. Folder này chưa có PNG/HEIC, resource key, tên Unicode/trùng hay ảnh lớn trên 96 MiB; các fixture đó cần bổ sung trước nghiệm thu toàn bộ.

## Đưa repo lên preview

1. Local repo đã được liên kết với project đã có bằng `vercel link --yes --team zenocorp --project prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`; `.vercel/project.json` trỏ đúng ID và thư mục này đã được Git bỏ qua. Nếu cần triển khai tự động theo commit, kết nối đúng Git repository trong dashboard; thao tác đó cấp quyền đọc repo cho Vercel.
2. Env Preview đã được cấu hình; không dùng local `.env` nguyên trạng vì nó chứa URL direct của owner và origin localhost.
3. `vercel deploy` đã tạo [preview Drive](https://zeno-studio-45uysrtq3-zenocorp.vercel.app) (`dpl_AaSpQJ1k6gcwWFC6VgH4kEf3ZojD`, Ready), không dùng `--prod`.
4. Smoke qua `vercel curl` trên bản Preview cũ: Better Auth đăng nhập tài khoản fixture, POST album 307 ảnh, danh sách studio, publish, cấp link khách mới từ album đã xuất bản, gallery đủ 307 ảnh qua link mới và endpoint ảnh trả nội dung ảnh thật. Tài khoản fixture đã được xóa. Bản Production 27/10 đã deploy với Drive gate tắt; cần kiểm tiếp SMTP thật và gallery lớn trước khi mở gate đó.

Kiểm tra tại máy ngày 2026-10-15: `test:drive-live` đạt với 307 ảnh; local và Preview HTTP smoke đạt với cùng folder. Vercel Preview build và smoke HTTP ở trên đã chạy thật. Kết quả test/typecheck hiện tại ghi tại tiến độ triển khai.

## Google Analytics 4 — chỉ Production

Tích hợp đã deploy lên Production nhưng **cờ thu thập vẫn tắt** cho tới khi xác nhận trang chính sách bên ngoài và cấu hình GA4. Tag chỉ được tải sau khi người dùng đồng ý; từ chối không tải tag, thu hồi đồng ý sẽ reload để dừng tag đã tải. Local giữ cờ `false` (ID có thể có trong `.env` cá nhân), Preview để trống; Vercel Production đã có ID và cờ `false`:

| Biến | Giá trị hiện tại / sau khi gate đạt |
| --- | --- |
| `NUXT_PUBLIC_GA4_ENABLED` | Hiện `false`; đổi thành `true` sau khi gate đạt. |
| `NUXT_PUBLIC_GA4_MEASUREMENT_ID` | `G-2GD5P03B7S` |

Thứ tự QA/phát hành:

1. Công bố và kiểm trực tiếp [chính sách bảo mật](https://www.zenocorp.vn/privacy): mô tả Google Analytics, mục đích đo lường, lựa chọn đồng ý/từ chối và cách mở **Cài đặt phân tích** để thu hồi. Đây là trang ngoài repo; chưa xác nhận nội dung đã cập nhật.
2. Trong đúng GA4 web stream, tắt **Enhanced Measurement → Page views → Page changes based on browser history events**. Tắt các sự kiện tự động tùy chọn (form interactions, site search, outbound clicks, file downloads, video engagement, scrolls) có thể thu thập URL/nội dung riêng tư. App dùng `send_page_view: false` và chỉ gửi page view thủ công.
3. Cấu hình **Data redaction → Redact URL query parameters** cho các tham số nhạy cảm như `token`, `studio`, `version`, `email`, `code`, `state`, `redirect`, `callbackURL` và `returnTo`; bật redaction email. Đây là lớp bảo vệ phụ, không thay thế allowlist URL/event trong app; phải rà lại khi có tham số mới.
4. Chỉ sau khi bước 1–3 đã được xác nhận, đổi `NUXT_PUBLIC_GA4_ENABLED=true` trong scope Production và redeploy. Local giữ cờ tắt, Preview tiếp tục để trống. Deployment hiện tại chưa thu thập GA4.
5. Dùng một lượt thử có đồng ý, kiểm Browser Network và GA4 DebugView (bật debug cho phiên QA tại trình duyệt, không thêm định danh vào app): đúng một `page_view` mỗi màn hình, không thêm view khi chỉ đổi query/hash; `page_location` và `page_referrer` đã template ID, bỏ query/fragment, referrer ngoài chỉ còn origin. Không có token, ghi chú, filename, email hay tên riêng trong payload. Kiểm từ chối không tải tag, chấp nhận mới tải, thu hồi reload và không gửi tiếp. Thử cả 320 px và 1280 px, đồng thời kiểm navigation vẫn chạy khi tag bị chặn.

Bộ local chỉ dùng script Google giả và API/filesystem mock, không chứng minh cấu hình tài khoản GA4 hoặc dữ liệu nhận thật. Network/DebugView sau triển khai và xác nhận chính sách là gate thủ công còn mở. GA4 này không triển khai analytics nội bộ T48–T49 (`analytics_events`, daily aggregation, North Star).

`npm run test:e2e:analytics` chạy server local riêng với hai biến bật chỉ trong tiến trình test và chặn request Google bằng script giả; bộ test không gửi dữ liệu tới GA thật. Cấu hình mặc định vẫn tắt analytics và SSR không chèn tag Google.
