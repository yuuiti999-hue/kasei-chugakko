/* ようこそ、火星中学校へ — school-trip day sequencer.
   The 3D engine (game.js) calls window.MARS_SCHOOL(E) once with its API; everything here drives the day:
   character creation → 1〜6時間目 (mini-games) → 帰りの会.  Rhythm games are playable without sound. */
window.MARS_SCHOOL = function(E){
'use strict';
var T = E.T, SCH = E.SCH, P = E.P, cam = E.cam, G = E.G;
var $ = function(id){ return document.getElementById(id); };
var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
var rnd = function(a, b){ return Math.round((a + Math.random()*(b-a))/5)*5; };
var clamp = function(v, a, b){ return v < a ? a : v > b ? b : v; };

/* ---------- state ---------- */
var S = { name:'あなた', sex:'f', hair:'bob', hairCol:'#3b2a20', line:'#2fb5a8', emblem:0, items:[], pts:{me:0, ha:0, mi:0}, log:[], cloth:0, food:0, room:0, msg:0, period:'', sub:'' };
var HAIRCOLS = ['#3b2a20', '#1f1f24', '#8a5a2b'];
var LINES = ['#2fb5a8', '#f2c230', '#9ccc3a', '#2d4a9c', '#a23a8a', '#9a6a3a', '#3a3a44', '#8fa6a0'];   // the player's suit colours: none is used by a teacher, rival or crew member
var CLOTHES = [
  { name:'学校ジャージ', col:0x2fb5a8, need:0, note:'動きやすい、いつものジャージ。' },
  { name:'船内Tシャツ', col:0xf08a3c, need:0, note:'基地の中は21℃くらい。Tシャツですごせます。' },
  { name:'たんけんベスト', col:0x4caf6a, need:350, note:'ポケットがたくさん。道具を持ち歩けます。' },
  { name:'ゴールドスーツ', col:0xe2b93b, need:450, gold:true, note:'成績優秀者の特別仕様。外では宇宙服が金色に！ 金色は熱や光をはね返す色で、人工衛星にも使われます。' }
];
var FOODS = [
  { name:'宇宙カレー', need:0, note:'レトルトのカレー。宇宙では味を感じにくいので、少しこい味です。' },
  { name:'宇宙ラーメン', need:0, note:'スープが飛びちらないよう、とろみがついています。' },
  { name:'フリーズドライのいちご', need:350, note:'水分をぬいて軽くした食べ物。お湯や水でもどします。' },
  { name:'とれたて野菜のサラダ', need:520, note:'基地の畑でとれた野菜。新鮮な食べ物は、とても貴重です。' }
];
var ROOMS = [
  { name:'ねぶくろ', need:0, note:'ねるときは寝袋。個室はとても小さいです。' },
  { name:'家族の写真', need:0, note:'地球はとても遠い。写真は心のささえになります。' },
  { name:'小さな植物', need:350, note:'緑を見ると気持ちが落ち着きます。' },
  { name:'地球が見える窓', need:520, note:'火星から見た地球は、明るい星のように見えます。' }
];
var MSGS = ['火星の空は、うすいオレンジ色でした！', '体が軽くて、すごく高くジャンプできました！', '火星はさむいけど、みんな元気です！'];

/* ---------- people ---------- */
var WHO = {
  T: { name:'ホシノ先生', skin:'#f1c7a3', hair:'#2b2622', style:'short', shirt:'#f08a3c', glasses:true },
  H: { name:'ハヤト', skin:'#eebf98', hair:'#2a2420', style:'spiky', shirt:'#3f7fd9' },
  M: { name:'ミライ', skin:'#f6d2b6', hair:'#4a2f25', style:'pony', shirt:'#e86a9a', glasses:true, lash:true },
  G: { name:'隊員', skin:'#e9bd99', hair:'#3a2d26', style:'short', shirt:'#4caf6a', cap:true }
};
var GUIDES = {
  pe:   { name:'リク隊員（体育）', shirt:'#d9534f', pack:0xd9534f },
  tech: { name:'ソラ隊員（技術）', shirt:'#3f9fd9', pack:0x3f9fd9 },
  farm: { name:'ミドリ隊員（農場）', shirt:'#4caf6a', pack:0x4caf6a },
  life: { name:'ユイ隊員（生活）', shirt:'#b07fd9', pack:0xb07fd9 }
};
function me(){ return { name:S.name, skin:'#f6d2b6', hair:S.hairCol, style:S.hair, shirt:'#' + ('00000' + CLOTHES[S.cloth].col.toString(16)).slice(-6), line:S.line, lash:S.sex === 'f' }; }
/* portraits (dialogue, character creation, ranking) are rendered from the same 3D model, so they always match */
var faceCache = {};
function face(o){
  var k = [o.style, o.hair, o.skin, o.shirt, o.line, o.glasses ? 1 : 0, o.lash ? 1 : 0, o.cap ? 1 : 0, o.suit ? 1 : 0, o.emblem, o.gold ? 1 : 0].join('|');
  if (!faceCache[k]) faceCache[k] = E.portrait(o, o.wide ? 320 : 256);
  return '<img src="' + faceCache[k] + '" alt="">';
}
function who(k){ return k === 'P' ? me() : WHO[k]; }

/* ---------- DOM ---------- */
var root = document.createElement('div'); root.id = 'sch'; root.hidden = true;
root.innerHTML =
  '<div id="sc-chip"><span id="sc-per"></span><span id="sc-sub"></span><span id="sc-pts"></span><span id="sc-place" hidden></span></div>' +
  '<div id="sc-top"><button id="sc-bgm" type="button">♪</button><button id="sc-rst" type="button">最初から</button></div>' +
  '<div id="sc-big" hidden><div id="sc-bign"></div><div id="sc-bigt"></div><div id="sc-bigs"></div></div>' +
  '<div id="sc-note" hidden></div><div id="sc-tap" hidden></div><div id="sc-hint" hidden></div><div id="sc-tray" hidden></div><div id="sc-panel" hidden></div>' +
  '<div id="sc-game" hidden><div id="sc-gtitle"></div><canvas id="sc-cv"></canvas><div id="sc-gmsg"></div></div><div id="sc-riv" hidden></div><div id="sc-fin" hidden></div>' +
  '<div id="sc-dlg" hidden><div id="sc-bub"><div id="sc-ava"></div><div id="sc-dtx"><div id="sc-dname"></div><div id="sc-dtext"></div></div><div id="sc-dnext">▼</div></div></div>';
document.body.appendChild(root);
$('sc-bgm').addEventListener('click', function(){ var b = $('bgmbtn'); if (b) b.click(); this.classList.toggle('off', !E.BGM.on); });
$('sc-rst').addEventListener('click', function(){
  var b = this; if (b.dataset.sure){ location.reload(); return; }
  b.dataset.sure = '1'; b.textContent = 'もう一度おす'; setTimeout(function(){ delete b.dataset.sure; b.textContent = '最初から'; }, 3000);
});
function hud(){
  $('sc-per').textContent = S.period; $('sc-sub').textContent = S.sub; $('sc-sub').hidden = !S.sub;
  $('sc-pts').textContent = S.pts.me + ' 点';
  var el = $('sc-place'), any = S.pts.me + S.pts.ha + S.pts.mi > 0; el.hidden = !any;      // 総合順位: shown once anyone has points
  if (any){
    var pl = 1 + (S.pts.ha > S.pts.me) + (S.pts.mi > S.pts.me);
    el.textContent = '総合 ' + pl + '位'; el.dataset.p = pl;
    clearTimeout(hud.t); hud.t = setTimeout(function(){ hud.say(pl); }, 90);     // announce once things settle (my points and the rivals' often land together)
  }
}
hud.say = function(pl){
  var el = $('sc-place');
  {
    if (hud.was && pl !== hud.was){
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      if ($('sc-riv').hidden && $('sc-fin').hidden){ note(pl < hud.was ? '総合 ' + pl + '位にアップ！' : '総合 ' + pl + '位にダウン…'); if (E.SFX.ready){ if (pl < hud.was){ E.sfxTone(880, .1, 'triangle', .14); E.sfxTone(1319, .2, 'triangle', .14, .09); } else { E.sfxTone(494, .12, 'triangle', .1); E.sfxTone(370, .2, 'triangle', .1, .1); } } }
    }
    hud.was = pl;
  }
};
function fadeTo(v){ var f = $('fade'); f.style.transition = 'opacity .45s ease'; f.style.opacity = v; return sleep(480); }
async function cut(fn){ await fadeTo(1); fn(); await sleep(350); await fadeTo(0); }

/* dialogue: tap anywhere (or Enter / Space) to advance */
var dlgNext = null;
function say(k, text){
  return new Promise(function(res){
    var o = who(k); text = text.replace(/\{n\}/g, S.name);
    speaker = NPC[k] && NPC[k].root.visible ? NPC[k] : null;
    if (/えっ|！？/.test(text)) emote(k, 'wow'); else if (/やった|すごい|いいリズム|つながった|とれました|その通り|いただきます/.test(text)) emote(k, 'joy');
    $('sc-ava').innerHTML = face(o); $('sc-dname').textContent = o.name; $('sc-dlg').hidden = false;
    var el = $('sc-dtext'), i = 0, done = false; el.textContent = '';
    var timer = setInterval(function(){ i += 2; el.textContent = text.slice(0, i); if (i >= text.length){ clearInterval(timer); done = true; speaker = null; $('sc-dnext').classList.add('on'); } }, 30);
    $('sc-dnext').classList.remove('on');
    dlgNext = function(){
      if (!done){ clearInterval(timer); el.textContent = text; done = true; speaker = null; $('sc-dnext').classList.add('on'); return; }
      dlgNext = null; $('sc-dlg').hidden = true; E.sfx('click'); res();
    };
  });
}
$('sc-dlg').addEventListener('pointerdown', function(e){ e.preventDefault(); if (dlgNext) dlgNext(); });
window.addEventListener('keydown', function(e){
  if (!SCH.on) return;
  if ((e.code === 'Enter' || e.code === 'Space') && dlgNext && !e.repeat){ dlgNext(); e.preventDefault(); }
  else if (e.code === 'Enter' && !e.repeat && $('sc-ok') && document.activeElement.tagName !== 'INPUT'){ $('sc-ok').click(); e.preventDefault(); }
});
async function talk(lines){ for (var i=0;i<lines.length;i++) await say(lines[i][0], lines[i][1]); }

function panel(html, cls){ var p = $('sc-panel'); p.className = cls || ''; p.innerHTML = html; p.hidden = false; return p; }
function closePanel(){ $('sc-panel').hidden = true; $('sc-panel').innerHTML = ''; }
function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function nextBtn(label){ return '<button type="button" class="sc-go" id="sc-ok">' + (label || '次へ') + '</button>'; }
function waitOk(){ return new Promise(function(res){ $('sc-ok').addEventListener('click', function(){ E.sfx('click'); closePanel(); res(); }); }); }
async function info(title, body, tip){
  panel('<h2>' + title + '</h2>' + (body ? '<div class="sc-body">' + body + '</div>' : '') + (tip ? '<div class="sc-tip"><span>豆知識</span>' + tip + '</div>' : '') + nextBtn(), 'low');
  await waitOk();
}
/* a reason or tip is either one line, or [one line, the rest]: the rest stays folded until 「くわしく」 is pressed */
function fold(t){ return typeof t === 'string' ? t : t[0] + '<span class="sc-more" hidden>' + t[1] + '</span>'; }
/* three-choice quiz: always explains why, then moves on (no time limit) */
function quiz(q){
  return new Promise(function(res){
    var was = mood('quiz');
    var p = panel('<h2>' + q.title + '</h2>' + (q.q ? '<div class="sc-body">' + q.q + '</div>' : '') + '<div class="sc-opts">' +
      q.opts.map(function(o, i){ return '<button type="button" data-i="' + i + '"><b>' + 'ABC'[i] + '</b>' + esc(o) + '</button>'; }).join('') + '</div>', 'low');
    Array.prototype.forEach.call(p.querySelectorAll('.sc-opts button'), function(b){
      b.addEventListener('click', async function(){
        var i = +b.dataset.i, ok = i === q.ans; E.sfx(ok ? 'ok' : 'bad'); emote('P', ok ? 'joy' : 'sad'); emote('T', 'nod');
        var html = ok ? '<p class="ok">正解！ +100点</p><p>' + fold(q.why[i]) + '</p>'
          : '<p class="bad">ざんねん。「' + esc(q.opts[i]) + '」はちがいます</p><p>' + fold(q.why[i]) + '</p><p class="ok">正解は「' + esc(q.opts[q.ans]) + '」</p><p>' + fold(q.why[q.ans]) + '</p>';
        var tip = q.tip ? '<div class="sc-tip"><span>豆知識</span>' + fold(q.tip) + '</div>' : '';
        var pp = panel('<h2>' + q.title + '</h2><div class="sc-body">' + html + '</div>' + tip +
          (/sc-more/.test(html + tip) ? '<button type="button" class="sc-mbtn" id="sc-mbtn">くわしく</button>' : '') + nextBtn(), 'low');
        var mb = $('sc-mbtn');
        if (mb) mb.addEventListener('click', function(){ E.sfx('click'); Array.prototype.forEach.call(pp.querySelectorAll('.sc-more'), function(s){ s.hidden = false; }); mb.hidden = true; });
        await waitOk(); mood(was === 'quiz' ? 'talk' : was); res(ok);
      });
    });
  });
}
function add(n){ S.pts.me += n; hud(); if (n > 0) E.sfx('coin'); if (n >= 50) emote('P', 'joy'); }

/* school chime + big period card */
function chime(){ [659, 523, 587, 392, 392, 587, 659, 523].forEach(function(f, i){ E.sfxTone(f, .55, 'sine', .16, i*.42 + (i > 3 ? .3 : 0)); }); }
async function bell(per, subject, place){
  S.period = per; S.sub = subject; hud();
  $('sc-bign').textContent = per; $('sc-bigt').textContent = subject; $('sc-bigs').textContent = place || '';
  var b = $('sc-big'); b.hidden = true; void b.offsetWidth; b.hidden = false; chime();
  await sleep(2300); b.hidden = true;
}
/* ranking after every period.  The rivals' points are decided when the lesson starts (PLAN), one share per mini-game, so the
   live gauges in the rhythm games and the ranking always show the same numbers.  Rhythm shares are targets: rivalsFor()
   turns them into a note-by-note run just before the game and stores the exact result back.
   Strength (out of 100): the stronger rival sits a little above a normal run (about 75), the other a little below. */
var rint = function(a, b){ return a + Math.floor(Math.random()*(b - a + 1)); };   // whole points (rnd() rounds to 5s, which would overshoot these ranges)
/* Rival strength: one of the two finishes around 1,000 points and the other around 950 (out of 1,100); who is the stronger
   one is random per play.  Each drops a few points per part (Hayato mostly in the classroom, Mirai mostly in sport), the
   rover race is the real finishing order, and the last rhythm game (harvest) makes up whatever is still missing. */
var GOAL = null, LOSS = null, LOSSW = { ha:{ hurdle:.5, train:.7, p3:1.6, p4:1.6, dance:.6 }, mi:{ hurdle:1.6, train:1.4, p3:.5, p4:.5, dance:1.2 } };
function goals(){
  if (!GOAL){
    var st = Math.random() < .5 ? 'ha' : 'mi', wk = st === 'ha' ? 'mi' : 'ha'; GOAL = { strong:st }; GOAL[st] = rint(985, 1015); GOAL[wk] = rint(935, 965);
    LOSS = {};
    ['ha', 'mi'].forEach(function(k){
      var L = (1100 - GOAL[k])*(k === st ? .43 : .55), w = LOSSW[k], tot = 0, o = {}, q;   // what is dropped before the race; the rest is left for race + harvest
      for (q in w){ o[q] = w[q]*(.8 + Math.random()*.4); tot += o[q]; }
      for (q in o) o[q] = Math.round(o[q]/tot*L);
      LOSS[k] = o;
    });
  }
  return GOAL;
}
function lost(k, q){ goals(); return LOSS[k][q]; }
var PLANS = {
  p1: function(){ return { ha:{ quiz:200 }, mi:{ quiz:200 } }; },
  p2: function(){ return { ha:{ hurdle:100 - lost('ha', 'hurdle'), train:100 - lost('ha', 'train') }, mi:{ hurdle:100 - lost('mi', 'hurdle'), train:100 - lost('mi', 'train') } }; },
  p3: function(){ return { ha:{ all:150 - lost('ha', 'p3') }, mi:{ all:150 - lost('mi', 'p3') } }; },
  p4: function(){ return { ha:{ all:150 - lost('ha', 'p4') }, mi:{ all:150 - lost('mi', 'p4') } }; },
  p5: function(){ return { ha:{ dance:100 - lost('ha', 'dance'), race:70 }, mi:{ dance:100 - lost('mi', 'dance'), race:40 } }; },   // race: replaced by the real finishing order
  p6: function(){ var G = goals(), h = function(k){ return clamp(G[k] - S.pts[k] - 100, 45, 100); };                      // harvest: whatever is still missing for the goal (the quiz is right: +100)
    return { ha:{ harvest:h('ha'), quiz:100 }, mi:{ harvest:h('mi'), quiz:100 } }; }
};
var PLAN = {};
var PAID = {};
function lesson(id){ PLAN[id] = PLANS[id](); PAID[id] = {}; }
/* give the rivals their points for one part of the lesson as soon as that mini-game ends (rank() pays whatever is left),
   so the 総合順位 in the corner moves during the lesson, not only on the result screen */
function credit(id, part){
  var p = plan(id), d = PAID[id] || (PAID[id] = {});
  ['ha', 'mi'].forEach(function(k){ for (var q in p[k]) if ((!part || q === part) && !d[k + q]){ d[k + q] = 1; S.pts[k] += p[k][q]; } });
  hud();
}
function plan(id){ if (!PLAN[id]) lesson(id); return PLAN[id]; }
function gains(id){ var p = plan(id), sum = function(o){ var t = 0; for (var k in o) t += o[k]; return t; }; return { ha:sum(p.ha), mi:sum(p.mi) }; }
/* a rival's run in a rhythm game: one result per note (1 = ピッタリ, .6 = OK, 0 = ミス) that adds up to about `target` points */
function rivalRun(n, target){
  var T = target/100*n, m = Math.random()*3|0, p;
  for (;;){ p = Math.round((T - .6*(n - m))/.4); if (p >= 0 || m >= n) break; m++; }
  p = clamp(p, 0, n - m);
  var v = []; for (var i=0;i<n;i++) v.push(i < p ? 1 : i < n - m ? .6 : 0);
  for (i=n-1;i>0;i--){ var j = Math.random()*(i+1)|0, t = v[i]; v[i] = v[j]; v[j] = t; }
  return v;
}
function runPts(v){ var s = 0; v.forEach(function(x){ s += x; }); return Math.round(s/v.length*100); }
function rivalsFor(id, part, n){
  var p = plan(id), out = {};
  [['H', 'ha'], ['M', 'mi']].forEach(function(q){ var v = rivalRun(n, p[q[1]][part]); p[q[1]][part] = runPts(v); out[q[0]] = v; });
  return out;
}
async function rank(id, label, mine, max){
  var g = gains(id); credit(id);
  S.log.push({ label:label, me:mine, max:max, ha:g.ha, mi:g.mi });
  var rows = [ { k:'P', n:S.name, g:mine, t:S.pts.me, me:true }, { k:'H', n:'ハヤト', g:g.ha, t:S.pts.ha }, { k:'M', n:'ミライ', g:g.mi, t:S.pts.mi } ];
  rows.sort(function(a, b){ return b.t - a.t; });
  var top = Math.max(rows[0].t, 1);
  E.sfx('fanfare'); emote(rows[0].k, 'joy'); if (!rows[2].me) emote(rows[2].k, 'sad'); else emote('P', 'nod');
  panel('<h2>' + label + ' のけっか</h2><div class="sc-rank">' + rows.map(function(r, i){
    return '<div class="sc-row' + (r.me ? ' me' : '') + '"><span class="sc-no">' + (i+1) + '位</span><span class="sc-rava">' + face(who(r.k)) + '</span><span class="sc-rn">' + esc(r.n) +
      '</span><span class="sc-bar"><i style="width:' + Math.round(r.t/top*100) + '%"></i></span><span class="sc-rg">+' + r.g + '</span><span class="sc-rt">' + r.t + '点</span></div>';
  }).join('') + '</div>' + nextBtn());
  await waitOk();
  return rows.findIndex(function(r){ return r.me; }) + 1;
}

/* ---------- 3D people (same Blender-made model as the player: E.makeChara) ---------- */
var NPC = {}, people = [];
function hx(c){ return parseInt(c.slice(1), 16); }
function makeNPC(key, o){
  var w = WHO[key], c = E.makeChara({ hair:w.style, hairCol:hx(w.hair), skin:hx(w.skin), glasses:w.glasses, line:o.line, cloth:o.line }); c.setLash(w.lash);
  var ch = { root:c.root, body:c.body, c:c, hop:0, ph:Math.random()*6, suit:function(on){ c.setSuit(on); } };
  c.root.scale.setScalar(o.scale || 1); c.root.visible = false; E.scene.add(c.root); NPC[key] = ch; people.push(ch); return ch;
}
function buildPeople(){
  makeNPC('T', { line:0xf08a3c, scale:1.2 });
  makeNPC('H', { line:0x3f7fd9 });
  makeNPC('M', { line:0xe86a9a });
  makeNPC('G', { line:0x4caf6a, scale:1.16 }).c.setCap(true);
  E.player.setHair(S.hair, hx(S.hairCol)); E.player.setCloth(CLOTHES[S.cloth].col); E.player.setLash(S.sex === 'f'); E.player.setLine(hx(S.line)); E.player.setEmblem(S.emblem);
}
function mySuit(on){ E.player.setCloth(CLOTHES[S.cloth].col); E.player.gold = !!CLOTHES[S.cloth].gold; E.player.setSuit(on); }
function suits(on){ mySuit(on); people.forEach(function(c){ c.suit(on); }); }
function setGuide(k){ var g = GUIDES[k]; WHO.G.name = g.name; WHO.G.shirt = g.shirt; NPC.G.c.setLine(g.pack); NPC.G.c.setCloth(g.pack); }
function put(ch, pos, faceA){ ch.root.position.set(pos.x, E.groundAt(pos.x, pos.z), pos.z); ch.root.rotation.y = ch.face = faceA; ch.root.visible = true; ch.sit = ch.eat = false; ch.squat = ch.pick = ch.spin = 0; ch.c.legL.rotation.x = ch.c.legR.rotation.x = 0; }
/* rhythm games: Hayato on the player's left and Mirai on the right, facing the same way, doing the same moves */
function lineUp(gap){
  var f = P.face, rx = Math.cos(f), rz = -Math.sin(f);
  [['H', -gap], ['M', gap]].forEach(function(q){ put(NPC[q[0]], { x:P.x + rx*q[1], z:P.z + rz*q[1] }, f); });
}
/* low gravity made visible: the same push-off as on Earth, but 3.73 m/s² — about 2.6x the height and 2.6x the hang time */
function lowG(k, n){
  var p = NPC[k]; if (!p || !p.root.visible) return;
  var g = 3.73, v0 = 3.1, T0 = 2*v0/g, t = -.25, left = n;
  E.sfx('jump');
  var tick = function(dt){
    t += dt; if (t < 0){ p.squat = .5; return; }                // a short crouch before each take-off
    if (t >= T0){
      p.fly = 0; left--; E.sfx('land'); E.puff(p.root.position.x, p.root.position.y + .1, p.root.position.z, .5, .9);
      if (left <= 0 || !p.root.visible){ tickers.splice(tickers.indexOf(tick), 1); return; }
      t = -.3; setTimeout(function(){ E.sfx('jump'); }, 280); return;
    }
    p.fly = v0*t - .5*g*t*t; p.hop = .5;                        // arms up while in the air
  };
  tickers.push(tick);
}
function cheer(){ ['T', 'G'].forEach(function(k){ var c = NPC[k]; if (c && c.root.visible) c.hop = 1; }); }   // the teacher and the crew bounce along with the player's hits
function hideNPCs(){ people.forEach(function(c){ c.root.visible = false; }); }
function setP(pos, faceA){
  P.x = pos.x; P.z = pos.z; P.y = E.groundAt(P.x, P.z); P.vx = P.vz = P.vy = 0; P.ground = true; P.face = faceA;
  cam.tx = P.x; cam.ty = P.y + 1.05; cam.tz = P.z; E.astro.visible = true; pose.sit = false;
}
var W = function(lx, lz){ return E.b2w(lx, lz); };
var I = function(lx, lz){ return { x:E.INT.x + lx, z:E.INT.z + lz }; };

/* camera shot (overrides the engine camera while set) */
var shot = null, cur = null;
SCH.camFn = function(camera, dt){
  if (!shot) { cur = null; return; }
  var tx = shot.follow ? P.x + (shot.ox || 0) : shot.x, tz = shot.follow ? P.z + (shot.oz || 0) : shot.z;
  var ty = shot.follow ? E.groundAt(P.x, P.z) + (shot.h || 1) : shot.y;
  var want = { x:tx, y:ty, z:tz, yaw:shot.yaw, pitch:shot.pitch, dist:shot.dist };
  if (!cur || shot.snap){ cur = want; shot.snap = false; }
  else { var k = 1 - Math.exp(-(shot.follow ? 12 : 3.5)*dt); for (var q in want) cur[q] += (want[q] - cur[q])*k; }
  var cp = Math.cos(cur.pitch);
  camera.position.set(cur.x + Math.sin(cur.yaw)*cp*cur.dist, cur.y + Math.sin(cur.pitch)*cur.dist, cur.z + Math.cos(cur.yaw)*cp*cur.dist);
  camera.lookAt(cur.x, cur.y, cur.z);
};
function setShot(o){ o.snap = o.snap !== false && !o.ease; shot = o; if (o.yaw != null) cam.yaw = o.yaw; }

/* per-frame hooks: idle sway, the speaker's mouth, and short emotes (joy / sad / wave / nod / wow) for everyone */
var tickers = [], pose = { hop:0, spin:0, squat:0 }, speaker = null, myAct = { n:'', t:0, d:1 };
var EMO = { joy:1.0, sad:1.8, wave:1.5, nod:.7, wow:.9 };
function emote(k, name){
  if (k === 'P'){ myAct = { n:name, t:0, d:EMO[name] }; return; }
  var c = NPC[k]; if (c && c.root.visible) c.act = { n:name, t:0, d:EMO[name] };
}
function applyAct(c, act, dt, now){                 // c: a character from E.makeChara; returns extra height
  if (!act || !act.n) return 0;
  act.t += dt; var u = act.t/act.d, y = 0;
  if (u >= 1){ act.n = ''; c.setFace(''); c.head.rotation.set(0, 0, 0); return 0; }
  var e = Math.min(1, u*6, (1 - u)*6);
  if (act.n === 'joy'){ y = Math.abs(Math.sin(u*Math.PI*2))*.26; c.armL.rotation.z = -.1 - 2.3*e; c.armR.rotation.z = .1 + 2.3*e; c.setFace('shut'); }
  else if (act.n === 'sad'){ c.body.rotation.x = .16*e; c.head.rotation.x = .32*e; c.armL.rotation.x = c.armR.rotation.x = -.25*e; }
  else if (act.n === 'wave'){ c.armR.rotation.z = .1 + 2.5*e + Math.sin(now*13)*.28*e; c.head.rotation.z = -.1*e; }
  else if (act.n === 'nod'){ c.head.rotation.x = Math.sin(u*Math.PI*3)*.26; }
  else if (act.n === 'wow'){ y = Math.sin(u*Math.PI)*.1; c.armL.rotation.z = -.1 - .9*e; c.armR.rotation.z = .1 + .9*e; c.setFace('o'); }
  return y;
}
SCH.tick = function(dt){
  var now = performance.now()/1000;
  for (var i=0;i<people.length;i++){
    var p = people[i]; if (!p.root.visible) continue;
    var c = p.c, sw = Math.sin(now*1.7 + p.ph), bounce = 0;
    p.hop = Math.max(0, p.hop - dt*2.6);
    var hu = Math.sin(Math.min(1, p.hop)*Math.PI);
    c.body.rotation.x = 0; c.armL.rotation.set(0, 0, -.06 - sw*.03 - hu*2); c.armR.rotation.set(0, 0, .06 + sw*.03 + hu*2);
    if (speaker === p){
      bounce = Math.abs(Math.sin(now*9))*.025; c.setMouth(((now*7)|0)%2 === 1);
      if (!p.act || !p.act.n){ c.head.rotation.z = Math.sin(now*4)*.05; c.armR.rotation.z = .3 + Math.sin(now*5)*.15; }
    } else if (p.spoke){ c.setMouth(false); c.head.rotation.z = 0; }
    p.spoke = speaker === p;
    if (p.sit){ c.legL.rotation.x = c.legR.rotation.x = -1.45; }
    if (p.eat && speaker !== p && (!p.act || !p.act.n)){ var ea = Math.sin(now*3.2 + p.ph); c.armR.rotation.x = -(1.0 + ea*.45); c.armR.rotation.z = -.25; c.setMouth(ea > .55); }
    var mv = 0;                                            // rhythm-game moves: squat, harvest bend, and a spin riding on the hop (dance)
    if (p.squat > 0){
      p.squat = Math.max(0, p.squat - dt*3); var sq = Math.sin(Math.min(1, p.squat)*Math.PI);
      c.legL.rotation.x = c.legR.rotation.x = sq*.9; c.armL.rotation.x = c.armR.rotation.x = -sq*1.4; mv -= sq*.16;
      if (!p.squat) c.legL.rotation.x = c.legR.rotation.x = 0;
    }
    if (p.pick > 0){ p.pick = Math.max(0, p.pick - dt*2.6); var pk = Math.sin(Math.min(1, p.pick)*Math.PI); c.body.rotation.x = .55*pk; c.armL.rotation.x = c.armR.rotation.x = -1.2*pk; mv -= .05*pk; }
    if (p.spin){ p.root.rotation.y = p.face + (1 - p.hop)*6.2832; if (!p.hop){ p.root.rotation.y = p.face; p.spin = 0; } }
    var y = applyAct(c, p.act, dt, now);
    p.body.position.y = Math.sin(now*2 + p.ph)*.012 + hu*.22 + y + bounce + mv + (p.fly || 0) - (p.sit ? .26 : 0);
  }
  for (i=0;i<tickers.length;i++) tickers[i](dt);
};
SCH.pose = function(dt){
  if (pose.hop > 0){
    pose.hop = Math.max(0, pose.hop - dt*2.6);
    var u = Math.sin(Math.min(1, pose.hop)*Math.PI);
    E.body.position.y += u*.3; E.armL.rotation.z = -.12 - u*2.2; E.armR.rotation.z = .12 + u*2.2;
    if (pose.spin) E.astro.rotation.y = P.face + (1 - pose.hop)*6.2832*pose.spin;
  }
  if (pose.squat > 0){
    pose.squat = Math.max(0, pose.squat - dt*3);
    var v = Math.sin(Math.min(1, pose.squat)*Math.PI);
    E.body.position.y -= v*.16; E.legL.rotation.x = v*.9; E.legR.rotation.x = v*.9; E.armL.rotation.x = -v*1.4; E.armR.rotation.x = -v*1.4;
  }
  if (pose.sit){ E.legL.rotation.x = E.legR.rotation.x = -1.45; E.body.position.y -= .26; if (pose.eat && !myAct.n){ var ea = Math.sin(performance.now()/1000*3.2); E.armR.rotation.x = -(1.0 + ea*.45); E.armR.rotation.z = -.25; E.player.setMouth(ea > .55); } }
  E.body.position.y += applyAct(E.player, myAct, dt, performance.now()/1000);
};
function allHop(){ people.forEach(function(c){ if (c.root.visible) c.hop = 1; }); }

/* ---------- scenes ---------- */
var ROT = E.BASE.rot;
function outdoor(time){ hideSets(); if (E.R.driving) E.exitRover(); if (E.IND.on) E.setIndoor(false); G.freeze = true; E.setTime(time); E.setWeatherMode('clear'); suits(true); hideNPCs(); E.setGuide(null); }
function indoor(){ hideSets(); if (!E.IND.on) E.setIndoor(true); E.IND.rc = null; E.IND.zoom = 1; cam.pitch = .95; suits(false); hideNPCs(); E.setGuide(null); }
function dress(name){                                 // the corner of the dome changes with the lesson: treadmill / sofa / speakers
  var g = E.interior.userData.spot; if (!g || g.userData.kind === name) return;
  while (g.children.length) g.remove(g.children[0]); E.propIn(g, name); g.userData.kind = name;
}
var SCENES = {
  arrive: function(){
    outdoor(.36);
    var L = E.LANDER, a = Math.atan2(6, 4.5);
    setP({ x:L.x+6, z:L.z+4.5 }, a);
    put(NPC.T, { x:L.x+8.2, z:L.z+3.4 }, a); put(NPC.H, { x:L.x+4.9, z:L.z+5.9 }, a); put(NPC.M, { x:L.x+4.0, z:L.z+7.9 }, a);
    setShot({ x:L.x+6.2, y:E.groundAt(L.x+6, L.z+4.5)+1.2, z:L.z+5, yaw:a, pitch:.12, dist:9.5 });
  },
  ground: function(){
    outdoor(.41); setGuide('pe');
    setP(W(-22, 26), ROT);
    put(NPC.T, W(-18.8, 24.6), ROT); put(NPC.G, W(-25.4, 24.6), ROT); put(NPC.H, W(-23.8, 23.4), ROT); put(NPC.M, W(-20.4, 23.2), ROT);
    var c = W(-22, 25); setShot({ x:c.x, y:E.groundAt(c.x, c.z)+1.1, z:c.z, yaw:ROT, pitch:.16, dist:9 });
  },
  gym: function(){
    indoor(); setGuide('pe'); dress('treadmill');
    setP(I(-.6, .6), 0);
    put(NPC.T, I(.7, -1.2), 0); lineUp(1.3); put(NPC.G, I(-3.1, -.3), .3);
    setShot({ x:E.INT.x - .9, y:E.INT.y + .9, z:E.INT.z, yaw:0, pitch:.5, dist:8 });
  },
  solar: function(){
    outdoor(.47); setGuide('tech');
    setP(W(-18.6, 10), ROT + Math.PI);
    put(NPC.T, W(-15.4, 10.6), ROT + Math.PI); put(NPC.G, W(-22, 9.6), ROT + 2.2); put(NPC.H, W(-13.4, 12.2), ROT + Math.PI); put(NPC.M, W(-24.2, 12), ROT + Math.PI);
    var c = W(-18.6, 6.5); setShot({ x:c.x, y:E.groundAt(c.x, c.z)+1.4, z:c.z, yaw:ROT, pitch:.3, dist:15 });
  },
  farm: function(){
    indoor(); setGuide('farm');
    setP(I(0, -15.3), 0);
    put(NPC.T, I(3.1, -15.3), 0); put(NPC.G, I(-3.1, -15.3), 0); lineUp(1.3);
    setShot({ x:E.INT.x, y:E.INT.y - 5 + .8, z:E.INT.z - 16.4, yaw:0, pitch:.62, dist:11.5 });
  },
  life: function(){
    indoor(); setGuide('life'); dress('sofa');
    var y = -.85; setP(I(-1.0, 1.2), y);
    put(NPC.T, I(-1.6, -1.1), y); put(NPC.H, I(1.0, 1.6), y); put(NPC.M, I(.6, -.2), y); put(NPC.G, I(-.4, -1.6), y);
    setShot({ x:E.INT.x + .2, y:E.INT.y + .9, z:E.INT.z + .2, yaw:y, pitch:.48, dist:8 });
  },
  music: function(){
    indoor(); dress('speakers');
    var y = .6; setP(I(-.5, .8), y);
    put(NPC.T, I(-2.5, -.3), y); lineUp(1.3);
    setShot({ x:E.INT.x + .3, y:E.INT.y + .9, z:E.INT.z + 1.9, yaw:y, pitch:.5, dist:8 });
  },
  sunset: function(){
    var tm = .735, an = 6.28318*(tm - .25), s = { x:Math.cos(an), z:Math.sin(an)*.47 };   // same formula as the engine's sun (sunDir is one frame late here)
    outdoor(tm);
    var yaw = Math.atan2(-s.x, -s.z) + .1, c = W(2, 30);
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    var at = function(r, f){ return { x:c.x + rx*r + fx*f, z:c.z + rz*r + fz*f }; };
    setP(at(0, 0), yaw + Math.PI);
    put(NPC.T, at(2.6, .6), yaw + Math.PI - .5); put(NPC.H, at(-1.8, .4), yaw + Math.PI); put(NPC.M, at(1.3, -.3), yaw + Math.PI);
    setShot({ x:c.x + fx*2, y:E.groundAt(c.x, c.z)+1.5, z:c.z + fz*2, yaw:yaw, pitch:.07, dist:8.5 });
    showEarth(c, yaw);
  }
};
function scene(n){ shot = null; SCENES[n](); setTimeout(function(){ emote(NPC.G.root.visible ? 'G' : 'T', 'wave'); }, 1100); }

/* ---------- sound: duck the BGM and play a synthesised tune (no audio files) ---------- */
function duck(on){
  var B = E.BGM; if (!B.ctx || !B.gain) return;
  B.gain.gain.setTargetAtTime(on ? 0 : (B.on ? B.vol : 0), B.ctx.currentTime, .3);
}
var TUNES = {
  pop:    { name:'ポップ',   root:60, scale:[0,2,4,7,9],  wave:'triangle', vol:.13, mel:[0,null,2,null,4,2,null,4, 3,null,2,null,0,null,2,null] },
  rock:   { name:'ロック',   root:57, scale:[0,3,5,7,10], wave:'sawtooth', vol:.06, mel:[0,0,null,3,null,2,0,null, 4,null,3,null,2,0,null,null] },
  wa:     { name:'和風',     root:62, scale:[0,1,5,7,8],  wave:'triangle', vol:.14, mel:[0,null,1,2,null,1,0,null, 3,null,4,3,null,2,1,null] },
  techno: { name:'テクノ',   root:57, scale:[0,2,3,7,10], wave:'square',   vol:.045, mel:[0,2,4,2,0,2,4,2, 1,3,4,3,1,3,4,3] }
};
function hz(m){ return 440*Math.pow(2, (m-69)/12); }
/* ---------- BGM moods: talk = the recorded theme; quiz / game = synthesised loops, so story and play sound different.
   Everything here goes through BGM.gain, so the ♪ button and the rhythm games' duck() silence it too. ---------- */
var LOOPS = {
  quiz: { bpm:104, lead:'triangle', lv:.24, bv:.30, hat:.06, kick:0,                 // light 'thinking time' pizzicato
    chords:[[60,64,67],[57,60,64],[53,57,60],[55,59,62]], bass:[36,33,29,31],
    arp:[0,null,1,null,2,null,1,null] },
  game: { bpm:144, lead:'square', lv:.085, bv:.26, hat:.10, kick:.45,                   // driving 8-bit run
    chords:[[57,60,64],[53,57,60],[60,64,67],[55,59,62]], bass:[33,29,36,31],
    arp:[0,1,2,1,0,1,2,3] }
};
var MOOD = { cur:'talk', out:null, syn:null, timer:0, next:0, step:0, srcs:[], loopT:0 };
/* recorded tracks for the moods (quiz / sport / game / room) arrive late, in js/bgm2.js, so the title screen is not kept waiting */
if (window.MARS_BGM && !window.MARS_BGM.quiz){ var b2 = document.createElement('script'); b2.src = 'js/bgm2.js'; b2.async = true; document.head.appendChild(b2); }
function moodNote(freq, dur, type, vol, at){
  var ctx = E.BGM.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + .012); g.gain.exponentialRampToValueAtTime(.001, at + dur);
  o.connect(g); g.connect(MOOD.syn); o.start(at); o.stop(at + dur + .05);
}
function moodHit(dur, freq, vol, at){
  if (!E.SFX.noise) return;
  var ctx = E.BGM.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = E.SFX.noise; f.type = 'highpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + dur);
  s.connect(f); f.connect(g); g.connect(MOOD.syn); s.start(at, Math.random()); s.stop(at + dur + .02);
}
function moodPump(){                                        // fallback only: a synthesised loop while the recorded track is not available
  var L = LOOPS[MOOD.cur === 'quiz' ? 'quiz' : 'game'], ctx = E.BGM.ctx; if (!L || !ctx) return;
  var sp = 60/L.bpm/2, now = ctx.currentTime;                 // one step = an eighth note
  if (MOOD.next < now) MOOD.next = now + .06;                 // first run, or the tab was in the background
  while (MOOD.next < now + .7){                              // generous look-ahead: a 3D frame hitch must not leave a hole in the music
    var st = MOOD.step++, at = MOOD.next, i = st%8, bar = (st/8|0)%4, ch = L.chords[bar], d = L.arp[i];
    if (d != null) moodNote(hz((d === 3 ? ch[0] + 12 : ch[d]) + 12), sp*.9, L.lead, L.lv, at);
    if (i%4 === 0) moodNote(hz(L.bass[bar]), sp*1.8, 'sine', L.bv, at);
    else if (L.kick && i%2 === 0) moodNote(hz(L.bass[bar] + 12), sp*.8, 'sine', L.bv*.6, at);
    if (L.kick && i%2 === 0){ var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, at); o.frequency.exponentialRampToValueAtTime(45, at + .12);
      g.gain.setValueAtTime(L.kick, at); g.gain.exponentialRampToValueAtTime(.001, at + .14); o.connect(g); g.connect(MOOD.syn); o.start(at); o.stop(at + .16); }
    moodHit(i%2 ? .05 : .025, 6500, i%2 ? L.hat : L.hat*.5, at);
    MOOD.next += sp;
  }
}
function moodStop(fade){                                    // stop whatever mood music is sounding (recorded or synthesised)
  var ctx = E.BGM.ctx, t = ctx.currentTime;
  MOOD.srcs.forEach(function(o){ try { o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + fade); o.s.stop(t + fade + .05); } catch(_){} });
  MOOD.srcs = []; clearTimeout(MOOD.loopT); clearInterval(MOOD.timer); MOOD.timer = 0;
}
function moodQueue(name, buf, at, fadeIn){                  // play the track and chain the next copy with a cross-fade, so any cut loops cleanly
  var XF = 2.2, ctx = E.BGM.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.connect(g); g.connect(MOOD.out);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + fadeIn);
  var end = at + buf.duration;
  g.gain.setValueAtTime(1, end - XF); g.gain.linearRampToValueAtTime(0, end);
  s.start(at); s.stop(end + .05);
  var o = { s:s, g:g }; MOOD.srcs.push(o);
  s.onended = function(){ var k = MOOD.srcs.indexOf(o); if (k >= 0) MOOD.srcs.splice(k, 1); };
  MOOD.loopT = setTimeout(function(){ if (MOOD.cur === name) moodQueue(name, buf, end - XF, XF); }, Math.max(0, (end - XF - ctx.currentTime - 1)*1000));
}
function mood(name){                                        // 'talk' | 'quiz' | 'sport' | 'game' | 'room'
  var B = E.BGM, prev = MOOD.cur; if (name === prev) return prev;
  MOOD.cur = name;
  if (!B.ctx || !B.trk) return prev;                           // no sound yet: remember the mood only
  var t = B.ctx.currentTime;
  if (!MOOD.out){ MOOD.out = B.ctx.createGain(); MOOD.out.gain.value = .9; MOOD.out.connect(B.gain); MOOD.syn = B.ctx.createGain(); MOOD.syn.gain.value = 1.3; MOOD.syn.connect(B.gain); }
  moodStop(name === 'talk' ? .5 : .25);
  B.trk.gain.setTargetAtTime(name === 'talk' ? 1 : 0, t, name === 'talk' ? .5 : .12);
  if (name === 'talk') return prev;
  if (window.MARS_BGM && window.MARS_BGM[name]){
    E.bgmLoad(name, function(buf){
      if (name !== 'quiz') delete B.buf[name];                 // decoded audio is big: keep only the quiz tune (used many times) in memory
      if (MOOD.cur === name && !MOOD.srcs.length) moodQueue(name, buf, B.ctx.currentTime + .03, .25);
    });
  } else { MOOD.step = 0; MOOD.next = 0; moodPump(); MOOD.timer = setInterval(moodPump, 90); }
  return prev;
}
function play(pr, m){ m = m || 'game'; var was = mood(m); return pr.then(function(v){ mood(was === m ? 'talk' : was); return v; }); }   // wrap a mini-game: its music while it runs
function music(key, bpm, lead, beats){
  if (!E.BGM.ctx) return;
  var t = TUNES[key], spb = 60/bpm, bars = Math.ceil(beats/4), bass = [0, 0, 5, 7];
  for (var b=0;b<bars;b++){
    for (var s=0;s<8;s++){
      var at = lead + (b*4 + s*.5)*spb, d = t.mel[(b%2)*8 + s];
      if (d != null){ var oct = b%4 === 3 ? 12 : 0; E.sfxTone(hz(t.root + t.scale[d%5] + 12 + oct), spb*.45, t.wave, t.vol, at); }
      if (E.SFX.ready) E.sfxNoise(.03, 'highpass', 7000, .05, at);
      if (s%2 === 0){
        E.sfxTone(hz(t.root - 24 + bass[b%4]), spb*.8, 'sine', .22, at);
        if (s%4 === 0) E.sfxTone(120, .14, 'sine', .32, at, 45); else if (E.SFX.ready) E.sfxNoise(.09, 'highpass', 1800, .15, at);
      }
    }
  }
}
function mkBeats(bars, n){
  var pats = [[0,1,2,3], [0,1,2,3], [0,2,3], [0,1,2,2.5,3], [0,1.5,2,3], [0,1,2]], out = [];
  for (var b=0;b<bars;b++){ var p = b === 0 ? pats[0] : pats[Math.random()*pats.length|0]; p.forEach(function(x){ out.push(b*4 + x); }); }
  return n ? out.slice(0, n) : out;
}

