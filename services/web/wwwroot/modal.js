// 모든 업무 팝업([role="dialog"][aria-modal="true"])에 같은 키보드 동작을 붙인다.
// - 열리면 팝업 안 첫 입력칸(없으면 첫 버튼)으로 포커스를 옮긴다.
// - Tab·Shift+Tab은 팝업 안에서만 돈다.
// - 닫히면 팝업을 연 버튼(열기 직전 포커스)으로 포커스를 돌려준다.
// Esc로 닫기는 각 화면의 @onkeydown이 처리한다(포커스가 팝업 안에 있어야 동작한다).
// 팝업 화면 구조는 Blazor가 그리고, 이 파일은 포커스만 다룬다.

const DIALOG = '[role="dialog"][aria-modal="true"]';
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

// 열린 팝업과 각 팝업을 연 요소. 마지막이 맨 위 팝업이다.
const open = [];
let lastOutside = null;

// :disabled는 위쪽 fieldset이 비활성인 경우까지 포함한다.
function focusables(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE))
    .filter(element => !element.matches(':disabled')
      && element.type !== 'hidden'
      && element.getClientRects().length > 0);
}

// 실제로 보이는 팝업만 다룬다(숨긴 탭 안의 팝업 등은 제외).
function shown(dialog) {
  return dialog.isConnected
    && !dialog.closest('[hidden]')
    && dialog.getClientRects().length > 0;
}

// 첫 포커스: 닫기 버튼보다 실제 입력칸을 먼저 고른다.
function firstFocus(dialog) {
  const items = focusables(dialog);
  return items.find(element => element.matches('input, select, textarea'))
    ?? items.find(element => !element.classList.contains('modal-close'))
    ?? items[0]
    ?? null;
}

function opened(dialog) {
  if (open.some(entry => entry.dialog === dialog)) {
    return;
  }

  open.push({
    dialog,
    opener: lastOutside
  });
  const target = firstFocus(dialog);
  if (target) {
    target.focus();
  } else {
    dialog.setAttribute('tabindex', '-1');
    dialog.focus();
  }
}

function closed(entry) {
  open.splice(open.indexOf(entry), 1);
  const opener = entry.opener;
  if (opener && opener.isConnected && !opener.matches(':disabled')) {
    opener.focus();
  }
}

function sync() {
  for (const entry of [...open]) {
    if (!shown(entry.dialog)) {
      closed(entry);
    }
  }

  for (const dialog of document.querySelectorAll(DIALOG)) {
    if (shown(dialog)) {
      opened(dialog);
    }
  }
}

// 팝업 밖에서 마지막으로 포커스를 받은 요소를 기억한다(팝업을 연 버튼).
document.addEventListener('focusin', event => {
  if (!event.target.closest(DIALOG)) {
    lastOutside = event.target;
  }
});

document.addEventListener('keydown', event => {
  const top = open[open.length - 1];
  if (event.key !== 'Tab' || !top) {
    return;
  }

  const items = focusables(top.dialog);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const inside = top.dialog.contains(document.activeElement);
  if (event.shiftKey && (!inside || document.activeElement === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
    event.preventDefault();
    first.focus();
  }
});

// 팝업 추가·제거와, 숨김(hidden) 전환으로 보이고 사라지는 경우를 모두 본다.
new MutationObserver(sync).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: [
    'hidden',
    'aria-modal',
    'role'
  ]
});
