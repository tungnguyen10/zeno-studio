# Thiết kế trang thống kê GA4 và studio

Ngày: 2026-10-27
Trạng thái: đã duyệt thiết kế, chờ chủ dự án xem lại spec viết ra

## Mục tiêu và phạm vi

Triển khai trong cùng một đợt hai trang thống kê có quyền truy cập khác nhau:

- `/admin/analytics` cho quản trị viên nền tảng xem dữ liệu toàn Zeno Studio từ GA4 property đang nhận web stream `G-2GD5P03B7S`.
- `/studio/analytics?studio=<studioId>` cho **chủ studio** xem tiến độ workflow của studio và lượt mở gallery khi khách đã đồng ý phân tích.

Đây là hai nguồn dữ liệu có ý nghĩa khác nhau. GA4 chỉ chứa phiên đã đồng ý analytics và không có mã studio trong hợp đồng sự kiện hiện tại. Workflow studio phải lấy từ dữ liệu nghiệp vụ Neon để không mất thao tác của người từ chối GA4. Không suy ra tổng truy cập thực tế từ số liệu GA4. Tích hợp GA4 hiện tại, consent banner và mười sự kiện workflow tiếp tục hoạt động theo thiết kế đã phát hành.

## Cách tiếp cận đã chọn

1. **GA4 toàn site + Neon cho studio (chọn):** GA4 Data API phục vụ báo cáo toàn site; Neon phục vụ workflow và lượt mở gallery có consent theo studio.
2. **GA4 cho cả hai:** thêm chiều studio vào sự kiện; loại vì workflow sẽ chỉ phản ánh người đồng ý và không đáp ứng yêu cầu tổng đầy đủ.
3. **Neon workflow + GA4 cho lượt xem studio:** cần đổi hợp đồng sự kiện và đăng ký custom dimension; thêm phụ thuộc vào độ trễ và giới hạn báo cáo GA4 cho một chỉ số mà app có thể tổng hợp theo album.

Không tạo trang tự do truy vấn GA4 hoặc giao diện quản lý quyền quản trị nền tảng trong đợt này.

## Quyền truy cập và các đơn vị

| Đơn vị | Trách nhiệm | Phụ thuộc |
| --- | --- | --- |
| `platform_admins` | Bảng cấp quyền quản trị nền tảng theo Better Auth `user.id`; runtime chỉ đọc bản ghi của chính user trong context; không có API tự cấp quyền | Neon, Better Auth |
| Admin report API | Xác thực user đã verify và có quyền `platform_admin`, truy vấn GA4 Data API, cache và chuẩn hóa báo cáo | `platform_admins`, GA4 property |
| Studio report API | Xác thực chủ studio từ `studio_members`, đọc các số tổng hợp trong đúng `withDatabaseContext`/RLS | Neon studio/album data |
| Studio analytics writer | Tăng số đếm ngày sau mutation nghiệp vụ thành công; ghi lượt mở gallery có consent sau khi xác thực link album; nhận kết quả đối chiếu file chỉ gồm số đếm | Domain operations, album access, Neon |
| Hai trang Nuxt | Chọn khoảng ngày, hiện trạng thái tải/rỗng/lỗi, biểu đồ và bảng; không nhận Google credential | Report APIs |

Chủ studio không được xem báo cáo toàn site nếu không được cấp riêng `platform_admin`. Quản trị viên nền tảng không tự có quyền đọc dữ liệu chi tiết của studio nếu không là chủ studio. Đổi `studio` trên URL hoặc gọi API bằng ID khác phải trả 403. Cấp quyền quản trị đầu tiên bằng thao tác quản trị database có kiểm soát sau khi xác định `user.id` của tài khoản đã xác minh; không hardcode email/ID vào migration, repo hay client. Thu hồi quyền có hiệu lực ở request tiếp theo.

Admin report API dùng GA4 **numeric property ID**, không dùng Measurement ID thay thế. Bật Google Analytics Data API trong Google Cloud, cấp service account quyền Viewer trên property và `analytics.readonly`; credential chỉ ở server-side environment của Vercel. Trình duyệt không gọi Google Data API trực tiếp. Môi trường local/Preview dùng mock hoặc cấu hình test riêng; không dùng Production credential để chạy test.

## Báo cáo toàn site từ GA4