/* ---------- rhythm games: live gauges for the player, Hayato and Mirai (rows re-sort when someone overtakes) ----------
   The rivals do not play the notes: their note-by-note results were decided before the game (rivalsFor), and each one
   is counted when that note's window closes, at the same moment as the player's.  */
var RIV_COL = { P:'#ff8a1e', H:'#3f7fd9', M:'#e86a9a' }, POP_FONT = '"Hiragino Maru Gothic ProN","Hiragino Maru Gothic Pro","Zen Maru Gothic","M PLUS Rounded 1c","BIZ UDPGothic","Meiryo",sans-serif';
function rivalBoard(runs, n){
  var box = $('sc-riv'), keys = ['P', 'H', 'M'], sum = { P:0, H:0, M:0 }, order = keys.slice(), rows = {}, popT = -9, told = 0;   // told: the player's place in the last pop-up
  box.innerHTML = '<div class="sc-rvnow" id="sc-rvnow"></div>' + keys.map(function(k){
    return '<div class="sc-rv' + (k === 'P' ? ' me' : '') + '" data-k="' + k + '"><span class="sc-rvno"></span><span class="sc-rava">' + face(who(k)) + '</span><span class="sc-rvn">' +
      esc(k === 'P' ? S.name : WHO[k].name) + '</span><span class="sc-rvbar"><i style="background:' + RIV_COL[k] + '"></i></span><span class="sc-rvs">0</span></div>';
  }).join('');
  keys.forEach(function(k){ rows[k] = box.querySelector('[data-k="' + k + '"]'); });
  function show(){
    order.forEach(function(k, i){ rows[k].style.transform = 'translateY(' + (50 + i*46) + 'px)'; rows[k].querySelector('.sc-rvno').textContent = (i + 1) + '位'; });
    var me = order.indexOf('P') + 1, nw = $('sc-rvnow');
    if (nw && nw.dataset.p !== String(me)){ nw.textContent = 'このゲーム ' + me + '位！'; nw.dataset.p = me; nw.classList.remove('pop'); void nw.offsetWidth; nw.classList.add('pop'); }
    keys.forEach(function(k){ rows[k].querySelector('i').style.width = (sum[k]/n*100) + '%'; rows[k].querySelector('.sc-rvs').textContent = Math.round(sum[k]/n*100); });
  }
  function flash(){ rows.P.classList.remove('up'); void rows.P.offsetWidth; rows.P.classList.add('up'); }
  show(); box.hidden = false;
  return {
    note:function(i, mine, now){
      var old = order;
      sum.P += mine; sum.H += runs.H[i] || 0; sum.M += runs.M[i] || 0;
      order = old.slice().sort(function(a, b){ return (sum[b] - sum[a]) || (old.indexOf(a) - old.indexOf(b)); });   // ties keep the old order
      var is = order.indexOf('P'); show();
      if (i < 2){ told = is; return; }                       // the first notes only set the starting order (no 「ぬかれた」 at the very start)
      if (is !== told && now - popT > 1.2){                 // a small pop-up when the player passes someone or is passed (at most one per 1.2 s;
        popT = now;                                          // a change that flips straight back is not announced, one that lasts is announced late)
        if (is < told){ note(WHO[order[is + 1]].name + 'をぬいた！'); E.sfxTone(880, .1, 'triangle', .14); E.sfxTone(1175, .16, 'triangle', .14, .08); flash(); }
        else { note(WHO[order[is - 1]].name + 'にぬかれた！'); E.sfxTone(523, .1, 'triangle', .1); E.sfxTone(392, .18, 'triangle', .1, .09); }
        told = is;
      }
    },
    finish:function(){ var pl = order.indexOf('P') + 1; note(pl === 1 ? '1位！ やったね' : pl + '位'); if (pl === 1) E.sfx('coin'); flash(); },
    close:function(){ box.hidden = true; box.innerHTML = ''; }
  };
}
/* ---------- mini-game: rhythm (works without sound: tap when the note sits in the ring) ----------
   o.rivals = { H:[…], M:[…] } (one result per note) shows the gauges; o.onRival(key, result, note) moves Hayato / Mirai in 3D on each beat.
   Test: window.__sch.autoRhythm = 0.08 makes the game tap by itself with that timing spread (seconds). */
