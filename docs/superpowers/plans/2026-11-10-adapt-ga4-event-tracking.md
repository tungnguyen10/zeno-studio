# Adapt GA4 Event Tracking cho Zeno Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Chỉ thực hiện implementation khi người dùng yêu cầu; tài liệu này chưa triển khai thay đổi.

**Goal:** Đo hành trình tạo album → chia sẻ → khách chọn ảnh → người quản trị chốt snapshot bằng event đáng tin cậy, nối được theo album và không gửi PII/token vào GA4.

**Architecture:** Mở rộng analytics wrapper allowlist hiện có; frontend phát event hành vi và kết quả API, backend cung cấp ID album giả danh sau authorization. Giữ database/snapshot làm nguồn chuẩn cho kết quả nghiệp vụ; GA4 phục vụ phân tích hành vi. Giữ tên 10 event hiện hành, thêm taxonomy version để phân biệt payload mới.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, gtag.js hiện có, Nitro, Node crypto, PostgreSQL/RLS, Vitest và Playwright hiện có. Không thêm runtime dependency.

## 1. Phạm vi và quyết định thích ứng

Nguồn yêu cầu: `docs/GA4_Event_Tracking_Spec_manage-homes.pdf` và bản text người dùng cung cấp ngày 10/11/2026. Đã đối chiếu README, product spec, implementation progress và code analytics hiện tại.

Giả định lập plan: giữ workflow sản phẩm hiện tại; không thêm upload trực tiếp hoặc nút khách xác nhận hoàn tất. Mốc hoàn tất trong plan là **Studio/người quản trị chốt snapshot**, không phải hoàn tất hậu kỳ/giao ảnh hoặc xác nhận chủ quan của khách.

| Trong spec nguồn | Thích ứng cho Zeno |
|---|---|
| `upload_started/completed`, lỗi từng file | Chưa áp dụng. Nhập catalog Drive nằm trong request tạo album; đo bằng `album_creation_submitted/created/failed`, `source_method=google_drive` và thời gian request. Không gọi việc liệt kê catalog là upload ảnh. |
| `guest_album_viewed` | Giữ tên đang dùng `album_opened`; chuẩn hóa trigger sau khi dữ liệu và gallery render thành công. |
| `guest_photo_selected/unselected` | Giữ `photo_selected/unselected`, chỉ sau server xác nhận thay đổi. |
| `guest_selection_started` | Thêm, sau lần đầu server xác nhận thay đổi lựa chọn trong phiên theo album và cycle. |
| `guest_selection_submitted/completed` | Không phát; khách hiện chỉ autosave. Thêm `selection_finalize_submitted/failed`, giữ `selection_finalized` sau chốt thành công. |
| `guest_selection_reviewed` | P1: chỉ dùng nếu ánh xạ được chính xác vào thao tác mở chế độ ảnh đã chọn; không tự tạo màn review. |
| `studio_home_viewed` thiếu trong bảng P0 | Bổ sung vào P0 để funnel Studio có đủ điểm bắt đầu. |
| Album type, PIN, account guest, direct upload | Không tự gán giá trị khi sản phẩm chưa hỗ trợ. Dùng `creation_flow=studio|guest`, `guest_auth_type=token`. |
| `download_completed` | Chưa đưa vào P0; browser không xác nhận khách đã lưu ảnh vào Photos/ổ đĩa. |

### Global Constraints

- Giữ `safePage`/`safeReferrer`, page view thủ công và Enhanced Measurement tắt; không gửi URL thô, query hoặc fragment.
- Giữ chính sách bật GA4 hiện tại; không thêm banner hoặc thay đổi consent trong task này.
- Production bật theo cấu hình; Local/Preview mặc định tắt. QA dùng measurement ID riêng hoặc intercept toàn bộ collect, không đẩy fixture vào property Production.
- `environment` phải dựa vào deployment environment đã chuẩn hóa, không suy từ production build mode; Preview cũng là production build.
- Event success chỉ sau API success có dữ liệu hợp lệ; không phát khi mount lại trang kết quả, polling hoặc thay đổi filter.
- Không gửi title, filename, note, email, Drive ID/link, auth token, error.message/stack hoặc raw album/studio/user ID.
- Backend kiểm tra quyền/RLS như hiện tại. ID analytics không phải credential và không cấp quyền truy cập album.
- Không sửa schema, triển khai Measurement Protocol, xây dashboard mới hoặc backfill dữ liệu cũ trong P0.
- Không tuyên bố exactly-once delivery của GA4; browser có thể bị chặn hoặc mất response. Backend là nguồn chuẩn.
- Lỗi analytics không được làm request nghiệp vụ đã thành công bị hiển thị là thất bại, chặn cập nhật UI hoặc ngăn phát event tiếp theo. Không đặt thao tác analytics có thể throw chung nhánh catch nghiệp vụ.
- Bộ đếm gallery/file-match ở backend có gate riêng, không phụ thuộc gate GA4, sender, HMAC secret hoặc dedup GA4.

## 2. Hợp đồng dữ liệu

### Common parameters

| Parameter | Quy định |
|---|---|
| `environment` | `production|staging|development`; deployment config là nguồn chuẩn. |
| `app_version` | Short commit SHA từ build; development dùng `local`, không dùng dữ liệu request. |
| `taxonomy_version` | `zeno_v2`; đánh dấu ngày bắt đầu dữ liệu mới. |
| `actor_type` | `studio|guest_admin|customer`; chỉ gửi trên workflow event có ngữ cảnh xác định. Không suy khách có tài khoản từ việc giữ link. |
| `screen_name` | Enum `studio_home|album_create|album_manage|guest_album|album_results|file_filter`. |
| `album_id` | `alb_` + HMAC-SHA256 hex của `album:v1:<internalAlbumId>`, tính ở server bằng secret riêng. Có ở event album sau khi xác định được album. |
| `creation_flow` | `studio|guest` ở create/publish; các event khác dùng actor context, không đoán nguồn tạo từ route. |
| `cycle` | Số nguyên dương từ backend; dùng để phân biệt các vòng chọn. |
| `outcome` | `conflict|limit_reached` cho autosave bị từ chối ở HTTP 200; không đánh đồng với lỗi truyền tải. |
| `context` | `album|standalone` cho file-match; không dùng chung field này thay cho screen_name. |
| `attempt_id` | UUID tạo mới trước mỗi user-triggered request; không đổi khi xử lý response của cùng request. Không phải khóa idempotency của API. |
| `event_id` | Khóa kết quả ổn định, ví dụ `album_created:<analyticsId>` hoặc `selection_finalized:<analyticsId>:<versionNumber>`. Phục vụ dedup tại app/warehouse; không giả định gtag tự dedup custom event. |

