/* ==========================================================================
   AIoT Personal Portal — app.js
   本檔案示範 Lecture 2 的核心主題：
     1. DOM 選取與事件處理
     2. 非同步 fetch 與 JSON 解析（projects.json、Open-Meteo API）
     3. SVG 程序化繪製（時鐘進度環）
     4. localStorage 的序列化與狀態還原
     5. Web Audio API 合成音效（不載入任何音檔）
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. 狀態管理：整個 App 的偏好設定只存在「一個」物件裡
   -------------------------------------------------------------------------- */

const STORAGE_KEY = 'aiot_user_state';

// 預設狀態。第一次開啟網站、或 localStorage 壞掉時會用這一份
const DEFAULT_STATE = {
  name: '陳浩忻',
  tagline: 'AIoT & Data Analytics · 國立中興大學',
  theme: 'aurora',          // aurora | minimal | sunset
  format24h: true,          // true = 24 小時制
  soundEnabled: false,      // 滴答聲，預設關閉（瀏覽器本來就不允許自動播放）
  selectedCity: 'taichung',
  zenMode: false,
};

/**
 * 從 localStorage 把狀態讀回來（hydration）。
 * localStorage 只能存字串，所以存的時候要 JSON.stringify、讀的時候 JSON.parse。
 * 用 try/catch 包起來：使用者可能手動改壞資料，或瀏覽器停用了 localStorage。
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    // 用展開運算子合併，確保之後新增的欄位也有預設值
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (error) {
    console.warn('讀取偏好設定失敗，改用預設值：', error);
    return { ...DEFAULT_STATE };
  }
}

/** 把狀態寫回 localStorage */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('儲存偏好設定失敗：', error);
  }
}

const state = loadState();

/* --------------------------------------------------------------------------
   2. DOM 選取：開頭一次抓齊，避免每秒重複查詢造成效能浪費
   -------------------------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const el = {
  body:         document.body,
  avatar:       $('#avatar'),
  userName:     $('#userName'),
  userTagline:  $('#userTagline'),
  greetingIcon: $('#greetingIcon'),
  greetingText: $('#greetingText'),

  hours:     $('#hours'),
  minutes:   $('#minutes'),
  seconds:   $('#seconds'),
  meridiem:  $('#meridiem'),
  millis:    $('#millis'),
  unixTime:  $('#unixTime'),
  ring:      $('#ringProgress'),

  fullDate:   $('#fullDate'),
  weekChip:   $('#weekChip'),
  doyChip:    $('#doyChip'),
  formatChip: $('#formatChip'),

  weather:     $('#weather'),
  weatherIcon: $('#weatherIcon'),
  weatherTemp: $('#weatherTemp'),
  weatherDesc: $('#weatherDesc'),
  citySelect:  $('#citySelect'),

  soundBtn:  $('#soundBtn'),
  soundIcon: $('#soundIcon'),
  themeBtn:  $('#themeBtn'),
  zenBtn:    $('#zenBtn'),
  zenHint:   $('#zenHint'),

  overlay:      $('#overlay'),
  drawer:       $('#drawer'),
  drawerClose:  $('#drawerClose'),
  projectGrid:  $('#projectGrid'),
  formatToggle: $('#formatToggle'),
};

/* --------------------------------------------------------------------------
   3. 時鐘：日期計算工具
   -------------------------------------------------------------------------- */

/**
 * ISO 8601 週數。
 * 規則：每年的第 1 週是「包含該年第一個星期四」的那一週。
 * 作法：把日期移到當週的星期四，再看它是那一年的第幾週。
 */
function getISOWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;          // 週日 0 → 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber); // 移到當週星期四
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
}

/** 一年中的第幾天（1 ~ 366） */
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

/** 依照時間決定問候語 */
function getGreeting(hour) {
  if (hour < 5)  return { icon: '🌙', text: 'Good night' };
  if (hour < 12) return { icon: '🌅', text: 'Good morning' };
  if (hour < 18) return { icon: '☀️', text: 'Good afternoon' };
  if (hour < 22) return { icon: '🌆', text: 'Good evening' };
  return { icon: '🌙', text: 'Good night' };
}

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');

// 進度環的周長：2πr，r = 150
const RING_CIRCUMFERENCE = 2 * Math.PI * 150;

let lastRenderedSecond = -1;
let lastRenderedDay = -1;

/**
 * 每一幀都會跑的繪製函式。
 * 用 requestAnimationFrame 而不是 setInterval(…, 1000)：
 *   - 毫秒數才能跟著螢幕更新率平順變化
 *   - 分頁切到背景時瀏覽器會自動暫停，省電
 */
