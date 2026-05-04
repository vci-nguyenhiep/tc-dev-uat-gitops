---
description: Quy trình code review chuyên nghiệp cho Web API .NET Core theo Clean Architecture, DDD và CQRS
alwaysApply: false
---

# 📋 PROFESSIONAL WEB API .NET CODE REVIEW PROCESS

Comprehensive workflow for reviewing .NET Web API code theo **Clean Architecture**, **Domain-Driven Design (DDD)**, và **CQRS patterns** với time allocations và detailed checklists.

## 🔍 **OVERVIEW**

### 🔥 **Priority Order (ALWAYS follow this sequence):**

1. **🏷️ NAMING REVIEW** - HIGHEST PRIORITY 🔥
2. **🏗️ ARCHITECTURE COMPLIANCE** - Clean Architecture & DDD patterns
3. **🔄 CQRS & MEDIATOR** - Command/Query patterns
4. **⚖️ SOLID PRINCIPLES** - Architecture quality
5. **🎨 DESIGN PATTERNS** - Pattern appropriateness
6. **💾 PERSISTENCE & EF CORE** - Data access patterns
7. **📊 CODE METRICS** - Complexity analysis
8. **📝 DOCUMENTATION** - Comments & XML docs

---

## 🎯 **Mẹo và cách quy tắc: Tư duy TỔNG THỂ**

Mục đích để có chất lượng mã nguồn hiệu quả khi tồn tại độc lập. Hãy tìm kiếm các mối liên hệ:

- **Tên không rõ ràng (naming)** thường đi kèm với logic phức tạp và vi phạm **SRP (SOLID)**
- **Handler quá dài (metrics)** thường là một **God Handler**, vi phạm **SRP (SOLID)** và cần được tái cấu trúc theo **Domain Logic Delegation**

- **Việc tạo đối tượng trực tiếp "new Service()"** thay vì inject (vi phạm **DIP - SOLID**) sẽ làm giảm khả năng **kiểm thử (Testability)**

Khi bạn phát hiện một vấn đề, hãy tự hỏi: "Nó có phải là triệu chứng của một vấn đề lớn về kiến trúc không?".

---

## 🏷️ **PHASE 1: NAMING REVIEW - HIGHEST PRIORITY**

### 📏 **Rules: ALWAYS REVIEW NAMING FIRST**

**Good naming is the foundation of maintainable code. Poor naming makes even well-structured code difficult to understand.**

### 🔧 **Naming Review Process:**

#### 🔧 **Step 1: Domain Layer Names**

```csharp
// ❌ BAD NAMING - Generic, unclear, abbreviated
public class DataMgr { }                                   // → EmployeeManager
public class Helper { }                                    // → EmailValidationHelper
public class Processor { }                                 // → PayrollCalculationProcessor
public class Info { }                                      // → ContactInfo

// ✅ GOOD NAMING - Clear, specific, domain-appropriate
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot { }     // Clear aggregate root
public class ContactInfo : EntityAuditBase<Guid> { }                       // Clear entity purpose
public class EmployeeCreatedEvent : DomainEvent { }                        // Clear domain event
public class EmailMustBeValidRule : IBusinessRule { }                      // Clear business rule
```

#### 🔧 **Step 2: Application Layer Names**

```csharp
// ❌ BAD NAMING - Vague verbs, generic actions
public void Process() { }                                  // → CreateEmployee()
public string GetInfo() { }                                // → GetEmployeeDetails()
public bool Check() { }                                    // → ValidateEmployeeEmail()
public void DoWork() { }                                   // → CalculatePayroll()

// ✅ GOOD NAMING - Specific verbs, clear actions
public record CreateEmployeeCommand(...) : ICommand;                       // Clear command purpose
public record GetEmployeesQuery(...) : IQuery<PagedResult<EmployeeResponse>>; // Clear query + return type
public class CreateEmployeeCommandHandler : ICommandHandler<...> { }       // Clear handler responsibility
public class CreateEmployeeValidator : AbstractValidator<...> { }          // Clear validation purpose
```

#### 🔧 **Step 3: Persistence Layer Names**

