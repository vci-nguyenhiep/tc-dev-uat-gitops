---
description: review code 
alwaysApply: true
---

# Naming Conventions & Code Review Guidelines

## 🎯 Tổng Quan

Tài liệu này định nghĩa các quy tắc đặt tên và code review cho dự án **TC Payroll System** dựa trên **Clean Architecture**, **DDD**, và **CQRS patterns**.

---

## 📁 Project Structure Naming

### 🏗️ Solution & Project Names

```
✅ ĐÚNG:
TCPayrollSystem.sln
Payroll.API.csproj
Payroll.Application.csproj
Payroll.Domain.csproj
Payroll.Infrastructure.csproj
Payroll.Persistence.csproj
Payroll.Presentation.csproj

❌ SAI:
payroll-api.csproj
PayrollApi.csproj
Payroll_API.csproj
```

**Quy tắc**:

- **Solution**: `{PROJECT_NAME}System.sln`
- **Projects**: `{MODULE_NAME}.{LAYER_NAME}.csproj`
- Sử dụng **PascalCase**
- Không dùng dấu gạch ngang, gạch dưới

### 📂 Folder Structure

```
✅ ĐÚNG:
BuildingBlocks/
Services/
  Payroll/
    Payroll.Domain/
      Employees/
        Entities/
        Events/
        Rules/
        Enums/

❌ SAI:
building-blocks/
building_blocks/
buildingblocks/
```

**Quy tắc**:

- **PascalCase** cho tất cả folder names
- **Singular nouns** cho domain folders (`Employee`, không phải `Employees`)
- **Plural nouns** cho collection folders (`Entities`, `Events`, `Rules`)

---

## 🏛️ Domain Layer Naming

### 📊 Aggregate Roots & Entities

```csharp
✅ ĐÚNG:
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
public class ContactInfo : EntityAuditBase<Guid>
public class EmployeeInfo : EntityAuditBase<Guid>

❌ SAI:
public class employee : EventEntityAuditBase<Guid>
public class EmployeeEntity : EventEntityAuditBase<Guid>
public class ContactInfoEntity : EntityAuditBase<Guid>
```

**Quy tắc**:

- **PascalCase** cho class names
- **Singular nouns** (`Employee`, không phải `Employees`)
- **Không suffix** `Entity` hoặc `Model`
- **Aggregate Root** phải implement `IAggregateRoot`

### ⚡ Domain Events

```csharp
✅ ĐÚNG:
public class EmployeeCreatedEvent : DomainEvent
public class EmployeeContactUpdatedEvent : DomainEvent
public class EmployeeTerminatedEvent : DomainEvent
public class DepartmentCreatedEvent : DomainEvent

❌ SAI:
public class EmployeeCreated : DomainEvent
public class CreatedEmployeeEvent : DomainEvent
public class EmployeeCreateEvent : DomainEvent
```

**Quy tắc**:

- **Pattern**: `{DOMAIN_NAME}{ACTION}Event`
- **Past tense** cho actions (`Created`, `Updated`, `Terminated`)
- **Suffix** `Event` luôn có
- **PascalCase** cho tất cả

### ✅ Business Rules

```csharp
✅ ĐÚNG:
public class EmailMustBeValidRule : IBusinessRule
public class PhoneMustBeValidRule : IBusinessRule
public class DepartmentNameMustNotBeEmptyRule : IBusinessRule
public class EmployeeMustHaveUniqueEmailRule : IBusinessRule

❌ SAI:
public class ValidateEmailRule : IBusinessRule
public class EmailRule : IBusinessRule
public class EmailValidation : IBusinessRule
```

**Quy tắc**:

- **Pattern**: `{SUBJECT}Must{CONDITION}Rule`
- **Descriptive names** mô tả business rule
- **Suffix** `Rule` luôn có
- **Present tense** cho conditions

### 🔢 Enumerations

```csharp
✅ ĐÚNG:
public enum EmployeeStatus
{
    Active = 1,
    Inactive = 2,
    Terminated = 3,
    OnLeave = 4
}

public enum EmployeeCategory
{
    Permanent = 1,
    Contract = 2,
    Intern = 3,
    Consultant = 4
}

❌ SAI:
public enum EmployeeStatuses
public enum EMPLOYEE_STATUS
public enum employee_status
```

