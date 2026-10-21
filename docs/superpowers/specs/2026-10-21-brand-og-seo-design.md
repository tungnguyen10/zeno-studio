# Ảnh OG thương hiệu và SEO công khai — thiết kế

Ngày: 2026-10-21

## Bối cảnh và mục tiêu

Zeno Studio hiện dùng `public/images/hero/couple.jpg` (720 × 478) làm ảnh Open Graph chung. Ảnh chưa nhận diện Zeno Studio hoặc Zeno Corp. Dự án đã có tiêu đề và mô tả riêng cho bốn trang công khai, canonical, sitemap, robots, JSON-LD trang chủ và `noindex` cho các route riêng tư. Công việc này tạo ảnh chia sẻ mang thương hiệu và kiểm tra các metadata liên quan trong phạm vi bốn trang công khai.

Ảnh OG giúp bản xem trước khi chia sẻ nhận diện sản phẩm. Tiêu đề, mô tả, canonical và khả năng lập chỉ mục được kiểm riêng cho tìm kiếm; không coi ảnh OG là bảo đảm tăng thứ hạng.

## Thiết kế ảnh

- Một ảnh PNG tĩnh 1200 × 630 dùng chung cho `/`, `/create`, `/studio` và `/tools/file-filter`.
- Dùng nguyên `public/images/logo.svg` để hiển thị Zeno Corp. “Zeno Studio” là tiêu đề chính.
- Nền sáng `#f8f7f3`, chữ và dải nhấn xanh thương hiệu `#344732`/`#263825`, ảnh cô dâu từ `public/images/hero/bride.jpg` ở khung bên phải. Giữ khoảng trống an toàn quanh chữ và ảnh.
- Nội dung trên ảnh: “DÀNH CHO STUDIO ẢNH”, “Zeno Studio”, “Tạo album. Chọn ảnh. Lọc file.”, “Quy trình ảnh gọn gàng cho studio và khách hàng.” Một thẻ nhỏ trên ảnh ghi “18 ảnh đã chọn” và “Sẵn sàng chốt bộ ảnh”. Tim trong thẻ là hình vector được căn tâm, không dùng glyph phụ thuộc font.
- Tạo ảnh cuối tại `public/images/og/zeno-studio.png`. Lưu bố cục ở `scripts/og-image.html` và script dựng ở `scripts/generate-og-image.mjs`; script dùng Playwright đã có trong dev dependencies để kết xuất từ `logo.svg` và ảnh nguồn. Không xử lý ảnh lúc request và không thêm runtime dependency. Tối ưu ảnh để không quá 1 MB mà chữ và ảnh vẫn rõ ở kích thước chia sẻ nhỏ.

## Metadata và luồng dữ liệu

- `shared/site.ts` là nguồn duy nhất cho đường dẫn ảnh, kích thước 1200 × 630 và mô tả alt đúng nội dung ảnh.
- `app/app.vue` tạo URL ảnh tuyệt đối từ origin hiện có. Cung cấp `og:image`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:image` và `twitter:image:alt`. Giữ `og:site_name` là Zeno Studio; Zeno Corp được thể hiện trong ảnh và thông tin Organization hiện có.
- Bốn trang công khai giữ tiêu đề, mô tả và Open Graph title/description riêng. Rà lại nội dung để mỗi trang phản ánh chức năng thật, sửa nếu có lỗi hoặc trùng lặp không phù hợp.
- Canonical và `og:url` chỉ chứa path, không chứa query hoặc fragment. Production dùng `NUXT_PUBLIC_SITE_URL` theo tài liệu triển khai; ở local/Preview dùng origin của request như hiện tại.
- Sitemap chỉ liệt kê bốn trang công khai. Các route album, guest và khu vực quản trị tiếp tục có quy tắc ngăn lập chỉ mục và không lộ token trong metadata. Chỉ điều chỉnh robots/sitemap/JSON-LD nếu kiểm tra phát hiện sai lệch trực tiếp với phạm vi này.

## Lỗi và xác minh

- Ảnh phải được phục vụ công khai bằng HTTP 200, `image/png`, đúng 1200 × 630. Nếu file thiếu, kiểm tra tự động phải thất bại trước khi phát hành.
- Kiểm tra HTML SSR của cả bốn trang công khai: một canonical và `og:url` đúng origin/path; title/description riêng; cùng ảnh OG/Twitter tuyệt đối; kích thước, MIME và alt khớp file. Kiểm tra URL ảnh truy cập được không cần đăng nhập.
- Kiểm tra sitemap/robots và header `noindex` của route riêng tư; không đưa link có token vào canonical hoặc metadata xã hội.
- Xem ảnh ở kích thước gốc và thumbnail, đặc biệt logo SVG, dấu tiếng Việt, khung ảnh và vị trí tim. Chạy E2E SEO liên quan, typecheck và build. Không yêu cầu kiểm thử Neon hoặc thay đổi dữ liệu.

## Ngoài phạm vi

Không tạo ảnh OG động cho album hoặc ảnh riêng từng trang. Không thêm nội dung marketing mới, công cụ SEO bên thứ ba, phụ thuộc runtime hoặc thay đổi luồng xác thực/dữ liệu.

## Nguồn tham khảo

- [Open Graph protocol](https://ogp.me/) cho metadata ảnh và URL.
- [Google Search Central: meta descriptions](https://developers.google.com/search/docs/appearance/snippet) cho mô tả riêng từng trang.
- [Google Search Central: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) cho kiểm tra route riêng tư.
