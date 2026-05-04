# .NET Architecture Patterns Reference

## Clean Architecture (Ardalis) — Primary Pattern

### Folder Structure

```
src/
├── MyApp.Domain/
│   ├── Orders/
│   │   ├── Order.cs                    ← Aggregate Root
│   │   ├── Entities/
│   │   │   └── OrderItem.cs
│   │   ├── Events/
│   │   │   ├── OrderCreatedEvent.cs
│   │   │   └── OrderUpdatedEvent.cs
│   │   ├── Rules/
│   │   │   └── OrderMustHaveItemsRule.cs
│   │   ├── Enums/
│   │   │   └── OrderStatus.cs
│   │   ├── Exceptions/
│   │   │   └── OrderNotFoundException.cs
│   │   └── ValueObjects/
│   │       └── Money.cs
│   └── Interfaces/
│       └── IOrderRepository.cs         ← Defined in Domain, implemented in Infra
│
├── MyApp.Application/
│   ├── UseCases/V1/Orders/
│   │   ├── Commands/Command.cs
│   │   ├── Queries/Query.cs
│   │   ├── Handlers/
│   │   │   ├── CreateOrderCommandHandler.cs
│   │   │   └── GetOrderByIdQueryHandler.cs
│   │   ├── Validators/
│   │   │   └── CreateOrderValidator.cs
│   │   └── Response.cs
│   ├── Behaviors/
│   │   ├── ValidationPipelineBehavior.cs
│   │   ├── LoggingPipelineBehavior.cs
│   │   └── TransactionPipelineBehavior.cs
│   └── Interfaces/
│       └── ICurrentUserService.cs
│
├── MyApp.Infrastructure/
│   ├── Email/EmailService.cs
│   ├── Storage/S3StorageService.cs
│   └── Identity/CurrentUserService.cs
│
├── MyApp.Persistence/
│   ├── AppDbContext.cs
│   ├── Configurations/
│   │   └── OrderConfiguration.cs
│   ├── Repositories/
│   │   └── OrderRepository.cs
│   └── Migrations/
│
└── MyApp.WebApi/                        ← Entry point
    ├── Program.cs
    ├── Controllers/V1/
    │   └── OrderController.cs
    └── Middleware/
```

### Dependency Rule

```
Domain ← Application ← Infrastructure
Domain ← Application ← Persistence
Domain ← Application ← WebApi
```

Domain knows nothing about outer layers. Application defines interfaces; Infrastructure/Persistence implement them.

---

## Domain Layer — Building Blocks

### Aggregate Root (Factory Pattern)

```csharp
public class Order : EventEntityAuditBase<Guid>, IAggregateRoot
{
    public Guid CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; } = Money.Zero;
    private readonly List<OrderItem> _items = [];
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    private Order() { } // EF Core

    private Order(Guid customerId, IEnumerable<OrderItem> items)
    {
        CheckRule(new OrderMustHaveItemsRule(items));
        Id = Guid.NewGuid();
        CustomerId = customerId;
        Status = OrderStatus.Draft;
        _items.AddRange(items);
        Total = Money.Sum(items.Select(i => i.LineTotal));
    }

    public static Order Create(Guid customerId, IEnumerable<OrderItem> items)
    {
        var order = new Order(customerId, items);
        order.AddDomainEvent(new OrderCreatedEvent(order.Id, order.CustomerId));
        return order;
    }

    public void Submit()
    {
        CheckRule(new OrderMustBeDraftRule(Status));
        Status = OrderStatus.Submitted;
        AddDomainEvent(new OrderSubmittedEvent(Id));
    }
}
```

### Value Object

