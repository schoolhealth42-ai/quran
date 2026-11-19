/* نور القرآن — منطق التطبيق */
(function () {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const A = window.Android || null;
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const pad3 = n => String(n).padStart(3, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- تخزين ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('nq_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nq_' + k, JSON.stringify(v)); } catch (e) { /* ممتلئ */ } }
};

const DEFAULTS = {
  theme: 'light', hl: 'gold', qfont: 'hafs', layout: 'flow', qsize: 28, pages: true,
  reciter: 'Alafasy_128kbps', repeat: 1, speed: 1, basmala: true, autoscroll: true, autonext: true, awake: true,
  hsize: 21, ttsRate: 0.85
};
let S = Object.assign({}, DEFAULTS, store.get('settings', {}));
const saveS = () => store.set('settings', S);

/* ---------- شبكة ---------- */
const pending = {}; let cbSeq = 0;
window.__httpCb = (id, body) => { const p = pending[id]; if (!p) return; delete pending[id]; body == null ? p.rej(new Error('net')) : p.res(body); };
function httpText(url) {
  if (A && A.httpGet) {
    return new Promise((res, rej) => {
      const id = 'c' + (++cbSeq); pending[id] = { res, rej };
      A.httpGet(url, id);
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('timeout')); } }, 45000);
    });
  }
  return fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
}
const httpJson = url => httpText(url).then(t => JSON.parse(t));
async function firstOk(fns) { let err; for (const f of fns) { try { return await f(); } catch (e) { err = e; } } throw err || new Error('fail'); }

/* ---------- واجهة عامة ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
function copy(text) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('تم النسخ'))
    .catch(() => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('تم النسخ'); });
}
function share(text) { if (A) A.share(text); else if (navigator.share) navigator.share({ text }); else copy(text); }

function sheet(html, onClick) {
  $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('#sheetBg').hidden = false;
  $('#sheetBody').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { closeSheet(); onClick(b.dataset.k, b); } };
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBg').hidden = true; }
$('#sheetBg').onclick = closeSheet;

/* ---------- التنقل ---------- */
const history_ = [];
let current = 'home';
const TABS = ['home', 'mushaf', 'reciters', 'nawawi', 'settings'];
function go(view, push = true) {
  if (view === current) return;
  if (push) history_.push(current);
  if (TABS.includes(view)) history_.length = 0;
  current = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
  const v = $('#v-' + view);
  setTitle(v.dataset.title, v.dataset.sub);
  const tab = TABS.includes(view) ? view : ({ reader: 'mushaf', reciter: 'reciters', hadith: 'nawawi' }[view]);
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  $('#btnBack').hidden = TABS.includes(view);
  $('#btnSettings').classList.toggle('spin', view === 'settings');
  window.scrollTo(0, 0);
  updatePlayersVisibility();
  if (view === 'home') renderHome();
}
function setTitle(t, s) { $('#pageTitle').textContent = t || 'نور القرآن'; $('#pageSub').textContent = s || ''; }
window.handleBack = function () {
  if (!$('#sheet').hidden) { closeSheet(); return true; }
  if (history_.length) { go(history_.pop(), false); return true; }
  if (current !== 'home') { go('home', false); return true; }
  return false;
};
$('#btnBack').onclick = () => window.handleBack();
$('#btnSettings').onclick = () => go('settings');
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

/* ---------- تطبيق الإعدادات ---------- */
function applySettings() {
  const h = document.documentElement;
  h.dataset.theme = S.theme; h.dataset.hl = S.hl; h.dataset.qfont = S.qfont;
  h.style.setProperty('--qsize', S.qsize + 'px');
  h.style.setProperty('--hsize', S.hsize + 'px');
  $('#mushafPage').classList.toggle('layout-list', S.layout === 'list');
  if (A && A.setBars) A.setBars(S.theme === 'dark' ? '#0F1113' : '#062A1F');
}

/* ================= المصحف ================= */
const surahName = n => SURAHS[n - 1].name;

