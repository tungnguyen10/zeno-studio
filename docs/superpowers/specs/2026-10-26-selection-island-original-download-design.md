# Tải ảnh gốc từ Selection Island

**Trạng thái:** Người dùng đã duyệt spec ngày 26/10/2026; chuyển sang lập kế hoạch triển khai.

## Mục tiêu và phạm vi

Khách tải một ảnh, một tập ảnh tự chọn, bộ ảnh đã chọn/chốt, hoặc toàn album khi Studio cho phép. Download nằm trong Selection Island hiện có và Focus Viewer. Trên mobile, ưu tiên mở bảng lưu/chia sẻ ảnh của hệ điều hành khi browser hỗ trợ; trên desktop, một ảnh tải thành file, nhiều ảnh tải thành ZIP. Tính năng bao gồm P1 tải đơn, P2 tải nhiều ảnh và P3 quyền tải theo album, nhưng sẽ được triển khai và kiểm thử theo các lát phụ thuộc: nền tảng quyền/nguồn file, tải đơn, UI quản trị, rồi tải nhiều ảnh.

Mọi đường download lấy **binary gốc hiện tại trên Google Drive**. Thumbnail, URL ảnh đã resize và endpoint preview không phải nguồn download. ZIP chỉ đóng gói file, không resize, chuyển định dạng, xóa EXIF hay tái mã hóa. Nếu Drive chỉ có JPEG thì JPEG đó là file gốc; không suy ra RAW. ZENO không lưu bản sao ảnh bền vững trong database, object storage hay ổ đĩa server. Quyền tải trong ZENO không ngăn được truy cập trực tiếp vào một folder Drive đang chia sẻ công khai.

Không thay đổi dữ liệu tim, ghi chú, giới hạn chọn, thao tác chốt, snapshot bất biến hay công cụ Local File Filter. Không thêm trạng thái album mới, dịch vụ lưu ảnh mới hoặc UI tải riêng cho Studio trong phạm vi này. Cờ tải dành cho link khách; quyền và luồng quản trị Studio/guest admin hoạt động độc lập.

## Hiện trạng liên quan

- Gallery khách ở `app/pages/album/[albumId].vue` giữ danh sách tim, Focus Viewer và thanh chọn ảnh cố định ở đáy. Thanh hiện chỉ xuất hiện khi được chọn ảnh trong album `PUBLISHED`; sau khi chốt cần hiển thị lại khu vực thao tác tải với nhãn phản ánh bộ đã chốt.
- `server/photo-sources/google-drive.ts` đã có `readPhoto` qua Drive `files.get?alt=media`, nhưng endpoint `/image` phục vụ hiển thị, có fallback thumbnail/cache và chưa có hợp đồng filename, download disposition hay chính sách tải.
- `album_settings` là bảng cấu hình hiện có; `photos` ánh xạ photo ID nội bộ sang Drive file ID, filename, MIME và resource key. Catalog chưa lưu kích thước file. Access token, `withDatabaseContext` và RLS đã có; guest admin và studio member đi theo hai nhánh xác thực khác nhau.
- Studio có thể chỉnh bộ ảnh trước khi chốt; vì vậy danh sách tim đang làm việc và `selection_version_items` có thể khác nhau. Mở vòng mới đưa album về `PUBLISHED` và tăng `current_cycle`.

## Quy tắc quyền và dữ liệu

Mở rộng `album_settings` bằng các cột typed, cùng ràng buộc và default an toàn:

| Trường | Default | Ý nghĩa |
| --- | --- | --- |
| `download_enabled` | `false` | Công tắc tổng, áp dụng cho album cũ và mới. |
| `download_allow_single` | `true` | Hiện thao tác tải trực tiếp tại Focus Viewer khi công tắc tổng bật. |
| `download_allow_selected` | `true` | Cho tạo/tải basket hoặc bộ ảnh đã chọn/chốt. Basket có thể gồm một ảnh. |
| `download_allow_all` | `false` | Cho thao tác một lần để lập kế hoạch tải toàn album và nút “Chọn tất cả”. |
| `download_available_when` | `anytime` | `anytime` hoặc `after_finalize`. |

`allowSingle` điều khiển thao tác tải trực tiếp từ Focus; `allowSelected` cho tải tập con bất kỳ, kể cả tập có đúng một ảnh. `allowAll` cho thao tác toàn album mà không cần khách tự chọn từng ảnh. Đây là các capability sản phẩm, không phải cam kết ngăn khách tự chọn hết ảnh khi `allowSelected` bật hoặc ngăn truy cập trực tiếp tới Drive công khai.