```csharp
public class Money : ValueObject
{
    public decimal Amount { get; }
    public string Currency { get; }
    public static readonly Money Zero = new(0, "VND");

    private Money(decimal amount, string currency)
    {
        if (amount < 0) throw new DomainException("Amount cannot be negative");
        Amount = amount;
        Currency = currency;
    }

    public static Money Of(decimal amount, string currency) => new(amount, currency);
    public static Money Sum(IEnumerable<Money> amounts)
        => new(amounts.Sum(m => m.Amount), amounts.First().Currency);

    protected override IEnumerable<object> GetEqualityComponents()
    {
        yield return Amount;
        yield return Currency;
    }
}
```

### Ardalis.Specification

```csharp
// Encapsulate query logic in Specification objects
public class ActiveOrdersByCustomerSpec : Specification<Order>
{
    public ActiveOrdersByCustomerSpec(Guid customerId)
    {
        Query
            .Where(o => o.CustomerId == customerId && o.Status != OrderStatus.Cancelled)
            .Include(o => o.Items)
            .OrderByDescending(o => o.CreatedAt)
            .Take(50);
    }
}

// In handler — no query logic leaking into application layer
var orders = await _repository.ListAsync(new ActiveOrdersByCustomerSpec(customerId), ct);
```

### Ardalis.Result

```csharp
// Domain/application layer returns Result instead of throwing for expected failures
public async Task<Result<OrderDto>> Handle(GetOrderByIdQuery query, CancellationToken ct)
{
    var order = await _repo.GetByIdAsync(query.Id, ct);
    if (order is null) return Result.NotFound($"Order {query.Id} not found");
    return Result.Success(order.Adapt<OrderDto>());
}

// Controller maps Result → HTTP
[HttpGet("{id:guid}")]
public async Task<IActionResult> GetOrder(Guid id, CancellationToken ct)
{
    var result = await _sender.Send(new GetOrderByIdQuery(id), ct);
    return result.Status switch
    {
        ResultStatus.Ok => Ok(result.Value),
        ResultStatus.NotFound => NotFound(result.Errors),
        ResultStatus.Invalid => BadRequest(result.ValidationErrors),
        _ => StatusCode(500)
    };
}
```

---

## CQRS with MediatR

```csharp
// Commands — change state, return Result or ID
public static class Command
{
    public record CreateOrderCommand(Guid CustomerId, List<OrderItemDto> Items)
        : IRequest<Result<Guid>>;

    public record UpdateOrderCommand(Guid Id, List<OrderItemDto> Items)
        : IRequest<Result>;

    public record DeleteOrderCommand(Guid Id) : IRequest<Result>;
}

// Queries — read-only, return data
public static class Query
{
    public record GetOrderByIdQuery(Guid Id) : IRequest<Result<OrderDto>>;
    public record GetOrdersQuery(
        string? SearchTerm, string? SortColumn, SortOrder? SortOrder,
        int PageIndex = 0, int PageSize = 20)
        : IRequest<PagedResult<OrderSummaryDto>>;
}

// IQuery marker — define once in Application layer to skip transaction
public interface IQuery { } // marker: queries implement this to bypass tx pipeline

// Pipeline Behavior — cross-cutting concern
public class TransactionBehavior<TRequest, TResponse>(AppDbContext db)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (request is IQuery) return await next(); // no tx for read-only queries

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            var response = await next();
            await tx.CommitAsync(ct);
            return response;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }
}
```

> **MediatR license note (2024):** MediatR went commercial. Alternatives:
> - **Wolverine** (OSS, high-perf, AOT, message bus) — best alternative
> - **SlimMessageBus** (OSS, lightweight, multi-transport)
> - **Mediator.SourceGenerator** (OSS, compile-time dispatch, zero overhead)

---

## Domain Events

```csharp
// Domain event dispatched after SaveChanges via interceptor or domain service
public class DomainEventDispatcherInterceptor(IPublisher publisher) : SaveChangesInterceptor
{
    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData data, int result, CancellationToken ct)
    {
        var entities = data.Context!.ChangeTracker.Entries<IHasDomainEvents>()
            .SelectMany(e => e.Entity.DomainEvents)
            .ToList();

        foreach (var entity in data.Context.ChangeTracker.Entries<IHasDomainEvents>())
            entity.Entity.ClearDomainEvents();

        foreach (var domainEvent in entities)
            await publisher.Publish(domainEvent, ct);

        return result;
    }
}
```

