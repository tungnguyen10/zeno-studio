# Zeno Studio — Đặc tả homepage V4 và demo chọn ảnh trên mobile

**Ngày cập nhật:** 23/11/2026  
**Trạng thái:** hướng thiết kế V4 đã được review; tài liệu dùng để bàn giao triển khai và nghiệm thu.  
**Prototype chạy trực tiếp:** [Mở prototype Zeno Studio V4](https://zeno-studio-mobile-demo-v4.mfat-8008.chatgpt.site/)  
**Quyền truy cập:** public; người có link có thể mở và dùng dữ liệu mẫu, không cần tài khoản cho phần demo.  
**Bản share đang phát hành:** version 2; ngày 23/11/2026. Đây là số version của link share, độc lập với tên thiết kế V4.

## 1. Mục tiêu và phạm vi

Homepage cần giải thích nhanh ba ý: album bắt đầu từ Google Drive, khách chọn ảnh trên điện thoại, studio nhận rõ ảnh cần xử lý. Hero kết hợp lời hứa ngắn và thao tác cụ thể để kiểm chứng lời hứa.

V4 thể hiện photographer productivity qua việc vuốt album, chạm tim và lọc lại lựa chọn. Copy không đưa số giờ tiết kiệm hoặc kết quả kinh doanh chưa được đo.

Phạm vi là homepage và demo giới thiệu; UI chọn ảnh bám component hiện có của Zeno. Quy trình studio chốt danh sách và lọc RAW/JPEG được giới thiệu phía dưới, nằm ngoài vòng trình diễn.

Hai nhóm người dùng liên quan:

- **Photographer/studio truy cập homepage:** cần thấy lợi ích, nhận diện sản phẩm và biết bước tiếp theo là tạo album.
- **Khách được mô phỏng trong demo:** cần xem ảnh, chọn/bỏ chọn và kiểm tra lại lựa chọn bằng những thao tác quen thuộc trên điện thoại.

## 2. Nội dung và bố cục hero

### 2.1. Copy chuẩn của V4

| Thành phần | Nội dung chính xác |
|---|---|
| Eyebrow | Dành cho photographers |
| Headline dòng 1 | Khách chọn nhanh. |
| Headline dòng 2 | Bạn nhẹ việc. |
| Subline dòng 1 | Gửi album từ Google Drive. |
| Subline dòng 2 | Nhận rõ ảnh khách chọn. |
| CTA chính | Tạo album miễn phí |
| Dòng hỗ trợ | Khách không cần tài khoản. |
| Tiêu đề phần quy trình | Từ album đến bộ ảnh cần làm. |

CTA tạo album trỏ đến `https://studio.zenocorp.vn/create`; đăng nhập trỏ đến `https://studio.zenocorp.vn/studio`. Logo prototype dẫn về đầu trang. Khi đưa vào Nuxt, dùng navigation nội bộ tương ứng.

### 2.2. Thứ bậc thị giác

Desktop đặt copy bên trái, điện thoại bên phải. Headline có hai dòng, trong đó dòng lợi ích cho photographer dùng màu brand. Chỉ một CTA có độ nhấn cao trong khối hero. Subline giải thích nguồn album và kết quả, không liệt kê toàn bộ tính năng.

Điện thoại là visual chính của hero. Không đặt thêm một demo cùng nội dung ở ngay bên dưới. Điều khiển nằm ngoài màn hình điện thoại để tách hướng dẫn trình diễn khỏi UI sản phẩm: công tắc Xem demo/Tự chọn ảnh ở trên điện thoại; một hàng bên dưới gồm nút Tạm dừng/Phát demo có vòng tiến độ, caption và nút Phát lại (chế độ tự chọn: gợi ý/trạng thái và nút Làm lại). Trên desktop/tablet, khung điện thoại co theo chiều cao màn hình (288–350px) để nằm trọn dưới header; copy căn giữa theo thân điện thoại.

Trang trí hero chỉ là lớp nền `aria-hidden`, không bắt sự kiện: lưới chấm, vầng sáng vàng logo/xanh brand, vòng quỹ đạo, tim và lấp lánh quanh điện thoại (nằm sau điện thoại). Chuyển động gồm copy hiện dần, điện thoại trượt lên, gạch chân vàng dưới “nhẹ việc” và nền trôi chậm; tất cả chỉ chạy khi `prefers-reduced-motion: no-preference`. Hiệu ứng vào không dùng scale để giữ vùng chạm 44px.

Ở mobile, thứ tự là copy → CTA → dòng hỗ trợ → điện thoại. Giữ điện thoại đủ lớn để xem ảnh và nhận ra trạng thái chọn; không thu toàn bộ nội dung xuống để ép vừa một màn hình.

Phần quy trình dưới hero giữ bốn ý: bắt đầu từ Drive, khách chọn, studio chốt danh sách, lọc RAW/JPEG trên máy.

## 3. Chuẩn UI trong màn hình điện thoại

Nguồn đối chiếu là nhánh `main` của `tungnguyen10/zeno-studio` khi dựng V4. Khi triển khai, kiểm tra diff nếu source đã thay đổi. Các liên kết nằm ở mục 11.

### 3.1. Mapping component và hình thức

| Thành phần | Nguồn hiện có | Yêu cầu giữ đúng |
|---|---|---|
| Header | `SiteHeader.vue` | Sticky, cao 64px, nền canvas 95%, blur 8px, border dưới |
| Logo | `BrandLogo.vue` | SVG vàng ZENO CORP; cao 32px, giữ tỷ lệ 154:43 |
| Đầu album | `pages/album/[albumId].vue` | Title canh trái 24px semibold; subtitle 14px muted |
| Chọn kiểu xem | `GalleryLayoutSwitch.vue` | Bốn icon: Hàng đều, Lưới, So le, Danh sách |
| Bố trí ảnh | `PhotoGallery.vue` | Mặc định masonry/So le; mobile hai cột, gap 8px |
| Card ảnh | `PhotoTile.vue` | Giữ tỷ lệ ảnh; bo 12px trong masonry; heart overlay |
| Thanh lựa chọn | `SelectionIsland.vue` | Pill nổi nền brand; bộ đếm, filter và download theo capability |

Header album chỉ hiển thị logo khi không truyền slot. Không thêm chữ “Album”, avatar hoặc hành động tài khoản vào phía phải. Title và subtitle cuộn cùng nội dung; header giữ vị trí trên cùng. Lớp blur phải áp dụng lên nội dung phía sau trước khi phủ nền 95%, tránh thấy chữ nét xuyên qua header.

Main mobile có padding ngang 16px, trên 20px và dưới 112px. Khối title có thêm padding ngang 4px. Subtitle cách title 6px. Hàng layout switch cách phần trước 20px, cách gallery 12px; switch nằm bên phải. Bên trái hàng này chỉ hiện “Ảnh đã chọn” khi đang lọc.

### 3.2. Token và typography

| Token sản phẩm | Màu | Vai trò |
|---|---|---|
| `brand` | `#344732` | Thanh lựa chọn, trạng thái layout active |
| `canvas` | `#f8f7f3` | Nền trang album |
| `ink` | `#24231f` | Chữ chính |
| `muted` | `#687264` | Chữ phụ, tim chưa chọn |
| `line` | `#e0e4d9` | Viền card và control |
| `heart` | `#b55364` | Tim đã chọn |
| `heart-soft` | `#fff0f2` | Nền nút tim đã chọn |
| `night` | `#121612` | Nền lightbox của sản phẩm |

Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Màn hình sản phẩm giữ light mode theo `main.css`. Không đổi tim thành xanh hoặc thay logo bằng chữ tự gõ khi host đang dùng dark mode.

### 3.3. Masonry và trạng thái chọn

Canvas mô phỏng viewport **390×720 đơn vị CSS**. Với padding 16px và gap 8px, mỗi cột rộng 175px. Chiều cao card tính bằng chiều rộng cột chia tỷ lệ ảnh; tỷ lệ được giới hạn từ 0.25 đến 4 theo helper của sản phẩm. Ảnh được xếp vào cột có chiều cao tích lũy nhỏ hơn.

Masonry mobile không có dải filename bên dưới ảnh. Card giữ border-line khi được chọn; không thêm viền xanh hoặc dấu check ở góc. Heart là ký tự `♥` ở cả hai trạng thái, nút tròn 44px, cách góc trên/phải 6px:

- Chưa chọn: tim muted, nền trắng 90%, border-line.
- Đã chọn: tim heart, nền heart-soft, border-heart.

Bấm heart thay đổi lựa chọn. Trong sản phẩm thật, bấm thân ảnh mở lightbox. Không mô phỏng việc bấm bất kỳ điểm nào trên thumbnail cũng chọn ảnh. Nếu hỗ trợ chế độ Lưới khi tự thao tác, phải chuyển đúng cấu trúc: ảnh ratio 0.8, caption cao 56px và heart nằm trong caption.

### 3.4. Thanh lựa chọn nổi

Island cách hai mép ngang 16px, cách đáy tối thiểu 16px hoặc safe area, rộng tối đa 448px, cao khoảng 56px và bo tròn hoàn toàn. Nội dung chính là `N ảnh đã chọn`, 14px semibold; icon heart ở disk 40px bên trái.

Ở viewport 390px, filter chỉ hiện icon vì label text được ẩn dưới 400px. Khi bật lọc, funnel đổi thành icon danh sách và control có nền active. Nút “Tải xuống” chỉ có khi capability cho phép. V4 minh họa một album đã bật tải; sự xuất hiện của nút không đồng nghĩa bản demo có backend tải ảnh thật.

## 4. Dữ liệu mẫu và kịch bản tự chạy

### 4.1. Bộ dữ liệu

Demo có **24 ảnh khác nhau**, gồm ảnh cưới, sự kiện, chi tiết và chân dung. Tên album là “Bộ ảnh mẫu”; ngày hạn 30/11/2026 là dữ liệu minh họa. Không dùng tên album để ngụ ý đây là một bộ ảnh khách hàng thật.

File mẫu được định danh từ `ZENO_0001.jpg` đến `ZENO_0024.jpg`. Tên này là metadata mô phỏng; asset nhúng thực tế là WebP. Lựa chọn trong kịch bản gồm `0001`, `0004`, `0009`, `0015`, `0020`. Dùng cùng ID xuyên suốt để bộ đếm, trạng thái tim và kết quả lọc luôn khớp.

### 4.2. Timeline 18 giây

| Thời điểm | Thao tác và trạng thái |
|---|---|
| 0–1.20s | Album mở, masonry đã có ảnh, bộ đếm 0 |
| 1.20–1.45s | Chạm tim ảnh 0001; bộ đếm lên 1 |
| 2.50–2.75s | Chọn ảnh 0004; bộ đếm lên 2 |
| 3.45–4.35s | Vuốt tới vùng chứa ảnh 0009 |
| 4.60–4.85s | Chọn ảnh 0009; bộ đếm lên 3 |
| 5.70–6.60s | Vuốt tới vùng chứa ảnh 0015 |
| 6.85–7.10s | Chọn ảnh 0015; bộ đếm lên 4 |
| 8.00–8.90s | Vuốt tới vùng chứa ảnh 0020 |
| 9.15–9.40s | Chọn ảnh 0020; bộ đếm lên 5 |
| 10.40–11.50s | Trở về đầu album |
| 11.90–12.15s | Chạm filter trên island; hiện đúng năm ảnh đã chọn |
| 14.30–15.20s | Cuộn nhẹ kết quả để lộ ảnh cuối |
| 15.20–17.00s | Giữ kết quả cho người xem kiểm tra |
| 17.00–18.00s | Chuyển nhẹ về trạng thái đầu rồi lặp |

Vòng chạm dài 620ms, nằm đúng tọa độ heart hoặc filter. Trạng thái chọn đổi sau khi vòng chạm bắt đầu 250ms. Các đoạn cuộn dùng easing `t*t*(3-2*t)`. Khi UI đổi kích thước hoặc layout, phải tính lại tọa độ theo card thực tế; không giữ tọa độ cố định từ một screenshot.

Caption luân phiên theo hành động: mở album, chạm tim, vuốt chọn thêm, quay đầu album, lọc lựa chọn. Caption chỉ hỗ trợ đọc chuyển động, không thêm thông tin kinh doanh hay tính năng ngoài màn hình.

## 5. Chế độ tự thao tác trong bản share

Link share có hai chế độ, điều khiển bằng hai nút nằm ngoài màn hình điện thoại:

| Điều khiển | Hành vi trong prototype |
|---|---|
| **Xem demo** | Chạy storyboard Canvas 18 giây; có Tạm dừng, Phát demo và Phát lại. |
| **Tự chọn ảnh** | Dừng Canvas, hiển thị album bằng DOM để người xem thao tác trực tiếp. Lần đầu bắt đầu với 0 ảnh được chọn. |
| **Cuộn album** | Cuộn dọc qua 24 ảnh trong màn hình điện thoại; header và thanh lựa chọn giữ đúng vị trí. |
| **Chạm tim** | Chọn/bỏ chọn đúng ảnh, đổi màu tim và cập nhật bộ đếm ngay. Tim là button thật có tên truy cập và `aria-pressed`. |
| **Chạm thân ảnh** | Mở bản xem ảnh lớn đơn giản; có nút đóng, phím Esc và nút chọn/bỏ chọn. Đóng ảnh trả focus về vị trí mở nếu ảnh đó còn trong danh sách. |
| **Lọc ảnh đã chọn** | Chỉ hiện các ID đang được chọn; bấm lại trở về toàn bộ album. Nếu chưa chọn ảnh hoặc bỏ ảnh cuối cùng trong kết quả lọc, hiện trạng thái rỗng cùng nút Xem tất cả ảnh. |
| **Bốn kiểu xem** | Hàng đều, Lưới, So le và Danh sách đều thay đổi bố cục thật; lựa chọn được giữ nguyên. Lưới dùng caption 56px theo trang album. |
| **Tải xuống** | Tạo ZIP ngay trong trình duyệt, chứa đúng ảnh mẫu đang chọn. Nút chưa hoạt động khi chưa chọn ảnh. File xuất là `.webp`, đúng định dạng asset nhúng. |
| **Làm lại** | Xóa lựa chọn, tắt bộ lọc, trở về So le và cuộn lên đầu album. |
| **Chuyển giữa hai chế độ** | Lựa chọn thủ công được giữ trong phiên trang; storyboard không ghi đè lựa chọn đó. Quay lại Xem demo sẽ tiếp tục playback. |

State manual chỉ nằm trong bộ nhớ trang. Reload sẽ xóa state; prototype không có lưu server, tạo album hoặc ghi vào dữ liệu Zeno. Các CTA Tạo album/Đăng nhập vẫn dẫn tới địa chỉ sản phẩm đã ghi ở mục 2.

Preview ảnh lớn là bản đơn giản phục vụ thử chọn ảnh, chưa tái tạo đầy đủ focus view production với ghi chú và tải ảnh gốc. ZIP tải về chứa các ảnh mẫu nhỏ đang dùng để trình diễn, không phải bản gốc hoặc RAW. Các giới hạn này thuộc phạm vi prototype.

Yêu cầu nhất quán: tương tác chủ động phải giành quyền điều khiển từ timeline; autoplay không được tự xóa lựa chọn người xem đang sửa. Việc chọn/bỏ chọn, lọc và bộ đếm phải dùng cùng một state. Khi reset hoặc phát lại, người xem phải biết đang trở về kịch bản mẫu. Các thao tác mô phỏng không được gọi API ghi dữ liệu album thật.

## 6. Responsive và accessibility

Homepage dùng container tối đa 1280px. Trên 1100px: padding ngang 48px, hero hai cột, gap 48px. Từ 761–1100px: padding 32px, gap 20px. Từ 760px trở xuống: một cột, padding 24px; dưới 350px: padding 16px. Headline dùng container units để hai dòng nằm trong cột copy.

Khung điện thoại rộng tối đa 350px, canvas giữ tỷ lệ 390:720. Kiểm tra homepage tại 320, 390, 768 và 1440px, gồm headline, CTA, phone, điều khiển và quy trình; không cuộn ngang hoặc che nút. Trang album production cần kiểm tra responsive riêng.

Baseline autoplay có nút HTML “Tạm dừng”/“Phát lại”, canvas có mô tả và vùng status thông báo hành động điều khiển. Trình đọc màn hình không cần nghe từng frame. Khi bật reduced motion, hiển thị kết quả tĩnh ở mốc 15.9s; người xem có thể chủ động phát.

Manual dùng button DOM với tên truy cập, `aria-pressed`, focus rõ và thao tác bàn phím. Vùng vẽ 44 đơn vị có thể nhỏ hơn 44 CSS pixel sau khi scale; cần kiểm tra target chạm ở kích thước hiển thị. Lightbox phải có cách đóng bằng Escape và trả focus về thumbnail.

## 7. Kiến trúc triển khai

### 7.1. Vai trò Canvas trong prototype

Canvas phù hợp để cố định storyboard, giữ một timeline và xuất clip review. Bản V4 tách dữ liệu ảnh, geometry, icon path, state theo thời gian và hàm vẽ. `getState(time)` trả lựa chọn, filter, scroll và phase; `draw(time)` dựng màn hình tương ứng. Header dùng một canvas phụ để blur phần nền trước khi vẽ logo.

Controller quản lý play, pause, replay và visibility bằng `requestAnimationFrame`; ngừng khi tab ẩn hoặc canvas xuất hiện dưới 65%. Khi tiếp tục, đặt lại mốc frame; chỉ giữ một vòng animation.

### 7.2. Hướng khuyên dùng khi đưa vào Nuxt

Tái dùng `BrandLogo`, `GalleryLayoutSwitch`, `PhotoTile`, `SelectionIsland` và logic layout của sản phẩm để giảm sai khác UI về sau. Bọc chúng trong một component demo nhận dataset mẫu và state cục bộ. Không kéo toàn bộ trang album có auth, polling và download network vào hero.

Autoplay và người xem nên gọi chung các action: chọn/bỏ chọn, đổi filter, đổi layout, mở/đóng ảnh nếu có. Timeline chỉ điều phối action và scroll. Không duy trì hai bộ logic chọn ảnh riêng cho animation và manual.

Tách preference của demo khỏi `zeno-gallery-layout` của album thật. Một lần xem homepage không nên thay đổi kiểu xem khách đã lưu cho sản phẩm. Trong Nuxt, khởi tạo animation phía client và dọn RAF, observer, listener khi unmount. Copy, CTA và poster vẫn cần hiện hữu nếu JavaScript chưa chạy.

## 8. Performance và giới hạn kỹ thuật

Baseline autoplay có 24 WebP, tổng 171.534 byte theo manifest; HTML tự chứa là 287.147 byte trước khi bổ sung manual. Đây là dung lượng file, chưa phản ánh tải mạng, Lighthouse hoặc FPS thiết bị thật.

Prototype chờ ảnh mẫu tải xong trước khi chạy; có placeholder khi ảnh lỗi. Production nên ưu tiên ảnh của màn đầu, chuẩn bị dần phần tiếp theo và giữ poster ổn định. Cấp trước width/height hoặc aspect ratio cho demo để tránh thay đổi bố cục khi tải ảnh.

Canvas giới hạn DPR tối đa 2, bỏ qua card ngoài viewport và cache layout theo ID. Với DOM/Vue, đo nhu cầu trước khi đưa dependency virtualize vào homepage. Canvas và video dự phòng không nên phát đồng thời.

## 9. Phạm vi đã kiểm tra và tiêu chí nghiệm thu

### 9.1. Kết quả kiểm tra ngày 23/11/2026

| Lớp kiểm tra | Kết quả và giới hạn |
|---|---|
| Canvas và storyboard | Chạy JavaScript thực với Canvas2D: 24 ảnh tải đủ, năm lựa chọn đúng ID, tọa độ chạm nằm trong màn hình, filter chính xác, pause/resume và replay hoạt động. Visibility/reduced motion được kiểm tra ở lớp controller. Các frame được xem và đối chiếu source UI. |
| Logic manual và layout | Chọn/bỏ chọn, bộ lọc rỗng, reset và state đã kiểm tra bằng Node. Cả bốn layout chứa đủ 24 ID, nằm trong bounds và không chồng card. Markup có button được gắn nhãn cùng trạng thái chọn. |
| ZIP | Mở lại ZIP bằng Python `zipfile`: tên `.webp`, dữ liệu RIFF/WEBP và CRC hợp lệ. |
| Link share trên Chrome desktop | Đã mở URL đã xuất bản; ảnh, CSS, script và hai chế độ hoạt động. Đã chọn 0001/0004/0010, lọc còn đúng ba ảnh; đổi layout giữ lựa chọn. |
| Preview và tải trên browser | Mở 0004, bỏ chọn trong preview và đóng bằng Esc: bộ đếm còn hai, kết quả lọc cập nhật đúng. Nút Tải xuống tạo download hoàn tất trên browser. |
| Điều khiển và trạng thái rỗng | Cả bốn nút layout đổi trạng thái; Làm lại đưa về 0 ảnh/So le; lọc lúc chưa chọn hiện thông báo rỗng và lối quay lại album. Tạm dừng và Phát lại của autoplay đã thử trực tiếp. |
| Phát hành | Đã xác nhận deployment thành công và tải lại bản cuối. Ký hiệu CTA gây lỗi font đã được bỏ. |

Chưa chạy trên thiết bị Safari iOS hoặc Chrome Android thật, chưa kiểm thử đầy đủ mọi breakpoint bằng browser, chưa đo Lighthouse/FPS và chưa audit accessibility toàn diện. Các mục này là bước nghiệm thu production; không coi kiểm tra controller hoặc phone viewport mô phỏng là kết quả kiểm thử thiết bị thật.

### 9.2. Checklist bàn giao và nghiệm thu production

- [x] Copy hero và CTA đúng mục 2; logo dùng asset thật.
- [x] Có 24 ảnh khác nhau và tải đủ trong bản kiểm tra.
- [x] Masonry, khoảng cách, màu tim, island và switch được đối chiếu source.
- [x] Tự chạy chọn đúng 0001/0004/0009/0015/0020; bộ đếm 0→5 ở lớp controller.
- [x] Filter trả đúng những ảnh đó, không thêm hoặc mất ảnh.
- [x] Pause/resume/replay được kiểm tra; controller chỉ giữ một RAF.
- [ ] Thử lỗi tải ảnh có chủ đích trên browser để kiểm tra fallback.
- [ ] Reduced motion và visibility hoạt động ở browser thật.
- [x] Các tương tác chính mục 5 được thử bằng chuột trên link share.
- [ ] Kiểm tra toàn bộ tương tác bằng touch trên thiết bị thật.
- [x] Manual không bị autoplay ghi đè; thao tác chọn/bỏ chọn cập nhật count đúng.
- [ ] Các control thật dùng được bằng bàn phím, có tên và focus rõ.
- [ ] Không overflow tại các viewport mục 6; thử Safari iOS và Chrome Android.
- [x] Link share mở trực tiếp; ảnh và script tải đầy đủ trong browser kiểm tra.
- [x] Demo chọn ảnh không gọi API tạo album, chốt lựa chọn hoặc ghi dữ liệu thật.

## 10. Chia task triển khai

| Task | Kết quả cần giao |
|---|---|
| Hero và navigation | Component hero, copy chuẩn, CTA, bố cục desktop/mobile |
| Dataset demo | 24 asset, ID/dimensions ổn định, manifest nguồn ảnh |
| UI demo dùng chung | Adapter dữ liệu mẫu cho các component chọn ảnh hiện có |
| Playback | Timeline 18s, pause/replay, visibility, reduced motion |
| Tương tác thủ công | Những hành vi mục 5, cùng state/action với autoplay |
| QA và phát hành | Kiểm tra checklist, link share, kết quả đo performance thực tế |

Thứ tự nên là UI/source parity → state lựa chọn → manual → timeline → responsive/a11y → QA. Chỉ thêm event analytics nếu có mục tiêu đo cụ thể và phù hợp hệ thống hiện tại; chưa đặt KPI thành công khi chưa có baseline.

## 11. Nguồn và tài nguyên

### Source sản phẩm

- [Trang album khách hàng](https://github.com/tungnguyen10/zeno-studio/blob/main/app/pages/album/%5BalbumId%5D.vue): title, subtitle, selection, filter và lightbox.
- [PhotoGallery](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/album/PhotoGallery.vue), [PhotoTile](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/album/PhotoTile.vue), [gallery-layout](https://github.com/tungnguyen10/zeno-studio/blob/main/app/lib/gallery-layout.ts): geometry và cấu trúc card.
- [SelectionIsland](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/album/SelectionIsland.vue), [GalleryLayoutSwitch](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/album/GalleryLayoutSwitch.vue): control và breakpoint 400px.
- [SiteHeader](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/SiteHeader.vue), [BrandLogo](https://github.com/tungnguyen10/zeno-studio/blob/main/app/components/BrandLogo.vue), [main.css](https://github.com/tungnguyen10/zeno-studio/blob/main/app/assets/css/main.css): logo, font, token và theme.
- [useGalleryLayout](https://github.com/tungnguyen10/zeno-studio/blob/main/app/composables/useGalleryLayout.ts): masonry mặc định và preference.

### Ảnh mẫu

Ảnh lấy từ asset của [Nestrovix/lumiere-studio](https://github.com/Nestrovix/lumiere-studio), đối chiếu [CREDITS.md](https://github.com/Nestrovix/lumiere-studio/blob/main/CREDITS.md). Manifest ghi nguồn Unsplash và liên kết [Unsplash License](https://unsplash.com/license). Bộ ảnh là nội dung mẫu cho demo, không phải ảnh thuộc studio của người dùng.

Nhóm nguồn: [weddings](https://github.com/Nestrovix/lumiere-studio/tree/main/assets/images/weddings) cho 0001–0007; [hero](https://github.com/Nestrovix/lumiere-studio/tree/main/assets/images/hero) cho 0008–0009; [gallery](https://github.com/Nestrovix/lumiere-studio/tree/main/assets/images/gallery) cho 0010–0020 và 0024; [portraits](https://github.com/Nestrovix/lumiere-studio/tree/main/assets/images/portraits) cho 0021–0023. Metadata của từng ảnh được nhúng trong HTML tại `zeno-demo-provenance`, gồm source URL, đường dẫn, dimensions, mô tả và hash.

### Tài liệu kỹ thuật tham khảo

- [MDN — Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): DPR, cache và requestAnimationFrame.
- [W3C — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html): cơ chế điều khiển nội dung chuyển động tự chạy.
- [Tailwind theme source](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css): giá trị blur mặc định 8px dùng để đối chiếu header.

Các thông số 18 giây, 24 ảnh và năm lựa chọn là cấu hình trình diễn V4. Chúng không phải giới hạn album của sản phẩm hoặc kết quả nghiên cứu hiệu quả người dùng.
