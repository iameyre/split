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
