# .NET Security Reference

## OWASP Top 10 2025 — .NET Mapping

### A01 — Broken Access Control

```csharp
// Policy-based authorization
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanManageOrders", policy =>
        policy.RequireClaim("permission", "orders:write"));
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));
});

// Resource-based authorization
public class OrderAuthorizationHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        OperationAuthorizationRequirement requirement,
        Order resource)
    {
        var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (requirement == Operations.Update && resource.OwnerId.ToString() == userId)
            ctx.Succeed(requirement);
        return Task.CompletedTask;
    }
}

// Usage in handler — IAuthorizationService, ClaimsPrincipal (not entity)
var authResult = await _authorizationService.AuthorizeAsync(
    _httpContextAccessor.HttpContext!.User, order, Operations.Update);
if (!authResult.Succeeded) throw new ForbiddenException();
```

### A02 — Cryptographic Failures

```csharp
// DataProtection API — encrypt sensitive data at rest
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(blobUri, credential)
    .ProtectKeysWithAzureKeyVault(keyId, credential)
    .SetApplicationName("MyApp");

// Usage
var protector = _dataProtectionProvider.CreateProtector("PersonalData.v1");
string encrypted = protector.Protect(sensitiveValue);
string decrypted = protector.Unprotect(encrypted);

// ASP.NET Identity uses PBKDF2 by default — never store plain passwords
// PasswordHasher<T> with 100k+ iterations
```

### A03 — Injection

```csharp
// EF Core — parameterized by default (auto-safe)
var orders = await context.Orders
    .Where(o => o.CustomerId == customerId) // safe: parameterized
    .ToListAsync(ct);

// Dapper — always use @ parameters
var result = await conn.QueryAsync<Order>(
    "SELECT * FROM Orders WHERE CustomerId = @customerId",
    new { customerId }); // safe: parameterized

// Raw SQL in EF Core — use interpolated (safe) not raw (unsafe)
// ✅ Safe
var orders = await context.Orders
    .FromSqlInterpolated($"SELECT * FROM Orders WHERE Id = {id}")
    .ToListAsync();

// ❌ Unsafe — never do this
// context.Orders.FromSqlRaw($"SELECT * FROM Orders WHERE Id = {id}") 
```

### A04 — Insecure Design

- Threat model before building: identify trust boundaries, data flows, actors
- Secure defaults: deny by default, explicit allow list
- Fail-safe: on error, default to least privilege
- Least privilege: service accounts with minimal DB permissions (READ/WRITE only, no DDL)

### A05 — Security Misconfiguration

```csharp
// Environment-specific config — never commit production secrets
// appsettings.json (defaults, no secrets)
// appsettings.Development.json (dev overrides)
// appsettings.Production.json (non-secret prod config)
// user-secrets / env vars / Azure Key Vault for actual secrets

// Startup configuration check
if (builder.Environment.IsProduction())
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(builder.Configuration["KeyVault:Uri"]!),
        new DefaultAzureCredential());
}
```

### A06 — Vulnerable Components

```bash
# Check for vulnerable NuGet packages
dotnet list package --vulnerable --include-transitive

# GitHub Dependabot — .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "nuget"
    directory: "/"
    schedule:
      interval: "weekly"
```

### A07 — Authentication Failures

```csharp
// ASP.NET Identity lockout (prevents brute force)
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Lockout.AllowedForNewUsers = true;
});
```

### A08 — Software & Data Integrity

```bash
# Verify NuGet package signatures
dotnet nuget verify MyPackage.1.0.0.nupkg

# Generate SBOM
dotnet tool install --global Microsoft.Sbom.DotNetSDK
sbom-tool generate -b . -bc . -pn MyApp -pv 1.0.0 -ps MyOrg
```

### A09 — Security Logging Failures

```csharp
// Serilog — structured logging, centralized, never log PII
Log.Warning("Failed login attempt for user {Email} from IP {IpAddress}",
    MaskEmail(email), ipAddress); // mask PII before logging

// ❌ Never log PII directly
// Log.Information("User {Email} password is {Password}", email, password);
```

