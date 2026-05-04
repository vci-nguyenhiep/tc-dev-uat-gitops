# .NET Code Quality Reference

## SOLID Principles (C# Examples)

### S — Single Responsibility

```csharp
// ❌ One class doing too much
public class OrderService
{
    public Order Create(CreateOrderDto dto) { /* business logic */ }
    public void SendConfirmationEmail(Order order) { /* email logic */ }
    public byte[] ExportToPdf(Order order) { /* PDF generation */ }
}

// ✅ Separate by concern
public class OrderService(IEmailService email, IPdfService pdf)
{
    public Order Create(CreateOrderDto dto) { /* only business logic */ }
}
public class OrderEmailService { public void SendConfirmation(Order order) { } }
public class OrderPdfExporter { public byte[] Export(Order order) { } }
```

### O — Open/Closed

```csharp
// ✅ Extend via strategy, don't modify existing
public interface IDiscountStrategy
{
    decimal Apply(decimal price, Customer customer);
}

public class LoyaltyDiscount : IDiscountStrategy
{
    public decimal Apply(decimal price, Customer c)
        => c.LoyaltyYears >= 5 ? price * 0.9m : price;
}

public class SeasonalDiscount : IDiscountStrategy
{
    public decimal Apply(decimal price, Customer _) => price * 0.85m;
}

public class PriceCalculator(IEnumerable<IDiscountStrategy> strategies)
{
    public decimal Calculate(decimal price, Customer customer)
        => strategies.Aggregate(price, (p, s) => s.Apply(p, customer));
}
```

### L — Liskov Substitution

```csharp
// ✅ Subtypes must be substitutable
public abstract class Shape { public abstract double Area(); }
public class Circle(double radius) : Shape
{
    public override double Area() => Math.PI * radius * radius;
}
// Contract: Area() always >= 0 — subtypes must honor this
```

### I — Interface Segregation

```csharp
// ❌ Fat interface forces implementors to throw NotImplementedException
public interface IRepository<T>
{
    T? GetById(Guid id);
    IEnumerable<T> GetAll();
    void Add(T entity);
    void Update(T entity);
    void Delete(T entity);
    IEnumerable<T> Search(string query); // not all repos need this
}

// ✅ Narrow interfaces
public interface IReadRepository<T> { Task<T?> GetByIdAsync(Guid id, CancellationToken ct); }
public interface IWriteRepository<T> { Task AddAsync(T entity, CancellationToken ct); }
public interface IRepository<T> : IReadRepository<T>, IWriteRepository<T> { }
```

### D — Dependency Inversion

```csharp
// ✅ Depend on abstractions, registered in DI
public class OrderService(IOrderRepository repo, IEmailService email)
{
    // No `new OrderRepository()` — injected by container
}

// Registration
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddScoped<IEmailService, SendGridEmailService>();
```

---

## C# 12 Modern Features

```csharp
// Primary constructors — DI pattern, eliminates boilerplate
public class OrderHandler(
    IOrderRepository repo,
    ILogger<OrderHandler> logger,
    ICurrentUserService currentUser)
{
    public async Task<Guid> HandleAsync(CreateOrderCommand cmd, CancellationToken ct)
    {
        logger.LogInformation("Creating order for {CustomerId}", cmd.CustomerId);
        var order = Order.Create(cmd.CustomerId, cmd.Items);
        await repo.AddAsync(order, ct);
        return order.Id;
    }
}

// Records — immutable DTOs with value equality
public record CreateOrderDto(Guid CustomerId, List<OrderItemDto> Items);
public record OrderSummaryDto(Guid Id, DateTime CreatedAt, decimal Total, OrderStatus Status);

// required — enforce initialization
public class AppConfig
{
    public required string ConnectionString { get; init; }
    public required string JwtSecret { get; init; }
    public int MaxRetries { get; init; } = 3; // optional with default
}

// Collection expressions
List<string> roles = ["User", "Manager"];
string[] headers = [..defaultHeaders, "X-Custom-Header"];

// Pattern matching (powerful switch expressions)
string GetStatusMessage(OrderStatus status) => status switch
{
    OrderStatus.Draft => "Order not submitted yet",
    OrderStatus.Submitted or OrderStatus.Processing => "Order is being processed",
    OrderStatus.Completed => "Order completed",
    OrderStatus.Cancelled => "Order was cancelled",
    _ => throw new ArgumentOutOfRangeException(nameof(status))
};

// Nullable reference types — enable project-wide
// <Nullable>enable</Nullable> in .csproj
public string? FindEmail(Guid userId) => _users.GetValueOrDefault(userId)?.Email;
```

---

## Design Patterns

### Options Pattern (Typed Config)