`after_finalize` chỉ mở khi **vòng hiện tại** có snapshot đã chốt và album không ở trạng thái mở vòng chọn. Một snapshot từ vòng trước không mở khóa vòng mới. Với `anytime`, mục “Tải ảnh đang chọn” đọc danh sách tim live của vòng `PUBLISHED`; sau khi Studio chốt, mục đó đổi nhãn thành “Tải bộ ảnh đã chốt” và lấy `selection_version_items` của vòng hiện tại. Basket tự chọn luôn tách biệt và chỉ tồn tại trong phiên trang hiện tại. Đóng sheet giữ basket; “Hủy chọn ảnh tải” xóa basket; refresh xóa basket và UI nói rõ tính tạm thời của nó. “Dừng tải” chỉ hủy request đang chạy và giữ basket để thử lại.

Capability trả về cùng dữ liệu access/overview hiện có, gồm quyền thao tác và lý do khóa như `waiting_for_finalize`, không trả token quản trị hoặc cấu hình không cần thiết. UI có thể ẩn thao tác bị tắt và giải thích thao tác đang chờ chốt. Server kiểm lại toàn bộ chính sách ở mỗi request file/ZIP. Quyền bị tắt hoặc token bị thu hồi khi khách đang chọn dẫn tới lỗi 403 rõ ràng, dừng tiến trình và xóa basket/ticket không còn hợp lệ.

Studio owner/manager có `album.settings` và guest admin token của đúng album được sửa cờ tải. Member/retoucher không được sửa. Cập nhật settings và ghi `audit_logs` nằm trong cùng transaction, dùng tenant context/RLS tương ứng. Thay đổi có hiệu lực với request mới, không cần deploy; bytes đã giao cho thiết bị trước khi thu hồi không thể lấy lại.

## Các đơn vị và hợp đồng

1. **Download policy trong `server/albums/`:** nhận principal đã xác thực, album, loại thao tác (`single`, `selected`, `all`) và vòng hiện tại; trả capability hoặc lỗi HTTP. Đây là nơi duy nhất diễn giải settings và thời điểm chốt. Pure rule có thể đặt trong `shared/domain/` để kiểm thử độc lập; truy vấn và transaction ở server.
2. **Original file trong `server/photo-sources/`:** adapter trả metadata Drive hiện tại (`name`, MIME, byte length, checksum nếu có, khả năng tải nếu Drive cung cấp) và stream `alt=media`. Catalog photo ID là đầu vào của API; client không gửi Drive ID hoặc URL. Chỉ MIME `image/*` của file binary được hỗ trợ; Drive Docs/shortcut hoặc file không thể tải trả lỗi. Resource key tiếp tục được chuyển đúng cho Drive. Metadata hiện tại quyết định tên/MIME download; tên được sanitize cho HTTP và ZIP, xử lý Unicode và trùng tên mà không sửa nội dung file.
3. **API khách trong `server/api/album/[albumId]/`:** endpoint tải đơn trực tiếp yêu cầu `single`; đường lấy từng file bằng vé của một plan `selected`/`basket`/`all` dùng chính quyền của plan đó. Cả hai trả stream với `Content-Type`, `Content-Disposition` (`filename` và `filename*`), `nosniff` và cache private/no-store. Endpoint lập kế hoạch nhận loại `selected`/`basket`/`all`; `selected` và `all` do server tự lấy danh sách, còn `basket` nhận photo ID nội bộ và kiểm tất cả thuộc album. Trước khi lập plan `selected` từ danh sách tim live, UI chờ autosave hoàn tất; server đọc danh sách đã lưu để tránh tải một tập optimistic chưa đồng bộ. Endpoint ZIP nhận vé phần trong body, xác thực chữ ký/hạn và kiểm lại access, quyền, trạng thái, vòng chốt cùng từng ID trước khi stream. Route chỉ validate, gọi domain operation và định hình response.
4. **Download sheet/basket trong gallery khách:** local state gồm chế độ, tập photo ID và tình trạng chuẩn bị/tải. Selection Island chỉ nhận capability, số ảnh và sự kiện mở sheet; Focus Viewer có thao tác tải đơn. Không dùng `selectedIds` làm state của basket, không gọi API selection để thêm/bỏ ảnh tải. Tách component khi sheet và Island có tương tác độc lập; giữ page làm nơi điều phối dữ liệu route và access.

