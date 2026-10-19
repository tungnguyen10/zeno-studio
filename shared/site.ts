export const SITE_NAME = 'Zeno Studio'
export const SITE_TAGLINE = 'Nền tảng chọn ảnh, ghi chú hậu kỳ và bàn giao cho studio ảnh'
export const SITE_DESCRIPTION = 'Zeno Studio giúp studio ảnh gửi album từ Google Drive, để khách chọn ảnh và ghi chú chỉnh sửa trên điện thoại, theo dõi các vòng duyệt và bàn giao gọn gàng.'
export const SITE_OG_IMAGE = { path: '/images/hero/couple.jpg', width: 720, height: 478, alt: 'Cặp đôi trong bộ ảnh cưới ngoài trời' }

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
  { path: '/', title: 'Zeno Studio — Chọn ảnh, hậu kỳ và bàn giao cho studio', description: SITE_DESCRIPTION },
  { path: '/create', title: 'Tạo album nhanh — Zeno Studio', description: 'Tạo album chọn ảnh từ folder Google Drive trong vài phút, không cần đăng nhập. Nhận link gửi khách và link quản trị riêng.' },
  { path: '/studio', title: 'Không gian studio — Zeno Studio', description: 'Quản lý album, thành viên, lựa chọn của khách, ghi chú hậu kỳ và các vòng duyệt ảnh ở cùng một nơi.' },
  { path: '/tools/file-filter', title: 'Lọc file ảnh RAW/JPEG trên máy — Zeno Studio', description: 'Dán danh sách tên ảnh khách đã chọn, tìm file RAW/JPEG trong thư mục trên máy và copy sang thư mục đích ngay trong trình duyệt.' },
]

export function publicPage(path: string): PublicPage {
  const page = PUBLIC_PAGES.find(item => item.path === path)
  if (!page) throw new Error(`Unknown public page: ${path}`)
  return page
}

export const WORKFLOW_STEPS = [
  { title: 'Chọn ảnh dễ hơn', body: 'Khách chọn và ghi chú trên từng ảnh ngay từ điện thoại, không cần tạo tài khoản.' },
  { title: 'Hậu kỳ chính xác', body: 'Studio nhận tên file và yêu cầu chỉnh sửa, sau đó lọc RAW/JPEG ngay trên máy.' },
  { title: 'Duyệt rõ ràng', body: 'Mỗi vòng review được lưu lại để cả hai bên biết ảnh nào cần sửa và khi nào hoàn tất.' },
]

export const FAQS = [
  { q: 'Khách có cần tạo tài khoản không?', a: 'Không. Khách chỉ cần mở link album studio gửi để xem, chọn và ghi chú ảnh.' },
  { q: 'Ảnh được lưu ở đâu?', a: 'Ảnh gốc vẫn nằm trong folder Google Drive của bạn. Zeno Studio chỉ đọc ảnh từ folder đã chia sẻ bằng đường liên kết.' },
  { q: 'Tạo album nhanh khác gì không gian studio?', a: 'Tạo album nhanh không cần đăng nhập và album có hạn 15 hoặc 30 ngày. Không gian studio dành cho đội ngũ cần quản lý nhiều album, thành viên và các vòng duyệt.' },
  { q: 'Công cụ lọc file có tải ảnh lên máy chủ không?', a: 'Không. Công cụ chạy ngay trong trình duyệt, chỉ copy file sang thư mục đích và không xóa file nguồn.' },
]

export function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, '')
}
