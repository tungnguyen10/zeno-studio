# Photo Workflow Platform — Product Specification V1.0

**Ngày:** 13/10/2026 · **Trạng thái:** Approved scope / Implementation  
**Thị trường:** Việt Nam · **Định hướng:** Free-first, mobile-first, desktop-optimized, production-ready  
**Tham chiếu:** S2 Photo Picker, Pixieset, picdrop, Picflow, CloudSpot

## 1. Mục tiêu & nguyên tắc

Nền tảng giúp studio/photographer **tạo album từ Google Drive → gửi link → khách chọn ảnh & ghi chú chỉnh sửa → chốt → lọc RAW/JPEG → hậu kỳ → duyệt → bàn giao**.

- **Khách:** mở từ Zalo/Messenger, không cần tài khoản; ảnh là trọng tâm, chọn nhanh, không mất dữ liệu.
- **Studio:** tạo album ít bước, theo dõi tiến độ, nhận đúng tên file và yêu cầu chỉnh sửa.
- **Miễn phí toàn bộ tính năng V1**, không paywall; ưu tiên độ ổn định, hiệu năng và chi phí thấp.
- Một sản phẩm thống nhất, **Quick flow mặc định**; tùy chọn nâng cao chỉ xuất hiện khi cần.

## 2. Phạm vi V1

| Nhóm | V1 | Không thuộc V1 |
|---|---|---|
| Nguồn ảnh | **Google Drive public/shared folder**; đọc danh sách file và phân phối ảnh qua adapter | **Upload ảnh từ máy/Upload Engine/R2: placeholder “Sắp ra mắt”** |
| Gallery | Grid, Justified, Masonry, List, Focus Viewer; responsive | AI chọn ảnh, nhận diện khuôn mặt |
| Selection | Tim yêu thích, giới hạn số lượng, multi-select, shortlist, autosave, finalize, snapshot, export | — |
| Collaboration | Chọn chung, cá nhân, bình chọn; phân quyền người chốt | — |
| Photo Notes | Ghi chú mong muốn chỉnh sửa trên từng ảnh; xuất ghi chú | Vẽ/annotation lên ảnh (sau V1) |
| Studio | Album list/detail, trạng thái, nhắc khách bằng nội dung để gửi Zalo thủ công, analytics | CRM, booking, hợp đồng, thanh toán |
| Hậu kỳ | Local file filter (copy), retouch status, review/revision, link bàn giao Drive | Lưu RAW hoặc ảnh thành phẩm trên server riêng |

**Điều kiện kỹ thuật cần xác minh sớm:** Khả năng liệt kê và hiển thị ổn định ảnh từ thư mục Drive được chia sẻ qua **API/cơ chế được phép sử dụng**. Không phụ thuộc lâu dài vào URL thumbnail hết hạn hoặc endpoint không chính thức. Nếu không đáp ứng, phải quyết định phương án truy cập Drive chính thức trước release.

## 3. Vai trò & quyền

- **Guest studio:** tạo album nhanh không đăng ký; nhận link quản trị bí mật; có thể claim album sang tài khoản.
- **Studio owner/member:** quản lý album và tiến độ theo quyền; chỉ chủ/người được ủy quyền thay đổi cấu hình nhạy cảm.
- **Customer:** xem, chọn, ghi chú, chốt theo quyền trên link khách.
- **Collaborator:** tham gia qua link/token riêng; quyền xem/chọn/chốt được cấu hình.
- **Retoucher:** xem selection snapshot và notes, cập nhật tiến độ xử lý.

**Bắt buộc:** Link khách và link quản trị tách biệt; token có phạm vi quyền riêng, lưu dạng hash và thu hồi được; tenant isolation/RLS; không dựa vào URL khó đoán như lớp bảo mật duy nhất. Studio đăng nhập bằng email/mật khẩu qua Better Auth; khách không cần tài khoản và không phải nhập tên. Mọi thiết bị dùng cùng link khách đều vào chung một danh sách chọn và chung ghi chú.

## 4. Luồng chính (end-to-end)