function renderSurahList() {
  const q = $('#surahSearch').value.trim();
  const f = $('#mushafSeg .on').dataset.f;
  const qn = q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const norm = s => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  $('#surahList').innerHTML = SURAHS.filter(s =>
    (f === 'all' || s.type === f) && (!q || norm(s.name).includes(norm(q)) || String(s.n) === qn)
  ).map(s => `<li data-s="${s.n}">
      <span class="num"><svg viewBox="0 0 40 40"><use href="#i-orn"/></svg>${AR(s.n)}</span>
      <div class="li-main"><b>سورة ${s.name}</b><small>${s.type} · ${AR(s.ayahs)} آية</small></div>
      <div class="li-side"><svg><use href="#i-back"/></svg></div></li>`).join('');
}
$('#surahSearch').oninput = renderSurahList;
$('#mushafSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#mushafSeg button').forEach(x => x.classList.toggle('on', x === b)); renderSurahList(); };
$('#surahList').onclick = e => { const li = e.target.closest('li'); if (li) openSurah(+li.dataset.s); };

/* جلب نص السورة: Quran.com (نص مجمع الملك فهد العثماني) ثم AlQuran.cloud احتياطيًا */
async function fetchSurahQuranCom(n) {
  let page = 1, out = [];
  for (;;) {
    const j = await httpJson(`https://api.quran.com/api/v4/verses/by_chapter/${n}?fields=text_uthmani&per_page=50&page=${page}`);
    out = out.concat(j.verses.map(v => ({ a: v.verse_number, t: v.text_uthmani, p: v.page_number, j: v.juz_number })));
    if (!j.pagination || !j.pagination.next_page) break;
    page = j.pagination.next_page;
  }
  if (!out.length) throw new Error('empty');
  return out;
}
async function fetchSurahCloud(n) {
  const j = await httpJson(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
  return j.data.ayahs.map(v => {
    let t = v.text;
    if (n !== 1 && n !== 9 && v.numberInSurah === 1) t = t.replace(/^﻿?بِسْمِ\s+\S+\s+\S+\s+\S+\s*/, '');
    return { a: v.numberInSurah, t, p: v.page, j: v.juz };
  });
}
async function getSurah(n) {
  const k = 'surah_' + n, c = store.get(k);
  if (c) return c;
  const d = await firstOk([() => fetchSurahQuranCom(n), () => fetchSurahCloud(n)]);
  store.set(k, d);
  return d;
}

let reader = { s: 0, data: [] };
async function openSurah(n, startAyah) {
  go('reader');
  const s = SURAHS[n - 1];
  reader = { s: n, data: [] };
  setTitle('سورة ' + s.name, `${s.type} · ${AR(s.ayahs)} آية`);
  $('#readerReciter').textContent = recName(S.reciter);
  $('#readerMeta').textContent = '';
  const page = $('#mushafPage');
  page.innerHTML = '<div class="loader">جارٍ تحميل السورة…</div>';
  try {
    const data = await getSurah(n);
    if (reader.s !== n) return;
    reader.data = data;
    renderReader();
    $('#readerMeta').textContent = `الجزء ${AR(data[0].j)} · صفحة ${AR(data[0].p)}`;
    const target = startAyah || 0;
    if (target) { const el = ayahEl(target); if (el) { el.scrollIntoView({ block: 'center' }); flash(el); } }
    store.set('last', { s: n, a: target || 1 });
  } catch (e) {
    page.innerHTML = `<div class="status">تعذّر تحميل السورة. تأكد من الاتصال بالإنترنت.<br><button class="btn gold" id="retrySurah">إعادة المحاولة</button></div>`;
    $('#retrySurah').onclick = () => openSurah(n, startAyah);
  }
}
function renderReader() {
  const n = reader.s, s = SURAHS[n - 1], bms = store.get('bookmarks', []);
  let html = `<div class="surah-banner"><b>سورة ${s.name}</b><small>${s.type} · آياتها ${AR(s.ayahs)}</small></div>`;
  if (n !== 1 && n !== 9) html += `<div class="basmala" id="basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
  html += '<div class="quran">';
  let lastP = reader.data[0].p, lastJ = reader.data[0].j;
  for (const v of reader.data) {
    if (S.pages && v.p !== lastP) {
      html += `<div class="page-sep">صفحة ${AR(v.p)}${v.j !== lastJ ? ' · بداية الجزء ' + AR(v.j) : ''}</div>`;
      lastP = v.p; lastJ = v.j;
    }
    const bm = bms.some(b => b.s === n && b.a === v.a) ? ' bm' : '';
    html += `<span class="ayah${bm}" data-a="${v.a}">${esc(v.t)} <span class="amark"><i>${AR(v.a)}</i></span></span> `;
  }
  html += '</div>';
  $('#mushafPage').innerHTML = html;
  markActive();
}
const ayahEl = a => $(`#mushafPage .ayah[data-a="${a}"]`);
function flash(el) { el.classList.add('active'); setTimeout(() => { if (!(AP.playing && AP.s === reader.s && AP.a === +el.dataset.a)) el.classList.remove('active'); }, 1600); }

$('#mushafPage').onclick = e => {
  const el = e.target.closest('.ayah'); if (!el) return;
  const a = +el.dataset.a, n = reader.s, text = reader.data[a - 1].t;
  const isBm = store.get('bookmarks', []).some(b => b.s === n && b.a === a);
  sheet(`<h4>سورة ${surahName(n)} · الآية ${AR(a)}</h4>
    <button class="sheet-item" data-k="play"><svg><use href="#i-play"/></svg>تشغيل التلاوة من هذه الآية</button>
    <button class="sheet-item" data-k="one"><svg><use href="#i-repeat"/></svg>تكرار هذه الآية فقط</button>
    <button class="sheet-item" data-k="bm"><svg><use href="#i-bookmark"/></svg>${isBm ? 'إزالة العلامة' : 'حفظ علامة هنا'}</button>
    <button class="sheet-item" data-k="copy"><svg><use href="#i-copy"/></svg>نسخ الآية</button>
    <button class="sheet-item" data-k="share"><svg><use href="#i-share"/></svg>مشاركة الآية</button>`, k => {
    const full = `﴿${text}﴾ [${surahName(n)}: ${AR(a)}]`;
    if (k === 'play') AP.start(n, a);
    if (k === 'one') AP.start(n, a, { only: true });
    if (k === 'copy') copy(full);
    if (k === 'share') share(full);
    if (k === 'bm') toggleBookmark(n, a);
  });
};
function toggleBookmark(s, a) {
  let b = store.get('bookmarks', []);
  if (b.some(x => x.s === s && x.a === a)) { b = b.filter(x => !(x.s === s && x.a === a)); toast('أزيلت العلامة'); }
  else { b.unshift({ s, a }); b = b.slice(0, 20); toast('حُفظت العلامة'); }
  store.set('bookmarks', b);
  const el = ayahEl(a); if (el) el.classList.toggle('bm');
}
$('#btnPrevSurah').onclick = () => { if (reader.s > 1) openSurah(reader.s - 1); };
$('#btnNextSurah').onclick = () => { if (reader.s < 114) openSurah(reader.s + 1); };
$('#btnPickReciter').onclick = () => {
  sheet('<h4>اختر القارئ</h4>' + AYAH_RECITERS.map(r =>
    `<button class="sheet-item ${r.id === S.reciter ? 'on' : ''}" data-k="${r.id}"><svg><use href="#i-mic"/></svg>${r.name}</button>`).join(''), k => {
    S.reciter = k; saveS(); $('#readerReciter').textContent = recName(k); $('#sReciter').value = k;
    if (AP.s) { const s = AP.s, a = AP.a; if (AP.playing) AP.start(s, a); }
  });
};
const recName = id => (AYAH_RECITERS.find(r => r.id === id) || AYAH_RECITERS[0]).name;

/* ---------- مشغل آية بآية مع التظليل ---------- */
const AP = {
  audio: new Audio(), pre: new Audio(), s: 0, a: 0, playing: false, rep: 0, only: false, fails: 0, phase: 'ayah',
  url(s, a) { return `https://everyayah.com/data/${S.reciter}/${pad3(s)}${pad3(a)}.mp3`; },
  start(s, a, opt = {}) {
    FP.stop();
    this.s = s; this.a = a; this.only = !!opt.only; this.rep = 0; this.fails = 0;
    this.phase = (a === 1 && s !== 1 && s !== 9 && S.basmala && !this.only) ? 'basmala' : 'ayah';
    this.playing = true; if (A) A.keepScreenOn(!!S.awake);
    this.load(); updatePlayersVisibility();
  },
  load() {
    const src = this.phase === 'basmala' ? this.url(1, 1) : this.url(this.s, this.a);
    this.audio.src = src; this.audio.playbackRate = +S.speed;
    this.audio.play().catch(() => {});
    markActive(); this.ui();
    store.set('last', { s: this.s, a: this.a });
    const nx = this.nextPos(); if (nx) { this.pre.src = this.url(nx.s, nx.a); this.pre.preload = 'auto'; }
  },
  nextPos() {
    if (this.phase === 'basmala') return { s: this.s, a: 1 };
    if (this.a < SURAHS[this.s - 1].ayahs) return { s: this.s, a: this.a + 1 };
    if (S.autonext && this.s < 114) return { s: this.s + 1, a: 1 };
    return null;
  },
  ended() {
    this.fails = 0;
    if (this.phase === 'basmala') { this.phase = 'ayah'; return this.load(); }
    const reps = this.only ? 9999 : +S.repeat;
    if (++this.rep < reps) return this.load();
    this.rep = 0;
    if (this.a < SURAHS[this.s - 1].ayahs) { this.a++; return this.load(); }
    if (S.autonext && this.s < 114) {
      const ns = this.s + 1; this.s = ns; this.a = 1;
      this.phase = (ns !== 9 && S.basmala) ? 'basmala' : 'ayah';
      if (current === 'reader') openSurah(ns).then(() => this.load()); else this.load();
      return;
    }
    this.stop(); toast('صدق الله العظيم');
  },
  error() {
    if (!this.playing) return;
    if (++this.fails <= 1) { setTimeout(() => this.load(), 800); return; }
    if (this.fails > 3) { this.pause(); toast('تعذّر تشغيل التلاوة، تحقق من الاتصال'); return; }
    toast('تعذّر تحميل الآية، الانتقال للتالية'); this.ended();
  },
  toggle() { if (!this.s) return; if (this.playing) this.pause(); else { this.playing = true; this.audio.play().catch(() => this.load()); this.ui(); } },
  pause() { this.playing = false; this.audio.pause(); this.ui(); },
  stop() { this.playing = false; this.audio.pause(); this.audio.removeAttribute('src'); this.s = 0; this.a = 0; markActive(); updatePlayersVisibility(); if (A) A.keepScreenOn(false); },
  step(d) {
    if (!this.s) return;
    let s = this.s, a = this.a + d;
    if (a < 1) { if (s > 1) { s--; a = SURAHS[s - 1].ayahs; } else a = 1; }
    if (a > SURAHS[s - 1].ayahs) { if (s < 114) { s++; a = 1; } else return; }
    if (s !== reader.s && current === 'reader') openSurah(s).then(() => this.start(s, a)); else this.start(s, a);
  },
  ui() {
    $('#apPlay use').setAttribute('href', this.playing ? '#i-pause' : '#i-play');
    if (!this.s) return;
    $('#apTitle').textContent = `سورة ${surahName(this.s)} · ${this.phase === 'basmala' ? 'البسملة' : 'الآية ' + AR(this.a)}`;
    $('#apSub').textContent = recName(S.reciter);
    const r = this.only ? '∞' : (+S.repeat > 1 ? AR(S.repeat) : '');
    $('#apRepeatN').textContent = r; $('#apRepeat').classList.toggle('on', !!r);
  }
};
AP.audio.addEventListener('ended', () => AP.ended());
AP.audio.addEventListener('error', () => AP.error());
$('#apPlay').onclick = () => AP.toggle();
$('#apStop').onclick = () => AP.stop();
$('#apNext').onclick = () => AP.step(1);
$('#apPrev').onclick = () => AP.step(-1);
$('#apRepeat').onclick = () => {
  if (AP.only) { AP.only = false; } else {
    const opts = [1, 2, 3, 5, 10]; S.repeat = opts[(opts.indexOf(+S.repeat) + 1) % opts.length]; saveS(); $('#sRepeat').value = S.repeat;
    toast(+S.repeat === 1 ? 'بدون تكرار' : `تكرار كل آية ${AR(S.repeat)} مرات`);
  }
  AP.ui();
};

function markActive() {
  $$('#mushafPage .active').forEach(e => e.classList.remove('active'));
  if (!AP.s || AP.s !== reader.s || current !== 'reader') return;
  const el = AP.phase === 'basmala' ? $('#basmala') : ayahEl(AP.a);
  if (!el) return;
  el.classList.add('active');
  if (S.autoscroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const v = reader.data[AP.a - 1];
  if (v) $('#readerMeta').textContent = `الجزء ${AR(v.j)} · صفحة ${AR(v.p)}`;
}

/* ================= القراء (تلاوات كاملة من MP3Quran) ================= */
const FAMOUS = ['العفاسي', 'عبدالباسط', 'عبد الباسط', 'الحصري', 'المنشاوي', 'السديس', 'الشريم', 'المعيقلي', 'الدوسري', 'الغامدي', 'العجمي', 'القطامي', 'الشاطري', 'الطبلاوي', 'البنا', 'جبريل', 'أيوب', 'بصفر', 'الكردي', 'الجهني', 'البدير', 'الحذيفي', 'إدريس أبكر', 'الطنيجي', 'السبيعي', 'العجلان', 'الزين محمد', 'فارس عباد', 'هزاع البلوشي', 'المطيري', 'خالد الجليل', 'بندر بليلة', 'الرفاعي', 'علي جابر'];
let RECITERS = null;
async function loadReciters() {
  $('#recStatus').innerHTML = '<div class="loader">جارٍ تحميل القراء…</div>';
  try {
    const j = await firstOk([
      () => httpJson('https://mp3quran.net/api/v3/reciters?language=ar'),
      () => httpJson('https://www.mp3quran.net/api/v3/reciters?language=ar')
    ]);
    RECITERS = j.reciters.filter(r => r.moshaf && r.moshaf.length).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    store.set('reciters', RECITERS);
    $('#recStatus').innerHTML = '';
  } catch (e) {
    RECITERS = store.get('reciters');
    if (!RECITERS) {
      $('#recStatus').innerHTML = 'تعذّر تحميل قائمة القراء.<br><button class="btn gold" id="recRetry">إعادة المحاولة</button>';
      $('#recRetry').onclick = loadReciters; return;
    }
    $('#recStatus').innerHTML = '';
  }
  renderReciters();
}
function renderReciters() {
  if (!RECITERS) return;
  const q = $('#reciterSearch').value.trim(), f = $('#recSeg .on').dataset.f, favs = store.get('favRec', []);
  const norm = s => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, '');
  let list = RECITERS;
  if (f === 'famous') list = list.filter(r => FAMOUS.some(k => norm(r.name).includes(norm(k))));
  if (f === 'fav') list = list.filter(r => favs.includes(r.id));
  if (q) list = list.filter(r => norm(r.name).includes(norm(q)));
  $('#reciterList').innerHTML = list.length ? list.map(r => `<li data-r="${r.id}">
      <span class="avatar">${esc(r.name.trim().charAt(0))}</span>
      <div class="li-main"><b>${esc(r.name)}</b><small>${r.moshaf.map(m => esc(m.name.split(' - ')[0])).slice(0, 2).join(' · ')}</small></div>
      <div class="li-side"><button class="icon-btn fav ${favs.includes(r.id) ? 'fav-on' : ''}" data-fav="${r.id}"><svg><use href="#i-star"/></svg></button></div></li>`).join('')
    : `<div class="status">${f === 'fav' ? 'لم تُضف قراء للمفضلة بعد. اضغط ★ بجانب أي قارئ.' : 'لا توجد نتائج'}</div>`;
}
$('#reciterSearch').oninput = renderReciters;
$('#recSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#recSeg button').forEach(x => x.classList.toggle('on', x === b)); renderReciters(); };
$('#reciterList').onclick = e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const id = +fav.dataset.fav; let f = store.get('favRec', []);
    f = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; store.set('favRec', f); renderReciters(); return;
  }
  const li = e.target.closest('li'); if (li) openReciter(+li.dataset.r);
};

