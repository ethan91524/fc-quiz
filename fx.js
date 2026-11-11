// 動畫與音效層（2026-11 改版）。只負責「播一次」：加 class → 時間到移除；靜止畫面由 CSS 決定。
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const SOUND_KEY = 'fc-sound';
let sound = false, ac = null;
try { sound = localStorage.getItem(SOUND_KEY) === '1'; } catch {}

export const reducedMotion = () => RM.matches;
export const soundOn = () => sound;
export function setSound(on) {
  sound = on;
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch {}
  if (on) tone(1200, .05, 'square', .03, 0);
}

// 全部用 Web Audio 即時合成，不載音檔（離線也能用、不增加快取）
function tone(f, d, type, g, at) {
  if (!sound) return;
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .55, t + d);
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(v).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch {}
}
export function sfxAnswer(ok) {
  tone(1800, .04, 'square', .03, 0);
  if (!ok) tone(420, .18, 'sawtooth', .025, .12);
  tone(ok ? 880 : 220, .22, 'triangle', .08, .95); tone(90, .16, 'sine', .18, .95);
}

const timers = new WeakMap();
function pulse(el, cls, ms) {
  if (!el || RM.matches) return;
  clearTimeout(timers.get(el));
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  timers.set(el, setTimeout(() => el.classList.remove(cls), ms));
}

// 手繪紅圈：正解字母
const RING = '<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><path d="M21 4C9 3 3 12 4 21s9 15 18 14 14-8 13-17S27 4 15 6"/></svg>';
export function decorateOptions(root) {
  root.querySelectorAll('.option.correct .letter').forEach(l => { if (!l.querySelector('.ring')) l.insertAdjacentHTML('beforeend', RING); });
}
export function decorateFeedback(fb) {
  fb.querySelectorAll(':scope > *').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  fb.querySelectorAll('.k-flow').forEach(c => c.querySelectorAll('.csec').forEach((s, i) => s.style.setProperty('--s', i)));
}
export function playReveal(card, ok) { pulse(card, 'fx-in', 2600); sfxAnswer(ok); }

export function countUp(el, to, { dur = 900, fmt = v => v.toLocaleString() } = {}) {
  if (!el) return;
  if (RM.matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function f(t) { const p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4))); el.textContent = fmt(v); if (p < 1) requestAnimationFrame(f); })(t0);
}

// 首頁開場：每次開 App 只播一次
let heroPlayed = false;
export function playHero(hero, nums) {
  if (heroPlayed || !hero) return; heroPlayed = true;
  pulse(hero, 'fx-go', 3000);
  nums.forEach(([el, to, fmt], i) => setTimeout(() => { countUp(el, to, { fmt }); tone(1400 + i * 200, .05, 'square', .025, 0); }, 250 + i * 220));
  tone(70, .5, 'sine', .2, .5);
}

// 成績：滾輪數字（每位數一欄 0–9 ×3，轉到第三輪的目標數字）
export function rollNumber(el, n) {
  const digits = String(n).split('');
  el.setAttribute('aria-label', String(n));
  el.innerHTML = digits.map(() => `<span class="col" aria-hidden="true">${Array.from({ length: 30 }, (_, k) => `<span>${k % 10}</span>`).join('')}</span>`).join('');
  const cols = [...el.children];
  const land = () => cols.forEach((c, i) => { c.style.transitionDelay = i * .12 + 's'; c.style.transform = `translateY(-${20 + +digits[i]}em)`; });
  if (RM.matches) { cols.forEach(c => c.style.transition = 'none'); land(); return; }
  cols.forEach(c => { c.style.transition = 'none'; c.style.transform = 'none'; });
  void el.offsetWidth; cols.forEach(c => c.style.transition = '');
  requestAnimationFrame(land);
}
export function playResult(view) {
  pulse(view, 'fx-go', 3800);
  for (let k = 0; k < 9; k++) tone(1600, .02, 'square', .015, .1 + k * .11);
  tone(80, .25, 'sine', .22, 1.5); tone(1900, .05, 'square', .02, 2.6); tone(140, .12, 'sawtooth', .04, 3);
}
export const RING2 = '<svg class="ring2" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path d="M60 3C25 1 3 8 4 18s25 14 52 13 41-6 40-15S75 2 40 5"/></svg>';

export function playCards(list) {
  [...list.children].slice(0, 24).forEach((c, i) => c.style.setProperty('--k', i));
  pulse(list, 'fx-go', 1800);
}
