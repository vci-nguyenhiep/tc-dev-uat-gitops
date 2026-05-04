# .NET Testing Reference

## Test Pyramid

```
E2E (Playwright)         10%  — slow, fragile, high value per test
Integration (WAF + TC)   20%  — medium speed, high confidence
Unit (xUnit + NSubst.)   70%  — fast, isolated, high coverage
```

---

## Testing Frameworks

### xUnit (Primary)

```csharp
// [Fact] — single test
public class OrderTests
{
    [Fact]
    public void Create_WithValidData_ShouldSetDraftStatus()
    {
        // Arrange
        var customerId = Guid.NewGuid();
        var items = new List<OrderItem> { OrderItem.Create(Guid.NewGuid(), 2, 100m) };

        // Act
        var order = Order.Create(customerId, items);

        // Assert
        order.Status.ShouldBe(OrderStatus.Draft);
        order.CustomerId.ShouldBe(customerId);
        order.DomainEvents.ShouldContain(e => e is OrderCreatedEvent);
    }

    // [Theory] — parameterized
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Create_WithInvalidQuantity_ShouldThrow(int quantity)
    {
        var act = () => OrderItem.Create(Guid.NewGuid(), quantity, 100m);
        act.ShouldThrow<DomainException>();
    }
}
```

| Framework | Recommendation | Notes |
|-----------|---------------|-------|
| xUnit | **Primary** | Parallel by default, modern, .NET Foundation |
| NUnit | Enterprise legacy | `[TestFixture]`, `[Test]`, `[TestCase]` |
| MSTest | Avoid for new | Legacy, slower |

---

## Assertion Libraries

```csharp
// Shouldly — MIT, recommended for new projects
order.Status.ShouldBe(OrderStatus.Draft);
order.Items.ShouldNotBeEmpty();
order.Items.Count.ShouldBe(2);
collection.ShouldContain(x => x.Id == expectedId);
act.ShouldThrow<DomainException>()
   .Message.ShouldContain("cannot be negative");

// await async throws
await Should.ThrowAsync<NotFoundException>(
    () => service.GetOrderAsync(Guid.NewGuid(), CancellationToken.None));
```

> ⚠️ **FluentAssertions v7+** (2025): Requires commercial license for commercial use. Use **Shouldly** (MIT) for new projects.

---

## Mocking Libraries

```csharp
// NSubstitute — recommended (simple API, no setup verbosity)
var repo = Substitute.For<IOrderRepository>();
repo.GetByIdAsync(orderId, Arg.Any<CancellationToken>())
    .Returns(Task.FromResult<Order?>(existingOrder));

// Verify call was made
await repo.Received(1).AddAsync(Arg.Any<Order>(), Arg.Any<CancellationToken>());
await repo.DidNotReceive().DeleteAsync(Arg.Any<Order>(), Arg.Any<CancellationToken>());
```

> ⚠️ **Moq versions > 4.18**: SponsorLink telemetry incident (2023) — stick to 4.18.x or switch to NSubstitute/FakeItEasy.

### Unit Test for Command Handler

```csharp
public class CreateOrderHandlerTests
{
    private readonly IOrderRepository _repo = Substitute.For<IOrderRepository>();
    private readonly CreateOrderCommandHandler _handler;

    public CreateOrderHandlerTests()
        => _handler = new CreateOrderCommandHandler(_repo);

    [Fact]
    public async Task Handle_ValidCommand_ShouldAddOrderAndReturnId()
    {
        // Arrange
        var command = new CreateOrderCommand(
            Guid.NewGuid(),
            [new OrderItemDto(Guid.NewGuid(), 2, 150m)]);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldNotBe(Guid.Empty);
        await _repo.Received(1).AddAsync(
            Arg.Is<Order>(o => o.CustomerId == command.CustomerId),
            Arg.Any<CancellationToken>());
    }
}
```

---

## Integration Testing — WebApplicationFactory