let curRec = null, curMoshaf = null;
function openReciter(id) {
  curRec = RECITERS.find(r => r.id === id); if (!curRec) return;
  curMoshaf = curRec.moshaf[0];
  go('reciter'); setTitle(curRec.name, `${AR(curMoshaf.surah_total)} سورة`);
  renderMoshaf();
}
function renderMoshaf() {
  $('#moshafChips').innerHTML = curRec.moshaf.length > 1 ? curRec.moshaf.map((m, i) =>
    `<button class="chip ${m === curMoshaf ? 'on' : ''}" data-i="${i}">${esc(m.name)}</button>`).join('') : '';
  const ids = String(curMoshaf.surah_list).split(',').map(Number).filter(Boolean);
  $('#recSurahList').innerHTML = ids.map(n => `<li data-s="${n}">
      <span class="num"><svg viewBox="0 0 40 40"><use href="#i-orn"/></svg>${AR(n)}</span>
      <div class="li-main"><b>سورة ${surahName(n)}</b><small>${SURAHS[n - 1].type} · ${AR(SURAHS[n - 1].ayahs)} آية</small></div>
      <div class="li-side"><span class="icon-btn"><svg><use href="#i-play"/></svg></span></div></li>`).join('');
}
$('#moshafChips').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; curMoshaf = curRec.moshaf[+b.dataset.i]; setTitle(curRec.name, `${AR(curMoshaf.surah_total)} سورة`); renderMoshaf(); };
$('#recSurahList').onclick = e => { const li = e.target.closest('li'); if (li) FP.play(curRec, curMoshaf, +li.dataset.s); };