function rhythm(o){
  return new Promise(function(res){
    var layer = $('sc-game'), cv = $('sc-cv'), g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    layer.hidden = false; $('sc-gtitle').textContent = o.title; $('sc-gmsg').textContent = 'マークが輪に重なったらタップ！（スペースキーでもOK）';
    function size(){ cv.width = window.innerWidth*dpr; cv.height = window.innerHeight*dpr; }
    size(); window.addEventListener('resize', size);
    var spb = 60/o.bpm, lead = spb*4 + .7;
    var notes = o.beats.map(function(b){ return { t:lead + b*spb, s:0 }; }), last = notes[notes.length-1].t;
    var t0 = performance.now()/1000, score = 0, combo = 0, fx = { txt:'', t:-9, col:'#fff' }, alive = true;
    var board = o.rivals ? rivalBoard(o.rivals, notes.length) : null, ended = false, auto = +(window.__sch && window.__sch.autoRhythm) || 0;
    if (auto) notes.forEach(function(n){ var u = Math.random() || 1e-9; n.at = n.t + Math.sqrt(-2*Math.log(u))*Math.cos(6.2832*Math.random())*auto; });
    duck(true); if (o.genre) music(o.genre, o.bpm, lead, o.beats[o.beats.length-1] + 2);
    function judge(n, i, d, now){
      var p = d <= .09; n.s = p ? 1 : 2; score += p ? 1 : .6; combo++;
      fx = { txt:p ? 'ピッタリ！' : 'OK', t:now, col:p ? '#ff8a1e' : '#18a0c4' }; E.sfx(p ? 'pop' : 'click');
      if (o.onHit) o.onHit(i, p);
    }
    function hit(e){
      if (e && e.preventDefault) e.preventDefault();
      var now = performance.now()/1000 - t0, best = null, bd = 9, bi = -1;
      notes.forEach(function(n, i){ if (n.s === 0){ var d = Math.abs(n.t - now); if (d < bd){ bd = d; best = n; bi = i; } } });
      if (best && bd <= .2) judge(best, bi, bd, now);
    }
    function key(e){ if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat){ hit(e); } }
    layer.addEventListener('pointerdown', hit); window.addEventListener('keydown', key);
    function draw(){
      if (!alive) return;
      var now = performance.now()/1000 - t0, w = cv.width, h = cv.height, y = h*.74, tx = w*.3, sp = w*.36, Rr = Math.min(h*.05, w*.035);
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,250,240,.88)'; g.beginPath();
      if (g.roundRect) g.roundRect(w*.06, y - Rr*1.7, w*.88, Rr*3.4, Rr*1.7); else g.rect(w*.06, y - Rr*1.7, w*.88, Rr*3.4);
      g.fill();
      var beat = (now - lead)/spb, pulse = 1 + .16*Math.max(0, 1 - ((beat%1 + 1)%1)*3);
      g.lineWidth = Rr*.28; g.strokeStyle = '#ff8a1e'; g.beginPath(); g.arc(tx, y, Rr*1.25*pulse, 0, 6.2832); g.stroke();
      g.fillStyle = 'rgba(255,138,30,.18)'; g.beginPath(); g.arc(tx, y, Rr*1.25, 0, 6.2832); g.fill();
      for (var i=0;i<notes.length;i++){
        var n = notes[i], x = tx + (n.t - now)*sp;
        if (auto && !n.tapped && now >= n.at){ n.tapped = true; if (n.s === 0 && Math.abs(n.at - n.t) <= .2) judge(n, i, Math.abs(n.at - n.t), now); }   // test player: judged at its own tap time, whatever the frame rate
        if (n.s === 0 && now - n.t > .2){ n.s = -1; combo = 0; fx = { txt:'ミス', t:now, col:'#e0446a' }; }
        if (board){
          if (!n.mv && now >= n.t){ n.mv = true; if (o.onRival){ o.onRival('H', o.rivals.H[i], i); o.onRival('M', o.rivals.M[i], i); } }   // the rivals move on the beat…
          if (!n.done && now - n.t > .2){ n.done = true; board.note(i, n.s === 1 ? 1 : n.s === 2 ? .6 : 0, now); }                     // …and score when the window closes
        }
        if (x > w*.96 || x < w*.08 || n.s > 0) continue;
        g.globalAlpha = n.s < 0 ? .3 : 1;
        g.fillStyle = o.color || '#18a0c4'; g.beginPath(); g.arc(x, y, Rr, 0, 6.2832); g.fill();
        g.lineWidth = Rr*.16; g.strokeStyle = '#fff'; g.stroke();
        g.fillStyle = '#fff'; g.font = 'bold ' + Rr*1.05 + 'px ' + POP_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.glyph || '♪', x, y + Rr*.05);
        g.globalAlpha = 1;
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (now < lead - .2){
        var c = Math.ceil((lead - now)/spb);
        g.font = 'bold ' + h*.12 + 'px ' + POP_FONT; g.fillStyle = '#fff'; g.strokeStyle = '#4a2e1c'; g.lineWidth = h*.012;
        var tt = c > 3 ? 'よーい' : String(c); g.strokeText(tt, w/2, h*.4); g.fillText(tt, w/2, h*.4);
      }
      if (now - fx.t < .5){
        g.globalAlpha = 1 - (now - fx.t)*2; g.font = 'bold ' + Rr*1.5 + 'px ' + POP_FONT; g.lineWidth = Rr*.3; g.strokeStyle = '#fff'; g.fillStyle = fx.col;
        g.strokeText(fx.txt, tx, y - Rr*2.8 - (now - fx.t)*Rr); g.fillText(fx.txt, tx, y - Rr*2.8 - (now - fx.t)*Rr); g.globalAlpha = 1;
      }
      if (combo > 1){ g.font = 'bold ' + Rr*.9 + 'px ' + POP_FONT; g.fillStyle = '#4a2e1c'; g.fillText(combo + ' コンボ', w*.86, y); }
      if (board && !ended && now > last + .25){ ended = true; board.finish(); }
      if (now > last + (board ? 1.8 : .9)){                 // with rivals, hold the final standings a moment longer
        alive = false; layer.removeEventListener('pointerdown', hit); window.removeEventListener('keydown', key); window.removeEventListener('resize', size);
        g.clearRect(0, 0, w, h); layer.hidden = true; duck(false); if (board) board.close(); res(score/notes.length); return;
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  });
}

