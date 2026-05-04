---
description: Quy trình implement API theo từng layer
alwaysApply: true
---

# Quy Trình Implement API — Theo DDD + Clean Architecture

Thứ tự BẮT BUỘC: **Domain → Persistence → Application → Presentation**

---

## Bước 1: Domain Layer (`{Service}.Domain/{DomainName}/`)

### Tạo Aggregate Root

```csharp
public class {DomainName} : EventEntityAuditBase<Guid>, IAggregateRoot
{
    public string Name { get; private set; } = string.Empty;
    // ... properties với private setter

    private {DomainName}() { }  // EF Core

    private {DomainName}(string name, ...) 
    {
        CheckRule(new {DomainName}NameMustNotBeEmptyRule(name));
        Id = Guid.NewGuid();
        Name = name.Trim();
    }

    public static {DomainName} Create(string name, ...)
    {
        var entity = new {DomainName}(name, ...);
        entity.AddDomainEvent(new {DomainName}CreatedEvent(entity.Id, entity.Name));
        return entity;
    }

    public void Update(string name, ...) { /* validate + update + event */ }
    public void Delete() { MarkAsDeleted(); AddDomainEvent(new {DomainName}DeletedEvent(Id)); }
}
```

### Tạo các file đi kèm

| Thư mục | File | Pattern |
|---------|------|---------|
| `Events/` | `{DomainName}CreatedEvent.cs` | Kế thừa `DomainEvent`, past tense |
| `Events/` | `{DomainName}UpdatedEvent.cs` | |
| `Events/` | `{DomainName}DeletedEvent.cs` | |
| `Rules/` | `{Subject}Must{Condition}Rule.cs` | Implement `IBusinessRule` |
| `Enums/` | `{DomainName}Enum.cs` | PascalCase, explicit values từ 1 |
| `Exceptions/` | `{DomainName}NotFoundException.cs` | Kế thừa `NotFoundException` — **BẮT BUỘC** |
| `Entities/` | `{EntityName}.cs` | Kế thừa `EntityAuditBase<Guid>` |

---

## Bước 2: Persistence Layer (`{Service}.Persistence/`)

### 2.1 Table Names (`Constants/TableNames.cs`)

```csharp
internal const string {ModuleName}Schema = "{ModuleName}";
internal const string {DomainName} = nameof({DomainName});
```

### 2.2 Configuration (`Configurations/{DomainName}Configuration.cs`)

```csharp
public class {DomainName}Configuration : IEntityTypeConfiguration<{DomainName}>
{
    public void Configure(EntityTypeBuilder<{DomainName}> builder)
    {
        builder.ToTable(TableNames.{DomainName}, TableNames.{ModuleName}Schema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        // Relationships, indexes, owned entities...
    }
}
```

### 2.3 DbContext — thêm `DbSet<{DomainName}>` cho Aggregate Root

---

## Bước 3: Application Layer (`{Service}.Application/UserCases/{ApiVersion}/{DomainName}/`)

### Cấu trúc thư mục

```
Commands/Command.cs          # Tất cả commands trong 1 static class
Queries/Query.cs             # Tất cả queries trong 1 static class
Handlers/
  Create{DomainName}CommandHandler.cs
  Update{DomainName}CommandHandler.cs
  Delete{DomainName}CommandHandler.cs
  Get{DomainName}ByIdQueryHandler.cs
  Get{DomainName}sQueryHandler.cs
Validators/
  Create{DomainName}Validator.cs
  Update{DomainName}Validator.cs
Response.cs                  # Tất cả response DTOs trong 1 static class
```

### Commands

```csharp
public static class Command
{
    public record Create{DomainName}Command(string Name, ...) : ICommand;
    public record Update{DomainName}Command(Guid Id, string Name, ...) : ICommand;
    public record Delete{DomainName}Command(Guid Id) : ICommand;
}
```

### Queries

```csharp
public static class Query
{
    public record Get{DomainName}sQuery(
        string? SearchTerm, string? SortColumn, SortOrder? SortOrder,
        int PageIndex, int PageSize) : IQuery<PagedResult<Response.{DomainName}Response>>;
    public record Get{DomainName}ByIdQuery(Guid Id) : IQuery<Response.{DomainName}Response>;
}
```

### Handler template (Command)

```csharp
public sealed class Create{DomainName}CommandHandler : ICommandHandler<Command.Create{DomainName}Command>
{
    private readonly I{Module}RepositoryBase<{DomainName}, Guid> _repository;

    public Create{DomainName}CommandHandler(I{Module}RepositoryBase<{DomainName}, Guid> repository)
        => _repository = repository;

    public async Task<Result> Handle(Command.Create{DomainName}Command request, CancellationToken cancellationToken)
    {
        var entity = {DomainName}.Create(request.Name, ...);
        await _repository.AddAsync(entity, cancellationToken);
        return Result.Success();
    }
}
```

### Handler template (Query - GetById)

```csharp
public sealed class Get{DomainName}ByIdQueryHandler : IQueryHandler<Query.Get{DomainName}ByIdQuery, Response.{DomainName}Response>
{
    private readonly I{Module}RepositoryBase<{DomainName}, Guid> _repository;

    public async Task<Response.{DomainName}Response> Handle(Query.Get{DomainName}ByIdQuery request, CancellationToken cancellationToken)
    {
        var entity = await _repository.FindByIdAsync(request.Id, cancellationToken)
            ?? throw new {DomainName}NotFoundException(request.Id);
        return new Response.{DomainName}Response(entity.Id, entity.Name, ...);
    }
}
```

### Validator

```csharp
public class Create{DomainName}Validator : AbstractValidator<Command.Create{DomainName}Command>
{
    public Create{DomainName}Validator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
```

### Response

```csharp
public static class Response
{
    public record {DomainName}Response(Guid Id, string Name, ...);
}
```

---

## Bước 4: Presentation Layer (`{Service}.Presentation/Controllers/{ApiVersion}/`)

```csharp
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
public class {DomainName}Controller : ControllerBase
{
    private readonly ISender _sender;
    public {DomainName}Controller(ISender sender) => _sender = sender;

    [HttpPost]
    public async Task<IActionResult> Create{DomainName}([FromBody] Command.Create{DomainName}Command command)
    {
        var result = await _sender.Send(command);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpGet]
    public async Task<IActionResult> Get{DomainName}s([FromQuery] Query.Get{DomainName}sQuery query)
        => Ok(await _sender.Send(query));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get{DomainName}ById(Guid id)
        => Ok(await _sender.Send(new Query.Get{DomainName}ByIdQuery(id)));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update{DomainName}(Guid id, [FromBody] Command.Update{DomainName}Command command)
    {
        if (id != command.Id) return BadRequest("ID mismatch");
        var result = await _sender.Send(command);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete{DomainName}(Guid id)
    {
        var result = await _sender.Send(new Command.Delete{DomainName}Command(id));
        return result.IsSuccess ? NoContent() : BadRequest(result);
    }
}
```

**Controller rules:** Thin controller, chỉ delegate qua `ISender`. Singular noun (`DepartmentController`, KHÔNG `DepartmentsController`).
