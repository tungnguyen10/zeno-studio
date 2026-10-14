Quy tắc đầy đủ nằm trong `AGENTS.md` ở root repo.

## Tóm tắt rule cốt lõi

- `.agents/` là nguồn duy nhất; sửa file thật, không sửa qua symlink.
- Theo Nuxt 4, Vue 3, Pinia và Tailwind CSS v4 đang cài; xác minh skill theo đúng version.
- Với Vue/UI, đọc `.agents/instructions/ui.instructions.md`; component hóa theo reuse/complexity, không refactor hàng loạt.
- Với server/API, đọc `.agents/instructions/server-api.instructions.md`; validate input, authorize trước data và giữ RLS context.
- Ưu tiên primitive HTML semantic/accessibility; không tự thêm UI library hoặc dependency.
- Giữ behavior/contracts hiện có; chạy typecheck và test phù hợp khi đổi behavior.
- Không áp dụng máy móc skill nếu trái project spec hoặc scope người dùng.
- Không duplicate hướng dẫn đầy đủ trong `.github/`, `.codex/` hay `.claude/`.