## Lập kế hoạch và stream ZIP

Plan đọc kích thước Drive từ metadata/catalog được làm mới khi cần, kiểm file còn tải được và chia phần theo **cả số ảnh lẫn tổng byte**. Catalog bổ sung kích thước/checksum khi đồng bộ nguồn; album cũ lấy lại metadata thiếu qua Drive trước khi plan để tránh chia phần theo số ảnh đơn thuần. Ngưỡng được quyết định bằng benchmark trên Drive/Vercel và được cấu hình tập trung, không hardcode tùy tiện trong UI. Album lớn trả các ZIP có số thứ tự rõ ràng; client chỉ bắt đầu từng phần theo thao tác người dùng, không tự bật hàng loạt popup/download. Một file đơn lẻ vượt ngưỡng vẫn có đường tải trực tiếp gốc bằng vé của plan và được chỉ rõ trong kế hoạch. Plan không đọc sẵn toàn bộ binary.

Mỗi phần có vé hạn 10 phút ký bằng secret download server, gắn album, loại thao tác, vòng, photo IDs có thứ tự và chỉ số phần. Plan mobile cũng cấp vé từng file cho thao tác share; vé này không mở nút Focus `single` nếu cờ đó tắt. Vé gửi trong body để không xuất hiện trên URL; nó không chứa bytes ảnh và không được coi là quyền độc lập với album token. Server kiểm lại tất cả điều kiện khi nhận vé. ZIP dùng entry STORE/stream để giữ đúng bytes khi giải nén, giới hạn đồng thời và hỗ trợ hủy; không tạo ZIP trên ổ đĩa server. Nếu Drive lỗi trước khi stream, báo file/phần nào lỗi và cho tải các phần hợp lệ. Nếu lỗi giữa stream, phần đó bị coi là hỏng, client bỏ kết quả và cho thử lại phần; không báo tải thành công. Những phần đã hoàn tất vẫn dùng được.

Browser có hỗ trợ ghi stream xuống file thì dùng đường đó để giảm RAM. Browser còn lại chỉ gom Blob với phần ZIP có giới hạn byte an toàn. Nếu một ảnh đơn lẻ đã vượt ngưỡng, plan tách nó khỏi ZIP và dùng download file gốc do browser quản lý; không tạo ZIP vượt ngưỡng hoặc gom ảnh lớn đó vào RAM. Client có thể bỏ ZIP chưa hoàn tất khi stream lỗi. Tiến độ trong UI phản ánh số file/phần và byte đã nhận khi có thông tin; “Dừng tải” dùng `AbortController`. Không hứa tiến độ byte chính xác khi nguồn không cung cấp kích thước hoặc browser tự quản lý file lớn.

## Trải nghiệm khách

- **Island mặc định:** giữ tim và “Xem ảnh đã chọn”; thêm nút “Tải xuống” khi `selected` hoặc `all` khả dụng. Nếu chỉ `single` bật, thao tác tải chỉ ở Focus. Album chưa có tim vẫn có thể mở chế độ chọn ảnh tải nếu `selected` bật. Khi album đã chốt, khu vực đáy hiện số ảnh của bộ Studio chốt và thao tác tải phù hợp. Không dùng tim như checkbox tải.
- **Sheet mobile/desktop:** chọn “Tải ảnh đang chọn” hoặc “Tải bộ ảnh đã chốt” theo trạng thái, “Chọn ảnh khác để tải”, và “Tải toàn album” nếu được phép. Chế độ basket có checkbox trên các layout, đếm ảnh, bỏ chọn và “Chọn tất cả” chỉ khi `allowAll` bật. Basket trống vô hiệu hóa CTA. Overlay có tên truy cập được, focus trap/restore, Escape, trạng thái busy, touch target và safe area.
- **Focus Viewer:** nút tải một ảnh có tên truy cập được khi `single` bật. Bấm trên mobile chuẩn bị `File` gốc; khi sẵn sàng người dùng bấm “Mở bảng lưu/chia sẻ” để giữ user activation. Desktop tải file với tên gốc. Focus vẫn có nút tải sau khi album đã chốt dù panel ghi chú/chọn tim không còn.
- **Mobile nhiều ảnh:** chỉ tạo các `File` trong giới hạn số lượng/byte đã đo; kiểm `navigator.canShare({ files })` và gọi `navigator.share({ files })` từ cú bấm trực tiếp sau khi chuẩn bị. Nếu không hỗ trợ hoặc vượt giới hạn, giải thích và cho tải file/ZIP hoặc hướng dẫn mở Safari/Chrome từ webview. Không tự bắn N download. Kết quả Share Sheet chỉ được mô tả là đã mở/đã chia sẻ; web không xác nhận ảnh đã lưu vào Photos/Gallery.
- **Desktop nhiều ảnh/toàn album:** tải lần lượt các ZIP đánh số theo kế hoạch, hiển thị phần hoàn tất, phần lỗi và nút thử lại/hủy. Tên entry trùng được thêm hậu tố ổn định; mapping trong manifest hiển thị rõ.