**Quy tắc**:

- **PascalCase** cho enum names và values
- **Singular nouns** (`EmployeeStatus`, không phải `EmployeeStatuses`)
- **Explicit values** starting from 1
- **Descriptive value names**

### 💎 Value Objects

```csharp
✅ ĐÚNG:
public class Email : ValueObject
public class PhoneNumber : ValueObject
public class Address : ValueObject
public class Money : ValueObject

❌ SAI:
public class EmailValueObject : ValueObject
public class EmailVO : ValueObject
public class PhoneNumberValue : ValueObject
```

**Quy tắc**:

- **PascalCase** cho class names
- **Singular nouns** represent the concept
- **Không suffix** `ValueObject` hoặc `VO`
- **Domain-specific names**

---

## 💾 Persistence Layer Naming

### 🗄️ Database Tables & Schemas

```csharp
✅ ĐÚNG:
internal static class TableNames
{
    internal const string EmployeeSchema = "Employee";
    internal const string DepartmentSchema = "Department";
    
    internal const string Employee = nameof(Employee);
    internal const string ContactInfo = nameof(ContactInfo);
    internal const string Department = nameof(Department);
}

❌ SAI:
internal const string employee_schema = "employee";
internal const string EMPLOYEE_TABLE = "EMPLOYEES";
internal const string tbl_Employee = "tbl_Employee";
```

**Quy tắc**:

- **PascalCase** cho constants
- **Singular nouns** cho table names
- **Schema names** match domain names
- **No prefixes** (`tbl_`, `tb_`) hoặc Hungarian notation

### ⚙️ Entity Configurations

```csharp
✅ ĐÚNG:
public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
public class ContactInfoConfiguration : IEntityTypeConfiguration<ContactInfo>
public class DepartmentConfiguration : IEntityTypeConfiguration<Department>

❌ SAI:
public class EmployeeConfig : IEntityTypeConfiguration<Employee>
public class EmployeeEntityConfiguration : IEntityTypeConfiguration<Employee>
public class ConfigureEmployee : IEntityTypeConfiguration<Employee>
```

**Quy tắc**:

- **Pattern**: `{ENTITY_NAME}Configuration`
- **PascalCase** cho class names
- **Suffix** `Configuration` không viết tắt
- **One configuration per entity**

### 🔄 Repositories

```csharp
✅ ĐÚNG:
public interface IRepositoryBase<TEntity, TKey> : IRepositoryBase<TEntity, TKey, ApplicationDbContext>
private readonly IRepositoryBase<Employee, Guid> _employeeRepository;
private readonly IRepositoryBase<Department, Guid> _departmentRepository;

❌ SAI:
private readonly IRepository<Employee> _empRepo;
private readonly IEmployeeRepository _employeeRepo;
private readonly IEmployeeRepository _repository;
```

**Quy tắc**:

- **Generic repositories**: `I{MODULE_NAME}RepositoryBase<TEntity, TKey>`
- **Variable names**: `_{ENTITY_NAME}Repository` (camelCase)
- **No abbreviations** (`emp`, `dept`, `repo`)
- **Consistent naming** across all repositories

---

## ⚡ Application Layer Naming

### 📝 CQRS Commands

```csharp
✅ ĐÚNG:
public static class Command
{
    public record CreateEmployeeCommand(...) : ICommand;
    public record UpdateEmployeeCommand(Guid Id, ...) : ICommand;
    public record DeleteEmployeeCommand(Guid Id) : ICommand;
    public record ActivateEmployeeCommand(Guid Id) : ICommand;
}

❌ SAI:
public record CreateEmployee(...) : ICommand;
public record EmployeeCreateCommand(...) : ICommand;
public record CreateEmployeeCmd(...) : ICommand;
```

**Quy tắc**:

- **Pattern**: `{ACTION}{DOMAIN_NAME}Command`
- **Imperative verbs** (`Create`, `Update`, `Delete`, `Activate`)
- **Static class** `Command` chứa tất cả commands
- **Suffix** `Command` luôn có

### 🔍 CQRS Queries

