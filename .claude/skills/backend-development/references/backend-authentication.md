# .NET Authentication & Authorization Reference

## ASP.NET Core Identity

### Full Setup

```csharp
// ApplicationUser — extend IdentityUser with custom properties
public class ApplicationUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public DateTime? LastLoginAt { get; set; }
    public bool IsActive { get; set; } = true;
}

// Program.cs registration
builder.Services
    .AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
    {
        // Password policy
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;

        // Lockout (OWASP A07)
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Lockout.AllowedForNewUsers = true;

        // User settings
        options.User.RequireUniqueEmail = true;
        options.SignIn.RequireConfirmedEmail = false; // set true for production
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();
```

### Registration & Login

```csharp
public class AuthService(
    UserManager<ApplicationUser> userManager,
    SignInManager<ApplicationUser> signInManager,
    ITokenService tokenService)
{
    public async Task<AuthResult> RegisterAsync(RegisterDto dto, CancellationToken ct)
    {
        var existing = await userManager.FindByEmailAsync(dto.Email);
        if (existing is not null)
            return AuthResult.Failure("Email already registered");

        var user = new ApplicationUser
        {
            Email = dto.Email,
            UserName = dto.Email,
            FullName = dto.FullName
        };

        var result = await userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
            return AuthResult.Failure(result.Errors.Select(e => e.Description));

        await userManager.AddToRoleAsync(user, "User");
        return AuthResult.Success(await tokenService.CreateTokenPairAsync(user));
    }

    public async Task<AuthResult> LoginAsync(LoginDto dto, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(dto.Email);
        if (user is null || !user.IsActive)
            return AuthResult.Failure("Invalid credentials"); // don't reveal which

        // Lockout-aware sign-in check
        var result = await signInManager.CheckPasswordSignInAsync(
            user, dto.Password, lockoutOnFailure: true);

        if (result.IsLockedOut)
            return AuthResult.Failure("Account locked. Try again later.");
        if (!result.Succeeded)
            return AuthResult.Failure("Invalid credentials");

        user.LastLoginAt = DateTime.UtcNow;
        await userManager.UpdateAsync(user);

        return AuthResult.Success(await tokenService.CreateTokenPairAsync(user));
    }
}
```

---

## JWT Bearer Authentication

### Configuration

```csharp
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30), // minimal drift allowance
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SecretKey"]!))
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                if (ctx.Exception is SecurityTokenExpiredException)
                    ctx.Response.Headers["Token-Expired"] = "true";
                return Task.CompletedTask;
            }
        };
    });
```

### Token Generation Service

```csharp
// TokenService: inject UserManager (not DbContext) to stay in Application layer
public class TokenService(
    IConfiguration config,
    UserManager<ApplicationUser> userManager,
    AppDbContext db) // db only for RefreshToken persistence
{
    private const int AccessTokenMinutes = 15;
    private const int RefreshTokenDays = 7;

    public async Task<TokenPair> CreateTokenPairAsync(
        ApplicationUser user, CancellationToken ct = default)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
            new(ClaimTypes.Name, user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString())
        };

        // Use Identity API — not direct DbContext query (handles caching + custom stores)
        var roles = await userManager.GetRolesAsync(user);
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(config["Jwt:SecretKey"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var accessToken = new JwtSecurityTokenHandler().WriteToken(
            new JwtSecurityToken(
                issuer: config["Jwt:Issuer"],
                audience: config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(AccessTokenMinutes),
                signingCredentials: credentials));

        var refreshToken = await CreateRefreshTokenAsync(user.Id);
        return new TokenPair(accessToken, refreshToken.Token);
    }

    private async Task<RefreshToken> CreateRefreshTokenAsync(Guid userId)
    {
        var token = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenDays),
            FamilyId = Guid.NewGuid() // for family invalidation
        };
        db.RefreshTokens.Add(token);
        await db.SaveChangesAsync(cancellationToken);
        return token;
    }
}
```

### Refresh Token Pattern (with Family Invalidation)

```csharp
// RefreshToken entity
public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Token { get; set; } = string.Empty; // opaque random string
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; } // chain for rotation
    public Guid FamilyId { get; set; } // all tokens in same session share family

    public bool IsActive => RevokedAt == null && ExpiresAt > DateTime.UtcNow;
}

// Refresh endpoint handler
public async Task<TokenPair> RefreshAsync(string refreshToken, CancellationToken ct)
{
    var token = await db.RefreshTokens
        .Include(t => t.User)
        .FirstOrDefaultAsync(t => t.Token == refreshToken, ct)
        ?? throw new UnauthorizedException("Invalid refresh token");

    if (token.RevokedAt.HasValue)
    {
        // Reuse detected — revoke entire family (all sessions with same family)
        await db.RefreshTokens
            .Where(t => t.FamilyId == token.FamilyId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.RevokedAt, DateTime.UtcNow), ct);
        throw new UnauthorizedException("Refresh token reuse detected. Please log in again.");
    }

    if (!token.IsActive)
        throw new UnauthorizedException("Refresh token expired");

    // Rotate: revoke old, issue new (same family)
    token.RevokedAt = DateTime.UtcNow;
    var newPair = await tokenService.CreateTokenPairAsync(token.User, token.FamilyId);
    await db.SaveChangesAsync(ct);
    return newPair;
}
```

### Symmetric vs Asymmetric Signing