## Lỗi, giới hạn và an toàn

Album hết hạn/khóa, token sai/thu hồi, photo không thuộc album, quyền bị tắt, Drive 403/404/429/5xx, metadata không phù hợp và browser thiếu API đều có trạng thái riêng ở API/UI. Không trả nội bộ SQL, API key, Drive token, admin token, URL nguồn hay stack trace. Retry có backoff với 429/5xx ở mức giới hạn; hủy và lỗi vĩnh viễn không retry. Áp dụng rate limit cho lập plan và stream để hạn chế tải lặp/egress bất thường. Không eager-download ảnh gốc khi chỉ lướt gallery; không base64 file lớn; giải phóng object URL và bộ nhớ sau thao tác.

Stream lớn phụ thuộc thời gian chạy và đặc tính triển khai Vercel, vì vậy benchmark ZIP nhiều phần và kiểm tra trên Preview là release gate. Vercel mô tả streaming là cách vượt giới hạn response 4,5 MB của function, nhưng function vẫn có giới hạn thời gian chạy; thiết kế không dựa vào một ZIP không giới hạn. [Vercel response streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions), [Vercel function limits](https://vercel.com/docs/functions/limitations).

## Kiểm chứng và điều kiện hoàn tất

1. **Policy/database:** default tắt, backfill; từng tổ hợp cờ; `after_finalize` qua chốt/mở vòng mới; role owner/manager/member/retoucher/guest admin; token hết hạn/thu hồi; cross-album/cross-tenant; audit và RLS. Gọi endpoint trực tiếp khi UI ẩn vẫn bị từ chối.
2. **Binary/Drive:** fixture Google Drive có JPEG/PNG/HEIC và tên Unicode/trùng. SHA-256 file tải đơn và từng ZIP entry bằng SHA-256 bytes gốc Drive; kiểm filename/extension/MIME/size/EXIF. Thumbnail đã cache không ảnh hưởng. Drive không truy cập được không bao giờ thay bằng preview. Kiểm resource key, file bị xóa/đổi quyền và 429. Test live chỉ trên folder/branch thử nghiệm, không dùng dữ liệu production.
3. **UI/browser:** basket độc lập với tim/notes/snapshot; hoạt động qua Grid/List/Focus, phân trang và refresh; empty/loading/progress/cancel/retry; 403 khi Studio đổi quyền. E2E Chromium cho hành vi chính; QA iOS Safari, Android Chrome, Safari/Edge/Chrome desktop và Zalo/Messenger webview trên thiết bị thật. Không coi Promise Share Sheet là xác nhận lưu Photos.
4. **Quy mô:** đo một ảnh, 10, 100, 1.000 và 3.000 ảnh cùng file lớn trên Drive thật; kiểm RAM, thời gian, quota, egress, thời gian chuẩn bị qua 4G và LCP gallery khi không tải. Dùng kết quả để chốt giới hạn share/ZIP và cấu hình Vercel trước release.
5. **Gate repository:** typecheck, Vitest, build, E2E phù hợp; integration test Drive thật và security/rate-limit; tài liệu sử dụng nêu giới hạn quyền với Drive công khai.

## Tham chiếu kỹ thuật

- [Google Drive API: tải và xuất file](https://developers.google.com/workspace/drive/api/guides/manage-downloads): file binary dùng `files.get` với `alt=media`; kiểm `capabilities.canDownload` khi có.
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API): `share()` yêu cầu user activation; `canShare()` kiểm dữ liệu file trước khi chia sẻ.
- [Vercel: response streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) và [function limits](https://vercel.com/docs/functions/limitations): xác minh cấu hình runtime bằng Preview và benchmark thực tế.