Người dùng chọn 7, 30 hoặc 90 ngày, tính cả ngày hiện tại. Trang có:

- Thẻ `activeUsers` và `screenPageViews` của toàn site.
- Xu hướng theo ngày cho hai chỉ số trên.
- Các route được xem nhiều nhất theo đường dẫn đã được app template/sanitize; không hiển thị URL thô có query hay token.
- Bảng `eventCount` cho đúng mười sự kiện workflow đã phát hành: `album_created`, `album_published`, `album_opened`, `gallery_view_changed`, `photo_selected`, `photo_unselected`, `photo_note_saved`, `selection_finalized`, `selection_reopened`, `file_match_completed`.

API giới hạn sẵn dimension, metric, event và khoảng ngày; client không gửi truy vấn GA4 tùy ý. Dùng `runReport` hoặc batch report thích hợp, cache server 15 phút theo khoảng ngày, hiển thị thời điểm lấy dữ liệu và múi giờ GA4 property. Dữ liệu ngày hiện tại có thể thay đổi khi Google tiếp tục xử lý. Khi credential thiếu, quyền bị từ chối, quota hết hoặc Google lỗi, API trả lỗi rõ và UI có retry; không biến lỗi thành số 0. Nếu có snapshot cache hợp lệ gần nhất, có thể hiển thị kèm nhãn dữ liệu cũ, không giả làm dữ liệu mới. Không tính tỷ lệ giữa số GA4 và tổng workflow Neon.

## Báo cáo theo studio từ Neon

Chỉ chủ studio xem được dữ liệu của studio đang chọn. Bộ lọc 7/30/90 ngày tính theo `Asia/Ho_Chi_Minh`; mỗi khối ghi rõ kỳ và thời điểm cập nhật. Các chỉ số bản đầu:

- Số album được tạo và được xuất bản trong kỳ; số album có ít nhất một bản chốt trong kỳ.
- Biểu đồ theo ngày cho lượt tạo, xuất bản và chốt. Biểu đồ chốt đếm lần chốt thành công; thẻ album đã chốt đếm album khác nhau, nên có thể khác tổng cột biểu đồ khi một album được chốt lại.
- Số lượt mở gallery **có consent** trong kỳ và xu hướng theo ngày. Đây là lượt mở trang hợp lệ, không phải người xem duy nhất, session, hay tổng khách truy cập. Từ chối và chặn analytics không được tính.
- Số lần hoàn tất đối chiếu file trên công cụ gắn với album, cùng tổng số file match/missing/ambiguous đã báo cáo. Chỉ nhận số nguyên không âm, giới hạn kích thước và không gửi tên file/đường dẫn.
- Bảng album hiện còn trong database: trạng thái, ngày tạo/xuất bản/chốt gần nhất, số ảnh trong bản chốt mới nhất, số ghi chú hiện có và lượt mở gallery có consent. Album đã bị dọn sẽ không xuất hiện ở bảng này.

Workflow counters phát sinh từ mutation server thành công, trong cùng transaction với thay đổi nghiệp vụ để tránh đếm thao tác lỗi hoặc retry trùng. Các chỉ số có thể suy ra từ row hiện có được backfill idempotent khi ra mắt; album đã xóa trước đó không thể hồi tố. `file_match_completed` chạy ở client nên server chỉ ghi sau khi nhận báo cáo từ công cụ theo album; UI ghi rõ đó là số liệu công cụ báo cáo, không phải bằng chứng copy file hoàn thành. Số liệu đối chiếu và lượt mở bắt đầu từ ngày triển khai bộ ghi nhận mới.

Bảng tổng hợp `studio_daily_metrics` mới lưu số đếm theo `(studio_id, day)` không chứa token, email, IP, tên khách hoặc tên file. Nó không phụ thuộc FK cascade của album, để biểu đồ 90 ngày vẫn giữ số tổng sau khi album hết hạn và metadata bị dọn. Giữ tối đa 120 ngày tổng hợp ngày; triển khai lịch dọn trên nhánh Neon Production cùng tính năng này (lịch hết hạn album hiện mới chạy trên nhánh dev). `album_daily_stats.views` lưu lượt mở theo album còn tồn tại để bảng album hiển thị. Server xác thực quyền truy cập album trước khi ghi lượt mở; client chỉ gửi tín hiệu sau khi gallery đã tải thành công và consent là `accepted`, đồng thời chặn phát trùng trên cùng lần vào trang. Mỗi lần vào trang hợp lệ có thể tạo một lượt; không triển khai định danh người xem hay suy đoán unique visitors. Giới hạn tần suất và validation tại endpoint giảm request giả hoặc lặp, nhưng chỉ số lượt mở không được coi là chỉ số chống gian lận tuyệt đối.