```csharp
// ❌ BAD NAMING - Abbreviated, unclear, generic
public class EmpConfig { }                                 // → EmployeeConfiguration
public const string TBL_EMP = "employees";               // → Employee
public class Repo { }                                     // → EmployeeRepository

// ✅ GOOD NAMING - Clear purpose and context
public class EmployeeConfiguration : IEntityTypeConfiguration<Employee> { }
internal const string Employee = nameof(Employee);
private readonly IRepositoryBase<Employee, Guid> _employeeRepository;
```

#### 🔧 **Step 4: API Layer Names**

```csharp
// ❌ BAD NAMING - Inconsistent, unclear
public class EmployeesController { }                      // → EmployeeController (singular)
public async Task<IActionResult> Get() { }                // → GetEmployees()
public async Task<IActionResult> Create() { }             // → CreateEmployee()

// ✅ GOOD NAMING - Clear, RESTful, consistent
[Route("api/v{version:apiVersion}/[controller]")]
public class EmployeeController : ControllerBase
{
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command) { }
    public async Task<IActionResult> GetEmployees([FromQuery] GetEmployeesQuery query) { }
    public async Task<IActionResult> GetEmployeeById(Guid id) { }
}
```

### 📋 **Naming Review Checklist:**

- ✅ **Domain Classes**: Express clear purpose and responsibility?
- ✅ **Commands/Queries**: Use specific verbs describing exact actions?
- ✅ **Handlers**: Match command/query names exactly?
- ✅ **Validators**: Clear validation purpose?
- ✅ **Controllers**: Use singular domain names?
- ✅ **No Generic Names**: "Manager", "Helper" without domain context
- ✅ **No Abbreviations**: "Emp", "Dept", "Repo" without clear meaning
- ✅ **Consistent Terminology**: Same concepts use same names
- ✅ **Domain Appropriate**: Use business terminology
- ✅ **Future Maintainer Friendly**: Others can understand names

---

## 🏗️ **PHASE 2: ARCHITECTURE COMPLIANCE**

### 📐 **Critical Rules:**

1. **Clean Architecture Layer Separation** - Dependencies point inward
2. **DDD Patterns** - Rich domain models with business logic
3. **CQRS Separation** - Commands vs Queries clearly separated
4. **Dependency Injection** - No direct instantiation in business logic

### 🔧 **Review Examples:**

#### 🏗️ **Domain Layer Compliance:**

```csharp
// ✅ CORRECT - Rich Domain Model
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
{
    public string FullName { get; private set; } = string.Empty;
    public ContactInfo ContactInfo { get; private set; }
    public bool IsActive { get; private set; } = true;

    // Factory method
    public static Employee Create(string fullName, ContactInfo contactInfo)
    {
        CheckRule(new EmployeeNameMustNotBeEmptyRule(fullName));
        CheckRule(new EmailMustBeValidRule(contactInfo.Email));

        var employee = new Employee(fullName, contactInfo);
        employee.AddDomainEvent(new EmployeeCreatedEvent(employee.Id, employee.FullName));
        return employee;
    }

    // Business methods
    public void UpdateContactInfo(ContactInfo contactInfo)
    {
        CheckRule(new EmailMustBeValidRule(contactInfo.Email));
        ContactInfo = contactInfo;
        AddDomainEvent(new EmployeeContactUpdatedEvent(Id, contactInfo.Email));
    }
}

// ❌ WRONG - Anemic Domain Model
public class Employee : EntityAuditBase<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    // No business logic, just data container
}
```

#### 🏗️ **Application Layer Compliance:**

```csharp
// ✅ CORRECT - CQRS with MediatR
public sealed class CreateEmployeeCommandHandler : ICommandHandler<CreateEmployeeCommand>
{
    private readonly IRepositoryBase<Employee, Guid> _employeeRepository;

    public CreateEmployeeCommandHandler(IRepositoryBase<Employee, Guid> employeeRepository)
    {
        _employeeRepository = employeeRepository;
    }

    public async Task<Result> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)
    {
        // 1. Create domain entity using factory method
        var contactInfo = new ContactInfo(request.Email, request.Phone);
        var employee = Employee.Create(request.FullName, contactInfo);

        // 2. Save through repository
        await _employeeRepository.AddAsync(employee, cancellationToken);

        return Result.Success();
    }
}

// ❌ WRONG - Direct instantiation và mixed concerns
public class EmployeeService
{
    public async Task<Result> CreateEmployee(CreateEmployeeCommand request)
    {
        var dbContext = new ApplicationDbContext(); // Direct instantiation!
        var employee = new Employee(); // Anemic creation
        employee.FullName = request.FullName;
        employee.Email = request.Email;

        dbContext.Employees.Add(employee);
        await dbContext.SaveChangesAsync();

        return Result.Success();
    }
}
```