/* ---------- mini-game: hurdles (real jump physics; Earth gravity first, then Mars) ---------- */
var hurdleGeo = null;
function mkHurdle(pos, h, zone){
  var g = new T.Group(), white = new T.MeshStandardMaterial({ color:0xffffff, roughness:.6 }), org = new T.MeshStandardMaterial({ color:0xff8a1e, roughness:.6 });
  [-1, 1].forEach(function(s){ var p = new T.Mesh(new T.CylinderGeometry(.04, .04, h, 8), white); p.position.set(0, h/2, s*.8); p.castShadow = true; g.add(p); });
  var bar = new T.Mesh(new T.BoxGeometry(.07, .1, 1.7), org); bar.position.y = h; bar.castShadow = true; g.add(bar);
  var z = new T.Mesh(new T.PlaneGeometry(zone[1] - zone[0], 1.6), new T.MeshBasicMaterial({ color:0x00a8ff, transparent:true, opacity:.5, depthWrite:false, fog:false }));
  z.rotation.x = -Math.PI/2; z.position.set(-(zone[0] + zone[1])/2, .06, 0); g.add(z);
  g.position.set(pos.x, E.groundAt(pos.x, pos.z), pos.z); g.rotation.y = ROT; E.scene.add(g); return g;
}
function hurdleRun(label, grav, n, gap, hh, zone){
  return new Promise(function(res){
    var x0 = -24, lz = 26, start = W(x0, lz), dx = Math.cos(ROT), dz = -Math.sin(ROT);
    /* the blue zone is worked out by trying the jump from every take-off point over the real ground, so anywhere inside it clears the bar */
    function safeZone(s){
      var v0 = E.V0, sp = 7.5, ok = [];
      for (var d = .4; d <= 16; d += .2){
        var a = W(x0 + s - d, lz), y0 = E.groundAt(a.x, a.z), good = false;
        for (var t = .02; t < 4; t += .02){
          var q = W(x0 + s - d + sp*t, lz), y = y0 + v0*t - .5*grav*t*t, gy = E.groundAt(q.x, q.z);
          if (sp*t >= d){ good = y - gy >= hh + .14; break; }
          if (y <= gy) break;                                   // already landed before the bar
        }
        if (good) ok.push(d);
      }
      if (!ok.length) return zone;
      var lo = ok[0], hi = lo; for (var k=1;k<ok.length && ok[k] - hi < .25;k++) hi = ok[k];
      var span = hi - lo; lo += Math.min(.25, span*.08); hi -= Math.min(sp*.1 + .2, span*.12);   // a little safety at both ends (late taps)
      return [lo, hi];
    }
    var hs = []; for (var i=0;i<n;i++){ var s = 12 + i*gap; hs.push({ s:s, m:mkHurdle(W(x0 + s, lz), hh, safeZone(s)), done:false, ok:false }); }
    var fin = 12 + (n-1)*gap + 9, cleared = 0, going = false, top = 0;
    hideNPCs(); setP(start, ROT + Math.PI/2); E.setGravity(grav);
    setShot({ follow:true, ox:dx*3.5, oz:dz*3.5, h:1.2, yaw:ROT, pitch:.13, dist:11.5 });
    var layer = $('sc-game'); layer.hidden = false; $('sc-gtitle').textContent = label; $('sc-gmsg').textContent = '青いゾーンでタップしてジャンプ！';
    var cv = $('sc-cv'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    function tap(e){ e.preventDefault(); if (going) E.jump(); }
    layer.addEventListener('pointerdown', tap);
    function tick(){
      if (!going) return;
      var s = (P.x - start.x)*dx + (P.z - start.z)*dz, up = P.y - E.groundAt(P.x, P.z); top = Math.max(top, up);
      for (var i=0;i<hs.length;i++){
        var h = hs[i]; if (h.done || s < h.s) continue;
        h.done = true; h.ok = up >= hh - .03;
        if (h.ok){ cleared++; E.sfx('coin'); $('sc-gmsg').textContent = 'ナイス！ ' + cleared + ' / ' + n; }
        else { E.sfx('bad'); h.m.rotation.z = -1.2; $('sc-gmsg').textContent = 'ひっかかった！'; }
      }
      if (s >= fin){
        going = false; SCH.ix = 0; SCH.jump = false; tickers.splice(tickers.indexOf(tick), 1);
        layer.removeEventListener('pointerdown', tap); layer.hidden = true;
        setTimeout(function(){ hs.forEach(function(h){ E.scene.remove(h.m); }); E.setGravity(3.73); res({ cleared:cleared, n:n, top:top }); }, 700);
      }
    }
    tickers.push(tick);
    (async function(){
      for (var c=3;c>0;c--){ $('sc-gmsg').textContent = c + '…'; E.sfxTone(660, .12, 'triangle', .15); await sleep(650); }
      $('sc-gmsg').textContent = 'スタート！ 青いゾーンでタップ'; E.sfxTone(990, .3, 'triangle', .18);
      going = true; SCH.ix = 1; SCH.run = true; SCH.jump = true;
    })();
  });
}

/* ---------- mini-game: stop the gauge at the line ---------- */
function riser(kind){                                      // a tone that climbs with the gauge; kind 0 seeds / 1 water / 2 nutrients
  var ctx = E.BGM.ctx; if (!ctx || !E.SFX.ready) return null;
  var o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = kind === 2 ? 'sawtooth' : 'triangle'; o2.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
  lfo.frequency.value = kind === 1 ? 11 : 6; lg.gain.value = kind === 1 ? 14 : 4; lfo.connect(lg); lg.connect(o.frequency);   // water wobbles more
  o.connect(f); o2.connect(f); f.connect(g); g.connect(E.SFX.bus); o.start(); o2.start(); lfo.start();
  var base = [150, 130, 170][kind] || 150;
  return {
    set:function(lvl){ var t = ctx.currentTime, k = lvl/100, fr = base*Math.pow(2, k*2.2);        // a little over two octaves from empty to full
      o.frequency.setTargetAtTime(fr, t, .03); o2.frequency.setTargetAtTime(fr*2, t, .03); f.frequency.setTargetAtTime(700 + k*2600, t, .05);
      g.gain.setTargetAtTime(lvl > 0 ? (kind === 2 ? .07 : .13) : 0, t, .04); },
    stop:function(){ var t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, .03); o.stop(t + .25); o2.stop(t + .25); lfo.stop(t + .25); }
  };
}
function gauge(rounds){
  return new Promise(function(res){
    var r = 0, total = 0;
    function round(){
      var R = rounds[r], lvl = 0, run = true, t0 = performance.now(), snd = riser(r%3);
      var p = panel('<h2>' + R.name + '（' + (r+1) + ' / ' + rounds.length + '）</h2><div class="sc-body">線のところで止めよう。タップでストップ！</div>' +
        '<div class="sc-gauge"><div class="sc-tube"><i id="sc-fill"></i><em style="bottom:' + (R.target - R.band) + '%;height:' + (R.band*2) + '%"></em></div><div id="sc-gres">　</div></div>', 'tap');
      function stop(e){
        if (e) e.preventDefault(); if (!run) return; run = false; if (snd) snd.stop(); p.removeEventListener('pointerdown', stop); window.removeEventListener('keydown', key);
        var err = Math.abs(lvl - R.target), sc = lvl >= 100 ? 0 : clamp(1 - Math.max(0, err - R.band)/22, 0, 1); total += sc;
        E.sfx(sc > .8 ? 'ok' : sc > .3 ? 'pop' : 'bad');
        $('sc-gres').textContent = lvl >= 100 ? 'こぼれた！' : sc > .95 ? 'ピッタリ！' : sc > .6 ? 'おしい！' : lvl < R.target ? '少なすぎた…' : '多すぎた…';
        setTimeout(function(){ r++; if (r < rounds.length) round(); else { closePanel(); res(total/rounds.length); } }, 1100);
      }
      function key(e){ if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat){ e.preventDefault(); stop(); } }
      setTimeout(function(){ p.addEventListener('pointerdown', stop); window.addEventListener('keydown', key); }, 250);
      (function step(){
        if (!run) return;
        lvl = Math.min(100, (performance.now() - t0 - 500)/1000/R.sec*100); if (lvl < 0) lvl = 0;
        var f = $('sc-fill'); if (!f){ if (snd) snd.stop(); return; } f.style.height = lvl + '%'; if (snd) snd.set(lvl);
        if (lvl >= 100) stop(); else requestAnimationFrame(step);
      })();
    }
    round();
  });
}

/* ---------- mini-game: connect the cable (rotate tiles) ---------- */
function wires(){
  return new Promise(function(res){
    var RN = 3, CN = 4, r0 = Math.random()*RN|0, cells = [], path = [], r = r0, from = 3;
    for (var c=0;c<CN;c++){
      var steps = c < CN-1 ? (Math.random()*3|0) - 1 : 0, nr = clamp(r + steps, 0, RN-1);
      while (r !== nr){ var d = nr > r ? 2 : 0; path.push({ r:r, c:c, a:from, b:d }); r += nr > r ? 1 : -1; from = (d + 2)%4; }
      path.push({ r:r, c:c, a:from, b:1 }); from = 3;
    }
    var r1 = r;
    for (var i=0;i<RN*CN;i++) cells.push({ type:Math.random() < .5 ? 'I' : 'L', rot:Math.random()*4|0 });
    path.forEach(function(q){ var cell = cells[q.r*CN + q.c]; cell.type = (q.a + 2)%4 === q.b ? 'I' : 'L'; cell.rot = Math.random()*4|0; });
    function open(cell){ var b = cell.type === 'I' ? [1, 3] : [0, 1]; return [(b[0] + cell.rot)%4, (b[1] + cell.rot)%4]; }
    function trace(){
      var on = {}, rr = r0, cc = 0, inD = 3, ok = false;
      for (var k=0;k<40;k++){
        if (rr < 0 || rr >= RN || cc < 0) break;
        if (cc >= CN){ ok = rr === r1; break; }
        var o = open(cells[rr*CN + cc]); if (o.indexOf(inD) < 0) break;
        on[rr*CN + cc] = 1; var out = o[0] === inD ? o[1] : o[0];
        if (out === 0) rr--; else if (out === 2) rr++; else if (out === 1) cc++; else cc--;
        inD = (out + 2)%4;
      }
      return { on:on, ok:ok };
    }
    function fits(q){ var o = open(cells[q.r*CN + q.c]); return o.indexOf(q.a) >= 0 && o.indexOf(q.b) >= 0; }
    var wrong = path.filter(function(q){ return !fits(q); }).length, need = Math.min(4, path.length);
    path.slice().sort(function(){ return Math.random() - .5; }).forEach(function(q){
      if (wrong >= need || !fits(q)) return;
      var cell = cells[q.r*CN + q.c]; cell.rot = (cell.rot + 1)%4; if (!fits(q)) wrong++;
    });
    if (trace().ok) cells[r0*CN].rot = (cells[r0*CN].rot + 1)%4;
    var t0 = performance.now(), solved = false, helped = false;
    var p = panel('<h2>ケーブルをつなごう</h2><div class="sc-body">パネルをタップして回し、<b>ソーラーパネル</b>から<b>アンテナ</b>まで電気の道をつなげよう。</div>' +
      '<div class="sc-wire"><div class="sc-end" style="grid-row:' + (r0+1) + '">ソーラー<br>パネル</div><div class="sc-grid" id="sc-grid"></div><div class="sc-end ant" style="grid-row:' + (r1+1) + '">アンテナ</div></div>' +
      '<div class="sc-foot"><span id="sc-wt">0 秒</span><button type="button" id="sc-help" hidden>隊員に手伝ってもらう</button></div>');
    var grid = $('sc-grid');
    function render(){
      var tr = trace(); grid.innerHTML = '';
      cells.forEach(function(cell, i){
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-tile' + (tr.on[i] ? ' on' : '');
        b.innerHTML = '<svg viewBox="0 0 100 100" style="transform:rotate(' + cell.rot*90 + 'deg)"><path d="' + (cell.type === 'I' ? 'M0 50H100' : 'M50 0V50H100') + '"/></svg>';
        b.addEventListener('click', function(){ if (solved) return; cell.rot = (cell.rot + 1)%4; E.sfx('click'); render(); });
        grid.appendChild(b);
      });
      if (tr.ok && !solved){ solved = true; clearInterval(tm); E.sfx('ok'); setTimeout(function(){ closePanel(); res({ sec:(performance.now() - t0)/1000, helped:helped }); }, 900); }
    }
    var tm = setInterval(function(){
      var s = (performance.now() - t0)/1000; var el = $('sc-wt'); if (!el) return clearInterval(tm);
      el.textContent = Math.floor(s) + ' 秒'; if (s > 40) $('sc-help').hidden = false;
    }, 250);
    $('sc-help').addEventListener('click', function(){ helped = true; path.forEach(function(q){ var cell = cells[q.r*CN + q.c]; for (var k=0;k<4;k++){ var o = open(cell); if (o.indexOf(q.a) >= 0 && o.indexOf(q.b) >= 0) break; cell.rot = (cell.rot + 1)%4; } }); render(); });
    render();
  });
}