`album_id`, `attempt_id`, `event_id` là event parameters phục vụ export; không đăng ký thành custom dimensions trong GA4 UI. Không dùng album ID làm GA4 User-ID. P0 chưa cần `studio_id` hoặc guest session UUID gửi lên GA4.

Secret: `NUXT_ANALYTICS_ID_SECRET`, chỉ ở server, độc lập Better Auth secret. Dùng cùng secret ổn định trong một môi trường để ID không đổi khi claim album, thay khách, cấp lại link hay deploy. Không xoay secret trong release này; xoay sẽ tạo điểm đứt chuỗi và cần kế hoạch riêng.

Nếu thiếu secret: workflow vẫn hoạt động, response không có analytics identity và client bỏ qua event album của taxonomy mới; không fallback sang raw ID. Kiểm tra cấu hình phải báo rõ thiếu secret trước release. Event không gắn album và page view vẫn theo gate hiện tại. Không catch chung và che lỗi nghiệp vụ.

Counts là số nguyên không âm; duration dùng milliseconds đo bằng monotonic clock cho **cùng request**, không gọi là tổng thời gian chọn ảnh. `photo_count_bucket=0|1_20|21_50|51_100|101_300|over_300` (bổ sung bucket 0 cho dữ liệu hợp lệ nếu có).

Error allowlist: `validation|network|timeout|permission|not_found|expired|conflict|rate_limited|upstream|unknown`; `error_category=validation|network|api|permission|unknown`. Chỉ đọc status/code có cấu trúc; không parse free-text để đưa vào GA4. Không gán mọi 403 là link hết hạn.

Phân loại hiện trạng API: `StudioOperationError` chỉ có `statusCode`; `studioApi` chuyển lỗi thành HTTP status/statusMessage, chưa có machine code cho từng nguyên nhân. P0 map 400/422→validation, 401/403→permission, 404→not_found, 409→conflict, 410→expired (trạng thái không còn truy cập, không suy nguyên nhân sâu hơn), 413→validation, 429→rate_limited, 502/503→upstream, 500/khác→unknown. Client request timeout→timeout, lỗi kết nối không có HTTP response→network. Không đổi nội dung thông báo nghiệp vụ hiện hữu để phục vụ tracking. Mã lỗi sâu hơn và phân biệt invalid/expired link thuộc P1.

### P0 events và trigger

Common parameters áp dụng theo ngữ cảnh; bảng dưới liệt kê trường bổ sung.

| Event | Trigger chính xác | Parameters bổ sung | Key event |
|---|---|---|---|
| `studio_home_viewed` | Studio dashboard có session và danh sách/empty state render xong; không phải form login | `screen_name` | Không |
| `album_creation_started` | Form tạo hiện và tương tác được; một lần mỗi lần mở dialog hoặc vào trang create | `creation_flow`, `entry_point` | Không |
| `album_creation_submitted` | Sau validation client, ngay trước POST tạo | `creation_flow`, `attempt_id`, `source_method` | Không |
| `album_created` | POST tạo thành công, trả album và analytics identity | `creation_flow`, `attempt_id`, `event_id`, `photo_count_bucket`, `duration_ms`, `source_method` | Có |
| `album_creation_failed` | Request tạo thất bại, một lần mỗi attempt | `creation_flow`, `attempt_id`, `error_code`, `error_category` | Không |
| `album_published` | Transition publish được server xác nhận; Tạo nhanh sau response create có status PUBLISHED | `creation_flow`, `event_id`, `photo_count_bucket` | Có |
| `album_shared` | Clipboard ghi thành công link khách hoặc lời nhắn chứa link; chỉ một lần mỗi hành động | `share_method=clipboard`, `share_content=link|message`, `share_channel=copy_link` | Có |
| `album_opened` | Khách được cấp quyền, tải thành công dữ liệu trang ảnh đầu và gallery render; một lần mỗi entry | `cycle`, `photo_count_bucket`, `guest_auth_type=token` | Không |
| `guest_selection_started` | Lần đầu autosave thay đổi thành công trong session/cycle | `cycle`, `selection_count` | Không |
| `photo_selected/unselected` | Server xác nhận thay đổi trạng thái, không phải optimistic click hoặc refresh đồng bộ | `cycle`, `selected_count` | Không |
| `guest_selection_save_failed` | Autosave thất bại, loại bỏ trường hợp người dùng hủy trước gửi request | `cycle`, `attempt_id`, `error_code`, `error_category` | Không |
| `guest_selection_save_rejected` | PUT trả `status=conflict|limit_reached` dù HTTP 200; một lần mỗi attempt | `cycle`, `attempt_id`, `outcome` | Không |
| `selection_finalize_submitted` | Ngay trước request chốt đã qua validation | `cycle`, `attempt_id` | Không |
| `selection_finalized` | API chốt thành công, snapshot đã commit | `cycle`, `version_number`, `selection_count`, `event_id`, `attempt_id`, `surface` hiện có | Có |
| `selection_finalize_failed` | Chốt trả lỗi/mất kết nối, một lần mỗi attempt | `cycle`, `attempt_id`, `error_code`, `error_category` | Không |
| `selection_reopened` | API mở vòng mới thành công | `cycle` mới, `event_id`, `surface` hiện có | Không |

Giữ `gallery_view_changed`, `photo_note_saved`, `file_match_completed` và params đang có; bổ sung identity khi có album context. Công cụ lọc file độc lập không có album thì không bịa `album_id`.

Không tính cấp token, mở panel, tạo QR hoặc copy link quản trị là `album_shared`. Không suy Zalo/Facebook từ việc copy; native share trong tương lai cũng không biết chắc app đích.

### Response contract cho thay đổi thực tế

`setPhotoSelection` hiện trả `saved` cả khi trạng thái đã đúng; `savePhotoNote` cũng trả `saved` khi body không đổi. Vì vậy chỉ kiểm tra HTTP 2xx hoặc `status=saved` là chưa đủ:

```ts
type SaveSelectionResponse = {
  status: 'saved' | 'conflict' | 'limit_reached'
  version: number
  selected: boolean
  count: number
  cycle: number
  changed: boolean
}

type SaveNoteResponse = {
  status: 'saved' | 'conflict'
  version: number
  body: string // dữ liệu UI hiện có, tuyệt đối không forward sang analytics
  cycle: number
  changed: boolean
}
```

Backend bổ sung `changed=false` cho no-op và rejection; `changed=true` chỉ khi thực sự ghi thay đổi. `photo_selected/unselected`, `photo_note_saved` và `guest_selection_started` chỉ phát khi `status=saved && changed`. Không gửi `photo_id` trong payload GA4. Note thay đổi không khởi động selection_started.