const FP = {
  audio: new Audio(), rec: null, m: null, s: 0, list: [], seeking: false,
  play(rec, m, s) {
    AP.stop();
    this.rec = rec; this.m = m; this.s = s; this.list = String(m.surah_list).split(',').map(Number).filter(Boolean);
    let server = m.server; if (!server.endsWith('/')) server += '/';
    this.audio.src = server + pad3(s) + '.mp3'; this.audio.playbackRate = +S.speed;
    this.audio.play().catch(() => toast('تعذّر التشغيل'));
    $('#fpTitle').textContent = 'سورة ' + surahName(s); $('#fpSub').textContent = rec.name + ' · ' + m.name;
    updatePlayersVisibility(); this.ui();
  },
  step(d) { const i = this.list.indexOf(this.s) + d; if (i >= 0 && i < this.list.length) this.play(this.rec, this.m, this.list[i]); },
  toggle() { if (this.audio.paused) this.audio.play(); else this.audio.pause(); },
  stop() { this.audio.pause(); this.s = 0; updatePlayersVisibility(); },
  ui() { $('#fpPlay use').setAttribute('href', this.audio.paused ? '#i-play' : '#i-pause'); }
};
const fmt = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
['play', 'pause'].forEach(ev => FP.audio.addEventListener(ev, () => FP.ui()));
FP.audio.addEventListener('timeupdate', () => {
  if (FP.seeking || !FP.audio.duration) return;
  $('#fpSeek').value = FP.audio.currentTime / FP.audio.duration * 1000;
  $('#fpCur').textContent = fmt(FP.audio.currentTime); $('#fpDur').textContent = fmt(FP.audio.duration);
});
FP.audio.addEventListener('ended', () => FP.step(1));
FP.audio.addEventListener('error', () => { if (FP.s) toast('تعذّر تحميل التلاوة'); });
$('#fpSeek').oninput = () => { FP.seeking = true; };
$('#fpSeek').onchange = () => { if (FP.audio.duration) FP.audio.currentTime = $('#fpSeek').value / 1000 * FP.audio.duration; FP.seeking = false; };
$('#fpPlay').onclick = () => FP.toggle();
$('#fpNext').onclick = () => FP.step(1);
$('#fpPrev').onclick = () => FP.step(-1);
$('#fpClose').onclick = () => FP.stop();

