// 로그인 뒤 메인 현황판. 실제 API 조회 결과만 보여 주고, 추정·장식용 숫자는 만들지 않는다.
// 조회만 하며(GET) 자료를 바꾸지 않는다. 화면에 넣는 글자는 모두 textContent로 넣는다.

const board = document.querySelector("#dashboard");
const refresh = document.querySelector("#dashboard-refresh");
let rendering = false;

async function get(path) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

// UTC 시각을 한국 시간 "MM-DD HH:mm"으로 보여 준다.
function kst(utc) {
  const time = new Date(new Date(utc).getTime() + 9 * 3600 * 1000);
  return time.toISOString().slice(5, 16).replace("T", " ");
}

function countText(count, limit, more) {
  return more ? `${limit}건 이상` : `${count}건`;
}

// 현황판 한 칸: 제목, 건수, 최근 항목 최대 5개, 전체 보기 링크.
function panel({ title, tone, count, rows, empty, href, linkText, note }) {
  const box = element("section", `dash-panel tone-${tone}`);
  const head = element("div", "dash-panel-head");
  head.append(element("h3", "", title), element("strong", "dash-count", count));
  box.append(head);
  if (note) {
    box.append(element("p", "hint", note));
  }
  if (rows.length === 0) {
    box.append(element("p", "dash-empty", empty));
  } else {
    const list = element("ul", "dash-rows");
    for (const row of rows) {
      const item = document.createElement("li");
      const link = element("a", "", row.text);
      link.href = row.href;
      link.dataset.enhanceNav = "false";
      item.append(link);
      if (row.badge) {
        item.append(element("span", `badge ${row.badge.toLowerCase()}`, row.badge));
      }
      if (row.meta) {
        item.append(element("span", "dash-meta", row.meta));
      }
      list.append(item);
    }
    box.append(list);
  }
  const more = element("a", "dash-more", linkText);
  more.href = href;
  more.dataset.enhanceNav = "false";
  box.append(more);
  return box;
}

function failed(title) {
  const box = element("section", "dash-panel tone-muted");
  box.append(
    element("h3", "", title),
    element("p", "conflict-wait", "불러오지 못했습니다. '현황 새로고침'을 눌러 다시 조회해 주세요.")
  );
  return box;
}

async function alarmsPanel() {
  const page = await get("/api/v1/alarms?status=ACTIVE&limit=100");
  return panel({
    title: "발생 중 경보",
    tone: page.items.length ? "red" : "calm",
    count: countText(page.items.length, 100, page.nextCursor),
    rows: page.items.slice(0, 5).map(alarm => ({
      text: `#${alarm.alarmId} 설비 ${alarm.equipmentId} · ${alarm.kind}`,
      href: `/alarms?alarmId=${encodeURIComponent(alarm.alarmId)}`,
      badge: alarm.severity,
      meta: `발생 ${kst(alarm.openedAt)}`
    })),
    empty: "발생 중인 경보가 없습니다.",
    href: "/alarms",
    linkText: "경보 화면으로"
  });
}

async function inboxPanel() {
  const page = await get("/api/v1/inbox?limit=50&unreadOnly=true");
  return panel({
    title: "읽지 않은 알림",
    tone: page.items.length ? "teal" : "calm",
    count: countText(page.items.length, 50, page.nextCursor),
    rows: page.items.slice(0, 5).map(notice => ({
      text: notice.title,
      href: notice.alarmId
        ? `/alarms?alarmId=${encodeURIComponent(notice.alarmId)}`
        : "/inbox",
      meta: kst(notice.createdAt)
    })),
    empty: "새 알림이 없습니다.",
    href: "/inbox",
    linkText: "알림함으로"
  });
}

const activeStates = ["RUNNING", "PAUSED", "RELEASED", "SUBMITTED"];

async function ordersPanel() {
  const page = await get("/api/v1/orders?limit=25");
  const active = page.items
    .filter(order => activeStates.includes(order.status))
    .sort((a, b) => activeStates.indexOf(a.status) - activeStates.indexOf(b.status));
  return panel({
    title: "진행할 작업",
    tone: active.length ? "amber" : "calm",
    count: `${active.length}건`,
    note: "최근 작업 25건 중 발행·진행·일시정지·제출 상태",
    rows: active.slice(0, 5).map(order => ({
      text: order.operationLabel ?? order.orderNo,
      href: "/orders",
      badge: order.status,
      meta: `목표 ${order.targetQty} · 수량 ${order.totalQty ?? 0} · 불량 ${order.rejectQty}`
    })),
    empty: "진행할 작업이 없습니다.",
    href: "/orders",
    linkText: "작업지시 화면으로"
  });
}

export async function renderDashboard() {
  if (!board || rendering) {
    return;
  }
  rendering = true;
  if (refresh) {
    refresh.disabled = true;
  }
  const sources = [
    ["발생 중 경보", alarmsPanel],
    ["읽지 않은 알림", inboxPanel],
    ["진행할 작업", ordersPanel]
  ];
  const panels = await Promise.all(
    sources.map(([title, load]) => load().catch(() => failed(title)))
  );
  board.replaceChildren(...panels);
  rendering = false;
  if (refresh) {
    refresh.disabled = false;
  }
}

if (refresh && !refresh.dataset.bound) {
  refresh.dataset.bound = "true";
  refresh.addEventListener("click", () => renderDashboard());
}
