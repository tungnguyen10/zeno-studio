# Vercel deployment — zeno-studio

Project: `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Project dùng Nuxt và Node.js 24.x; Vercel CLI đã liên kết local repo đúng project ID. Production [studio.zenocorp.vn](https://studio.zenocorp.vn) đang chạy deployment `dpl_J1RzsoKExAMJBznEsdtDZkUXgxYF` (2026-10-27); mã app GA4 từ commit `174ecd8`. Project chưa nối Git.

## Release Production ngày 2026-10-27

- Preview `dpl_6s2or3HB3d3gKQ2nfry93GGREMuv` Ready; `/`, `/create`, `/api/auth/get-session` trả 200.
- Neon branch `production` trước release chưa có schema ứng dụng; nay được tạo schema bằng 24 migration sau khi cùng bộ migration đạt trên branch tạm `release-20261027-test`. Không chuyển user/album từ `codex-v1-dev` sang nhánh mới. Branch `backup-before-release-20261027` giữ điểm khôi phục trước migration; branch test tự hết hạn ngày 2026-10-28. Vercel Production dùng `NUXT_DATABASE_URL` pooled với role riêng `LOGIN NOBYPASSRLS NOCREATEROLE`; `NUXT_DATABASE_DIRECT_URL` đã bỏ khỏi scope Production.
- Production deployment `dpl_J1RzsoKExAMJBznEsdtDZkUXgxYF` Ready và alias `studio.zenocorp.vn` đã gắn. Release đầu kiểm `/`, `/create`, `/studio`, `/api/auth/get-session` trả 200; bản GA4 bật kiểm lại `/` trả 200, banner hiện trước đồng ý, không request Google trước đồng ý, sau đồng ý tải tag và gửi một `page_view` tới đúng ID, Google trả HTTP 204. Chưa kiểm luồng đăng ký/tạo album trên Production.
- `NUXT_DRIVE_VERIFIED=false`, nên luồng Drive còn khóa theo gate hiện tại. `NUXT_PUBLIC_GA4_MEASUREMENT_ID=G-2GD5P03B7S` và `NUXT_PUBLIC_GA4_ENABLED=true` trong scope Vercel Production. Trang chính sách bảo mật ngoài repo vẫn là nội dung giữ chỗ; chủ dự án sẽ cập nhật. GA4 web stream đã cấu hình ở bước 2–3 bên dưới; DebugView chưa kiểm.
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

Tích hợp đang bật trên Production theo yêu cầu chủ dự án. Tag chỉ được tải sau khi người dùng đồng ý; từ chối không tải tag, thu hồi đồng ý sẽ reload để dừng tag đã tải. Local giữ cờ `false` (ID có thể có trong `.env` cá nhân), Preview để trống; Vercel Production có ID và cờ `true`:

| Biến | Giá trị hiện tại |
| --- | --- |
| `NUXT_PUBLIC_GA4_ENABLED` | `true` ở Production; local mặc định `false`, Preview để trống. |
| `NUXT_PUBLIC_GA4_MEASUREMENT_ID` | `G-2GD5P03B7S` |

Trạng thái QA/phát hành:

1. **Còn mở:** Công bố và kiểm trực tiếp [chính sách bảo mật](https://www.zenocorp.vn/privacy): mô tả Google Analytics, mục đích đo lường, lựa chọn đồng ý/từ chối và cách mở **Cài đặt phân tích** để thu hồi. Trang ngoài repo vẫn có nội dung giữ chỗ; chủ dự án đã nhận phần cập nhật này.
2. **Đạt ngày 27/10:** Trong đúng web stream `G-2GD5P03B7S`, đã tắt Enhanced Measurement. Trong Google tag, đã tắt riêng page view khi đổi browser history, scroll, outbound click, form interaction, video và file download; mở lại để xác nhận cả 6 giá trị `off`. App dùng `send_page_view: false` và chỉ gửi page view thủ công sau đồng ý.
3. **Đạt ngày 27/10:** Data redaction email đang bật; URL query redaction đã lưu và xác nhận 11 khóa `token`, `studio`, `version`, `email`, `code`, `state`, `redirect`, `callbackurl`, `returnto`, `next`, `redirectto` (không phân biệt hoa thường). Đây là lớp bảo vệ phụ, không thay thế allowlist URL/event trong app; rà lại khi có tham số mới.
4. **Đạt ngày 27/10:** Đã đổi `NUXT_PUBLIC_GA4_ENABLED=true` trong scope Production và redeploy `dpl_J1RzsoKExAMJBznEsdtDZkUXgxYF`. Local giữ cờ tắt, Preview tiếp tục để trống. Chủ dự án yêu cầu bật trong khi bước 1 còn mở.
5. **Một phần:** Chromium Network trên Production xác nhận `/` không gửi Google trước đồng ý; sau đồng ý tải `gtag.js` đúng ID, gửi một `page_view` với `page_location=https://studio.zenocorp.vn/` và Google trả HTTP 204. Cần kiểm tiếp GA4 DebugView (bật debug cho phiên QA tại trình duyệt, không thêm định danh vào app), mỗi màn hình chỉ một view, không thêm view khi chỉ đổi query/hash; `page_location` và `page_referrer` đã template ID, bỏ query/fragment, referrer ngoài chỉ còn origin. Không có token, ghi chú, filename, email hay tên riêng trong payload. Kiểm từ chối không tải tag, thu hồi reload và không gửi tiếp. Thử cả 320 px và 1280 px, đồng thời kiểm navigation vẫn chạy khi tag bị chặn.