```csharp
✅ ĐÚNG:
public static class Query
{
    public record GetEmployeesQuery(...) : IQuery<PagedResult<EmployeeResponse>>;
    public record GetEmployeeByIdQuery(Guid Id) : IQuery<EmployeeResponse>;
    public record GetActiveEmployeesQuery(...) : IQuery<List<EmployeeResponse>>;
}

❌ SAI:
public record EmployeesQuery(...) : IQuery<PagedResult<EmployeeResponse>>;
public record GetEmployee(...) : IQuery<EmployeeResponse>;
public record GetEmployeeByIdQry(Guid Id) : IQuery<EmployeeResponse>;
```

**Quy tắc**:

- **Pattern**: `Get{DOMAIN_NAME}sQuery` cho collections
- **Pattern**: `Get{DOMAIN_NAME}ByIdQuery` cho single items
- **Static class** `Query` chứa tất cả queries
- **Suffix** `Query` luôn có

### 🔧 Handlers

```csharp
✅ ĐÚNG:
public sealed class CreateEmployeeCommandHandler : ICommandHandler<CreateEmployeeCommand>
public sealed class GetEmployeeByIdQueryHandler : IQueryHandler<GetEmployeeByIdQuery, EmployeeResponse>
public sealed class UpdateEmployeeCommandHandler : ICommandHandler<UpdateEmployeeCommand>

❌ SAI:
public class CreateEmployeeHandler : ICommandHandler<CreateEmployeeCommand>
public class EmployeeCreateCommandHandler : ICommandHandler<CreateEmployeeCommand>
public class CreateEmployeeCmdHandler : ICommandHandler<CreateEmployeeCommand>
```

**Quy tắc**:

- **Pattern**: `{COMMAND/QUERY_NAME}Handler`
- **sealed class** cho performance
- **Suffix** `Handler` luôn có
- **Match exact command/query name**

### ✅ Validators

```csharp
✅ ĐÚNG:
public class CreateEmployeeValidator : AbstractValidator<CreateEmployeeCommand>
public class UpdateEmployeeValidator : AbstractValidator<UpdateEmployeeCommand>
public class GetEmployeeByIdValidator : AbstractValidator<GetEmployeeByIdQuery>

❌ SAI:
public class CreateEmployeeCommandValidator : AbstractValidator<CreateEmployeeCommand>
public class EmployeeCreateValidator : AbstractValidator<CreateEmployeeCommand>
public class CreateEmployeeValidation : AbstractValidator<CreateEmployeeCommand>
```

**Quy tắc**:

- **Pattern**: `{COMMAND/QUERY_NAME_WITHOUT_SUFFIX}Validator`
- **Remove** `Command`/`Query` từ tên
- **Suffix** `Validator` luôn có
- **One validator per command/query**

### 📦 Response DTOs

```csharp
✅ ĐÚNG:
public static class Response
{
    public record EmployeeResponse(Guid Id, string FullName, ...);
    public record EmployeeDetailResponse(Guid Id, string FullName, ...);
    public record EmployeeListResponse(Guid Id, string FullName, ...);
}

❌ SAI:
public record EmployeeDto(Guid Id, string FullName, ...);
public record EmployeeResponseDto(Guid Id, string FullName, ...);
public record EmployeeModel(Guid Id, string FullName, ...);
```

**Quy tắc**:

- **Static class** `Response` chứa tất cả DTOs
- **Pattern**: `{DOMAIN_NAME}Response` cho basic responses
- **Pattern**: `{DOMAIN_NAME}{CONTEXT}Response` cho specific contexts
- **Suffix** `Response`, không dùng `Dto` hoặc `Model`

---

## 🌐 Presentation Layer Naming

### 🎮 Controllers

```csharp
✅ ĐÚNG:
[Route("api/v{version:apiVersion}/[controller]")]
public class EmployeeController : ControllerBase
public class DepartmentController : ControllerBase
public class ProductController : ControllerBase

❌ SAI:
public class EmployeesController : ControllerBase
public class EmployeeApiController : ControllerBase
public class PayrollEmployeeController : ControllerBase
```

**Quy tắc**:

- **Pattern**: `{DOMAIN_NAME}Controller`
- **Singular domain names** (`Employee`, không phải `Employees`)
- **Suffix** `Controller` luôn có
- **No prefixes** (`Api`, `Payroll`) hoặc suffixes (`Api`)

### 🔗 Action Methods