function renderClock() {
  const now = new Date();
  const hours24 = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();

  // --- 時分秒 ---
  let displayHours = hours24;
  if (!state.format24h) {
    displayHours = hours24 % 12 || 12;   // 0 點要顯示成 12
  }

  el.hours.textContent = pad2(displayHours);
  el.minutes.textContent = pad2(minutes);
  el.seconds.textContent = pad2(seconds);
  el.millis.textContent = pad3(ms);
  el.unixTime.textContent = Math.floor(now.getTime() / 1000);

  // --- 進度環：秒 + 毫秒 → 0~1 → dashoffset ---
  const progress = (seconds + ms / 1000) / 60;
  el.ring.style.strokeDasharray = RING_CIRCUMFERENCE;
  el.ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  // --- 每秒才需要更新一次的東西 ---
  if (seconds !== lastRenderedSecond) {
    lastRenderedSecond = seconds;

    const greeting = getGreeting(hours24);
    el.greetingIcon.textContent = greeting.icon;
    el.greetingText.textContent = greeting.text;

    if (state.soundEnabled) tickEngine.playTick();
  }

  // --- 每天才需要更新一次的東西 ---
  const dayOfYear = getDayOfYear(now);
  if (dayOfYear !== lastRenderedDay) {
    lastRenderedDay = dayOfYear;
    el.fullDate.textContent = now.toLocaleDateString('zh-TW', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
    el.weekChip.textContent = `Week ${getISOWeek(now)}`;
    el.doyChip.textContent = `Day ${dayOfYear}`;
  }

  requestAnimationFrame(renderClock);
}

/* --------------------------------------------------------------------------
   4. Web Audio API：用程式合成滴答聲，不載入任何音檔
   -------------------------------------------------------------------------- */

class TickAudioEngine {
  constructor() {
    this.ctx = null;
  }

  /** AudioContext 必須由使用者的點擊觸發才能建立，否則瀏覽器會擋 */
  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
  }

  playTick() {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();   // 振盪器＝聲音來源
    const gain = this.ctx.createGain();        // 音量控制

    // 頻率從 1400Hz 快速滑到 300Hz，聽起來就像機械錶的「咔」
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

    // 音量快速衰減，避免變成持續的嗡嗡聲
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  }
}

const tickEngine = new TickAudioEngine();

/* --------------------------------------------------------------------------
   5. 天氣：Open-Meteo API（完全免金鑰）
   -------------------------------------------------------------------------- */

const CITIES = {
  taichung:  { label: '臺中',  lat: 24.1477, lon: 120.6736 },
  taipei:    { label: '臺北',  lat: 25.0330, lon: 121.5654 },
  hsinchu:   { label: '新竹',  lat: 24.8138, lon: 120.9675 },
  tainan:    { label: '臺南',  lat: 22.9999, lon: 120.2270 },
  kaohsiung: { label: '高雄',  lat: 22.6273, lon: 120.3014 },
};

/** WMO 天氣代碼 → 對應的 emoji 與中文描述 */
const WEATHER_CODES = {
  0:  ['☀️', '晴朗'],       1:  ['🌤️', '大致晴朗'],  2:  ['⛅', '局部多雲'],
  3:  ['☁️', '陰天'],       45: ['🌫️', '有霧'],      48: ['🌫️', '霧淞'],
  51: ['🌦️', '毛毛雨'],     53: ['🌦️', '毛毛雨'],    55: ['🌦️', '強毛毛雨'],
  61: ['🌧️', '小雨'],       63: ['🌧️', '中雨'],      65: ['🌧️', '大雨'],
  66: ['🌧️', '凍雨'],       67: ['🌧️', '強凍雨'],    71: ['🌨️', '小雪'],
  73: ['🌨️', '中雪'],       75: ['❄️', '大雪'],      77: ['🌨️', '霰'],
  80: ['🌦️', '陣雨'],       81: ['🌧️', '強陣雨'],    82: ['⛈️', '劇烈陣雨'],
  85: ['🌨️', '陣雪'],       86: ['❄️', '強陣雪'],
  95: ['⛈️', '雷雨'],       96: ['⛈️', '雷雨帶冰雹'], 99: ['⛈️', '強雷雨帶冰雹'],
};

/**
 * 非同步取得天氣。
 * async/await 讓非同步程式碼讀起來像同步的；
 * 失敗時要有 fallback，不能讓整個頁面壞掉（FR-2.4）。
 */
