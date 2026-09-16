# 個人入口網站與動態時鐘儀表板

> **AIoT-DA 課程 — DIC-1 (Do in Class 1)**
> Lecture 2：瀏覽器、現代 Web 核心與非同步資料流
> 陳浩忻　5115056032　國立中興大學

🔗 **Live Demo**：<https://qpple654321.github.io/0916-dic1/>

零依賴的個人入口網站，用純 HTML / CSS / JavaScript 實作，
完整走過 Lecture 2 的核心路徑：

```
Browser → HTML/CSS → JavaScript → Fetch API / JSON → DOM 操作 → LocalStorage → GitHub Pages
```

## 功能

### ⏱️ 即時時鐘
- 毫秒級更新的時分秒與 UNIX timestamp
- SVG 圓形進度環，一分鐘走完一圈
- 12 / 24 小時制切換（設定會被記住）
- 依時間變化的問候語（早安 / 午安 / 晚安）
- 完整日期、ISO 週數、一年中的第幾天
- 名字與簡介可直接點擊編輯

### 🌤️ 即時天氣
- 串接 [Open-Meteo API](https://open-meteo.com/)，**完全免金鑰**
- 五個城市可切換：臺中、臺北、新竹、臺南、高雄
- 連線失敗時自動降級顯示離線快取

### 📂 抽屜式內容面板
- **Projects**：專案清單，資料由 `fetch('./projects.json')` 非同步載入
- **About**：自我介紹、研究興趣、技能
- **Connect**：GitHub、Email、課程平台連結
- 可用背景點擊、關閉鈕或 <kbd>ESC</kbd> 關閉

### 🎨 其他
- 三種主題配色：Aurora（深空）、Minimal（極簡亮色）、Sunset（黃昏）
- Zen 專注模式（<kbd>Z</kbd>）：隱藏所有介面，變成純粹的桌面時鐘
- Web Audio API 合成的機械錶滴答聲，**不載入任何音檔**
- 所有偏好設定存在 `localStorage` 的 `aiot_user_state`

## 技術重點

| 主題 | 實作位置 |
|------|----------|
| DOM 選取與事件處理 | `app.js` → `bindEvents()` |
| 非同步 fetch 與 JSON 解析 | `app.js` → `loadProjects()`、`loadWeather()` |
| SVG 程序化繪製 | `app.js` → `renderClock()` 的 `strokeDashoffset` 計算 |
| LocalStorage 序列化與還原 | `app.js` → `loadState()`、`saveState()` |
| Web Audio 合成音效 | `app.js` → `class TickAudioEngine` |
| CSS 變數與主題切換 | `style.css` → `:root` / `[data-theme]` |

### 為什麼用 `requestAnimationFrame` 而不是 `setInterval`

毫秒數要跟著螢幕更新率平順變化，而且分頁切到背景時瀏覽器會自動暫停 rAF，比較省電。

### 進度環的原理

圓周長 = 2πr = 2 × π × 150 ≈ 942.48。
把「秒 + 毫秒」換算成 0～1 的比例，再用 `stroke-dashoffset` 控制露出多少：

```js
const progress = (seconds + ms / 1000) / 60;
ring.style.strokeDashoffset = 942.48 * (1 - progress);
```

## 檔案結構

```text
0916-dic1/
├── index.html      # 語意化結構
├── style.css       # 設計變數、三種主題、玻璃擬態、響應式
├── app.js          # 狀態管理、時鐘引擎、非同步載入、事件
├── projects.json   # 專案資料（不寫死在 HTML 裡）
└── README.md
```

## 本機執行

因為 `app.js` 用 `fetch()` 載入 `projects.json`，
瀏覽器的 CORS 政策會擋掉 `file://` 的請求，所以要開一個本機伺服器：

```bash
python3 -m http.server 8777
```

然後開 <http://localhost:8777>。

> 直接雙擊 `index.html` 也能開，時鐘和天氣都正常，
> 只有專案清單會顯示載入失敗 —— 這是瀏覽器的安全限制，不是程式壞掉。

## 部署

推到 GitHub 後，到 **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**，
約 60 秒後網站就會上線。

## 快捷鍵

| 按鍵 | 功能 |
|------|------|
| <kbd>Z</kbd> | 進入／離開 Zen 模式 |
| <kbd>ESC</kbd> | 關閉抽屜／離開 Zen 模式 |
| <kbd>Enter</kbd> | 編輯名字時儲存 |

---

參考規格：[huanchen1107/0916-2](https://github.com/huanchen1107/0916-2)（授課教師 Huan Chen 的示範專案）

## 授權

本專案採用 [MIT License](./LICENSE) 開源。