### 📋 **Architecture Compliance Checklist:**

- ✅ **Domain Layer**: Rich entities with business logic?
- ✅ **Application Layer**: Commands/Queries with handlers?
- ✅ **Persistence Layer**: Repository pattern implementation?
- ✅ **Presentation Layer**: Thin controllers with MediatR?
- ✅ **Dependency Direction**: Dependencies point toward domain?
- ✅ **DDD Patterns**: Aggregates, entities, value objects properly used?
- ✅ **Domain Events**: Business events for side effects?
- ✅ **Business Rules**: Explicit rule validation?

---

## 🔄 **PHASE 3: CQRS & MEDIATOR PATTERNS**

### 🔍 **Review Focus Areas:**

#### 🔄 **Command/Query Separation:**

```csharp
// ✅ CORRECT - Clear CQRS separation
public static class Command
{
    public record CreateEmployeeCommand(string FullName, string Email, string Phone) : ICommand;
    public record UpdateEmployeeCommand(Guid Id, string FullName, string Email) : ICommand;
    public record DeleteEmployeeCommand(Guid Id) : ICommand;
}

public static class Query
{
    public record GetEmployeesQuery(
        string? SearchTerm,
        string? SortColumn,
        SortOrder? SortOrder,
        int PageIndex,
        int PageSize) : IQuery<PagedResult<EmployeeResponse>>;

    public record GetEmployeeByIdQuery(Guid Id) : IQuery<EmployeeResponse>;
}

// ❌ WRONG - Mixed command/query responsibilities
public record EmployeeRequest(
    Guid? Id, // For both create and update
    string FullName,
    string Email,
    string Action) : ICommand; // Unclear action
```

#### 🔄 **Handler Implementation:**

```csharp
// ✅ CORRECT - Single responsibility handler
public sealed class GetEmployeesQueryHandler : IQueryHandler<GetEmployeesQuery, PagedResult<EmployeeResponse>>
{
    private readonly IRepositoryBase<Employee, Guid> _employeeRepository;

    public GetEmployeesQueryHandler(IRepositoryBase<Employee, Guid> employeeRepository)
    {
        _employeeRepository = employeeRepository;
    }

    public async Task<PagedResult<EmployeeResponse>> Handle(GetEmployeesQuery request, CancellationToken cancellationToken)
    {
        var query = _employeeRepository.FindAll();

        // Apply filters
        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            query = query.Where(x => x.FullName.Contains(request.SearchTerm) ||
                                   x.ContactInfo.Email.Contains(request.SearchTerm));
        }

        // Apply sorting
        if (!string.IsNullOrWhiteSpace(request.SortColumn))
        {
            query = query.ApplySorting(request.SortColumn, request.SortOrder);
        }

        // Apply pagination and projection
        var employees = await query
            .Skip((request.PageIndex - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new EmployeeResponse(
                x.Id,
                x.FullName,
                x.ContactInfo.Email,
                x.IsActive))
            .ToListAsync(cancellationToken);

        var totalCount = await query.CountAsync(cancellationToken);

        return new PagedResult<EmployeeResponse>(employees, totalCount, request.PageIndex, request.PageSize);
    }
}
```

### 📋 **CQRS/MediatR Checklist:**

- ✅ **Command/Query Separation**: Clear distinction between mutations and reads?
- ✅ **Handler Responsibility**: Each handler has single responsibility?
- ✅ **MediatR Integration**: Proper ISender usage in controllers?
- ✅ **Pipeline Behaviors**: Validation, logging, transaction behaviors configured?
- ✅ **Response DTOs**: Proper projection from domain to DTOs?
- ✅ **Async/Await**: Consistent async pattern usage?

---