/* ---------- pick one of several cards (locked ones need more points) ---------- */
function pick(title, body, items, onPreview){
  return new Promise(function(res){
    var sel = 0;
    var p = panel('<h2>' + title + '</h2>' + (body ? '<div class="sc-body">' + body + '</div>' : '') + '<div class="sc-cards">' + items.map(function(it, i){
      var lock = it.need && S.pts.me < it.need;
      return '<button type="button" data-i="' + i + '"' + (lock ? ' disabled' : '') + '>' + (it.col != null ? '<i style="background:#' + ('00000' + it.col.toString(16)).slice(-6) + '"></i>' : '') +
        '<b>' + esc(it.name) + '</b><small>' + (lock ? 'あと ' + (it.need - S.pts.me) + ' 点でえらべる' : esc(it.note || '')) + '</small></button>';
    }).join('') + '</div>' + nextBtn('これにする'), 'low');
    var bs = p.querySelectorAll('.sc-cards button');
    function mark(){ Array.prototype.forEach.call(bs, function(b, i){ b.classList.toggle('sel', i === sel); }); if (onPreview) onPreview(sel); }
    Array.prototype.forEach.call(bs, function(b){ b.addEventListener('click', function(){ sel = +b.dataset.i; E.sfx('click'); mark(); }); });
    mark();
    $('sc-ok').addEventListener('click', function(){ E.sfx('click'); closePanel(); res(sel); });
  });
}

/* ---------- mini-game: rover race — an S-shaped slalom against Hayato and Mirai ----------
   Course runs along base-local +x.  Gates alternate left/right; a sand patch sits on the straight line between
   two gates (top speed x2/3 inside), so each bend is a choice: cut through the sand or steer around it.  */
var raceProps = null;
function raceCleanup(){
  if (!raceProps) return;
  raceProps.objs.forEach(function(m){ E.scene.remove(m); if (m.geometry) m.geometry.dispose(); });
  var R = E.R, h = raceProps.home; R.x = h.x; R.z = h.z; R.heading = h.h; R.speed = 0; R.vdir = null;
  E.rover.position.set(R.x, E.groundAt(R.x, R.z), R.z); E.rover.rotation.set(0, R.heading, 0);
  raceProps = null;
}
function note(msg){ var n = $('sc-note'); n.textContent = msg; n.hidden = false; clearTimeout(note.t); note.t = setTimeout(function(){ n.hidden = true; }, 1600); }
function race(){
  return new Promise(function(res){
    raceCleanup();
    var O = W(0, 0), X1 = W(1, 0), Z1 = W(0, 1), ex = { x:X1.x - O.x, z:X1.z - O.z }, ez = { x:Z1.x - O.x, z:Z1.z - O.z };
    function loc(p){ var dx = p.x - O.x, dz = p.z - O.z; return { x:dx*ex.x + dz*ex.z, z:dx*ez.x + dz*ez.z }; }
    function hdgOf(ang){ var c = Math.cos(ang), s = Math.sin(ang); return Math.atan2(ex.x*c + ez.x*s, ex.z*c + ez.z*s); }   // local angle -> world heading
    var L = RACE_L, NG = L.length - 2, FIN = L[L.length-1], R = E.R, objs = [];
    raceProps = { objs:objs, home:{ x:R.x, z:R.z, h:R.heading } };
    /* sand patches: one between each pair of gates (not on the start straight) */
    var sands = [];
    for (var i=1;i<L.length-1;i++){
      var a = L[i], b = L[i+1], len = Math.hypot(b[0]-a[0], b[1]-a[1]);
      sands.push({ cx:(a[0]+b[0])/2, cz:(a[1]+b[1])/2, dx:(b[0]-a[0])/len, dz:(b[1]-a[1])/len, a:7, b:8.5, seg:i });
    }
    function inSand(l){
      for (var k=0;k<sands.length;k++){
        var s = sands[k], u = (l.x - s.cx)*s.dx + (l.z - s.cz)*s.dz, v = -(l.x - s.cx)*s.dz + (l.z - s.cz)*s.dx;
        if (u*u/(s.a*s.a) + v*v/(s.b*s.b) < 1) return true;
      }
      return false;
    }
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g2 = cv.getContext('2d');
    g2.fillStyle = '#e9cf93'; g2.fillRect(0, 0, 128, 128); g2.strokeStyle = '#d2b06a'; g2.lineWidth = 3;
    for (var yy=6;yy<128;yy+=12){ g2.beginPath(); for (var xx=0;xx<=128;xx+=8) g2.lineTo(xx, yy + Math.sin(xx/128*Math.PI*4)*3); g2.stroke(); }
    var tex = new T.CanvasTexture(cv); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(3, 3);
    var sandMat = new T.MeshStandardMaterial({ map:tex, color:0x6e6e6e, roughness:1, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
    sands.forEach(function(s){
      var pos = [], uv = [], idx = [], RN = 6, SN = 36;
      function vert(u, v){ var w = W(s.cx + u*s.dx - v*s.dz, s.cz + u*s.dz + v*s.dx); pos.push(w.x, E.groundAt(w.x, w.z) + .09, w.z); uv.push(u/s.a*.5 + .5, v/s.b*.5 + .5); }
      vert(0, 0);
      for (var r=1;r<=RN;r++) for (var k=0;k<SN;k++){ var t = k/SN*6.2832; vert(Math.cos(t)*s.a*r/RN, Math.sin(t)*s.b*r/RN); }
      for (k=0;k<SN;k++) idx.push(0, 1 + (k+1)%SN, 1 + k);
      for (r=1;r<RN;r++) for (k=0;k<SN;k++){ var p0 = 1 + (r-1)*SN + k, p1 = 1 + (r-1)*SN + (k+1)%SN, q0 = p0 + SN, q1 = p1 + SN; idx.push(p0, p1, q1, p0, q1, q0); }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      var m = new T.Mesh(geo, sandMat); m.receiveShadow = true; E.scene.add(m); objs.push(m);
    });
    /* gates + finish arch */
    var gateMat = new T.MeshStandardMaterial({ color:0xff8a1e, emissive:0xff6a00, emissiveIntensity:.5, roughness:.5 }), gates = [], gy = hdgOf(0);
    for (i=1;i<=NG;i++){
      var w = W(L[i][0], L[i][1]), m = new T.Mesh(new T.TorusGeometry(3.6, .24, 10, 28), gateMat);
      m.position.set(w.x, E.groundAt(w.x, w.z) + 2.7, w.z); m.rotation.y = gy; E.scene.add(m); gates.push(m); objs.push(m);
    }
    var fw = W(FIN[0], FIN[1]), fy = E.groundAt(fw.x, fw.z), fin = new T.Group(), white = new T.MeshStandardMaterial({ color:0xffffff, roughness:.6 });
    var cv2 = document.createElement('canvas'); cv2.width = 256; cv2.height = 32; var g3 = cv2.getContext('2d');
    for (var cx=0;cx<16;cx++) for (var cy=0;cy<2;cy++){ g3.fillStyle = (cx + cy)%2 ? '#222' : '#fff'; g3.fillRect(cx*16, cy*16, 16, 16); }
    [-9, 9].forEach(function(o){ var p = new T.Mesh(new T.CylinderGeometry(.22, .22, 6, 12), white); p.position.set(0, 3, o); p.castShadow = true; fin.add(p); });
    var ban = new T.Mesh(new T.BoxGeometry(.2, 1.4, 18), new T.MeshStandardMaterial({ map:new T.CanvasTexture(cv2), roughness:.7 })); ban.position.y = 5.6; fin.add(ban);
    fin.position.set(fw.x, fy, fw.z); fin.rotation.y = hdgOf(0) - Math.PI/2; E.scene.add(fin); objs.push(fin);
    /* the two rivals: same rover with a coloured beacon; they follow way-points */
    function mkBot(key, col, lane, cap, thru){
      var g = E.rover.clone(true), rm = []; g.traverse(function(o){ if (o.isLight) rm.push(o); }); rm.forEach(function(o){ o.parent.remove(o); });
      var bc = new T.Mesh(new T.SphereGeometry(.5, 16, 12), new T.MeshBasicMaterial({ color:new T.Color(col).convertSRGBToLinear() })); bc.position.set(0, 3.5, -1); g.add(bc);
      E.scene.add(g); objs.push(g);
      var wp = [];
      for (var s=0;s<L.length-1;s++){
        if (s >= 1 && !thru[s]){ var sd = sands[s-1], side = s%2 ? 1 : -1; wp.push({ x:sd.cx - sd.dz*(sd.b + 3)*side, z:sd.cz + sd.dx*(sd.b + 3)*side }); }
        wp.push({ x:L[s+1][0], z:L[s+1][1] + (s+1 < L.length-1 ? lane*.55 : lane) });
      }
      wp.push({ x:FIN[0] + 10, z:FIN[1] + lane });
      return { k:key, mesh:g, x:L[0][0], z:L[0][1] + lane, ang:0, sp:0, cap:cap*(.985 + Math.random()*.03), wp:wp, wi:0, fin:null, pitch:0, roll:0 };
    }
    var thru = {}; [1, 2, 3, 4].sort(function(){ return Math.random() - .5; }).slice(0, 2).forEach(function(s){ thru[s] = 1; });
    var bots = [mkBot('H', 0x3f7fd9, -5.2, RACE_CAP.H, thru), mkBot('M', 0xe86a9a, 5.2, RACE_CAP.M, {})];
    function poseBot(b, dt){
      var wpos = W(b.x, b.z), h = hdgOf(b.ang), sh = Math.sin(h), ch = Math.cos(h), ga = E.groundAt;
      var g0 = ga(wpos.x, wpos.z), hf = ga(wpos.x + sh*1.6, wpos.z + ch*1.6), hb = ga(wpos.x - sh*1.6, wpos.z - ch*1.6), hl = ga(wpos.x + ch*1.3, wpos.z - sh*1.3), hr = ga(wpos.x - ch*1.3, wpos.z + sh*1.3);
      var k = 1 - Math.exp(-8*dt); b.pitch += (-Math.atan2(hf - hb, 3.2) - b.pitch)*k; b.roll += (Math.atan2(hl - hr, 2.6) - b.roll)*k;
      b.mesh.position.set(wpos.x, (g0 + hf + hb + hl + hr)/5, wpos.z); b.mesh.rotation.set(b.pitch, h, b.roll);
    }
    var plx = L[0][0];
    function stepBot(b, dt, t){
      var tg = b.wp[Math.min(b.wi, b.wp.length-1)], last = b.wi >= b.wp.length - 1;
      var want = Math.atan2(tg.z - b.z, tg.x - b.x), d = want - b.ang; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
      b.ang += clamp(d, -1.5*dt, 1.5*dt);
      var cap = b.cap*E.VMAX*(inSand(b) ? 2/3 : 1)*(b.x - plx > 30 ? .86 : 1); if (last && Math.hypot(tg.x - b.x, tg.z - b.z) < 7) cap = 0;
      b.sp += clamp(cap - b.sp, -7*dt, 2.6*dt);
      b.x += Math.cos(b.ang)*b.sp*dt; b.z += Math.sin(b.ang)*b.sp*dt;
      if (!last && (Math.hypot(tg.x - b.x, tg.z - b.z) < 4 || b.x > tg.x + 1)) b.wi++;
      if (b.fin == null && b.x > FIN[0]){ b.fin = t; }
    }
    /* start grid: the player in the middle, Hayato on the left, Mirai on the right */
    var st = W(L[0][0], L[0][1]); R.x = st.x; R.z = st.z; R.heading = hdgOf(0); R.speed = 0; R.vdir = null;
    bots.forEach(function(b){ poseBot(b, 1); });
    shot = null; hideNPCs(); E.enterRover(); SCH.touch = true;
    var gi = 1, go = false, simT = 0, done = false, pen = 0, sandWas = false, auto = false, sandT = 0;
    var hint = $('sc-hint'), touchUI = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);   // the controls, as one line at the bottom until gate 1
    window.__race = { L:L, at:function(){ return gi; }, bots:bots, auto:function(v){ auto = v; } };
    function onKey(e){ if (!E.PERF.show) return; if (e.code === 'KeyP') auto = auto ? 0 : 1; if (e.code === 'KeyO') auto = auto ? 0 : 2; }   // debug: P = drive around the sand, O = straight through it
    window.addEventListener('keydown', onKey);
    function finish(t, dnf){
      done = true; tickers.splice(tickers.indexOf(tick), 1); window.removeEventListener('keydown', onKey); hint.hidden = true;
      if (auto){ var kk = E.keys(); kk.f = kk.l = kk.r = false; }
      E.setGuide(null); E.sfx('fanfare'); gates.forEach(function(m){ m.visible = false; });
      SCH.touch = false; SCH.slip = 0; SCH.vmaxK = 1; R.speed = 0;
      var mine = t + pen, times = {};
      bots.forEach(function(b){ times[b.k] = b.fin != null ? b.fin : t + Math.max(.4, (FIN[0] - b.x)/Math.max(b.sp, 3)); });
      var order = [{ k:'P', t:dnf ? 999 : mine }, { k:'H', t:times.H }, { k:'M', t:times.M }].sort(function(a, b){ return a.t - b.t; });
      var place = order.findIndex(function(o){ return o.k === 'P'; }) + 1;
      setTimeout(function(){ E.exitRover(); res({ place:place, sec:mine, pen:pen, dnf:!!dnf, order:order }); }, 700);
    }
    function tick(dt){
      if (done) return;
      if (!go){ R.speed = 0; return; }
      simT += dt; var t = simT, pl = loc({ x:R.x, z:R.z }); plx = pl.x;      // game time (not the wall clock), so a stutter never costs the player time
      bots.forEach(function(b){ stepBot(b, dt, t); });
      /* rovers only nudge each other apart (no bouncing) */
      var all = [{ p:true, x:pl.x, z:pl.z }].concat(bots);
      for (var a=0;a<all.length;a++) for (var c=a+1;c<all.length;c++){
        var A = all[a], B = all[c], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
        if (d < 3.6 && d > .01){
          var push = (3.6 - d)*.5, ux = dx/d, uz = dz/d; A.x -= ux*push; A.z -= uz*push; B.x += ux*push; B.z += uz*push;
          if (A.p){ R.x -= (ex.x*ux + ez.x*uz)*push; R.z -= (ex.z*ux + ez.z*uz)*push; }
        }
      }
      bots.forEach(function(b){ poseBot(b, dt); });
      pl = loc({ x:R.x, z:R.z });
      /* sand: slower, with a dust trail */
      var sd = inSand(pl); SCH.vmaxK = sd ? 2/3 : 1;
      if (sd){ sandT -= dt; if (sandT <= 0 && R.speed > 1){ sandT = .07; E.puff(R.x + (Math.random() - .5)*2, E.groundAt(R.x, R.z) + .3, R.z + (Math.random() - .5)*2, .9, 1.1); } if (!sandWas){ note('砂地！ スピードダウン'); E.sfxNoise && E.sfx('step'); } }
      sandWas = sd;
      /* gates: passing the gate line outside the ring costs 3 seconds */
      if (gi <= NG && pl.x > L[gi][0]){
        if (Math.abs(pl.z - L[gi][1]) <= 6.5){ E.sfx('coin'); gates[gi-1].visible = false; }
        else { pen += 3; E.sfx('bad'); note('ゲートを外した！ +3秒'); gates[gi-1].material = gates[gi-1].material.clone(); gates[gi-1].material.emissive.setHex(0x444444); gates[gi-1].material.color.setHex(0x888888); }
        gi++;
        E.setGuide(gi <= NG ? W(L[gi][0], L[gi][1]) : fw, gi <= NG ? 'ゲート ' + gi : 'ゴール');
      }
      if (!hint.hidden && (gi > 1 || t > 10)) hint.hidden = true;
      var ahead = bots.filter(function(b){ return b.fin != null || b.x > pl.x; }).length;
      S.sub = (ahead + 1) + '位　ゲート ' + Math.min(gi - 1, NG) + '/' + NG + '　' + (t + pen).toFixed(1) + '秒'; $('sc-sub').textContent = S.sub;
      if (auto){                                           // debug autopilot (Shift+F, then P): steers around the sand like Mirai
        var k2 = E.keys(), tg, seg = Math.min(gi, L.length - 1) - 1, sdp = seg >= 1 ? sands[seg-1] : null;
        if (auto === 1 && sdp && (pl.x - sdp.cx)*sdp.dx + (pl.z - sdp.cz)*sdp.dz < 0){ var side = seg%2 ? 1 : -1; tg = { x:sdp.cx - sdp.dz*(sdp.b + 3)*side, z:sdp.cz + sdp.dx*(sdp.b + 3)*side }; }
        else tg = { x:L[Math.min(gi, L.length-1)][0], z:L[Math.min(gi, L.length-1)][1] };
        var wt = W(tg.x, tg.z), want = Math.atan2(wt.x - R.x, wt.z - R.z), dh = want - R.heading; while (dh > Math.PI) dh -= 6.2832; while (dh < -Math.PI) dh += 6.2832;
        k2.f = true; k2.l = dh > .06; k2.r = dh < -.06;
      }
      if (pl.x > FIN[0]) finish(t, false); else if (t > 80) finish(t, true);
    }
    tickers.push(tick);
    (async function(){
      hint.textContent = touchUI ? '右のボタンでアクセル・左をなぞってハンドル' : '↑でアクセル・←→でハンドル'; hint.hidden = false;
      $('sc-big').hidden = false; $('sc-bign').textContent = ''; $('sc-bigs').textContent = '輪をくぐってゴールへ！';
      for (var c=3;c>0;c--){ $('sc-bigt').textContent = c; E.sfxTone(660, .12, 'triangle', .15); await sleep(700); }
      $('sc-bigt').textContent = 'スタート！'; E.sfxTone(990, .3, 'triangle', .18); go = true; SCH.slip = 2.6; E.setGuide(W(L[1][0], L[1][1]), 'ゲート 1');
      await sleep(700); $('sc-big').hidden = true;
    })();
  });
}
var RACE_L = [[-12, 44], [18, 53], [46, 35], [74, 53], [102, 35], [130, 42]];   // start, 4 gates, finish (base-local x, z) — checked clear of rocks
var RACE_CAP = { H:.78, M:.62 };                       // rivals' top speed as a share of the rover's (tuned so an average run is 2nd, a clean run 1st)
var RACE_PTS = [100, 70, 40];

/* ================= extra sets: the private room and the canteen (built from simple shapes, next to the habitat's pocket world) ================= */
function lin(hex, k){ return new T.Color(hex).convertSRGBToLinear().multiplyScalar(k || .62); }
function mt(hex, o){ o = o || {}; o.color = lin(hex); if (o.roughness == null) o.roughness = .8; return new T.MeshStandardMaterial(o); }
function bx(g, w, h, d, m, x, y, z){ var b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; }
function cy(g, rt, rb, h, m, x, y, z, seg){ var b = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), m); b.position.set(x, y, z); g.add(b); return b; }
function sp(g, r, m, x, y, z, sx, sy, sz){ var b = new T.Mesh(new T.SphereGeometry(r, 20, 14), m); b.position.set(x, y, z); if (sx) b.scale.set(sx, sy, sz); g.add(b); return b; }
function cvTex(w, h, draw){ var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; }
function shell(g, w, d, wallH, wallHex){                   // floor slab + three walls (the side facing the camera stays open)
  var wm = mt(wallHex), tm = mt(0xb9bcc6, { metalness:.2, roughness:.5 });
  bx(g, w + .3, .14, d + .3, mt(0x8d8f98), 0, -.07, 0);
  bx(g, w + .3, wallH, .14, wm, 0, wallH/2, -d/2 - .07); bx(g, .14, wallH, d + .14, wm, -w/2 - .07, wallH/2, 0); bx(g, .14, wallH, d + .14, wm, w/2 + .07, wallH/2, 0);
  bx(g, w + .3, .1, .2, tm, 0, wallH + .05, -d/2 - .07); bx(g, .2, .1, d + .14, tm, -w/2 - .07, wallH + .05, 0); bx(g, .2, .1, d + .14, tm, w/2 + .07, wallH + .05, 0);
  bx(g, w, .16, .05, mt(0xff8a1e), 0, .5, -d/2 + .03);
  for (var x=-w/2 + 1.05; x < w/2 - .2; x += 1.05) bx(g, .06, wallH, .05, tm, x, wallH/2, -d/2 + .02);
}
/* furniture and canteen props are modelled in Blender (tools/make_props.py -> js/props.js) */
var PROP_COL = { wood:0xd0a56c, woodDark:0xb58a52, white:0xffffff, cream:0xf3e8d4, blue:0x5b8fd9, orange:0xff8a1e, grey:0x9aa0ad, black:0x30343f, pot:0xd97b4a, green:0x4caf6a, green2:0x63c47e, green3:0x3f9a5a,
  bear:0xb8845a, bearLight:0xf3e2c8, guitar:0xc8843a, metal:0xc9cfd8, skyblue:0x86c5ee, rice:0xfffaf0, curry:0x9a5a22, yellow:0xf2c230, red:0xe2384a, soup:0xe9c98a, noodle:0xf5e08a }, propMats = {};