```csharp
✅ ĐÚNG:
[HttpPost]
public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command)

[HttpGet]
public async Task<IActionResult> GetEmployees([FromQuery] GetEmployeesQuery query)

[HttpGet("{id:guid}")]
public async Task<IActionResult> GetEmployeeById(Guid id)

[HttpPut("{id:guid}")]
public async Task<IActionResult> UpdateEmployee(Guid id, [FromBody] UpdateEmployeeCommand command)

[HttpDelete("{id:guid}")]
public async Task<IActionResult> DeleteEmployee(Guid id)

❌ SAI:
public async Task<IActionResult> Create([FromBody] CreateEmployeeCommand command)
public async Task<IActionResult> GetEmployee([FromQuery] GetEmployeesQuery query)
public async Task<IActionResult> Get(Guid id)
```

**Quy tắc**:

- **Pattern**: `{ACTION}{DOMAIN_NAME}` hoặc `{ACTION}{DOMAIN_NAME}s`
- **Explicit action names** (`CreateEmployee`, không phải `Create`)
- **Consistent with HTTP verbs**
- **Include domain context**

---

## 🔧 General Naming Rules

### 📝 Variables & Parameters

```csharp
✅ ĐÚNG:
// Local variables - camelCase
var employee = Employee.Create(...);
var departmentRepository = ...;
string fullName = employee.FullName;

// Parameters - camelCase
public Employee Create(string fullName, ContactInfo contactInfo)
public async Task<Result> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)

// Private fields - _camelCase
private readonly IEmployeeRepository _employeeRepository;
private readonly IMapper _mapper;

❌ SAI:
var Employee = Employee.Create(...);
var dept_repository = ...;
string full_name = employee.FullName;
private readonly IEmployeeRepository employeeRepository;
```

**Quy tắc**:

- **camelCase** cho local variables và parameters
- **_camelCase** cho private fields
- **No Hungarian notation** (`strName`, `intId`)
- **No abbreviations** (`emp`, `dept`, `repo`)

### 🏷️ Properties & Methods

```csharp
✅ ĐÚNG:
// Properties - PascalCase
public string FullName { get; private set; }
public DateTime CreatedDate { get; set; }
public bool IsActive { get; private set; }

// Methods - PascalCase với verb
public static Employee Create(...)
public void Update(...)
public void Activate()
public void MarkAsDeleted()

❌ SAI:
public string fullName { get; private set; }
public string Name { get; private set; } // Too generic
public void SetActive() // Setter-style
public void DoUpdate() // "Do" prefix
```

**Quy tắc**:

- **PascalCase** cho properties và methods
- **Descriptive property names** (`FullName`, không phải `Name`)
- **Verb-based method names** (`Create`, `Update`, `Activate`)
- **Avoid setter-style** methods (`SetActive`)

### 📁 File Naming

```
✅ ĐÚNG:
Employee.cs
EmployeeCreatedEvent.cs
CreateEmployeeCommand.cs
CreateEmployeeCommandHandler.cs
CreateEmployeeValidator.cs
EmployeeConfiguration.cs

❌ SAI:
employee.cs
EmployeeCreatedEvent.cs
CreateEmployeeCmd.cs
CreateEmployeeHandler.cs
EmployeeConfig.cs
```

**Quy tắc**:

- **PascalCase** cho tất cả file names
- **Match class name exactly**
- **One class per file**
- **No abbreviations** trong file names

---

## 🔍 Constants & Configuration

### 🎯 Constants

```csharp
✅ ĐÚNG:
internal static class TableNames
{
    internal const string EmployeeSchema = "Employee";
    internal const string Employee = nameof(Employee);
    internal const string ContactInfo = nameof(ContactInfo);
}

public static class ValidationMessages
{
    public const string EmployeeNameRequired = "Tên nhân viên không được để trống";
    public const string EmailInvalid = "Email không hợp lệ";
}

❌ SAI:
internal const string EMPLOYEE_SCHEMA = "Employee";
internal const string employee_table = "Employee";
public const string EMP_NAME_REQ = "Tên nhân viên không được để trống";
```

**Quy tắc**:

- **PascalCase** cho constant names
- **Static classes** để group related constants
- **Descriptive names** thay vì abbreviations
- **No SCREAMING_SNAKE_CASE**

