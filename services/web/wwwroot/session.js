const form = document.querySelector("#login-form");
const workspace = document.querySelector("#workspace");
const status = document.querySelector("#status");
const logout = document.querySelector("#logout");

async function changeSession(path, body) {
  const csrf = await fetch("/api/v1/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!csrf.ok) {
    throw new Error("요청 확인에 실패했습니다. 페이지를 새로고침해 주세요.");
  }
  const token = await csrf.json();
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": token.requestToken
    },
    body: JSON.stringify(body)
  });
}

async function refreshSession() {
  const response = await fetch("/api/v1/auth/me", {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401) {
    form.hidden = false;
    workspace.hidden = true;
    status.textContent = "계정으로 로그인해 주세요.";
    return;
  }
  if (!response.ok) {
    throw new Error("세션을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const user = await response.json();
  const admin = user.roles.includes("ADMIN");
  const worker = user.roles.includes("WORKER");
  const title = admin ? "관리자 업무" : worker ? "작업자 업무" : "권한 확인 필요";
  document.querySelector("#workspace-title").textContent = title;
  document.querySelector("#identity").textContent = `${user.name} (${user.login})`;
  // 업무 바로가기. 관리자 전용 화면은 링크만 숨기고, 권한은 서버가 최종 판단한다.
  const items = [
    ["/dashboard", "업무 대시보드"],
    ["/orders", admin ? "작업지시 발행·검토·마감" : "담당 작업 시작·실적 입력"],
    ["/alarms", "설비 경보 확인·조치"],
    ["/inbox", "알림함"]
  ];
  if (admin) {
    items.push(
      ["/master-data", "기준정보 관리"],
      ["/equipment-connections", "설비 연결·수집"],
      ["/deliveries", "알림 발송 이력"],
      ["/reports", "생산 통계"],
      ["/analyses", "설비 분석(Mock)"]
    );
  }
  const list = document.querySelector("#work-items");
  list.replaceChildren();
  for (const [href, text] of items) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.dataset.enhanceNav = "false";
    link.textContent = text;
    item.append(link);
    list.append(item);
  }
  form.hidden = true;
  workspace.hidden = false;
  status.textContent = "로그인되었습니다.";

  // 로그인 직후 바로 현황판을 그린다(실패해도 로그인 상태와 바로가기는 그대로 쓴다).
  import("./dashboard.js")
    .then(module => module.renderDashboard())
    .catch(() => {});
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector("button");
  submit.disabled = true;
  try {
    const response = await changeSession("/api/v1/auth/login", {
      login: form.elements.login.value,
      password: form.elements.password.value
    });
    form.elements.password.value = "";
    if (!response.ok) {
      status.textContent = response.status === 401
        ? "아이디 또는 비밀번호를 확인해 주세요. 잠긴 계정은 잠시 후 시도해 주세요."
        : "로그인 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      return;
    }
    await refreshSession();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    form.elements.password.value = "";
    submit.disabled = false;
  }
});

logout.addEventListener("click", async () => {
  logout.disabled = true;
  try {
    const response = await changeSession("/api/v1/auth/logout", {});
    if (!response.ok && response.status !== 401) {
      throw new Error("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    }
    await refreshSession();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    logout.disabled = false;
  }
});

refreshSession().catch(error => {
  status.textContent = error.message;
});
