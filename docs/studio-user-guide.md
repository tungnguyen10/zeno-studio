# Hướng dẫn sử dụng Zeno Studio cho studio

Tài liệu này hướng dẫn luồng hiện có trong Zeno Studio: tạo album từ Google Drive, gửi khách chọn ảnh và ghi chú, chốt lựa chọn, xuất danh sách và lọc ảnh gốc trên máy. Xem [sơ đồ flow cốt lõi](./core-workflow.md).

> **Lưu ý về trạng thái:** Hướng dẫn phản ánh code được rà soát ngày 20/10/2026. Drive đã xác minh ở local/Preview nhưng cổng Drive trên Production vẫn khóa; các tính năng có thể chưa bật trên môi trường bạn đang dùng. Việc gửi email thật cũng chưa được nghiệm thu end-to-end. Đặc tả sản phẩm không đồng nghĩa tính năng đã được phát hành. Xem [tiến độ triển khai](./implementation-progress.md) trước khi đưa luồng vào vận hành thật.

## 1. Chọn cách tạo album

Zeno Studio có hai cách làm việc:

| Cách | Dành cho | Kết quả |
| --- | --- | --- |
| **Studio có tài khoản** (`/studio`) | Muốn quản lý album trong workspace và có thể mời nhóm | Album được tạo dạng nháp; xuất bản khi đã kiểm tra xong |
| **Tạo album nhanh** (`/create`) | Cần tạo nhanh mà không đăng nhập | Album xuất bản ngay; nhận một link khách và một link quản trị bí mật |

Nếu cần quản lý album lâu dài hoặc phối hợp với nhóm, hãy dùng workspace studio.

## 2. Chuẩn bị folder Google Drive

1. Trong Google Drive, mở menu chia sẻ folder ảnh.
2. Ở **Quyền truy cập chung**, chọn **Bất kỳ ai có đường liên kết** với vai trò **Người xem**.
3. Sao chép link có dạng `drive.google.com/drive/folders/...`.
4. Đặt ảnh cần dùng trực tiếp trong folder đó. Ảnh nằm trong folder con hiện không được lấy vào album.

Folder cần truy cập được bằng link. Điều này có nghĩa người có link folder có thể xem ảnh trên Drive; chỉ dùng nguồn ảnh mà studio được phép chia sẻ theo cách này. Ảnh gốc vẫn ở Drive của studio, không được tải thành kho ảnh riêng của Zeno.

## 3. Tạo và xuất bản album trong workspace

1. Mở `/studio`, đăng nhập hoặc tạo tài khoản bằng email.
2. Trong danh sách **Album**, chọn **Tạo album**.
3. Nhập tên album, link folder Drive, giới hạn lựa chọn tối đa và hạn album 15 hoặc 30 ngày.
4. Kiểm tra số ảnh và tên album. Album mới ở trạng thái **Bản nháp**.
5. Chọn **Xuất bản** để tạo link khách. Sao chép link và chỉ gửi cho khách dự kiến.
6. Mở **Chi tiết** để xem trạng thái, hạn, số ảnh và bộ ảnh; dùng **Sao chép link khách** để cấp link khách khi cần.

Link khách là link có quyền truy cập: bất kỳ ai nhận được link đều có thể mở album trong thời hạn hiệu lực. Không đăng link khách ở nơi công khai nếu album chỉ dành cho một khách hàng.

Trong danh sách `/studio`, dùng ô tìm kiếm, bộ lọc trạng thái và **Sắp xếp** để tìm album. Trên máy tính, danh sách mặc định là bảng và có thể chuyển sang thẻ; trên điện thoại luôn là thẻ. Chủ studio hoặc quản lý mở **Tùy chọn** trên album để sửa tên; với album còn là bản nháp, có thể sửa thêm giới hạn chọn và hạn 15/30 ngày trước khi xuất bản. **Lưu trữ** đưa album khỏi danh sách đang quản lý; mở **Đã lưu trữ** để xem hoặc khôi phục. Lưu trữ không khóa link khách và không gia hạn album. Chỉ bản nháp chưa xuất bản mới có thể xóa vĩnh viễn khỏi Zeno Studio; ảnh gốc trên Drive không bị xóa.

