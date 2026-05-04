# .NET API Design Reference

## API Styles Comparison

| Style | AOT | Performance | Complexity | Best for |
|-------|-----|------------|-----------|---------|
| Controllers | ❌ | Good | Medium | DDD/CQRS, enterprise, large teams |
| Minimal APIs | ✅ | Excellent | Low | Microservices, AOT, new projects |
| gRPC-Net | ✅ | Best (binary) | High | Internal service-to-service |
| GraphQL (HotChocolate) | Partial | Good | High | Flexible client-driven queries |

---

## Minimal API Patterns

### Route Groups + TypedResults

```csharp
// Route group — organizes related endpoints, applies shared config
var orders = app.MapGroup("/api/v1/orders")
    .WithTags("Orders")
    .WithOpenApi()
    .RequireAuthorization()
    .AddEndpointFilter<ValidationFilter>();

// TypedResults — explicit return types, AOT-compatible, better OpenAPI inference
orders.MapGet("/", async (
    [AsParameters] GetOrdersQuery query,
    ISender sender,
    CancellationToken ct) =>
        TypedResults.Ok(await sender.Send(query, ct)));

orders.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
{
    var result = await sender.Send(new GetOrderByIdQuery(id), ct);
    return result is null
        ? TypedResults.NotFound()
        : TypedResults.Ok(result);
})
.WithName("GetOrderById")
.Produces<OrderDto>()
.ProducesProblem(404);

orders.MapPost("/", async (CreateOrderCommand command, ISender sender, CancellationToken ct) =>
{
    var id = await sender.Send(command, ct);
    return TypedResults.CreatedAtRoute("GetOrderById", new { id });
})
.Accepts<CreateOrderCommand>("application/json");

orders.MapPut("/{id:guid}", async (Guid id, UpdateOrderCommand command,
    ISender sender, CancellationToken ct) =>
{
    if (id != command.Id) return Results.BadRequest("ID mismatch");
    var result = await sender.Send(command, ct);
    return result.IsSuccess ? TypedResults.Ok(result) : Results.BadRequest(result);
});

orders.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
{
    await sender.Send(new DeleteOrderCommand(id), ct);
    return TypedResults.NoContent();
});
```

### Endpoint Filters

```csharp
// Reusable validation filter (replaces [ApiController] auto-validation for Minimal APIs)
public class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var arg = ctx.Arguments.OfType<T>().FirstOrDefault();
        if (arg is not null)
        {
            var result = await validator.ValidateAsync(arg);
            if (!result.IsValid)
                return TypedResults.ValidationProblem(result.ToDictionary());
        }
        return await next(ctx);
    }
}

// Attach to specific endpoint
orders.MapPost("/", handler).AddEndpointFilter<ValidationFilter<CreateOrderCommand>>();
```

---

## Controller Patterns

```csharp
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
public class OrderController(ISender sender) : ControllerBase
{
    // ActionResult<T> — preferred over IActionResult for OpenAPI type inference
    [HttpGet]
    [ProducesResponseType<PagedResult<OrderSummaryDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<OrderSummaryDto>>> GetOrders(
        [FromQuery] GetOrdersQuery query, CancellationToken ct)
        => Ok(await sender.Send(query, ct));

    [HttpGet("{id:guid}", Name = "GetOrderById")]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderDto>> GetOrder(Guid id, CancellationToken ct)
    {
        var result = await sender.Send(new GetOrderByIdQuery(id), ct);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateOrder(
        [FromBody] CreateOrderCommand command, CancellationToken ct)
    {
        var id = await sender.Send(command, ct);
        return CreatedAtRoute("GetOrderById", new { id }, null);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateOrder(
        Guid id, [FromBody] UpdateOrderCommand command, CancellationToken ct)
    {
        if (id != command.Id) return BadRequest("ID mismatch");
        var result = await sender.Send(command, ct);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteOrder(Guid id, CancellationToken ct)
    {
        await sender.Send(new DeleteOrderCommand(id), ct);
        return NoContent();
    }
}
```

> **Rule:** Thin controllers — only delegate via `ISender`. No business logic. Singular noun (`OrderController`, not `OrdersController`).

---

## OpenAPI / Documentation

### .NET 8 — Swashbuckle

```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "My API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT"
    });
    // Include XML comments
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFile));
});

// Middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

### .NET 9 — Built-in OpenAPI + Scalar

```csharp
// Built-in, AOT-compatible
builder.Services.AddOpenApi();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // serves /openapi/v1.json
    app.MapScalarApiReference(); // Scalar UI at /scalar/v1
}
```

| | Swashbuckle | Microsoft.AspNetCore.OpenApi (.NET 9) |
|--|------------|--------------------------------------|
| AOT | ❌ | ✅ |
| Built-in | No (NuGet) | Yes |
| UI | Swagger UI | Scalar (via NuGet) |
| Recommendation | .NET 8 projects | .NET 9 + new projects |

---

## Error Handling — Problem Details

### IExceptionHandler (.NET 8+)

```csharp
// Global exception handler
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Unhandled exception");

        var (statusCode, title) = exception switch
        {
            NotFoundException => (404, "Resource not found"),
            ValidationException => (422, "Validation failed"),
            UnauthorizedAccessException => (401, "Unauthorized"),
            _ => (500, "Internal server error")
        };

        ctx.Response.StatusCode = statusCode;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = exception.Message,
            Instance = ctx.Request.Path
        }, ct);

        return true;
    }
}

