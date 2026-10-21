export const SITE_NAME = 'Zeno Studio'
export const SITE_TAGLINE = 'Tạo album, chọn ảnh và lọc file cho studio ảnh'
export const SITE_DESCRIPTION = 'Zeno Studio giúp studio tạo album từ Google Drive, để khách chọn ảnh và ghi chú trên điện thoại, rồi xuất danh sách và lọc file RAW/JPEG trên máy.'
export const SITE_OG_IMAGE = {
  path: '/images/og/zeno-studio.png',
  width: 1200,
  height: 630,
  type: 'image/png' as const,
  alt: 'Zeno Studio của Zeno Corp: tạo album, chọn ảnh và lọc file cho studio ảnh',
}

export const ORGANIZATION = {
  name: 'Zeno Corp',
  legalName: 'Công ty TNHH Zeno Corporation',
  url: 'https://www.zenocorp.vn/',
  email: 'info@zenocorp.vn',
  telephone: '+84782788880',
  taxId: '0319455594',
  address: { streetAddress: '38A Phan Tây Hồ, Phường Cầu Kiệu', addressLocality: 'TP. Hồ Chí Minh', addressCountry: 'VN' },
}

export interface PublicPage {
  path: string
  title: string
  description: string
}

// Only pages that are safe to index; private/token routes are excluded on purpose.
export const PUBLIC_PAGES: PublicPage[] = [
  { path: '/', title: 'Zeno Studio — Tạo album, chọn ảnh và lọc file', description: SITE_DESCRIPTION },
  { path: '/create', title: 'Tạo album nhanh — Zeno Studio', description: 'Tạo album chọn ảnh từ folder Google Drive trong vài phút, không cần đăng nhập. Nhận link gửi khách và link quản trị riêng.' },
  { path: '/studio', title: 'Không gian studio — Zeno Studio', description: 'Quản lý album, thành viên, lựa chọn của khách và các phiên bản đã chốt ở cùng một nơi.' },
  { path: '/tools/file-filter', title: 'Lọc file ảnh RAW/JPEG trên máy — Zeno Studio', description: 'Dán danh sách tên ảnh khách đã chọn, tìm file RAW/JPEG trong thư mục trên máy và copy sang thư mục đích ngay trong trình duyệt.' },
]

export function publicPage(path: string): PublicPage {
  const page = PUBLIC_PAGES.find(item => item.path === path)
  if (!page) throw new Error(`Unknown public page: ${path}`)
  return page
}

export const WORKFLOW_STEPS = [
  { title: 'Chọn ảnh dễ hơn', body: 'Khách chọn và ghi chú trên từng ảnh ngay từ điện thoại, không cần tạo tài khoản.' },
  { title: 'Chốt bộ ảnh', body: 'Người quản trị kiểm tra lựa chọn chung và chốt thành một phiên bản cố định.' },
  { title: 'Lọc file trên máy', body: 'Xuất tên file và ghi chú, rồi tìm và copy RAW/JPEG theo bộ ảnh đã chốt.' },
]

export const FAQS = [
  { q: 'Khách có cần tạo tài khoản không?', a: 'Không. Khách chỉ cần mở link album studio gửi để xem, chọn và ghi chú ảnh.' },
  { q: 'Ảnh được lưu ở đâu?', a: 'Ảnh gốc vẫn nằm trong folder Google Drive của bạn. Zeno Studio chỉ đọc ảnh từ folder đã chia sẻ bằng đường liên kết.' },
  { q: 'Tạo album nhanh khác gì không gian studio?', a: 'Tạo album nhanh không cần đăng nhập và album có hạn 15 hoặc 30 ngày. Không gian studio dành cho đội ngũ cần quản lý nhiều album và thành viên.' },
  { q: 'Công cụ lọc file có tải ảnh lên máy chủ không?', a: 'Không. Công cụ chạy ngay trong trình duyệt, chỉ copy file sang thư mục đích và không xóa file nguồn.' },
]

export function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, '')
}