| | HS256 (Symmetric) | RS256 / ES256 (Asymmetric) |
|--|------------------|--------------------------|
| Key management | Single shared secret | Private key signs, public key verifies |
| Performance | Faster | Slightly slower |
| Distribution | All services share secret | Public key distributable safely |
| Best for | Single-service or trusted backend | Microservices, external clients |
| Recommendation | **Default for most apps** | When multiple consumers verify tokens |

---

## Authorization

### Policy-Based + Role-Based

```csharp
builder.Services.AddAuthorization(options =>
{
    // Require authenticated by default (global)
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    // Named policies
    options.AddPolicy("CanManageOrders",
        p => p.RequireClaim("permission", "orders:write"));
    options.AddPolicy("SeniorEmployeeOnly",
        p => p.RequireClaim("seniority", "senior", "lead", "principal"));
    options.AddPolicy("SameOrganization",
        p => p.AddRequirements(new SameOrganizationRequirement()));
});

// Usage
[Authorize(Policy = "CanManageOrders")]
[Authorize(Roles = "Admin,Manager")]
public async Task<IActionResult> CreateOrder(...) { ... }

// Allow anonymous for specific endpoints when fallback policy is set
[AllowAnonymous]
public async Task<IActionResult> Login(...) { ... }
```

### Resource-Based Authorization

```csharp
public static class Operations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = "Read" };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = "Update" };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = "Delete" };
}

public class OrderAuthorizationHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        OperationAuthorizationRequirement req,
        Order order)
    {
        var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = ctx.User.IsInRole("Admin");

        if (req == Operations.Read && (isAdmin || order.OwnerId.ToString() == userId))
            ctx.Succeed(req);
        else if ((req == Operations.Update || req == Operations.Delete)
                 && (isAdmin || order.OwnerId.ToString() == userId))
            ctx.Succeed(req);

        return Task.CompletedTask;
    }
}

// In handler
var authResult = await _authorizationService.AuthorizeAsync(
    _httpContextAccessor.HttpContext!.User, order, Operations.Update);
if (!authResult.Succeeded)
    throw new ForbiddenException($"You cannot update order {order.Id}");
```

---

## OAuth External Providers

```csharp
builder.Services
    .AddAuthentication()
    .AddGoogle(options =>
    {
        options.ClientId = builder.Configuration["Auth:Google:ClientId"]!;
        options.ClientSecret = builder.Configuration["Auth:Google:ClientSecret"]!;
        options.Scope.Add("profile");
        options.SaveTokens = false; // don't persist Google tokens
    })
    .AddMicrosoftAccount(options =>
    {
        options.ClientId = builder.Configuration["Auth:Microsoft:ClientId"]!;
        options.ClientSecret = builder.Configuration["Auth:Microsoft:ClientSecret"]!;
    });
```

---

## Multi-Factor Authentication (TOTP)

```csharp
// Generate authenticator key
var key = await userManager.GetAuthenticatorKeyAsync(user);
if (string.IsNullOrEmpty(key))
{
    await userManager.ResetAuthenticatorKeyAsync(user);
    key = await userManager.GetAuthenticatorKeyAsync(user);
}

// QR code URI for authenticator app (Google Authenticator, Authy)
var qrUri = $"otpauth://totp/{Uri.EscapeDataString("MyApp")}:{Uri.EscapeDataString(user.Email!)}?secret={key}&issuer={Uri.EscapeDataString("MyApp")}";

// Verify TOTP code
var isValid = await userManager.VerifyTwoFactorTokenAsync(
    user, userManager.Options.Tokens.AuthenticatorTokenProvider, totpCode);

if (!isValid) return AuthResult.Failure("Invalid 2FA code");
await userManager.SetTwoFactorEnabledAsync(user, true);
```

---

## API Key Authentication (Service-to-Service)

```csharp
// Custom authentication handler for API keys
public class ApiKeyAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger, UrlEncoder encoder, IApiKeyValidator validator)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Api-Key", out var apiKeyValues))
            return AuthenticateResult.NoResult();

        var apiKey = apiKeyValues.FirstOrDefault();
        if (string.IsNullOrEmpty(apiKey))
            return AuthenticateResult.Fail("Missing API key");

        var principal = await validator.ValidateAsync(apiKey);
        if (principal is null)
            return AuthenticateResult.Fail("Invalid API key");

        return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
    }
}

// API Key storage — hash with SHA-256, compare with FixedTimeEquals
public bool ValidateApiKey(string providedKey, string storedHash)
{
    var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(providedKey)));
    var a = Encoding.UTF8.GetBytes(hash);
    var b = Encoding.UTF8.GetBytes(storedHash);
    return CryptographicOperations.FixedTimeEquals(a, b); // timing attack safe
}
```

---

## Alternative Identity Providers (Brief)

| | Duende IdentityServer | OpenIddict |
|--|----------------------|-----------|
| License | Commercial (free for dev/small) | OSS MIT |
| Maturity | Industry standard, full OAuth2/OIDC | Stable, well-maintained |
| EF Core | Yes | **Native EF Core integration** |
| Complexity | High | Medium |
| Best for | Enterprise SSO, external clients | Self-hosted OIDC, simpler setup |

> **Default recommendation:** ASP.NET Core Identity + JWT Bearer covers 90% of API scenarios. Use Duende/OpenIddict only when building an Authorization Server (issuing tokens for external apps).
