// 共用的畫面小工具：建立元素、頁首、底部按鈕列、底部彈出面板、按兩次確認、複製、提示訊息。

let renderer = () => {};
export function setRenderer(fn) {
  renderer = fn;
}
/** 資料改變後重畫目前的畫面 */
export function refresh() {
  renderer();
}

/** 建立元素：h('button', { class: 'primary', onclick }, '儲存') */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** 頁首：左邊返回、右邊動作，下面是大標題 */
export function pageHeader({ back, backLabel = '返回', title, right, sub }) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'topbar' },
      back ? h('a', { class: 'back', href: back }, '‹ ' + backLabel) : h('span'),
      right || h('span')),
    title ? h('h1', null, title) : null,
    sub || null);
}

/** 固定在底部的主要按鈕列（會避開 iPhone 底部的安全區） */
export function bottomBar(...buttons) {
  return h('div', { class: 'bottom-bar' }, ...buttons);
}

/** 一個輸入欄位：標題 + 輸入框 + 說明 */
export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** 小標籤：kind 可以是 primary、pos、neg、muted */
export function tag(text, kind = 'muted') {
  return h('span', { class: `tag tag-${kind}` }, text);
}

// ---------- 打完一項跳到下一欄 ----------

function typingFields(container) {
  return [...container.querySelectorAll('input, textarea')].filter((el) => !el.disabled && !el.readOnly
    && !['checkbox', 'radio', 'file', 'hidden', 'date', 'datetime-local'].includes(el.type)
    && !el.classList.contains('skip-next')
    && el.getClientRects().length > 0);
}

/** 把游標移到下一個輸入欄；已經是最後一個就收起鍵盤 */
export function focusNext(container, from) {
  const fields = typingFields(container);
  const next = fields[fields.indexOf(from) + 1];
  if (next) next.focus();
  else from.blur();
}

/** 依目前順序設定鍵盤右下角的按鍵：中間的欄位顯示「下一項」，最後一個顯示「完成」 */
function labelEnterKeys(container) {
  const fields = typingFields(container).filter((el) => el.tagName === 'INPUT');
  fields.forEach((el, i) => el.setAttribute('enterkeyhint', i < fields.length - 1 ? 'next' : 'done'));
}

/** 底部彈出面板 */
export function openSheet({ title, body, footer, onClose }) {
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { type: 'button', class: 'link', onclick: () => close() }, '取消')),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-foot' }, footer) : null);
  const overlay = h('div', { class: 'overlay' }, panel);
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('show'));

  // 按鍵盤的「下一項」（Enter）就跳到下一欄；正在選注音／拼音字時不跳
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || ['checkbox', 'radio', 'file'].includes(t.type)) return;
    e.preventDefault();
    focusNext(panel, t);
  });
  panel.addEventListener('focusin', () => labelEnterKeys(panel));
  labelEnterKeys(panel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.remove('show');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setTimeout(() => {
      overlay.remove();
      if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
    }, 220);
    onClose?.();
  }
  return { close, panel };
}

/** 按兩次才會執行的按鈕（刪除、還原用） */
export function twoStepButton(label, confirmLabel, onConfirm, cls = 'danger') {
  let armed = false;
  let timer;
  const btn = h('button', {
    type: 'button',
    class: cls,
    onclick: () => {
      if (armed) {
        clearTimeout(timer);
        armed = false;
        btn.textContent = label;
        btn.classList.remove('armed');
        onConfirm();
        return;
      }
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add('armed');
      timer = setTimeout(() => {
        armed = false;
        btn.textContent = label;
        btn.classList.remove('armed');
      }, 4000);
    },
  }, label);
  return btn;
}

// ---------- 左右滑刪除 ----------

let openSwipe = null;
document.addEventListener('pointerdown', (e) => {
  if (openSwipe && !openSwipe.wrap.contains(e.target)) openSwipe.close();
}, true);

/**
 * 讓一列可以往左或往右滑，露出紅色按鈕；按鈕要按兩次才會執行（第一次變成確認字樣）。
 * blockedMessage：不能刪除時，按下去只顯示這段說明。
 */
export function swipeable(content, { label = '刪除', confirmLabel = '確定刪除', onConfirm, blockedMessage }) {
  const WIDTH = 96;
  let offset = 0;

  function makeButton(side) {
    let armed = false;
    let timer;
    const btn = h('button', { type: 'button', class: `swipe-action ${side}`, tabindex: '-1' }, label);
    btn.reset = () => {
      armed = false;
      clearTimeout(timer);
      btn.textContent = label;
      btn.classList.remove('armed');
    };
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (blockedMessage) {
        toast(blockedMessage);
        api.close();
        return;
      }
      if (!armed) {
        armed = true;
        btn.textContent = confirmLabel;
        btn.classList.add('armed');
        timer = setTimeout(btn.reset, 4000);
        return;
      }
      btn.reset();
      await onConfirm();
    });
    return btn;
  }

  const left = makeButton('left');
  const right = makeButton('right');
  content.classList.add('swipe-content');
  const wrap = h('div', { class: 'swipe' }, left, right, content);

  function setX(x, animate) {
    content.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    content.style.transform = x ? `translateX(${x}px)` : '';
    left.hidden = !(x > 0);
    right.hidden = !(x < 0);
  }

  const api = {
    wrap,
    open(side) {
      if (openSwipe && openSwipe !== api) openSwipe.close();
      offset = side === 'left' ? WIDTH : -WIDTH;
      setX(offset, true);
      openSwipe = api;
    },
    close() {
      offset = 0;
      setX(0, true);
      left.reset();
      right.reset();
      if (openSwipe === api) openSwipe = null;
    },
  };

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let horizontal = null;
  let moved = false;

  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    tracking = true;
    horizontal = null;
    moved = false;
  });
  content.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (horizontal === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      horizontal = Math.abs(mx) > Math.abs(my);
      if (!horizontal) {
        tracking = false;
        return;
      }
      try { content.setPointerCapture(e.pointerId); } catch { /* 有些瀏覽器不支援，沒關係 */ }
    }
    dx = mx;
    moved = true;
    setX(Math.max(-WIDTH * 1.3, Math.min(WIDTH * 1.3, offset + dx)), false);
  });
  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!horizontal) return;
    const x = offset + dx;
    if (x > WIDTH / 2) api.open('left');
    else if (x < -WIDTH / 2) api.open('right');
    else api.close();
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', end);
  // 剛滑過、或按鈕還開著時，點這一列只會把它關起來，不會打開編輯
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-action')) return;
    if (moved || offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      if (!moved) api.close();
      moved = false;
    }
  }, true);

  setX(0, false);
  return wrap;
}

let toastTimer;
/** 畫面下方短暫出現的訊息 */
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** 複製文字；瀏覽器不允許時，跳出可以長按全選的文字框 */
export async function copyText(text, okMessage = '已複製') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
    return true;
  } catch {
    showCopyFallback(text);
    return false;
  }
}

export function showCopyFallback(text, title = '請手動複製') {
  const area = h('textarea', { class: 'copy-area', readonly: true, rows: 12, value: text });
  openSheet({
    title,
    body: [
      h('p', { class: 'note' }, '這個瀏覽器不允許自動複製。請長按下面的文字，選「全選」再按「拷貝」。'),
      area,
    ],
  });
  setTimeout(() => {
    area.focus();
    area.setSelectionRange(0, text.length);
  }, 260);
}

/** 防止連點：執行期間按鈕停用 */
export function busy(btn, fn) {
  return async (...args) => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
      toast('儲存失敗，請再試一次');
    } finally {
      btn.disabled = false;
    }
  };
}
