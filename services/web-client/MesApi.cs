using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Components.WebAssembly.Http;
using Microsoft.Extensions.Logging;

namespace FactoryMES.Web.Client;

// 화면에 보여 줄 API 거절·실패. Status는 HTTP 상태, Message는 서버 Problem 제목(없으면 상태 문구).
public sealed class ApiFault(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

// 업무 화면의 공통 API 호출기(브라우저 WebAssembly). 같은 출처 쿠키로 인증하고,
// 변경 요청(POST/PUT)에는 매번 CSRF 토큰을 받아 X-CSRF-TOKEN으로 붙인다.
// 로그: 메서드·경로(쿼리 제외)·상태·소요 시간만 브라우저 콘솔에 남긴다.
// 요청·응답 본문, CSRF 토큰, 쿠키는 남기지 않는다. 성공은 Debug, 실패는 Warning.
public sealed class MesApi(HttpClient http, ILogger<MesApi> logger)
{
    public async Task<T> GetAsync<T>(string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.SetBrowserRequestCredentials(BrowserRequestCredentials.SameOrigin);
        using var response = await TimedSendAsync(request, path);
        return await ReadAsync<T>(response);
    }

    // 요청을 보내고 결과를 한 줄로 남긴다(호출 경로마다 같은 형식).
    private async Task<HttpResponseMessage> TimedSendAsync(HttpRequestMessage request, string path)
    {
        var started = Stopwatch.GetTimestamp();
        var route = path.Split('?')[0];
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request);
        }
        catch (HttpRequestException error)
        {
            logger.LogWarning(
                "API {Method} {Path} network failure: {Type}",
                request.Method,
                route,
                error.GetType().Name
            );
            throw;
        }

        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        var level = response.IsSuccessStatusCode ? LogLevel.Debug : LogLevel.Warning;
        logger.Log(
            level,
            "API {Method} {Path} -> {Status} in {ElapsedMs:0} ms",
            request.Method,
            route,
            (int)response.StatusCode,
            elapsed
        );
        return response;
    }

    // 서버 시각(X-Mes-Time). 실적 발생 시각을 브라우저 시계가 아니라 서버 기준으로 쓴다.
    public async Task<DateTime> GetServerTimeAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "api/v1/auth/csrf");
        request.SetBrowserRequestCredentials(BrowserRequestCredentials.SameOrigin);
        using var response = await TimedSendAsync(request, "api/v1/auth/csrf");
        await ReadAsync<CsrfToken>(response);
        if (!response.Headers.TryGetValues("X-Mes-Time", out var values))
        {
            throw new InvalidOperationException("서버 시각을 확인하지 못했습니다. 새로고침해 주세요.");
        }

        var utc = DateTime.Parse(
            values.Single(),
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.RoundtripKind
        );
        return utc.AddTicks(-(utc.Ticks % 10));
    }

    // POST(put이면 PUT). 실패하면 ApiFault(4xx·5xx) 또는 HttpRequestException(통신)을 던진다.
    public async Task<T> SendAsync<T>(
        string path,
        object input,
        bool put = false
    )
    {
        var csrf = await GetAsync<CsrfToken>("api/v1/auth/csrf");
        using var request = new HttpRequestMessage(put ? HttpMethod.Put : HttpMethod.Post, path);
        request.SetBrowserRequestCredentials(BrowserRequestCredentials.SameOrigin);
        request.Headers.Add("X-CSRF-TOKEN", csrf.RequestToken);
        request.Content = JsonContent.Create(input, input.GetType());
        using var response = await TimedSendAsync(request, path);
        return await ReadAsync<T>(response);
    }

    // 로그아웃처럼 성공 응답에 본문이 없는(204) POST. 이미 로그아웃된 401도 성공으로 본다.
    public async Task LogoutAsync()
    {
        var csrf = await GetAsync<CsrfToken>("api/v1/auth/csrf");
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/auth/logout");
        request.SetBrowserRequestCredentials(BrowserRequestCredentials.SameOrigin);
        request.Headers.Add("X-CSRF-TOKEN", csrf.RequestToken);
        request.Content = JsonContent.Create(new { });
        using var response = await TimedSendAsync(request, "api/v1/auth/logout");
        if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.Unauthorized)
        {
            throw new ApiFault(
                (int)response.StatusCode,
                $"로그아웃에 실패했습니다 ({(int)response.StatusCode})."
            );
        }
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            throw new ApiFault(401, "로그인이 만료되었습니다. 로그인 화면으로 돌아가 주세요.");
        }
        if (!response.IsSuccessStatusCode)
        {
            var text = await response.Content.ReadAsStringAsync();
            string? title = null;
            try
            {
                using var problem = JsonDocument.Parse(text);
                if (problem.RootElement.TryGetProperty("title", out var field))
                {
                    title = field.GetString();
                }
            }
            catch (JsonException)
            {
                // A proxy failure may return a non-JSON error page.
            }
            throw new ApiFault(
                (int)response.StatusCode,
                title ?? $"요청 실패 ({(int)response.StatusCode})"
            );
        }
        return await response.Content.ReadFromJsonAsync<T>()
            ?? throw new InvalidOperationException("서버 응답이 비어 있습니다.");
    }

    private sealed record CsrfToken(string RequestToken);
}