async function loadWeather() {
  const city = CITIES[state.selectedCity] || CITIES.taichung;

  el.weatherIcon.textContent = '⏳';
  el.weatherDesc.textContent = '讀取天氣中';
  el.weather.classList.remove('is-error');

  // 用 URL 物件組網址，比字串相加安全也好讀
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', city.lat);
  url.searchParams.set('longitude', city.lon);
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'Asia/Taipei');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const temperature = Math.round(data.current.temperature_2m);
    const [icon, description] = WEATHER_CODES[data.current.weather_code] || ['🌡️', '未知天氣'];

    el.weatherIcon.textContent = icon;
    el.weatherTemp.textContent = `${temperature}°C`;
    el.weatherDesc.textContent = `${description} · ${city.label}`;

    // 成功時把結果快取起來，下次連不上網至少有東西可以顯示
    try {
      localStorage.setItem('aiot_weather_cache', JSON.stringify({
        city: state.selectedCity, temperature, icon, description, at: Date.now(),
      }));
    } catch (_) { /* 快取失敗不影響主要功能 */ }

  } catch (error) {
    console.warn('取得天氣失敗：', error);
    showCachedWeather(city);
  }
}

/** 天氣 API 失敗時的降級顯示 */
function showCachedWeather(city) {
  el.weather.classList.add('is-error');
  try {
    const cached = JSON.parse(localStorage.getItem('aiot_weather_cache') || 'null');
    if (cached && cached.city === state.selectedCity) {
      el.weatherIcon.textContent = cached.icon;
      el.weatherTemp.textContent = `${cached.temperature}°C`;
      el.weatherDesc.textContent = `${cached.description} · ${city.label}（離線快取）`;
      return;
    }
  } catch (_) { /* 快取讀不到就往下走 */ }

  el.weatherIcon.textContent = '📡';
  el.weatherTemp.textContent = '--°C';
  el.weatherDesc.textContent = '暫時無法取得天氣';
}

/* --------------------------------------------------------------------------
   6. 專案清單：用 fetch 載入 projects.json，再動態產生 DOM
   -------------------------------------------------------------------------- */

async function loadProjects() {
  try {
    const response = await fetch('./projects.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = await response.json();
    renderProjects(projects);
  } catch (error) {
    console.warn('載入 projects.json 失敗：', error);
    el.projectGrid.innerHTML =
      '<p class="loading">專案資料載入失敗。<br>' +
      '若是在本機用 file:// 直接開啟，瀏覽器會擋住 fetch，<br>' +
      '請改用 <code>python3 -m http.server</code> 或查看線上版本。</p>';
  }
}

/** 把 JSON 資料轉成一張張專案卡片插進 DOM */
function renderProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) {
    el.projectGrid.innerHTML = '<p class="loading">目前還沒有專案。</p>';
    return;
  }

  // 先在記憶體裡組好 DocumentFragment，最後一次插入，減少畫面重排
  const fragment = document.createDocumentFragment();

  projects.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const techBadges = (project.techStack || [])
      .map((tech) => `<span>${escapeHtml(tech)}</span>`)
      .join('');

    const links = [];
    if (project.githubUrl && project.githubUrl !== '#') {
      links.push(`<a href="${escapeHtml(project.githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>`);
    }
    if (project.demoUrl && project.demoUrl !== '#') {
      links.push(`<a href="${escapeHtml(project.demoUrl)}" target="_blank" rel="noopener">Live Demo ↗</a>`);
    }

    card.innerHTML = `
      <div class="pc-top">
        <span class="pc-category">${escapeHtml(project.category || '')}</span>
        ${project.badge ? `<span class="pc-badge">${escapeHtml(project.badge)}</span>` : ''}
      </div>
      <h4>${escapeHtml(project.title || '')}</h4>
      <p class="pc-desc">${escapeHtml(project.description || '')}</p>
      ${techBadges ? `<div class="pc-tech">${techBadges}</div>` : ''}
      ${links.length ? `<div class="pc-links">${links.join('')}</div>` : ''}
    `;

    fragment.appendChild(card);
  });

  el.projectGrid.innerHTML = '';
  el.projectGrid.appendChild(fragment);
}

/** 簡單的 HTML 跳脫，避免 JSON 內容被當成標籤解析 */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

/* --------------------------------------------------------------------------
   7. 抽屜
   -------------------------------------------------------------------------- */

function openDrawer(tabName) {
  el.drawer.classList.add('is-open');
  el.drawer.setAttribute('aria-hidden', 'false');
  el.overlay.hidden = false;
  switchTab(tabName);
}

function closeDrawer() {
  el.drawer.classList.remove('is-open');
  el.drawer.setAttribute('aria-hidden', 'true');
  el.overlay.hidden = true;
}