## ⚖️ **PHASE 4: SOLID PRINCIPLES REVIEW**

### 🔍 **⚖️ SOLID Principles Quick Assessment:**

#### 🔥 **1. Single Responsibility (SRP):**

- ✅ Each handler has **single reason to change**?
- ✅ **No God Handlers** with multiple business logic concerns?
- ✅ **Clear separation**: Commands, Queries, Domain Logic, Persistence?

**Common Violations:**

```csharp
// ❌ BAD - Handler with multiple responsibilities
public class EmployeeCommandHandler
{
    public async Task<Result> Handle(CreateEmployeeCommand request)
    {
        // Validation logic (should be in validator)
        if (string.IsNullOrEmpty(request.FullName))
            return Result.Failure("Name required");

        // Business logic (should be in domain)
        var employee = new Employee();
        employee.FullName = request.FullName;

        // Email logic (should be separate service)
        await _emailService.SendWelcomeEmail(employee.Email);

        // Persistence logic (should be in repository)
        _dbContext.Employees.Add(employee);
        await _dbContext.SaveChangesAsync();

        return Result.Success();
    }
}

// ✅ GOOD - Single responsibility each
public sealed class CreateEmployeeCommandHandler : ICommandHandler<CreateEmployeeCommand>
{
    private readonly IRepositoryBase<Employee, Guid> _employeeRepository;

    public async Task<Result> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)
    {
        // Only orchestration - business logic is in domain
        var contactInfo = new ContactInfo(request.Email, request.Phone);
        var employee = Employee.Create(request.FullName, contactInfo);

        await _employeeRepository.AddAsync(employee, cancellationToken);

        return Result.Success();
    }
}
```

#### **2. Open/Closed (OCP):**

- ✅ **Extension via interfaces** instead of modification?
- ✅ **Strategy pattern** for varying business rules?
- ✅ **Repository abstraction** for data access?

#### **3. Liskov Substitution (LSP):**

- ✅ **Interface implementations** substitutable?
- ✅ **Inheritance hierarchies** maintain contracts?

#### **4. Interface Segregation (ISP):**

- ✅ **Focused interfaces** with minimal methods?
- ✅ **No fat interfaces** forcing unused dependencies?

#### **5. Dependency Inversion (DIP):**

- ✅ **Dependencies injected**, not created?
- ✅ **Abstractions over concretions**?

### 📋 **SOLID Compliance Checklist:**

- ✅ **SRP**: Each class/handler has single responsibility?
- ✅ **OCP**: Code open for extension, closed for modification?
- ✅ **LSP**: Implementations are substitutable?
- ✅ **ISP**: Interfaces are focused and minimal?
- ✅ **DIP**: Dependencies injected through abstractions?

---

## 🎨 **PHASE 5: DESIGN PATTERNS REVIEW**

### 🔍 **Common Patterns for Web API:**

- ✅ **Command Pattern**: For all CQRS commands
- ✅ **Query Pattern**: For all CQRS queries
- ✅ **Repository Pattern**: For data access abstraction
- ✅ **Unit of Work Pattern**: For transaction management
- ✅ **Factory Pattern**: For domain entity creation
- ✅ **Strategy Pattern**: For varying business algorithms
- ✅ **Observer Pattern**: For domain events
- ✅ **Specification Pattern**: For complex queries
- ✅ **Builder Pattern**: For complex object construction
- ✅ **Decorator Pattern**: For pipeline behaviors

### 🔍 **Review Focus Areas:**

#### **1. Domain Patterns:**

```csharp
// ✅ CORRECT - Factory Pattern for entity creation
public static class Employee
{
    public static Employee Create(string fullName, ContactInfo contactInfo)
    {
        CheckRule(new EmployeeNameMustNotBeEmptyRule(fullName));

        var employee = new Employee(fullName, contactInfo);
        employee.AddDomainEvent(new EmployeeCreatedEvent(employee.Id));
        return employee;
    }
}

// ✅ CORRECT - Specification Pattern for complex queries
public class ActiveEmployeesSpecification : Specification<Employee>
{
    public override Expression<Func<Employee, bool>> ToExpression()
    {
        return employee => employee.IsActive && !employee.IsDeleted;
    }
}
```