// Registration
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
app.UseExceptionHandler();
```

---

## API Versioning

```csharp
// NuGet: Asp.Versioning.Mvc + Asp.Versioning.Mvc.ApiExplorer
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),          // /api/v1/orders
        new HeaderApiVersionReader("x-api-version"), // header
        new QueryStringApiVersionReader("api-version")); // ?api-version=1.0
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

// On controller
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
[ApiVersion("2.0")]
public class OrderController : ControllerBase
{
    [HttpGet, MapToApiVersion("1.0")]
    public IActionResult GetV1() => Ok("v1");

    [HttpGet, MapToApiVersion("2.0")]
    public IActionResult GetV2() => Ok("v2");
}
```

---

## Pagination

```csharp
// PagedResult<T> response pattern
public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int PageIndex,
    int PageSize)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasNextPage => PageIndex < TotalPages - 1;
}

// Offset-based (simple, EF Core)
var items = await context.Orders
    .AsNoTracking()
    .OrderBy(o => o.CreatedAt)
    .Skip(query.PageIndex * query.PageSize)
    .Take(query.PageSize)
    .ProjectToType<OrderSummaryDto>()
    .ToListAsync(ct);

var total = await context.Orders.CountAsync(ct);
return new PagedResult<OrderSummaryDto>(items, total, query.PageIndex, query.PageSize);

// Keyset pagination (cursor-based — better performance for large datasets)
var items = await context.Orders
    .AsNoTracking()
    .Where(o => o.CreatedAt > cursor) // cursor = last item's CreatedAt
    .OrderBy(o => o.CreatedAt)
    .Take(pageSize)
    .ToListAsync(ct);
```

---

## Rate Limiting (.NET 7+)

```csharp
builder.Services.AddRateLimiter(options =>
{
    // Fixed window — general API use
    options.AddFixedWindowLimiter("fixed", o =>
    {
        o.PermitLimit = 100;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 10;
    });

    // Token bucket — burst-tolerant
    options.AddTokenBucketLimiter("token-bucket", o =>
    {
        o.TokenLimit = 100;
        o.ReplenishmentPeriod = TimeSpan.FromSeconds(10);
        o.TokensPerPeriod = 10;
        o.AutoReplenishment = true;
    });

    // Sliding window
    options.AddSlidingWindowLimiter("sliding", o =>
    {
        o.PermitLimit = 100;
        o.Window = TimeSpan.FromMinutes(1);
        o.SegmentsPerWindow = 6;
    });

    // Per-user partitioned limiter (requires auth)
    options.AddPolicy("per-user", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString(),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 50,
                Window = TimeSpan.FromMinutes(1)
            }));

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.Headers.RetryAfter = "60";
        await ctx.HttpContext.Response.WriteAsJsonAsync(
            new ProblemDetails { Status = 429, Title = "Too many requests" }, ct);
    };
});

app.UseRateLimiter();

// Apply to endpoint
orders.MapPost("/", handler).RequireRateLimiting("per-user");
// Or attribute on controller action
[EnableRateLimiting("fixed")]
```

---

## gRPC-Net

```protobuf
// orders.proto
syntax = "proto3";
service OrderService {
  rpc GetOrder (GetOrderRequest) returns (OrderResponse);
  rpc GetOrders (GetOrdersRequest) returns (stream OrderResponse);
}
message GetOrderRequest { string id = 1; }
message OrderResponse { string id = 1; string status = 2; }
```

```csharp
// Service implementation
public class OrderGrpcService(ISender sender) : OrderService.OrderServiceBase
{
    public override async Task<OrderResponse> GetOrder(
        GetOrderRequest req, ServerCallContext ctx)
    {
        var order = await sender.Send(new GetOrderByIdQuery(Guid.Parse(req.Id)));
        return new OrderResponse { Id = order.Id.ToString(), Status = order.Status.ToString() };
    }
}

// Registration
builder.Services.AddGrpc();
app.MapGrpcService<OrderGrpcService>();
```

Use gRPC for: internal service-to-service, streaming, binary performance requirements.

---

## GraphQL — HotChocolate (brief)

```csharp
builder.Services
    .AddGraphQLServer()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddProjections()
    .AddFiltering()
    .AddSorting();

app.MapGraphQL(); // serves /graphql

public class Query
{
    [UseProjection, UseFiltering, UseSorting]
    public IQueryable<Order> GetOrders(AppDbContext db) => db.Orders.AsNoTracking();
}
```

Use when: flexible client-driven queries, multiple client types with different data needs, BFF pattern.
