# Rule index for Claude Code — Backend

## Auto-loaded rules (trong `.claude/rules/be-rules/`)
- `architecture.md`: kiến trúc dự án + DDD building blocks (gộp từ architecture + ddd-explain).
- `implement-step.md`: quy trình implement API theo từng layer Domain → Persistence → Application → Presentation.

## Review docs (trong `.claude/docs/` — KHÔNG auto-load)
- `review-code.md`: naming conventions và code review rules.
- `web-api-code-review-process.md`: quy trình review chuyên sâu 9 phases.

> **Tech Lead**: Khi review code, đọc thủ công bằng Read tool:
> `.claude/docs/review-code.md` và `.claude/docs/web-api-code-review-process.md`

## File selection logic
- **Giải thích kiến trúc / DDD** → `architecture.md`
- **Tạo mới API / feature / module** → `implement-step.md` (+ `architecture.md` nếu cần)
- **Review code / PR** → Tech Lead đọc `.claude/docs/review-code.md` + `.claude/docs/web-api-code-review-process.md`

## Review priority
1. Naming
2. Architecture compliance
3. CQRS and mediator patterns
4. SOLID
5. Persistence and EF Core
6. Metrics / complexity