Capture attempt/identity/expectedVersion trước khi request bắt đầu; dùng `cycle` từ response cho kết quả thay vì overview có thể đã stale. Với lỗi không có response cycle, dùng cycle đã capture và không khẳng định nó là cycle đã được ghi. Response của album/cycle cũ không được cập nhật UI album/cycle mới; event phản ánh đúng ngữ cảnh request gốc nếu thay đổi đã được xác nhận.

Session ở plan là **tab selection session**, phân biệt bằng album/cycle và sống theo sessionStorage; không phải GA4 session có timeout. Mở tab mới có thể có started mới, report theo album/cycle phải dedup riêng. Browser có thể sao chép sessionStorage khi duplicate tab; không tuyên bố mỗi tab luôn tương ứng một GA4 session.

## 3. Funnel và KPI

1. **Studio activation, 7 ngày:** `studio_home_viewed → album_creation_started → album_creation_submitted → album_created → album_published → album_shared`, filter `creation_flow=studio` ở bước có trường này. Tạo Closed và Open funnel; đây là user funnel chẩn đoán hành vi, không chứng minh tất cả bước thuộc cùng album.
2. **Tạo nhanh, 7 ngày:** `album_creation_started → album_creation_submitted → album_created → album_published → album_shared`, filter create/publish theo `creation_flow=guest`. Không cần dashboard/login.
3. **Khách tương tác, 24 giờ và 7 ngày:** `album_opened → guest_selection_started`, theo album/cycle trong warehouse; GA4 user funnel chỉ là góc nhìn bổ sung. Không gọi autosave là hoàn tất.
4. **End-to-end theo album:** `album_created → album_published → album_shared → album_opened → guest_selection_started → selection_finalized`; join trong export/warehouse theo `album_id`, kiểm tra thứ tự timestamp. Bước guest và finalize ghép thêm `cycle`; không ghép một lần chọn ở vòng cũ với lần chốt ở vòng mới.

North Star cho phạm vi tracking này: **distinct album có snapshot chốt thành công trong tuần** từ database, timezone `Asia/Ho_Chi_Minh`. Một album chốt nhiều phiên bản trong cùng tuần vẫn tính một; báo cáo số vòng chốt là chỉ số riêng. Không thay định nghĩa toàn bộ photo workflow hoàn tất trong product spec bằng metric này.

Nguồn hiện có là `getStudioAnalytics().albumsFinalized` (distinct album trong khoảng ngày), khác `selectionFinalized` (tổng lần chốt). Một cửa sổ 7 ngày hiện tại là rolling window, không tự biến thành tuần lịch. P0 chỉ ghi định nghĩa và đối chiếu trên studio đã được cấp quyền; chưa tạo global weekly dashboard. Snapshot/album có thể bị xóa theo retention, nên query bảng sống không bảo đảm lịch sử North Star bất biến. Warehouse/retention cho chỉ số dài hạn cần thiết kế riêng ở P1; không cộng daily unique để suy weekly unique.

KPI bổ sung:

- Create request success rate: distinct attempt có `album_created` / distinct `album_creation_submitted`.
- Publish rate: album được publish trong 7 ngày sau tạo / album tạo trong cùng cohort.
- Share rate: album có share được quan sát trong 7 ngày sau publish / album publish trong cohort.
- Guest open rate: album có open sau share trong 7 ngày / album có share trong cohort. Copy là proxy chia sẻ, thiếu event không chứng minh chưa chia sẻ.
- Finalize rate: album/cycle được chốt trong 7 ngày sau guest open / album/cycle có guest open trong cohort.
- Finalize request failure rate: distinct attempt có failed / distinct submitted; timeout có thể đã commit nên không suy đây là tỷ lệ thất bại nghiệp vụ.

Không lấy tỷ lệ hai eventCount tổng để thay cho cohort conversion; giữ raw event count ở dashboard hiện có nhưng ghi rõ ý nghĩa. Dữ liệu trước `zeno_v2` thiếu identity không thể backfill chính xác.

## 4. File responsibilities

| File | Trách nhiệm |
|---|---|
| Mới `shared/domain/analytics.ts` | Event names, enum, kiểu metadata chung; không có secret hoặc Node import. |
| Mới `server/analytics/identity.ts` | Tạo pseudonymous album identity bằng HMAC. |
| `app/lib/analytics-model.ts` | Allowlist và validate từng payload, giữ vệ sinh route. |
| Mới `app/lib/analytics-session.ts` | Dedup session/cycle và kết quả đã phát; không lưu token. |
| `app/lib/analytics-events.ts`, `app/plugins/analytics.client.ts` | Gửi event kèm deployment/version context, một sender và một cơ chế page view. |
| `app/lib/analytics-config.ts`, `nuxt.config.ts`, `.env.example` | Gate và cấu hình analytics; không chứa giá trị secret thật. |
| `server/albums/{album,guest,access,workspace,selection}.ts` | Trả metadata sau authorization, cùng dữ liệu nghiệp vụ được đọc/ghi. |
| `app/lib/studio-album.ts` | Kiểu album frontend nhận metadata bổ sung. |
| `app/components/studio/AlbumCard.vue`, `app/components/studio/AlbumTable.vue`, `app/pages/studio/albums/[albumId]/index.vue` | Truyền identity và photoCount tới ShareActions ở mobile, desktop và trang chi tiết. |
| `app/pages/create.vue`, `app/components/studio/CreateAlbumDialog.vue` | Đo create attempts và kết quả của hai flow. |
| `app/components/studio/AlbumShareActions.vue`, `app/pages/guest/albums/[albumId]/index.vue` | Phân biệt publish, cấp link và copy thành công. |
| `app/pages/studio/index.vue`, `app/pages/album/[albumId].vue`, `app/components/album/AlbumWorkspace.vue` | Dashboard, gallery, selection và finalize instrumentation. |
| `app/composables/useLocalPhotoFilter.ts`, `app/components/album/AlbumLocalFilter.vue`, hai trang `app/pages/{studio,guest}/albums/[albumId]/filter.vue` | Đưa identity/snapshot context vào event đối chiếu file của album. |
| Hai route `server/api/studio/[studioId]/albums/[albumId]/selections/[versionId]/filter-manifest.get.ts`, `server/api/guest/albums/[albumId]/selections/[versionId]/filter-manifest.get.ts` | Trả additive analytics identity sau khi domain đã authorize đúng snapshot. |
| `app/pages/tools/file-filter.vue` | Giữ event đối chiếu file độc lập không có album context. |
| `app/lib/studio-analytics.ts`, `server/analytics/studio-report.ts`, `server/api/album/[albumId]/analytics/open.post.ts` | Giữ nguyên hành vi bộ đếm backend và nguồn đối soát; chỉ thêm regression tests. |
| `server/analytics/ga4-report.ts`, `app/pages/admin/analytics.vue` | Event allowlist và nhãn báo cáo tương thích dữ liệu cũ/mới. |
| `docs/analytics-event-tracking.md` (mới) | Taxonomy được triển khai, QA matrix, metric và release boundary. |
| `docs/vercel-deployment.md`, `docs/implementation-progress.md` | Cấu hình, checklist vận hành và trạng thái thật. |

