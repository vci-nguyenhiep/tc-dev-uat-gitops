# .NET Technology Stack Reference

## C# & .NET Runtime

### C# 12 Key Features

```csharp
// Primary constructors — replaces boilerplate constructor + field declarations
public class OrderService(IOrderRepository repo, ILogger<OrderService> logger)
{
    public async Task<Order?> GetAsync(Guid id, CancellationToken ct)
        => await repo.GetByIdAsync(id, ct);
}

// Records for DTOs — immutable, value equality
public record CreateOrderDto(Guid CustomerId, List<OrderItemDto> Items);
public record OrderItemDto(Guid ProductId, int Quantity, decimal UnitPrice);

// required keyword — compile-time initialization enforcement
public class AppSettings
{
    public required string ConnectionString { get; init; }
    public required int MaxRetryCount { get; init; } = 3;
}

// Collection expressions
int[] primes = [2, 3, 5, 7, 11];
List<string> combined = [..existing, "new-item"];

// File-scoped namespaces
namespace MyApp.Domain.Orders;

// Pattern matching
string Classify(object obj) => obj switch
{
    Circle { Radius: > 10 } c => $"Large circle r={c.Radius}",
    Rectangle r => $"Rectangle {r.Width}x{r.Height}",
    null => "null",
    _ => obj.GetType().Name
};

// Nullable reference types (enable project-wide in .csproj)
// <Nullable>enable</Nullable>
```

### .NET 8 LTS vs .NET 9

| Feature | .NET 8 LTS | .NET 9 (STS) |
|---------|-----------|--------------|
| Support ends | Nov 2026 | May 2026 |
| HybridCache | Preview only | Stable GA |
| Built-in OpenAPI | No (Swashbuckle) | `Microsoft.AspNetCore.OpenApi` |
| EF Core | 8.0 (bulk ops, JSON cols, complex types) | 9.0 (GroupBy, param collections) |
| AOT | Partial | Improved |
| **Recommendation** | **Production default** | Greenfield / early adopters |

### CoreCLR vs Native AOT

| | CoreCLR (JIT) | Native AOT |
|--|--------------|------------|
| Startup time | 200–500 ms | 10–50 ms |
| Memory | Higher | 50–70% lower |
| Binary size | Runtime bundled | Single file, smaller |
| Reflection | Full | Limited (source gen only) |
| Dynamic code | Supported | Not supported |
| Best for | Enterprise DDD APIs | Microservices, CLI, serverless |

> **AOT caveats:** No `Activator.CreateInstance`, no runtime code gen, JSON must use `[JsonSerializable]` source generation, EF Core requires limited mode.

---

## Frameworks

### ASP.NET Core — Minimal APIs vs Controllers

| Criterion | Controllers | Minimal APIs |
|-----------|-------------|-------------|
| AOT compatible | ❌ | ✅ |
| Action filters | Full (`IActionFilter`, resource, exception) | `IEndpointFilter` only |
| Complex model binding | ✅ | `[AsParameters]` |
| DDD + CQRS fit | **Excellent** | Good |
| OpenAPI metadata | Xml comments + `[ProducesResponseType]` | `.WithOpenApi()`, `.Produces<T>()` |
| **Recommendation** | **Enterprise + DDD/CQRS stacks** | AOT + microservices + new projects |

---

## Databases

### SQL Server (Primary)

```csharp
// appsettings.json: "ConnectionStrings": { "Default": "Server=.;Database=App;Encrypt=True;" }

// Standard registration with pooling + retry on failure
builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("Default"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorNumbersToAdd: null)));

// Azure SQL with Managed Identity (passwordless — 2025 recommended)
var credential = new DefaultAzureCredential();
builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseSqlServer(connStr, sql =>
        sql.EnableRetryOnFailure())
    .AddInterceptors(new AzureSqlAuthTokenInterceptor(credential)));
```

### PostgreSQL (Npgsql)

```csharp
builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"),
        npgsql => npgsql.EnableRetryOnFailure()));
```