#### **2. Application Patterns:**

```csharp
// ✅ CORRECT - Pipeline Behavior (Decorator Pattern)
public class ValidationPipelineBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (_validators.Any())
        {
            var context = new ValidationContext<TRequest>(request);
            var validationResults = await Task.WhenAll(_validators.Select(v => v.ValidateAsync(context, cancellationToken)));
            var failures = validationResults.SelectMany(r => r.Errors).Where(f => f != null).ToList();

            if (failures.Any())
                throw new ValidationException(failures);
        }

        return await next();
    }
}
```

### 📋 **Design Patterns Checklist:**

- ✅ **Command/Query Pattern**: Properly implemented for CQRS?
- ✅ **Repository Pattern**: Abstraction over data access?
- ✅ **Factory Pattern**: Domain entity creation?
- ✅ **Strategy Pattern**: Interchangeable business algorithms?
- ✅ **Observer Pattern**: Domain events for side effects?
- ✅ **Decorator Pattern**: Pipeline behaviors for cross-cutting concerns?

---

## 💾 **PHASE 6: PERSISTENCE & EF CORE REVIEW**

### 🔍 **Entity Framework Patterns:**

#### **Entity Configuration:**

```csharp
// ✅ CORRECT - Proper EF Core configuration
public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
{
    public void Configure(EntityTypeBuilder<Employee> builder)
    {
        builder.ToTable(TableNames.Employee, TableNames.EmployeeSchema);

        builder.HasKey(x => x.Id);

        builder.Property(x => x.FullName)
            .HasMaxLength(200)
            .IsRequired();

        // Owned entity for ContactInfo
        builder.OwnsOne(x => x.ContactInfo, contactBuilder =>
        {
            contactBuilder.Property(x => x.Email)
                .HasColumnName("Email")
                .HasMaxLength(254)
                .IsRequired();

            contactBuilder.Property(x => x.Phone)
                .HasColumnName("Phone")
                .HasMaxLength(20);
        });

        // Ignore domain events (they're in memory only)
        builder.Ignore(x => x.DomainEvents);
    }
}
```

#### **Repository Implementation:**

```csharp
// ✅ CORRECT - Generic repository with specific methods
public interface IRepositoryBase<TEntity, TKey> : IRepositoryBase<TEntity, TKey, ApplicationDbContext>
    where TEntity : class, IEntityBase<TKey>
{
    // Additional Payroll-specific methods can be added here
}

// Usage in handler
public sealed class CreateEmployeeCommandHandler : ICommandHandler<CreateEmployeeCommand>
{
    private readonly IRepositoryBase<Employee, Guid> _employeeRepository;

    public async Task<Result> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)
    {
        // Check if email already exists
        var existingEmployee = await _employeeRepository.FindSingleAsync(
            x => x.ContactInfo.Email == request.Email,
            cancellationToken);

        if (existingEmployee != null)
        {
            return Result.Failure("Email đã tồn tại");
        }

        var contactInfo = new ContactInfo(request.Email, request.Phone);
        var employee = Employee.Create(request.FullName, contactInfo);

        await _employeeRepository.AddAsync(employee, cancellationToken);

        return Result.Success();
    }
}
```

### 📋 **Persistence Review Checklist:**

- ✅ **Entity Configurations**: All entities properly configured?
- ✅ **Table Names**: Consistent naming conventions?
- ✅ **Relationships**: Proper foreign key configurations?
- ✅ **Owned Entities**: Value objects correctly mapped?
- ✅ **Repository Pattern**: Generic repository with specific interfaces?
- ✅ **Unit of Work**: Transaction management properly implemented?
- ✅ **Migrations**: Database schema changes tracked?

---

## 📊 **PHASE 7: CODE METRICS & COMPLEXITY**

### **Complexity Thresholds:**

#### **Handler Complexity:**