```csharp
// Custom factory overrides services for test environment
public class AppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MsSqlContainer _sqlContainer = null!;

    public async Task InitializeAsync()
    {
        _sqlContainer = new MsSqlBuilder()
            .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
            .WithPassword("StrongPass@123")
            .Build();
        await _sqlContainer.StartAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            // Replace real DbContext with test DB
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null) services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(opts =>
                opts.UseSqlServer(_sqlContainer.GetConnectionString()));

            // Apply migrations
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
        });
    }

    public async Task DisposeAsync() => await _sqlContainer.DisposeAsync();
}

// Test class using shared factory
[Collection("Integration")]
public class OrderApiTests(AppFactory factory) : IClassFixture<AppFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task CreateOrder_ValidRequest_Returns201()
    {
        // Arrange
        var request = new CreateOrderCommand(Guid.NewGuid(), [new(Guid.NewGuid(), 1, 100m)]);

        // Act
        var response = await _client.PostAsJsonAsync("/api/v1/orders", request);

        // Assert
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
    }
}
```

---

## TestContainers.NET

```csharp
// SQL Server real instance in Docker
var sqlContainer = new MsSqlBuilder()
    .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
    .WithPassword("Password@123!")
    .Build();
await sqlContainer.StartAsync();
var connectionString = sqlContainer.GetConnectionString();

// PostgreSQL
var pgContainer = new PostgreSqlBuilder()
    .WithImage("postgres:16-alpine")
    .WithDatabase("testdb")
    .WithUsername("test")
    .WithPassword("test")
    .Build();

// Redis
var redisContainer = new RedisBuilder()
    .WithImage("redis:7-alpine")
    .Build();
```

---

## Database Cleanup — Respawn

```csharp
// Respawn resets DB to clean state between tests (much faster than recreate)
public class DatabaseFixture : IAsyncLifetime
{
    private Respawner _respawner = null!;
    private SqlConnection _conn = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqlConnection(connectionString);
        await _conn.OpenAsync();
        _respawner = await Respawner.CreateAsync(_conn, new RespawnerOptions
        {
            DbAdapter = DbAdapter.SqlServer,
            SchemasToInclude = ["dbo"],
            TablesToIgnore = [new Table("__EFMigrationsHistory")]
        });
    }

    public async Task ResetAsync() => await _respawner.ResetAsync(_conn);
    public async Task DisposeAsync() => await _conn.DisposeAsync();
}
```

---

## E2E Testing — Playwright .NET

```csharp
[Fact]
public async Task CreateOrderFlow_HappyPath()
{
    using var playwright = await Playwright.CreateAsync();
    await using var browser = await playwright.Chromium.LaunchAsync();
    var page = await browser.NewPageAsync();

    await page.GotoAsync("https://localhost:5001/orders/new");
    await page.FillAsync("[data-testid='customer-id']", customerId.ToString());
    await page.ClickAsync("[data-testid='add-item']");
    await page.FillAsync("[data-testid='quantity']", "2");
    await page.ClickAsync("[data-testid='submit']");

    await page.WaitForURLAsync("**/orders/**");
    (await page.TextContentAsync("[data-testid='status']")).ShouldBe("Draft");
}
```

---

## Load Testing — NBomber

```csharp
var scenario = Scenario.Create("get_orders", async ctx =>
{
    using var client = new HttpClient();
    var response = await client.GetAsync("https://localhost:5001/api/v1/orders");
    return response.IsSuccessStatusCode ? Response.Ok() : Response.Fail();
})
.WithLoadSimulations(
    Simulation.InjectPerSec(rate: 100, during: TimeSpan.FromSeconds(30)),
    Simulation.KeepConstant(copies: 50, during: TimeSpan.FromMinutes(1)));

NBomberRunner.RegisterScenarios(scenario).Run();
```

---

## Code Coverage

```bash
# Run with coverage
dotnet test /p:CollectCoverage=true \
            /p:CoverletOutputFormat=opencover \
            /p:CoverletOutput=./coverage/

# Generate HTML report
dotnet tool install --global dotnet-reportgenerator-globaltool
reportgenerator -reports:./coverage/coverage.opencover.xml \
                -targetdir:./coverage/report \
                -reporttypes:Html
```

```yaml
# GitHub Actions coverage upload
- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: coverage/coverage.opencover.xml
```

---

## Test Naming Convention

```
MethodUnderTest_Scenario_ExpectedResult

✅ Create_WithNegativeQuantity_ShouldThrowDomainException
✅ Handle_OrderNotFound_ShouldReturnNotFoundResult
✅ GetOrders_WithValidFilter_ShouldReturnPagedResults

❌ TestCreate
❌ ShouldWork
❌ Test1
```