function pm(n){
  if (!propMats[n]) propMats[n] = n === 'screen' ? new T.MeshBasicMaterial({ color:lin(0x86c5ee, 1) }) : n === 'glow' ? new T.MeshBasicMaterial({ color:lin(0xffe08a, 1) }) :
    mt(PROP_COL[n] != null ? PROP_COL[n] : 0xff00ff, n === 'metal' ? { metalness:.3, roughness:.4 } : null);
  return propMats[n];
}
function prop(g, name, x, y, z, ry){
  var o = new T.Group(); E.PROPS[name].prims.forEach(function(q){ var m = new T.Mesh(q.geo, pm(q.m)); m.castShadow = true; o.add(m); });
  o.position.set(x || 0, y || 0, z || 0); if (ry) o.rotation.y = ry; g.add(o); return o;
}
var ROOM = null, CAFE = null, EARTH = null;
function lamps(g, list){ list.forEach(function(q){ var l = new T.PointLight(0xfff1dc, q[3]*.35, 18, 1.4); l.position.set(q[0], q[1], q[2]); g.add(l); }); }
function hideSets(){ SCH.dimIn = 0; if (ROOM) ROOM.g.visible = false; if (CAFE) CAFE.g.visible = false; if (EARTH) EARTH.visible = false; }

/* ---------- furniture for the private room ---------- */
var FURN = [
  { id:'bed', name:'ベッド', need:0, w:2, d:2, make:function(g){ prop(g, 'bed'); } },
  { id:'desk', name:'つくえ', need:0, w:2, d:1, make:function(g){ prop(g, 'desk2'); } },
  { id:'photo', name:'家族の写真', need:0, wall:true, make:function(g){ prop(g, 'photo'); var m = new T.Mesh(new T.PlaneGeometry(.52, .4), new T.MeshBasicMaterial({ map:cvTex(128, 96, function(c, w, h){ c.fillStyle = '#bfe3f5'; c.fillRect(0, 0, w, h); c.fillStyle = '#7fc98a'; c.fillRect(0, 66, w, 30);
        [[38, 50, 15, '#5b8fd9'], [70, 44, 18, '#e86a9a'], [100, 56, 12, '#f2c230']].forEach(function(p){ c.fillStyle = p[3]; c.fillRect(p[0] - p[2]*.8, p[1] + p[2]*.7, p[2]*1.6, 40); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); }); }) })); m.position.z = .03; g.add(m); } },
  { id:'lamp', name:'ライト', need:0, make:function(g){ prop(g, 'lamp'); } },
  { id:'plant', name:'小さな植物', need:300, make:function(g){ prop(g, 'plant'); } },
  { id:'plush', name:'ぬいぐるみ', need:300, make:function(g){ prop(g, 'plush'); } },
  { id:'guitar', name:'ギター', need:400, make:function(g){ prop(g, 'guitar'); } },
  { id:'window', name:'地球が見える窓', need:400, wall:true, make:function(g){ prop(g, 'window'); var m = new T.Mesh(new T.CircleGeometry(.39, 36), new T.MeshBasicMaterial({ map:cvTex(256, 256, function(c){ var gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#1b2238'); gr.addColorStop(.55, '#3a4668'); gr.addColorStop(.8, '#6f86b8'); gr.addColorStop(1, '#8a6a5a'); c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
        c.fillStyle = '#5a3a2c'; c.beginPath(); c.moveTo(0, 196); c.quadraticCurveTo(64, 166, 128, 190); c.quadraticCurveTo(190, 168, 256, 196); c.lineTo(256, 256); c.lineTo(0, 256); c.fill();
        var rg = c.createRadialGradient(150, 96, 0, 150, 96, 22); rg.addColorStop(0, '#fff'); rg.addColorStop(.3, '#cfe6ff'); rg.addColorStop(1, 'rgba(207,230,255,0)'); c.fillStyle = rg; c.fillRect(120, 66, 60, 60);
        c.fillStyle = '#fff'; c.beginPath(); c.arc(150, 96, 5, 0, 7); c.fill(); c.fillStyle = '#ddd'; c.beginPath(); c.arc(168, 104, 2.4, 0, 7); c.fill(); }) })); m.position.z = -.005; g.add(m); } }
];
function furnIcon(f){ if (!f.icon){ var g = new T.Group(); f.make(g); f.icon = E.thumb(g, 128); } return f.icon; }
var ROOM_MAX = 4;
function buildRoom(){
  if (ROOM) return ROOM;
  var g = new T.Group(), S1 = 1.05, N = 5, hw = N*S1/2, mid = (N - 1)/2; g.position.set(E.INT.x + 60, E.INT.y, E.INT.z);
  shell(g, N*S1, N*S1, 2.5, 0xf6f1e8);
  var hl = [], hlw = [], ym = new T.MeshBasicMaterial({ color:0xffc83a, transparent:true, opacity:.6, depthWrite:false });
  for (var r=0;r<N;r++) for (var c=0;c<N;c++){
    bx(g, S1 - .04, .06, S1 - .04, mt((r + c)%2 ? 0xe9dcc6 : 0xf3e8d4), (c - mid)*S1, .03, (r - mid)*S1);
    var h = new T.Mesh(new T.PlaneGeometry(S1 - .12, S1 - .12), ym); h.rotation.x = -Math.PI/2; h.position.set((c - mid)*S1, .07, (r - mid)*S1); h.visible = false; g.add(h); hl.push(h);
  }
  for (c=0;c<N;c++){ var w = new T.Mesh(new T.PlaneGeometry(S1 - .14, 1.2), ym); w.position.set((c - mid)*S1, 1.55, -hw + .01); w.visible = false; g.add(w); hlw.push(w); }
  bx(g, .06, 1.75, .9, mt(0xd9dde6), hw - .02, .875, 1.05);
  lamps(g, [[-2.0, 3.6, 3.2, 1.0], [2.3, 3.3, .4, .8]]);
  g.visible = false; E.scene.add(g);
  ROOM = { g:g, S1:S1, N:N, hw:hw, mid:mid, hl:hl, hlw:hlw, placed:{}, home:{ c:2, r:4 } }; return ROOM;
}
function roomGame(){
  return new Promise(function(res){
    var R = buildRoom(), N = R.N, S1 = R.S1, sel = null, tray = $('sc-tray'), tap = $('sc-tap'), rc = new T.Raycaster();
    function tileXZ(c, r){ return { x:(c - R.mid)*S1, z:(r - R.mid)*S1 }; }
    function count(){ return Object.keys(R.placed).length; }
    function at(wall, i){ for (var k in R.placed){ var q = R.placed[k]; if (!!q.wall === wall && (wall ? q.i === i : q.cells.indexOf(i) >= 0)) return k; } return null; }
    function cellsOf(f, i, rot){                         // the tiles a piece covers when its top-left corner is tile i (null if it sticks out)
      var w = rot%2 ? (f.d || 1) : (f.w || 1), d = rot%2 ? (f.w || 1) : (f.d || 1), c0 = i%N, r0 = (i/N)|0, out = [];
      if (c0 + w > N || r0 + d > N) return null;
      for (var r=0;r<d;r++) for (var c=0;c<w;c++) out.push((r0 + r)*N + c0 + c);
      return out;
    }
    function fits(f, i, rot, skip){ var cs = cellsOf(f, i, rot); if (!cs) return null; var me = myTile(); for (var k=0;k<cs.length;k++){ var o = at(false, cs[k]); if ((o && o !== skip) || cs[k] === me) return null; } return cs; }
    function setPos(f, q){ var w = q.rot%2 ? (f.d || 1) : (f.w || 1), d = q.rot%2 ? (f.w || 1) : (f.d || 1), p = tileXZ(q.i%N + (w - 1)/2, ((q.i/N)|0) + (d - 1)/2); q.o.position.set(p.x, .06, p.z); q.o.rotation.y = q.rot*Math.PI/2; }
    var path = [];
    function myTile(){ var lx = P.x - R.g.position.x, lz = P.z - R.g.position.z; return clamp(Math.floor((lz + R.hw)/S1), 0, N-1)*N + clamp(Math.floor((lx + R.hw)/S1), 0, N-1); }
    function free(wall, i){ return !at(wall, i) && (wall || i !== myTile()); }
    function route(to){                               // shortest way over the empty tiles (4 directions)
      var from = myTile(), prev = {}, q = [from]; prev[from] = -1;
      while (q.length){
        var c = q.shift(); if (c === to) break;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function(d){
          var cc = c%N + d[0], rr = ((c/N)|0) + d[1], n = rr*N + cc;
          if (cc < 0 || cc >= N || rr < 0 || rr >= N || prev[n] != null || at(false, n)) return; prev[n] = c; q.push(n);
        });
      }
      if (prev[to] == null) return null;
      var out = []; for (var k = to; k !== from; k = prev[k]) out.unshift(tileXZ(k%N, (k/N)|0)); return out;
    }
    function walk(){
      if (!path.length){ SCH.ix = SCH.iz = 0; return; }
      var w = path[0], dx = R.g.position.x + w.x - P.x, dz = R.g.position.z + w.z - P.z, d = Math.hypot(dx, dz);
      if (d < .1){ path.shift(); if (!path.length){ SCH.ix = SCH.iz = 0; } return; }
      SCH.ix = dx/d; SCH.iz = -dz/d;                 // camera yaw is 0 in this room, so screen right = +x and "up" = -z
    }
    tickers.push(walk); SCH.free = true; SCH.speed = 2.3;
    function marks(){
      var f = sel && !sel.wall && count() < ROOM_MAX, w = sel && sel.wall && count() < ROOM_MAX;
      R.hl.forEach(function(m, i){ m.visible = !!f && !!fits(sel, i, 0); }); R.hlw.forEach(function(m, i){ m.visible = !!w && free(true, i); });
    }
    function draw(){
      var n = count();
      tray.innerHTML = '<div class="sc-tinfo"><b>かぐ</b><span>あと ' + (ROOM_MAX - n) + ' こ</span></div>' + FURN.map(function(f, i){
        var lock = S.pts.me < f.need, used = !!R.placed[f.id];
        return '<button type="button" class="sc-it' + (sel === f ? ' sel' : '') + (used ? ' used' : '') + '" data-i="' + i + '"' + (lock ? ' disabled' : '') + '><img src="' + furnIcon(f) + '" alt="">' + esc(f.name) +
          '<small>' + (lock ? 'あと ' + (f.need - S.pts.me) + ' 点' : used ? 'もどす' : f.wall ? 'かべ' : 'ゆか') + '</small></button>';
      }).join('') + '<button type="button" class="sc-go" id="sc-rok">これでOK</button>';
      $('sc-hint').textContent = n >= ROOM_MAX && !sel ? '4こ置きました。入れかえるときは、置いた家具のボタンで「もどす」' :
        sel ? (sel.wall ? '光っているかべをタップ' : '光っているマスをタップ') : 'ボタンで家具をえらぼう。あいたマスをタップで歩く／家具をタップで向きを変える';
      marks();
    }
    function place(f, wall, i){
      var o = new T.Group(); f.make(o); o.traverse(function(m){ if (m.isMesh) m.castShadow = true; });
      var q = { wall:wall, i:i, o:o, rot:0, t:0, cells:wall ? [] : cellsOf(f, i, 0) };
      if (wall) o.position.set((i - R.mid)*S1, 1.55, -R.hw + .04); else setPos(f, q);
      o.scale.setScalar(.01); R.g.add(o); R.placed[f.id] = q;
      path = []; E.sfx('ok'); emote('P', 'joy'); P.face = Math.atan2(o.position.x - (P.x - R.g.position.x), (wall ? -R.hw : o.position.z) - (P.z - R.g.position.z));
    }
    function grow(dt){ for (var k in R.placed){ var q = R.placed[k]; if (q.t < 1){ q.t = Math.min(1, q.t + dt*4); var s = 1 + Math.sin(q.t*Math.PI)*.18; q.o.scale.setScalar(q.t < 1 ? q.t*s : 1); } } }
    tickers.push(grow);
    function onTray(e){
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'sc-rok'){ finish(); return; }
      var f = FURN[+b.dataset.i]; E.sfx('click');
      if (R.placed[f.id]){ R.g.remove(R.placed[f.id].o); delete R.placed[f.id]; sel = null; }
      else if (count() >= ROOM_MAX){ note('置けるのは4こまで'); sel = null; }
      else sel = sel === f ? null : f;
      draw();
    }
    function onTap(e){
      e.preventDefault();
      rc.setFromCamera({ x:e.clientX/window.innerWidth*2 - 1, y:-(e.clientY/window.innerHeight)*2 + 1 }, E.camera);
      var o = rc.ray.origin, d = rc.ray.direction, gp = R.g.position, hit = null;
      if (sel && sel.wall){
        var t = (gp.z - R.hw - o.z)/d.z, x = o.x + d.x*t - gp.x, y = o.y + d.y*t - gp.y;
        if (t > 0 && y > .7 && y < 2.4 && Math.abs(x) < R.hw){ hit = Math.min(N - 1, Math.floor((x + R.hw)/S1)); if (free(true, hit)){ place(sel, true, hit); sel = null; draw(); } }
        return;
      }
      var t2 = (gp.y + .06 - o.y)/d.y, lx = o.x + d.x*t2 - gp.x, lz = o.z + d.z*t2 - gp.z;
      if (!(t2 > 0) || Math.abs(lx) >= R.hw || Math.abs(lz) >= R.hw) return;
      hit = Math.floor((lz + R.hw)/S1)*N + Math.floor((lx + R.hw)/S1);
      var k = at(false, hit);
      if (k && !sel){                                      // turn a piece; a long piece needs room for its new footprint
        var q = R.placed[k], f0 = FURN.filter(function(f){ return f.id === k; })[0], nr = (q.rot + 1)%4, cs = fits(f0, q.i, nr, k);
        if (!cs && (f0.w || 1) !== (f0.d || 1)){ nr = (q.rot + 2)%4; cs = fits(f0, q.i, nr, k); }
        if (cs){ q.rot = nr; q.cells = cs; setPos(f0, q); E.sfx('click'); path = []; } else note('ここでは回せない');
        return;
      }
      if (sel && count() < ROOM_MAX){                      // the tapped tile becomes the top-left corner; if that does not fit, try the neighbours so the tile is still covered
        var c0 = hit%N, r0 = (hit/N)|0, tries = [[0, 0], [-1, 0], [0, -1], [-1, -1]], done = false;
        for (var ti=0;ti<tries.length && !done;ti++){ var cc = c0 + tries[ti][0], rr = r0 + tries[ti][1]; if (cc < 0 || rr < 0) continue; if (fits(sel, rr*N + cc, 0)){ place(sel, false, rr*N + cc); done = true; } }
        if (done){ sel = null; draw(); } else note('ここには置けない');
        return;
      }
      if (!sel && hit !== myTile()){ var rt = route(hit); if (rt){ path = rt; E.sfx('click'); } else note('そこへは行けない'); }
    }
    function finish(){
      tray.removeEventListener('click', onTray); tap.removeEventListener('pointerdown', onTap); tray.hidden = tap.hidden = $('sc-hint').hidden = true;
      tickers.splice(tickers.indexOf(grow), 1); tickers.splice(tickers.indexOf(walk), 1); path = []; SCH.ix = SCH.iz = 0; SCH.free = false; SCH.speed = 0; P.vx = P.vz = 0; sel = null; marks();
      for (var k in R.placed){ R.placed[k].t = 1; R.placed[k].o.scale.setScalar(1); }
      S.items = FURN.filter(function(f){ return R.placed[f.id]; }).map(function(f){ return f.id; }); E.sfx('click'); P.face = 0; res(S.items);
    }
    tray.addEventListener('click', onTray); tap.addEventListener('pointerdown', onTap); tray.hidden = tap.hidden = $('sc-hint').hidden = false; draw();
  });
}
function sceneRoom(){
  indoor(); var R = buildRoom(), p = R.g.position; R.g.visible = true;
  setP({ x:p.x + (R.home.c - R.mid)*R.S1, z:p.z + (R.home.r - R.mid)*R.S1 }, 0);
  setShot({ x:p.x, y:p.y + .1, z:p.z + .3, yaw:0, pitch:.72, dist:9.2 });
}