Choose when: open-source mandate, JSONB columns, PostGIS geospatial, Linux-first.

### MongoDB (.NET Driver)

```csharp
builder.Services.AddSingleton<IMongoClient>(
    new MongoClient(builder.Configuration.GetConnectionString("Mongo")));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("AppDb"));
```

Choose when: flexible/evolving schema, document-oriented data, horizontal sharding.

### Redis (StackExchange.Redis)

```csharp
// Distributed cache
builder.Services.AddStackExchangeRedisCache(opts =>
    opts.Configuration = builder.Configuration.GetConnectionString("Redis"));

// Direct connection for pub/sub, sorted sets
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis")!));
```

Use cases: `IDistributedCache`, session store, pub/sub, leaderboards, rate limiting counters.

---

## ORMs & Data Access

### EF Core 8/9 (Primary)

| Feature | Version |
|---------|---------|
| JSON columns | 7+ |
| Complex types (value objects, embedded, no PK) | 8 |
| Primitive collections | 8 |
| `ExecuteUpdateAsync` / `ExecuteDeleteAsync` | 7+ |
| Improved GroupBy SQL translation | 9 |
| Parameterized primitive collections (plan cache) | 9 |

```csharp
// EF Core 8+ Bulk update — no change tracking, no domain events fired
await context.Orders
    .Where(o => o.Status == OrderStatus.Pending && o.CreatedAt < cutoff)
    .ExecuteUpdateAsync(s => s
        .SetProperty(o => o.Status, OrderStatus.Expired)
        .SetProperty(o => o.ModifiedAt, DateTime.UtcNow), ct);

// EF Core 8 Complex type (Value Object embedded — no FK column needed)
builder.OwnsOne(o => o.Address, a =>
{
    a.Property(x => x.Street).HasMaxLength(200).IsRequired();
    a.Property(x => x.City).HasMaxLength(100).IsRequired();
    a.Property(x => x.PostalCode).HasMaxLength(20);
});
```

### Dapper (Hybrid Pattern)

```csharp
// Use Dapper for complex analytics / CTEs / multi-join reporting
public async Task<IReadOnlyList<SalesReportDto>> GetSalesReportAsync(
    DateTime from, DateTime to, CancellationToken ct)
{
    const string sql = """
        WITH MonthlySales AS (
            SELECT CustomerId, SUM(Total) AS Total, MONTH(CreatedAt) AS Month
            FROM Orders
            WHERE CreatedAt BETWEEN @from AND @to
            GROUP BY CustomerId, MONTH(CreatedAt)
        )
        SELECT c.Name, ms.Total, ms.Month
        FROM MonthlySales ms
        INNER JOIN Customers c ON c.Id = ms.CustomerId
        ORDER BY ms.Total DESC
        """;
    await using var conn = new SqlConnection(_connectionString);
    return (await conn.QueryAsync<SalesReportDto>(sql, new { from, to })).ToList();
}
```

> **Rule:** EF Core for writes + transactional reads. Dapper for complex reports, CTEs, analytics.

---

## Message Queues & Event Streaming

### Azure Service Bus + MassTransit

```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<OrderCreatedConsumer>();
    x.UsingAzureServiceBus((ctx, cfg) =>
    {
        cfg.Host(builder.Configuration["ServiceBus:ConnectionString"]);
        cfg.ConfigureEndpoints(ctx);
    });
});

// Consumer
public class OrderCreatedConsumer(ILogger<OrderCreatedConsumer> logger)
    : IConsumer<OrderCreatedEvent>
{
    public async Task Consume(ConsumeContext<OrderCreatedEvent> context)
    {
        logger.LogInformation("Order {OrderId} created", context.Message.OrderId);
        await Task.CompletedTask;
    }
}
```

### RabbitMQ + MassTransit

```csharp
x.UsingRabbitMq((ctx, cfg) =>
{
    cfg.Host("rabbitmq://localhost", h =>
    {
        h.Username("guest"); h.Password("guest");
    });
    cfg.ConfigureEndpoints(ctx);
});
```