```csharp
// ✅ GOOD - Simple, focused handler
public sealed class GetEmployeeByIdQueryHandler : IQueryHandler<GetEmployeeByIdQuery, EmployeeResponse>
{
    private readonly IRepositoryBase<Employee, Guid> _employeeRepository;

    public GetEmployeeByIdQueryHandler(IRepositoryBase<Employee, Guid> employeeRepository)
    {
        _employeeRepository = employeeRepository;
    }

    public async Task<EmployeeResponse> Handle(GetEmployeeByIdQuery request, CancellationToken cancellationToken)
    {
        var employee = await _employeeRepository.FindByIdAsync(request.Id, cancellationToken);

        if (employee == null)
            throw new NotFoundException(nameof(Employee), request.Id);

        return new EmployeeResponse(
            employee.Id,
            employee.FullName,
            employee.ContactInfo.Email,
            employee.IsActive);
    }
}

// ❌ BAD - Complex handler (too many responsibilities)
public class ComplexEmployeeHandler
{
    public async Task<Result> Handle(object request)
    {
        // 100+ lines of mixed responsibilities
        // Validation, business logic, persistence, email sending, etc.
    }
}
```

#### **Domain Entity Complexity:**

```csharp
// ✅ GOOD - Rich domain entity with clear business methods
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
{
    // Properties with private setters
    public string FullName { get; private set; } = string.Empty;
    public ContactInfo ContactInfo { get; private set; }
    public bool IsActive { get; private set; } = true;

    // Factory method
    public static Employee Create(string fullName, ContactInfo contactInfo) { }

    // Business methods
    public void UpdateContactInfo(ContactInfo contactInfo) { }
    public void Activate() { }
    public void Deactivate() { }
}
```

### **Magic Numbers and Hard-Coded Values:**

```csharp
// ❌ BAD - Hard-coded values
public class EmployeeValidator : AbstractValidator<CreateEmployeeCommand>
{
    public EmployeeValidator()
    {
        RuleFor(x => x.FullName)
            .MaximumLength(200); // Magic number!

        RuleFor(x => x.Email)
            .MaximumLength(254); // Magic number!
    }
}

// ✅ GOOD - Constants with meaningful names
public static class EmployeeConstants
{
    public const int MaxFullNameLength = 200;
    public const int MaxEmailLength = 254;
    public const int MaxPhoneLength = 20;
}

public class EmployeeValidator : AbstractValidator<CreateEmployeeCommand>
{
    public EmployeeValidator()
    {
        RuleFor(x => x.FullName)
            .MaximumLength(EmployeeConstants.MaxFullNameLength)
            .WithMessage($"Tên không được vượt quá {EmployeeConstants.MaxFullNameLength} ký tự");
    }
}
```

### **Code Metrics Checklist:**

- ✅ **Handler Length**: < 30-50 lines per handler?
- ✅ **Domain Entity**: Rich entities with business logic?
- ✅ **Parameter Count**: < 5 parameters per method?
- ✅ **Cyclomatic Complexity**: < 10 per method?
- ✅ **Nesting Depths**: < 4 levels of nesting?
- ✅ **No Magic Numbers**: All values defined as constants?

---

## 🌐 **PHASE 8: WEB API SPECIFIC REVIEW**

### **Controller Implementation:**

```csharp
// ✅ CORRECT - Thin controller with proper routing
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
public class EmployeeController : ControllerBase
{
    private readonly ISender _sender;

    public EmployeeController(ISender sender) => _sender = sender;

    /// <summary>
    /// Tạo nhân viên mới
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(Result), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(Result), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command)
    {
        var result = await _sender.Send(command);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Lấy danh sách nhân viên với phân trang
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<EmployeeResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEmployees([FromQuery] GetEmployeesQuery query)
    {
        var result = await _sender.Send(query);
        return Ok(result);
    }

    /// <summary>
    /// Lấy thông tin chi tiết nhân viên theo ID
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(EmployeeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetEmployeeById(Guid id)
    {
        var query = new GetEmployeeByIdQuery(id);
        var result = await _sender.Send(query);
        return Ok(result);
    }
}
```

### **Error Handling:**

```csharp
// ✅ CORRECT - Global exception handling middleware
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An unexpected error occurred");
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var response = exception switch
        {
            ValidationException => CreateResponse(StatusCodes.Status400BadRequest, "Validation error", exception.Message),
            NotFoundException => CreateResponse(StatusCodes.Status404NotFound, "Not found", exception.Message),
            _ => CreateResponse(StatusCodes.Status500InternalServerError, "Internal server error", "An unexpected error occurred")
        };

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = response.StatusCode;

        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    }
}
```