Thu hồi consent ngừng ghi lượt mở mới và dừng GA4 theo hành vi hiện tại. Các số đếm đã gộp không còn khóa định danh để xóa riêng một người; chính sách bảo mật bên ngoài cần giải thích điều này và mục đích thống kê studio. Workflow nghiệp vụ vẫn được tính khi người dùng từ chối analytics vì đó là trạng thái hoạt động của album, không phải event GA4.

## UI và trạng thái lỗi

Hai trang dùng `StudioHeader` và các primitive hiện có, mobile-first: thẻ số liệu gọn, biểu đồ đơn giản, bảng có phiên bản cuộn hoặc thẻ cho màn hình hẹp. Đường dẫn studio analytics chỉ hiện với `owner`; trang admin có điều hướng riêng cho `platform_admin`. Điều hướng ẩn không thay thế kiểm quyền server.

Loading, empty, error và stale-data phải phân biệt rõ. Mỗi chỉ số có đơn vị và diễn giải ngắn; các khối lượt xem gắn nhãn **chỉ tính người đã đồng ý**. Không hiển thị token hoặc URL thật trong biểu đồ, lỗi, log hay HTML. Không thêm biểu đồ realtime, export CSV, phân quyền quản trị qua UI, hoặc funnel tỷ lệ chuyển đổi trong bản đầu.

## Kiểm thử và phát hành

1. Unit/domain: chuẩn hóa GA4 response, khoảng ngày, timezone, số đếm, cache, dữ liệu rỗng và lỗi.
2. DB/RLS: quản trị viên nền tảng có/không có quyền; runtime không thể tự cấp quyền; owner đọc đúng studio; manager/member/retoucher và owner studio khác bị từ chối; thống kê ngày đúng sau transaction thành công, rollback hoặc retry.
3. HTTP/Chromium: hai trang 401/403/200 đúng vai trò; chọn 7/30/90 ngày; loading/empty/error; không lộ credential; lượt mở chỉ ghi sau consent và album access thành công, không ghi khi từ chối/thu hồi hoặc điều hướng lặp; file matching chỉ gửi số đếm.
4. Mock GA4 Data API cho CI; không dùng Production property trong test. Kiểm `npm run typecheck`, `npm test`, E2E Chromium liên quan và `npm run build`.
5. Trước khi bật trang admin Production: provision service account/property ID và cấp `platform_admin` cho tài khoản đã xác minh. Smoke bằng property thật, đối chiếu cùng khoảng ngày với GA4 UI, kiểm alias/role và cross-studio; công bố nội dung thống kê studio trong trang chính sách bên ngoài.

## Giới hạn và phụ thuộc ngoài repo

- GA4 bắt đầu nhận dữ liệu Production từ ngày bật consent-based GA4; chỉ người đã đồng ý được đo. GA4 Data API có độ trễ xử lý và quota; báo cáo không phải dữ liệu realtime.
- Dữ liệu workflow lịch sử chỉ backfill từ row còn tồn tại. Lượt mở gallery và kết quả đối chiếu file trước ngày triển khai không thể khôi phục từ GA4 theo từng studio.
- Trang chính sách bảo mật bên ngoài repo hiện do chủ dự án cập nhật. Nội dung cần bao gồm thống kê studio có consent trước khi thu thập lượt mở theo studio.
- Thiết lập Google Cloud/service account, quyền Viewer trên GA4 property và cấp platform admin đầu tiên là bước vận hành có quyền cao; không ghi credential vào Git hoặc tài liệu.

## Tài liệu tham khảo

- [Google Analytics Data API `runReport`](https://developers.google.com/analytics/devguides/reporting/data/v1/basics)
- [Google Analytics Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- [GA4 reporting data freshness](https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations)
- [GA4 integration design hiện tại](./2026-10-27-ga4-integration-design.md)
