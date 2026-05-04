# .NET Debugging & Observability Reference

## CLI Diagnostic Tools

| Tool | Purpose | Command |
|------|---------|---------|
| `dotnet-trace` | CPU trace, call stacks | `dotnet-trace collect -p <PID> --providers Microsoft-DotNETCore-SampleProfiler` |
| `dotnet-counters` | Live metrics (CPU, GC, threadpool) | `dotnet-counters monitor -p <PID> System.Runtime` |
| `dotnet-dump` | Memory/crash dump | `dotnet-dump collect -p <PID> -o ./dump.dmp` |
| `dotnet-gcdump` | GC heap dump (lighter) | `dotnet-gcdump collect -p <PID>` |
| `dotnet-monitor` | REST API for remote diagnostics | `dotnet-monitor collect` (sidecar in k8s) |

```bash
# Install all tools
dotnet tool install --global dotnet-trace
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-dump
dotnet tool install --global dotnet-gcdump
dotnet tool install --global dotnet-monitor

# Analyze a dump
dotnet-dump analyze ./dump.dmp
# Inside analysis: clrstack, dumpheap -stat, gcroot <addr>
```

---

## OpenTelemetry .NET

```csharp
// Full OTel setup — traces + metrics + logs
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(
        serviceName: "MyApp.WebApi",
        serviceVersion: "1.0.0"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(opts =>
        {
            opts.RecordException = true;
            opts.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");
        })
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation(opts => opts.SetDbStatementForText = true)
        .AddSource("MyApp.*") // custom ActivitySource
        .AddOtlpExporter(opts =>
            opts.Endpoint = new Uri(builder.Configuration["OTel:Endpoint"]!)))
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter("MyApp.*")
        .AddOtlpExporter())
    .WithLogging(logging => logging
        .AddOtlpExporter());

// Custom activity (manual spans)
private static readonly ActivitySource _activitySource = new("MyApp.OrderService");

public async Task<Order> ProcessOrderAsync(Guid orderId, CancellationToken ct)
{
    using var activity = _activitySource.StartActivity("ProcessOrder");
    activity?.SetTag("order.id", orderId);
    activity?.SetTag("order.service", "payment");

    try
    {
        var order = await _repo.GetByIdAsync(orderId, ct);
        activity?.SetTag("order.status", order?.Status.ToString());
        return order!;
    }
    catch (Exception ex)
    {
        activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
        activity?.RecordException(ex);
        throw;
    }
}

// Custom metrics
private static readonly Meter _meter = new("MyApp.Orders");
private static readonly Counter<long> _ordersCreated =
    _meter.CreateCounter<long>("orders.created", "orders", "Total orders created");
private static readonly Histogram<double> _processingTime =
    _meter.CreateHistogram<double>("order.processing.ms", "ms");

public void RecordOrderCreated(string region)
    => _ordersCreated.Add(1, new TagList { { "region", region } });
```

---

## Application Insights

```csharp
builder.Services.AddApplicationInsightsTelemetry(
    builder.Configuration["ApplicationInsights:ConnectionString"]);

// Custom telemetry
public class OrderService(TelemetryClient telemetry)
{
    public void TrackOrderCreated(Guid orderId, decimal total)
    {
        telemetry.TrackEvent("OrderCreated", new Dictionary<string, string>
        {
            ["OrderId"] = orderId.ToString(),
            ["Region"] = _currentUser.Region
        },
        new Dictionary<string, double>
        {
            ["OrderTotal"] = (double)total
        });
    }

    public void TrackOrderFailed(Guid orderId, Exception ex)
    {
        telemetry.TrackException(ex, new Dictionary<string, string>
        {
            ["OrderId"] = orderId.ToString()
        });
    }
}
```

---

## Serilog

```csharp
// Program.cs
builder.Host.UseSerilog((ctx, services, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext()
    .Enrich.WithMachineName()
    .Enrich.WithProperty("Application", "MyApp.WebApi")
    .WriteTo.Console(new JsonFormatter())
    .WriteTo.Seq(ctx.Configuration["Seq:Url"] ?? "http://localhost:5341")
    .WriteTo.ApplicationInsights(
        services.GetRequiredService<TelemetryConfiguration>(),
        TelemetryConverter.Traces));
```

```json
// appsettings.json — Serilog config
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.EntityFrameworkCore": "Warning",
        "System": "Warning"
      }
    }
  }
}
```