/* ---------- the canteen: everyone sits at one table with their own lunch ---------- */
var SEATS = [['H', -1.9], ['P', -.63], ['M', .63], ['T', 1.9]];
function buildCafe(){
  if (CAFE) return CAFE;
  var g = new T.Group(); g.position.set(E.INT.x + 100, E.INT.y, E.INT.z);
  shell(g, 8.4, 5.2, 2.6, 0xf6f1e8);
  for (var r=0;r<5;r++) for (var c=0;c<8;c++) bx(g, 1.01, .06, 1.0, mt((r + c)%2 ? 0xe9dcc6 : 0xf3e8d4), (c - 3.5)*1.05, .03, (r - 2)*1.04);
  prop(g, 'table', 0, 0, .1); prop(g, 'bench', 0, 0, -.72); prop(g, 'wallscreen', -2.2, 1.6, -2.52); prop(g, 'counter', 2.4, 0, -2.2);
  var trays = {}; SEATS.forEach(function(s){ var t = prop(g, 'tray', s[1], .5, .08), d = new T.Group(); d.position.set(-.08, .02, 0); d.scale.setScalar(1.35); t.add(d); trays[s[0]] = d; });
  lamps(g, [[-2.6, 3.6, 2.6, 1.0], [2.6, 3.6, 2.2, .9]]);
  g.visible = false; E.scene.add(g); CAFE = { g:g, trays:trays }; return CAFE;
}
function sceneCafe(){
  indoor(); var C = buildCafe(), p = C.g.position; C.g.visible = true;
  var others = [0, 1, 2, 3].filter(function(i){ return i !== S.food; }), menu = { P:S.food, H:others[0], M:others[1], T:others[2] };
  SEATS.forEach(function(s){
    var d = C.trays[s[0]]; while (d.children.length) d.remove(d.children[0]); prop(d, 'dish' + menu[s[0]]);
    var pos = { x:p.x + s[1], z:p.z - .7 };
    if (s[0] === 'P'){ setP(pos, 0); pose.sit = true; } else { put(NPC[s[0]], pos, 0); NPC[s[0]].sit = true; NPC[s[0]].eat = true; }
  });
  put(NPC.G, { x:p.x - 3.3, z:p.z - 1.1 }, .5);
  setShot({ x:p.x, y:p.y + .52, z:p.z + .15, yaw:0, pitch:.36, dist:5.1 });
  return menu;
}

/* ---------- Earth as the evening star (帰りの会) ---------- */
function showEarth(c, yaw){
  if (!EARTH){
    EARTH = new T.Group(); var o = { depthTest:false, depthWrite:false, fog:false, transparent:true };
    var gl = new T.Mesh(new T.SphereGeometry(7, 16, 12), new T.MeshBasicMaterial(Object.assign({ color:0x9fc8ff, opacity:.16 }, o))); gl.renderOrder = 997; EARTH.add(gl);
    var gl2 = new T.Mesh(new T.SphereGeometry(2.8, 16, 12), new T.MeshBasicMaterial(Object.assign({ color:0xcfe4ff, opacity:.3 }, o))); gl2.renderOrder = 998; EARTH.add(gl2);
    var e = new T.Mesh(new T.SphereGeometry(1.15, 16, 12), new T.MeshBasicMaterial(Object.assign({ color:0xffffff }, o))); e.renderOrder = 999; EARTH.add(e);
    var m = new T.Mesh(new T.SphereGeometry(.55, 10, 8), new T.MeshBasicMaterial(Object.assign({ color:0xdddddd }, o))); m.position.set(-5.2, -2.0, 0); m.renderOrder = 999; EARTH.add(m);
    E.scene.add(EARTH);
  }
  var a = yaw - .42, el = .2, D = 300;                       // up and to the right of the setting sun, well clear of the group
  EARTH.position.set(c.x - Math.sin(a)*Math.cos(el)*D, E.groundAt(c.x, c.z) + Math.sin(el)*D, c.z - Math.cos(a)*Math.cos(el)*D);
  EARTH.visible = true;
}

/* ================= the school day ================= */
var Q = {
  site: { title:'どこに降りる？', q:'', opts:['山の斜面', '平らな場所', '大きな岩があるところ'], ans:1,
    why:['斜面だと、着陸船がかたむいて倒れたり、すべり落ちたりします。', '平らな場所なら、着陸船がまっすぐ安定して立てます。', '大きな岩に脚が乗ると、かたむいたり、こわれたりします。'],
    tip:'探査車パーサヴィアランスは、降下中に自動で危険をよけて着陸しました（NASA）。' },
  storm: { title:'砂嵐が来た！ いつ降りる？', q:'', opts:['今すぐ降りる', '砂嵐が弱まってから降りる', 'エンジンを止めて一気に降りる'], ans:1,
    why:['砂で地面が見えず、岩や斜面をよけられません。', '砂嵐が弱まるまで上空で待つのが安全です。', 'エンジンを止めると激突します。空気がうすく、パラシュートだけでは止まれません。'],
    tip:'星全体をおおう砂嵐は、平均で火星の3年（地球の約5年半）に1回（NASA）。' },
  grow: { title:'どうして早く育つの？', q:'火星の畑の野菜が、早く育つ理由は？', opts:['品種改良をしたから', '土に錆（さび）があるから', '空気が乾燥しているから'], ans:0,
    why:[['せまい場所で早く収穫できるよう、小さく育つ品種をえらび、改良しています。', '光はLED、水と養分は機械で調整します。'],
         '砂が赤いのは錆（酸化鉄）のせい。栄養にならず、有害な成分もあります。',
         '乾燥は植物の大敵。畑では水と湿度を機械で管理しています。'],
    tip:['ISSでも、小さく育つミニトマトやレタスがえらばれています（NASA）。', 'レタスの収穫までは約1か月かかります（NASA）。'] }
};

async function createChar(){
  var p = panel('<h2>火星修学旅行のしおり</h2><div class="sc-body">きみのことを教えてね。</div>' +
    '<div class="sc-make"><div id="sc-prev"></div><div class="sc-form">' +
    '<label>なまえ<input id="sc-name" type="text" maxlength="8" placeholder="なまえ（8文字まで）" autocomplete="off"></label>' +
    '<div class="sc-seg" id="sc-sex"><button type="button" data-v="f">女の子</button><button type="button" data-v="m">男の子</button></div>' +
    '<div class="sc-seg" id="sc-hair"><button type="button" data-v="bob">ボブ</button><button type="button" data-v="pony">ポニーテール</button><button type="button" data-v="short">ショート</button><button type="button" data-v="spiky">ツンツン</button></div>' +
    '<div class="sc-seg" id="sc-hcol">' + HAIRCOLS.map(function(c){ return '<button type="button" data-v="' + c + '"><i style="background:' + c + '"></i></button>'; }).join('') + '</div>' +
    '<div class="sc-row2"><b>宇宙服のライン</b><div class="sc-seg sc-dots" id="sc-line">' + LINES.map(function(c){ return '<button type="button" data-v="' + c + '"><i style="background:' + c + '"></i></button>'; }).join('') + '</div></div>' +
    '<div class="sc-row2"><b>ワッペン</b><div class="sc-seg sc-dots" id="sc-emb">' + E.EMBLEMS.map(function(t, i){ return '<button type="button" data-v="' + i + '"><img src="' + t.userData.url + '" alt=""></button>'; }).join('') + '</div></div>' +
    '</div></div>' + nextBtn('これで出発！'));
  function draw(){
    var m = me(); m.suit = true; m.wide = true; m.emblem = S.emblem; $('sc-prev').innerHTML = face(m);
    [['sc-sex', S.sex], ['sc-hair', S.hair], ['sc-hcol', S.hairCol], ['sc-line', S.line], ['sc-emb', String(S.emblem)]].forEach(function(q){
      Array.prototype.forEach.call($(q[0]).children, function(b){ b.classList.toggle('sel', b.dataset.v === q[1]); });
    });
  }
  [['sc-sex', 'sex'], ['sc-hair', 'hair'], ['sc-hcol', 'hairCol'], ['sc-line', 'line'], ['sc-emb', 'emblem']].forEach(function(q){
    $(q[0]).addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return; S[q[1]] = q[1] === 'emblem' ? +b.dataset.v : b.dataset.v; E.sfx('click');
      if (q[1] === 'sex' && !S.hairTouched) S.hair = S.sex === 'f' ? 'bob' : 'short';
      if (q[1] === 'hair') S.hairTouched = true;
      draw();
    });
  });
  draw();
  await new Promise(function(res){ $('sc-ok').addEventListener('click', function(){ var v = $('sc-name').value.trim(); if (v) S.name = v; E.sfx('click'); closePanel(); res(); }); });
}