### A10 — SSRF

```csharp
// HttpClient with allowlist — prevent SSRF
builder.Services.AddHttpClient("safe-client")
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        // Prevent automatic redirects to internal addresses
        AllowAutoRedirect = false
    });

// Validate URLs before making requests
private static bool IsAllowedUrl(string url)
{
    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        return false;
    var allowedHosts = new[] { "api.example.com", "cdn.example.com" };
    return allowedHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase)
        && uri.Scheme == "https";
}
```

---

## Security Headers Middleware

```csharp
// Custom security headers middleware
public class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        context.Response.Headers["Content-Security-Policy"] =
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:";
        context.Response.Headers.Remove("Server");
        context.Response.Headers.Remove("X-Powered-By");
        await next(context);
    }
}

// HSTS — redirect HTTP to HTTPS permanently
builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(365);
});

// Registration order matters
app.UseHsts();
app.UseHttpsRedirection();
app.UseMiddleware<SecurityHeadersMiddleware>();
```

---

## Antiforgery

```csharp
// For API (token-based) — antiforgery via SameSite cookie
builder.Services.AddAntiforgery(options =>
{
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.HeaderName = "X-CSRF-TOKEN";
});

// For MVC forms
[ValidateAntiForgeryToken]
[HttpPost]
public async Task<IActionResult> Submit([FromForm] FormModel model) { ... }
```

---

## Rate Limiting (Login Protection)

```csharp
builder.Services.AddRateLimiter(options =>
{
    // Protect login endpoint from brute force
    options.AddFixedWindowLimiter("login", o =>
    {
        o.PermitLimit = 5;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueLimit = 0;
    });

    // Per-IP for public endpoints
    options.AddPolicy("per-ip", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60, Window = TimeSpan.FromMinutes(1)
            }));
});

// Apply on login endpoint
app.MapPost("/auth/login", handler).RequireRateLimiting("login");
```

---

## CORS

```csharp
// Production CORS — explicit origins, never AllowAnyOrigin with credentials
builder.Services.AddCors(options =>
{
    options.AddPolicy("production", policy =>
        policy.WithOrigins(
                builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
                ?? ["https://app.example.com"])
            .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .WithHeaders("Content-Type", "Authorization", "X-Correlation-ID")
            .AllowCredentials()
            .SetPreflightMaxAge(TimeSpan.FromMinutes(10)));

    options.AddPolicy("development", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

app.UseCors(app.Environment.IsProduction() ? "production" : "development");
```

> **Rule:** `AllowAnyOrigin()` and `AllowCredentials()` cannot be combined — it's a security error and ASP.NET Core will throw.

---

## Secrets Management

| Environment | Method |
|-------------|--------|
| Development | `dotnet user-secrets` |
| CI/CD | GitHub Actions secrets / Azure DevOps variable groups |
| Production | Azure Key Vault + Managed Identity |
| Container | Environment variables (from orchestrator secrets) |

```bash
# Development: user-secrets (stored outside project directory)
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:Default" "Server=.;..."
dotnet user-secrets set "Jwt:SecretKey" "<JWT_SECRET>"
```

```csharp
// Production: Azure Key Vault with Managed Identity (no credentials in config)
builder.Configuration.AddAzureKeyVault(
    new Uri($"https://{builder.Configuration["KeyVault:Name"]}.vault.azure.net/"),
    new DefaultAzureCredential()); // uses Managed Identity in Azure, dev credential locally
```

---

## Input Validation

```csharp
// FluentValidation with [ApiController] auto-validation
// Register globally
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// 422 + ValidationProblemDetails returned automatically on validation failure
// Customize problem details
builder.Services.Configure<ApiBehaviorOptions>(options =>
    options.InvalidModelStateResponseFactory = ctx =>
    {
        var problemDetails = new ValidationProblemDetails(ctx.ModelState)
        {
            Status = StatusCodes.Status422UnprocessableEntity,
            Title = "Validation failed"
        };
        return new UnprocessableEntityObjectResult(problemDetails);
    });
```