## 5. Implementation tasks

### Task 1 — Chốt payload contract và bộ lọc

**Files:** `shared/domain/analytics.ts`, `app/lib/analytics-model.ts`; tests `tests/domain/analytics-model.test.ts`, mới `tests/domain/analytics-contract.test.ts`.

**Interfaces:** `AnalyticsIdentity = { albumId: string }`; response dùng `analytics?: AnalyticsIdentity`, event parameter dùng `album_id`. `photoCountBucket(value: number): string | undefined`; `normalizeAnalyticsError(cause: unknown): { error_code: string; error_category: string }`. Giữ entry point `buildAnalyticsEvent` và `trackAnalyticsEvent`.

Event input nhận identity qua `analytics?: AnalyticsIdentity`, builder map `analytics.albumId` sang `album_id` chỉ khi khớp `^alb_[a-f0-9]{64}$`; field top-level raw `albumId` vẫn bị loại. Event create-start/submitted/failed trước khi album tồn tại không bắt buộc identity. Event `file_match_completed` phân biệt `context=album|standalone`; chỉ context album mới bắt buộc identity. Actor context của standalone được bỏ trống; không tự gán customer/studio. UI input string, NaN, Infinity, số âm, enum giả hoặc tên event lạ đều bị loại ở runtime.

- [ ] Viết test RED cho payload mới: identity hợp lệ được gửi; raw `albumId`, token, email, filename và extra properties bị loại; count âm/NaN bị loại; album event thiếu identity bị bỏ qua; global event vẫn hợp lệ. Đổi builder trả `null` cho payload không hợp lệ và cập nhật sender kiểm tra null.
- [ ] Test bucket tại 0/1/20/21/50/51/100/101/300/301; error 403/409/429/network/timeout/unknown không tiết lộ message.
- [ ] Test rejection HTTP 200 và no-op saved theo response contract ở mục 2; reject tên event/enum lạ và bảo toàn standalone file-match không có identity. Test mọi nhánh lỗi trong mapping HTTP đã chốt.
- [ ] Chạy `npm test -- tests/domain/analytics-model.test.ts tests/domain/analytics-contract.test.ts`, xác nhận RED đúng assertion mới.
- [ ] Mở rộng discriminated union và switch allowlist theo bảng P0; giữ event cũ không dual emit alias. Các field không thuộc event bị loại ở runtime, kể cả khi caller ép kiểu TypeScript.
- [ ] Chạy lại focused tests, cần PASS; commit riêng `feat: define Zeno analytics v2 event contract`.

### Task 2 — Backend identity và metadata nhất quán

**Files:** `server/analytics/identity.ts`, `server/albums/album.ts`, `server/albums/guest.ts`, `server/albums/access.ts`, `server/albums/workspace.ts`, `server/albums/selection.ts`, `app/lib/studio-album.ts`, `nuxt.config.ts`, `.env.example`.

**Interfaces:** `albumAnalyticsIdentity(albumId: string, secret: string): AnalyticsIdentity`. Metadata create/list/overview/workspace là additive `analytics?: AnalyticsIdentity`. Overview/workspace cung cấp `currentCycle`; finalize trả thêm `cycle` cùng `versionNumber` và `count` hiện có, lấy từ snapshot commit. Không dùng số ảnh dự tính ở UI làm count kết quả.

`createGuestAlbum` hiện đã trả `status` và `photoCount` nhưng kiểu `$fetch` ở create page chưa khai báo; cập nhật kiểu tiêu thụ các trường này. `publishAlbum` hiện chỉ trả `customerToken`; bổ sung identity và photoCount trong **cùng domain operation đã authorize** để publish từ mọi surface có cùng dữ liệu, không query lại từ client. `reopenManagedSelection` đã trả `{ cycle }`; client phải đọc giá trị đó để tạo `selection_reopened:<analyticsId>:<cycle>`.

Inject secret vào domain helper qua server-side metadata options, tránh đọc `useRuntimeConfig` bên trong pure HMAC helper hoặc trả toàn bộ runtime config ra API. Existing unit/database fixtures truyền test secret cố định; live credentials không nằm trong test code.

- [ ] Viết test RED trong mới `tests/domain/analytics-identity.test.ts`: ID ổn định cùng secret, khác album/secret thì khác ID, đúng định dạng `alb_[a-f0-9]{64}`, không lộ internal ID; secret rỗng bị từ chối rõ ràng ở helper.
- [ ] Mở rộng `tests/db/album.test.ts`, `guest-album.test.ts`, `gallery-access.test.ts`, `selection-flow.test.ts`: cùng album có cùng analytics ID ở Studio/guest sau claim và reissue token; album khác tenant vẫn bị chặn; finalize trả cycle/count/version đúng.
- [ ] Bổ sung cycle/changed cho **mọi return branch** của selection/note theo mục 2; test saved-changed, saved-no-op, conflict và limit_reached. Không thay quy tắc lựa chọn, version increment hoặc snapshot.
- [ ] Chạy focused tests, xác nhận RED; triển khai helper Node crypto và bổ sung metadata sau access checks trong domain hiện hữu. Secret chỉ truyền qua server config; thiếu secret không gọi helper, không phát raw ID.
- [ ] Giữ response token `no-store`, không thêm public endpoint lấy analytics ID. List album đã được authorize trả identity để chia sẻ cached link không cần request phụ.
- [ ] Chạy `npm test -- tests/domain/analytics-identity.test.ts tests/db/album.test.ts tests/db/guest-album.test.ts tests/db/gallery-access.test.ts tests/db/selection-flow.test.ts` và `npm run typecheck`; cần PASS. Commit `feat: expose authorized pseudonymous album metadata`.

### Task 3 — Sender context và dedup

**Files:** `app/lib/analytics-config.ts`, `app/lib/analytics-session.ts`, `app/lib/analytics-events.ts`, `app/plugins/analytics.client.ts`, `nuxt.config.ts`; tests config/model, mới `tests/domain/analytics-session.test.ts`, `tests/e2e/analytics.spec.ts`.

