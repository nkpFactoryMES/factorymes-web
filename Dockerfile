# factorymes-web 이미지: 웹 호스트(services/web)와 WASM 화면(services/web-client)을 함께 배포한다.
# 이 레포 안 파일만 쓴다. 다른 서비스 소스나 솔루션 전체를 복사·restore하지 않는다.
# 빌드 전에 build/restore-packages.ps1로 .packages(공유 패키지)를 준비해야 한다.

FROM mcr.microsoft.com/dotnet/sdk:10.0.404 AS build
WORKDIR /src
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_GENERATE_ASPNET_CERTIFICATE=false \
    DOTNET_NOLOGO=1

# 1. restore에 필요한 파일만 먼저 복사한다. 소스만 바뀌면 이 층은 캐시를 그대로 쓴다.
COPY global.json NuGet.Config Directory.Build.props Directory.Packages.props ./
COPY .packages/ .packages/
COPY services/web/FactoryMES.Web.csproj services/web/packages.lock.json services/web/
COPY services/web-client/FactoryMES.Web.Client.csproj services/web-client/packages.lock.json \
    services/web-client/
RUN dotnet restore services/web/FactoryMES.Web.csproj --locked-mode

# 2. 소스를 복사해 게시한다.
COPY services/ services/
RUN dotnet publish services/web/FactoryMES.Web.csproj \
    -c Release \
    --no-restore \
    -o /out \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0.15
WORKDIR /app

# 세션 키 보관 폴더(실행 환경에서 볼륨으로 연결한다).
RUN mkdir -p /var/factorymes/keys \
    && chown -R app:app /var/factorymes

COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "FactoryMES.Web.dll"]
