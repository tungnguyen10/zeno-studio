# Zeno Studio — Photo Workflow Platform V1

Ứng dụng Nuxt 4 cho luồng tạo album, chọn ảnh và lọc file của studio. [Sơ đồ flow cốt lõi](docs/core-workflow.md) mô tả hai nhánh tạo album và đường đi đến folder đã lọc; [hướng dẫn sử dụng cho studio](docs/studio-user-guide.md), [đặc tả V1](docs/photo-workflow-platform-v1-spec.md) và [tiến độ](docs/implementation-progress.md) ghi chi tiết phạm vi và các gate còn mở.

## Chạy cục bộ

Yêu cầu Node.js 24 và npm. Tạo `.env` từ `.env.example`, sau đó:

```sh
npm ci
npm run dev
```

Các trang hiện có: `/` (giới thiệu), `/create` (tạo album nhanh không cần đăng nhập), `/guest/albums/:id` (quản trị album bằng link bí mật), `/studio` (tài khoản, danh sách và tạo album), `/studio/members`, `/studio/invite`, `/studio/albums/:id` (chốt bộ ảnh), `/studio/albums/:id/results` và `/guest/albums/:id/results` (xuất kết quả), `/studio/albums/:id/filter` và `/guest/albums/:id/filter` (lọc ảnh gốc từ snapshot đã chốt), `/album/:id?token=...` (gallery khách) và `/tools/file-filter` (lọc/copy file cục bộ độc lập). Công cụ lọc file dùng File System Access API; browser không hỗ trợ vẫn xem và xuất kết quả, đồng thời hiện hướng dẫn chuyển sang Chrome/Edge desktop.

