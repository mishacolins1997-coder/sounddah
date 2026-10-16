// sound dah — мемные звуки для SillyTavern
import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

const MODULE = 'sound_dah';
const BASE = new URL('./sounds/', import.meta.url).href;

const DEFAULTS = {
    enabled: true,
    volume: 60,     // 0-100
    chance: 30,     // % шанс на подходящее событие
    cooldown: 5,    // сек между звуками
    onChar: true,   // сообщения персонажа
    onUser: true,   // сообщения юзера
    onAction: true, // действия *в звёздочках*
    onSwipe: true,  // свайпы / регенерация
};

let files = [];   // имена файлов из sounds/sounds.json
let lastPlay = 0;
let actx = null;

const cfg = () => extension_settings[MODULE];

/* ---------- встроенные синтезированные звуки (работают без файлов) ---------- */
function tone(type, f0, f1, dur, vol, start = 0) {
    const t = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
}

const SYNTH = [
    // вайн-бум
    v => { tone('sine', 160, 35, 0.9, v); tone('triangle', 90, 30, 0.9, v * 0.6); },
    // эйрхорн
    v => { [0, 0.35].forEach(s => [440, 554, 659].forEach(f => tone('sawtooth', f, f, 0.3, v * 0.25, s))); },
    // грустный тромбон
    v => { [[311, 0], [293, 0.45], [277, 0.9]].forEach(([f, s]) => tone('sawtooth', f, f, 0.42, v * 0.4, s)); tone('sawtooth', 261, 200, 1.0, v * 0.4, 1.35); },
    // ба-дум-тс
    v => { tone('square', 220, 110, 0.1, v * 0.5); tone('square', 220, 110, 0.1, v * 0.5, 0.18); tone('sawtooth', 3000, 800, 0.4, v * 0.2, 0.4); },
    // бонк
    v => { tone('sine', 500, 90, 0.18, v); tone('triangle', 900, 200, 0.1, v * 0.5); },
    // ошибка
    v => { tone('square', 440, 440, 0.14, v * 0.3); tone('square', 440, 440, 0.18, v * 0.3, 0.2); },
    // та-да
    v => { tone('triangle', 523, 523, 0.15, v * 0.5); [523, 659, 784].forEach(f => tone('triangle', f, f, 0.7, v * 0.35, 0.18)); },
    // скретч пластинки
    v => { tone('sawtooth', 1400, 150, 0.35, v * 0.35); tone('square', 900, 120, 0.3, v * 0.2, 0.05); },
    // вау
    v => { tone('sine', 300, 900, 0.5, v * 0.6); tone('triangle', 600, 1800, 0.5, v * 0.2); },
];

/* ---------- воспроизведение ---------- */
function playSynth() {
    try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        const v = cfg().volume / 100;
        SYNTH[Math.floor(Math.random() * SYNTH.length)](v);
    } catch (e) { console.warn('[sound dah] synth failed', e); }
}

function playRandom() {
    const total = files.length + SYNTH.length;
    const i = Math.floor(Math.random() * total);
    if (i < files.length) {
        const a = new Audio(BASE + encodeURIComponent(files[i]));
        a.volume = cfg().volume / 100;
        a.play().catch(() => playSynth());
    } else {
        playSynth();
    }
}

function maybePlay() {
    const s = cfg();
    if (!s.enabled || s.volume <= 0) return;
    const now = Date.now();
    if (now - lastPlay < s.cooldown * 1000) return;
    if (Math.random() * 100 >= s.chance) return;
    lastPlay = now;
    playRandom();
}

/* ---------- события ---------- */
const hasAction = text => /\*[^*\n]{2,}\*/.test(text || '');

function onCharMessage(mesId) {
    const m = getContext().chat?.[mesId];
    if (!m || m.is_system || m.is_user) return;
    if (cfg().onAction && hasAction(m.mes)) return maybePlay();
    if (cfg().onChar) maybePlay();
}
function onUserMessage() { if (cfg().onUser) maybePlay(); }
function onSwipe() { if (cfg().onSwipe) maybePlay(); }

/* ---------- настройки ---------- */
function row(id, label, min, max, unit) {
    return `<div class="sound-dah-row"><label for="${id}" style="min-width:110px">${label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="1">
        <span class="sd-val" id="${id}_v"></span></div>`;
}
function check(id, label) {
    return `<label class="checkbox_label"><input type="checkbox" id="${id}"><span>${label}</span></label>`;
}

function buildUI() {
    const html = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>sound dah</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        ${check('sd_enabled', 'Включить звуки')}
        ${row('sd_volume', 'Громкость', 0, 100)}
        ${row('sd_chance', 'Шанс звука', 0, 100)}
        ${row('sd_cooldown', 'Пауза (сек)', 0, 60)}
        <hr>
        ${check('sd_onChar', 'Сообщения персонажа')}
        ${check('sd_onAction', 'Действия персонажа (*в звёздочках*)')}
        ${check('sd_onUser', 'Мои сообщения')}
        ${check('sd_onSwipe', 'Свайп / регенерация')}
        <div class="menu_button" id="sd_test" style="margin-top:8px">Проверить звук</div>
        <div class="sound-dah-hint">Звук выбирается случайно. Файлов в пуле: <span id="sd_count">0</span> + ${SYNTH.length} встроенных.</div>
      </div>
    </div>`;
    $('#extensions_settings2').append(html);

    const s = cfg();
    const sliders = { volume: '%', chance: '%', cooldown: ' с' };
    for (const [k, u] of Object.entries(sliders)) {
        const el = $('#sd_' + k);
        el.val(s[k]);
        $('#sd_' + k + '_v').text(s[k] + u);
        el.on('input', () => {
            s[k] = Number(el.val());
            $('#sd_' + k + '_v').text(s[k] + u);
            saveSettingsDebounced();
        });
    }
    for (const k of ['enabled', 'onChar', 'onAction', 'onUser', 'onSwipe']) {
        const el = $('#sd_' + k);
        el.prop('checked', s[k]);
        el.on('change', () => { s[k] = el.prop('checked'); saveSettingsDebounced(); });
    }
    $('#sd_test').on('click', playRandom);
}

async function loadManifest() {
    try {
        const r = await fetch(BASE + 'sounds.json', { cache: 'no-cache' });
        const list = await r.json();
        files = Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
    } catch { files = []; }
    $('#sd_count').text(files.length);
}

jQuery(async () => {
    extension_settings[MODULE] = Object.assign({}, DEFAULTS, extension_settings[MODULE]);
    buildUI();
    await loadManifest();

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onCharMessage);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, onUserMessage);
    eventSource.on(event_types.MESSAGE_SWIPED, onSwipe);
});