```csharp
// Typed options class
public class JwtOptions
{
    public const string SectionName = "Jwt";
    public required string SecretKey { get; init; }
    public required string Issuer { get; init; }
    public required string Audience { get; init; }
    public int ExpiryMinutes { get; init; } = 15;
}

// Registration
builder.Services.AddOptions<JwtOptions>()
    .BindConfiguration(JwtOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Usage — prefer IOptions<T> for singleton, IOptionsSnapshot<T> for scoped
public class TokenService(IOptions<JwtOptions> jwtOptions)
{
    private readonly JwtOptions _jwt = jwtOptions.Value;
}
```

### Repository + Specification

```csharp
// Generic repository (implemented once)
public class Repository<T>(AppDbContext db) : IRepositoryBase<T>
    where T : class
{
    public async Task<T?> GetByIdAsync(Guid id, CancellationToken ct)
        => await db.Set<T>().FindAsync([id], ct);

    public async Task<IReadOnlyList<T>> ListAsync(
        ISpecification<T> spec, CancellationToken ct)
        => await ApplySpecification(spec).AsNoTracking().ToListAsync(ct);

    private IQueryable<T> ApplySpecification(ISpecification<T> spec)
        => SpecificationEvaluator.Default.GetQuery(db.Set<T>().AsQueryable(), spec);
}
```

### Decorator Pattern (Scrutor)

```csharp
// NuGet: Scrutor — adds Decorate extension to IServiceCollection
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.Decorate<IOrderRepository, CachedOrderRepository>();

// CachedOrderRepository wraps OrderRepository transparently
public class CachedOrderRepository(IOrderRepository inner, IMemoryCache cache)
    : IOrderRepository
{
    public async Task<Order?> GetByIdAsync(Guid id, CancellationToken ct)
        => await cache.GetOrCreateAsync($"order:{id}",
            _ => inner.GetByIdAsync(id, ct));
}
```

---

## Roslyn Analyzers & Code Analysis

```xml
<!-- .csproj — enable full analysis -->
<PropertyGroup>
  <Nullable>enable</Nullable>
  <AnalysisMode>All</AnalysisMode>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  <WarningsAsErrors />
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>

<ItemGroup>
  <PackageReference Include="StyleCop.Analyzers" Version="1.2.*">
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
  <PackageReference Include="SonarAnalyzer.CSharp" Version="9.*">
    <PrivateAssets>all</PrivateAssets>
  </PackageReference>
</ItemGroup>
```

```ini
# .editorconfig — configure severity per rule
[*.cs]
dotnet_diagnostic.CA1062.severity = warning      # Validate non-null parameters
dotnet_diagnostic.CA2007.severity = suggestion    # ConfigureAwait in library
dotnet_diagnostic.CS8618.severity = error         # Non-nullable uninitialized
dotnet_diagnostic.IDE0055.severity = suggestion   # Formatting fix

# Naming conventions
dotnet_naming_rule.private_fields_should_be_camel.severity = warning
dotnet_naming_symbols.private_fields.applicable_kinds = field
dotnet_naming_symbols.private_fields.applicable_accessibilities = private
dotnet_naming_style.camel_case_underscore.required_prefix = _
```

---

## Code Review Checklist

### Null Handling
- [ ] Nullable reference types enabled — no `#nullable disable` without reason
- [ ] Guard clauses for public API parameters: `ArgumentNullException.ThrowIfNull(param)`
- [ ] `?.` and `??` used correctly — no unchecked null dereference
- [ ] Repository return types use `T?` for possibly-null responses

### Async/Await
- [ ] No `.Result` or `.Wait()` blocking calls
- [ ] `CancellationToken` accepted and propagated through entire call chain
- [ ] `ConfigureAwait(false)` in library code, not required in ASP.NET Core app code
- [ ] `async void` only for event handlers (never in service/handler code)
- [ ] `IAsyncDisposable` used with `await using`

### Resource Management
- [ ] `IDisposable` wrapped with `using` or `await using`
- [ ] `HttpClient` never instantiated directly — use `IHttpClientFactory`
- [ ] `DbContext` Scoped lifecycle — never Singleton or static

### Exception Handling
- [ ] Catch specific exceptions, not `catch (Exception)` unless re-throwing
- [ ] Never swallow exceptions silently (empty catch block)
- [ ] Domain exceptions for business rule violations, not `ArgumentException`

### Security
- [ ] No hardcoded secrets, connection strings, API keys
- [ ] EF Core queries use parameterized approach (automatic) — no `FromSqlRaw` with interpolation
- [ ] Sensitive data masked before logging (email, phone, SSN)

### EF Core
- [ ] `AsNoTracking()` on all read-only queries
- [ ] No lazy loading in API handlers (N+1 risk) — use `Include`/`Select`
- [ ] `DbContext` not injected into Singleton services — use `IDbContextFactory<T>`
- [ ] Bulk operations use `ExecuteUpdateAsync`/`ExecuteDeleteAsync` where appropriate

### Clean Code
- [ ] Method length ≤ 20 lines (guideline, not rule)
- [ ] No magic numbers — use `const`, `enum`, or named variables
- [ ] Guard clauses over nested if/else
- [ ] Names are self-documenting — no `x`, `tmp`, `data` in production code