**Interfaces:** `trackAnalyticsEvent(event: AnalyticsEvent): void` giữ nguyên. `claimSessionEvent(key: string, storage?: Storage): boolean` trả true lần đầu; `releaseSessionEvent(key: string, storage?: Storage): void` giải phóng khi thao tác chuẩn bị gửi không thể hoàn thành. Storage injection cho unit test; khi storage bị browser chặn dùng Set trong bộ nhớ, không làm hỏng thao tác chính.

**Startup contract:** sender hiện chỉ được đăng ký trong hook `app:mounted`, còn trang có thể phát event từ mounted/watch trước đó. Đăng ký sender ngay khi client plugin setup; khi gate hợp lệ, buffer tối đa 50 payload đã validate kèm safe route context tại thời điểm phát, drain một lần sau safe gtag config. Bỏ event mới nếu buffer đầy; không ghi buffer vào storage, không gửi event của route cũ với title/context route mới. Gate tắt thì không buffer hoặc claim dedup. HMR/teardown phải giải đăng ký sender cũ để không drain hai lần.

**Delivery contract:** analytics validation/storage/queue lỗi được cô lập trong analytics boundary; `trackAnalyticsEvent` không throw tới UI. Có diagnostic mã cố định ở development/test, không log payload/raw exception; không biến lỗi analytics thành `album_creation_failed` hoặc `selection_finalize_failed`. Dedup claim chỉ commit khi payload đã được nhận vào queue; delivery qua mạng vẫn không được bảo đảm.

**Config contract:** thêm private `analyticsIdSecret`, public `analyticsEnvironment`, `analyticsAppVersion`; deployment override lần lượt `NUXT_ANALYTICS_ID_SECRET`, `NUXT_PUBLIC_ANALYTICS_ENVIRONMENT`, `NUXT_PUBLIC_ANALYTICS_APP_VERSION`. Build fallback environment từ `VERCEL_ENV` (`preview`→staging, `production`→production, `development`→development); không có môi trường được xác định thì mặc định development. Version lấy short `VERCEL_GIT_COMMIT_SHA`, local fallback `local`. Production preflight phải xác nhận version không phải local. Cùng context `environment/app_version/taxonomy_version` phải được gắn vào cả manual page_view và workflow event; không truyền album/actor vào global gtag config vì có thể rò sang route khác.

- [ ] RED tests deployment production/staging/development, Preview không bị gán production; common context không bị caller override; secret không xuất hiện ở public runtime config.
- [ ] RED startup tests direct-load `/create`, studio dialog mở sẵn và API mock trả ngay: event started không mất, buffer drain đúng thứ tự một lần; analytics validation/storage/gtag lỗi không ảnh hưởng success UI. Test không leak context khi route đổi trong lúc response cũ quay về.
- [ ] RED tests session key `started:<analyticsId>:<cycle>` giữ qua refresh cùng tab, không chặn album/cycle khác; reset session khi đóng tab. Không lấy participant token làm session key.
- [ ] Với success event, dedup bằng `event_id` trong sessionStorage chỉ khi queue gửi hợp lệ. Guard busy ngăn cùng hành động phát hai request; backend đã chốt không phát lại khi reload. Dedup app không thay thế dedup export hoặc backend.
- [ ] Chạy focused RED; triển khai context và sender, không thay vệ sinh page metadata. Gate tắt thì không đánh dấu event đã gửi.
- [ ] Chạy focused unit tests và `npm run test:e2e:analytics`; cần PASS cho page view manual, reload và gate hiện tại. Commit `feat: add analytics context and session deduplication`.

### Task 4 — Create, publish và share cho cả hai flow

**Files:** `app/pages/create.vue`, `app/components/studio/CreateAlbumDialog.vue`, `app/components/studio/AlbumShareActions.vue`, `app/pages/guest/albums/[albumId]/index.vue`, `app/pages/studio/index.vue`; tests `tests/e2e/analytics.spec.ts`, `tests/e2e/studio-album-share.spec.ts`.

**Files bổ sung:** `app/components/studio/AlbumCard.vue`, `app/components/studio/AlbumTable.vue`, `app/pages/studio/albums/[albumId]/index.vue`. Cập nhật cả inline types `created`, `$fetch` response và scoped-slot Workspace; không chỉ sửa `StudioAlbum` interface.

**Interfaces:** Dùng response metadata Task 2, contract Task 1 và dedup Task 3. Truyền analytics identity từ list/create vào ShareActions; không hash raw ID tại client. `entry_point=quick_create_page|studio_create_dialog`, không bịa CTA nguồn khi chưa có instrumentation.

- [ ] RED browser tests cho mở form, validation chặn request, create success/failure, double-click và refresh; một attempt tạo một submitted và đúng nhánh kết quả.
- [ ] RED tests Tạo nhanh phát created rồi published sau response hợp lệ PUBLISHED; Studio tạo nháp không phát published. Request tạo bao gồm nhập catalog Drive, duration chỉ đo request này.
- [ ] RED tests clipboard thất bại không có shared; copy cached link, lời nhắn và copy sau publish thành công có đúng một shared. Mở panel/cấp token/tạo QR/copy admin link không có shared.
- [ ] RED share tests cả mobile Card, desktop Table, create-success dialog, Studio detail slot, Tạo nhanh success và guest admin. Guest admin hiện bỏ response overview sau access: giữ metadata được authorize để copy không cần request phụ. Dùng tham số enum `kind=customer|admin` trong copy handler, không suy loại link bằng cách đưa URL/token vào analytics.
- [ ] Studio dashboard event chỉ một lần sau `albumsLoaded` thành công cho studio đang chọn, bao gồm empty state; `loadAlbums` sau create/publish hoặc filter/sort không phát lại. Đổi studio mới reset guard cục bộ nhưng không gửi raw studio ID.
- [ ] Đặt tracking ngay tại nhánh kết quả có cấu trúc, thêm busy guard cho handler còn thiếu; tách lỗi request publish và lỗi clipboard. Publish vẫn thành công khi clipboard lỗi.
- [ ] Giữ activation ClipboardItem trong click hiện tại để không phá Safari; không chèn await lấy identity trước thao tác clipboard.
- [ ] Ở publish-and-copy, khởi động clipboard đúng click nhưng chỉ phát shared sau khi đã ghi nhận published và xác nhận clipboard thành công. Chọn đúng một owner phát event cho mỗi thao tác: wrapper publish xử lý kết quả copy thay vì đồng thời phát ở cả helper copy và wrapper. Copy độc lập/cached link vẫn phát ở một nhánh riêng, không bị chờ publish mới.
- [ ] Chạy `npm run test:e2e:analytics` và `npm run test:e2e -- --project=chromium tests/e2e/studio-album-share.spec.ts`; cần PASS. Commit `feat: track album activation and successful sharing`.

