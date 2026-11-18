# factorymes-web

FactoryMES 관리자·작업자 화면을 제공하는 웹 서비스다. 한 이미지로 배포한다.

| 폴더 | 역할 |
|---|---|
| `services/web` | ASP.NET Core 호스트. 로그인 쿠키, 정적 자산, `/api/*`를 `mes-backend`로 넘기는 YARP 프록시 |
| `services/web-client` | Blazor WebAssembly 화면(작업지시·경보·분석·발송·설비 연결 등) |

다른 서비스 소스는 이 레포에 없다. 서비스 사이 계약(`FactoryMES.Contracts`)과
공통 기능(`FactoryMES.Foundation`)은 버전을 고정한 NuGet 패키지로 받는다.

## 공유 패키지

| 패키지 | 버전 | 출처 |
|---|---|---|
| FactoryMES.Contracts | 정확히 `[1.1.0]` | `nkpFactoryMES/factorymes-platform` Release `v1.1.0` |
| FactoryMES.Foundation | 정확히 `[1.0.0]` | `nkpFactoryMES/factorymes-platform` Release `v1.0.0` |

Contracts 1.1.0은 알림 설정 DTO를 더한 버전이다. 화면을 쓰는 Backend와 Web만 올렸고
다른 서비스는 1.0.0을 그대로 쓴다(필요한 소비자만 명시적으로 올리는 방식).

- 버전은 `Directory.Packages.props`에서만 정한다. 공유 패키지 소스가 바뀌어도 이 레포는
  버전을 올리기 전까지 다시 빌드할 필요가 없다.
- `build/package-lock.json`에 Release 자산 이름과 SHA-256을 고정한다.
  `build/restore-packages.ps1`이 자산을 받아 해시를 확인한 뒤 `.packages`(Git 제외)에 둔다.
- `NuGet.Config`는 `FactoryMES.*`를 `.packages`에서만 받고, 그 밖은 nuget.org에서 받는다.

## 빌드

준비물: .NET SDK 10.0.404(`global.json`), PowerShell 7 이상, Docker.

```bash
pwsh ./build/restore-packages.ps1
```

```bash
dotnet restore services/web/FactoryMES.Web.csproj --locked-mode
```

```bash
dotnet build services/web/FactoryMES.Web.csproj -c Release --no-restore
```

```bash
docker build --tag factorymes/web:dev .
```

Dockerfile은 이 레포 파일만 쓴다. `csproj`·잠금 파일·패키지를 먼저 복사해 restore하고
소스는 그다음에 복사하므로, 화면 코드만 바뀌면 restore 층은 캐시를 그대로 쓴다.

## 실행

이 이미지는 혼자 쓰이지 않는다. `/api/*`는 `http://mes-backend:8080/`로 넘기므로
같은 Docker 네트워크에 `mes-backend`가 있어야 한다. 인증서, 세션 키 볼륨, 포트 공개,
내부 망 설정은 `factorymes-system` 레포의 Compose가 맡는다.

- 컨테이너 기본 주소: `http://+:8080`(HTTPS 인증서는 실행 환경에서 비밀 파일로 넣는다)
- 상태 확인: `GET /health/live`, `GET /health/ready`
- 실제 외부 AI·발송은 꺼져 있다(`ExecutionPolicy`).

## CI

`.github/workflows/ci.yml`

- `main` push·PR: 이 레포만 restore(잠금)·build·Docker build. 문서만 바뀌면 돌지 않는다.
- `v*` 태그 push 또는 수동 실행: 같은 검사 뒤 `ghcr.io/nkpfactorymes/factorymes-web`에 이미지를 게시한다.
- 실제 운영 서버 배포는 하지 않는다. 배포 대상 서버가 없기 때문이다.
  단일 서비스 교체 절차는 `factorymes-system`에 있다.

## 한계

- 화면 단위 테스트는 없다. 화면 회귀는 `factorymes-system`의 브라우저 검증이 맡는다.
- 화면이 쓰는 API 형식은 `FactoryMES.Contracts` 버전에 묶인다. Backend가 새 Contracts 버전을 쓰면
  이 레포도 필요한 경우에만 버전을 명시적으로 올린다.
