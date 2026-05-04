# .NET DevOps Reference

## Docker — Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Layer caching: copy project files first, restore, then copy source
COPY ["src/MyApp.WebApi/MyApp.WebApi.csproj", "MyApp.WebApi/"]
COPY ["src/MyApp.Application/MyApp.Application.csproj", "MyApp.Application/"]
COPY ["src/MyApp.Domain/MyApp.Domain.csproj", "MyApp.Domain/"]
COPY ["src/MyApp.Persistence/MyApp.Persistence.csproj", "MyApp.Persistence/"]
RUN dotnet restore "MyApp.WebApi/MyApp.WebApi.csproj"

COPY src/ .
WORKDIR "/src/MyApp.WebApi"
RUN dotnet publish "MyApp.WebApi.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:PublishReadyToRun=true

# Stage 2: Runtime — chiseled image (rootless, smaller, fewer CVEs)
FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble-chiseled AS runtime
WORKDIR /app
EXPOSE 8080

# Non-root user (chiseled images already enforce this)
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "MyApp.WebApi.dll"]
```

```
# .dockerignore
**/bin
**/obj
**/node_modules
**/.git
**/.vs
**/coverage
```

**Image size comparison:**
- `aspnet:9.0` (Debian) ~220 MB
- `aspnet:9.0-alpine` ~100 MB
- `aspnet:9.0-noble-chiseled` ~80 MB (recommended — rootless, minimal attack surface)

---

## Azure Deployment Decision Matrix

| Scenario | Service | Notes |
|----------|---------|-------|
| Simple web app, managed infra | **App Service** | Auto-scale, slots, easy setup |
| Container, scale-to-zero | **Container Apps** | No k8s ops, KEDA-based scaling |
| Full Kubernetes control | **AKS** | Custom networking, RBAC, complex |
| Event-driven, serverless | **Azure Functions (isolated)** | Consumption plan, pay-per-call |
| Batch processing | Container Jobs / ACI | Short-lived, no always-on |

> ⚠️ Azure Functions **in-process model deprecated Nov 2026** — use **isolated worker** model for all new functions.

---

## .NET Aspire (2025)

```csharp
// AppHost project — wires up services + dependencies for dev/test
var builder = DistributedApplication.CreateBuilder(args);

var redis = builder.AddRedis("cache");
var sql = builder.AddSqlServer("sql").AddDatabase("appdb");

builder.AddProject<Projects.MyApp_WebApi>("api")
    .WithReference(redis)
    .WithReference(sql);

builder.Build().Run();
```

ServiceDefaults auto-adds: OpenTelemetry, health checks, resilience (Polly), service discovery. Add to each service: `builder.AddServiceDefaults()`.

---

## CI/CD — GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

env:
  DOTNET_VERSION: '9.0.x'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Cache NuGet packages
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: ${{ runner.os }}-nuget-${{ hashFiles('**/*.csproj') }}
          restore-keys: ${{ runner.os }}-nuget-

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build --no-restore -c Release

      - name: Test with coverage
        run: |
          dotnet test --no-build -c Release \
            /p:CollectCoverage=true \
            /p:CoverletOutputFormat=opencover \
            /p:CoverletOutput=./coverage/

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage/coverage.opencover.xml

  docker-build:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## CI/CD — Azure Pipelines

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include: [main, dev]

pool:
  vmImage: ubuntu-latest

variables:
  buildConfiguration: Release
  dotNetVersion: 9.0.x

steps:
  - task: UseDotNet@2
    inputs:
      version: $(dotNetVersion)

  - task: Cache@2
    inputs:
      key: nuget | "$(Agent.OS)" | **/packages.lock.json
      path: $(NUGET_PACKAGES)

  - task: DotNetCoreCLI@2
    displayName: Restore
    inputs:
      command: restore
      projects: '**/*.csproj'

  - task: DotNetCoreCLI@2
    displayName: Build
    inputs:
      command: build
      arguments: '--no-restore -c $(buildConfiguration)'

  - task: DotNetCoreCLI@2
    displayName: Test
    inputs:
      command: test
      arguments: '--no-build -c $(buildConfiguration) /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura'

  - task: PublishCodeCoverageResults@2
    inputs:
      summaryFileLocation: '**/coverage.cobertura.xml'
```

---

## Deployment Strategies

### Blue-Green (App Service Slots)

```bash
# Deploy to staging slot
az webapp deployment source config-zip \
  --resource-group myRG --name myApp \
  --slot staging --src ./app.zip

# Smoke test staging slot
curl https://myApp-staging.azurewebsites.net/health

# Swap staging → production (zero downtime)
az webapp deployment slot swap \
  --resource-group myRG --name myApp \
  --slot staging --target-slot production
```

### Feature Flags (Azure App Configuration)

```csharp
// NuGet: Microsoft.FeatureManagement.AspNetCore
builder.Configuration.AddAzureAppConfiguration(options =>
    options.Connect(builder.Configuration["AppConfig:ConnectionString"])
           .UseFeatureFlags());

builder.Services.AddFeatureManagement();

// Usage in controller
public class OrderController(IFeatureManager features) : ControllerBase
{
    [HttpPost("express")]
    public async Task<IActionResult> ExpressCheckout(...)
    {
        if (!await features.IsEnabledAsync("ExpressCheckout"))
            return StatusCode(503, "Feature not available");
        // ...
    }
}
```

---

## Configuration Management

```csharp
// Config priority (highest to lowest):
// 1. Environment variables
// 2. Azure Key Vault (prod)
// 3. appsettings.{Environment}.json
// 4. appsettings.json

// Typed options with validation
builder.Services.AddOptions<DatabaseOptions>()
    .BindConfiguration("Database")
    .ValidateDataAnnotations()
    .ValidateOnStart(); // fail fast at startup if config invalid

// Key Vault (no credentials in any config file)
if (builder.Environment.IsProduction())
{
    builder.Configuration.AddAzureKeyVault(
        new Uri($"https://{builder.Configuration["KeyVault:Name"]}.vault.azure.net/"),
        new DefaultAzureCredential()); // uses Managed Identity on Azure
}
```

---

## Health Checks

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("database", tags: ["db", "ready"])
    .AddRedis(builder.Configuration.GetConnectionString("Redis")!, "redis", tags: ["cache", "ready"])
    .AddUrlGroup(new Uri("https://external-api.com/health"), "external-api", tags: ["ready"]);

// Liveness — is the process alive?
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false // no checks, just "am I running?"
});

// Readiness — can I serve traffic?
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});
```

```yaml
# Kubernetes probe configuration
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```
