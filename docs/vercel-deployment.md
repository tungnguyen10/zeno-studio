# Vercel deployment — zeno-studio

Project: `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Project dùng Nuxt và Node.js 24.x; Vercel CLI đã liên kết local repo đúng project ID. Production: [studio.zenocorp.vn](https://studio.zenocorp.vn). Project chưa nối Git.

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

Tích hợp bật mặc định trên Production theo yêu cầu chủ dự án: mọi trang và các sự kiện workflow đã định nghĩa được đo bằng GA4, không còn banner phân tích; lựa chọn lưu từ bản cũ không còn hiệu lực. Local giữ cờ `false` (ID có thể có trong `.env` cá nhân), Preview để trống; Vercel Production có ID và cờ `true`:

| Biến | Giá trị hiện tại |
| --- | --- |
| `NUXT_PUBLIC_GA4_ENABLED` | `true` ở Production; local mặc định `false`, Preview để trống. |
| `NUXT_PUBLIC_GA4_MEASUREMENT_ID` | `G-2GD5P03B7S` |

Trạng thái QA/phát hành:

1. **Còn mở:** Chủ dự án cập nhật và kiểm trực tiếp [chính sách bảo mật](https://www.zenocorp.vn/privacy) để mô tả GA4 chạy mặc định và việc đếm lượt mở gallery theo studio. Trang ngoài repo vẫn có nội dung giữ chỗ.
2. **Đạt ngày 27/10:** Trong đúng web stream `G-2GD5P03B7S`, đã tắt Enhanced Measurement. Trong Google tag, đã tắt riêng page view khi đổi browser history, scroll, outbound click, form interaction, video và file download; mở lại để xác nhận cả 6 giá trị `off`. App dùng `send_page_view: false` và chỉ gửi page view thủ công.
3. **Đạt ngày 27/10:** Data redaction email đang bật; URL query redaction đã lưu và xác nhận 11 khóa `token`, `studio`, `version`, `email`, `code`, `state`, `redirect`, `callbackurl`, `returnto`, `next`, `redirectto` (không phân biệt hoa thường). Đây là lớp bảo vệ phụ, không thay thế allowlist URL/event trong app; rà lại khi có tham số mới.
4. **Đạt ngày 27/10:** Đã đổi `NUXT_PUBLIC_GA4_ENABLED=true` trong scope Production và redeploy `dpl_J1RzsoKExAMJBznEsdtDZkUXgxYF`. Local giữ cờ tắt, Preview tiếp tục để trống. Chủ dự án yêu cầu bật trong khi bước 1 còn mở.
5. **Một phần:** Bộ Chromium local xác nhận tự tải tag, mỗi màn hình chỉ một view, không thêm view khi chỉ đổi query/hash; `page_location` và `page_referrer` đã template ID, bỏ query/fragment, referrer ngoài chỉ còn origin. Không có token, ghi chú, filename, email hay tên riêng trong payload. Kiểm navigation vẫn chạy khi tag bị chặn. Cần smoke lại Production và kiểm GA4 DebugView.

Bộ local dùng script Google giả và API/filesystem mock. Bản GA4 trước đã được Google trả HTTP 204; DebugView, QA các đường dẫn và công bố chính sách vẫn còn mở. GA4 này không triển khai analytics nội bộ T48–T49 (`analytics_events`, daily aggregation, North Star).

`npm run test:e2e:analytics` chạy server local riêng với hai biến bật chỉ trong tiến trình test và chặn request Google bằng script giả; bộ test không gửi dữ liệu tới GA thật. Cấu hình mặc định vẫn tắt analytics và SSR không chèn tag Google.

## Analytics dashboards

Release ngày 27/10/2026: commit `402d063`, Vercel Production `dpl_DAgQkrLvVxTPPNWTHUaBQYgWasMQ` Ready, alias `studio.zenocorp.vn`. Neon `production` đã áp migration 024–025 sau nhánh test; backup `backup-before-analytics-20261027` tự hết hạn ngày 03/11. Function `expirealbums` và trigger `album-expiry` đã bật trên Production, lần chạy kế tiếp 02:00 UTC ngày 28/10; chưa có kết quả chạy thực đầu tiên. Smoke GET hai trang 200, GET API không đăng nhập 401; Chromium 320px không có page error hoặc tràn ngang. Cờ ghi gallery vẫn tắt; chưa có tài khoản Production để smoke owner/admin workflow.

Hai trang có quyền riêng. `/admin/analytics` đọc báo cáo GA4 Data API (7/30/90 ngày, active users, page views, trang và sự kiện đã allowlist); chỉ `platform_admins` được đọc API. `/studio/analytics?studio=<id>` chỉ cho owner của studio đó; workflow đếm trong transaction PostgreSQL, lượt mở gallery hợp lệ được ghi khi gallery tải thành công, và số liệu đối chiếu file chỉ gồm ba con số. Số liệu không chứa tên file, ghi chú, email hay token. Migration `024_platform_admins.sql` phải chạy trước `025_studio_analytics.sql`.

Để mở báo cáo GA4 thật, dùng ba biến **private** ở Vercel Production: `NUXT_GA4_PROPERTY_ID` là numeric property ID (khác Measurement ID `G-2GD5P03B7S`), `NUXT_GA4_PROPERTY_TIMEZONE=Asia/Ho_Chi_Minh`, và `NUXT_GA4_SERVICE_ACCOUNT_JSON` là JSON của service account được cấp quyền Viewer trên property. Không đưa JSON vào Git hoặc `.env.example`. Cấp quyền quản trị cho tài khoản đã xác minh qua `scripts/grant-platform-admin.ts grant <email>` với `NUXT_DATABASE_DIRECT_URL` owner direct URL trong tiến trình vận hành; runtime Vercel chỉ có SELECT trên bảng này. Thu hồi bằng `revoke` cùng script. Khi thiếu cấu hình, API trả 503 rõ ràng.

Kiểm tra ngày 28/10/2026: đã xác nhận numeric GA4 property ID `471466507` khớp web stream `G-2GD5P03B7S`. Vercel Production đã có cả ba biến private `NUXT_GA4_PROPERTY_ID=471466507`, `NUXT_GA4_PROPERTY_TIMEZONE=Asia/Ho_Chi_Minh`, `NUXT_GA4_SERVICE_ACCOUNT_JSON`. Google Analytics Data API đã bật trong Cloud project `zeno-house`; service account `zeno-studio-ga4-reporter@zeno-house.iam.gserviceaccount.com` đã được cấp Viewer trên đúng GA4 property, giới hạn không xem chỉ số chi phí/doanh thu và không có Cloud IAM role. Kiểm thử Data API bằng key thật trả báo cáo 7 ngày hợp lệ với 0 lượt; parser đã sửa để nhận phản hồi rỗng hợp lệ của GA4. Tài khoản app đã xác minh tại Production và đã được cấp platform admin qua CLI; server nhận JSON credential đã parse từ Nitro runtime config. Không đưa service account key vào chat, log hoặc repo.

Vercel Production `dpl_64pioMGDSRvdekcTGErH43X5y87G` Ready và đã gắn alias `studio.zenocorp.vn`. Smoke HTTP sau deploy: `/`, `/studio/analytics`, `/admin/analytics` trả 200; `/api/admin/analytics?days=7` không đăng nhập trả 401. Sau khi cấp platform admin, trang báo cáo trả 502 do Nitro đã parse chuỗi JSON credential thành object; code hiện nhận cả hai dạng và cần smoke sau redeploy. Bản deployment này vẫn tắt ghi gallery.

`NUXT_PUBLIC_STUDIO_GALLERY_ANALYTICS_ENABLED` là cờ **riêng**, mặc định tắt cả khi GA4 tag đã bật. Theo chỉ đạo mới nhất, đặt `true` ở Production trong release này. API và client đều kiểm cờ; API vẫn kiểm quyền album, RLS và rate limit. Số liệu workflow vẫn đầy đủ từ database; lịch sử gallery trước khi bật cờ không thể khôi phục theo studio.

Migration 024–025 đã được thử trên branch tạm từ Neon `production` rồi áp lên Production; schedule `album-expiry` đã bật để dọn aggregate sau 120 ngày và rate rows sau một ngày. Sau release mới, đối chiếu 7/30/90 ngày với GA4 UI, thử 403 cross-studio, 320px/desktop, workflow tổng hợp, tự động gửi GA4 và payload chỉ số. Không chạy fixture live test trên Production. Lưu deployment ID và kết quả smoke sau phát hành.
