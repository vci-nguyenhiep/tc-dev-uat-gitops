---
name: ck:backend-development
description: Build .NET backends with ASP.NET Core 8/9, EF Core, SQL Server, Clean Architecture. Use for REST/gRPC/Minimal APIs, auth (ASP.NET Identity + JWT), databases, microservices, security (OWASP), Docker/Azure.
category: backend
keywords: [dotnet, csharp, aspnetcore, efcore, sqlserver, clean-architecture, api, rest, grpc, minimal-api, identity, jwt]
license: MIT
argument-hint: "[framework] [task]"
metadata:
  author: claudekit
  version: "2.0.0"
  stack: ".NET 8 LTS + .NET 9"
---

# Backend Development Skill — .NET

Production-ready .NET backend development with ASP.NET Core, EF Core, Clean Architecture, and proven enterprise patterns.

## When to Use

- Designing REST, Minimal API, or gRPC services with ASP.NET Core 8/9
- Building authentication with ASP.NET Core Identity + JWT Bearer
- Designing EF Core schemas, migrations, and query optimization
- Implementing Clean Architecture (Ardalis) with CQRS + MediatR
- OWASP Top 10 2025 mitigation for .NET
- Building scalable microservices or modular monoliths
- Testing strategies: xUnit + TestContainers + WebApplicationFactory
- CI/CD with GitHub Actions / Azure Pipelines + Docker
- Monitoring with OpenTelemetry + Serilog + Application Insights

## Technology Selection Guide

**Languages:** C# 12 (.NET 8 LTS / .NET 9)
**Frameworks:** ASP.NET Core — Controllers (enterprise/DDD) or Minimal APIs (AOT/microservices)
**Databases:** SQL Server (primary), PostgreSQL (Npgsql alt), Redis (IDistributedCache)
**ORMs:** EF Core 8/9 (primary), Dapper (complex analytics/CTE hybrid)
**APIs:** REST (standard), gRPC-Net (internal/performance), Minimal APIs (lightweight)

See: `references/backend-technologies.md` for detailed comparisons

## Reference Navigation

**Core Technologies:**
- `backend-technologies.md` - C#/.NET runtime, frameworks, DBs, ORMs, message queues, background jobs
- `backend-api-design.md` - Minimal APIs vs Controllers, OpenAPI, gRPC, versioning, rate limiting

**Security & Authentication:**
- `backend-security.md` - OWASP Top 10 2025, security headers, rate limiting, CORS, secrets
- `backend-authentication.md` - ASP.NET Identity, JWT Bearer, refresh tokens, OAuth providers

**Performance & Architecture:**
- `backend-performance.md` - Output/Hybrid cache, EF Core tuning, async patterns, background jobs
- `backend-architecture.md` - Clean Architecture (Ardalis), CQRS, DDD, event-driven, microservices

**Quality & Operations:**
- `backend-testing.md` - xUnit, TestContainers, WebApplicationFactory, NSubstitute, Playwright
- `backend-code-quality.md` - SOLID, C# 12 features, Roslyn analyzers, design patterns
- `backend-devops.md` - Multi-stage Docker, Azure App Service/AKS/Container Apps, GitHub Actions
- `backend-debugging.md` - dotnet-trace/counters/dump, OpenTelemetry, Serilog, production debugging
- `backend-mindset.md` - Problem-solving, .NET learning path, community resources

## Key Best Practices (2025)

**Security:** ASP.NET Identity + PBKDF2 passwords, JWT Bearer + refresh token rotation, DataProtection API, rate limiting middleware, HSTS + security headers, Azure Key Vault for secrets

**Performance:** HybridCache .NET 9 (L1+L2), Output caching with tag invalidation, EF Core `ExecuteUpdateAsync`/`ExecuteDeleteAsync`, `AddDbContextPool`, `AsNoTracking` for reads

**Testing:** 70-20-10 pyramid — xUnit + NSubstitute (unit) / WebApplicationFactory + TestContainers (integration) / Playwright (E2E). Note: prefer Shouldly over FluentAssertions (paid v7+), NSubstitute over Moq (telemetry incident)

**DevOps:** Multi-stage Dockerfile → chiseled runtime image, GitHub Actions with NuGet caching, Blue-green via App Service slot swap, OpenTelemetry traces + Serilog structured logs

## Quick Decision Matrix

| Need | Choose |
|------|--------|
| Fast dev / AOT | Minimal APIs |
| Enterprise / DDD / CQRS | Controllers + Clean Architecture |
| High performance internal | gRPC-Net |
| ACID transactions | SQL Server + EF Core |
| Caching layer | Redis (IDistributedCache) |
| Real-time | SignalR + Redis backplane |
| Message bus | MassTransit (RabbitMQ/Azure SB) |
| Serverless | Azure Functions (isolated worker) |
| Container orchestration | Azure Container Apps / AKS |

## Implementation Checklist

**API:** Minimal API vs Controller → FluentValidation → JWT Bearer → Rate limiting → Swashbuckle/OpenApi → Problem Details errors → API versioning

**Database:** SQL Server → EF Core DbContext → HasIndex → `AddDbContextPool` → Migrations → `ExecuteUpdateAsync` for bulk → Respawn for test cleanup

**Security:** OWASP mapping → EF parameterized (default) → Identity + JWT → Security headers middleware → DataProtection → Managed Identity for secrets

**Testing:** Unit 70% (xUnit + NSubstitute) → Integration 20% (WebApplicationFactory + TestContainers) → E2E 10% (Playwright) → Coverage via Coverlet

**Deployment:** Multi-stage Dockerfile → GH Actions → Azure App Service slots (blue-green) → Azure App Config (feature flags) → App Insights + OpenTelemetry

## Resources

- MS Docs ASP.NET Core: https://learn.microsoft.com/aspnet/core
- Ardalis Clean Architecture: https://github.com/ardalis/CleanArchitecture
- EF Core docs: https://learn.microsoft.com/ef/core
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OpenTelemetry .NET: https://opentelemetry.io/docs/languages/dotnet/
