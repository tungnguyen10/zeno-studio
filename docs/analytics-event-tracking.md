# Event tracking Zeno — taxonomy zeno_v2

Tài liệu cho bản code thích ứng từ GA4 manage-homes ngày 10/11/2026. Trạng thái nghiệm thu/deploy phải được ghi riêng trong implementation progress; việc có code không chứng minh GA4 Production đã nhận dữ liệu.

## Luồng được đo

Zeno nhập catalog Google Drive khi tạo album; không upload ảnh trực tiếp. Khách chọn ảnh được autosave, còn Studio/người quản trị chốt snapshot. Không phát upload_* hay guest_selection_completed để thay cho hai hành vi này.

Giữ mười tên event hiện có, bổ sung context và các bước còn thiếu. Mọi success phản ánh response server xác nhận; selected/note chỉ phát khi changed=true, không đếm no-op hoặc polling. HTTP 200 conflict/limit_reached phát rejected, khác lỗi request. Analytics không được làm nghiệp vụ thất bại.

| Event | Khi phát | Key event |
|---|---|---|
| studio_home_viewed | Dashboard đã có session và render danh sách/empty state | Không |
| album_creation_started | Form tạo tương tác được | Không |
| album_creation_submitted | Trước request tạo đã qua validation | Không |
| album_created | Tạo và nhập catalog thành công | Có |
| album_creation_failed | Request tạo thất bại | Không |
| album_published | Server xác nhận publish; Tạo nhanh sau create PUBLISHED | Có |
| album_shared | Copy link khách/lời nhắn chứa link thành công | Có |
| album_opened | Khách có quyền, trang ảnh đầu đã render | Không |
| guest_selection_started | Lần đầu đổi lựa chọn thành công trong tab session/album/cycle | Không |
| photo_selected / photo_unselected | Autosave đã thực sự thay đổi lựa chọn | Không |
| guest_selection_save_rejected | HTTP 200 conflict hoặc limit_reached | Không |
| guest_selection_save_failed | Request autosave lỗi | Không |
| photo_note_saved | Nội dung note thực sự thay đổi thành công | Không |
| selection_finalize_submitted | Trước request chốt | Không |
| selection_finalized | Snapshot đã commit | Có |
| selection_finalize_failed | Request chốt lỗi | Không |
| selection_reopened | Vòng mới được server xác nhận | Không |
| gallery_view_changed | Người dùng đổi layout | Không |
| file_match_completed | Quét/đối chiếu file hoàn tất, một event mỗi lần chạy | Không |

Cấp lại token, mở panel, tạo QR, copy link quản trị không tính là shared. Clipboard không chứng minh khách đã nhận link; không suy kênh Zalo/Facebook từ copy. Không suy lưu ảnh vào thiết bị từ browser share/download.

## Identity, privacy và delivery

- Backend cung cấp analytics.albumId sau authorization: `alb_` + HMAC-SHA256 hex của `album:v1:<internalAlbumId>` bằng secret riêng. ID giữ nguyên sau claim/cấp link mới; không có tác dụng cấp quyền.
- Không gửi raw album/studio/user/photo ID, tên album/file, ghi chú, email, path ổ đĩa, URL Drive, query/fragment/token hoặc error.message/stack vào GA4.
- Wrapper chỉ cho phép tên/params hợp lệ. Page location/title/referrer dùng route template đã làm sạch. Không đưa album/actor vào global gtag config.
- Common context: environment (production/staging/development), app_version, taxonomy_version=zeno_v2. Workflow bổ sung analytics identity, actor_type và screen_name theo ngữ cảnh; cycle/version lấy từ response backend.
- Event ID cho created/published/finalized/reopened là khóa ổn định của kết quả nghiệp vụ; app dedup ở sessionStorage và warehouse dedup khi phân tích. Custom event_id không bảo đảm GA4 tự loại mọi bản trùng. Không replay success chỉ vì reload hoặc polling.
- attempt_id phân biệt từng request của người dùng, không phải khóa idempotency database. Timeout có thể đã commit; lỗi truyền tải không chứng minh backend rollback.
- `page_location` là route an toàn tại thời điểm event được phát/nhận vào queue; identity, actor, screen_name, attempt và cycle của request được giữ theo ngữ cảnh thao tác ban đầu. Event xem trang/gallery chỉ phát khi view còn mounted và đã render.
- Startup queue có giới hạn và không lưu token/payload xuống storage. Gate tắt không queue hoặc đánh dấu event đã gửi. Storage bị chặn dùng bộ nhớ trong page lifetime.
- Bộ đếm reportGalleryOpen/reportMatch của Studio có gate riêng và tiếp tục hoạt động độc lập với GA4.

## Cấu hình

| Tên | Phạm vi và giá trị |
|---|---|
| NUXT_PUBLIC_GA4_ENABLED | Gate hiện hữu; mặc định Local/Preview tắt |
| NUXT_PUBLIC_GA4_MEASUREMENT_ID | Property test cho QA; Production ID chỉ trên Production |
| NUXT_ANALYTICS_ID_SECRET | Private server-only; secret ngẫu nhiên ít nhất 32 ký tự, ổn định qua deploy |
| NUXT_PUBLIC_ANALYTICS_ENVIRONMENT | production trên Production, staging trên Preview, development local; fallback VERCEL_ENV |
| NUXT_PUBLIC_ANALYTICS_APP_VERSION | Short release SHA; fallback VERCEL_GIT_COMMIT_SHA, local dùng local |
| NUXT_PUBLIC_STUDIO_GALLERY_ANALYTICS_ENABLED | Gate bộ đếm backend độc lập |

