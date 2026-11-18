using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.Services.AddScoped(
    _ => new HttpClient {
        BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
    }
);
builder.Services.AddScoped<FactoryMES.Web.Client.MesApi>();

// 개발 환경에서만 FactoryMES 화면 로그(API 호출 경로·상태)를 Debug까지 브라우저 콘솔에 보인다.
if (builder.HostEnvironment.IsDevelopment())
{
    builder.Logging.AddFilter("FactoryMES", Microsoft.Extensions.Logging.LogLevel.Debug);
}
await builder.Build().RunAsync();
