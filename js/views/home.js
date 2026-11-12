// 首頁：活動列表、備份提醒、建立活動、備份與還原入口。

import { h, pageHeader, bottomBar, refresh, swipeable, tag, toast } from '../ui.js';
import * as store from '../store.js';
import { activityStatus } from '../calc.js';
import { formatTWD } from '../text.js';
import { shouldRemind } from '../backup.js';
import { openActivityForm } from './activity-form.js';

const STATUS_TAG = { pending: 'primary', settled: 'pos', empty: 'muted' };

export function renderHome(root) {
  const acts = [...store.state.activities].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const list = acts.length
    ? [
      h('ul', { class: 'list' }, acts.map((a) => {
        const s = store.summaryOf(a.id);
        const st = activityStatus(s);
        const row = h('a', { class: 'row', href: `#/a/${a.id}` },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, a.name),
            h('div', { class: 'row-tags' },
              tag(`${a.memberIds.length} 人`),
              tag(st.text, STATUS_TAG[st.kind]),
              a.travel ? tag('旅行') : null)),
          h('div', { class: 'row-amount num' }, formatTWD(s.total)));
        return h('li', null, swipeable(row, {
          confirmLabel: '確定刪除',
          onConfirm: async () => {
            await store.deleteActivity(a.id);
            toast(`已刪除「${a.name}」`);
            refresh();
          },
        }));
      })),
      h('p', { class: 'swipe-hint' }, '在活動上往左或往右滑，可以刪除'),
    ]
    : h('p', { class: 'empty' }, '還沒有活動。按下方「建立活動」開始第一個。');

  root.replaceChildren(...[
    pageHeader({
      title: '活動',
      right: h('a', { class: 'head-link', href: '#/friends' }, '朋友與收款資訊'),
    }),
    reminder(),
    h('div', null, list),
    h('div', { class: 'page-foot' }, h('a', { class: 'text-link', href: '#/backup' }, '備份與還原')),
    bottomBar(h('button', { type: 'button', class: 'primary', onclick: () => openActivityForm() }, '建立活動')),
  ].filter(Boolean));
}

function reminder() {
  if (!shouldRemind(store.state.meta, store.hasData())) return null;
  return h('div', { class: 'notice' },
    h('p', null, '已經超過 14 天沒有備份了。資料只存在這支手機裡，建議現在備份一次。'),
    h('div', { class: 'notice-actions' },
      h('a', { class: 'text-link', href: '#/backup' }, '去備份'),
      h('button', {
        type: 'button',
        class: 'link',
        onclick: async () => {
          await store.setMeta('reminderDismissedAt', Date.now());
          refresh();
        },
      }, '知道了')));
}