### Task 5 — Guest autosave và mốc chốt snapshot

**Files:** `app/pages/album/[albumId].vue`, `app/components/album/AlbumWorkspace.vue`; tests `tests/e2e/analytics.spec.ts`, `tests/db/selection-flow.test.ts`.

**Interfaces:** `currentCycle` từ overview/workspace; finalize result `{ versionNumber, count, cycle }`; `selection_finalized` dùng backend count và version để dựng event_id. `surface=studio|guest_admin` giữ tương thích.

- [ ] RED tests album_opened chỉ sau access + photos thành công và `nextTick` render, không phát khi tải lỗi. Empty state hợp lệ không bị nhầm thành lỗi thumbnail; không đợi mọi ảnh tải binary.
- [ ] RED tests lần save đầu thất bại không có started/selected; lần save thành công có started rồi selected/unselected; các lần sau và polling không phát started nữa. Refresh cùng session/cycle giữ dedup; reopen tạo cycle mới cho phép started mới.
- [ ] Với HTTP 200 `conflict/limit_reached`, phát rejected đúng outcome, không failed/started/selected. Với saved-no-op, không success event thay đổi. Với note, saved-no-op/conflict không có photo_note_saved. Test cycle đổi giữa request và response, selection queue vẫn giữ thứ tự và không cập nhật nhầm cycle.
- [ ] RED tests finalize success có submitted trước finalized, cùng attempt và count từ response; lỗi có failed, không finalized. Refresh trang đã chốt không phát finalized. Hai snapshot khác version không bị dedup nhầm.
- [ ] Triển khai instrumentation theo nhánh server-confirmed, không phát trên watcher nhận trạng thái từ polling; không thêm nút khách xác nhận và không đổi autosave.
- [ ] Chuẩn hóa lỗi selection/finalize không gửi nội dung ghi chú hoặc filename. Timeout ghi lỗi request, không đoán server rollback.
- [ ] Chạy `npm run test:e2e:analytics`, `npm test -- tests/db/selection-flow.test.ts` và `npm run typecheck`; cần PASS. Commit `feat: track customer selection and snapshot finalization`.

### Task 5A — Bảo toàn event lọc file và hai kênh analytics

**Files:** `app/composables/useLocalPhotoFilter.ts`, `app/components/album/AlbumLocalFilter.vue`, `app/pages/studio/albums/[albumId]/filter.vue`, `app/pages/guest/albums/[albumId]/filter.vue`, `app/pages/tools/file-filter.vue`; hai route filter-manifest ở mục 4. Tests `tests/e2e/analytics.spec.ts`, `tests/e2e/album-local-filter.spec.ts`, `tests/e2e/file-filter.spec.ts`, `tests/e2e/studio-analytics.spec.ts`, `tests/db/studio-analytics.test.ts`.

**Interfaces:** `FilterManifest` thêm `analytics?: AnalyticsIdentity`, `cycle: number`, giữ `versionNumber` của snapshot được yêu cầu. `getManagedSelectionResults` trả thêm cycle của **snapshot**, không lấy current_cycle hiện tại; hai manifest routes map metadata sau kết quả đã authorize. `file_match_completed` input album có `context=album`, analytics, `version_number`, cycle và ba count; standalone có `context=standalone` và ba count.

- [ ] RED tests deep link filter của Studio/guest admin nhận đúng identity và version/cycle của snapshot cũ kể cả khi album đã mở vòng mới; không dùng raw manifest.albumId làm GA4 album_id.
- [ ] RED tests scan thực sự hoàn tất mới có file_match_completed; scan bị hủy/lỗi không success. Rescan chủ động là hành động mới, không dedup toàn bộ theo album/version khiến mất lần chạy.
- [ ] Bổ sung identity qua manifest → AlbumLocalFilter → useLocalPhotoFilter; giữ công cụ standalone hoạt động và event không có album. Không gửi source/destination path, file handles hoặc tên file.
- [ ] Regression tests ma trận hai gate: GA4 tắt/backend counter bật vẫn ghi reportGalleryOpen/reportMatch; GA4 bật/backend counter tắt vẫn phát GA4. Lỗi reportMatch không biến scan thành thất bại; GA4 dedup không đổi chính sách đếm backend hiện có.
- [ ] Chạy `npm run test:e2e:analytics`, `npm run test:e2e -- --project=chromium tests/e2e/album-local-filter.spec.ts tests/e2e/file-filter.spec.ts tests/e2e/studio-analytics.spec.ts`, `npm test -- tests/db/studio-analytics.test.ts`; cần PASS. Commit `feat: preserve album filter tracking and backend counters`.

### Task 6 — Báo cáo và hướng dẫn GA4

**Files:** `server/analytics/ga4-report.ts`, `app/pages/admin/analytics.vue`, `tests/domain/ga4-report.test.ts`, `tests/e2e/admin-analytics.spec.ts`, mới `docs/analytics-event-tracking.md`.

**Interfaces:** Giữ `SiteReport` hiện có; bổ sung event names/labels. Report event count tiếp tục đọc tên cũ; không filter mất lịch sử của mười event đang dùng. Các phân tích v2 riêng filter taxonomy/environment.

- [ ] RED report tests trả đủ event mới và vẫn nhận event cũ, 0 là hợp lệ khi chưa có dữ liệu; cập nhật labels và fixtures. Không gọi bảng đếm event hiện tại là conversion theo album.
- [ ] Mở rộng allowlist report; giữ auth admin và xử lý upstream error hiện có.
- [ ] GA4 report hiện query totals/daily/paths/events riêng và chưa có environment filter. Áp `environment=production` cho cả bốn query; test gộp filter environment với eventName hiện hữu thay vì ghi đè nhau. Chấp nhận rõ ranh giới rollout: lịch sử chưa có environment không nằm trong báo cáo production-filtered. Không đổi tên/số đếm lịch sử bằng cách suy environment cho dữ liệu cũ; labels ghi thay đổi coverage. `SiteReport` giữ shape hiện tại.
- [ ] Viết taxonomy và KPI vào docs; ghi ngày release, không ghép dữ liệu thiếu album identity trước release với funnel v2 như cùng độ phủ.
- [ ] Checklist cấu hình thủ công: custom dimensions low-cardinality `environment`, `taxonomy_version`, `creation_flow`, `actor_type`, `screen_name`, `entry_point`, `source_method`, `share_method`, `share_content`, `share_channel`, `photo_count_bucket`, `error_code`, `error_category`, `outcome`, `context`, `surface`; không đăng ký ID làm dimension.
- [ ] Key events chỉ gồm created, published, shared, finalized. Xác nhận Enhanced Measurement vẫn tắt; cấu hình loại internal/developer traffic dựa vào dữ liệu filter đã được kiểm tra, không loại theo actor studio vì studio là khách hàng thật.
- [ ] Tạo funnel Studio, Tạo nhanh, Guest theo mục 3; ghi rõ GA4 user funnels không nối hai người khác nhau thành album funnel.
- [ ] Không lọc creation_flow ở cấp toàn bộ Studio funnel vì studio_home_viewed không có field này; áp theo step có field hoặc actor context phù hợp. Cấu hình cần lưu ảnh/chứng cứ cho từng step, windows và production filter. Giữ counting method của key events được ghi rõ; không dùng key-event count thay distinct album KPI.
- [ ] Chạy `npm test -- tests/domain/ga4-report.test.ts` và `npm run test:e2e -- --project=chromium tests/e2e/admin-analytics.spec.ts`; cần PASS. Commit `feat: align analytics reporting with Zeno event taxonomy`.