1. **Tạo album:** Dán Google Drive folder link → kiểm tra quyền & ảnh → tên album (gợi ý từ folder), giới hạn chọn (mặc định không giới hạn), hạn 15 ngày (tùy chọn 30) → xuất bản.
2. **Chia sẻ:** Copy link / chia sẻ Zalo; khách mở trực tiếp không đăng nhập, nhập mật khẩu nếu được bật.
3. **Chọn ảnh:** ♥ trên thumbnail hoặc Focus Viewer; 💬 ghi chú yêu cầu chỉnh sửa; autosave, hiển thị `Đang lưu / Đã lưu / Lỗi đồng bộ`.
4. **Cộng tác:** Một link khách là một danh sách chọn chung và một ghi chú chung cho mỗi ảnh; không còn chế độ Individual/Voting, không phân biệt người chọn.
5. **Kiểm tra & chốt:** Selected Photos → kiểm tra giới hạn, ảnh có notes → xác nhận → tạo **immutable selection snapshot** gồm file và ghi chú.
6. **Studio nhận kết quả:** xem filename + notes; copy filenames / xuất TXT, CSV; mở Local File Filter ngay từ album.
7. **Hậu kỳ:** match filename với RAW/JPEG trên máy → xem matched/missing/ambiguous → **Copy** sang thư mục đích (không Move).
8. **Review & Delivery:** Studio thêm Drive folder/link ảnh đã chỉnh, map với ảnh được chọn khi cần → khách duyệt/yêu cầu sửa → studio xử lý vòng mới → chia sẻ link bàn giao và đánh dấu hoàn tất.
9. **Hết hạn:** ngừng truy cập album theo chính sách, cảnh báo trước hạn; cho xuất kết quả trước khi dọn metadata theo retention công bố. Ảnh gốc vẫn ở Drive của studio.

## 5. Screen inventory

| ID | Screen | Mobile | Desktop |
|---|---|---|---|
| PUB-01 | Landing / Create album | Form ngắn | Form ngắn |
| PUB-02 | Create success / share | Share sheet/Copy | Copy & quản trị |
| GAL-01 | Album access & Gallery | **Màn hình chính, 2 cột mặc định** | 5 cột mặc định |
| GAL-02 | Focus Photo Viewer | Fullscreen + swipe | Viewer + side panel |
| GAL-03 | Photo Note Editor | **Bottom sheet** | **Side panel** |
| GAL-04 | Selected Photos | Grid + sticky confirm | Grid/list + confirm |
| GAL-05 | Collaboration | Bottom sheet | Dialog/panel |
| GAL-06 | Finalize / Completed | Confirm + trạng thái | Confirm + trạng thái |
| GAL-07 | Review / Delivery | Gallery review | Gallery review |
| STU-01 | Dashboard / Albums | **Card list** | **Table mặc định** |
| STU-02 | Album Detail / Settings | Tabs gọn / menu | Tabs: Overview, Photos, Selections, Production, Analytics, Settings |
| STU-03 | Selection Results | Danh sách + export | Table + export / notes |
| STU-04 | Local File Filter | Thông báo giới hạn browser | Công cụ xử lý thư mục |
| STU-05 | Production / Review / Delivery | Theo dõi, cập nhật | Quản lý chi tiết |
| STU-06 | Analytics / Members | Cards | Dashboard / bảng |
| AUTH | Studio login/claim/recovery | Responsive | Responsive |
| SYS | Expired, not found, loading, offline, permission/error | Bắt buộc | Bắt buộc |

**Direct Upload placeholder:** mục không hoạt động tại Create Album, gắn nhãn **Sắp ra mắt**; không triển khai UI upload giả.

## 6. Gallery: các cách hiển thị

| Mode | Công dụng | Mobile | Desktop |
|---|---|---|---|
| **Uniform Grid** (default) | Quét/chọn nhanh, thumbnail crop | 2 cột, tùy chọn 3 | 5 cột, tùy chọn 3–8 |
| **Justified** | Giữ tỷ lệ ảnh, hàng cân bằng | Responsive | Responsive |
| **Masonry** | Ảnh ngang/dọc đa dạng | 2 cột | Responsive |
| **List** | Tên file, trạng thái, ghi chú | Compact rows | Detailed rows |
| **Focus** | Xem lớn, swipe, zoom, chọn/note | Fullscreen | Viewer / side panel |

