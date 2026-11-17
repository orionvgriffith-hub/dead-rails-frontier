// Interface: saddlebag + storage windows (drag and drop, rotate, split, merge, drop, quick move), hotbar,
// survival bars, prompts, notifications, tooltips and the death screen. Every control calls a real game action.
import { ITEMS, ICONS, CATS, RARITY } from './items.js';
import { dims } from './grid.js';

const C = 46; // pixels per grid cell
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kg = w => (Math.round(w * 10) / 10).toFixed(1);

export function createUI(o) {
  const { P, HOTBAR, CARRY } = o, A = o.act;
  // ---------- HUD ----------
  const hud = document.getElementById('hud');
  const stats = h('div', 'paper', `
    <div class="bar hp"><b data-i18n="hp">Health</b><i><s></s></i><em></em></div>
    <div class="bar food"><b data-i18n="food">Hunger</b><i><s></s></i><em></em></div>
    <div class="bar stam"><b data-i18n="stam">Stamina</b><i><s></s></i><em></em></div>
    <div class="bar warm"><b data-i18n="warmth">Warmth</b><i><s></s></i><em></em></div>
    <div class="row trow"><span class="temp"></span><span class="wx"></span></div>
    <div class="row srow"><span class="cash"></span><span class="wt"></span><span class="online"></span></div>`); stats.id = 'stats';
  const hotbar = h('div'); hotbar.id = 'hotbar';
  const feed = h('div'); feed.id = 'feed';
  const interact = h('div', null, '<kbd>E</kbd> <span></span>'); interact.id = 'interact';
  const hurtEl = h('div'); hurtEl.id = 'hurt';
  hud.append(stats, hotbar, feed, interact, hurtEl);
  const fuelRow = h('div', 'fuelrow', '<span data-i18n="firebox">Firebox</span><i><s id="fuelBar"></s></i><em id="fuelTxt"></em>');
  document.getElementById('trainHud').insertBefore(fuelRow, document.querySelector('#trainHud .tk'));

  // ---------- inventory window ----------
  const wrap = h('div'); wrap.id = 'invwrap';
  const card = h('div', 'paper'); card.id = 'invcard';
  card.innerHTML = `
    <div class="ihead">
      <div><div class="eyebrow">Inventory</div><h2>Saddlebag &amp; storage</h2></div>
      <div class="ifilter"><input id="invSearch" type="search" placeholder="Search items" aria-label="Search items" autocomplete="off">
      <select id="invCat" aria-label="Filter by category"><option value="">All categories</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <button class="ibtn" id="invClose" title="Close (Tab)">Close</button></div>
    </div>
    <div class="ibody">
      <section id="pPanel"><div class="phead"><h3>Saddlebag</h3><span class="cash"></span><span class="wt"></span><button class="ibtn" data-a="sortInv">Sort</button></div>
        <div class="grid" data-side="inv"></div>
        <div class="phead hb"><h3>Hotbar</h3><span class="hint">Drag items here, or hover one and press 1–6</span></div><div id="hotbind"></div></section>
      <section id="cPanel"><div class="phead"><h3 id="cTitle"></h3><span id="cSize" class="hint"></span><button class="ibtn" data-a="sortCont">Sort</button><button class="ibtn" data-a="takeAll">Take all</button></div>
        <div id="cCash"></div>
        <div class="grid" data-side="cont"></div></section>
      <section id="cEmpty"><h3>Nothing open</h3><p>Look at a chest, crate, cabinet, wagon, the cargo car or a bag and press <kbd>E</kbd> to search it. Drag an item out of this window to drop it on the ground.</p></section>
    </div>
    <div class="ifoot">Drag to move · <kbd>R</kbd> rotate while dragging · <kbd>Shift</kbd>+click quick move · right-click for more</div>`;
  wrap.appendChild(card); document.body.appendChild(wrap);
  const ctxMenu = h('div', 'paper'); ctxMenu.id = 'ctxmenu'; document.body.appendChild(ctxMenu);
  const tip = h('div', 'paper'); tip.id = 'tip'; document.body.appendChild(tip);
  const death = h('div', null, `<div class="card paper"><div class="eyebrow">The territory takes another</div><h1>You <em>died</em></h1><div class="rule"></div><p class="lede" id="deathCause"></p><p id="deathMsg"></p><button id="respawn">Ride again</button></div>`); death.id = 'death'; document.body.appendChild(death);
  death.querySelector('#respawn').onclick = () => A.respawn();

  const gInv = card.querySelector('.grid[data-side=inv]'), gCont = card.querySelector('.grid[data-side=cont]');
  const search = card.querySelector('#invSearch'), cat = card.querySelector('#invCat');
  search.addEventListener('input', () => renderAll()); cat.addEventListener('change', () => renderAll());
  card.querySelector('#invClose').onclick = () => { show(false); A.closeContainer(); };
  card.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) A[b.dataset.a](); });

  let isOpen = false;
  function show(v) { isOpen = v; wrap.classList.toggle('open', v); hideMenu(); tip.classList.remove('on'); if (v) renderAll(); else { cancelDrag(); search.blur(); } }
  const matches = it => { const d = ITEMS[it.t], q = search.value.trim().toLowerCase(); return (!cat.value || d.cat === cat.value) && (!q || d.name.toLowerCase().includes(q) || CATS[d.cat].toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)); };

  function renderGrid(el, g, side) {
    el.innerHTML = ''; el.style.width = g.w * C + 'px'; el.style.height = g.h * C + 'px';
    for (const it of g.items) {
      const d = ITEMS[it.t], [w, hh] = dims(it);
      const div = h('div', 'item' + (o.isBusy(it.id) ? ' busy' : '') + (matches(it) ? '' : ' dim'));
      div.dataset.id = it.id; div.dataset.side = side;
      div.style.cssText = `left:${it.x * C}px;top:${it.y * C}px;width:${w * C}px;height:${hh * C}px;--rc:${RARITY[d.rarity].color}`;
      const img = h('img'); img.src = ICONS[it.t]; img.alt = d.name; img.draggable = false;
      img.style.width = d.w * C + 'px'; img.style.height = d.h * C + 'px'; img.style.transform = `translate(-50%,-50%)${it.r ? ' rotate(90deg)' : ''}`;
      div.appendChild(img);
      if (d.stack > 1) div.appendChild(h('span', 'n', String(it.n)));
      if (side === 'inv') { const k = P.hot.indexOf(it.id); if (k >= 0) div.appendChild(h('span', 'hk', String(k + 1))); }
      el.appendChild(div);
    }
  }
  function renderInv() {
    if (!isOpen) return;
    renderGrid(gInv, P.inv, 'inv');
    const w = P.inv.weight();
    for (const e of card.querySelectorAll('#pPanel .cash')) e.textContent = '$' + P.cash;
    const wt = card.querySelector('#pPanel .wt'); wt.textContent = `${kg(w)} / ${CARRY} kg`; wt.classList.toggle('over', w > CARRY);
  }
  function renderCont() {
    if (!isOpen) return;
    const g = o.container(), m = o.containerMeta(), info = o.openInfo();
    card.querySelector('#cPanel').style.display = g ? '' : 'none';
    card.querySelector('#cEmpty').style.display = g ? 'none' : '';
    if (!g) return;
    card.querySelector('#cTitle').textContent = info.title;
    card.querySelector('#cSize').textContent = `${g.w} × ${g.h} · ${kg(g.weight())} kg`;
    const cash = card.querySelector('#cCash');
    cash.innerHTML = m && m.cash ? `<span>$${m.cash} in loose bills and coin</span><button class="ibtn" data-a="takeCash">Take $${m.cash}</button>` : '';
    renderGrid(gCont, g, 'cont');
    if (!g.items.length && !(m && m.cash)) gCont.appendChild(h('div', 'emptyNote', 'Empty'));
  }
  function slotHTML(i, sel) {
    const id = P.hot[i], it = id && P.inv.get(id), d = it && ITEMS[it.t];
    return `<div class="hslot${sel === i ? ' sel' : ''}" data-slot="${i}"><span class="k">${i + 1}</span>${it ? `<img src="${ICONS[it.t]}" alt="${esc(d.name)}" draggable="false">${d.stack > 1 ? `<span class="n">${P.inv.count(it.t)}</span>` : ''}` : ''}${it && sel == null ? '<button class="x" title="Clear slot">×</button>' : ''}</div>`;
  }
  function renderHot() {
    let s = ''; for (let i = 0; i < HOTBAR; i++) s += slotHTML(i, P.sel); hotbar.innerHTML = s;
    const sel = P.sel >= 0 && P.hot[P.sel] && P.inv.get(P.hot[P.sel]);
    hotbar.dataset.name = sel ? ITEMS[sel.t].name : '';
    if (isOpen) { let b = ''; for (let i = 0; i < HOTBAR; i++) b += slotHTML(i, null); card.querySelector('#hotbind').innerHTML = b; }
  }
  card.querySelector('#hotbind').addEventListener('click', e => { const x = e.target.closest('.x'); if (!x) return; const i = +x.parentElement.dataset.slot; P.hot[i] = null; if (P.sel === i) P.sel = -1; renderHot(); renderInv(); });
  function renderAll() { renderInv(); renderCont(); renderHot(); }

  // ---------- drag and drop ----------
  let drag = null, hl = null;
  const gridOf = side => side === 'inv' ? P.inv : o.container();
  const itemOf = (side, id) => { const g = gridOf(side); return g && g.get(id); };
  card.addEventListener('pointerdown', e => {
    const el = e.target.closest('.item'); if (!el || e.button !== 0) return;
    const side = el.dataset.side, id = el.dataset.id, it = itemOf(side, id); if (!it || o.isBusy(id)) return;
    const r = el.getBoundingClientRect();
    drag = { side, id, t: it.t, r: it.r ? 1 : 0, ox: Math.floor((e.clientX - r.left) / C), oy: Math.floor((e.clientY - r.top) / C), sx: e.clientX, sy: e.clientY, moved: false, el, ghost: null };
    hideMenu(); tip.classList.remove('on'); e.preventDefault();
  });
  function ghostFor() {
    const d = ITEMS[drag.t], [w, hh] = drag.r ? [d.h, d.w] : [d.w, d.h];
    if (!drag.ghost) { drag.ghost = h('div', 'ghost'); document.body.appendChild(drag.ghost); }
    drag.ghost.style.width = w * C + 'px'; drag.ghost.style.height = hh * C + 'px';
    drag.ghost.innerHTML = `<img src="${ICONS[drag.t]}" style="width:${d.w * C}px;height:${d.h * C}px;transform:translate(-50%,-50%)${drag.r ? ' rotate(90deg)' : ''}">`;
  }
  function hoverAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.classList.contains('hslot') && el.closest('#hotbind')) return { kind: 'hot', slot: +el.dataset.slot };
      if (el.classList.contains('grid')) {
        const r = el.getBoundingClientRect(), fx = (x - r.left) / C, fy = (y - r.top) / C;
        return { kind: 'grid', side: el.dataset.side, el, gx: Math.floor(fx) - drag.ox, gy: Math.floor(fy) - drag.oy, cx: Math.floor(fx), cy: Math.floor(fy) };
      }
      if (el === card) return { kind: 'card' };
    }
    return { kind: 'out' };
  }
  // what would happen if released here
  function resolve(t) {
    if (t.kind === 'hot') return drag.side === 'inv' ? { ok: true, how: 'bind' } : { ok: false };
    if (t.kind === 'out') return drag.side === 'inv' ? { ok: true, how: 'drop' } : { ok: false };
    if (t.kind !== 'grid') return { ok: false };
    const g = gridOf(t.side); if (!g) return { ok: false };
    const under = g.at(t.cx, t.cy), d = ITEMS[drag.t];
    if (under && under.id !== drag.id && under.t === drag.t && d.stack > 1 && under.n < d.stack) return { ok: true, how: 'merge', mergeId: under.id, under };
    const ignore = t.side === drag.side ? drag.id : null;
    return { ok: g.fits(drag.t, t.gx, t.gy, drag.r, ignore), how: 'place' };
  }
  function showHL(t, res) {
    if (hl) { hl.remove(); hl = null; }
    if (t.kind !== 'grid') return;
    const d = ITEMS[drag.t], [w, hh] = drag.r ? [d.h, d.w] : [d.w, d.h];
    hl = h('div', 'hl ' + (res.how === 'merge' ? 'merge' : res.ok ? 'good' : 'bad'));
    if (res.how === 'merge') { const [uw, uh] = dims(res.under); hl.style.cssText = `left:${res.under.x * C}px;top:${res.under.y * C}px;width:${uw * C}px;height:${uh * C}px`; }
    else hl.style.cssText = `left:${t.gx * C}px;top:${t.gy * C}px;width:${w * C}px;height:${hh * C}px`;
    t.el.appendChild(hl);
  }
  function moveGhost(x, y) { if (!drag.ghost) return; drag.ghost.style.left = x - (drag.ox + 0.5) * C + 'px'; drag.ghost.style.top = y - (drag.oy + 0.5) * C + 'px'; }
  let lastX = 0, lastY = 0;
  addEventListener('pointermove', e => {
    lastX = e.clientX; lastY = e.clientY;
    if (!drag) { hoverTip(e); return; }
    if (!drag.moved) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return; drag.moved = true; drag.el.classList.add('lifted'); ghostFor(); document.body.classList.add('dragging'); }
    moveGhost(e.clientX, e.clientY);
    const t = hoverAt(e.clientX, e.clientY); showHL(t, resolve(t));
  });
  addEventListener('pointerup', e => {
    if (!drag) return;
    const dr = drag;
    if (!dr.moved) { drag = null; if (e.shiftKey) quick(dr.side, dr.id); return; }
    const t = hoverAt(e.clientX, e.clientY), res = resolve(t);
    cancelDrag();
    if (!res.ok) return;
    if (res.how === 'bind') return A.bindHot(t.slot, dr.id);
    if (res.how === 'drop') return A.dropInv(dr.id);
    const m = res.how === 'merge' ? res.mergeId : null;
    if (dr.side === 'inv' && t.side === 'inv') m ? A.mergeInv(dr.id, m) : A.moveInv(dr.id, t.gx, t.gy, dr.r);
    else if (dr.side === 'inv') A.invToCont(dr.id, m ? null : t.gx, m ? null : t.gy, dr.r, m);
    else if (t.side === 'inv') A.contToInv(dr.id, m ? null : t.gx, m ? null : t.gy, dr.r, m);
    else A.contMove(dr.id, t.gx, t.gy, dr.r, m);
  });
  function cancelDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove(); if (drag.el) drag.el.classList.remove('lifted');
    if (hl) { hl.remove(); hl = null; }
    document.body.classList.remove('dragging'); drag = null; renderAll();
  }
  function quick(side, id) { if (side === 'inv') { if (o.container()) A.quickToCont(id); } else A.quickToInv(id); }
  // bound to the "Rotate item" action while the window is open
  function rotateDrag() {
    if (!(drag && drag.moved)) return false;
    drag.r ^= 1; [drag.ox, drag.oy] = [drag.oy, drag.ox]; ghostFor(); moveGhost(lastX, lastY); const t = hoverAt(lastX, lastY); showHL(t, resolve(t)); return true;
  }
  // a hotbar key while hovering a saddlebag item puts it in that slot
  function bindHovered(k) {
    const el = document.elementFromPoint(lastX, lastY), it = el && el.closest('.item[data-side=inv]');
    if (it && k >= 0 && k < HOTBAR) { A.bindHot(k, it.dataset.id); return true; }
    return false;
  }

  // ---------- context menu ----------
  card.addEventListener('contextmenu', e => {
    e.preventDefault();
    const el = e.target.closest('.item'); if (!el) { hideMenu(); return; }
    const side = el.dataset.side, id = el.dataset.id, it = itemOf(side, id); if (!it || o.isBusy(id)) return;
    const d = ITEMS[it.t], rows = [];
    if (side === 'inv') {
      if (d.use) rows.push([d.cat === 'medical' ? 'Use' : d.cat === 'food' && /canteen|coffee/.test(it.t) ? 'Drink' : 'Eat', () => A.useItem(id)]);
      if (d.up) rows.push(['Fit to the Jupiter', () => A.useItem(id)]);
      if (it.t === 'firewood') rows.push(['Build a campfire', () => A.useItem(id)]);
      if (d.fuel && o.nearFirebox()) rows.push(['Stoke the firebox', () => A.stokeWith(id)]);
      if (o.container()) rows.push([`Move to ${o.openInfo().title}`, () => A.quickToCont(id)]);
      if (it.n > 1) rows.push(['Split stack…', () => splitUI(side, it)]);
      rows.push(['hot']);
      rows.push(['Drop on the ground', () => A.dropInv(id)]);
    } else {
      rows.push(['Take', () => A.quickToInv(id)]);
      if (it.n > 1) rows.push(['Split stack…', () => splitUI(side, it)]);
    }
    ctxMenu.innerHTML = `<div class="mt" style="color:${RARITY[d.rarity].color}">${esc(d.name)}</div>`;
    for (const r of rows) {
      if (r[0] === 'hot') { const row = h('div', 'mhot', '<span>Hotbar</span>'); for (let i = 0; i < HOTBAR; i++) { const b = h('button', P.hot[i] === id ? 'on' : '', String(i + 1)); b.onclick = () => { A.bindHot(i, id); hideMenu(); }; row.appendChild(b); } ctxMenu.appendChild(row); continue; }
      const b = h('button', 'mi', r[0]); b.onclick = () => { const keep = r[0].endsWith('…'); r[1](); if (!keep) hideMenu(); }; ctxMenu.appendChild(b);
    }
    placeFloat(ctxMenu, e.clientX, e.clientY); ctxMenu.classList.add('on'); tip.classList.remove('on');
  });
  function splitUI(side, it) {
    const max = it.n - 1, half = Math.floor(it.n / 2);
    ctxMenu.innerHTML = `<div class="mt">Split ${esc(ITEMS[it.t].name)}</div><div class="split"><input type="range" min="1" max="${max}" value="${half}"><output>${half}</output></div><button class="mi" data-ok>Split off <b>${half}</b></button><button class="mi" data-cancel>Cancel</button>`;
    const rg = ctxMenu.querySelector('input'), out = ctxMenu.querySelector('output'), ok = ctxMenu.querySelector('[data-ok]');
    rg.oninput = () => { out.textContent = rg.value; ok.innerHTML = `Split off <b>${rg.value}</b>`; };
    ok.onclick = () => { side === 'inv' ? A.splitInv(it.id, +rg.value) : A.splitCont(it.id, +rg.value); hideMenu(); };
    ctxMenu.querySelector('[data-cancel]').onclick = hideMenu;
  }
  function hideMenu() { ctxMenu.classList.remove('on'); }
  addEventListener('pointerdown', e => { if (!ctxMenu.contains(e.target)) hideMenu(); }, true);
  function placeFloat(el, x, y) { el.style.left = '0px'; el.style.top = '0px'; el.classList.add('on'); const r = el.getBoundingClientRect(); el.style.left = Math.min(x + 12, innerWidth - r.width - 8) + 'px'; el.style.top = Math.min(y + 12, innerHeight - r.height - 8) + 'px'; }

  // ---------- tooltip ----------
  let tipId = null;
  function hoverTip(e) {
    if (!isOpen || ctxMenu.classList.contains('on') || (o.settings && o.settings.tooltips === false)) { tip.classList.remove('on'); return; }
    const el = e.target.closest && e.target.closest('.item, #hotbind .hslot');
    let it = null;
    if (el && el.classList.contains('item')) it = itemOf(el.dataset.side, el.dataset.id);
    else if (el) { const id = P.hot[+el.dataset.slot]; it = id && P.inv.get(id); }
    if (!it) { tip.classList.remove('on'); tipId = null; return; }
    if (tipId !== it.id + it.n) {
      tipId = it.id + it.n; const d = ITEMS[it.t], R = RARITY[d.rarity], u = d.use || {};
      const eff = [u.hp && `+${u.hp} health`, u.hunger && `+${u.hunger} hunger`, u.stamina && `+${u.stamina} stamina`, d.fuel && `+${d.fuel}% locomotive fuel`, u.warmth && `+${u.warmth} warmth`, d.warm && `+${d.warm}°C while carried (${d.slot})`, d.up && 'Fits to the Jupiter', d.light && 'Lights the way when held'].filter(Boolean);
      tip.innerHTML = `<div class="tn" style="color:${R.color}">${esc(d.name)}</div><div class="tr"><span style="color:${R.color}">${R.name}</span> · ${CATS[d.cat]}</div><p>${esc(d.desc)}</p>${eff.length ? `<div class="te">${eff.join(' · ')}</div>` : ''}<div class="ts"><span>${d.stack > 1 ? `${it.n} / ${d.stack}` : `${d.w}×${d.h}`}</span><span>${kg(d.weight * it.n)} kg</span><span>$${(d.value * it.n).toFixed(d.value < 1 ? 1 : 0)}</span></div>`;
    }
    placeFloat(tip, e.clientX, e.clientY); tip.classList.add('on');
  }

  // ---------- HUD bits ----------
  const bars = { hp: stats.querySelector('.hp'), food: stats.querySelector('.food'), stam: stats.querySelector('.stam'), warm: stats.querySelector('.warm') };
  const setBar = (el, v) => { el.querySelector('s').style.width = Math.max(0, Math.min(100, v)) + '%'; el.querySelector('em').textContent = Math.ceil(v); el.classList.toggle('low', v < 25); };
  let tk = 0;
  function tick(fuel, w, env) {
    if ((tk++) % 6) return;
    setBar(bars.hp, P.hp); setBar(bars.food, P.hunger); setBar(bars.stam, P.stamina); setBar(bars.warm, P.warmth);
    if (env) {
      const te = stats.querySelector('.temp'), f = o.settings && o.settings.units === 'imperial';
      te.textContent = `${f ? Math.round(env.feels * 9 / 5 + 32) + '°F' : Math.round(env.feels) + '°C'} ${env.heat ? '· ' + env.heat : ''}`;
      te.classList.toggle('cold', env.feels < 5); te.classList.toggle('warmth', !!env.heat);
      stats.querySelector('.wx').textContent = `${env.biome} · ${env.weather}`;
    }
    stats.querySelector('.cash').textContent = '$' + P.cash;
    const wt = stats.querySelector('.wt'); wt.textContent = kg(w) + ' kg'; wt.classList.toggle('over', w > CARRY);
    document.getElementById('fuelBar').style.width = fuel + '%'; document.getElementById('fuelTxt').textContent = fuel > 0 ? Math.round(fuel) + '%' : 'Cold';
    fuelRow.classList.toggle('low', fuel < 15);
  }
  function renderOnline(n) { stats.querySelector('.online').textContent = n > 1 ? `${n} riders` : 'Riding alone'; }
  let lastPrompt = null;
  function prompt(label) { if (o.settings && o.settings.hints === false) label = null; if (label === lastPrompt) return; lastPrompt = label; interact.classList.toggle('on', !!label); if (label) interact.querySelector('span').textContent = label; }
  function notify(msg, rarity) {
    const n = h('div', 'note', esc(msg)); if (rarity && RARITY[rarity]) n.style.borderLeftColor = RARITY[rarity].color;
    feed.prepend(n); while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => n.classList.add('out'), 3600); setTimeout(() => n.remove(), 4400);
  }
  const dmgNum = h('div'); dmgNum.id = 'dmgnum'; hud.appendChild(dmgNum);
  function hurt(k, n) {
    if (o.settings && o.settings.dmgInd === false) return;
    if (n >= 1) { const d = h('span', null, '−' + Math.round(n)); d.style.left = (46 + Math.random() * 8) + '%'; dmgNum.appendChild(d); setTimeout(() => d.remove(), 1200); }
    hurtEl.style.transition = 'none'; hurtEl.style.opacity = 0.35 + k * 0.5; requestAnimationFrame(() => { hurtEl.style.transition = 'opacity 1.2s'; hurtEl.style.opacity = 0; }); }
  const CAUSE = { shot: 'Shot dead by an outlaw.', shocked: 'Struck down by Dr. Volt\'s lightning.', crushed: 'Crushed by something far bigger than you.', coins: 'Beaten to death with a purse of gold. Crowe would have laughed.', burned: 'You burned.', gassed: 'The refinery gas filled your lungs.', ichor: 'The Ichor took you.', bitten: 'The dead dragged you down.', bloater: 'A bloater burst all over you.', blown: 'You were too close to the dynamite.', fell: 'You fell and broke more than your pride.', starved: 'You starved out in the desert.', froze: 'The cold got into your bones and you never woke up.', drowned: 'The black water closed over you.' };
  function showDeath(cause, msg) {
    death.classList.toggle('on', !!cause);
    if (cause) { death.querySelector('#deathCause').textContent = CAUSE[cause] || 'Your luck ran out.'; death.querySelector('#deathMsg').textContent = msg; if (document.pointerLockElement) document.exitPointerLock(); }
  }
  renderHot();

  return { renderInv, renderHot, renderCont, renderAll, renderOnline, notify, show, isOpen: () => isOpen, prompt, tick, hurt, death: showDeath, rotateDrag, bindHovered };
}
