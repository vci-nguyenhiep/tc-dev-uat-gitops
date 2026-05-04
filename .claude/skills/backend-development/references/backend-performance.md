# .NET Performance & Scalability Reference

## Caching

### IMemoryCache (In-Process)

```csharp
builder.Services.AddMemoryCache(opts => opts.SizeLimit = 1024);

public class ProductCache(IMemoryCache cache, IProductRepository repo)
{
    private static readonly MemoryCacheEntryOptions DefaultOptions = new()
    {
        SlidingExpiration = TimeSpan.FromMinutes(5),
        AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1),
        Size = 1,
        Priority = CacheItemPriority.Normal
    };

    public async Task<Product?> GetAsync(Guid id, CancellationToken ct)
        => await cache.GetOrCreateAsync($"product:{id}", async entry =>
        {
            entry.SetOptions(DefaultOptions);
            return await repo.GetByIdAsync(id, ct);
        });
}
```

### IDistributedCache (Redis)

```csharp
builder.Services.AddStackExchangeRedisCache(opts =>
{
    opts.Configuration = builder.Configuration.GetConnectionString("Redis");
    opts.InstanceName = "app:";
});

public class DistributedProductCache(IDistributedCache cache)
{
    private static readonly DistributedCacheEntryOptions Options = new()
    {
        SlidingExpiration = TimeSpan.FromMinutes(10),
        AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2)
    };

    public async Task<Product?> GetAsync(Guid id, CancellationToken ct)
    {
        var bytes = await cache.GetAsync($"product:{id}", ct);
        return bytes is null ? null : JsonSerializer.Deserialize<Product>(bytes);
    }

    public async Task SetAsync(Product product, CancellationToken ct)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(product);
        await cache.SetAsync($"product:{product.Id}", bytes, Options, ct);
    }

    public async Task RemoveAsync(Guid id, CancellationToken ct)
        => await cache.RemoveAsync($"product:{id}", ct);
}
```

### Output Caching (.NET 7+)

```csharp
builder.Services.AddOutputCache(opts =>
{
    opts.AddBasePolicy(b => b.Expire(TimeSpan.FromSeconds(30)));
    opts.AddPolicy("products", b => b
        .Expire(TimeSpan.FromMinutes(5))
        .Tag("products")
        .VaryByRouteValue("id")
        .VaryByHeader("Accept-Language"));
});
app.UseOutputCache();

// Apply to endpoint
[HttpGet]
[OutputCache(PolicyName = "products")]
public async Task<IActionResult> GetProducts(...) { ... }

// Invalidate by tag (e.g., after product update)
await _outputCacheStore.EvictByTagAsync("products", ct);
```

### HybridCache (.NET 9 GA, .NET 8 Preview)

```csharp
// L1 (in-process) + L2 (distributed) — stampede protection built-in
builder.Services.AddHybridCache(opts =>
{
    opts.MaximumPayloadBytes = 1024 * 1024; // 1MB max per entry
    opts.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(30),
        LocalCacheExpiration = TimeSpan.FromMinutes(5) // L1 TTL
    };
});

public class ProductService(HybridCache cache, IProductRepository repo)
{
    public async ValueTask<Product?> GetAsync(Guid id, CancellationToken ct)
        => await cache.GetOrCreateAsync(
            $"product:{id}",
            async ct => await repo.GetByIdAsync(id, ct),
            cancellationToken: ct);

    public async Task InvalidateAsync(Guid id, CancellationToken ct)
        => await cache.RemoveAsync($"product:{id}", ct);
}
```

---

## EF Core Optimization

### Core Read Optimization Patterns

```csharp
// 1. AsNoTracking — always for read-only queries
var orders = await context.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);

// 2. Projection — never return full entities to API layer
var summaries = await context.Orders
    .AsNoTracking()
    .Where(o => o.Status == OrderStatus.Active)
    .Select(o => new OrderSummaryDto(o.Id, o.CreatedAt, o.Total, o.Status))
    .ToListAsync(ct);

// 3. AsSplitQuery — prevents cartesian explosion on multiple Includes
var orders = await context.Orders
    .AsNoTracking()
    .AsSplitQuery()
    .Include(o => o.Items).ThenInclude(i => i.Product)
    .Include(o => o.Customer)
    .ToListAsync(ct);
```

### Compiled Queries (Hot Paths)

```csharp
// Compiled once, reused for repeated identical queries
private static readonly Func<AppDbContext, Guid, Task<Order?>> GetOrderById =
    EF.CompileAsyncQuery((AppDbContext db, Guid id) =>
        db.Orders.AsNoTracking().FirstOrDefault(o => o.Id == id));

// Usage
var order = await GetOrderById(context, orderId);
```

### Bulk Operations (.NET 8+)