async function intro(){
  await createChar();
  buildPeople();
  S.period = '朝の会'; S.sub = ''; hud();
  await talk([
    ['T', 'おはよう、{n}さん！ 今日は「火星中学校」への修学旅行だ。'],
    ['T', '火星の1日は24時間39分。地球とほぼ同じだから、6時間目まであるぞ。'],
    ['H', 'オレはハヤト！ 体育なら負けないぜ。'],
    ['M', 'ミライです。火星のこと、たくさん調べてきました。'],
    ['T', '授業ごとに点数がつく。3人で競争だ！']
  ]);
}
async function p1(){
  lesson('p1');
  await bell('1時間目', '着陸', '火星の上空');
  var got = 0;
  E.setPhase('site'); E.siteMarks(true);
  await say('T', '{n}さん、下の A・B・C のどこに降りるか決めてくれ。');
  if (await quiz(Q.site)){ got += 100; add(100); }
  E.siteMarks(false);
  var storm = new Promise(function(r){ SCH.onStorm = r; }), landed = new Promise(function(r){ SCH.onLanded = r; });
  E.setPhase('approach'); S.sub = '降下中…'; hud();
  await storm;
  await say('M', '先生、下に砂嵐が見えます！');
  if (await quiz(Q.storm)){ got += 100; add(100); }
  credit('p1', 'quiz');
  await talk([
    ['T', '火星では毎年、大陸くらい広い砂嵐が起きて、何週間も続くんだ。'],
    ['M', '何年かに一度は、星全体をおおう砂嵐になるんですよね。'],
    ['T', '空気がうすいから風の力は弱い。でも砂が太陽の光をさえぎる。'],
    ['T', 'ソーラーパネルで電気を作れなくなるのが、一番こわいんだ。']
  ]);
  E.setPhase('wait'); E.setWeatherMode('clear'); S.sub = '砂嵐が弱まるのを待っています…'; hud();
  await landed;
  await cut(function(){ E.stepOut(); E.setPhase('school'); scene('arrive'); S.sub = '着陸'; hud(); });
  await talk([
    ['T', '着陸成功！ 空がうすいオレンジ色なのは、細かい砂がまっているからだ。']
  ]);
  lowG('H', 3);                                        // Hayato floats up while he says it
  await talk([
    ['H', 'うわ、体が軽い！'],
    ['T', '火星では、外に出るときは必ず2人以上で行動するのがきまりだぞ。']
  ]);
  await rank('p1', '1時間目', got, 200);
}
async function p2(){
  lesson('p2');
  await cut(function(){ scene('ground'); });
  await bell('2時間目', '体育', 'グラウンド');
  await say('G', '地球と火星で、ジャンプをくらべるぞ！');
  var a = await play(hurdleRun('地球の重力（シミュレーション）', 9.81, 4, 9, .3, [1.1, 3.6]), 'sport');
  await say('G', '次は本物の火星の重力だ！');
  var b = await play(hurdleRun('火星の重力（地球の約38％）', 3.73, 5, 18, .3, [1.2, 11]), 'sport');
  var hp = Math.round((a.cleared + b.cleared)/(a.n + b.n)*100); add(hp); credit('p2', 'hurdle');
  await cut(function(){ scene('ground'); });
  await info('ハードル走のけっか　+' + hp + '点', '地球：' + a.cleared + ' / ' + a.n + ' 台　　火星：' + b.cleared + ' / ' + b.n + ' 台<br>ジャンプの高さ　地球 <b>' + a.top.toFixed(2) + ' m</b> → 火星 <b>' + b.top.toFixed(2) + ' m</b>',
    '火星の重力は地球の約38％。同じ力でとぶと、高さも空中にいる時間も約2.6倍。');
  await cut(function(){ scene('gym'); S.sub = '体育（トレーニングルーム）'; hud(); });
  await say('G', '重力が弱いと、筋肉と骨が弱くなる。だから毎日トレーニングだ！');
  var bt = mkBeats(5, 18);
  var r = await rhythm({ title:'トレーニング：スクワット', bpm:96, beats:bt, color:'#d9534f', glyph:'●', genre:'rock',
    rivals:rivalsFor('p2', 'train', bt.length), onRival:function(k, v){ if (v) NPC[k].squat = 1; },
    onHit:function(){ pose.squat = 1; cheer(); } });
  var tp = Math.round(r*100); add(tp); credit('p2', 'train');
  await info('トレーニングのけっか　+' + tp + '点', '', '国際宇宙ステーション（ISS）では、毎日約2時間の運動をします（NASA）。');
  await rank('p2', '2時間目', hp + tp, 200);
}
async function p3(){
  lesson('p3');
  await cut(function(){ scene('solar'); });
  await bell('3時間目', '技術', '発電所');
  await talk([
    ['G', '基地の電気は、このソーラーパネルで作っています。'],
    ['G', 'でも火星にとどく太陽の光は、地球の約43％。大事に使います。']
  ]);
  var w = await play(wires(), 'quiz');
  var wp = w.helped ? 30 : Math.round(clamp(100 - Math.max(0, w.sec - 20)*1.5, 40, 100)); add(wp);
  E.M_SOLAR_FIELD.color.setHex(0x1a3470); E.M_SOLAR_FIELD.roughness = .25; E.M_SOLAR_FIELD.metalness = .7;
  var c = E.COMMS_POS, c2 = W(-18, -18); setShot({ x:c.x, y:E.groundAt(c.x, c.z)+2.4, z:c.z, yaw:Math.atan2(c2.x - c.x, c2.z - c.z), pitch:.22, dist:12, ease:true });
  await say('G', 'つながった！（' + Math.round(w.sec) + '秒　+' + wp + '点）');
  S.msg = await pick('地球にメッセージを送ろう', '家族に、火星の感想を送ります。', MSGS.map(function(m){ return { name:m }; }));
  E.sfx('door'); add(50);
  await talk([
    ['G', '送信しました！ 光の速さの電波でも、地球まで片道3〜22分かかります。'],
    ['T', '返事は、給食のころにとどくかもしれないな。']
  ]);
  await rank('p3', '3時間目', wp + 50, 150);
}
async function p4(){
  lesson('p4');
  await cut(function(){ scene('farm'); E.lettuce.forEach(function(m){ m.visible = false; }); E.tomato.forEach(function(m){ m.visible = true; m.scale.setScalar(1); });
    E.lettuce.slice(7).forEach(function(m){ m.visible = true; m.scale.setScalar(1); }); });
  await bell('4時間目', '家庭科', '地下の畑');
  await talk([
    ['G', '外は寒くて空気もうすいので、野菜は基地の中で育てます。'],
    ['G', '種も水も、地球から運んだ大切なものです。']
  ]);
  var gr = await play(gauge([{ name:'レタスの種をまく', target:62, band:5, sec:2.4 }, { name:'水をあげる', target:48, band:4, sec:1.9 }, { name:'養分をまぜる', target:74, band:4, sec:1.5 }]));
  var gp = Math.round(gr*100); add(gp);
  E.lettuce.slice(0, 7).forEach(function(m){ m.visible = true; m.scale.setScalar(.14); }); allHop();
  await say('G', '上手にまけました！（+' + gp + '点）芽が出るまで数日、食べられるのは約1か月後です。');
  await cut(function(){ scene('life'); S.sub = '家庭科（生活棟）'; hud(); });
  await say('G', '次は火星の「衣・食・住」です。');
  S.cloth = await pick('衣：基地で着る服', 'ISSには洗濯機がなく、服は何日か着たら取りかえます。', CLOTHES, function(i){ S.cloth = i; mySuit(false); });
  mySuit(false);
  S.food = await pick('食：今日の給食', '宇宙食はレトルトやフリーズドライが中心。軽くて長持ちします。', FOODS);
  await cut(function(){ sceneRoom(); S.sub = '家庭科（個室）'; hud(); });
  await talk([
    ['G', 'さいごは「住」。ISSの個室は、電話ボックスくらいしかありません（NASA）。'],
    ['G', '持ってこられる荷物は少しだけ。家具は4こまでです。']
  ]);
  await play(roomGame(), 'room');
  add(50);
  await say('G', S.items.indexOf('window') >= 0 ? 'いい部屋ですね！ その窓から、夕方には地球が見えますよ。' : 'いい部屋ですね！');
  await rank('p4', '4時間目', gp + 50, 150);
}
async function lunch(){
  var menu = null;
  await cut(function(){ menu = sceneCafe(); S.period = '給食'; S.sub = '宇宙食'; hud(); });
  await bell('給食', '宇宙食', '食堂');
  var f = FOODS[S.food]; pose.eat = true;
  await talk([
    ['T', 'いただきます！ {n}さんの給食は「' + f.name + '」だな。'],
    ['H', 'オレは「' + FOODS[menu.H].name + '」！ ミライは「' + FOODS[menu.M].name + '」か。'],
    ['G', '水はとても貴重。使った水もきれいにして、くり返し使います。'],
    ['M', 'ISSでは、水の約98％をリサイクルしているそうです（NASA・2023年）。'],
    ['T', 'おっ、地球から返事がとどいたぞ！'],
    ['T', '「メッセージありがとう。' + (S.msg === 1 ? 'ジャンプ、見てみたいな。' : S.msg === 2 ? 'あたたかくしてね。' : 'オレンジ色の空、すてきだね。') + '気をつけてね。家族より」']
  ]);
  E.sfx('ok'); pose.eat = false; E.player.setMouth(false);
}
async function p5(){
  lesson('p5');
  await cut(function(){ scene('music'); });
  await bell('5時間目', '総合', '音楽室');
  await say('T', '外は危険だから、ほとんど基地の中ですごす。楽しみを見つけるのも大事な仕事だ。');
  var keys = Object.keys(TUNES), gi = await pick('CDをえらぼう', '', keys.map(function(k){ return { name:TUNES[k].name }; }));
  var bt = mkBeats(8, 30);
  var r = await rhythm({ title:'ダンス：' + TUNES[keys[gi]].name, bpm:112, beats:bt, color:'#b07fd9', glyph:'♪', genre:keys[gi],
    rivals:rivalsFor('p5', 'dance', bt.length),
    onRival:function(k, v, i){ var c = NPC[k]; if (!v) return; c.hop = 1; if (i%4 === 3) c.spin = 1; else if (c.spin){ c.spin = 0; c.root.rotation.y = c.face; } },
    onHit:function(i){ pose.hop = 1; pose.spin = i%4 === 3 ? 1 : 0; cheer(); } });
  var dp = Math.round(r*100); add(dp); credit('p5', 'dance');
  await say('H', (dp >= 50 ? 'いいリズム！' : 'ドンマイ！') + '（+' + dp + '点）次はオレの得意なやつだ！');
  await cut(function(){
    raceCleanup(); outdoor(.62); var s = W(RACE_L[0][0], RACE_L[0][1]), a = Math.atan2(W(1, 0).x - W(0, 0).x, W(1, 0).z - W(0, 0).z);   // a: world heading of the course
    put(NPC.T, W(-9.5, 49.5), a); put(NPC.H, W(-11.5, 51.5), a); put(NPC.M, W(-8.5, 52.5), a);
    setP(W(-8, 48.2), a); setShot({ x:s.x, y:E.groundAt(s.x, s.z)+1.5, z:s.z, yaw:a, pitch:.24, dist:15 });
    E.R.x = s.x; E.R.z = s.z; E.R.heading = a; E.rover.position.set(s.x, E.groundAt(s.x, s.z), s.z); E.rover.rotation.set(0, a, 0);
    S.sub = '総合（ローバーレース）'; hud();
  });
  await talk([
    ['T', 'ローバーは最高でも時速10km。重力が弱く、タイヤがすべりやすいぞ。'],
    ['T', '砂地は近道だけど、おそくなる。よけるか、つっこむかはきみしだい！']
  ]);
  var rc = await play(race(), 'sport');
  var rp = RACE_PTS[rc.place - 1]; add(rp);
  var oH = rc.order.findIndex(function(o){ return o.k === 'H'; }), oM = rc.order.findIndex(function(o){ return o.k === 'M'; });
  plan('p5').ha.race = RACE_PTS[oH]; plan('p5').mi.race = RACE_PTS[oM]; credit('p5', 'race');
  await cut(function(){
    outdoor(.62); var f = RACE_L[RACE_L.length-1], a = Math.atan2(W(1, 0).x - W(0, 0).x, W(1, 0).z - W(0, 0).z), c = W(f[0] + 21, f[1]);
    setP(W(f[0] + 22, f[1]), a); put(NPC.T, W(f[0] + 20.5, f[1] + 3.2), a); put(NPC.H, W(f[0] + 21, f[1] - 2.8), a); put(NPC.M, W(f[0] + 20, f[1] - 5), a);
    setShot({ x:c.x, y:E.groundAt(c.x, c.z)+1.2, z:c.z, yaw:a, pitch:.16, dist:10 }); S.sub = '総合'; hud();
  });
  var nm = { P:esc(S.name), H:'ハヤト', M:'ミライ' };
  await info('ローバーレースのけっか　' + rc.place + '位　+' + rp + '点',
    rc.order.map(function(o, i){ return (i+1) + '位 ' + (o.k === 'P' ? '<b>' + nm[o.k] + '</b>' : nm[o.k]) + '：' + (o.t > 900 ? 'ゴールできず' : o.t.toFixed(1) + '秒'); }).join('　') +
    (rc.pen ? '<br>（ゲートを外したぶん +' + rc.pen + '秒）' : ''),
    '探査車スピリットは2009年、砂にはまり動けなくなりました（NASA/JPL）。');
  await rank('p5', '5時間目', dp + rp, 200);
}
async function p6(){
  lesson('p6');
  await cut(function(){ raceCleanup(); scene('farm'); S.sub = '家庭科（収穫）'; hud();
    E.tomato.concat(E.lettuce.slice(7)).forEach(function(m){ m.visible = true; m.scale.setScalar(1); }); });
  await bell('6時間目', '家庭科', '地下の畑');
  await talk([
    ['G', 'おかえりなさい。さいごは収穫です。'],
    ['H', 'えっ、朝まいた種がもう育ったの！？'],
    ['G', 'いいえ。朝の種は、まだ芽も出ていません（手前の小さな苗です）。'],
    ['G', '収穫するのは、前から育ててきた野菜ですよ。']
  ]);
  setShot({ x:E.INT.x, y:E.INT.y - 5 + .8, z:E.INT.z - 14.6, yaw:0, pitch:.62, dist:11.5, ease:true });
  var crops = E.tomato.concat(E.lettuce.slice(7)), bt = mkBeats(5, crops.length);
  var r = await rhythm({ title:'収穫：リズムよくとろう', bpm:100, beats:bt, color:'#4caf6a', glyph:'★', genre:'pop',
    rivals:rivalsFor('p6', 'harvest', bt.length), onRival:function(k, v){ if (v) NPC[k].pick = 1; },
    onHit:function(i){ var m = crops[i % crops.length]; if (m){ m.visible = false; var wp = new T.Vector3(); m.getWorldPosition(wp); E.puff(wp.x, wp.y, wp.z, .3, .8); } pose.hop = 1; pose.spin = 0; } });
  var hp = Math.round(r*100); add(hp); credit('p6', 'harvest');
  await say('G', 'たくさんとれました！（+' + hp + '点）ではさいごに問題です。');
  var qp = 0; if (await quiz(Q.grow)){ qp = 100; add(100); }
  await rank('p6', '6時間目', hp + qp, 200);
}
/* ---------- けっか発表: drum roll, 3位 → 2位 → 1位 one by one, then confetti and the player's place in big letters ---------- */
function drum(sec){                                         // a snare roll that speeds up, ending on a cymbal-like hit
  if (!E.SFX.ready) return;
  for (var t = 0, gap = .11; t < sec; t += gap, gap = Math.max(.035, gap*.93)) E.sfxNoise(.05, 'bandpass', 1900, .16 + .2*t/sec, t);
  E.sfxNoise(.7, 'highpass', 5200, .4, sec); E.sfxTone(98, .5, 'sine', .4, sec, 55);
}
function confetti(box, n){
  var cols = ['#ff8a1e', '#ffd23c', '#2fb5a8', '#e86a9a', '#3f7fd9', '#7ac74f', '#ffffff'], h = '';
  for (var i=0;i<n;i++) h += '<i style="left:' + (Math.random()*100).toFixed(1) + '%;background:' + cols[i%cols.length] + ';animation-delay:' + (Math.random()*.9).toFixed(2) + 's;animation-duration:' +
    (2.2 + Math.random()*1.8).toFixed(2) + 's;--dx:' + ((Math.random() - .5)*160).toFixed(0) + 'px;--rot:' + (360 + Math.random()*720).toFixed(0) + 'deg;width:' + (8 + Math.random()*8).toFixed(0) + 'px;height:' + (10 + Math.random()*10).toFixed(0) + 'px"></i>';
  var c = document.createElement('div'); c.className = 'sc-conf'; c.innerHTML = h; box.appendChild(c);
}
async function finale(rows, my){
  var box = $('sc-fin'), was = mood('talk');
  box.innerHTML = '<div class="sc-fbg"></div><div class="sc-fin-in"><div class="sc-ftitle">けっか発表</div><div class="sc-fpod">' +
    [1, 0, 2].map(function(i){ var r = rows[i];                    // podium order on screen: 2位 ・ 1位 ・ 3位
      return '<div class="sc-fcard p' + (i + 1) + (r.me ? ' me' : '') + '" data-i="' + i + '"><div class="sc-fmedal">' + (i + 1) + '<small>位</small></div><div class="sc-fava">' + face(who(r.k)) + '</div>' +
        '<div class="sc-fname">' + esc(r.n) + '</div><div class="sc-fpts"><b data-to="' + r.t + '">0</b> 点</div><div class="sc-fstand"></div></div>'; }).join('') +
    '</div><div class="sc-ffoot"><div class="sc-fyou" hidden></div><button type="button" class="sc-go" id="sc-fok" hidden>通知表を見る</button></div></div>';
  box.hidden = false; duck(true);
  var card = function(i){ return box.querySelector('.sc-fcard[data-i="' + i + '"]'); };
  var countUp = function(el){ var to = +el.dataset.to, t0 = performance.now(); (function f(){ var u = Math.min(1, (performance.now() - t0)/900); el.textContent = Math.round(to*(1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(f); })(); };
  var reveal = async function(i, roll){
    drum(roll); await sleep(roll*1000);
    var c = card(i); c.classList.add('on'); countUp(c.querySelector('b'));
    if (i === 0){ E.sfx('fanfare'); [1047, 1319, 1568, 2093].forEach(function(f, n){ E.sfxTone(f, .5, 'triangle', .18, .45 + n*.12); }); confetti(box, 90); emote(rows[0].k, 'joy'); allHop(); if (rows[0].me) pose.hop = 1; }
    else { E.sfx('ok'); emote(rows[i].k, i === 2 ? 'nod' : 'joy'); }
  };
  await sleep(700);
  await reveal(2, 1.1); await sleep(900);
  await reveal(1, 1.3); await sleep(1000);
  await reveal(0, 2.2); await sleep(1300);
  var you = box.querySelector('.sc-fyou');
  you.innerHTML = (my === 1 ? '<b>' + esc(S.name) + 'さんが 1位！</b><span>最優秀賞　おめでとう！</span>' : my === 2 ? '<b>' + esc(S.name) + 'さんは 2位！</b><span>1位まで あと ' + (rows[0].t - S.pts.me) + ' 点</span>'
    : '<b>' + esc(S.name) + 'さんは 3位</b><span>2位まで あと ' + (rows[1].t - S.pts.me) + ' 点。次はぬかそう！</span>');
  you.hidden = false; you.className = 'sc-fyou p' + my; if (my === 1){ confetti(box, 60); E.sfx('coin'); } else E.sfx('pop');
  await sleep(900);
  var ok = $('sc-fok'); ok.hidden = false;
  await new Promise(function(res){ ok.addEventListener('click', function(){ E.sfx('click'); res(); }); });
  box.hidden = true; box.innerHTML = ''; duck(false); mood(was);
}
async function closing(){
  await cut(function(){ scene('sunset'); });
  await bell('帰りの会', '', '基地の前');
  await talk([
    ['T', '火星の夕焼けは青いんだ。昼はオレンジ色なのに、ふしぎだろう？'],
    ['M', '空の細かい砂が、青い光だけを太陽のまわりに集めるから…ですよね。'],
    ['T', 'その通り。右上の明るい星が地球だ。となりの小さな点は月だよ。']
  ].concat(S.items.indexOf('window') >= 0 ? [['T', '{n}さんの部屋の窓からも、あの光が見えるぞ。']] : []));
  var rows = [ { k:'P', n:S.name, t:S.pts.me, me:true }, { k:'H', n:'ハヤト', t:S.pts.ha }, { k:'M', n:'ミライ', t:S.pts.mi } ].sort(function(a, b){ return b.t - a.t; });
  var my = rows.findIndex(function(r){ return r.me; }) + 1;
  await finale(rows, my);
  E.sfx('fanfare'); allHop(); pose.hop = 1;
  panel('<h2>火星修学旅行　通知表</h2><div class="sc-final"><div class="sc-rank">' + rows.map(function(r, i){
      return '<div class="sc-row' + (r.me ? ' me' : '') + '"><span class="sc-no">' + (i+1) + '位</span><span class="sc-rava">' + face(who(r.k)) + '</span><span class="sc-rn">' + esc(r.n) + '</span><span class="sc-rt">' + r.t + '点</span></div>';
    }).join('') + '</div><table class="sc-tbl"><tr><th>授業</th><th>' + esc(S.name) + '</th><th>満点</th></tr>' +
    S.log.map(function(l){ return '<tr><td>' + l.label + '</td><td>' + l.me + '</td><td>' + l.max + '</td></tr>'; }).join('') +
    '<tr class="sum"><td>合計</td><td>' + S.pts.me + '</td><td>1100</td></tr></table></div>' +
    '<div class="sc-body">' + (my === 1 ? '<b>最優秀賞！</b> 火星中学校でいちばんの成績です。' : my === 2 ? '<b>優秀賞！</b> あと少しで1位でした。' : '<b>がんばったで賞！</b> さいごまでやりとげました。') +
    '<br>服：' + CLOTHES[S.cloth].name + '　給食：' + FOODS[S.food].name + '　個室：' + (S.items.length ? FURN.filter(function(f){ return S.items.indexOf(f.id) >= 0; }).map(function(f){ return f.name; }).join('・') : 'なし') + '</div>' + nextBtn());
  await waitOk();
  await talk([
    ['T', '体は軽いけど筋肉は弱る。電気も水も食べ物も、自分たちで作って大事に使う。'],
    ['T', '仲間と楽しむ時間も大切だ。いつか火星へ行く日が来たら、今日を思い出してくれ。']
  ]);
  panel('<h2>おしまい</h2><div class="sc-body">ようこそ、火星中学校へ。<br>また遊びに来てね！</div><div class="sc-end2"><button type="button" class="sc-go" id="sc-again">もう一度あそぶ</button></div>');
  $('sc-again').addEventListener('click', function(){ location.reload(); });
}

var PERIODS = [p1, p2, p3, p4, lunch, p5, p6, closing];
async function start(skipTo){
  $('titlecard').hidden = true; SCH.on = true; document.body.classList.add('school'); root.hidden = false; hud(); E.bgmInit();
  if (skipTo){                                        // debug: #p2 … #p8 jumps straight to that part with a default character
    E.freeRoam(); buildPeople(); E.setPhase('school'); G.freeze = true;
    if (skipTo > 4){ S.pts.me = 420; S.pts.ha = 400; S.pts.mi = 450; }
    for (var i=skipTo-1;i<PERIODS.length;i++) await PERIODS[i]();
    return;
  }
  await intro();
  for (var j=0;j<PERIODS.length;j++) await PERIODS[j]();
}
window.__sch = { E:E, S:S, W:W, RACE_L:RACE_L, sceneRoom:sceneRoom, roomGame:roomGame, sceneCafe:sceneCafe, scene:scene, pose:pose, room:function(){ return ROOM; },
  PLAN:PLAN, NPC:NPC, autoRhythm:0, MOOD:MOOD, mood:mood };
window.MARS_SCHOOL_START = function(){ start(0).catch(function(e){ console.error(e); }); };
/* debug: on the title screen, Shift+2 … Shift+8 jumps to that part */
window.addEventListener('keydown', function(e){ var d = /^Digit([2-8])$/.exec(e.code); if (d && e.shiftKey && !SCH.on && !$('titlecard').hidden) start(+d[1]).catch(function(x){ console.error(x); }); });
var m = /#p(\d)/.exec(location.hash);
if (m) setTimeout(function(){ start(+m[1]).catch(function(e){ console.error(e); }); }, 300);
};