### **Web API Review Checklist:**

- ✅ **Controllers**: Thin controllers with MediatR delegation?
- ✅ **HTTP Methods**: Proper HTTP verbs (GET, POST, PUT, DELETE)?
- ✅ **Status Codes**: Appropriate HTTP status codes returned?
- ✅ **Route Templates**: RESTful routing patterns?
- ✅ **API Versioning**: Proper versioning strategy?
- ✅ **Exception Handling**: Global exception middleware?
- ✅ **Documentation**: OpenAPI/Swagger documentation?
- ✅ **Validation**: Model validation with FluentValidation?

---

## 📝 **PHASE 9: DOCUMENTATION & COMMENTS**

### 🔍 **Code Documentation Standards:**

#### 📋 **Required Documentation:**

```csharp
/// <summary>
/// Creates a new employee with contact information and business rule validation
///
/// PURPOSE: Employee creation with domain rule enforcement and event publishing
/// INPUT: Employee basic information and contact details
/// OUTPUT: Success result or validation failure with specific error messages
/// BUSINESS RULES: Email must be unique, phone number format validation
/// </summary>
/// <param name="request">Employee creation command with required information</param>
/// <param name="cancellationToken">Cancellation token for async operation</param>
/// <returns>Result indicating success or failure with error details</returns>
/// <exception cref="ValidationException">Thrown when business rules are violated</exception>
/// <exception cref="DuplicateEmailException">Thrown when email already exists in system</exception>
public async Task<Result> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)
{
    // Implementation
}
```

#### 🏗️ **Architecture Comments:**

```csharp
/// <summary>
/// Employee Aggregate Root following DDD patterns with rich domain model
/// </summary>
///
/// 🏗️ DOMAIN DESIGN:
/// ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
/// │  Employee   │ ←→ │ ContactInfo  │ →  │ DomainEvents│
/// │(Aggregate)  │    │(Value Object)│    │  Publishing │
/// └─────────────┘    └──────────────┘    └─────────────┘
///
/// 🎭 DDD PATTERNS:
/// • **Aggregate Root**: Employee is the consistency boundary
/// • **Value Objects**: ContactInfo encapsulates email and phone validation
/// • **Domain Events**: Business events published for side effects
/// • **Business Rules**: Explicit validation with meaningful error messages
///
/// 📊 BUSINESS INVARIANTS:
/// • Email must be unique across all employees
/// • Full name cannot be empty or whitespace only
/// • Contact information must be valid format
/// • Employee can only be activated/deactivated, not deleted (soft delete)
///
/// 🔧 FACTORY PATTERN:
/// • Static Create method enforces proper object construction
/// • Private constructor prevents invalid state creation
/// • Business rules checked at creation time
/// </summary>
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
{
    // Implementation
}
```

### 📋 **Documentation Checklist:**

- ✅ **XML Comments**: All public APIs documented?
- ✅ **Architecture Overview**: Complex classes have design comments?
- ✅ **Business Rules**: Domain logic clearly explained?
- ✅ **API Documentation**: Controllers have OpenAPI documentation?
- ✅ **Exception Documentation**: Expected exceptions documented?
- ✅ **Purpose Clarity**: Comments explain WHY, not WHAT?

---

## 🔍 **FINAL REVIEW CHECKLIST**

### 🔒 **Must Verify Before Approval:**

#### 🔵 **Code Quality (CRITICAL):**

```
- ⚠️ **NAMING**: Clear, descriptive, domain-appropriate names
- 🔴 **ARCHITECTURE**: Clean Architecture layers properly separated
- 🔺 **CQRS**: Commands/Queries clearly separated with handlers
- 🟡 **SOLID**: Single responsibility, proper dependencies
- 🔵 **PATTERNS**: DDD patterns appropriately applied
- ⚡ **PERSISTENCE**: EF Core configurations and repository usage
- 📚 **DOCS**: Clear documentation for public APIs
```

#### 🔵 **Web API Quality:**