### Task 7 — QA, release checklist và theo dõi dữ liệu

**Files:** `tests/e2e/analytics.spec.ts`, `playwright.analytics.config.ts`, `docs/analytics-event-tracking.md`, `docs/vercel-deployment.md`, `docs/implementation-progress.md`.

- [ ] Mở rộng QA theo ma trận dưới; intercept gtag.js/collect trong test, dùng ID test trong config. Không dùng property Production để gửi dữ liệu tự động.
- [ ] Kiểm tra payload cuối cùng, gồm config/page metadata và event: không chứa token, tên album/file, ghi chú, email, raw URL/ID hoặc exception message; quét cả referrer khi đi giữa private routes.
- [ ] Chạy `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e:analytics` và các browser suites liên quan Tasks 4/6. Ghi kết quả thực tế, không đánh dấu pass khi chỉ viết test.
- [ ] Trên Preview/QA cấu hình test measurement ID và secret riêng; dùng Tag Assistant/DebugView chứng minh thứ tự, identity, error branch và page view. Local mock pass không thay thế kiểm nhận dữ liệu GA4.
- [ ] Trước release, kiểm tra production secret và deployment context; lưu evidence cấu hình/key events/filter. Deploy chỉ khi người dùng yêu cầu triển khai.
- [ ] Thêm script không ghi dữ liệu `scripts/check-analytics-config.mjs`: chỉ báo tên cấu hình thiếu/sai và exit nonzero khi GA4 bật nhưng secret/environment/version/measurement ID không hợp lệ; không log giá trị secret. Unit tests dùng env giả lập, không gọi Neon/Google. Chạy script trong preflight Production; không tự đổi các flag hiện có. Test gate tắt không yêu cầu secret.
- [ ] Test cả default-disabled bằng `npm run test:e2e -- --project=chromium tests/e2e/analytics.spec.ts` lẫn enabled isolated server bằng `npm run test:e2e:analytics`; một lệnh không bao phủ hai chế độ vì suite hiện skip theo config file.
- [ ] Kiểm tra in-app gate iOS/Android: lúc đang yêu cầu mở Safari/Chrome và chưa redeem token/enter gallery thì không có album_opened/started/backend gallery open; sau continue/open ngoài browser chỉ ghi sau gallery-ready. Không đổi hành vi gate để phục vụ analytics.
- [ ] Theo dõi 1–2 tuần: event thiếu identity/context, duplicate event_id, tỷ lệ request error, chuỗi sai thứ tự, chênh lệch GA4 với DB và độ phủ hai flow. Phân biệt ad blocker/mất mạng với lỗi instrumentation; không đặt ngưỡng sai lệch tùy ý trước baseline.
- [ ] Cập nhật progress chỉ theo trạng thái đã xác minh. Commit `docs: record analytics QA and release checklist`.

## 6. QA acceptance matrix

| ID | Tình huống | Kết quả bắt buộc |
|---|---|---|
| QA-01 | Studio create thành công | Một created có identity; chưa có published. |
| QA-02 | Create lỗi/Drive lỗi | submitted + failed; không created/published. |
| QA-03 | Double-click create/finalize | Một request đang chạy; một success cho kết quả đó. |
| QA-04 | Tạo nhanh thành công | created → published, cùng album_id; không upload event. |
| QA-05 | Publish success, clipboard lỗi | Có published, không shared. |
| QA-06 | Guest open success/failure | Open sau render thành công; lỗi không có open. |
| QA-07 | Chọn nhiều ảnh/refresh | Started một lần mỗi tab session/album/cycle; không lặp do polling/refresh. |
| QA-08 | Finalize success | submitted → finalized; backend count/cycle/version đúng. |
| QA-09 | Save/finalize lỗi | Chỉ đúng failure event; không success tương ứng. |
| QA-10 | Reload kết quả/reopen | Reload không success lặp; vòng mới tạo một conversion mới khi chốt thành công. |
| QA-11 | SPA navigation/query/hash | Một page_view mỗi path navigation thành công; query/hash không tạo view thêm. |
| QA-12 | Development/Preview | Gate mặc định tắt; khi bật QA thì environment đúng, gửi property test. |
| QA-13 | Privacy payload | Không PII/secret/raw identifier ở event, config hoặc referrer. |
| QA-14 | Claim/cấp lại link | analytics ID giữ nguyên; RLS và token access giữ hiệu lực đúng. |
| QA-15 | Copy guest/admin/QR | Chỉ copy thành công link khách/lời nhắn tính shared; không suy kênh đích. |
| QA-16 | Storage bị chặn | Workflow hoạt động; dedup trong bộ nhớ còn hiệu lực trong page lifetime. |
| QA-17 | Thiếu secret | Không raw-ID fallback; album events v2 không phát; pre-release check báo cấu hình thiếu. |
| QA-18 | Lịch sử reporting | Mười tên event cũ vẫn có trong báo cáo; v2 có ranh giới thời gian rõ. |
| QA-19 | HTTP 200 conflict/limit_reached | Một rejected có outcome đúng; không có started/selected/failed kỹ thuật. |
| QA-20 | Saved no-op cho selection/note | Không có event thay đổi thành công; version không bị tăng vì tracking. |
| QA-21 | Direct-load trước sender ready | Started không mất; buffer chỉ drain một lần với đúng context ban đầu. |
| QA-22 | Analytics throw hoặc storage lỗi | UI nghiệp vụ vẫn success; không phát failure nghiệp vụ giả. |
| QA-23 | Snapshot cũ ở trang Filter | Identity/version/cycle theo snapshot đã authorize, không theo vòng hiện tại. |
| QA-24 | Hai gate GA4/backend độc lập | Tắt một kênh không làm mất hoặc nhân đôi số đếm kênh kia. |
| QA-25 | Report production filter | Bốn query có filter đúng; eventName filter không bị ghi đè; lịch sử thiếu environment được ghi rõ. |
| QA-26 | In-app browser chưa vào gallery | Không có open/started hoặc backend open trước khi gallery-ready. |
| QA-27 | Response cũ về sau route/cycle đổi | Event dùng request context gốc và backend cycle; không ghi đè UI ngữ cảnh mới. |