function switchTab(tabName) {
  $$('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  });
  ['projects', 'about', 'connect'].forEach((name) => {
    $(`#panel-${name}`).hidden = name !== tabName;
  });
}

/* --------------------------------------------------------------------------
   8. 把狀態套用到畫面上
   -------------------------------------------------------------------------- */

/** 由名字產生頭像縮寫：中文取第一個字，英文取每個單字的首字母 */
function makeMonogram(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '··';
  // 判斷是否為中日韓文字
  if (/[一-鿿]/.test(trimmed[0])) return trimmed[0];
  return trimmed.split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase();
}

function applyState() {
  el.body.dataset.theme = state.theme;
  el.userName.textContent = state.name;
  el.userTagline.textContent = state.tagline;
  el.avatar.textContent = makeMonogram(state.name);

  el.formatChip.textContent = state.format24h ? '24H' : '12H';
  el.meridiem.hidden = state.format24h;
  if (!state.format24h) {
    el.meridiem.textContent = new Date().getHours() < 12 ? 'AM' : 'PM';
  }

  el.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  el.soundBtn.setAttribute('aria-pressed', String(state.soundEnabled));

  el.citySelect.value = state.selectedCity;

  el.body.classList.toggle('zen', state.zenMode);
  el.zenHint.hidden = !state.zenMode;

  document.title = `${state.name} · 個人入口網站`;
}

/* --------------------------------------------------------------------------
   9. 事件綁定
   -------------------------------------------------------------------------- */

const THEMES = ['aurora', 'minimal', 'sunset'];

function bindEvents() {
  // --- 主題循環切換 ---
  el.themeBtn.addEventListener('click', () => {
    const nextIndex = (THEMES.indexOf(state.theme) + 1) % THEMES.length;
    state.theme = THEMES[nextIndex];
    applyState();
    saveState();
  });

  // --- 聲音開關 ---
  el.soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      tickEngine.init();
      // 有些瀏覽器建立後仍是 suspended，要手動 resume
      if (tickEngine.ctx && tickEngine.ctx.state === 'suspended') tickEngine.ctx.resume();
    }
    applyState();
    saveState();
  });

  // --- Zen 模式 ---
  el.zenBtn.addEventListener('click', toggleZen);

  // --- 12 / 24 小時制 ---
  el.formatToggle.addEventListener('click', () => {
    state.format24h = !state.format24h;
    applyState();
    saveState();
  });

  // --- 開啟抽屜 ---
  $$('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => openDrawer(button.dataset.tab));
  });

  // --- 抽屜內切換分頁 ---
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // --- 關閉抽屜：關閉鈕、點背景 ---
  el.drawerClose.addEventListener('click', closeDrawer);
  el.overlay.addEventListener('click', closeDrawer);

  // --- 城市切換 ---
  el.citySelect.addEventListener('change', () => {
    state.selectedCity = el.citySelect.value;
    saveState();
    loadWeather();
  });

  // --- 可編輯的名字與簡介 ---
  bindEditable(el.userName, 'name');
  bindEditable(el.userTagline, 'tagline');

  // --- 鍵盤快捷鍵 ---
  document.addEventListener('keydown', (event) => {
    // 正在編輯文字時不要觸發快捷鍵
    if (event.target.isContentEditable) return;

    if (event.key === 'Escape') {
      if (state.zenMode) { toggleZen(); return; }
      closeDrawer();
    }
    if (event.key === 'z' || event.key === 'Z') {
      toggleZen();
    }
  });
}

function toggleZen() {
  state.zenMode = !state.zenMode;
  if (state.zenMode) closeDrawer();
  applyState();
  saveState();
}

/**
 * 讓 contenteditable 的元素在失焦或按 Enter 時存檔。
 * 注意要用 textContent 而不是 innerHTML，避免使用者貼上帶格式的內容。
 */
function bindEditable(element, stateKey) {
  element.addEventListener('blur', () => {
    const value = element.textContent.trim();
    state[stateKey] = value || DEFAULT_STATE[stateKey];
    applyState();
    saveState();
  });

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      element.blur();
    }
    if (event.key === 'Escape') {
      element.textContent = state[stateKey];
      element.blur();
    }
  });
}

/* --------------------------------------------------------------------------
   10. 啟動
   -------------------------------------------------------------------------- */

function init() {
  applyState();
  bindEvents();
  renderClock();       // 開始每一幀的時鐘繪製
  loadProjects();      // 非同步載入專案
  loadWeather();       // 非同步載入天氣

  // 天氣每 10 分鐘更新一次
  setInterval(loadWeather, 10 * 60 * 1000);

  console.log('%c AIoT Personal Portal ', 'background:#35d6f5;color:#070b18;font-weight:bold;border-radius:4px;');
  console.log('快捷鍵：Z = Zen 模式、ESC = 關閉／離開');
}

// DOM 準備好之後再啟動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
