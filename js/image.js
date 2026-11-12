// 產生結算／明細圖片：直接用瀏覽器內建的 canvas 畫，不用任何套件、不連網。

import { h, openSheet, toast } from './ui.js';
import {
  formatTWD, formatMoney, formatDate, formatDateTime, expenseTime, sortExpensesAsc, transferPaymentLines,
  splitDescription, noTransferText,
} from './text.js';

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
const COLOR = {
  bg: '#F6F3EC',
  text: '#272727',
  muted: '#69655D',
  primary: '#34304F',
  pos: '#3B6790',
  neg: '#B0503D',
  line: 'rgba(39,39,39,0.16)',
};
const WIDTH = 1080;
const PAD = 72;

const STYLE = {
  title: { size: 60, weight: 700, color: COLOR.text, gap: 10 },
  meta: { size: 30, weight: 400, color: COLOR.muted, gap: 6 },
  h2: { size: 38, weight: 700, color: COLOR.primary, gap: 14, before: 44 },
  row: { size: 38, weight: 700, color: COLOR.text, gap: 8, before: 26 },
  text: { size: 32, weight: 400, color: COLOR.text, gap: 6 },
  small: { size: 29, weight: 400, color: COLOR.muted, gap: 6 },
};

function font(st) {
  return `${st.weight} ${st.size}px ${FONT}`;
}

/** 把一段文字依寬度折行 */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/**
 * blocks：[{ t: 'title'|'meta'|'h2'|'text'|'small'|'row'|'rule', text, right, color, rightColor, indent }]
 * 先量高度、再畫，回傳 canvas。
 */
export function drawBlocks(blocks) {
  const measure = document.createElement('canvas').getContext('2d');
  const ops = [];
  let y = PAD;
  for (const b of blocks) {
    if (b.t === 'rule') {
      y += 22;
      ops.push({ kind: 'rule', y });
      y += 2;
      continue;
    }
    const st = STYLE[b.t] || STYLE.text;
    const lineH = Math.round(st.size * 1.4);
    y += st.before || 0;
    measure.font = font(st);
    const indent = b.indent ? 36 : 0;
    let rightW = 0;
    if (b.right) rightW = measure.measureText(b.right).width + 28;
    const lines = wrap(measure, b.text, WIDTH - PAD * 2 - indent - rightW);
    lines.forEach((text, i) => {
      ops.push({ kind: 'text', text, x: PAD + indent, y: y + st.size, st, color: b.color || st.color });
      if (i === 0 && b.right) {
        ops.push({ kind: 'text', text: b.right, x: WIDTH - PAD, y: y + st.size, st, color: b.rightColor || st.color, align: 'right' });
      }
      y += lineH;
    });
    y += st.gap;
  }
  y += PAD;

  const canvas = document.createElement('canvas');
  // 太長的圖縮小一點，避免超過手機瀏覽器的畫布上限
  const scale = Math.min(1, 15000 / y);
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(y * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, WIDTH, y);
  for (const op of ops) {
    if (op.kind === 'rule') {
      ctx.fillStyle = COLOR.line;
      ctx.fillRect(PAD, op.y, WIDTH - PAD * 2, 2);
      continue;
    }
    ctx.font = font(op.st);
    ctx.fillStyle = op.color;
    ctx.textAlign = op.align || 'left';
    ctx.fillText(op.text, op.x, op.y);
  }
  return canvas;
}

function nameFn(friendsById) {
  return (id) => friendsById[id]?.name ?? '（已刪除）';
}

function transferBlocks(summary, friendsById) {
  const name = nameFn(friendsById);
  if (!summary.transfers.length) return [{ t: 'text', text: noTransferText(summary) }];
  const blocks = [];
  summary.transfers.forEach((tr, i) => {
    if (i > 0) blocks.push({ t: 'rule' });
    blocks.push({ t: 'row', text: `${name(tr.from)} → ${name(tr.to)}`, right: formatTWD(tr.amount) });
    const pay = transferPaymentLines(friendsById[tr.to]);
    if (pay.length) pay.forEach((line) => blocks.push({ t: 'text', text: line }));
    else blocks.push({ t: 'small', text: '（還沒有收款資訊）' });
  });
  return blocks;
}