## 4. Tạo nhanh không cần đăng nhập

1. Mở `/create`, nhập tên album và link folder Drive công khai.
2. Chọn giới hạn ảnh (hoặc không giới hạn) và hạn 15 hoặc 30 ngày.
3. Chọn **Tạo và xuất bản album**.
4. Lưu riêng cả hai link:
   - **Link gửi khách:** dùng để xem, chọn và ghi chú ảnh.
   - **Link quản trị bí mật:** dùng để xem kết quả và quản lý album.

**Không gửi link quản trị cho khách.** Hãy lưu link này trong nơi an toàn trước khi rời trang; hiện không thể khôi phục link đã mất. Có thể nhận album vào tài khoản studio để chuyển sang quản lý bằng workspace; thao tác này thu hồi quyền quản trị guest cũ nhưng giữ album, kết quả và link khách. Tạo nhanh được giới hạn 10 lần thử mỗi giờ theo IP.

## 5. Khách chọn ảnh và ghi chú

Gửi link khách cho khách hàng. Khách không cần tạo tài khoản hoặc nhập tên:

1. Mở album trên điện thoại hoặc máy tính.
2. Chọn/bỏ chọn ảnh bằng nút trái tim; mở ảnh để xem lớn.
3. Thêm ghi chú chỉnh sửa cho ảnh khi cần. Ghi chú được lưu riêng với từng ảnh và không tự chọn ảnh đó.
4. Xem số ảnh đã chọn và giới hạn trong thanh phía dưới.

Mọi người mở cùng link dùng **một danh sách chọn chung** và ghi chú chung cho mỗi ảnh; đây không phải các phiếu chọn riêng theo từng người. Khách có thể sửa lựa chọn trước khi studio chốt. Link khách có thể được cấp lại từ workspace; link cũ vẫn hoạt động cho tới khi album hết hạn hoặc token bị thu hồi.

## 6. Kiểm tra và chốt bộ ảnh

1. Trong workspace hoặc trang quản trị album **Tạo nhanh**, mở album đang ở trạng thái **Đang chọn**.
2. Dùng các bộ lọc **Tất cả**, **Đang chọn/Khách đã chọn** và kiểu hiển thị để rà ảnh.
3. Bấm ảnh để thêm hoặc bỏ ảnh khỏi bộ chốt cuối; lựa chọn khách đã đánh dấu sẵn.
4. Kiểm tra số ảnh sẽ chốt và giới hạn, rồi chọn **Chốt … ảnh**.
5. Mở **Xem kết quả đã chốt** để kiểm tra tên file và ghi chú.

Mỗi lần chốt tạo một phiên bản kết quả cố định. Tìm kiếm hoặc lọc danh sách không làm thay đổi nội dung khi copy/xuất. Nếu cần tổ chức một vòng chọn mới, dùng **Mở vòng chọn mới**; phiên bản cũ vẫn được giữ làm lịch sử.

## 7. Xuất kết quả và lọc ảnh RAW/JPEG

### Xuất danh sách

Trong **Kết quả chọn ảnh**, có thể tìm theo tên file, lọc ảnh có/chưa có ghi chú, copy danh sách tên file hoặc tải các định dạng xuất hiện trong menu **Xuất danh sách / ghi chú**. Lệnh copy/xuất áp dụng cho toàn bộ phiên bản đã chốt, không chỉ những dòng đang hiển thị sau khi lọc.

### Lọc ảnh gốc trên máy

1. Từ kết quả đã chốt, chọn **Lọc ảnh gốc**.
2. Dùng Chrome hoặc Edge trên máy tính macOS/Windows, chọn folder chứa ảnh RAW/JPEG gốc và cấp quyền truy cập folder khi trình duyệt hỏi.
3. Chờ quét xong; kiểm tra ảnh **khớp**, **thiếu**, **mơ hồ** và file đích đã tồn tại.
4. Với tên trùng/mơ hồ, chọn đúng file hoặc bỏ qua. Xử lý các xung đột bắt buộc trước khi copy.
5. Chọn đích phù hợp rồi bấm **Xác nhận copy**. Mặc định file được copy vào `RAW/SELECTED`; có thể chọn path con hoặc một folder đích khác.