### Apache Kafka (Confluent.Kafka)

```csharp
var producer = new ProducerBuilder<string, string>(
    new ProducerConfig { BootstrapServers = "localhost:9092" }).Build();
await producer.ProduceAsync("orders", new Message<string, string>
{
    Key = orderId.ToString(), Value = JsonSerializer.Serialize(evt)
});
```

| Choice | When |
|--------|------|
| Azure Service Bus | Azure-native, reliable delivery, deadletter |
| RabbitMQ | On-prem/cross-cloud, flexible routing |
| Kafka | High-volume event streams, event sourcing, replay |

---

## Background Jobs

```csharp
// BackgroundService — built-in, simple periodic task
public class SessionCleanupService(IServiceScopeFactory scopeFactory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Sessions
                .Where(s => s.ExpiresAt < DateTime.UtcNow)
                .ExecuteDeleteAsync(stoppingToken);
        }
    }
}

// Channel<T> — high-throughput in-process producer-consumer
var channel = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(1000)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = false,
    SingleWriter = false
});
// Producer: await channel.Writer.WriteAsync(item, ct);
// Consumer: await foreach (var item in channel.Reader.ReadAllAsync(ct))
```

| Tool | Persistence | Dashboard | Cron | Clustering |
|------|------------|----------|------|-----------|
| `BackgroundService` | ❌ | ❌ | Manual | ❌ |
| `Channel<T>` | ❌ | ❌ | ❌ | ❌ |
| Hangfire | ✅ SQL | ✅ | ✅ | ✅ |
| Quartz.NET | ✅ | Optional | ✅ cron | ✅ |

---

## Validation

```csharp
// FluentValidation — preferred for complex, server-side rules
public class CreateOrderValidator : AbstractValidator<CreateOrderDto>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty()
            .Must(i => i.Count <= 100).WithMessage("Max 100 items per order");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(x => x.Quantity).GreaterThan(0);
            item.RuleFor(x => x.UnitPrice).GreaterThan(0);
        });
    }
}
builder.Services.AddValidatorsFromAssemblyContaining<CreateOrderValidator>();
```

---

## Object Mapping

| Library | Status | Notes |
|---------|--------|-------|
| Mapster | **Recommended** | Fast, free MIT, code-gen, `ProjectToType<T>()` |
| AutoMapper | Declining | Still widely used, heavier, profile-based |
| Manual mapping | Trend | YAGNI — explicit, debuggable, no magic |

```csharp
// Mapster — direct adapt
var dto = order.Adapt<OrderDto>();

// Mapster — EF Core projection (no loading full entity)
var dtos = await context.Orders
    .Where(o => o.CustomerId == customerId)
    .ProjectToType<OrderSummaryDto>()
    .ToListAsync(ct);
```

---

## Mediator Pattern

| Library | License | Notes |
|---------|---------|-------|
| MediatR | ⚠️ **Commercial (2024)** | Widely used; `ISender`, `IPipelineBehavior` |
| Wolverine | OSS MIT | High-perf, AOT, message bus built-in |
| SlimMessageBus | OSS MIT | Lightweight, multi-transport |
| Mediator.SourceGenerator | OSS MIT | Compile-time dispatch, zero runtime overhead |

```csharp
// MediatR — command + handler (still dominant in ecosystem)
public record CreateOrderCommand(Guid CustomerId, List<OrderItemDto> Items)
    : IRequest<Guid>;

public sealed class CreateOrderHandler(IOrderRepository repo)
    : IRequestHandler<CreateOrderCommand, Guid>
{
    public async Task<Guid> Handle(CreateOrderCommand cmd, CancellationToken ct)
    {
        var order = Order.Create(cmd.CustomerId, cmd.Items);
        await repo.AddAsync(order, ct);
        return order.Id;
    }
}

// Pipeline behavior for cross-cutting (validation, logging, transaction)
public class ValidationBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request,
        RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var failures = validators
            .Select(v => v.Validate(request))
            .SelectMany(r => r.Errors)
            .Where(e => e != null)
            .ToList();

        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```