## 7. P1 sau P0 và điều kiện mở rộng

- **BigQuery export + album funnel:** thực hiện thành task vận hành riêng sau khi xác nhận project/dataset, quyền và ngân sách. Không giả định đã bật export. Tạo query trên schema export thực tế, extract `event_params`, dedup event_id và cohort theo timestamp; tránh join nhiều-nhiều giữa các lần share/open. Khi chưa có export, không tuyên bố end-to-end GA4 theo album đã nghiệm thu. Backend vẫn cung cấp số snapshot chuẩn.
- **Errors tải gallery/link:** bổ sung `album_load_failed` và `invalid_album_link` chỉ khi backend có mã lỗi có cấu trúc đủ phân biệt expired/invalid/permission; thiếu quyền chưa được cấp identity thì không gửi raw ID thay thế.
- **Review/resume, filter/sort:** đo đúng affordance hiện có, dùng enum/bucket; không gửi từ khóa tìm kiếm tự do và không tạo màn hình chỉ để khớp PDF.
- **Download:** phân biệt request download, dữ liệu chuẩn bị xong, browser share thành công và lưu vào thiết bị. Chỉ thêm tên event mà ứng dụng có thể xác nhận; không dùng share resolve làm bằng chứng đã lưu Photos.
- **Local file copy:** có thể đo copy completed/partial/failed từ kết quả job thực tế; không gửi path/filename.
- **Direct upload:** chỉ bổ sung nhóm upload khi sản phẩm thật sự có tính năng upload.
- **Business delivery đáng tin cậy hơn browser:** nếu cần bảo đảm capture khi mất response, thiết kế outbox/server emission riêng và quyết định single source mỗi event; không thêm server+client dual emit trong plan P0.

## 8. Definition of Done và thứ tự

P0 code hoàn tất khi Tasks 1–6 và automated QA Task 7 PASS; P0 production hoàn tất chỉ sau release + evidence DebugView/Tag Assistant + cấu hình GA4 được xác minh. **End-to-end theo album là deliverable P1**, chưa hoàn tất nếu chưa có export và query được nghiệm thu.

Thứ tự phụ thuộc: 1 → 2 → 3 → 4 → 5 → 5A → 6 → 7. Tasks 1–6 bao gồm Task 5A. Ước lượng sau source audit: 6–9 ngày công gồm code, regression hai kênh analytics, kiểm thử và QA; cấu hình ngoài repo phụ thuộc quyền truy cập. Theo dõi sau release 1–2 tuần. Ước lượng chưa phải cam kết lịch.

Rollback: tắt GA4 bằng gate hiện có nếu payload vi phạm privacy; chỉnh lại instrumentation rồi QA trước khi bật. Không rollback snapshot hoặc dữ liệu album vì lỗi tracking. Chỉ hoàn nguyên cấu hình mới khi không ảnh hưởng policy/runtime hiện hữu.

## 9. Tài liệu kỹ thuật đã kiểm tra

- Google Analytics: [Custom dimensions and metrics](https://support.google.com/analytics/answer/14240153), [About the (other) row](https://support.google.com/analytics/answer/13331684). Tránh dimension chứa unique ID không cần thiết; giữ ID ở event parameters cho export.
- Tài liệu GA4 được tra qua Context7 ngày 10/11/2026. Khi thực hiện thao tác GA4 UI hoặc thay API, kiểm tra lại tên trường và quyền trên property thực tế.

## 10. Source audit bổ sung ngày 10/11/2026

Đây là kết quả đối chiếu code, không phải xác nhận những lỗi đã được sửa. Những thay đổi cần làm đã được đưa vào task tương ứng.

| Source hiện tại | Thiếu/rủi ro của plan trước audit | Bổ sung |
|---|---|---|
| `server/albums/selection.ts:setPhotoSelection` | HTTP 200 conflict/limit_reached và saved-no-op chưa được phân biệt | changed/cycle response, rejected event, QA-19/20. |
| `server/albums/selection.ts:savePhotoNote` | Event note có thể đếm thao tác không đổi nội dung | changed flag và regression no-op/conflict. |
| `app/lib/analytics-events.ts`, `app/plugins/analytics.client.ts` | Sender chưa sẵn sàng thì event bị bỏ; analytics exception có thể lọt vào catch nghiệp vụ | Startup buffer có giới hạn, no-throw boundary, QA-21/22. |
| `AlbumCard.vue`, `AlbumTable.vue`, Studio detail slot | Identity chưa có đường truyền tới mọi ShareActions | Bổ sung file/props và browser coverage Task 4. |
| `createGuestAlbum`, `publishAlbum`, `reopenManagedSelection` | Kiểu client bỏ qua status/photoCount/cycle hoặc publish chưa trả metadata | Chốt response contract Task 2 và consumer Task 4/5. |
| Hai filter-manifest routes và `useLocalPhotoFilter.ts` | Plan chưa sửa nguồn phát file-match nên identity mới có thể làm mất event cũ | Task 5A và snapshot-specific metadata. |
| `reportGalleryOpen`, `reportMatch`, `studio-report.ts` | GA4 không phải toàn bộ hệ thống analytics; còn bộ đếm DB độc lập | Ma trận hai gate và phân biệt distinct album/lần chốt. |
| `ga4-report.ts:fetchGa4SiteReport` | Mới yêu cầu filter ở Exploration, chưa xử lý admin report | Filter cả bốn query và ghi rõ ranh giới coverage lịch sử. |
| `analytics.spec.ts`, `playwright.analytics.config.ts` | Config enabled và default-disabled kiểm thử hai nhánh khác nhau | Chạy cả hai, intercept Google requests, test IDs không phải Production. |
| `studioApi`, `StudioOperationError` | Chưa có structured domain code cho mọi lỗi | Mapping status chính xác, không parse statusMessage. |
| Gallery `startInAppGate`, selection queue/polling | Open có thể bị đếm trước enter hoặc response stale gắn nhầm cycle | QA gate, snapshot request context và cycle response. |
| `studio-report.ts`, retention/expiry | Rolling 7 ngày không phải tuần lịch; xóa metadata có thể mất lịch sử distinct | Chốt giới hạn KPI/retention, không hứa global North Star mới ở P0. |
