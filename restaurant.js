// Restaurant: the guests at the tables order stew. The chef takes a lettuce from the
// shelf in the kitchen, cooks them in the stock pot on the range, fills a bowl, carries
// it to the guest and serves it; the guest eats, pays and tips for quick service. A
// guest who waits too long gives up.
//
// Everything the rules know is in `state`, and every change to it goes through act():
// what is drawn (bubbles, bowls, steam, the money counter) only follows the state. That
// keeps the door open for playing together later, where the actions travel between players.
//
// Used from index.html:
//   restaurant = HotPotRestaurant.build({ scene, camera, gameplay, getChef, getKitchen, getGuests })
//   restaurant.update(delta)   // every frame
(function(){
  'use strict';
  var T = THREE;

  var RULES = {
    firstOrder: 6,            // seconds until the first guest orders
    orderEvery: [14, 26],     // seconds between new orders
    maxOpen: 3,               // at most this many guests waiting at once
    patience: 90,             // seconds a guest waits for the food
    rest: 30,                 // seconds until a guest who has eaten (or given up) may order again
    cookTime: 10,             // seconds the pot needs
    portions: 4,              // bowls in one pot
    eatTime: 14,              // seconds a guest eats
    price: 12, tip: 6,        // the tip shrinks with the waiting time
    reach: 2.1,               // how close the chef has to be to the pot or the shelf
    serveReach: 2.7           // ... and to a guest's chair (far enough to serve across the table from the aisle)
  };

  function clamp(v, a, b){ return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
  function rnd(a, b){ return a + (b - a) * Math.random(); }

  function build(ctx){
    var scene = ctx.scene, play = ctx.gameplay;
    var root = new T.Group(); root.name = 'restaurant'; scene.add(root);
    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };

    // ---------- the state and the actions that change it ---------------------------------
    var state = {
      money: 0, served: 0, lost: 0,
      carry: null,                                  // what the chef carries: null | 'lettuce' | 'stew'
      pot: { phase: 'empty', t: 0, portions: 0 },   // 'empty' | 'cooking' | 'ready'
      guests: [],                                   // { id, phase, t, patience, pay }; phase: 'idle' | 'waiting' | 'eating' | 'paid' | 'angry'
      nextOrder: RULES.firstOrder
    };
    function guest(id){ for (var i = 0; i < state.guests.length; i++) if (state.guests[i].id === id) return state.guests[i]; return null; }
    function act(type, arg){
      var pot = state.pot, g;
      switch (type){
        case 'takeLettuce':   if (state.carry) return false; state.carry = 'lettuce'; return true;
        case 'returnLettuce': if (state.carry !== 'lettuce') return false; state.carry = null; return true;
        case 'fillPot':    if (state.carry !== 'lettuce' || pot.phase !== 'empty') return false;
                           state.carry = null; pot.phase = 'cooking'; pot.t = 0; return true;
        case 'takeStew':   if (state.carry || pot.phase !== 'ready') return false;
                           state.carry = 'stew'; if (--pot.portions <= 0){ pot.portions = 0; pot.phase = 'empty'; } return true;
        case 'returnStew': if (state.carry !== 'stew' || pot.phase === 'cooking' || pot.portions >= RULES.portions) return false;
                           state.carry = null; pot.portions++; pot.phase = 'ready'; return true;
        case 'order':      g = guest(arg); if (!g || g.phase !== 'idle') return false;
                           g.phase = 'waiting'; g.patience = 1; return true;
        case 'serve':      g = guest(arg); if (!g || g.phase !== 'waiting' || state.carry !== 'stew') return false;
                           state.carry = null; g.phase = 'eating'; g.t = 0;
                           g.pay = RULES.price + Math.round(RULES.tip * g.patience); return true;
      }
      return false;
    }
    // what happens by itself as time passes
    function tick(dt){
      var pot = state.pot;
      if (pot.phase === 'cooking'){ pot.t += dt; if (pot.t >= RULES.cookTime){ pot.phase = 'ready'; pot.portions = RULES.portions; } }
      var open = 0, idle = [];
      state.guests.forEach(function(g){
        if (g.phase === 'waiting'){
          open++;
          g.patience -= dt / RULES.patience;
          if (g.patience <= 0){ g.phase = 'angry'; g.t = 0; state.lost++; }
        } else if (g.phase === 'eating'){
          g.t += dt;
          if (g.t >= RULES.eatTime){ g.phase = 'paid'; g.t = 0; state.money += g.pay; state.served++; }
        } else if (g.phase === 'paid' || g.phase === 'angry'){
          g.t += dt;
          if (g.t >= 3){ g.phase = 'idle'; g.rest = RULES.rest; }
        } else {
          g.rest = Math.max(0, (g.rest || 0) - dt);
          if (g.rest <= 0) idle.push(g);
        }
      });
      if (!state.guests.length || !kitchenReady()) return;
      state.nextOrder -= dt;
      if (state.nextOrder <= 0){
        if (idle.length && open < RULES.maxOpen) act('order', idle[Math.floor(Math.random() * idle.length)].id);
        state.nextOrder = rnd(RULES.orderEvery[0], RULES.orderEvery[1]);
      }
    }

    // ---------- money counter and what the chef carries, on screen ------------------------
    var css = document.createElement('style');
    css.textContent =
      '.hp-money{position:fixed;right:22px;top:18px;display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;' +
      'background:rgba(15,12,10,.42);color:rgba(255,255,255,.92);font:600 17px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;' +
      'pointer-events:none;user-select:none;backdrop-filter:blur(2px);transition:transform .25s ease}' +
      '.hp-money.bump{transform:scale(1.14)}' +
      '.hp-coin{width:15px;height:15px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe48a,#d79a1e);box-shadow:inset 0 0 0 1.5px rgba(120,70,0,.45)}' +
      '.hp-carry{position:fixed;left:50%;bottom:15.5%;transform:translateX(-50%);padding:4px 11px;border-radius:999px;background:rgba(15,12,10,.3);' +
      'color:rgba(255,255,255,.75);font:500 12.5px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.2px;opacity:0;transition:opacity .2s;pointer-events:none;user-select:none}' +
      '.hp-carry.on{opacity:1}';
    document.head.appendChild(css);
    var moneyEl = document.createElement('div'); moneyEl.className = 'hp-money';
    moneyEl.innerHTML = '<span class="hp-coin"></span><span class="hp-amount">$0</span>'; document.body.appendChild(moneyEl);
    var amountEl = moneyEl.querySelector('.hp-amount');
    var carryEl = document.createElement('div'); carryEl.className = 'hp-carry'; document.body.appendChild(carryEl);
    var shown = { money: 0, carry: null };

    // ---------- the things that are carried and served (Meshy models) ----------------------
    var gltf = new T.GLTFLoader();
    if (window.MeshoptDecoder) gltf.setMeshoptDecoder(MeshoptDecoder);
    // width: its size in the game; carry: how the chef holds it (see gameplay.js)
    var ITEMS = {
      stew:    { file: 'models/d_stew_bowl.glb', width: 0.4, label: 'a bowl of stew',
                 carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
      lettuce: { file: 'models/d_lettuce.glb', width: 0.34, label: 'a lettuce',
                 carry: { half: 0.165, fwd: 0.46, drop: -0.27, grip: 0.1, back: 0, curl: 0.35 } }
    };
    Object.keys(ITEMS).forEach(function(key){
      var it = ITEMS[key];
      fetch(it.file).then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(buf){ gltf.parse(buf, '', function(g){
          var obj = g.scene; obj.updateMatrixWorld(true);
          var bb = new T.Box3().setFromObject(obj), s = bb.getSize(V()), c = bb.getCenter(V());
          var k = it.width / Math.max(s.x, s.z);
          obj.position.x -= c.x; obj.position.y -= bb.min.y; obj.position.z -= c.z;   // standing on the origin
          obj.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
          var sized = new T.Group(); sized.add(obj); sized.scale.setScalar(k);
          var holder = new T.Group(); holder.add(sized);
          it.height = s.y * k;
          it.obj = holder;
        }, function(e){ console.error('Could not load ' + it.file + ':', e); }); })
        .catch(function(e){ console.error('Could not load ' + it.file + ':', e); });
    });
    function instance(key){ return ITEMS[key].obj ? ITEMS[key].obj.clone(true) : new T.Group(); }

    // ---------- signs above heads and above the pot --------------------------------------------
    // small pictures drawn on a canvas, always facing the camera
    function sign(size){
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(size, size, 1); sp.visible = false; sp.renderOrder = 6; root.add(sp);
      return { sp: sp, g: cv.getContext('2d'), tex: tex, drawn: '' };
    }
    function bubbleShape(g, fill){
      g.clearRect(0, 0, 128, 128);
      g.beginPath();
      var x = 10, y = 6, w = 108, h = 96, r = 26;
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.lineTo(74, y + h); g.lineTo(64, 124); g.lineTo(54, y + h);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      g.fillStyle = fill; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,28,20,.55)'; g.stroke();
    }
    function bowlIcon(g, cx, cy, s){
      g.fillStyle = '#c8742c'; g.beginPath(); g.ellipse(cx, cy - 4 * s, 27 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();          // the stew
      g.fillStyle = '#7a4a2a'; g.beginPath(); g.moveTo(cx - 30 * s, cy - 3 * s);                                             // the bowl
      g.bezierCurveTo(cx - 28 * s, cy + 26 * s, cx + 28 * s, cy + 26 * s, cx + 30 * s, cy - 3 * s);
      g.bezierCurveTo(cx + 14 * s, cy + 5 * s, cx - 14 * s, cy + 5 * s, cx - 30 * s, cy - 3 * s); g.fill();
      g.strokeStyle = 'rgba(90,70,60,.75)'; g.lineWidth = 3 * s; g.lineCap = 'round';                                       // steam
      [-11, 0, 11].forEach(function(dx){
        g.beginPath(); g.moveTo(cx + dx * s, cy - 15 * s);
        g.bezierCurveTo(cx + (dx - 6) * s, cy - 22 * s, cx + (dx + 6) * s, cy - 27 * s, cx + dx * s, cy - 34 * s); g.stroke();
      });
    }
    // a guest's order: a bowl of stew and a bar that runs out with the guest's patience
    function drawOrder(s, patience){
      var key = 'o' + Math.round(patience * 40);
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; bubbleShape(g, 'rgba(255,252,244,.96)'); bowlIcon(g, 64, 50, 1);
      g.fillStyle = 'rgba(60,45,35,.18)'; g.fillRect(28, 80, 72, 9);
      g.fillStyle = patience > 0.5 ? '#5aa046' : patience > 0.25 ? '#d9a21f' : '#cf4a32';
      g.fillRect(28, 80, 72 * clamp(patience), 9);
      s.tex.needsUpdate = true;
    }
    function drawAngry(s){
      if (s.drawn === 'angry') return; s.drawn = 'angry';
      var g = s.g; bubbleShape(g, 'rgba(255,236,230,.96)');
      g.strokeStyle = '#c63a28'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(40, 30); g.lineTo(88, 78); g.moveTo(88, 30); g.lineTo(40, 78); g.stroke();
      s.tex.needsUpdate = true;
    }
    // eating: the bowl in a ring that closes as the guest finishes
    function drawEating(s, done){
      var key = 'e' + Math.round(done * 40);
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; g.clearRect(0, 0, 128, 128);
      g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fillStyle = 'rgba(255,252,244,.9)'; g.fill();
      g.lineWidth = 9; g.strokeStyle = 'rgba(60,45,35,.15)'; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#5aa046'; g.lineCap = 'round';
      g.beginPath(); g.arc(64, 64, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(done)); g.stroke();
      bowlIcon(g, 64, 72, 0.7);
      s.tex.needsUpdate = true;
    }
    // the pot: a ring filling up while it cooks, then a bowl with the portions left
    function drawPot(s, pot){
      var key = pot.phase === 'cooking' ? 'c' + Math.round(pot.t / RULES.cookTime * 40) : 'r' + pot.portions;
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; g.clearRect(0, 0, 128, 128);
      g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fillStyle = 'rgba(255,252,244,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,28,20,.5)'; g.stroke();
      if (pot.phase === 'cooking'){
        g.lineWidth = 12; g.strokeStyle = 'rgba(60,45,35,.16)'; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#d9862a'; g.lineCap = 'round';
        g.beginPath(); g.arc(64, 64, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(pot.t / RULES.cookTime)); g.stroke();
        bowlIcon(g, 64, 70, 0.62);
      } else {
        bowlIcon(g, 52, 70, 0.9);
        g.fillStyle = '#3a2a20'; g.font = '700 30px system-ui,"Segoe UI",sans-serif'; g.textAlign = 'center';
        g.fillText('×' + pot.portions, 98, 62);
      }
      s.tex.needsUpdate = true;
    }
    // "+$14" floating up from a table
    var pops = [];
    function popMoney(pos, amount){
      var s = sign(0.8), g = s.g;
      g.clearRect(0, 0, 128, 128);
      g.font = '800 44px system-ui,"Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(30,22,10,.85)'; g.strokeText('+$' + amount, 64, 64);
      g.fillStyle = '#ffd95a'; g.fillText('+$' + amount, 64, 64);
      s.tex.needsUpdate = true; s.sp.visible = true; s.sp.position.copy(pos);
      pops.push({ s: s, t: 0, y: pos.y });
    }

    // steam over the pot: soft puffs that rise and fade
    var puffTex = (function(){
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(225,222,218,.5)'); gr.addColorStop(0.7, 'rgba(150,146,142,.2)'); gr.addColorStop(1, 'rgba(140,136,132,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(cv);
    })();
    var puffs = [];
    for (var i = 0; i < 8; i++){
      var p = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
      p.visible = false; root.add(p); puffs.push({ sp: p, t: i / 8, dx: rnd(-1, 1), dz: rnd(-1, 1) });
    }
    var potSign = sign(0.36);

    // ---------- where things are -----------------------------------------------------------
    function kitchenReady(){ var k = ctx.getKitchen(); return !!(k && k.pot && k.vegShelf); }
    // The stock pot model is a big pot with a small one beside it: the big pot's middle
    // lies off the model's centre (measured on the model, as shares of its width).
    var POT_OFF = [-0.21, -0.16], potAt = null;
    function potPlace(){
      var k = ctx.getKitchen();
      if (!potAt && kitchenReady()){
        var w = k.potSize ? k.potSize.x : 0.8;
        potAt = V(POT_OFF[0] * w, 0, POT_OFF[1] * w).applyAxisAngle(V(0, 1, 0), k.pot.rotation.y).add(k.pot.position);
        potAt.y = k.pot.position.y + (k.potSize ? k.potSize.y : 0.45);   // its rim
      }
      return potAt;
    }
    var views = {};   // per guest: { info, sign, bowl, bowlAt }
    function view(info){
      var v = views[info.id];
      if (!v){
        var sp = info.spot, t = sp.table, toTable = sp.z < t.z ? 1 : -1;
        v = views[info.id] = { info: info, sign: sign(0.62), bowl: null, toTable: toTable,
          bowlAt: V(sp.x, t.top, t.z - toTable * (t.halfZ - 0.34)) };   // (set again when the bowl is served)
        state.guests.push({ id: info.id, phase: 'idle', t: 0, patience: 0, pay: 0, rest: rnd(0, 12) });
      }
      return v;
    }
    var headPos = V();
    // The bowl goes on the table in front of the guest where it is clear of the hands
    // lying there: between them if they are far enough apart, else just beyond them.
    function placeBowl(v){
      var sp = v.info.spot, t = sp.table, R = ITEMS.stew.width / 2;
      var segs = (v.info.hands || []).map(function(h){
        if (!h) return null;
        var a = V(); h.getWorldPosition(a);
        var b = a.clone(), kid = h.children[0];
        if (kid){ kid.getWorldPosition(b); b.sub(a).setY(0); if (b.lengthSq() > 1e-6) b.setLength(0.2); b.add(a); }
        return [a, b];
      }).filter(Boolean);
      var best = null, p = V();
      for (var d = 0.2; d <= t.halfZ - R + 0.001; d += 0.03){
        for (var side = -0.18; side <= 0.181; side += 0.06){
          p.set(sp.x + side, 0, t.z - v.toTable * (t.halfZ - d));
          var clear = 0.3;
          segs.forEach(function(sg){   // distance from the bowl's middle to the hand (wrist to fingertips)
            var ab = V(sg[1].x - sg[0].x, 0, sg[1].z - sg[0].z), ap = V(p.x - sg[0].x, 0, p.z - sg[0].z);
            var u = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-6, ab.lengthSq())));
            clear = Math.min(clear, ap.addScaledVector(ab, -u).length());
          });
          var score = Math.min(clear, R + 0.07) - Math.abs(side) * 0.25 - d * 0.06;
          if (!best || score > best.score) best = { score: score, x: p.x, z: p.z };
        }
      }
      if (best) v.bowlAt.set(best.x, t.top, best.z);
    }

    // ---------- what the chef can do with E ----------------------------------------------------
    play.addInteractables(function(hands){
      var list = [], k = ctx.getKitchen(), pot = state.pot;
      if (!kitchenReady()) return list;
      var potAt = V(potPlace().x, 0, potPlace().z), shelfAt = k.vegShelf.position;
      // the pot on the range
      if (state.carry === 'lettuce'){
        list.push(pot.phase === 'empty' ? { pos: potAt, reach: RULES.reach, label: 'Put the lettuce in the pot', use: function(){ act('fillPot'); } }
                                        : { pos: potAt, reach: RULES.reach, label: pot.phase === 'cooking' ? 'The pot is still cooking' : 'There is still stew in the pot' });
      } else if (state.carry === 'stew'){
        if (pot.phase !== 'cooking' && pot.portions < RULES.portions) list.push({ pos: potAt, reach: RULES.reach, label: 'Pour the stew back', use: function(){ act('returnStew'); } });
      } else if (pot.phase === 'ready'){
        list.push(hands.handsFree ? { pos: potAt, reach: RULES.reach, label: 'Fill a bowl with stew', use: function(){ act('takeStew'); } }
                                  : { pos: potAt, reach: RULES.reach, label: 'Hands full' });
      } else {
        list.push({ pos: potAt, reach: RULES.reach, label: pot.phase === 'cooking' ? 'Cooking…' : 'The pot needs a lettuce' });
      }
      // the vegetable shelf
      if (state.carry === 'lettuce') list.push({ pos: shelfAt, reach: RULES.reach, label: 'Put the lettuce back', use: function(){ act('returnLettuce'); } });
      else if (!state.carry) list.push(hands.handsFree ? { pos: shelfAt, reach: RULES.reach, label: 'Take a lettuce', use: function(){ act('takeLettuce'); } }
                                                       : { pos: shelfAt, reach: RULES.reach, label: 'Hands full' });
      // guests waiting for their food
      state.guests.forEach(function(g){
        if (g.phase !== 'waiting') return;
        var at = V(views[g.id].info.spot.x, 0, views[g.id].info.spot.z);
        list.push(state.carry === 'stew' ? { pos: at, reach: RULES.serveReach, label: 'Serve the stew', use: function(){ act('serve', g.id); } }
                                         : { pos: at, reach: RULES.serveReach, label: 'Wants stew' });
      });
      return list;
    });

    // ---------- every frame: time passes, then everything shown follows the state -------------
    var clock = 0;
    function update(dt){
      clock += dt;
      ctx.getGuests().forEach(view);
      tick(dt);

      // what the chef carries
      if (state.carry !== shown.carry && (!state.carry || ITEMS[state.carry].obj)){
        shown.carry = state.carry;
        play.setCarry(state.carry ? instance(state.carry) : null, state.carry ? ITEMS[state.carry].carry : null);
        carryEl.textContent = state.carry ? 'Carrying ' + ITEMS[state.carry].label : '';
        carryEl.classList.toggle('on', !!state.carry);
      }
      if (state.money !== shown.money){
        shown.money = state.money; amountEl.textContent = '$' + state.money;
        moneyEl.classList.add('bump'); setTimeout(function(){ moneyEl.classList.remove('bump'); }, 260);
      }

      // the guests: order bubble, bowl on the table, money popping up
      state.guests.forEach(function(g){
        var v = views[g.id], s = v.sign;
        var show = g.phase === 'waiting' || g.phase === 'angry' || g.phase === 'eating';
        s.sp.visible = show;
        if (show){
          v.info.head.getWorldPosition(headPos);
          s.sp.position.set(headPos.x, headPos.y + 0.78 + Math.sin(clock * 2 + headPos.z) * 0.015, headPos.z);
          var size = 0.62;
          if (g.phase === 'waiting'){
            drawOrder(s, g.patience);
            if (g.patience < 0.25) size *= 1 + Math.sin(clock * 9) * 0.05;   // getting impatient
          } else if (g.phase === 'eating'){ drawEating(s, g.t / RULES.eatTime); size = 0.36; }
          else drawAngry(s);
          s.sp.scale.set(size, size, 1);
        }
        var eating = g.phase === 'eating';
        if (eating && !v.bowl){ placeBowl(v); v.bowl = instance('stew'); v.bowl.position.copy(v.bowlAt); v.bowl.rotation.y = rnd(0, 6.28); root.add(v.bowl); }
        if (!eating && v.bowl){
          root.remove(v.bowl); v.bowl = null;
          if (g.phase === 'paid') popMoney(V(v.bowlAt.x, v.bowlAt.y + 0.45, v.bowlAt.z), g.pay);
        }
      });
      for (var i = pops.length - 1; i >= 0; i--){
        var p = pops[i]; p.t += dt / 1.6;
        p.s.sp.position.y = p.y + p.t * 0.7; p.s.sp.material.opacity = clamp(2.2 * (1 - p.t));
        if (p.t >= 1){ root.remove(p.s.sp); p.s.tex.dispose(); p.s.sp.material.dispose(); pops.splice(i, 1); }
      }

      // the pot: its sign and the steam
      var k = ctx.getKitchen(), pot = state.pot, hot = pot.phase !== 'empty';
      if (!kitchenReady()) return;
      var at = potPlace(), top = at.y;
      potSign.sp.visible = hot;
      if (hot){ drawPot(potSign, pot); potSign.sp.position.set(at.x, top + 0.34, at.z); }
      var strength = pot.phase === 'cooking' ? 1 : pot.phase === 'ready' ? 0.55 : 0;
      puffs.forEach(function(pf){
        pf.t += dt * 0.55; if (pf.t >= 1){ pf.t -= 1; pf.dx = rnd(-1, 1); pf.dz = rnd(-1, 1); }
        pf.sp.visible = strength > 0;
        if (!strength) return;
        var e = pf.t, size = 0.26 + e * 0.5;
        pf.sp.position.set(at.x + pf.dx * (0.07 + e * 0.1), top + 0.02 + e * 0.75, at.z + pf.dz * (0.07 + e * 0.1));
        pf.sp.scale.set(size, size, 1);
        pf.sp.material.opacity = strength * Math.sin(Math.PI * e) * 0.85;
      });
    }

    return {
      update: update,
      // ---- for tests only ----
      debugState: function(){
        return { money: state.money, served: state.served, lost: state.lost, carry: state.carry,
                 pot: state.pot.phase + (state.pot.phase === 'cooking' ? ' ' + state.pot.t.toFixed(1) : '') + ' x' + state.pot.portions,
                 guests: state.guests.map(function(g){ return g.id + ':' + g.phase + (g.phase === 'waiting' ? ' ' + g.patience.toFixed(2) : ''); }).join(' '),
                 items: Object.keys(ITEMS).filter(function(key){ return ITEMS[key].obj; }).join(',') };
      },
      debugAct: act,
      debugRules: RULES,
      debugGuest: function(id){ var v = views[id]; return v ? { spot: [v.info.spot.x, v.info.spot.z], bowlAt: v.bowlAt.toArray() } : null; }
    };
  }

  window.HotPotRestaurant = { build: build };
})();