Từ Results của studio, **Lọc ảnh gốc** mở đúng phiên bản đã chốt. Chọn thư mục RAW, xem file khớp/thiếu/mơ hồ rồi xác nhận copy. Mặc định ứng dụng chỉ tạo `RAW/SELECTED` lúc xác nhận; có thể nhập path con trong RAW (dấu `/` hoặc `\`) hoặc chọn thư mục khác bằng picker. Ảnh gốc không bị sửa, file đích đã có được bỏ qua, báo cáo `RETOUCH_NOTES.csv` và `SELECTION_REPORT.csv` được ghi trong đích. Nguồn chỉ đọc cần một đích khác có quyền ghi. Dữ liệu RAW và quyền truy cập thư mục ở trong browser, không tải file RAW lên server.

## Tạo và chia sẻ album

**Studio:** đăng nhập → tạo album nháp từ folder Drive công khai → kiểm tra và xuất bản → lấy link khách → có thể cấp thêm link khách trong danh sách studio. Khách mở link rồi chọn ảnh và ghi chú mà không cần tài khoản. Studio điều chỉnh bộ chọn, chốt snapshot, xuất kết quả và lọc RAW/JPEG ở trang album. Người giữ link quản trị album Tạo nhanh có cùng luồng chốt và lọc file.

**Tạo nhanh:** mở `/create`, nhập tên và folder Drive công khai, chọn hạn 15/30 ngày và giới hạn ảnh → hệ thống xuất bản ngay và trả hai link riêng: link khách và link quản trị bí mật. Link quản trị đổi token trong fragment lấy cookie HTTP only; người tạo có thể cấp lại link khách và quản lý vòng đời album. Hãy lưu link quản trị trước khi rời trang vì chưa có cách khôi phục khi mất. Tạo nhanh giới hạn 10 lần thử mỗi giờ theo IP. Người có tài khoản có thể nhận album vào studio mình sở hữu; link quản trị guest bị thu hồi, còn album, kết quả và link khách được giữ nguyên. Album hết hạn chỉ nhận vào studio trong 30 ngày giữ metadata và không tự xuất bản lại.

Trong danh sách album tại `/studio`, album đã xuất bản có nút **Sao chép link khách**. Nút cấp link khách mới, tự sao chép vào clipboard và hiển thị gọn dưới album để mở hoặc sao chép lại. Link khách đã gửi trước đó vẫn hợp lệ cho đến khi album hết hạn hoặc token bị thu hồi.

## Tải ảnh gốc trong gallery khách

Album mới và cũ mặc định **tắt tải ảnh**. Chủ studio/quản lý hoặc người giữ link quản trị Tạo nhanh có thể bật riêng tải một ảnh, tập ảnh khách chọn và toàn album; có thể yêu cầu chờ chốt vòng hiện tại. Khi mở vòng chọn mới, chế độ chờ chốt khóa lại cho tới lần chốt mới. “Tải ảnh đã chọn” lấy tim đã lưu khi album đang chọn, và bộ ảnh Studio đã chốt sau khi chốt. Giỏ tải tạm thời độc lập với tim và mất khi tải lại trang.

Khách mở Focus để tải một ảnh, hoặc mở **Tải xuống** trong Selection Island để lập kế hoạch tải nhiều ảnh. Mobile có bước chuẩn bị rồi bấm riêng để mở bảng lưu/chia sẻ khi trình duyệt hỗ trợ; web không thể xác nhận ảnh đã được lưu vào Photos. Desktop tải từng ZIP đánh số theo cú bấm của khách. Một ảnh lớn hơn giới hạn ZIP dùng đường tải file trực tiếp. Hiện mỗi ZIP tối đa 50 ảnh/96 MiB, mobile share tối đa 12 ảnh/48 MiB; các vé tải có hạn 10 phút và request tải bị giới hạn theo IP/album. Nguồn là binary Drive hiện tại, không phải thumbnail; ZENO không lưu bản sao bền vững. Quyền ZENO không khóa được link Drive đã đặt công khai.

## Neon

1. Tạo project/branch Neon cho development và một branch hoặc database **riêng** cho integration test. Không dùng production cho `test:neon`.
2. Tạo database login role cho ứng dụng bằng SQL với `LOGIN NOBYPASSRLS NOCREATEROLE`, khác với role owner dùng migration. **Không dùng `neon roles create` trực tiếp cho runtime role:** role tạo từ CLI trên project này mặc định có `BYPASSRLS` và `CREATEROLE`. Điền URL pooled của role ứng dụng vào `NUXT_DATABASE_URL`, URL direct của role owner vào `NUXT_DATABASE_DIRECT_URL`.
3. Chạy `npm run db:migrate`. Lệnh tạo schema, role `app_runtime`, RLS và cấp role đó cho login role trong URL ứng dụng. Migration lưu SHA-256 checksum và báo lỗi nếu nội dung một file đã chạy bị thay đổi.
4. Điền URL tương ứng của branch test vào `NUXT_DATABASE_TEST_URL` (pooled) và `NUXT_DATABASE_TEST_DIRECT_URL` (direct), rồi chạy `npm run test:neon` và `npm run test:album-neon`. Các script tạo/xóa fixtures và kiểm tra pooled concurrency, chọn ảnh, ghi chú và snapshot. Bản script cũ đã chạy trên nhánh `codex-v1-dev` ngày 2026-10-14; cần chạy lại bản hiện tại trên test branch.

Nitro chỉ dùng URL pooled. Migration chỉ dùng URL direct. Browser không nhận URL database. Các truy vấn tenant phải đi qua `withDatabaseContext`, đặt `app.studio_id`, `app.user_id`, `app.album_id`, `app.participant_id` và `app.scope` trong **cùng transaction** với truy vấn. RLS kiểm tra user có thuộc studio trước khi chấp nhận `studio_id`; API xác thực session hoặc token trước khi đặt context.

## Better Auth và email

Điền `NUXT_BETTER_AUTH_SECRET` (secret dài, ngẫu nhiên), `NUXT_BETTER_AUTH_URL` (origin của app), `NUXT_SMTP_URL` và `NUXT_MAIL_FROM`. Better Auth quản lý session studio, xác minh email và đặt lại mật khẩu. `npm run test:auth-neon` đã kiểm tra đăng ký, xác minh, đăng nhập và reset mật khẩu trên Neon dev bằng mail transport trong bộ nhớ. Chưa kiểm thử gửi email thật qua SMTP.

Chủ studio hoặc quản lý có thể tạo lời mời theo email; link được trả về một lần để copy. Token chỉ lưu dạng hash, có hạn 7 ngày, dùng một lần và có thể thu hồi. Người nhận cần đăng nhập bằng email đã xác minh đúng với lời mời. Chỉ chủ studio đổi vai trò hoặc thu hồi thành viên; không thể đổi hay thu hồi chủ studio. `npm run test:studio-http` chạy luồng HTTP thật trên build Nitro với Better Auth và Neon test branch; yêu cầu build trước.

## Google Drive

`GoogleDriveAdapter` dùng Google Drive API để liệt kê ảnh, phân trang và đọc nội dung ảnh. V1 chỉ nhận folder đặt quyền **“Bất kỳ ai có đường liên kết”**. Tạo **API key** trong Google Cloud project đã bật Google Drive API, giới hạn key cho Drive API và đặt ở `NUXT_GOOGLE_API_KEY`. OAuth Client ID dùng cho đăng nhập Google (`...apps.googleusercontent.com`) không phải API key. Giữ key ở server; không đưa vào repo hay browser.

Gallery lấy thumbnail đúng cỡ trực tiếp từ Drive; khi lỗi, gallery khách chuyển sang proxy có kiểm tra quyền của Zeno rồi mới thử ảnh gốc. Studio đăng nhập cũng dùng proxy thumbnail hiện có khi Drive lỗi. Focus tải bản Drive đủ nét cho kích thước màn hình và chỉ thử ảnh gốc qua proxy khi cần. URL thumbnail ngắn hạn được làm mới ở server; response proxy chỉ dùng cache riêng tư. Album Tạo nhanh vẫn hiện lỗi rõ ràng nếu thumbnail trực tiếp không tải được vì hiện chưa có endpoint ảnh dành cho link quản trị. Việc tối ưu tốc độ cần được đo lại với album Drive thật trước khi coi đạt nghiệm thu.

Đặt `NUXT_DRIVE_SAMPLE_FOLDER_URL` tới folder công khai có ảnh (tối đa 10.000 ảnh), rồi chạy `npm run test:drive-live`. Lệnh kiểm đủ trang, ID trùng và tải mẫu ảnh đầu/giữa/cuối; nếu có ảnh mang resource key, lệnh tải thêm ảnh đó. Kết quả có `scaleVerified` (đã thử ít nhất 1.000 ảnh) và `resourceKeySampled`; hai mục chưa đạt được ghi rõ thay vì chặn folder nhỏ. Đầu ra không in API key, ID ảnh hay link folder.

Folder mẫu hiện tại trả 326 ảnh, một trang, không ảnh nào trả resource key. Ngày 2026-10-15, lệnh live đạt với 326 ảnh và 5 thumbnail mẫu tải được; HTTP tạo album → xuất bản → xem ảnh khách trên local và Vercel Preview đã đạt trước đó với 307 ảnh. `NUXT_DRIVE_VERIFIED=true` đã bật cho local và Preview; Production tiếp tục khóa. Khi có folder 1.000–3.000 ảnh và ảnh có resource key, chạy lại kiểm chứng trước khi coi hai mục đó là đạt. HTTP smoke script `npm run test:drive-http` và `npm run test:drive-preview-http` cần `NUXT_DATABASE_TEST_URL`, `NUXT_DATABASE_TEST_DIRECT_URL`, `NUXT_DRIVE_SAMPLE_FOLDER_URL`; script Preview cần thêm `NUXT_DRIVE_PREVIEW_DEPLOYMENT`. Đặt `NUXT_DRIVE_EXPECTED_PHOTO_COUNT` khi kiểm folder khác; mặc định hiện là 307.

Để đo tốc độ gallery Drive thật, đặt `ZENO_PERF_ALBUM_URL` thành link khách đầy đủ trong môi trường riêng rồi chạy `npm run measure:gallery` (có thể đặt `ZENO_PERF_RUNS=5`). Script chạy Chromium 5 lượt cold/warm trên mobile mạng mô phỏng và desktop, in median/p75 thời gian hiện ảnh đầu, hàng đầu, Focus, ảnh kế tiếp, số request và byte ảnh. Không in link hoặc token; không lưu báo cáo ra file. Chạy cùng album, máy và mạng trước/sau thay đổi để so sánh. Lệnh cần album còn hạn và quyền khách hợp lệ; hiện chưa có link khách thử nghiệm trong cấu hình môi trường nên chưa có số đo Drive thật cho toàn gallery.

Không cần tạo album để đo riêng đường truyền ảnh Drive: chạy `npm run measure:drive-images` với cùng API key và folder mẫu. Script mở 5 thumbnail và một ảnh Focus trong Chromium mới cho mỗi lượt; mobile mô phỏng độ trễ 150 ms và băng thông 1,6 Mbps. Nó in thời gian giải mã ảnh đầu/hàng ảnh/Focus, biến thể Drive được chọn, số request ảnh, lỗi và byte tải, không in ID hay URL. Đặt `ZENO_PERF_PRECONNECT=1` để thử kết nối sớm tới Drive trước khi gán URL ảnh. Kết quả này chỉ đo tải ảnh, không gồm API album và render gallery; Drive có thể có lượt chậm hoặc lỗi nên cần xem phân bố nhiều lượt.

Kiểm download với Drive thật: migrate **Neon test branch riêng** qua `db:migrate`, build Nitro, cấu hình `NUXT_DATABASE_TEST_URL`/`NUXT_DATABASE_TEST_DIRECT_URL`, `NUXT_BETTER_AUTH_SECRET`, `NUXT_DOWNLOAD_TICKET_SECRET` (ngẫu nhiên ít nhất 32 ký tự), `NUXT_GOOGLE_API_KEY` và `NUXT_DRIVE_SAMPLE_FOLDER_URL`, rồi chạy `npm run test:drive-download`. Script tạo/xóa album thử trên test branch, so SHA-256 file gốc và ZIP với Drive, kiểm mặc định tắt và thu hồi quyền; báo rõ fixture MIME/resource key còn thiếu. Không trỏ URL test vào branch dev/production. Để đo baseline đọc nguồn Drive trên folder thử, đặt `ZENO_DRIVE_DOWNLOAD_MEASURE=1` rồi chạy `npm run measure:drive-downloads`; mặc định tối đa 96 MiB dữ liệu tải trong một lượt (đổi bằng `ZENO_DOWNLOAD_MEASURE_MAX_BYTES`). Báo cáo này chỉ đo nguồn Drive và cách chia phần, chưa đo server/Vercel, 4G, LCP hay thiết bị thật. Xem [tiến độ](docs/implementation-progress.md) trước khi bật trên môi trường người dùng.

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

Project Vercel là `zenocorp/zeno-studio` (`prj_eq7G3KN4ClM2zsTG9uDHMqQTvy7T`). Repo xuất Nitro Build Output API với preset `vercel`; build và function runtime dùng Node.js 24. Chạy `NITRO_PRESET=vercel npm run build` để kiểm tra artifact trong `.vercel/output` (được bỏ qua bởi Git). Mã app từ commit `174ecd8` đã deploy lên [Production](https://studio.zenocorp.vn) ngày 2026-10-27; bản hiện tại bật GA4 sau đồng ý. Xem [checklist triển khai Vercel](docs/vercel-deployment.md) để biết các tính năng còn khóa và QA còn thiếu.

Job hết hạn chạy bằng Neon Function `expirealbums` và Neon schedule trigger `album-expiry` lúc **02:00 UTC** (09:00 Việt Nam) hằng ngày, cấu hình trong `neon.ts`; không có Vercel Cron. Chạy `npm run neon:build` trước `neon config plan` hoặc `neon config apply`. Job khóa album hết hạn và xóa metadata sau 30 ngày. Function và trigger đã deploy trên nhánh `codex-v1-dev`; đã quan sát trigger thật chạy và dọn fixture theo đúng hai mốc hết hạn. Lịch hằng ngày đã khôi phục; production chưa deploy. Better Auth, Neon pooled và luồng Drive 307 ảnh đã qua smoke test trên Vercel Preview; album lớn và resource key chưa kiểm. Quy trình backup/rollback chưa hoàn thành.

## Google Analytics 4

Tích hợp GA4 đã có trên `main` và đang bật ở Production: tag chỉ tải sau khi người dùng chọn **Đồng ý**. Từ chối được lưu và không gửi analytics; **Cài đặt phân tích** cho phép đổi lựa chọn, thu hồi sẽ reload để dừng tag. Page view và mười sự kiện workflow chỉ dùng đường dẫn/thuộc tính được allowlist, không gửi token, ID album, tên file, ghi chú hay email.

GA4 web stream đã tắt thu thập tự động và bật redaction. Smoke trên Production xác nhận không có request Google trước đồng ý; sau đồng ý, một `page_view` gửi tới đúng Measurement ID và Google trả HTTP 204. Trang [chính sách bảo mật](https://www.zenocorp.vn/privacy) bên ngoài vẫn là nội dung giữ chỗ; chủ dự án sẽ cập nhật. Các bước QA còn lại ở [checklist GA4](docs/vercel-deployment.md#google-analytics-4--chỉ-production). Tích hợp này độc lập với analytics nội bộ T48–T49 còn chưa làm.