function updatePlayersVisibility() {
  $('#ayahPlayer').hidden = !AP.s;
  $('#fullPlayer').hidden = !FP.s || !!AP.s;
}

/* ================= الأربعون النووية ================= */
let HADITH = null;
const NAW_URLS = [
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.min.json',
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.json',
  'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/ara-nawawi.json'
];
async function loadNawawi() {
  HADITH = store.get('nawawi');
  renderHadithList();
  if (HADITH) return;
  $('#nawStatus').innerHTML = '<div class="loader">جارٍ تحميل نصوص الأحاديث…</div>';
  try {
    const j = await firstOk(NAW_URLS.map(u => () => httpJson(u)));
    HADITH = j.hadiths.filter(h => h.text && h.text.trim()).map(h => ({ n: +h.hadithnumber, t: h.text.trim() }))
      .filter(h => h.n >= 1 && h.n <= 42).sort((a, b) => a.n - b.n);
    if (!HADITH.length) throw new Error('empty');
    store.set('nawawi', HADITH);
    $('#nawStatus').innerHTML = '';
  } catch (e) {
    $('#nawStatus').innerHTML = 'تعذّر تحميل نصوص الأحاديث (يلزم اتصال لأول مرة فقط).<br><button class="btn gold" id="nawRetry">إعادة المحاولة</button>';
    $('#nawRetry').onclick = loadNawawi;
  }
  renderHadithList();
}
function renderHadithList() {
  const mem = store.get('memorized', []);
  $('#hadithList').innerHTML = NAWAWI_TITLES.map((t, i) => `<li data-h="${i + 1}">
      <span class="num"><svg viewBox="0 0 40 40"><use href="#i-orn"/></svg>${AR(i + 1)}</span>
      <div class="li-main"><b>${t}</b><small>الحديث ${AR(i + 1)}${mem.includes(i + 1) ? ' · <span class="mem-badge">✓ محفوظ</span>' : ''}</small></div>
      <div class="li-side"><svg><use href="#i-back"/></svg></div></li>`).join('');
}
$('#hadithList').onclick = e => { const li = e.target.closest('li'); if (li) openHadith(+li.dataset.h); };