```
- ✅ **CONTROLLERS**: Thin controllers with MediatR delegation
- ✅ **HTTP SEMANTICS**: Proper HTTP methods and status codes
- ✅ **VALIDATION**: FluentValidation rules implemented
- ✅ **ERROR HANDLING**: Global exception handling middleware
- ✅ **DOCUMENTATION**: OpenAPI/Swagger documentation
```

#### 🔵 **Architecture Quality:**

```
- ✅ **DDD COMPLIANCE**: Rich domain models with business logic
- ✅ **SEPARATION**: Clear boundaries between layers
- ✅ **DEPENDENCY INJECTION**: All dependencies properly injected
- ✅ **TESTABILITY**: Code is unit testable
- ✅ **MAINTAINABILITY**: Code is understandable for future maintainers
```

---

## 📝 **REVIEW TEMPLATES**

### **Naming Issues Template:**

```markdown
**NAMING IMPROVEMENTS REQUIRED:**

### 🔴 High Priority:

- [ ] **Line XX**: Class `DataProcessor` → `PayrollCalculationProcessor` (specify business purpose)
- [ ] **Line YY**: Method `Process()` → `CalculateMonthlyPayroll()` (what is processed?)

### 🟡 Medium Priority:

- [ ] **Line ZZ**: Variable `data` → `employeePayrollData` (what does data represent?)

**Rationale**: Good naming is the foundation of maintainable code. Generic names don't convey business purpose and make code harder to understand.
```

### **Architecture Issues Template:**

```markdown
## 🔧 **ARCHITECTURAL IMPROVEMENTS:**

### 🔺 Clean Architecture Violations:

- [ ] **Line XX**: Controller contains business logic instead of delegating to handler
- [ ] **Suggestion**: Move business logic to `CreateEmployeeCommandHandler`

### 🔴 DDD Pattern Issues:

- [ ] **Line YY**: Anemic domain model - entity is just data container
- [ ] **Suggestion**: Add business methods like `UpdateContactInfo()`, `Activate()` to `Employee` entity

### 🔄 CQRS Violations:

- [ ] **Line ZZ**: Query handler modifying data
- [ ] **Suggestion**: Use separate command for data modifications

**Rationale**: Following Clean Architecture and DDD patterns improves maintainability, testability, and follows business domain logic.
```

### **Technical Issues Template:**

```markdown
## 🔧 **TECHNICAL IMPROVEMENTS:**

### 🔴 Dependency Injection:

- [ ] **Line XX**: Direct instantiation `new ApplicationDbContext()` instead of injection
- [ ] **Line YY**: Use repository abstraction instead of direct DbContext access

### ⚡ EF Core:

- [ ] **Line ZZ**: Missing entity configuration for `Employee`
- [ ] **Line WW**: Add proper indexes for frequently queried fields

### 🎯 CQRS Implementation:

- [ ] **Line AA**: Command handler should not return data, use separate query
- [ ] **Line BB**: Use `ICommandHandler<T>` instead of generic `IRequestHandler`

**Rationale**: These changes improve performance, follow framework best practices, and maintain architectural integrity.
```

---

## 💡 **REVIEW EFFICIENCY TIPS**

### **Priority Order:**

```
🔴 **CRITICAL**: Naming, Architecture violations, SOLID violations
⚠️ **HIGH**: Pattern misuse, Performance issues, Security issues
🟡 **MEDIUM**: Documentation, Minor complexity issues
✅ **LOW**: Style preferences, Minor optimizations
```

### **Communication:**

- **Be specific**: Point to exact lines and provide concrete suggestions
- **Be constructive**: Explain WHY change is needed, not just WHAT to change
- **Be educational**: Share knowledge about DDD, Clean Architecture, CQRS patterns
- **Be consistent**: Apply same standards across all reviews

---

## 🎊 **SUMMARY**

**Key Principles for Web API .NET Review**:

- **Clean Architecture**: Proper layer separation and dependency direction
- **Domain-Driven Design**: Rich domain models with business logic
- **CQRS**: Clear separation between commands and queries
- **SOLID Principles**: Single responsibility and proper abstraction
- **Testability**: Code that can be easily unit tested
- **Maintainability**: Self-documenting code with clear business intent

**Remember**: The goal is to maintain code quality while ensuring the codebase follows modern .NET practices, Clean Architecture principles, and reflects business domain accurately! 🚀