Không dùng Better Auth secret cho HMAC analytics. Không xoay analytics secret tùy tiện vì sẽ đứt chuỗi album. Thiếu secret: không có analytics identity, album-scoped events bị bỏ; page view và nghiệp vụ vẫn hoạt động. Không fallback raw ID.

Chạy kiểm tra cấu hình trong môi trường deployment trước release:

```sh
node scripts/check-analytics-config.mjs
```

Script chỉ in tên cấu hình thiếu/sai; không gọi Google/Neon và không ghi dữ liệu. Khi GA4 bật, exit khác 0 nếu cấu hình không hợp lệ. Production không được dùng app_version=local. Không gửi fixture tự động vào property Production.

## Cấu hình GA4 thủ công

1. Giữ Enhanced Measurement tắt và page_view thủ công, send_page_view=false.
2. Đăng ký custom dimensions event scope: environment, taxonomy_version, creation_flow, actor_type, screen_name, entry_point, source_method, share_method, share_content, share_channel, photo_count_bucket, error_code, error_category, outcome, context, surface. Phải đăng ký environment trước khi dùng report admin mới; report lỗi cấu hình phải được xử lý rõ, không fallback sang dữ liệu không lọc.
3. Không đăng ký album_id/attempt_id/event_id thành custom dimension; giữ event parameters cho BigQuery. Không dùng album_id làm GA4 User-ID.
4. Mark key events: album_created, album_published, album_shared, selection_finalized. Ghi counting method trong evidence; số key events không thay distinct album KPI.
5. Cấu hình internal/developer traffic filters sau khi kiểm tra traffic đã đánh dấu đúng. Không loại toàn bộ actor studio vì đây là khách hàng sử dụng sản phẩm.
6. Lưu chứng cứ Tag Assistant/DebugView của cả thành công/lỗi, thứ tự events và một page_view mỗi navigation; QA mock không thay xác nhận GA4 nhận event.

Admin analytics chỉ query environment=production ở totals/daily/pages/events. Lịch sử thiếu environment không được tự suy thành Production; các tên event cũ được giữ nhưng coverage thay đổi từ release v2. Không tự backfill dữ liệu thiếu ID/context.

## Funnel và KPI

- Studio, 7 ngày: dashboard → form → submit → created → published → shared. Creation_flow chỉ filter ở step có trường này, không filter toàn funnel làm mất dashboard step.
- Tạo nhanh, 7 ngày: form → submit → created → published → shared; creation_flow=guest ở create/publish.
- Khách, 24 giờ/7 ngày: album_opened → guest_selection_started. Autosave không phải hoàn tất chọn ảnh.
- End-to-end theo album là P1: join album_id trong warehouse theo thời gian; bước guest/finalize còn phải cùng cycle. GA4 user funnels không tự nối Studio và Khách khác người/thiết bị.

Tỷ lệ tạo: distinct attempt thành công / distinct submitted. Publish/share/open/finalize dùng cohort album (hoặc album/cycle), cửa sổ 7 ngày theo timestamp, không chia eventCount tổng. Copy chỉ là proxy chia sẻ; browser có thể chặn GA4 nên thiếu event không chứng minh thiếu hành vi.

Proxy mốc hoàn tất: distinct album có snapshot chốt trong tuần, timezone Asia/Ho_Chi_Minh. Backend getStudioAnalytics().albumsFinalized là distinct album trong khoảng ngày; selectionFinalized là số lần chốt. Rolling 7 ngày không phải tuần lịch. Retention xóa album/snapshot có thể làm mất lịch sử query bảng sống; P0 chưa cung cấp global weekly dashboard hoặc dữ liệu lịch sử bất biến.

## Kiểm chứng và release

Automated checks: `npm test`, `npm run typecheck`, `npm run build`, analytics E2E ở cả gate tắt và gate bật riêng; suites chia sẻ, lọc file và admin analytics. Tất cả request Google trong test phải được intercept.

Chi tiết 27 ca nghiệm thu nằm trong [implementation plan](superpowers/plans/2026-11-10-adapt-ga4-event-tracking.md#6-qa-acceptance-matrix). Bao phủ HTTP 200 rejection/no-op, refresh/retry, startup, race cycle/route, clipboard fail, snapshot cũ, privacy, hai gate độc lập và in-app browser gate.

Release và GA4 account changes cần được thực hiện riêng sau code verification. Không đánh dấu production hoàn tất nếu chưa có deploy và evidence nhận event. Theo dõi 1–2 tuần để có baseline độ phủ, duplicate, request lỗi và chênh lệch với DB. Khi payload vi phạm privacy, dùng gate hiện hữu tắt GA4; không rollback dữ liệu album/snapshot vì tracking.

## Tài liệu tham chiếu

- [Google Analytics custom dimensions](https://support.google.com/analytics/answer/14240153) và [high cardinality](https://support.google.com/analytics/answer/13331684).
- [GA4 Data API filters](https://developers.google.com/analytics/devguides/reporting/data/v1/basics).
