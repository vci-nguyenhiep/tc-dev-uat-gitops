---
description: Kiến trúc dự án và DDD building blocks
alwaysApply: true
---

# Kiến Trúc & DDD — TC Payroll System

## Tổng quan

Dự án sử dụng **Clean Architecture + DDD + CQRS**. Mỗi service có 6 layer:

```
src/
├── BuildingBlocks/           # Shared: contracts, infrastructure, DTOs
└── Services/
    └── {ServiceName}/
        ├── {Service}.API/           # Entry point, DI, middlewares
        ├── {Service}.Application/   # CQRS handlers, validators
        ├── {Service}.Domain/        # Entities, events, rules
        ├── {Service}.Infrastructure/ # External services (auth, cache, hubs)
        ├── {Service}.Persistence/   # EF Core, configurations, migrations
        └── {Service}.Presentation/  # Controllers
```

## Dependency Flow

```
API → Presentation → Application → Domain
         ↓               ↓
  Infrastructure → Persistence → BuildingBlocks
```

- **Domain** không depend vào layer nào khác
- **Application** chỉ depend vào Domain
- **Persistence / Infrastructure** depend vào Application + Domain
- **API** orchestrate tất cả

## BuildingBlocks

| Package | Chứa gì |
|---------|---------|
| **Contacts** | DDD base classes (`EntityBase`, `EventEntityAuditBase`, `ValueObject`, `DomainEvent`, `IBusinessRule`, `IAggregateRoot`), repository interfaces (`IRepositoryBase`, `IUnitOfWork`), message contracts (`ICommand`, `IQuery`) |
| **Infrastructures** | MediatR pipeline behaviors (validation, logging, transaction), EF interceptors (audit, user tracking), base repository |
| **Shared** | Shared DTOs, utility helpers |

## DDD Building Blocks — Quy tắc

### Entity & Aggregate Root

```csharp
// Aggregate Root: EventEntityAuditBase + IAggregateRoot
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
{
    public string FullName { get; private set; }         // Private setter BẮT BUỘC
    private Employee() { }                                // EF Core constructor
    public static Employee Create(...)                    // Factory method BẮT BUỘC
    {
        CheckRule(new EmailMustBeValidRule(email));
        var employee = new Employee(...);
        employee.AddDomainEvent(new EmployeeCreatedEvent(...));
        return employee;
    }
    public void Update(...) { /* Business logic */ }
}

// Entity con: EntityAuditBase (KHÔNG IAggregateRoot)
public class ContactInfo : EntityAuditBase<Guid> { ... }
```

**Quy tắc:**
- Private setters, factory methods, domain events — KHÔNG anemic model
- Aggregate Root là entry point duy nhất, reference cross-aggregate bằng ID
- Mỗi transaction chỉ modify 1 aggregate

### Domain Events
- Kế thừa `DomainEvent`
- Pattern: `{DomainName}{Action}Event` — past tense (`Created`, `Updated`, `Deleted`)

### Business Rules
- Implement `IBusinessRule` với `IsBroken()` và `Message`
- Pattern: `{Subject}Must{Condition}Rule`
- Gọi bằng `CheckRule(new ...())` trong entity/value object

### Value Objects
- Kế thừa `ValueObject` — immutable, equality by values
- Không suffix `ValueObject` hoặc `VO`

### Exceptions
- Luôn tạo `{DomainName}NotFoundException` kế thừa `NotFoundException`

## Domain Folder Structure

```
{Service}.Domain/{DomainName}/
├── {AggregateRoot}.cs
├── Entities/
├── Events/
├── Rules/
├── Enums/
├── Exceptions/
└── ValueObjects/
```

## Cross-Cutting Concerns (auto-configured)

- **Validation**: FluentValidation + `ValidationPipelineBehavior`
- **Transaction**: `TransactionPipelineBehavior` — auto commit/rollback
- **Logging**: Serilog + `RequestLoggingPipelineBehavior`
- **Audit**: `UpdateAuditableEntitiesInterceptor` tự cập nhật `CreatedDate`, `ModifiedDate`
- **Soft Delete**: `MarkAsDeleted()` trên `EntityAuditBase`
