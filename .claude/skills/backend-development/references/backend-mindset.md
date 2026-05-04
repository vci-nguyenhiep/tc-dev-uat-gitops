# .NET Backend Developer Mindset

## Core Engineering Principles

### YAGNI — You Ain't Gonna Need It

Build what's needed today, not speculative future requirements.

```csharp
// ❌ Generic plugin system "in case we need it later"
public interface IPluginExecutor<TPlugin, TInput, TOutput> { ... }

// ✅ Solve the actual problem
public class OrderProcessor
{
    public async Task ProcessAsync(Order order, CancellationToken ct) { ... }
}
```

**When to generalize:** Three concrete instances of the same pattern. Not one, not two.

### KISS — Keep It Simple

Simple code outlives clever code. Optimize for the reader who sees this in 6 months.

```csharp
// ❌ Clever one-liner that requires 3 minutes to parse
var result = orders.Where(o => o.Items.Any(i => i.Price > threshold)).GroupBy(o => o.CustomerId).ToDictionary(g => g.Key, g => g.Sum(o => o.Total));

// ✅ Readable, scannable
var expensiveOrders = orders
    .Where(o => o.Items.Any(i => i.Price > threshold));

var totalByCustomer = expensiveOrders
    .GroupBy(o => o.CustomerId)
    .ToDictionary(g => g.Key, g => g.Sum(o => o.Total));
```

### DRY — Don't Repeat Yourself

Extract when you see the same logic 3+ times. Not preemptively.

### Fail Fast

Validate inputs at system boundaries. Surface errors immediately. Don't propagate invalid state deep into the system.

```csharp
public async Task<Order> CreateAsync(CreateOrderDto dto, CancellationToken ct)
{
    ArgumentNullException.ThrowIfNull(dto);
    if (!dto.Items.Any()) throw new DomainException("Order must have at least one item");
    // ... rest of logic with clean state
}
```

### Make It Work → Make It Right → Make It Fast

1. **Work:** correct behavior, passes tests
2. **Right:** clean code, good abstractions, maintainable
3. **Fast:** optimize only with profiling data — not intuition

---

## Architectural Thinking

**Before coding:**
- Can I explain this feature in one sentence? If not, clarify requirements first.
- What are the failure modes? What happens when the database is unavailable?
- What data will exist in 3 years? Design for volume.
- Is this backward-compatible? Database migrations must allow zero-downtime deploys.

**Draw before code:**
- Sequence diagram for complex multi-service flows
- Entity diagram when domain model is unclear
- Dependency diagram when adding a new layer

**Strangler Fig Pattern:** When modernizing legacy systems, wrap new functionality around the old code. Don't attempt big-bang rewrites. Route traffic incrementally.

---

## Code Review Mindset

**As the author:**
- Write the PR description for the reviewer's context, not yours
- Explain WHY, not what (the diff shows what)
- Self-review before requesting — read your diff as a stranger

**As the reviewer:**
- Understand the intent before criticizing the implementation
- Suggest, don't dictate: "Consider using X here because..." vs "Use X"
- Security lens: can an attacker abuse this input/output?
- Performance lens: any N+1, missing indexes, unbounded queries?
- Praise good work — positive reinforcement builds better teams

---

## .NET Learning Path

Sequential stages — master each before moving:

1. **C# Fundamentals** — LINQ, async/await, generics, interfaces, nullability
2. **ASP.NET Core** — Controllers, Minimal APIs, middleware, DI, routing
3. **EF Core** — Migrations, relationships, queries, performance, configurations
4. **Patterns** — Repository, CQRS, Clean Architecture, MediatR
5. **Security** — OWASP, ASP.NET Identity, JWT, DataProtection
6. **Testing** — xUnit, NSubstitute, WebApplicationFactory, TestContainers
7. **Performance** — Caching, profiling, BenchmarkDotNet, EF Core optimization
8. **Cloud & DevOps** — Azure services, Docker, GitHub Actions, CI/CD
9. **Advanced** — Native AOT, gRPC, microservices, event-driven, Saga

---

## Community & Resources

### Essential Blogs

| Person | Focus | Link |
|--------|-------|------|
| Andrew Lock | ASP.NET Core internals, deep dives | andrewlock.net |
| Nick Chapsas | Practical .NET patterns (YouTube) | youtube.com/@nickchapsas |
| Milan Jovanović | Clean Architecture, DDD | milanjovanovic.tech |
| Khalid Abuhakmeh | EF Core, OSS .NET | khalidabuhakmeh.com |
| David Fowler | ASP.NET Core core team | github.com/davidfowl |
| Mark Seemann | Functional FP for OO devs, API design | blog.ploeh.dk |

### Reference Projects (Read the source)

- [`ardalis/CleanArchitecture`](https://github.com/ardalis/CleanArchitecture) — Clean Architecture template
- [`dotnet-architecture/eShopOnWeb`](https://github.com/dotnet-architecture/eShopOnWeb) — Microsoft reference app
- [`jasontaylordev/CleanArchitecture`](https://github.com/jasontaylordev/CleanArchitecture) — Jason Taylor template
- [`dotnet/aspnetcore`](https://github.com/dotnet/aspnetcore) — ASP.NET Core source (learn from the masters)

### Newsletters & Communities

- **.NET Weekly** — dotnettips.newsletter
- **C# Digest** — csharpdigest.net
- **r/dotnet** — Reddit community
- **.NET Foundation Discord**

---

## Collaboration Practices

### Architecture Decision Records (ADR)

Document significant technical decisions:

```markdown
# ADR-001: Use Clean Architecture

**Status:** Accepted
**Date:** 2026-04-23
**Context:** Team needs consistent structure for growing codebase.
**Decision:** Adopt Clean Architecture (Ardalis template).
**Consequences:** More initial boilerplate; better long-term maintainability.
```

### PR Descriptions

```markdown
## Why
User authentication was storing sessions in memory — doesn't survive app restarts and
breaks in multi-instance deployments.

## What
Replace in-memory session store with Redis-backed distributed cache.

## Testing
- All existing auth tests pass
- Added integration test with Redis TestContainer verifying session persistence across
  simulated restart
- Load tested with 500 concurrent users — no session loss observed
```

### Spec Before Code

Write the interface/contract before the implementation:

```csharp
// Write this first — agree on the shape of the solution
public interface IPaymentService
{
    Task<PaymentResult> ChargeAsync(Guid orderId, PaymentMethod method, CancellationToken ct);
    Task<RefundResult> RefundAsync(Guid transactionId, decimal amount, CancellationToken ct);
}
// Then implement — much clearer what success looks like
```

---

## Continuous Improvement

```csharp
// Benchmark before optimizing — never guess
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net90)]
public class QueryBenchmarks
{
    [Benchmark(Baseline = true)]
    public async Task GetOrders_EfCore() => ...;

    [Benchmark]
    public async Task GetOrders_Dapper() => ...;

    [Benchmark]
    public async Task GetOrders_CompiledQuery() => ...;
}
// dotnet run -c Release -- --filter "*QueryBenchmarks*"
```

**Blameless post-mortems:** After incidents, focus on systemic improvements, not individual blame. "The system allowed this to happen" → fix the system.

**Technical debt tracking:** Don't ignore it. Track it. Schedule it. A codebase that never pays down tech debt eventually becomes unmaintainable.