- Tất cả view dùng chung photo data và selection state; chuyển view **không làm mất lựa chọn hoặc đổi thứ tự logic**.
- Filters: **Tất cả / Đã chọn / Chưa chọn**; nâng cao: Có ghi chú.
- Sort: Studio default, filename A–Z/Z–A, ngày file (nếu có), chọn gần đây, nhiều phiếu.
- Lưu view, số cột, filter trong local preferences; không yêu cầu user đăng nhập.
- Gallery hàng nghìn ảnh phải lazy-load/virtualize hợp lý, không tải tất cả preview cùng lúc.

## 7. Selection & Notes: business rules

### Chọn ảnh
- ♥ / ♡ độc lập với 💬; tap vào ảnh mở Focus, tap vào icon thực hiện hành động trực tiếp.
- Selection limit: Unlimited (default), Exact, Maximum, Minimum, Range.
- Multi-select: desktop Shift/Cmd/Ctrl; mobile bật chế độ checkbox riêng; **bulk marked items** tách khỏi danh sách yêu thích chính thức.
- Một vòng chọn; danh sách chọn chung cho cả link khách. Studio chốt bộ cuối, có thể chọn lại bộ ảnh khi chốt.
- Có thể bỏ/chọn lại trước finalize; sau finalize muốn sửa phải **reopen → new snapshot**.

### Photo Notes (bắt buộc V1)
- Mỗi ảnh có **♥ Chọn** và **💬 Ghi chú** ở Grid, List, Focus.
- Note editor: **một textarea** mặc định; gợi ý nhanh: sáng ảnh, chỉnh da, xóa vật thể/người, màu, bố cục, khác.
- Một note chính cho **mỗi ảnh**, dùng chung cho mọi thiết bị mở cùng link khách; ghi thời gian và các thay đổi, xung đột được phát hiện theo phiên bản.
- Note **không tự chọn ảnh**. Bỏ chọn vẫn giữ note nháp; trước khi chốt cảnh báo nếu có note ở ảnh không chọn.
- Selected Photos có filter **Có ghi chú / Chưa ghi chú** và số lượng ảnh có notes.
- Finalize lưu **snapshot ảnh đã chọn + filename tại thời điểm chốt + nội dung notes**; studio không làm thay đổi yêu cầu gốc khi cập nhật trạng thái hậu kỳ.
- Export: filename TXT, selection CSV và notes CSV/TXT (hỗ trợ Unicode tiếng Việt, escape CSV chuẩn).
- Annotation khoanh/vẽ trên ảnh **không thuộc V1**.

## 8. Studio list & workflow

- **Desktop Albums:** Table (default), Card Grid, Compact List; tìm kiếm, sort, filter theo trạng thái.
- **Mobile Albums:** Card List (default); mỗi card hiển thị tên, số ảnh, tiến độ, trạng thái, hết hạn, Copy link/Next action.
- **Album Detail:** Overview, Photos, Selections, Production, Analytics, Settings; một primary CTA theo trạng thái.
- **Production:** `PENDING → RETOUCHING → WAITING_REVIEW → APPROVED / REVISION_REQUESTED → DELIVERED`; nhiều vòng review được ghi riêng.
- **Review files:** từ Drive; cần mapping ảnh đã sửa vào selection snapshot nếu tên file khác; hỗ trợ manual mapping.
- **Reminders:** tạo nội dung + link để studio tự gửi Zalo; **không tự động gửi Zalo** trong V1.

## 9. Local File Filter

