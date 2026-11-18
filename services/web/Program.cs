using FactoryMES.Foundation;
using FactoryMES.Web.Components;

if (await HealthProbe.TryRunAsync(args))
    return;
var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddKeyPerFile("/run/secrets", optional: true);
CostPolicy.EnsureLocalOnly(builder.Configuration);
builder.Services.AddRazorComponents()
    .AddInteractiveWebAssemblyComponents();
builder.Services.AddMesCookies(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapGet("/health/live", () => Results.Ok(new
{
    service = "web",
    status = "live"
}));
app.MapGet("/health/ready", () => Results.Ok(new
{
    service = "web",
    status = "ready"
}));
app.MapReverseProxy();
app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(FactoryMES.Web.Client.MesApi).Assembly);
app.Run();