Đây là thao tác **copy**, không phải move; ảnh nguồn không bị sửa hoặc xóa. File đã có trong đích được bỏ qua; không ghi đè mặc định. Có thể xuất danh sách và ghi chú kể cả khi trình duyệt không hỗ trợ truy cập folder, nhưng cần Chrome/Edge desktop để quét và copy. Dữ liệu ảnh RAW và quyền truy cập folder ở trong trình duyệt, không tải RAW lên server.

## 8. Kết quả trên máy

Sau khi copy, Filter Files tạo folder ảnh đã lọc và báo cáo trên máy người dùng. Zeno không ghi trạng thái “Đã lọc” lên album. Người giữ link quản trị của album **Tạo nhanh** cũng có thể mở trang kết quả và Filter Files cho đúng phiên bản đã chốt.

## 9. Thành viên studio

Chủ studio và quản lý có thể mời thành viên tại **Thành viên studio**. Link mời gửi một lần, chỉ dùng được với email được mời đã xác minh và hết hạn sau 7 ngày. Link mời có thể được thu hồi. Không chia sẻ link mời ngoài người nhận.

Quyền hiện có gồm chủ studio, quản lý và thành viên; tài khoản retoucher cũ chỉ còn quyền đọc cần thiết. Không thể mời mới vai trò retoucher. Nếu một nút thao tác không xuất hiện, hãy nhờ chủ studio hoặc quản lý kiểm tra quyền.

## 10. Hạn album và xử lý sự cố

- **Không nhận folder Drive:** kiểm tra link folder, đặt quyền **Bất kỳ ai có đường liên kết – Người xem**, và để ảnh trực tiếp trong folder thay vì folder con.
- **Không thấy ảnh hoặc thumbnail bị lỗi:** tải lại album và kiểm tra folder Drive còn tồn tại, link còn truy cập được. Nếu tiếp tục lỗi, gửi tên album và thời điểm xảy ra cho hỗ trợ; không gửi API key hay thông tin đăng nhập.
- **Không chọn được folder RAW:** dùng Chrome/Edge desktop và cấp lại quyền truy cập folder. Trên browser không hỗ trợ, vẫn có thể tải danh sách tên file và ghi chú.
- **Nguồn RAW chỉ đọc:** chọn folder đích khác có quyền ghi; không cần cấp quyền ghi cho folder nguồn.
- **Không copy được:** xem lại mục thiếu, tên file mơ hồ và xung đột ở đích; thử lại sau khi xử lý. Không xóa ảnh nguồn để “sửa” lỗi.
- **Mất link quản trị album nhanh:** nếu chưa nhận album vào tài khoản studio thì link hiện không khôi phục được. Khi còn link quản trị, hãy nhận album vào tài khoản để quản lý trong workspace.
- **Album hết hạn:** link khách bị khóa. Album guest có thể được nhận vào studio trong thời gian lưu metadata 30 ngày; dữ liệu metadata sẽ được dọn sau thời gian lưu này. Không coi hạn album là cơ chế lưu trữ ảnh — ảnh gốc vẫn thuộc Drive của studio.

## 11. Những điều chưa nên giả định

Hướng dẫn này không cam kết các tính năng chưa được triển khai hoặc chưa qua gate phát hành. Tại lần cập nhật tiến độ gần nhất, các mục đáng chú ý còn thiếu/chưa nghiệm thu gồm: mật khẩu album, tự động gửi Zalo, hỗ trợ ổ đĩa thật trên mọi nền tảng/browser, xác minh SMTP thật và nghiệm thu đầy đủ Drive/Production. Kiểm tra [tiến độ triển khai](./implementation-progress.md) để biết trạng thái mới nhất trước khi dựa vào các luồng này trong quy trình sản xuất.