```csharp
// ExecuteUpdateAsync — bypass change tracking, no domain events
await context.Orders
    .Where(o => o.ExpiresAt < DateTime.UtcNow && o.Status == OrderStatus.Pending)
    .ExecuteUpdateAsync(s => s
        .SetProperty(o => o.Status, OrderStatus.Expired)
        .SetProperty(o => o.ModifiedAt, DateTime.UtcNow), ct);

// ExecuteDeleteAsync
await context.Sessions
    .Where(s => s.ExpiresAt < DateTime.UtcNow)
    .ExecuteDeleteAsync(ct);
```

> **Warning:** `ExecuteUpdateAsync`/`ExecuteDeleteAsync` bypass Change Tracker — domain events are NOT raised. Use `MarkAsDeleted()` + `SaveChanges()` when domain events matter.

### DbContext Pool

```csharp
// AddDbContextPool — reuse DbContext instances instead of creating new
builder.Services.AddDbContextPool<AppDbContext>(
    options => options.UseSqlServer(connStr),
    poolSize: 1024); // default is 1024
```

### Indexing in Configuration

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");
        builder.HasIndex(o => o.CustomerId); // single column
        builder.HasIndex(o => new { o.CustomerId, o.Status }); // composite
        builder.HasIndex(o => o.CreatedAt)
            .HasFilter("[DeletedAt] IS NULL"); // filtered index
        builder.HasIndex(o => o.Code).IsUnique();
    }
}
```

### N+1 Prevention

```csharp
// ❌ N+1 — separate query per order
foreach (var order in orders)
{
    var items = await context.OrderItems.Where(i => i.OrderId == order.Id).ToListAsync();
}

// ✅ Include — single JOIN query
var orders = await context.Orders
    .Include(o => o.Items)
    .ThenInclude(i => i.Product)
    .ToListAsync(ct);

// ✅ Projection — only load what's needed
var result = await context.Orders
    .Select(o => new { o.Id, ItemCount = o.Items.Count })
    .ToListAsync(ct);
```

---

## Async Patterns

```csharp
// ValueTask<T> — when frequently synchronous (cached result path)
public ValueTask<Order?> GetFromCacheAsync(Guid id)
{
    if (_cache.TryGetValue(id, out var order))
        return ValueTask.FromResult(order); // sync path, no allocation
    return new ValueTask<Order?>(FetchFromDbAsync(id));
}

// ConfigureAwait(false) — in library code only (not ASP.NET Core app code)
public async Task<T> LibraryMethodAsync<T>()
{
    var data = await _client.GetAsync(url).ConfigureAwait(false);
    return data; // no SynchronizationContext capture needed in library
}

// IAsyncEnumerable<T> — streaming large result sets
public async IAsyncEnumerable<OrderDto> StreamOrdersAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    await foreach (var order in context.Orders.AsAsyncEnumerable().WithCancellation(ct))
        yield return order.Adapt<OrderDto>();
}

// ❌ Never block on async — deadlock risk
var result = someAsyncMethod().Result;   // NO
someAsyncMethod().Wait();                 // NO
```

---

## Background Processing

```csharp
// PeriodicTimer — cleaner than Task.Delay in BackgroundService
public class EmailDigestService(IServiceScopeFactory factory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            using var scope = factory.CreateScope();
            await scope.ServiceProvider
                .GetRequiredService<IEmailService>()
                .SendDigestAsync(stoppingToken);
        }
    }
}

// Channel<T> — high-throughput producer-consumer
public class WorkQueue
{
    private readonly Channel<WorkItem> _channel = Channel.CreateBounded<WorkItem>(
        new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.Wait });

    public ValueTask EnqueueAsync(WorkItem item, CancellationToken ct)
        => _channel.Writer.WriteAsync(item, ct);

    public IAsyncEnumerable<WorkItem> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}
```

| Tool | Persistence | Retry | Cron | Dashboard |
|------|------------|-------|------|-----------|
| BackgroundService | ❌ | Manual | Manual | ❌ |
| Channel<T> | ❌ | ❌ | ❌ | ❌ |
| Hangfire | ✅ SQL | ✅ | ✅ | ✅ |
| Quartz.NET | ✅ | ✅ | ✅ cron | Optional |

---

## Load Balancing & Scaling

- **Azure App Service:** Scale Out rules on CPU % or HTTP queue depth. Deployment slots for blue-green.
- **AKS HPA:** `kubectl autoscale deployment api --cpu-percent=70 --min=2 --max=10`
- **SignalR Scale-out:** Redis backplane for sticky-session-free horizontal scaling:

```csharp
builder.Services.AddSignalR()
    .AddStackExchangeRedis(builder.Configuration.GetConnectionString("Redis")!);
```

---

## Native AOT & ReadyToRun

```xml
<!-- ReadyToRun — pre-compiled, faster startup, JIT still available -->
<PropertyGroup>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>

<!-- Native AOT — no JIT, fastest startup, most restricted -->
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <InvariantGlobalization>true</InvariantGlobalization>
</PropertyGroup>
```

> **Prefer ReadyToRun** for enterprise APIs. **Native AOT** only for CLI tools, Azure Functions, or latency-critical microservices with no reflection dependencies.