### Structured Logging Rules

```csharp
// ✅ Message templates — structured, queryable
logger.LogInformation("Order {OrderId} created for customer {CustomerId}",
    order.Id, order.CustomerId);

logger.LogWarning("Payment failed for order {OrderId}. Attempt {AttemptCount}/{MaxAttempts}",
    orderId, attempt, maxAttempts);

// ❌ String interpolation — loses structure, not queryable in Seq/App Insights
logger.LogInformation($"Order {order.Id} created"); // DON'T

// ❌ Never log PII
logger.LogInformation("User {Email} logged in with password {Password}", email, password); // NEVER
// ✅ Mask PII
logger.LogInformation("User {UserId} logged in from {IpAddress}", userId, ipAddress);
```

### Log Level Guidelines

| Level | When to use |
|-------|------------|
| **Debug** | Detailed diagnostic info (dev only, disabled in prod) |
| **Information** | Normal flow events (request received, order created) |
| **Warning** | Unexpected but handled (retry attempted, cache miss) |
| **Error** | Unhandled failures requiring attention (DB timeout, external API down) |
| **Critical** | System-wide failures (startup failure, data corruption) |

---

## Correlation ID Middleware

```csharp
public class CorrelationIdMiddleware(RequestDelegate next)
{
    private const string CorrelationIdHeader = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers[CorrelationIdHeader].FirstOrDefault()
            ?? Activity.Current?.TraceId.ToString()
            ?? Guid.NewGuid().ToString("N");

        context.Response.Headers[CorrelationIdHeader] = correlationId;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        using (var activity = new Activity("Request")
            .AddBaggage("correlation.id", correlationId)
            .Start())
        {
            await next(context);
        }
    }
}

// Register before routing
app.UseMiddleware<CorrelationIdMiddleware>();
```

---

## Common .NET Issues

### Async Deadlock

```csharp
// ❌ .Result / .Wait() in synchronous context — deadlock in old ASP.NET
var result = service.GetOrderAsync(id).Result; // DEADLOCK RISK

// ✅ Always await async methods
var result = await service.GetOrderAsync(id);
```

### Memory Leaks

```csharp
// ❌ Event handler subscription without unsubscription
publisher.OnOrderCreated += HandleOrderCreated; // if publisher outlives subscriber → leak

// ✅ Unsubscribe in Dispose
public void Dispose() => publisher.OnOrderCreated -= HandleOrderCreated;

// ❌ Large objects in static fields
private static readonly List<byte[]> _cache = new(); // grows forever

// ✅ Use bounded cache (IMemoryCache with size limit)
```

### DbContext Lifetime Issues

```csharp
// ❌ Singleton DbContext — shared across requests, not thread-safe
builder.Services.AddSingleton<AppDbContext>(); // WRONG

// ✅ Scoped (one per request)
builder.Services.AddDbContext<AppDbContext>(); // default = Scoped

// ✅ For Singleton/BackgroundService — use factory
builder.Services.AddDbContextFactory<AppDbContext>();

public class BackgroundWorker(IDbContextFactory<AppDbContext> factory)
{
    using var db = await factory.CreateDbContextAsync(ct);
}
```

### Connection Pool Exhaustion

```csharp
// ❌ HttpClient instantiation per request — exhausts ports (socket exhaustion)
using var client = new HttpClient(); // DON'T do per-request

// ✅ IHttpClientFactory — reuses pooled connections
builder.Services.AddHttpClient<IOrderApiClient, OrderApiClient>(client =>
    client.BaseAddress = new Uri("https://api.example.com"));

// ❌ DbContext from Singleton — creates new pool connections
// ✅ Use AddDbContextPool<T>() + Scoped lifetime
```

### GC Pressure

```csharp
// ❌ Frequent allocations in hot paths
foreach (var item in items)
{
    var buffer = new byte[1024]; // allocates per iteration
    ProcessItem(item, buffer);
}

// ✅ ArrayPool for reusable buffers
var pool = ArrayPool<byte>.Shared;
var buffer = pool.Rent(1024);
try { ProcessItems(items, buffer); }
finally { pool.Return(buffer); }

// ✅ Span<T> for stack-allocated or sliced memory
ReadOnlySpan<byte> slice = buffer.AsSpan(0, actualLength);
```