- Hai lối vào: công cụ độc lập và từ **Selection Results** (tự nạp danh sách filename/notes).
- Chọn Source folder + Destination folder; filter JPEG / RAW / All / Custom; so khớp tên đầy đủ hoặc stem theo cấu hình.
- Preview **Requested / Matched / Missing / Ambiguous**, liệt kê lỗi/trùng; không tự chọn file khi trùng tên giữa thư mục.
- **Copy only**; không xóa nguồn, không ghi đè mặc định; progress và báo cáo hoàn thành.
- File System Access API trên trình duyệt hỗ trợ; trên thiết bị/browser không hỗ trợ, hiển thị hướng dẫn desktop tương thích.

## 10. Analytics & privacy

**Studio metrics:** album views, sessions, chọn bao nhiêu/giới hạn, last activity, finalize rate/time, notes, participants, revision count, expiring soon.

**Product metrics:** create-to-publish, gallery open/start/finalize funnel, view-mode adoption, filter usage, sync errors, Drive failures, device mix, returning studios, weekly completed workflows.

- Event tối thiểu: `album_created`, `album_published`, `album_opened`, `gallery_view_changed`, `photo_selected`, `photo_unselected`, `photo_note_saved`, `selection_finalized`, `selection_reopened`, `file_match_completed`, `review_submitted`, `delivery_completed`.
- Chỉ thu thập cần thiết; aggregate theo ngày, retention ngắn cho raw events; công bố chính sách; không suy luận/gán nhãn tâm lý cá nhân chắc chắn từ lượt click.

## 11. Kiến trúc kỹ thuật V1

| Layer | Stack |
|---|---|
| Web UI | **Nuxt 4 · Vue 3 · TypeScript · Tailwind CSS · Pinia** |
| App API | Nuxt/Nitro server routes, modular monolith |
| Database & auth | **Neon PostgreSQL + Better Auth trong Nitro + PostgreSQL RLS**; studio dùng email/mật khẩu, email verification và password reset |
| Collaboration | Polling thay đổi mỗi **3–5 giây** khi album đang mở; thao tác lựa chọn được kiểm soát xung đột ở backend |
| Image source | **GoogleDriveAdapter**; trừu tượng `PhotoSourceAdapter` dự phòng V2 |
| Local filter | Browser File System Access API |
| Hosting | **Vercel mặc định** sau compatibility spike; chỉ xét Cloudflare nếu Vercel có blocker |
| Quality | Vitest, Playwright, CI/CD, error monitoring |

**Data entities:** `studios`, `studio_members`, `albums`, `album_settings`, `photos`, `photo_sources`, `participants`, `selection_lists`, `selection_rounds`, `selections`, `selection_versions`, `selection_version_items`, `photo_notes`, `production_tasks`, `review_rounds`, `revision_requests`, `deliveries`, `album_daily_stats`, `analytics_events`, `audit_logs`.

**Rules:** tenant isolation; stable photo ID độc lập filename; chỉ backend cấp quyền; autosave server-confirmed; immutable snapshots; dữ liệu ảnh không lưu binary vào PostgreSQL; xử lý trạng thái `loading/empty/error/offline/expired/sync-conflict`.

**Kết nối và quyền Neon:** Browser chỉ gọi Nitro API, không nhận database credentials. App traffic dùng Neon pooled connection với database role không sở hữu bảng và không có `BYPASSRLS`; migration dùng direct connection với role riêng. Mỗi transaction truy vấn dữ liệu studio phải đặt ngữ cảnh studio/principal bằng `SET LOCAL` hoặc `set_config(..., true)` trong **cùng transaction**. Không dùng session-level `SET` trên pooled connection. Better Auth lưu user/session trong Neon; guest/customer/participant token được Nitro kiểm tra riêng và thu hồi được. Kiểm thử RLS trên pooled endpoint với hai tenant đồng thời là release gate.

**Đồng bộ cộng tác:** Sau mutation, client dùng phản hồi server làm trạng thái xác nhận. Khi album đang mở, client polling theo phiên bản mỗi 3–5 giây để nhận thay đổi của người khác; tạm dừng khi tab không hiển thị và lùi nhịp khi lỗi/offline. Backend áp giới hạn và xử lý ghi đồng thời trong transaction; note có phiên bản riêng theo participant và photo.