/** 結算圖：誰要轉給誰、多少錢、轉到哪個帳號 */
export function settlementBlocks(activity, summary, friendsById) {
  return [
    { t: 'title', text: activity.name },
    { t: 'meta', text: `總支出 ${formatTWD(summary.total)}・共 ${summary.count} 筆・${activity.memberIds.length} 人` },
    { t: 'meta', text: `${formatDateTime()} 產生` },
    { t: 'h2', text: '誰要轉給誰' },
    ...transferBlocks(summary, friendsById),
  ];
}

/** 明細圖：每筆帳、每個人、轉帳 */
export function detailBlocks(activity, summary, expenses, repayments, friendsById) {
  const name = nameFn(friendsById);
  const blocks = [
    { t: 'title', text: activity.name },
    { t: 'meta', text: `總支出 ${formatTWD(summary.total)}・共 ${summary.count} 筆・${activity.memberIds.length} 人` },
    { t: 'meta', text: `${formatDateTime()} 產生` },
  ];
  let lastDate = null;
  for (const e of sortExpensesAsc(expenses)) {
    if (e.date !== lastDate) {
      blocks.push({ t: 'h2', text: formatDate(e.date) });
      lastDate = e.date;
    }
    const b = summary.breakdowns.get(e.id);
    blocks.push({ t: 'row', text: `${expenseTime(e)}  ${e.title}`, right: formatTWD(b.twd) });
    if (e.currency && e.currency !== 'TWD') blocks.push({ t: 'small', text: `${formatMoney(e.amount, e.currency)} × 匯率 ${e.rate}`, indent: true });
    blocks.push({ t: 'small', text: splitDescription(e, b, activity.memberIds, friendsById), indent: true });
  }
  blocks.push({ t: 'h2', text: '每個人' });
  for (const id of activity.memberIds) {
    const p = summary.people[id];
    let right = '打平';
    let rightColor = COLOR.muted;
    if (p.net > 0) { right = `應收 ${formatTWD(p.net)}`; rightColor = COLOR.pos; }
    if (p.net < 0) { right = `應付 ${formatTWD(-p.net)}`; rightColor = COLOR.neg; }
    blocks.push({ t: 'row', text: name(id), right, rightColor });
    const extra = [];
    if (p.repaidOut) extra.push(`已還 ${formatTWD(p.repaidOut)}`);
    if (p.repaidIn) extra.push(`已收 ${formatTWD(p.repaidIn)}`);
    blocks.push({ t: 'small', text: [`先付 ${formatTWD(p.paid)}`, `分攤 ${formatTWD(p.owed)}`, ...extra].join('・'), indent: true });
  }
  if (repayments.length) {
    blocks.push({ t: 'h2', text: '已還款' });
    for (const r of [...repayments].sort((a, b) => a.createdAt - b.createdAt)) {
      blocks.push({ t: 'text', text: `${name(r.from)} → ${name(r.to)}`, right: formatTWD(r.amount) });
      blocks.push({ t: 'small', text: formatDateTime(r.createdAt), indent: true });
    }
  }
  blocks.push({ t: 'h2', text: '誰要轉給誰' }, ...transferBlocks(summary, friendsById));
  return blocks;
}

/** 畫好圖片，先在面板裡預覽，再讓使用者分享到 LINE 或存到照片 */
export async function showImage(blocks, fileName) {
  const canvas = drawBlocks(blocks);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    toast('產生圖片失敗');
    return;
  }
  const file = new File([blob], fileName, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const canShare = !!navigator.canShare?.({ files: [file] });

  const shareBtn = h('button', { type: 'button', class: 'primary' }, canShare ? '分享到 LINE／存到照片' : '下載圖片');
  shareBtn.addEventListener('click', async () => {
    if (canShare) {
      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err?.name !== 'AbortError') toast('分享失敗，可以長按上面的圖片儲存');
      }
      return;
    }
    const a = h('a', { href: url, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
  });

  openSheet({
    title: '圖片預覽',
    body: [
      h('img', { class: 'share-preview', src: url, alt: '結算圖片預覽' }),
      h('p', { class: 'field-hint' }, '也可以長按圖片，選「儲存到照片」或「分享」。'),
    ],
    footer: shareBtn,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
}