Bộ local dùng script Google giả và API/filesystem mock. Smoke Production đã xác nhận request được Google trả HTTP 204; DebugView, QA các đường dẫn và công bố chính sách vẫn còn mở. GA4 này không triển khai analytics nội bộ T48–T49 (`analytics_events`, daily aggregation, North Star).

`npm run test:e2e:analytics` chạy server local riêng với hai biến bật chỉ trong tiến trình test và chặn request Google bằng script giả; bộ test không gửi dữ liệu tới GA thật. Cấu hình mặc định vẫn tắt analytics và SSR không chèn tag Google.

## Analytics dashboards

Code trong `feat/analytics-dashboards` thêm hai trang có quyền riêng. `/admin/analytics` đọc báo cáo GA4 Data API (7/30/90 ngày, active users, page views, trang và sự kiện đã allowlist); chỉ `platform_admins` được đọc API. `/studio/analytics?studio=<id>` chỉ cho owner của studio đó; workflow đếm trong transaction PostgreSQL, lượt mở gallery chỉ từ khách đã đồng ý, và số liệu đối chiếu file chỉ gồm ba con số. Số liệu không chứa tên file, ghi chú, email hay token. Migration `024_platform_admins.sql` phải chạy trước `025_studio_analytics.sql`.

Trước khi mở báo cáo GA4 thật, đặt ba biến **private** ở Vercel Production: `NUXT_GA4_PROPERTY_ID` là numeric property ID (khác Measurement ID `G-2GD5P03B7S`), `NUXT_GA4_PROPERTY_TIMEZONE=Asia/Ho_Chi_Minh`, và `NUXT_GA4_SERVICE_ACCOUNT_JSON` là JSON của service account được cấp quyền Viewer trên property. Không đưa JSON vào Git hoặc `.env.example`. Cấp quyền quản trị cho tài khoản đã xác minh qua `scripts/grant-platform-admin.ts grant <email>` với `NUXT_DATABASE_DIRECT_URL` owner direct URL trong tiến trình vận hành; runtime Vercel chỉ có SELECT trên bảng này. Thu hồi bằng `revoke` cùng script. Khi thiếu cấu hình, API trả 503 rõ ràng.

`NUXT_PUBLIC_STUDIO_GALLERY_ANALYTICS_ENABLED` là cờ **riêng**, mặc định tắt cả khi GA4 tag đã bật. Theo chỉ đạo hiện tại, giữ cờ này trống hoặc `false` ở Production cho tới khi [trang chính sách bảo mật](https://www.zenocorp.vn/privacy) công bố việc đếm lượt mở theo studio, giới hạn consent và cách thu hồi. API và client đều kiểm cờ; dashboard ghi rõ trạng thái tạm tắt. Bật cờ bằng `true` ở Production sau khi công bố và smoke, không cần đổi schema. Số liệu workflow vẫn đầy đủ bất kể consent; lịch sử gallery trước khi bật cờ không thể khôi phục theo studio.

Trình tự phát hành: chạy migration 024–025 trên branch tạm từ Neon `production`, kiểm RLS owner/manager và claim guest, rồi áp migration trên `production` trước khi deploy app. Build Neon Function bằng `npm run neon:build`; áp `neon config` và xác nhận schedule `album-expiry` trên branch Production để dọn aggregate sau 120 ngày và rate rows sau một ngày. Sau khi cấu hình GA4 Data API và cấp admin, đối chiếu 7/30/90 ngày với GA4 UI, thử 403 cross-studio, 320px/desktop, workflow tổng hợp, consent accepted/rejected và payload chỉ số. Không chạy fixture live test trên Production. Lưu deployment ID và kết quả smoke sau phát hành.