let curH = 0;
function openHadith(n) {
  if (!HADITH) { toast('جارٍ تحميل الأحاديث…'); loadNawawi(); return; }
  TTS.stop();
  curH = n; if (current !== 'hadith') go('hadith');
  setTitle('الحديث ' + AR(n), 'الأربعون النووية');
  const h = HADITH.find(x => x.n === n);
  $('#hNo').textContent = AR(n); $('#hTitle').textContent = NAWAWI_TITLES[n - 1];
  const parts = h ? splitSentences(h.t) : ['النص غير متوفر حاليًا.'];
  $('#hText').innerHTML = parts.map((p, i) => `<span class="sn" data-i="${i}">${esc(p)}</span> `).join('');
  $('#hMem').classList.toggle('on', store.get('memorized', []).includes(n));
  $('#hPrev').disabled = n <= 1; $('#hNext').disabled = n >= 42;
  window.scrollTo(0, 0);
}
function splitSentences(t) {
  const out = []; let buf = '';
  for (const w of t.split(/\s+/)) {
    buf += (buf ? ' ' : '') + w;
    if (/[.،,؛:!؟?»"]$/.test(w) && buf.length > 25 || buf.length > 160) { out.push(buf); buf = ''; }
  }
  if (buf) out.push(buf);
  return out;
}
const hadithText = () => { const h = HADITH && HADITH.find(x => x.n === curH); return h ? `${NAWAWI_TITLES[curH - 1]}\n\n${h.t}\n\n(الأربعون النووية – الحديث ${curH})` : ''; };

/* نطق الحديث مع تظليل الجملة الجارية */
const TTS = {
  idx: -1, on: false, token: 0,
  start() {
    if (!A && !window.speechSynthesis) { toast('النطق غير مدعوم على هذا الجهاز'); return; }
    if (A && !A.ttsAvailable()) { toast('ثبّت محرك نطق عربي من الإعدادات'); A.openTtsSettings(); return; }
    AP.pause(); FP.audio.pause();
    this.on = true; this.token++; this.idx = -1; $('#hListen').classList.add('on'); this.next();
  },
  next() {
    const spans = $$('#hText .sn');
    $$('#hText .sn.active').forEach(s => s.classList.remove('active'));
    if (!this.on || ++this.idx >= spans.length) { this.stop(); return; }
    const el = spans[this.idx]; el.classList.add('active'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const id = `t${this.token}_${this.idx}`;
    if (A) A.speak(el.textContent, id, +S.ttsRate, 1);
    else {
      const u = new SpeechSynthesisUtterance(el.textContent); u.lang = 'ar-SA'; u.rate = +S.ttsRate;
      u.onend = () => window.onTts('done', id); speechSynthesis.cancel(); speechSynthesis.speak(u);
    }
  },
  stop() {
    this.on = false; this.token++; $('#hListen').classList.remove('on');
    $$('#hText .sn.active').forEach(s => s.classList.remove('active'));
    if (A) A.stopSpeak(); else if (window.speechSynthesis) speechSynthesis.cancel();
  }
};
window.onTts = (ev, id) => {
  if (!id.startsWith('t' + TTS.token + '_')) return;
  if (ev === 'done') TTS.next();
  if (ev === 'error') { toast('تعذّر النطق'); TTS.stop(); }
};
$('#hListen').onclick = () => TTS.on ? TTS.stop() : TTS.start();
$('#hStop').onclick = () => TTS.stop();
$('#hCopy').onclick = () => copy(hadithText());
$('#hShare').onclick = () => share(hadithText());
$('#hPrev').onclick = () => curH > 1 && openHadith(curH - 1);
$('#hNext').onclick = () => curH < 42 && openHadith(curH + 1);
$('#hMem').onclick = () => {
  let m = store.get('memorized', []);
  m = m.includes(curH) ? m.filter(x => x !== curH) : [...m, curH];
  store.set('memorized', m); $('#hMem').classList.toggle('on', m.includes(curH)); renderHadithList();
  if (m.includes(curH)) toast('بارك الله فيك! ' + AR(m.length) + ' من ٤٢');
};
$('#hText').onclick = e => { const s = e.target.closest('.sn'); if (s && TTS.on) { TTS.idx = +s.dataset.i - 1; TTS.token++; TTS.next(); } };

/* ================= الرئيسية ================= */
function renderHome() {
  const last = store.get('last');
  $('#continueCard').hidden = !last;
  if (last) $('#continueText').textContent = `سورة ${surahName(last.s)} · الآية ${AR(last.a)}`;
  const m = store.get('memorized', []).length;
  $('#nawProgText').textContent = `${AR(m)} / ٤٢`; $('#nawProgBar').style.width = (m / 42 * 100) + '%';
  const b = store.get('bookmarks', []);
  $('#bookmarksCard').hidden = !b.length;
  $('#bookmarksList').innerHTML = b.map(x => `<button class="chip" data-s="${x.s}" data-a="${x.a}">${surahName(x.s)} · ${AR(x.a)}</button>`).join('');
  try {
    $('#hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch (e) { $('#hijri').textContent = ''; }
}
$('#btnContinue').onclick = () => { const l = store.get('last'); if (l) openSurah(l.s, l.a); };
$('#bookmarksList').onclick = e => { const c = e.target.closest('[data-s]'); if (c) openSurah(+c.dataset.s, +c.dataset.a); };

/* ================= الإعدادات ================= */
function initSettings() {
  $('#sReciter').innerHTML = AYAH_RECITERS.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  const bindSel = (id, key, num) => { const el = $(id); el.value = S[key]; el.onchange = () => { S[key] = num ? +el.value : el.value; saveS(); applySettings(); onSetChange(key); }; };
  const bindChk = (id, key) => { const el = $(id); el.checked = !!S[key]; el.onchange = () => { S[key] = el.checked; saveS(); onSetChange(key); }; };
  const bindRange = (id, key, out) => { const el = $(id); el.value = S[key]; $(out).textContent = AR(S[key]); el.oninput = () => { S[key] = +el.value; $(out).textContent = AR(el.value); saveS(); applySettings(); }; };
  bindSel('#sFont', 'qfont'); bindSel('#sLayout', 'layout'); bindSel('#sReciter', 'reciter');
  bindSel('#sRepeat', 'repeat', true); bindSel('#sSpeed', 'speed', true); bindSel('#sTtsRate', 'ttsRate', true);
  bindChk('#sBasmala', 'basmala'); bindChk('#sScroll', 'autoscroll'); bindChk('#sAutoNext', 'autonext'); bindChk('#sAwake', 'awake'); bindChk('#sPages', 'pages');
  bindRange('#sQSize', 'qsize', '#sQSizeV'); bindRange('#sHSize', 'hsize', '#sHSizeV');
  const bindSw = (id, key) => {
    const box = $(id); const mark = () => $$('button', box).forEach(b => b.classList.toggle('on', b.dataset.v === S[key]));
    mark(); box.onclick = e => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; saveS(); applySettings(); mark(); };
  };
  bindSw('#themeSw', 'theme'); bindSw('#hlSw', 'hl');
  $('#sTtsSettings').onclick = () => A ? A.openTtsSettings() : toast('متاح داخل التطبيق');
  $('#sClear').onclick = () => {
    try { Object.keys(localStorage).filter(k => /^nq_(surah_|reciters|nawawi)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    if (A) A.clearCache(); RECITERS = null; HADITH = null; toast('تم مسح الملفات المؤقتة');
  };
  $('#sReset').onclick = () => { S = Object.assign({}, DEFAULTS); saveS(); applySettings(); initSettings(); toast('تمت استعادة الإعدادات'); };
}
function onSetChange(key) {
  if (key === 'speed') { AP.audio.playbackRate = +S.speed; FP.audio.playbackRate = +S.speed; }
  if (key === 'awake' && A) A.keepScreenOn(!!S.awake && AP.playing);
  if ((key === 'pages' || key === 'layout') && reader.data.length) renderReader();
  if (key === 'reciter') $('#readerReciter').textContent = recName(S.reciter);
  if (key === 'repeat') AP.ui();
}

/* ================= بدء التشغيل ================= */
const _go = go;
go = function (v, p) {
  _go(v, p);
  if (v === 'reciters' && !RECITERS) loadReciters();
  if (v === 'nawawi' && !HADITH) loadNawawi();
  if (v === 'reader') markActive();
  if (v !== 'hadith' && TTS.on) TTS.stop();
};
applySettings(); initSettings(); renderSurahList(); renderHome(); renderHadithList();
})();