**Jobs và lưu giữ:** Album hết hạn sau 15 ngày mặc định, có thể chọn 30 ngày. Khi hết hạn, khóa link khách; studio có thêm 30 ngày để xuất dữ liệu trước khi xóa metadata và notes. Neon Function Trigger (`schedule`, UTC) gọi Neon Function dọn dữ liệu idempotent; không dùng cron của Vercel. Raw analytics events có retention ngắn theo chính sách công bố.

### Quy ước package manager & lệnh dự án (V1)

- **Package manager duy nhất: npm** (không dùng pnpm/yarn).
- **Lockfile bắt buộc:** `package-lock.json`; commit cùng `package.json`.
- Khởi tạo/cài thư viện: `npm create nuxt@latest`, `npm install`, `npm install <package>`, `npm install -D <package>`.
- Chạy dự án: `npm run dev`, `npm run build`, `npm run test` (khi đã định nghĩa script trong `package.json`).
- Chạy CLI: `npx <command>`; CI/CD dùng **`npm ci`** để cài theo lockfile.
- Mọi hướng dẫn, tài liệu và pipeline cho V1 phải thống nhất sử dụng **npm**.

## 12. Responsive, hiệu năng & nghiệm thu

- **Mobile-first:** ưu tiên 320–430px và Zalo in-app browser; thumbnail 2 cột; filter qua bottom sheet; sticky selection CTA; touch target ~44px; không phụ thuộc hover.
- **Tablet:** gallery ~3 cột, layout thích ứng.
- **Desktop:** gallery ~5 cột, studio sidebar/table/keyboard shortcuts, Focus side panel.
- Lưu lựa chọn đã xác nhận sau refresh; hiển thị rõ trạng thái pending/error; không báo “Đã lưu” trước xác nhận server.
- Nhiều người cùng chọn không mất thay đổi; snapshot chốt chính xác cả **notes**.
- Drive folder lỗi/quyền đổi/ảnh hỏng phải có fallback UI và thông báo có thể hành động.
- Local filter xử lý đúng mọi bộ test filename và duplicate, không xóa file nguồn.
- Kiểm thử album 1.000–10.000 ảnh (gallery phân trang theo cursor, chỉ vẽ ảnh trong màn hình), Chrome/Edge/Safari, iOS/Android/Zalo WebView; performance, Neon pooled-connection RLS, access-token, accessibility, cleanup.
- Mục tiêu đo lường ban đầu: p75 LCP ≤ 2,5s và p75 INP ≤ 200ms **trong điều kiện kiểm thử xác định**; điều chỉnh theo kết quả thực tế.

## 13. Thứ tự phát triển (cùng phạm vi V1)

1. Domain model, quyền, state machines, design system; Neon schema/RLS và Better Auth.
2. **Technical spike Google Drive** (liệt kê folder, delivery URL, quota, ảnh lỗi) — **release blocker**.
3. Album Create/Publish + Studio Albums list.
4. Gallery views + Focus + filters/sort + selection autosave.
5. **Photo Notes**, collaboration, finalize & immutable snapshots.
6. Selection Results + Local File Filter.
7. Retouch Review + Delivery bằng Drive.
8. Analytics, privacy, error states, performance/security QA, production release.

## 14. Chốt phạm vi và các điểm mở

**Đã chốt:** miễn phí V1; Drive-first; không đăng nhập cho khách; mobile-first gallery; desktop studio; 5 gallery modes; ♥ + 💬 notes; collaboration; finalize/snapshot; local copy; retouch/review/delivery; analytics. **Direct Upload chỉ placeholder V2**, không làm R2/Uppy/image processing trong V1.

**Cần xác minh trước code/release:** (1) truy cập Drive public folder đáng tin cậy và hợp lệ; (2) bảo mật guest admin/participant tokens; (3) conflict strategy khi nhiều người chọn; (4) gallery performance và quyền riêng tư khi phân phối ảnh; (5) chính sách giữ/xóa metadata và selection sau 15–30 ngày.

**North Star:** Số **photo workflows hoàn tất thành công mỗi tuần**, kèm thời gian tạo album, tỷ lệ chốt, độ chính xác file matching và chi phí/album.
