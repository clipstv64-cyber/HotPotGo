// Restaurant: the guests at the tables order stew. The chef fetches potatoes, carrots
// and onions from their crates in the kitchen's pantry corner, puts them into the big pot on the
// range and cooks the stew: one pot is 20 portions. With an empty bowl from the stack
// he ladles a portion, carries it to the guest and serves it; the guest eats, pays and
// tips for quick service. A guest who waits too long gives up.
//
// Keys (as in the game's concept): F picks things up and puts them down, E uses things.
//
// Everything the rules know is in `state`, and every change to it goes through act():
// what is drawn (crates, bowls, the pot, bubbles, the money counter) only follows the
// state. That keeps the door open for playing together later, where the actions travel
// between the players and the host checks them.
//
// Used from index.html:
//   restaurant = HotPotRestaurant.build({ scene, camera, gameplay, getChef, getKitchen, getGuests, BACKROOMS, addBox })
//   restaurant.update(delta)   // every frame
(function(){
  'use strict';
  var T = THREE;

  // dishes: what goes into the pot, how many portions it gives, what a portion costs
  var RECIPES = {
    stew: { name: 'vegetable stew', needs: { potato: 1, carrot: 1, onion: 1 }, portions: 20, cookTime: 12, price: 9 }
  };
  var RULES = {
    startMoney: 250,          // euros in the till at the start
    crateStock: 6,            // vegetables in each crate at the start
    bowls: 10,                // clean bowls on the stack at the start
    firstOrder: 8,            // seconds until the first guest orders
    orderEvery: [14, 26],     // seconds between new orders
    maxOpen: 3,               // at most this many guests waiting at once
    patience: 120,            // seconds a guest waits for the food
    rest: 30,                 // seconds until a guest who has eaten (or given up) may order again
    eatTime: 14,              // seconds a guest eats
    tip: 3,                   // the tip shrinks with the waiting time
    reach: 2.1,               // how close the chef has to be to a crate, the pot, the bowls
    itemReach: 1.9,           // ... to something lying on a work surface
    serveReach: 2.7           // ... and to a guest's chair (far enough to serve across the table from the aisle)
  };
  var VEG = ['potato', 'carrot', 'onion'];
  // what can be carried; carry: how the chef holds it (see gameplay.js)
  var KINDS = {
    potato: { a: 'a potato', the: 'the potato', many: 'potatoes', carry: { half: 0.105, fwd: 0.44, drop: -0.25, grip: 0.06, back: 0, curl: 0.45 } },
    carrot: { a: 'a carrot', the: 'the carrot', many: 'carrots', carry: { half: 0.115, fwd: 0.44, drop: -0.25, grip: 0.04, back: 0, curl: 0.45, yaw: 0.5 } },
    onion:  { a: 'an onion', the: 'the onion', many: 'onions', carry: { half: 0.1, fwd: 0.44, drop: -0.25, grip: 0.07, back: 0, curl: 0.45 } },
    bowl:   { a: 'an empty bowl', the: 'the bowl', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    stew:   { a: 'a bowl of stew', the: 'the bowl of stew', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } }
  };
  // Meshy models and parts cut out of the kitchen's own models; width (or height): size in the game
  var MODELS = {
    potato: { file: 'models/d_potato.glb', width: 0.2 },
    carrot: { file: 'models/d_carrot.glb', width: 0.32 },
    onion:  { file: 'models/d_onion.glb', width: 0.17 },
    bowl:   { file: 'models/d_bowl_empty.glb', width: 0.4 },
    stew:   { file: 'models/d_stew_bowl.glb', width: 0.4 },
    crate:  { file: 'models/d_crate.glb', width: 0.66 },
    pot:    { file: 'models/d_cookpot.glb', width: 0.86 },
    ladle:  { file: 'models/d_ladle.glb', height: 0.56 }
  };

  function clamp(v, a, b){ return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
  function smooth(x){ x = clamp(x); return x * x * (3 - 2 * x); }
  function rnd(a, b){ return a + (b - a) * Math.random(); }

  function build(ctx){
    var scene = ctx.scene, camera = ctx.camera, play = ctx.gameplay, RECIPE = RECIPES.stew;
    var root = new T.Group(); root.name = 'restaurant'; scene.add(root);
    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };

    // ---------- the state and the actions that change it ---------------------------------
    var state = {
      money: RULES.startMoney, served: 0, lost: 0, nextId: 1,
      items: {},                                    // id -> { id, kind, at: 'hand' | 'surface' | 'table', x, y, z, rot, batch, guest }
      carry: null,                                  // id of the item in the chef's hands
      crates: { potato: RULES.crateStock, carrot: RULES.crateStock, onion: RULES.crateStock },
      bowls: RULES.bowls,                           // clean bowls on the stack
      pot: { phase: 'empty', has: { potato: 0, carrot: 0, onion: 0 }, t: 0, portions: 0, batch: 0 },   // 'empty' | 'filling' | 'cooking' | 'ready'
      guests: [],                                   // { id, phase, t, patience, pay, item }; phase: 'idle' | 'waiting' | 'eating' | 'paid' | 'angry'
      nextOrder: RULES.firstOrder
    };
    function guest(id){ for (var i = 0; i < state.guests.length; i++) if (state.guests[i].id === id) return state.guests[i]; return null; }
    function carried(){ return state.carry ? state.items[state.carry] : null; }
    function isVeg(kind){ return VEG.indexOf(kind) >= 0; }
    function missing(){ return VEG.filter(function(k){ return state.pot.has[k] < RECIPE.needs[k]; }); }
    function newItem(kind){ var it = { id: state.nextId++, kind: kind, at: 'hand' }; state.items[it.id] = it; state.carry = it.id; return it; }
    function dropItem(it){ delete state.items[it.id]; if (state.carry === it.id) state.carry = null; }
    // Each action checks by itself whether it is allowed and changes nothing if it is not.
    function act(type, arg){
      var pot = state.pot, it = carried(), g;
      switch (type){
        case 'take':       // a vegetable out of its crate
          if (it || !isVeg(arg) || state.crates[arg] <= 0) return false;
          state.crates[arg]--; newItem(arg); return true;
        case 'putBack':    // ... and back into it
          if (!it || !isVeg(it.kind)) return false;
          state.crates[it.kind]++; dropItem(it); return true;
        case 'takeBowl':
          if (it || state.bowls <= 0) return false;
          state.bowls--; newItem('bowl'); return true;
        case 'returnBowl':
          if (!it || it.kind !== 'bowl') return false;
          state.bowls++; dropItem(it); return true;
        case 'putDown':    // onto a work surface: arg = { x, y, z }
          if (!it || !arg) return false;
          it.at = 'surface'; it.x = arg.x; it.y = arg.y; it.z = arg.z; it.rot = arg.rot || 0; state.carry = null; return true;
        case 'pickUp':     // arg = item id
          g = state.items[arg];
          if (it || !g || g.at !== 'surface') return false;
          g.at = 'hand'; state.carry = g.id; return true;
        case 'addToPot':
          if (!it || !isVeg(it.kind) || (pot.phase !== 'empty' && pot.phase !== 'filling') || pot.has[it.kind] >= RECIPE.needs[it.kind]) return false;
          pot.has[it.kind]++; dropItem(it); pot.phase = 'filling';
          if (!missing().length){ pot.phase = 'cooking'; pot.t = 0; }   // everything is in: it starts to cook
          return true;
        case 'ladle':      // one portion from the pot into the empty bowl in his hands
          if (!it || it.kind !== 'bowl' || pot.phase !== 'ready' || pot.portions <= 0) return false;
          it.kind = 'stew'; it.batch = pot.batch;
          if (--pot.portions <= 0){ pot.portions = 0; pot.phase = 'empty'; VEG.forEach(function(k){ pot.has[k] = 0; }); }
          return true;
        case 'pourBack':
          if (!it || it.kind !== 'stew' || pot.phase !== 'ready' || it.batch !== pot.batch || pot.portions >= RECIPE.portions) return false;
          it.kind = 'bowl'; delete it.batch; pot.portions++; return true;
        case 'order':
          g = guest(arg); if (!g || g.phase !== 'idle') return false;
          g.phase = 'waiting'; g.patience = 1; return true;
        case 'serve':
          g = guest(arg); if (!g || g.phase !== 'waiting' || !it || it.kind !== 'stew') return false;
          it.at = 'table'; it.guest = g.id; state.carry = null;
          g.phase = 'eating'; g.t = 0; g.item = it.id;
          g.pay = RECIPE.price + Math.round(RULES.tip * g.patience); return true;
      }
      return false;
    }
    // what happens by itself as time passes
    function tick(dt){
      var pot = state.pot;
      if (pot.phase === 'cooking'){
        pot.t += dt;
        if (pot.t >= RECIPE.cookTime){ pot.phase = 'ready'; pot.portions = RECIPE.portions; pot.batch = state.nextId++; }
      }
      var open = 0, idle = [];
      state.guests.forEach(function(g){
        if (g.phase === 'waiting'){
          open++;
          g.patience -= dt / RULES.patience;
          if (g.patience <= 0){ g.phase = 'angry'; g.t = 0; state.lost++; }
        } else if (g.phase === 'eating'){
          g.t += dt;
          if (g.t >= RULES.eatTime){
            g.phase = 'paid'; g.t = 0; state.money += g.pay; state.served++;
            if (state.items[g.item]){ dropItem(state.items[g.item]); state.bowls++; }   // the bowl goes back to the clean stack (washing up comes later)
            g.item = null;
          }
        } else if (g.phase === 'paid' || g.phase === 'angry'){
          g.t += dt;
          if (g.t >= 3){ g.phase = 'idle'; g.rest = RULES.rest; }
        } else {
          g.rest = Math.max(0, (g.rest || 0) - dt);
          if (g.rest <= 0) idle.push(g);
        }
      });
      if (!state.guests.length || !place.pot) return;
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
    moneyEl.innerHTML = '<span class="hp-coin"></span><span class="hp-amount"></span>'; document.body.appendChild(moneyEl);
    var amountEl = moneyEl.querySelector('.hp-amount');
    var carryEl = document.createElement('div'); carryEl.className = 'hp-carry'; document.body.appendChild(carryEl);
    function euro(n){ return '€' + n; }
    var shown = { money: null, carry: null };

    // ---------- models ------------------------------------------------------------------------
    var gltf = new T.GLTFLoader();
    if (window.MeshoptDecoder) gltf.setMeshoptDecoder(MeshoptDecoder);
    Object.keys(MODELS).forEach(function(key){
      var md = MODELS[key];
      fetch(md.file).then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(buf){ gltf.parse(buf, '', function(g){
          var obj = g.scene; obj.updateMatrixWorld(true);
          var bb = new T.Box3().setFromObject(obj), s = bb.getSize(V()), c = bb.getCenter(V());
          var k = md.height ? md.height / s.y : md.width / Math.max(s.x, s.z);
          obj.position.x -= c.x; obj.position.y -= bb.min.y; obj.position.z -= c.z;   // standing on the origin
          obj.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
          var sized = new T.Group(); sized.add(obj); sized.scale.set(k, k * (md.squash || 1), k);
          var holder = new T.Group(); holder.add(sized);
          md.size = V(s.x * k, s.y * k * (md.squash || 1), s.z * k);
          md.obj = holder;
        }, function(e){ console.error('Could not load ' + md.file + ':', e); }); })
        .catch(function(e){ console.error('Could not load ' + md.file + ':', e); });
    });
    function instance(key){ return MODELS[key].obj.clone(true); }
    function allLoaded(){ return Object.keys(MODELS).every(function(k){ return MODELS[k].obj; }); }

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
      var key = pot.phase === 'cooking' ? 'c' + Math.round(pot.t / RECIPE.cookTime * 40) : 'r' + pot.portions;
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; g.clearRect(0, 0, 128, 128);
      g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fillStyle = 'rgba(255,252,244,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,28,20,.5)'; g.stroke();
      if (pot.phase === 'cooking'){
        g.lineWidth = 12; g.strokeStyle = 'rgba(60,45,35,.16)'; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#d9862a'; g.lineCap = 'round';
        g.beginPath(); g.arc(64, 64, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(pot.t / RECIPE.cookTime)); g.stroke();
        bowlIcon(g, 64, 70, 0.62);
      } else {
        bowlIcon(g, 44, 72, 0.74);
        g.fillStyle = '#3a2a20'; g.font = '700 27px system-ui,"Segoe UI",sans-serif'; g.textAlign = 'center';
        g.fillText('×' + pot.portions, 93, 66);
      }
      s.tex.needsUpdate = true;
    }
    // "+€11" floating up from a table
    var pops = [];
    function popMoney(pos, amount){
      var s = sign(0.8), g = s.g;
      g.clearRect(0, 0, 128, 128);
      g.font = '800 44px system-ui,"Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(30,22,10,.85)'; g.strokeText('+' + euro(amount), 64, 64);
      g.fillStyle = '#ffd95a'; g.fillText('+' + euro(amount), 64, 64);
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
    // the stew in the pot: a glossy surface with bits of carrot, potato and onion
    var stewTex = (function(){
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 16, 128, 128, 128);
      gr.addColorStop(0, '#b8652a'); gr.addColorStop(0.8, '#9c5120'); gr.addColorStop(1, '#6f3613');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      var bits = ['#e08a2c', '#e08a2c', '#e2c98a', '#e2c98a', '#d9d2b4', '#7d8f3c'];
      for (var n = 0; n < 150; n++){
        var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 112, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
        g.save(); g.translate(x, y); g.rotate(Math.random() * 3.14);
        g.fillStyle = bits[n % bits.length];
        if (n % 3 === 0){ g.beginPath(); g.arc(0, 0, 5 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
        else g.fillRect(-5, -4, 9 + Math.random() * 4, 7 + Math.random() * 3);
        g.fillStyle = 'rgba(255,240,210,.2)'; g.fillRect(-3, -3, 4, 2);
        g.restore();
      }
      var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t;
    })();

    // ---------- the places: crates in the storeroom, pot on the range, bowls on the island ------
    // built once the models and the kitchen are there
    var place = { pot: null, crates: {}, stacks: null };
    var CRATE_GRID = [[-0.19, -0.075], [0, -0.075], [0.19, -0.075], [-0.19, 0.085], [0, 0.085], [0.19, 0.085]];
    function buildPlaces(){
      var k = ctx.getKitchen();
      if (place.pot || !allLoaded() || !k || !k.potAt || !k.bowlsAt) return;
      // the pantry corner: three crates side by side at the kitchen's back wall, between
      // the door to the back rooms and the side counter, right beside the range
      var cs = MODELS.crate.size, wallZ = -10;
      VEG.forEach(function(kind, i){
        var grp = new T.Group(), model = instance('crate');
        grp.position.set(7.62 + i * 0.52, 0, wallZ + 0.06 + cs.x / 2); grp.rotation.y = Math.PI / 2;   // short side to the wall
        grp.add(model); root.add(grp);
        if (ctx.addBox) ctx.addBox(grp.position.x, grp.position.z, cs.z, cs.x, cs.y);
        var inside = CRATE_GRID.map(function(g){
          var v = instance(kind);
          v.position.set(g[0] + rnd(-0.015, 0.015), 0.045, g[1] + rnd(-0.01, 0.01));
          v.rotation.y = kind === 'carrot' ? 1.57 + rnd(-0.25, 0.25) : rnd(0, 6.28);
          grp.add(v); return v;
        });
        place.crates[kind] = { grp: grp, model: model, inside: inside, pos: grp.position };
      });
      // the clean bowls: two stacks side by side
      var st = new T.Group(); st.position.copy(k.bowlsAt); root.add(st);
      place.stacks = { grp: st, pos: st.position, bowls: [] };
      for (var n = 0; n < RULES.bowls; n++){
        var b = instance('bowl');
        b.position.set(0, Math.floor(n / 2) * 0.062, (n % 2 ? 0.21 : -0.21)); b.rotation.y = rnd(0, 6.28);
        st.add(b); place.stacks.bowls.push(b);
      }
      // the pot on the range, the stew in it, the vegetables lying in it before it cooks, the ladle
      var pg = new T.Group(), pm = instance('pot'), size = MODELS.pot.size;
      pg.position.copy(k.potAt); pg.add(pm); root.add(pg);
      var inner = size.x * 0.37;    // the pot's inside radius (measured on the model; its width includes the handles)
      var stew = new T.Mesh(new T.CircleGeometry(inner, 40), new T.MeshStandardMaterial({ map: stewTex, color: 0x9a938c, roughness: 0.62, metalness: 0 }));
      stew.rotation.x = -Math.PI / 2; stew.visible = false; stew.receiveShadow = true; pg.add(stew);
      var veg = {};
      VEG.forEach(function(kind, i){
        var v = instance(kind), a = i * 2.1;
        v.position.set(Math.cos(a) * inner * 0.45, size.y * 0.23, Math.sin(a) * inner * 0.45); v.rotation.y = a; v.visible = false;
        pg.add(v); veg[kind] = v;
      });
      var ladle = instance('ladle'); pg.add(ladle);
      place.pot = { grp: pg, model: pm, pos: pg.position, size: size, inner: inner, stew: stew, veg: veg, ladle: ladle,
                    low: size.y * 0.27, high: size.y * 0.8,                         // the stew's level: nearly empty .. full (the inside floor is at 0.22)
                    rest: { x: inner * 0.3, y: size.y * 0.24, z: -inner * 0.35, tilt: 0.42 } };   // the ladle leaning in the pot
    }

    // ---------- the guests' side ------------------------------------------------------------
    var views = {};   // per guest: { info, sign, toTable, bowlAt }
    function view(info){
      var v = views[info.id];
      if (!v){
        var sp = info.spot, t = sp.table, toTable = sp.z < t.z ? 1 : -1;
        v = views[info.id] = { info: info, sign: sign(0.62), toTable: toTable, bowlAt: V(sp.x, t.top, t.z - toTable * (t.halfZ - 0.34)) };
        state.guests.push({ id: info.id, phase: 'idle', t: 0, patience: 0, pay: 0, rest: rnd(0, 12), item: null });
      }
      return v;
    }
    var headPos = V();
    // The bowl goes on the table in front of the guest where it is clear of the hands
    // lying there: between them if they are far enough apart, else just beyond them.
    function placeBowl(v){
      var sp = v.info.spot, t = sp.table, R = MODELS.stew.width / 2;
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

    // ---------- putting things down: the spot on a work surface the player looks at -----------
    var aimFrom = V(), aimDir = V();
    function aimSpot(){
      var k = ctx.getKitchen(), chef = ctx.getChef();
      if (!k || !chef) return null;
      camera.getWorldPosition(aimFrom); camera.getWorldDirection(aimDir);
      if (aimDir.y > -0.08) return null;
      for (var i = 0; i < k.surfaces.length; i++){
        var s = k.surfaces[i], t = (s.y - aimFrom.y) / aimDir.y, x = aimFrom.x + aimDir.x * t, z = aimFrom.z + aimDir.z * t;
        if (x < s.minX - 0.15 || x > s.maxX + 0.15 || z < s.minZ - 0.15 || z > s.maxZ + 0.15) continue;
        x = clamp(x, s.minX, s.maxX); z = clamp(z, s.minZ, s.maxZ);
        if (Math.hypot(x - chef.position.x, z - chef.position.z) > 2.3) continue;
        return { x: x, y: s.y, z: z, rot: chef.rotation.y, free: roomAt(x, z) };
      }
      return null;
    }
    var aim = null;   // refreshed every frame
    // is there room to put something down at this spot of a work surface?
    function roomAt(x, z){
      var k = ctx.getKitchen(), ok = true;
      (k.taken || []).forEach(function(c){ if (Math.hypot(c.x - x, c.z - z) < c.r + 0.1) ok = false; });
      if (place.stacks && Math.abs(x - place.stacks.pos.x) < 0.34 && Math.abs(z - place.stacks.pos.z) < 0.55) ok = false;   // the bowl stacks
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.at === 'surface' && Math.hypot(o.x - x, o.z - z) < (o.kind === 'bowl' || o.kind === 'stew' ? 0.36 : 0.24)) ok = false;
      });
      return ok;
    }

    // ---------- ladling: the ladle lifts a portion out of the pot into the bowl ---------------
    var scoop = null;   // { t: 0..1, item }
    var SCOOP_TIME = 1.25, POUR_AT = 0.68;

    // ---------- what the chef can do: F picks up / puts down, E uses ---------------------------
    function list(words){ return words.join(', ').replace(/, ([^,]*)$/, ' and $1'); }
    play.addInteractables(function(hands){
      var out = [], it = carried(), pot = state.pot;
      if (!place.pot) return out;
      function add(e){ out.push(e); }
      var free = !it && hands.handsFree;
      // the crates
      VEG.forEach(function(kind){
        var c = place.crates[kind], K = KINDS[kind], e = { pos: c.pos, reach: RULES.reach, key: 'F' };
        if (it && it.kind === kind){ e.label = 'Put ' + K.the + ' back'; e.use = function(){ act('putBack'); }; }
        else if (it) return;
        else if (!free) e.label = 'Hands full';
        else if (state.crates[kind] <= 0) e.label = 'No ' + K.many + ' left';
        else { e.label = 'Take ' + K.a; e.use = function(){ act('take', kind); }; e.obj = c.model; }
        add(e);
      });
      // the stack of clean bowls
      var sb = { pos: place.stacks.pos, reach: RULES.reach, key: 'F' };
      if (it && it.kind === 'bowl'){ sb.label = 'Put the bowl back'; sb.use = function(){ act('returnBowl'); }; add(sb); }
      else if (!it){
        if (!free) sb.label = 'Hands full';
        else if (state.bowls <= 0) sb.label = 'No clean bowls left';
        else { sb.label = 'Take a bowl'; sb.use = function(){ act('takeBowl'); }; sb.obj = place.stacks.bowls[state.bowls - 1]; }
        add(sb);
      }
      // things lying on the work surfaces
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.at !== 'surface' || !free) return;
        add({ pos: V(o.x, 0, o.z), reach: RULES.itemReach, key: 'F', label: 'Pick up ' + KINDS[o.kind].the, use: function(){ act('pickUp', o.id); }, obj: objs[o.id] && objs[o.id].obj });
      });
      // putting down what he carries, where he looks
      if (it && aim && !scoop){
        if (aim.free) add({ pos: V(aim.x, 0, aim.z), reach: 2.4, key: 'F', bias: 0.35, label: 'Put ' + KINDS[it.kind].the + ' down', use: function(){ if (aim && aim.free) act('putDown', aim); } });
        else add({ pos: V(aim.x, 0, aim.z), reach: 2.4, key: 'F', bias: 0.35, label: 'No room here' });
      }
      // the pot
      var pe = { pos: place.pot.pos, reach: RULES.reach, key: 'E' }, cooking = pot.phase === 'cooking', ready = pot.phase === 'ready';
      if (scoop) pe = null;
      else if (it && isVeg(it.kind)){
        if (cooking) pe.label = 'The stew is already cooking';
        else if (ready) pe.label = 'There is still stew in the pot';
        else if (pot.has[it.kind] >= RECIPE.needs[it.kind]) pe.label = 'There is enough ' + it.kind + ' in the pot';
        else { pe.label = 'Put ' + KINDS[it.kind].the + ' in the pot'; pe.use = function(){ act('addToPot'); }; pe.obj = place.pot.model; }
      } else if (it && it.kind === 'bowl'){
        if (ready){ pe.label = 'Ladle a portion'; pe.use = function(){ if (act('ladle')) scoop = { t: 0, item: it.id }; }; pe.obj = place.pot.model; }
        else pe.label = cooking ? 'The stew is not ready yet' : 'The pot is empty';
      } else if (it && it.kind === 'stew'){
        if (ready && it.batch === pot.batch && pot.portions < RECIPE.portions){ pe.label = 'Pour it back'; pe.use = function(){ act('pourBack'); }; }
        else pe = null;
      } else if (cooking) pe.label = 'Cooking…';
      else if (ready) pe.label = pot.portions + (pot.portions === 1 ? ' portion' : ' portions') + ' left – bring an empty bowl';
      else pe.label = 'Still needed: ' + list(missing().map(function(k){ return KINDS[k].a; }));
      if (pe) add(pe);
      // guests waiting for their food
      state.guests.forEach(function(g){
        if (g.phase !== 'waiting') return;
        var at = V(views[g.id].info.spot.x, 0, views[g.id].info.spot.z);
        add(it && it.kind === 'stew' ? { pos: at, reach: RULES.serveReach, key: 'E', label: 'Serve the stew', use: function(){ act('serve', g.id); } }
                                     : { pos: at, reach: RULES.serveReach, key: 'E', label: 'Wants stew' });
      });
      return out;
    });

    // ---------- the things themselves: one object per item, following the state --------------
    var objs = {};   // item id -> { obj, kind }
    function syncItems(){
      var it = carried();
      // a bowl being filled still looks empty until the ladle has poured
      function look(o){ return scoop && scoop.item === o.id && scoop.t < POUR_AT ? 'bowl' : o.kind; }
      Object.keys(objs).forEach(function(id){
        if (state.items[id]) return;
        if (objs[id].obj.parent) objs[id].obj.parent.remove(objs[id].obj);
        delete objs[id];
      });
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id], want = look(o), v = objs[id];
        if (v && v.kind !== want){ if (v.obj.parent) v.obj.parent.remove(v.obj); if (shown.carry === o.id) shown.carry = null; v = null; }
        if (!v) v = objs[id] = { obj: instance(want), kind: want, placed: false };
        if (o.at === 'hand'){
          if (shown.carry !== o.id){ shown.carry = o.id; v.placed = false; play.setCarry(v.obj, KINDS[want].carry); }
        } else if (!v.placed){
          if (o.at === 'table'){ var gv = views[o.guest]; placeBowl(gv); v.obj.position.copy(gv.bowlAt); v.obj.rotation.set(0, rnd(0, 6.28), 0); }
          else { v.obj.position.set(o.x, o.y, o.z); v.obj.rotation.set(0, o.rot || 0, 0); }
          v.obj.visible = true; root.add(v.obj); v.placed = true;
        }
      });
      if (!it && shown.carry !== null){ shown.carry = null; play.setCarry(null); }
      var label = it ? 'Carrying ' + KINDS[it.kind].a : '';
      if (carryEl.textContent !== label){ carryEl.textContent = label; carryEl.classList.toggle('on', !!it); }
    }

    // ---------- every frame: time passes, then everything shown follows the state -------------
    var clock = 0;
    function update(dt){
      clock += dt;
      buildPlaces();
      ctx.getGuests().forEach(view);
      tick(dt);
      if (!place.pot) return;
      aim = aimSpot();
      if (scoop){ scoop.t += dt / SCOOP_TIME; if (scoop.t >= 1) scoop = null; }
      syncItems();

      if (state.money !== shown.money){
        var first = shown.money === null;
        shown.money = state.money; amountEl.textContent = euro(state.money);
        if (!first){ moneyEl.classList.add('bump'); setTimeout(function(){ moneyEl.classList.remove('bump'); }, 260); }
      }
      // crates and bowl stacks show what is left
      VEG.forEach(function(kind){ place.crates[kind].inside.forEach(function(v, i){ v.visible = i < state.crates[kind]; }); });
      place.stacks.bowls.forEach(function(b, i){ b.visible = i < state.bowls; });

      // the guests: order bubble, eating ring, money popping up
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
        if (g.phase === 'paid' && !g.popped){ g.popped = true; popMoney(V(v.bowlAt.x, v.bowlAt.y + 0.45, v.bowlAt.z), g.pay); }
        if (g.phase !== 'paid') g.popped = false;
      });
      for (var i = pops.length - 1; i >= 0; i--){
        var p = pops[i]; p.t += dt / 1.6;
        p.s.sp.position.y = p.y + p.t * 0.7; p.s.sp.material.opacity = clamp(2.2 * (1 - p.t));
        if (p.t >= 1){ root.remove(p.s.sp); p.s.tex.dispose(); p.s.sp.material.dispose(); pops.splice(i, 1); }
      }

      // the pot: vegetables in it, the stew's level, the ladle, its sign and the steam
      var P = place.pot, pot = state.pot, cooking = pot.phase === 'cooking', ready = pot.phase === 'ready';
      VEG.forEach(function(kind){ P.veg[kind].visible = pot.phase === 'filling' && pot.has[kind] > 0; });
      P.stew.visible = cooking || ready;
      if (P.stew.visible){
        var level = cooking ? 1 : pot.portions / RECIPE.portions;
        P.stew.position.y += ((P.low + (P.high - P.low) * level) - P.stew.position.y) * Math.min(1, dt * 4);
        if (cooking) P.stew.rotation.z += dt * 0.25;   // it simmers
      } else P.stew.position.y = P.high;
      // the ladle: leaning in the pot; when ladling it lifts, swings over the bowl, pours and comes back
      var L = P.ladle, R = P.rest;
      L.position.set(R.x, R.y, R.z); L.rotation.set(0, 0.6, -R.tilt);
      if (scoop){
        var t = scoop.t, bowl = objs[scoop.item] && objs[scoop.item].obj, up = P.size.y + 0.1;
        var over = bowl ? P.grp.worldToLocal(bowl.position.clone()) : V(0, 0, -0.5);
        over.y = Math.max(over.y + 0.2, up - 0.05);
        var a = smooth(t / 0.22), b = smooth((t - 0.22) / 0.33), c = smooth((t - 0.55) / 0.2), d = smooth((t - 0.8) / 0.2);
        var lift = V(0, up, 0);
        L.position.lerp(lift, a).lerp(over, b).lerp(V(R.x, R.y, R.z), d);
        L.rotation.z = -R.tilt * (1 - a) - 1.25 * c * (1 - d) - R.tilt * d;
      }
      var top = P.pos.y + P.size.y;
      potSign.sp.visible = cooking || ready;
      if (potSign.sp.visible){ drawPot(potSign, pot); potSign.sp.position.set(P.pos.x, top + 0.42, P.pos.z); }
      var strength = cooking ? 1 : ready ? 0.5 : 0;
      puffs.forEach(function(pf){
        pf.t += dt * 0.55; if (pf.t >= 1){ pf.t -= 1; pf.dx = rnd(-1, 1); pf.dz = rnd(-1, 1); }
        pf.sp.visible = strength > 0;
        if (!strength) return;
        var e = pf.t, size = 0.26 + e * 0.5;
        pf.sp.position.set(P.pos.x + pf.dx * (0.1 + e * 0.1), top + e * 0.75, P.pos.z + pf.dz * (0.1 + e * 0.1));
        pf.sp.scale.set(size, size, 1);
        pf.sp.material.opacity = strength * Math.sin(Math.PI * e) * 0.85;
      });
    }

    return {
      update: update,
      // ---- for tests only ----
      debugState: function(){
        var it = carried();
        return { money: state.money, served: state.served, lost: state.lost, carry: it ? it.kind : null,
                 crates: VEG.map(function(k){ return state.crates[k]; }).join('/'), bowls: state.bowls,
                 pot: state.pot.phase + (state.pot.phase === 'cooking' ? ' ' + state.pot.t.toFixed(1) : '') + ' x' + state.pot.portions +
                      ' has ' + VEG.map(function(k){ return state.pot.has[k]; }).join(''),
                 items: Object.keys(state.items).map(function(id){ return state.items[id].kind + '@' + state.items[id].at; }).join(' '),
                 guests: state.guests.map(function(g){ return g.id + ':' + g.phase + (g.phase === 'waiting' ? ' ' + g.patience.toFixed(2) : ''); }).join(' '),
                 ready: !!place.pot, aim: aim ? [+aim.x.toFixed(2), +aim.z.toFixed(2)] : null };
      },
      debugAct: act,
      debugEat: function(){ Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (o.kind === 'stew' && o.at === 'surface'){ delete state.items[id]; state.bowls++; } }); },
      debugIds: function(kind){ return Object.keys(state.items).filter(function(id){ return state.items[id].kind === kind; }).map(Number); },
      debugRules: RULES, debugRecipe: RECIPE,
      debugGuest: function(id){ var v = views[id]; return v ? { spot: [v.info.spot.x, v.info.spot.z], bowlAt: v.bowlAt.toArray() } : null; },
      debugPlaces: function(){
        if (!place.pot) return null;
        var k = ctx.getKitchen(), r = function(v){ return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; };
        return { pot: r(place.pot.pos), potSize: r(place.pot.size), bowls: r(place.stacks.pos), surfaces: k.surfaces,
                 crates: VEG.map(function(kind){ return r(place.crates[kind].pos); }) };
      }
    };
  }

  window.HotPotRestaurant = { build: build };
})();
