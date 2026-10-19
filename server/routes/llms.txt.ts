import { FAQS, ORGANIZATION, PUBLIC_PAGES, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, WORKFLOW_STEPS } from '~~/shared/site'

// Plain-language summary for AI assistants and answer engines (https://llmstxt.org).
export default defineEventHandler((event) => {
  const origin = siteUrl(event)
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NAME} là sản phẩm của ${ORGANIZATION.legalName} (${ORGANIZATION.name}, ${ORGANIZATION.url}). Giao diện tiếng Việt, chạy trên trình duyệt, tối ưu cho điện thoại.`,
    '',
    '## Trang chính',
    '',
    ...PUBLIC_PAGES.map(page => `- [${page.title}](${origin}${page.path}): ${page.description}`),
    '',
    '## Cách hoạt động',
    '',
    ...WORKFLOW_STEPS.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`),
    '',
    '## Câu hỏi thường gặp',
    '',
    ...FAQS.flatMap(item => [`### ${item.q}`, '', item.a, '']),
    '## Liên hệ',
    '',
    `- Email: ${ORGANIZATION.email}`,
    `- Điện thoại: ${ORGANIZATION.telephone}`,
    `- Địa chỉ: ${ORGANIZATION.address.streetAddress}, ${ORGANIZATION.address.addressLocality}`,
    '',
  ].join('\n')
})