---

## Event-Driven Architecture

### Outbox Pattern

```csharp
// Store integration events in same DB transaction as domain changes
public class OutboxMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Type { get; init; } = string.Empty;
    public string Payload { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
}

// In handler: save domain + outbox atomically
var order = Order.Create(cmd.CustomerId, items);
_context.Orders.Add(order);
_context.OutboxMessages.Add(new OutboxMessage
{
    Type = nameof(OrderCreatedIntegrationEvent),
    Payload = JsonSerializer.Serialize(new OrderCreatedIntegrationEvent(order.Id))
});
await _context.SaveChangesAsync(ct); // both in same transaction

// Background job: poll outbox, publish to bus, mark processed
```

---

## Alternative Architectures

### Comparison

| Architecture | Structure | Best For | Tradeoffs |
|-------------|-----------|----------|-----------|
| Clean Architecture | Layer separation | Enterprise, DDD | More boilerplate |
| Vertical Slice | Feature folder | CQRS, fast delivery | Can duplicate logic |
| Modular Monolith | Domain modules | Growing teams | Module boundary discipline |
| Microservices | Independent services | Scale teams/services | Operational complexity |

### Vertical Slice (Jimmy Bogard)

```
Features/
├── Orders/
│   ├── CreateOrder/
│   │   ├── CreateOrderCommand.cs
│   │   ├── CreateOrderHandler.cs
│   │   ├── CreateOrderValidator.cs
│   │   └── CreateOrderEndpoint.cs
│   └── GetOrders/
│       ├── GetOrdersQuery.cs
│       └── GetOrdersHandler.cs
```

Each feature owns its own command + handler + validator + endpoint. No shared application layer.

### Modular Monolith (Steve Smith)

```
Modules/
├── Orders/
│   ├── Orders.Domain/
│   ├── Orders.Application/
│   ├── Orders.Persistence/
│   └── Orders.Endpoints/  ← exposes IEndpoint implementations
├── Catalog/
└── Payments/
Host/
└── MyApp.WebApi/          ← registers all modules, single deployment
```

---

## Microservices Patterns

### YARP API Gateway

```csharp
// NuGet: Yarp.ReverseProxy
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

// appsettings.json
// "ReverseProxy": {
//   "Routes": { "orders-route": { "ClusterId": "orders", "Match": { "Path": "/api/orders/{**catch-all}" } } },
//   "Clusters": { "orders": { "Destinations": { "orders/destination1": { "Address": "https://orders-service" } } } }
// }
```

### Saga (MassTransit)

```csharp
// Orchestration saga — single coordinator
public class OrderSaga : MassTransitStateMachine<OrderSagaState>
{
    // State + Event properties REQUIRED (MassTransit sets them via reflection)
    public State WaitingForPayment { get; private set; } = null!;
    public Event<OrderCreated> OrderCreated { get; private set; } = null!;
    public Event<PaymentConfirmed> PaymentConfirmed { get; private set; } = null!;

    public OrderSaga()
    {
        InstanceState(x => x.CurrentState);
        Event(() => OrderCreated, x => x.CorrelateById(m => m.Message.OrderId));
        Event(() => PaymentConfirmed, x => x.CorrelateById(m => m.Message.OrderId));

        Initially(
            When(OrderCreated)
                .Then(ctx => ctx.Saga.CustomerId = ctx.Message.CustomerId)
                .Publish(ctx => new ProcessPaymentCommand(ctx.Saga.CorrelationId))
                .TransitionTo(WaitingForPayment));

        During(WaitingForPayment,
            When(PaymentConfirmed)
                .TransitionTo(Completed)
                .Finalize());
    }
}
```