### ⚙️ Configuration Keys

```csharp
✅ ĐÚNG:
builder.Configuration.GetConnectionString("DefaultConnection");
builder.Configuration.GetSection("JwtSettings");
builder.Configuration.GetValue<int>("PageSize");

// In appsettings.json
{
  "ConnectionStrings": {
    "DefaultConnection": "..."
  },
  "JwtSettings": {
    "SecretKey": "...",
    "ExpirationMinutes": 60
  }
}

❌ SAI:
builder.Configuration.GetConnectionString("default_connection");
builder.Configuration.GetSection("jwt_settings");
```

**Quy tắc**:

- **PascalCase** cho configuration keys
- **Hierarchical structure** với sections
- **Consistent với .NET conventions**

---

## 🎯 Code Review Checklist

### ✅ Naming Verification

**Domain Layer**:

- [ ] Aggregate roots implement `IAggregateRoot`
- [ ] Domain events end with `Event`
- [ ] Business rules end with `Rule`
- [ ] Enums use singular names with explicit values
- [ ] No generic names (`Data`, `Info`, `Manager`)

**Application Layer**:

- [ ] Commands end with `Command`
- [ ] Queries end with `Query`
- [ ] Handlers end with `Handler`
- [ ] Validators match command/query names
- [ ] Response DTOs end with `Response`

**Persistence Layer**:

- [ ] Table names use singular nouns
- [ ] Configurations end with `Configuration`
- [ ] Repository variables use `_{entity}Repository`

**Presentation Layer**:

- [ ] Controllers use singular domain names
- [ ] Action methods include domain context
- [ ] Route templates follow RESTful conventions

### 🔍 General Quality

**Code Style**:

- [ ] Consistent PascalCase/camelCase usage
- [ ] No abbreviations or Hungarian notation
- [ ] Descriptive names that explain intent
- [ ] File names match class names exactly

**Architecture**:

- [ ] Proper layer separation in naming
- [ ] Domain concepts reflected in names
- [ ] Consistent patterns across similar files
- [ ] No infrastructure concerns in domain names

---

## 📚 Examples Summary

### 🎯 Perfect Naming Examples

```csharp
// Domain Layer
public class Employee : EventEntityAuditBase<Guid>, IAggregateRoot
public class EmployeeCreatedEvent : DomainEvent
public class EmailMustBeValidRule : IBusinessRule

// Application Layer  
public record CreateEmployeeCommand(...) : ICommand;
public class CreateEmployeeCommandHandler : ICommandHandler<CreateEmployeeCommand>
public class CreateEmployeeValidator : AbstractValidator<CreateEmployeeCommand>

// Persistence Layer
public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
internal const string Employee = nameof(Employee);

// Presentation Layer
public class EmployeeController : ControllerBase
public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command)
```

### ❌ Anti-Patterns to Avoid

```csharp
// Avoid these patterns
public class EmployeeEntity          // Unnecessary suffix
public class EmployeeCreateEvent     // Wrong tense
public class ValidateEmailRule      // Generic verb
public record CreateEmployee        // Missing suffix
public class CreateEmployeeHandler  // Inconsistent pattern
public class EmployeesController    // Plural domain
public async Task<IActionResult> Create // Missing context
```

---

## 🔄 Enforcement & Tools

### 🛠️ Automated Checks

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <WarningsAsErrors />
    <WarningsNotAsErrors>CS1591</WarningsNotAsErrors>
</PropertyGroup>
```

### 📋 Manual Review Points

1. **File Organization**: Files grouped logically by domain/feature
2. **Naming Consistency**: Similar concepts use similar naming patterns  
3. **Domain Language**: Names reflect ubiquitous language
4. **Layer Separation**: Names don't leak implementation details
5. **Intent Clarity**: Names explain "what" and "why", not just "how"

---

## 🎊 Summary

**Key Principles**:

- **Consistency**: Same patterns across entire codebase
- **Clarity**: Names should be self-documenting
- **Domain Focus**: Reflect business concepts, not technical implementation
- **Convention Over Configuration**: Follow established .NET patterns
- **No Abbreviations**: Full, descriptive names always

**Remember**: Good naming is not just about rules—it's about making code readable, maintainable, and reflective of the business domain.
