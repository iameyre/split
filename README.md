# 分帳

自己用的分帳 App（PWA）。純 HTML／CSS／JavaScript，不需要編譯、不需要伺服器、不需要登入。

- **資料只存在手機的瀏覽器裡**（IndexedDB），不會上傳到任何地方，也沒有統計或追蹤。
- 網頁裡有安全規則（Content-Security-Policy），只允許載入這個網站自己的檔案，連到外部網站的請求會被瀏覽器擋下來。
- 加到 iPhone 主畫面後，沒有網路也能打開。

## 檔案

| 路徑 | 用途 |
|---|---|
| `index.html` | 唯一的頁面 |
| `manifest.webmanifest` | PWA 設定（名稱、圖示、顏色） |
| `sw.js` | 離線快取（service worker） |
| `css/style.css` | 樣式 |
| `js/calc.js` | 分帳計算（換算、均分、指定金額、結算配對） |
| `js/text.js` | 金額與日期格式、複製轉帳文字／明細文字 |
| `js/backup.js` | 備份格式檢查、備份提醒 |
| `js/banks.js` | 台灣銀行代碼（輸入時自動帶入） |
| `js/explain.js` | 「查看計算過程」的內容 |
| `js/image.js` | 產生結算／明細圖片（瀏覽器內建 canvas） |
| `js/db.js`、`js/store.js` | IndexedDB 讀寫 |
| `js/ui.js` | 共用畫面元件 |
| `js/views/` | 各個畫面 |
| `icons/` | App 圖示 |
| `tests/` | 自動測試（只在電腦上跑，App 本身用不到） |
| `serve.bat` | 在電腦上預覽 |

## 在電腦上跑測試

需要先安裝 Node.js。在這個資料夾開終端機，執行：

```
npm test
```

## 在電腦上預覽

點兩下 `serve.bat`，瀏覽器會打開 http://localhost:8123 。關掉黑色視窗就會停止。
預覽時預設不啟用離線快取，改了檔案重新整理就看得到；網址改成 http://localhost:8123/?sw 可以測試離線功能。

## 更新 App

1. 修改檔案。
2. 打開 `sw.js`，把最上面的 `VERSION` 加 1（例如 `'v1'` → `'v2'`）。**沒改這個，手機會一直用舊版。**
3. 上傳到 GitHub。
4. 手機上打開 App 一次（會在背景下載新版），關掉再打開就是新版。

## 資料放在哪

- 手機：從主畫面打開的 App 有自己的儲存空間，跟 Safari 分頁裡的資料是分開的。
- 刪掉主畫面的圖示，資料會一起被刪掉。換手機或重灌前，請先用「備份與還原」下載備份檔。
