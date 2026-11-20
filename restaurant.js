// Restaurant: the guests at the tables order stew. The chef fetches potatoes, carrots
// and onions from their crates in the kitchen's pantry corner, cuts them up on the
// chopping block with the knife (the mouse leads the knife: sideways to place it, down
// to cut) and puts the pieces into the big pot on the range. Broth is poured in from the
// jug by tipping it, the heat is set at the range, the stew is stirred with the ladle so
// it does not catch and burn, and seasoned from the shaker: one pot is 20 portions. With an empty bowl from the stack
// he ladles a portion, carries it to the guest and serves it; the guest eats, pays and
// tips for quick service. A guest who waits too long gives up.
//
// Keys (as in the game's concept): F picks things up and puts them down, E uses things,
// the left mouse button works with the tool in hand.
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
    stew: { name: 'vegetable stew', needs: { potato: 1, carrot: 1, onion: 1 }, portions: 20, cookTime: 40, price: 9 }   // cookTime: seconds of simmering
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
    cutReach: 1.75,           // ... to the chopping block to cut on it
    itemReach: 1.9,           // ... to something lying on a work surface
    serveReach: 2.7           // ... and to a guest's chair (far enough to serve across the table from the aisle)
  };
  // The range and what happens in the pot (see tick): the heat sets where the pot's
  // temperature goes. It cooks from `slow` (at half speed), properly from `simmer`. From
  // `catchAt` it catches on the bottom unless it is stirred, and then it burns.
  var COOK = {
    heat: ['off', 'low', 'medium', 'high'],
    target: [20, 84, 97, 122],                 // degrees the pot goes to at each heat
    warm: 0.16, cool: 0.08,                    // how fast (share of the difference per second)
    slow: 80, simmer: 90, hot: 108,
    catchAt: 86, catchTime: [[86, 26], [97, 16], [122, 6]],   // seconds without stirring until it catches, by temperature
    burnTime: 18,                              // seconds it may catch until it is burnt
    dry: 1.5, thick: 1.4,                      // it catches this much faster without broth / with too little
    hotBurn: 45,                               // above `hot` it burns slowly anyway (seconds)
    stirTurn: 0.75,                            // one full turn of the ladle loosens this much of the catching
    brothOk: [0.85, 1.2], brothMax: 1.45, jug: 1.6,   // broth: 1 = what the recipe needs; the jug holds a little more
    stock: 7,                                  // broth in the kitchen at the start (enough for about six pots)
    pour: 0.5,                                 // broth per second from the fully tipped jug
    spice: 3, spiceMax: 8                      // shakes of seasoning: just right, and at most
  };
  var HOME = { knife: true, broth: true, spice: true };   // tools with a place of their own
  var VEG = ['potato', 'carrot', 'onion'];
  // How each vegetable is cut: `a` cuts across its length, then (turned by a quarter)
  // `b` cuts across its width. from / to: the part of its length that is cut (shares,
  // from its thin end); dropEnd: what lies beyond the last cut is thrown away (the
  // carrot's leaves); cap: the colours of the cut faces.
  var CUTS = {
    carrot: { a: 5, b: 0, from: 0.04, to: 0.68, dropEnd: true, cap: ['#f9b25a', '#ee8f2e'] },
    potato: { a: 3, b: 3, from: 0.05, to: 0.95, cap: ['#f6e9b4', '#ecd98f'] },
    onion:  { a: 2, b: 3, from: 0.12, to: 0.9, cap: ['#fbf6e6', '#e6d9bd'] }
  };
  // what can be carried; carry: how the chef holds it (see gameplay.js)
  var KINDS = {
    potato: { a: 'a potato', the: 'the potato', many: 'potatoes', cutName: 'potato cubes', carry: { half: 0.105, fwd: 0.44, drop: -0.25, grip: 0.06, back: 0, curl: 0.45 } },
    carrot: { a: 'a carrot', the: 'the carrot', many: 'carrots', cutName: 'carrot slices', carry: { half: 0.115, fwd: 0.44, drop: -0.25, grip: 0.04, back: 0, curl: 0.45, yaw: 0.5 } },
    onion:  { a: 'an onion', the: 'the onion', many: 'onions', cutName: 'chopped onion', carry: { half: 0.1, fwd: 0.44, drop: -0.25, grip: 0.07, back: 0, curl: 0.45 } },
    bowl:   { a: 'an empty bowl', the: 'the bowl', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    stew:   { a: 'a bowl of stew', the: 'the bowl of stew', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    knife:  { a: 'the knife', the: 'the knife' },   // these three are held in one hand (see toolHold)
    broth:  { a: 'the jug of broth', the: 'the jug of broth' },
    spice:  { a: 'the spice shaker', the: 'the spice shaker' }
  };
  // Meshy models and parts cut out of the kitchen's own models; width (or height): size in the game
  var MODELS = {
    // align: laid along its own length (X), its thin end at -X, its flat side down
    potato: { file: 'models/d_potato.glb', width: 0.2, align: true },
    carrot: { file: 'models/d_carrot.glb', width: 0.32, align: true },
    onion:  { file: 'models/d_onion.glb', width: 0.17, align: true },
    knife:  { file: 'models/d_knife.glb', width: 0.44, align: true },   // the cleaver from the kitchen's chopping block
    board:  { file: 'models/d_board.glb', width: 0.62 },                // ... and the block without it
    broth:  { file: 'models/d_broth_jug.glb', height: 0.36 },
    spice:  { file: 'models/d_spice.glb', height: 0.2 },
    bowl:   { file: 'models/d_bowl_empty.glb', width: 0.4 },
    stew:   { file: 'models/d_stew_bowl.glb', width: 0.4 },
    crate:  { file: 'models/d_crate.glb', width: 0.66 },
    pot:    { file: 'models/d_cookpot.glb', width: 0.86 },
    ladle:  { file: 'models/d_ladle.glb', height: 0.56 }
  };

  function clamp(v, a, b){ return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
  function smooth(x){ x = clamp(x); return x * x * (3 - 2 * x); }
  function rnd(a, b){ return a + (b - a) * Math.random(); }
  function angle(a){ return Math.atan2(Math.sin(a), Math.cos(a)); }   // -PI .. PI
  // eigenvectors of a symmetric 3x3 matrix [xx, xy, xz, yy, yz, zz], largest eigenvalue first
  function eigen3(c){
    var a = [[c[0], c[1], c[2]], [c[1], c[3], c[4]], [c[2], c[4], c[5]]], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], k;
    for (var sweep = 0; sweep < 24; sweep++){
      for (var p = 0; p < 2; p++) for (var q = p + 1; q < 3; q++){
        if (Math.abs(a[p][q]) < 1e-14) continue;
        var th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), cs = Math.cos(th), sn = Math.sin(th);
        for (k = 0; k < 3; k++){ var akp = a[k][p], akq = a[k][q]; a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq; }
        for (k = 0; k < 3; k++){ var apk = a[p][k], aqk = a[q][k]; a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk; }
        for (k = 0; k < 3; k++){ var vkp = v[k][p], vkq = v[k][q]; v[k][p] = cs * vkp - sn * vkq; v[k][q] = sn * vkp + cs * vkq; }
      }
    }
    return [0, 1, 2].map(function(i){ return { val: a[i][i], vec: new T.Vector3(v[0][i], v[1][i], v[2][i]) }; })
      .sort(function(x, y){ return y.val - x.val; });
  }
  // how even a row of cuts is: 1 = all pieces the same length .. 0 = very uneven
  function evenness(cuts, range, openEnd){
    var pts = [range[0]].concat(cuts); if (!openEnd) pts.push(range[1]);
    var len = [], mean = 0, sd = 0, i;
    for (i = 1; i < pts.length; i++){ len.push(pts[i] - pts[i - 1]); mean += pts[i] - pts[i - 1]; }
    mean /= len.length;
    for (i = 0; i < len.length; i++) sd += (len[i] - mean) * (len[i] - mean);
    sd = Math.sqrt(sd / len.length);
    return clamp(1 - 1.2 * sd / Math.max(1e-6, mean));   // small slips are forgiven
  }

  function build(ctx){
    var scene = ctx.scene, camera = ctx.camera, play = ctx.gameplay, RECIPE = RECIPES.stew;
    var root = new T.Group(); root.name = 'restaurant'; scene.add(root);
    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };

    // ---------- the state and the actions that change it ---------------------------------
    var state = {
      money: RULES.startMoney, served: 0, lost: 0, nextId: 1,
      items: {},                                    // id -> { id, kind, at: 'hand' | 'surface' | 'board' | 'home' | 'table', x, y, z, rot, cut: { a, b, done, q }, batch, q, guest }
      board: null,                                  // id of the vegetable on the chopping block
      knife: null,                                  // id of the knife (at 'home' beside the block, or in the hand)
      tools: {},                                    // ids of the tools: knife, broth (the jug: item.left = what is in it), spice
      carry: null,                                  // id of the item in the chef's hands
      crates: { potato: RULES.crateStock, carrot: RULES.crateStock, onion: RULES.crateStock },
      bowls: RULES.bowls,                           // clean bowls on the stack
      // the pot: 'empty' | 'filling' (things are put in, it cooks) | 'ready' | 'burnt'
      pot: { phase: 'empty', has: { potato: 0, carrot: 0, onion: 0 }, cut: {}, qs: [], broth: 0, spice: 0,
             heat: 0, temp: 20, cooked: 0, stick: 0, burn: 0, quality: 1, portions: 0, batch: 0 },
      guests: [],                                   // { id, phase, t, patience, pay, item }; phase: 'idle' | 'waiting' | 'eating' | 'paid' | 'angry'
      open: false,                                  // the restaurant is opened and closed at the front door; guests only order while it is open
      broth: 0,                                     // broth in stock (1 = what one pot needs), besides what is in the jug
      nextOrder: RULES.firstOrder
    };
    ['knife', 'broth', 'spice'].forEach(function(kind){
      var o = { id: state.nextId++, kind: kind, at: 'home' };
      if (kind === 'broth'){ o.left = COOK.jug; state.broth = COOK.stock - COOK.jug; }
      state.items[o.id] = o; state.tools[kind] = o.id;
    });
    state.knife = state.tools.knife;
    function emptyPot(){
      var pot = state.pot;
      VEG.forEach(function(k){ pot.has[k] = 0; });
      pot.cut = {}; pot.qs = []; pot.broth = 0; pot.spice = 0; pot.cooked = 0; pot.stick = 0; pot.burn = 0; pot.portions = 0; pot.phase = 'empty';
    }
    function inPot(){ return state.pot.broth > 0.02 || VEG.some(function(k){ return state.pot.has[k] > 0; }); }
    // how good the stew is: how well the vegetables were cut, the right amount of broth
    // and of seasoning, and whether it burnt
    function potQuality(){
      var pot = state.pot, q = pot.qs.length ? pot.qs.reduce(function(x, y){ return x + y; }, 0) / pot.qs.length : 1;
      var bf = pot.broth < COOK.brothOk[0] ? 0.8 : pot.broth > COOK.brothOk[1] ? 0.85 : 1;
      var d = Math.abs(pot.spice - COOK.spice), sf = d === 0 ? 1 : d === 1 ? 0.92 : d === 2 ? 0.8 : pot.spice < COOK.spice ? 0.7 : 0.6;
      return clamp(q * bf * sf * (1 - 0.8 * pot.burn));
    }
    // how fast it catches on the bottom (per second) at a temperature
    function catchRate(temp){
      var T0 = COOK.catchTime;
      if (temp < COOK.catchAt) return 0;
      for (var i = 1; i < T0.length; i++) if (temp <= T0[i][0]){
        var u = (temp - T0[i - 1][0]) / (T0[i][0] - T0[i - 1][0]);
        return 1 / (T0[i - 1][1] + (T0[i][1] - T0[i - 1][1]) * u);
      }
      return 1 / T0[T0.length - 1][1];
    }
    function guest(id){ for (var i = 0; i < state.guests.length; i++) if (state.guests[i].id === id) return state.guests[i]; return null; }
    function carried(){ return state.carry ? state.items[state.carry] : null; }
    function isVeg(kind){ return VEG.indexOf(kind) >= 0; }
    function missing(){ return VEG.filter(function(k){ return state.pot.has[k] < RECIPE.needs[k]; }); }
    function newItem(kind){ var it = { id: state.nextId++, kind: kind, at: 'hand' }; state.items[it.id] = it; state.carry = it.id; return it; }
    function dropItem(it){ delete state.items[it.id]; if (state.carry === it.id) state.carry = null; }
    function cutCount(o){ return o.cut ? o.cut.a.length + o.cut.b.length : 0; }
    function isCut(o){ return !!(o.cut && o.cut.done); }
    // which way the next cut goes ('a' across the length, 'b' across the width), null when it is cut up
    function cutAxis(o){ var p = CUTS[o.kind], c = o.cut; if (!p || isCut(o)) return null; return !c || c.a.length < p.a ? 'a' : 'b'; }
    // where a cut may be made along that way: [lo, hi] in the vegetable's own frame, and how far cuts must be apart
    function cutLimits(o, ax){
      var p = CUTS[o.kind], rg = MODELS[o.kind].range[ax], gap = (rg[1] - rg[0]) * 0.09;
      return { lo: rg[0] + gap, hi: p.dropEnd && ax === 'a' ? rg[1] + gap * 0.5 : rg[1] - gap, gap: gap };
    }
    // Each action checks by itself whether it is allowed and changes nothing if it is not.
    function act(type, arg){
      var pot = state.pot, it = carried(), g;
      switch (type){
        case 'take':       // a vegetable out of its crate
          if (it || !isVeg(arg) || state.crates[arg] <= 0) return false;
          state.crates[arg]--; newItem(arg); return true;
        case 'putBack':    // ... and back into it
          if (!it || !isVeg(it.kind) || it.cut) return false;
          state.crates[it.kind]++; dropItem(it); return true;
        case 'takeBowl':
          if (it || state.bowls <= 0) return false;
          state.bowls--; newItem('bowl'); return true;
        case 'returnBowl':
          if (!it || it.kind !== 'bowl') return false;
          state.bowls++; dropItem(it); return true;
        case 'putDown':    // onto a work surface: arg = { x, y, z }
          if (!it || !arg || HOME[it.kind]) return false;
          it.at = 'surface'; it.x = arg.x; it.y = arg.y; it.z = arg.z; it.rot = arg.rot || 0; state.carry = null; return true;
        case 'pickUp':     // arg = item id
          g = state.items[arg];
          if (it || !g || (g.at !== 'surface' && g.at !== 'board' && g.at !== 'home')) return false;
          if (g.at === 'board'){
            if (!isCut(g) && cutCount(g) > 0) return false;   // half cut: it stays until it is done
            state.board = null;
          }
          g.at = 'hand'; state.carry = g.id; return true;
        case 'putKnife': case 'putHome':   // a tool back to its place (the jug is filled up again there)
          if (!it || !HOME[it.kind]) return false;
          it.at = 'home'; state.carry = null;
          if (it.kind === 'broth'){   // it is filled up from the stock
            var fillUp = Math.min(COOK.jug - it.left, state.broth);
            it.left += fillUp; state.broth -= fillUp;
          }
          return true;
        case 'toBoard':    // a vegetable onto the chopping block: arg = which way it lies
          if (!it || !isVeg(it.kind) || state.board) return false;
          it.at = 'board'; it.rot = +arg || 0; state.board = it.id; state.carry = null; return true;
        case 'turnBoard':  // turn what lies on the block
          g = state.items[state.board]; if (!g) return false;
          g.rot = +arg || 0; return true;
        case 'cut':        // arg = where along the vegetable (in its own frame, metres from its middle)
          g = state.items[state.board];
          if (!it || it.kind !== 'knife' || !g || typeof arg !== 'number') return false;
          var ax = cutAxis(g);
          if (!ax) return false;
          var lim = cutLimits(g, ax), cut = g.cut || { a: [], b: [], done: false, q: 0 };
          if (arg < lim.lo - 1e-6 || arg > lim.hi + 1e-6) return false;
          if (cut[ax].some(function(c){ return Math.abs(c - arg) < lim.gap; })) return false;
          cut[ax].push(arg); cut[ax].sort(function(x, y){ return x - y; }); g.cut = cut;
          var plan = CUTS[g.kind], md = MODELS[g.kind];
          if (cut.a.length >= plan.a && cut.b.length >= plan.b){
            cut.done = true;
            var qa = evenness(cut.a, md.range.a, plan.dropEnd);
            cut.q = plan.b ? (qa + evenness(cut.b, md.range.b, false)) / 2 : qa;
          }
          return true;
        case 'addToPot':
          if (!it || !isVeg(it.kind) || !isCut(it) || (pot.phase !== 'empty' && pot.phase !== 'filling') || pot.has[it.kind] >= RECIPE.needs[it.kind]) return false;
          pot.has[it.kind]++; pot.cut[it.kind] = it.cut; pot.qs.push(it.cut.q); dropItem(it); pot.phase = 'filling';
          return true;
        case 'pour':       // broth from the jug in his hand: arg = how much
          if (!it || it.kind !== 'broth' || !(arg > 0) || (pot.phase !== 'empty' && pot.phase !== 'filling')) return false;
          var amount = Math.min(arg, it.left, COOK.brothMax - pot.broth);
          if (amount <= 0) return false;
          it.left -= amount; pot.broth += amount; pot.phase = 'filling'; return true;
        case 'season':     // one shake from the shaker in his hand
          if (!it || it.kind !== 'spice' || !inPot() || (pot.phase !== 'filling' && pot.phase !== 'ready') || pot.spice >= COOK.spiceMax) return false;
          pot.spice++; return true;
        case 'stir':       // with the ladle: arg = how far it went round (radians)
          if (it || !(arg > 0) || !inPot() || pot.phase === 'burnt') return false;
          pot.stick = Math.max(0, pot.stick - arg / (Math.PI * 2) * COOK.stirTurn); return true;
        case 'open':       // the front door: open or close the restaurant (arg: true / false, else the other way round)
          state.open = typeof arg === 'boolean' ? arg : !state.open; return true;
        case 'heat':       // the range: one step up, after 'high' it is off again (or arg = the level)
          pot.heat = typeof arg === 'number' ? clamp(Math.round(arg), 0, 3) : (pot.heat + 1) % COOK.heat.length; return true;
        case 'dumpPot':    // throw away what burnt
          if (it || pot.phase !== 'burnt') return false;
          emptyPot(); return true;
        case 'ladle':      // one portion from the pot into the empty bowl in his hands
          if (!it || it.kind !== 'bowl' || pot.phase !== 'ready' || pot.portions <= 0) return false;
          it.kind = 'stew'; it.batch = pot.batch; it.q = pot.quality;
          if (--pot.portions <= 0) emptyPot();
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
          g.pay = RECIPE.price + Math.round(RULES.tip * g.patience * (0.4 + 0.6 * (it.q === undefined ? 1 : it.q))); return true;   // quick service and a well made stew tip better
      }
      return false;
    }
    // what happens by itself as time passes
    function tick(dt){
      var pot = state.pot, C = COOK, target = C.target[pot.heat];
      // the temperature follows the heat
      pot.temp += (target - pot.temp) * Math.min(1, (target > pot.temp ? C.warm : C.cool) * dt);
      if (pot.phase === 'filling' || pot.phase === 'ready'){
        // it cooks once everything is in and it is hot enough
        if (pot.phase === 'filling' && !missing().length && pot.broth >= 0.4 && pot.temp >= C.slow){
          pot.cooked += dt / RECIPE.cookTime * (pot.temp >= C.hot ? 1.25 : pot.temp >= C.simmer ? 1 : 0.5);
          if (pot.cooked >= 1){ pot.cooked = 1; pot.phase = 'ready'; pot.portions = RECIPE.portions; pot.batch = state.nextId++; }
        }
        // unstirred it catches on the bottom (sooner with too little broth), then it burns
        if (VEG.some(function(k){ return pot.has[k] > 0; })){
          var rate = catchRate(pot.temp) * (pot.broth < 0.05 ? C.dry : pot.broth < C.brothOk[0] ? C.thick : 1) * (pot.phase === 'ready' ? 0.5 : 1);
          pot.stick = Math.min(1, pot.stick + rate * dt);
          if (pot.stick >= 1) pot.burn += dt / C.burnTime;
          if (pot.temp > C.hot) pot.burn += dt / C.hotBurn;
          if (pot.burn >= 1){ pot.burn = 1; pot.phase = 'burnt'; pot.portions = 0; }
        }
      }
      pot.quality = potQuality();
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
      if (!state.guests.length || !place.pot || !state.open) return;
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
      '.hp-carry.on{opacity:1}' +
      '.hp-open{position:fixed;right:22px;top:58px;display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;background:rgba(15,12,10,.36);' +
      'color:rgba(255,255,255,.85);font:600 13px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;pointer-events:none;user-select:none}' +
      '.hp-open i{width:9px;height:9px;border-radius:50%;background:#9a9a9a}.hp-open.on i{background:#6fd24f;box-shadow:0 0 6px rgba(111,210,79,.8)}';
    document.head.appendChild(css);
    var moneyEl = document.createElement('div'); moneyEl.className = 'hp-money';
    moneyEl.innerHTML = '<span class="hp-coin"></span><span class="hp-amount"></span>'; document.body.appendChild(moneyEl);
    var amountEl = moneyEl.querySelector('.hp-amount');
    var carryEl = document.createElement('div'); carryEl.className = 'hp-carry'; document.body.appendChild(carryEl);
    function euro(n){ return '€' + n; }
    var openEl = document.createElement('div'); openEl.className = 'hp-open'; openEl.innerHTML = '<i></i><span></span>'; document.body.appendChild(openEl);
    var shown = { money: null, carry: null, open: null };

    // ---------- models ------------------------------------------------------------------------
    var gltf = new T.GLTFLoader();
    if (window.MeshoptDecoder) gltf.setMeshoptDecoder(MeshoptDecoder);
    Object.keys(MODELS).forEach(function(key){
      var md = MODELS[key];
      fetch(md.file).then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(buf){ gltf.parse(buf, '', function(g){
          var obj = g.scene, pts = pointsOf(obj), n = pts.length / 3, i, al = new T.Group();
          al.add(obj);
          if (md.align){   // turn it so its length runs along X, its width along Z and its flat side is down
            var fix = alignment(pts);
            al.quaternion.setFromRotationMatrix(fix);
            var v = V();
            for (i = 0; i < n; i++){ v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyMatrix4(fix); pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z; }
          }
          var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], a;
          for (i = 0; i < n; i++) for (a = 0; a < 3; a++){ mn[a] = Math.min(mn[a], pts[i * 3 + a]); mx[a] = Math.max(mx[a], pts[i * 3 + a]); }
          var sx = mx[0] - mn[0], sy = mx[1] - mn[1], sz = mx[2] - mn[2], cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
          var k = md.height ? md.height / sy : md.width / Math.max(sx, sz);
          al.position.set(-cx, -mn[1], -cz);   // standing on the origin
          for (i = 0; i < n; i++){ pts[i * 3] = (pts[i * 3] - cx) * k; pts[i * 3 + 1] = (pts[i * 3 + 1] - mn[1]) * k; pts[i * 3 + 2] = (pts[i * 3 + 2] - cz) * k; }
          obj.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
          var sized = new T.Group(); sized.add(al); sized.scale.setScalar(k);
          var holder = new T.Group(); holder.add(sized);
          md.size = V(sx * k, sy * k, sz * k);
          md.pts = pts;   // its vertices in the game's size, standing on the origin
          if (CUTS[key]){
            var plan = CUTS[key], x0 = -md.size.x / 2, z0 = -md.size.z / 2;
            md.range = { a: [x0 + plan.from * md.size.x, x0 + plan.to * md.size.x], b: [z0 + 0.07 * md.size.z, z0 + 0.93 * md.size.z] };
          }
          if (key === 'knife') md.tool = measureKnife(md);
          if (key === 'broth') md.tool = measureJug(md);
          if (key === 'spice') md.tool = { grip: V(0, md.size.y * 0.45, 0), dir: V(0, 1, 0), up: V(1, 0, 0) };
          if (key === 'ladle') md.tool = { grip: V(0, md.size.y * 0.88, 0), dir: V(0, -1, 0), up: V(1, 0, 0) };   // held near the top, the bowl down
          md.obj = holder;
        }, function(e){ console.error('Could not load ' + md.file + ':', e); }); })
        .catch(function(e){ console.error('Could not load ' + md.file + ':', e); });
    });
    function instance(key){ return MODELS[key].obj.clone(true); }
    // all vertices of a model as [x, y, z, x, y, z, ...] (packed models store whole numbers that stand for fractions)
    function pointsOf(obj){
      var out = [], v = V();
      obj.updateMatrixWorld(true);
      obj.traverse(function(m){
        if (!m.isMesh) return;
        var pos = m.geometry.attributes.position, arr = pos.array;
        var f = !pos.normalized ? 1 : 1 / (arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : 1);
        for (var i = 0; i < pos.count; i++){ v.fromBufferAttribute(pos, i).multiplyScalar(f).applyMatrix4(m.matrixWorld); out.push(v.x, v.y, v.z); }
      });
      return new Float32Array(out);
    }
    // the turn that lays a model along its own length: longest direction -> X (thin end
    // at -X), second -> Z, flattest -> Y
    function alignment(pts){
      var n = pts.length / 3, m = [0, 0, 0], c = [0, 0, 0, 0, 0, 0], i, x, y, z;
      for (i = 0; i < n; i++){ m[0] += pts[i * 3]; m[1] += pts[i * 3 + 1]; m[2] += pts[i * 3 + 2]; }
      m[0] /= n; m[1] /= n; m[2] /= n;
      for (i = 0; i < n; i++){
        x = pts[i * 3] - m[0]; y = pts[i * 3 + 1] - m[1]; z = pts[i * 3 + 2] - m[2];
        c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z;
      }
      var e = eigen3(c), e1 = e[0].vec.normalize(), e2 = e[1].vec.normalize(), e3 = e[2].vec.normalize();
      // which end is the thin one: how far the points near each end lie from the axis
      var lo = 1e9, hi = -1e9, t = new Float32Array(n);
      for (i = 0; i < n; i++){ t[i] = (pts[i * 3] - m[0]) * e1.x + (pts[i * 3 + 1] - m[1]) * e1.y + (pts[i * 3 + 2] - m[2]) * e1.z; lo = Math.min(lo, t[i]); hi = Math.max(hi, t[i]); }
      var sum = [0, 0], cnt = [0, 0];
      for (i = 0; i < n; i++){
        var u = (t[i] - lo) / (hi - lo), end = u < 0.14 ? 0 : u > 0.86 ? 1 : -1;
        if (end < 0) continue;
        x = pts[i * 3] - m[0] - e1.x * t[i]; y = pts[i * 3 + 1] - m[1] - e1.y * t[i]; z = pts[i * 3 + 2] - m[2] - e1.z * t[i];
        sum[end] += x * x + y * y + z * z; cnt[end]++;
      }
      if (sum[0] / Math.max(1, cnt[0]) > sum[1] / Math.max(1, cnt[1])){ e1.negate(); e2.negate(); }
      if (V().crossVectors(e1, e3).dot(e2) < 0) e3.negate();   // keep it a turn, not a mirror image
      return new T.Matrix4().set(e1.x, e1.y, e1.z, 0, e3.x, e3.y, e3.z, 0, e2.x, e2.y, e2.z, 0, 0, 0, 0, 1);
    }
    // the outline of a model where a cut goes through it: the middle and half-sizes of
    // its cross-section at `at` along X ('a') or along Z ('b')
    function section(md, axis, at){
      var pts = md.pts, n = pts.length / 3, ia = axis === 'a' ? 0 : 2, ib = axis === 'a' ? 2 : 0;
      var tol = (axis === 'a' ? md.size.x : md.size.z) * 0.06, lo = [1e9, 1e9], hi = [-1e9, -1e9];
      for (var i = 0; i < n; i++){
        if (Math.abs(pts[i * 3 + ia] - at) > tol) continue;
        var u = pts[i * 3 + ib], y = pts[i * 3 + 1];
        if (u < lo[0]) lo[0] = u; if (u > hi[0]) hi[0] = u; if (y < lo[1]) lo[1] = y; if (y > hi[1]) hi[1] = y;
      }
      if (lo[0] > hi[0]) return { cu: 0, cy: md.size.y / 2, ru: 0.001, ry: 0.001 };
      return { cu: (lo[0] + hi[0]) / 2, cy: (lo[1] + hi[1]) / 2, ru: (hi[0] - lo[0]) / 2 * 0.97, ry: (hi[1] - lo[1]) / 2 * 0.97 };
    }
    // the jug stands upright: its handle is where it reaches out furthest from its axis,
    // its spout is at the top on the other side
    function measureJug(md){
      var pts = md.pts, n = pts.length / 3, H = md.size.y, ax = 0, az = 0, c = 0, i, x, y, z, d;
      for (i = 0; i < n; i++) if (pts[i * 3 + 1] < H * 0.15){ ax += pts[i * 3]; az += pts[i * 3 + 2]; c++; }   // its axis: the middle of its base
      ax /= Math.max(1, c); az /= Math.max(1, c);
      var far = 0, hx = 1, hz = 0;
      for (i = 0; i < n; i++){
        y = pts[i * 3 + 1]; if (y < H * 0.3 || y > H * 0.75) continue;
        x = pts[i * 3] - ax; z = pts[i * 3 + 2] - az; d = Math.hypot(x, z);
        if (d > far){ far = d; hx = x / d; hz = z / d; }
      }
      var spout = V(ax, H, az), best = -1e9, body = 0;
      for (i = 0; i < n; i++){
        x = pts[i * 3] - ax; z = pts[i * 3 + 2] - az; y = pts[i * 3 + 1];
        var t = -(x * hx + z * hz);
        if (y > H * 0.82 && t > best){ best = t; spout.set(pts[i * 3], y, pts[i * 3 + 2]); }
        if (y < H * 0.5 && t > body) body = t;   // the body's radius, measured away from the handle
      }
      return { grip: V(ax + hx * far * 0.86, H * 0.52, az + hz * far * 0.86), dir: V(0, 1, 0), up: V(-hx, 0, -hz),   // up: the way the spout points
               handle: far, body: body, spout: spout };
    }
    // the knife lies along X, handle at -X: where to hold it, where its blade and its edge are
    function measureKnife(md){
      var pts = md.pts, n = pts.length / 3, N = 24, L = md.size.x, x0 = -L / 2, i, k;
      var zlo = new Array(N).fill(1e9), zhi = new Array(N).fill(-1e9), ylo = new Array(N).fill(1e9), yhi = new Array(N).fill(-1e9);
      for (i = 0; i < n; i++){
        k = clamp(Math.floor((pts[i * 3] - x0) / L * N), 0, N - 1);
        zlo[k] = Math.min(zlo[k], pts[i * 3 + 2]); zhi[k] = Math.max(zhi[k], pts[i * 3 + 2]);
        ylo[k] = Math.min(ylo[k], pts[i * 3 + 1]); yhi[k] = Math.max(yhi[k], pts[i * 3 + 1]);
      }
      var wide = 0; for (k = 0; k < N; k++) wide = Math.max(wide, zhi[k] - zlo[k]);
      var first = 0; while (first < N - 1 && zhi[first] - zlo[first] < wide * 0.55) first++;   // the first slice of the blade
      var h0 = Math.max(0, Math.round(first * 0.3)), h1 = Math.max(h0 + 1, Math.round(first * 0.85));   // the part of the handle the fist closes around
      var gz = 0, gy = 0, cnt = 0;
      for (k = h0; k < h1; k++){ gz += (zlo[k] + zhi[k]) / 2; gy += (ylo[k] + yhi[k]) / 2; cnt++; }
      gz /= cnt; gy /= cnt;
      var bz0 = 1e9, bz1 = -1e9; for (k = first; k < N; k++){ bz0 = Math.min(bz0, zlo[k]); bz1 = Math.max(bz1, zhi[k]); }
      var edge = (bz0 + bz1) / 2 >= gz ? 1 : -1;   // the blade hangs below the handle's line: that side is its edge
      var gx = x0 + (h0 + h1) / 2 / N * L, bx = x0 + (first + N) / 2 / N * L;
      return { grip: V(gx, gy, gz), dir: V(1, 0, 0), up: V(0, 0, -edge),
               edgeDrop: Math.abs((edge > 0 ? bz1 : bz0) - gz),     // from the handle's line down to the edge
               bladeMid: bx - gx, bladeLen: (N - first) / N * L };  // from the fist to the middle of the blade
    }
    function allLoaded(){ return Object.keys(MODELS).every(function(k){ return MODELS[k].obj; }); }

    // ---------- cut vegetables ------------------------------------------------------------------
    // A cut vegetable is drawn as its own model once per piece, each clipped to its piece
    // and moved a little apart, with a flat face where a cut went through.
    var capGeo = new T.CircleGeometry(1, 24), capTexs = {};
    function capTex(kind){
      if (capTexs[kind]) return capTexs[kind];
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g = cv.getContext('2d'), col = CUTS[kind].cap, gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = kind === 'onion' ? 'rgba(170,150,110,.5)' : 'rgba(120,70,20,.22)'; g.lineWidth = kind === 'onion' ? 1.6 : 1.2;
      (kind === 'onion' ? [8, 14, 20, 26] : kind === 'carrot' ? [11] : []).forEach(function(r){ g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); });
      var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
      return (capTexs[kind] = t);
    }
    // the clipping planes are kept in the piece's own frame and brought into the world right before it is drawn
    function clipTo(mesh, cell, local){
      if (!local.length) return;
      var world = local.map(function(){ return new T.Plane(); });
      mesh.material = mesh.material.clone(); mesh.material.clippingPlanes = world;
      mesh.onBeforeRender = function(){ for (var k = 0; k < local.length; k++) world[k].copy(local[k]).applyMatrix4(cell.matrixWorld); };
    }
    function capFace(kind, axis, at, side, cell, clip){
      var sc = section(MODELS[kind], axis, at);
      var m = new T.Mesh(capGeo, new T.MeshStandardMaterial({ map: capTex(kind), roughness: 0.78, metalness: 0, side: T.DoubleSide }));
      if (axis === 'a'){ m.rotation.y = Math.PI / 2; m.position.set(at - side * 0.0005, sc.cy, sc.cu); }
      else m.position.set(sc.cu, sc.cy, at - side * 0.0005);
      m.scale.set(sc.ru, sc.ry, 1); m.receiveShadow = true; m.userData.noOutline = true;
      clipTo(m, cell, clip);
      return m;
    }
    // apart: the pieces have fallen apart (cut up completely): slices lean on one another
    // like fallen dominoes, cubes and chunks spread out and turn a little
    function makeCut(kind, cut, apart){
      var plan = CUTS[kind], md = MODELS[kind], grp = new T.Group();
      if (!cut || !(cut.a.length + cut.b.length)){ grp.add(instance(kind)); return grp; }
      var xs = [-Infinity].concat(cut.a, [Infinity]), zs = [-Infinity].concat(cut.b, [Infinity]);
      var nx = xs.length - 1 - (plan.dropEnd && cut.done ? 1 : 0), nz = zs.length - 1, gap = 0.007;
      var hx = md.size.x / 2, hz = md.size.z / 2, slices = !plan.b;
      for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++){
        // each piece hangs in a pivot at its own middle, so it can turn and lean there
        var cx = (Math.max(xs[i], -hx) + Math.min(xs[i + 1], hx)) / 2, cz = (Math.max(zs[j], -hz) + Math.min(zs[j + 1], hz)) / 2;
        var pivot = new T.Group(), cell = new T.Group(), px = [], pz = [];
        cell.position.set(-cx, 0, -cz); pivot.add(cell);
        pivot.position.set(cx + (i - (nx - 1) / 2) * gap, 0, cz + (j - (nz - 1) / 2) * gap);
        if (apart && slices){
          var sec = section(md, 'a', cx), low = Math.max(0, sec.cy - sec.ry);
          cell.position.y = -low; pivot.position.y = low;                       // it leans around its lowest point
          pivot.rotation.z = -(0.5 + rnd(-0.08, 0.08)); pivot.rotation.y = rnd(-0.12, 0.12);
          pivot.position.x += (i - (nx - 1) / 2) * 0.006; pivot.position.z += rnd(-0.006, 0.006);
        } else if (apart){
          pivot.position.x += cx * 0.42 + rnd(-0.004, 0.004); pivot.position.z += cz * 0.42 + rnd(-0.004, 0.004);   // spread out from the middle
          pivot.rotation.y = rnd(-0.3, 0.3);
        }
        if (isFinite(xs[i])) px.push(new T.Plane(V(1, 0, 0), -xs[i]));
        if (isFinite(xs[i + 1])) px.push(new T.Plane(V(-1, 0, 0), xs[i + 1]));
        if (isFinite(zs[j])) pz.push(new T.Plane(V(0, 0, 1), -zs[j]));
        if (isFinite(zs[j + 1])) pz.push(new T.Plane(V(0, 0, -1), zs[j + 1]));
        var body = instance(kind), all = px.concat(pz), firstCell = i === 0 && j === 0;
        body.traverse(function(m){ if (m.isMesh){ clipTo(m, cell, all); m.castShadow = firstCell; } });
        cell.add(body);
        if (isFinite(xs[i])) cell.add(capFace(kind, 'a', xs[i], -1, cell, pz));
        if (isFinite(xs[i + 1])) cell.add(capFace(kind, 'a', xs[i + 1], 1, cell, pz));
        if (isFinite(zs[j])) cell.add(capFace(kind, 'b', zs[j], -1, cell, px));
        if (isFinite(zs[j + 1])) cell.add(capFace(kind, 'b', zs[j + 1], 1, cell, px));
        grp.add(pivot);
      }
      return grp;
    }

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
    // The pot's panel: heat and temperature (with the range it cooks in), what is still
    // missing or how far it has cooked, when to stir, how much it is seasoned, and the
    // portions left when it is done.
    function drawPanel(pn, pot, blink){
      var need = missing().map(function(k){ return KINDS[k].many; });
      if (pot.broth < COOK.brothOk[0] - 0.02) need.push('broth');
      var warn = pot.stick >= 1 ? 2 : pot.stick >= 0.6 ? 1 : 0;
      var key = [pot.phase, pot.heat, Math.round(pot.temp), Math.round(pot.cooked * 60), warn, warn === 2 && blink ? 1 : 0, pot.spice, pot.portions, need.join(), Math.round(pot.burn * 10)].join('|');
      if (pn.drawn === key) return; pn.drawn = key;
      var g = pn.g, W = 256, H = 168;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,252,244,.95)'; g.strokeStyle = 'rgba(40,28,20,.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(16, 3); g.arcTo(W - 3, 3, W - 3, H - 3, 14); g.arcTo(W - 3, H - 3, 3, H - 3, 14); g.arcTo(3, H - 3, 3, 3, 14); g.arcTo(3, 3, W - 3, 3, 14); g.closePath(); g.fill(); g.stroke();
      g.textBaseline = 'middle';
      // heat and temperature
      g.font = '700 21px system-ui,"Segoe UI",sans-serif'; g.fillStyle = '#3a2a20'; g.textAlign = 'left';
      g.fillText('Heat: ' + COOK.heat[pot.heat], 16, 24);
      g.textAlign = 'right'; g.fillText(Math.round(pot.temp) + '\u00b0', W - 16, 24);
      // the thermometer: too cool, slow, simmering (good), too hot
      var x0 = 16, x1 = W - 16, t0 = 20, t1 = 125, by = 42, bh = 13;
      function tx(t){ return x0 + (x1 - x0) * clamp((t - t0) / (t1 - t0)); }
      [[t0, COOK.slow, '#c3ccd2'], [COOK.slow, COOK.simmer, '#e6c34a'], [COOK.simmer, COOK.hot, '#62a646'], [COOK.hot, t1, '#cf4a32']].forEach(function(z){
        g.fillStyle = z[2]; g.fillRect(tx(z[0]), by, tx(z[1]) - tx(z[0]), bh);
      });
      var mx = tx(pot.temp);
      g.fillStyle = '#2a1d15'; g.beginPath(); g.moveTo(mx, by + bh + 2); g.lineTo(mx - 7, by + bh + 13); g.lineTo(mx + 7, by + bh + 13); g.closePath(); g.fill();
      g.fillRect(mx - 1.5, by - 2, 3, bh + 4);
      // what is going on
      g.textAlign = 'left'; g.font = '600 18px system-ui,"Segoe UI",sans-serif'; g.fillStyle = '#3a2a20';
      if (pot.phase === 'burnt'){ g.fillStyle = '#b3321f'; g.font = '800 24px system-ui,"Segoe UI",sans-serif'; g.fillText('BURNT', 16, 96); }
      else if (pot.phase === 'ready'){ g.font = '800 23px system-ui,"Segoe UI",sans-serif'; g.fillStyle = '#3f7d2c'; g.fillText('READY  \u00d7' + pot.portions, 16, 96); }
      else if (need.length){
        g.fillText('Needs:', 16, 88); g.font = '500 16px system-ui,"Segoe UI",sans-serif';
        g.fillText(need.join(', '), 16, 109);
      } else {   // cooking: how far it is
        g.fillText(pot.temp < COOK.slow ? 'Too cool to cook' : 'Cooking', 16, 86);
        g.fillStyle = 'rgba(60,45,35,.16)'; g.fillRect(16, 100, W - 32, 12);
        g.fillStyle = '#d9862a'; g.fillRect(16, 100, (W - 32) * clamp(pot.cooked), 12);
      }
      // seasoning: a dot per shake, the right amount marked
      var sy = 142;
      for (var i = 0; i < 6; i++){
        g.beginPath(); g.arc(24 + i * 19, sy, 6, 0, Math.PI * 2);
        g.fillStyle = i < pot.spice ? (pot.spice > COOK.spice + 1 ? '#cf4a32' : '#7a5a2a') : 'rgba(60,45,35,.14)'; g.fill();
      }
      g.strokeStyle = '#3f7d2c'; g.lineWidth = 2.5; g.beginPath(); g.arc(24 + (COOK.spice - 1) * 19, sy, 9.5, 0, Math.PI * 2); g.stroke();
      // stir!
      if (warn && pot.phase !== 'burnt' && !(warn === 2 && blink)){
        g.textAlign = 'right'; g.font = '800 22px system-ui,"Segoe UI",sans-serif'; g.fillStyle = warn === 2 ? '#cf4a32' : '#d9862a';
        g.fillText(pot.broth < 0.05 ? 'ADD BROTH!' : 'STIR!', W - 16, sy);
      }
      pn.tex.needsUpdate = true;
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
    var panel = (function(){
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 168;
      var tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(0.58, 0.38, 1); sp.visible = false; sp.renderOrder = 6; root.add(sp);
      return { sp: sp, g: cv.getContext('2d'), tex: tex, drawn: '' };
    })();
    // flames under the pot
    var flameTex = (function(){
      var cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
      var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
      gr.addColorStop(0, 'rgba(80,140,255,.95)'); gr.addColorStop(0.45, 'rgba(120,190,255,.8)'); gr.addColorStop(0.8, 'rgba(255,190,90,.55)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(16, 0); g.bezierCurveTo(30, 30, 30, 52, 16, 64); g.bezierCurveTo(2, 52, 2, 30, 16, 0); g.fill();
      return new T.CanvasTexture(cv);
    })();
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
    var place = { pot: null, crates: {}, stacks: null, board: null, knifeHome: null };
    var knifeHold = null, toolHold = {};   // how the tools are held (see gameplay.js: a tool)
    var STEW_COL = new T.Color(0x9a938c), BURNT_COL = new T.Color(0x1d1612);
    var CRATE_GRID = [[-0.19, -0.075], [0, -0.075], [0.19, -0.075], [-0.19, 0.085], [0, 0.085], [0.19, 0.085]];
    function buildPlaces(){
      var k = ctx.getKitchen();
      if (place.pot || !allLoaded() || !k || !k.potAt || !k.bowlsAt || !k.board) return;
      // the chopping block is the cutting station; the cleaver that lay on it is the knife.
      // (the kitchen's own block model has the cleaver fixed to it: ours replaces it)
      k.board.obj.visible = false;
      var bo = instance('board'); bo.position.copy(k.board.pos); bo.rotation.y = 0.6; root.add(bo);
      place.board = { obj: bo, r: MODELS.board.size.x / 2, pos: V(k.board.pos.x, k.board.pos.y + MODELS.board.size.y, k.board.pos.z) };
      place.knifeHome = V(k.board.pos.x, k.board.pos.y, k.board.pos.z - place.board.r - 0.17);
      // where the tools lie: the knife beside the block, jug and shaker on the range beside the pot
      var jt = MODELS.broth.tool;
      place.home = { knife: { pos: place.knifeHome, rot: 0.25 },
                     broth: { pos: V(k.potAt.x - 0.03, k.potAt.y, k.potAt.z + 0.8), rot: Math.atan2(jt.up.z, jt.up.x) },   // its handle toward the aisle
                     spice: { pos: V(k.potAt.x - 0.3, k.potAt.y, k.potAt.z + 0.53), rot: 0.4 } };
      function holdOf(kind, pose, more){
        var t = MODELS[kind].tool, o = { tool: true, grip: t.grip, dir: t.dir, up: t.up, lean: 0.3, pose: pose };
        Object.keys(more || {}).forEach(function(key){ o[key] = more[key]; });
        return o;
      }
      knifeHold = holdOf('knife', knifePose, { lean: 0.34 });
      toolHold = { knife: knifeHold, broth: holdOf('broth', jugPose, { upright: true }), spice: holdOf('spice', spicePose, { upright: true }), ladle: holdOf('ladle', ladlePose) };
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
      stew.rotation.x = -Math.PI / 2; stew.visible = false; stew.receiveShadow = true; stew.material.transparent = true; pg.add(stew);
      // the broth before it has turned into stew, the line it should reach, the seasoning on top
      var liquid = new T.Mesh(new T.CircleGeometry(inner, 40), new T.MeshStandardMaterial({ color: new T.Color(0xc79a3a).convertSRGBToLinear(), roughness: 0.6, metalness: 0, transparent: true, opacity: 0.9 }));
      liquid.rotation.x = -Math.PI / 2; liquid.visible = false; liquid.receiveShadow = true; pg.add(liquid);
      var line = new T.Mesh(new T.TorusGeometry(inner * 0.985, 0.004, 6, 56), new T.MeshBasicMaterial({ color: 0xfff1c4 }));
      line.rotation.x = Math.PI / 2; line.visible = false; pg.add(line);
      var scv = document.createElement('canvas'); scv.width = scv.height = 128;
      var stex = new T.CanvasTexture(scv);
      var specks = new T.Mesh(new T.CircleGeometry(inner * 0.96, 32), new T.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false }));
      specks.rotation.x = -Math.PI / 2; specks.visible = false; pg.add(specks);
      var flames = [];
      for (var fi = 0; fi < 10; fi++){
        var fs2 = new T.Sprite(new T.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false }));
        var fa = fi / 10 * Math.PI * 2;
        fs2.position.set(Math.cos(fa) * size.x * 0.415, 0, Math.sin(fa) * size.x * 0.415); fs2.visible = false;   // just outside the pot's wall
        pg.add(fs2); flames.push(fs2);
      }
      var veg = {};
      VEG.forEach(function(kind, i){
        var v = new T.Group(), a = i * 2.1;   // filled with the cut pieces when they are put in
        v.position.set(Math.cos(a) * inner * 0.45, size.y * 0.23, Math.sin(a) * inner * 0.45); v.rotation.y = a; v.visible = false;
        pg.add(v); veg[kind] = v;
      });
      var ladle = instance('ladle'); pg.add(ladle);
      place.pot = { grp: pg, model: pm, pos: pg.position, size: size, inner: inner, stew: stew, veg: veg, ladle: ladle,
                    liquid: liquid, line: line, specks: { mesh: specks, g: scv.getContext('2d'), tex: stex, drawn: -1 }, flames: flames,
                    floor: size.y * 0.24, level: size.y * 0.24, spin: 0,
                    ladleTool: instance('ladle'),                                    // the same ladle in the chef's hand while he stirs
                    knob: V(k.potAt.x - 0.6, 0, k.potAt.z),                          // the range's knobs are at its front
                    stream: (function(){   // the broth running from the jug
                      var geo = new T.CylinderGeometry(0.011, 0.016, 1, 8); geo.translate(0, -0.5, 0);
                      var m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(0xc79a3a).convertSRGBToLinear(), roughness: 0.4, transparent: true, opacity: 0.92 }));
                      m.visible = false; root.add(m); return m;
                    })(),
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
      if (place.board && Math.hypot(place.board.pos.x - x, place.board.pos.z - z) < place.board.r + 0.12) ok = false;      // the chopping block
      if (place.knifeHome && Math.abs(place.knifeHome.x - x) < 0.34 && Math.abs(place.knifeHome.z - z) < 0.2) ok = false;   // the knife's place
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.at === 'surface' && Math.hypot(o.x - x, o.z - z) < (o.kind === 'bowl' || o.kind === 'stew' ? 0.36 : 0.24)) ok = false;
      });
      return ok;
    }

    // ---------- ladling: the ladle lifts a portion out of the pot into the bowl ---------------
    var scoop = null;   // { t: 0..1, item }
    var SCOOP_TIME = 1.25, POUR_AT = 0.68;

    // ---------- cutting: the mouse leads the knife over the vegetable on the block --------------
    // Sideways it moves the knife along the vegetable, pulling it down brings the blade
    // down through it: that is a cut. The vegetable lies across in front of the chef;
    // when the cuts across its length are done it is turned by a quarter for the others.
    var cutting = null;   // { look (where he faces), th, f, r (the knife's direction and the vegetable's, see below), x (along the vegetable), h (blade height 1..0), armed, cool, end }
    var CUT = { side: 0.00075, down: 0.0055, lift: 0.14, slant: 0.42 };   // slant: the knife is held a little across, so its blade can be seen
    var note = { text: '', t: 0 };   // a short message, e.g. how well it was cut
    function say(text){ note.text = text; note.t = 3.2; }
    function lieAcross(){   // the next cuts go across what lies left to right in front of him
      var o = state.items[state.board], ax = o && cutAxis(o);
      if (ax) act('turnBoard', ax === 'b' ? cutting.th - Math.PI / 2 : cutting.th + Math.PI);
    }
    function startCutting(){
      var chef = ctx.getChef(), o = state.items[state.board];
      if (cutting || !o || !cutAxis(o)) return;
      var f0 = V(place.board.pos.x - chef.position.x, 0, place.board.pos.z - chef.position.z).normalize(), look = Math.atan2(f0.x, f0.z);
      // the blade points away from him and a little to the left (he holds it in his right
      // hand); the vegetable lies square to the blade
      var th = look + CUT.slant;
      cutting = { look: look, th: th, f: V(Math.sin(th), 0, Math.cos(th)), r: V(-Math.cos(th), 0, Math.sin(th)), x: 0, h: 1, armed: true, cool: 0.15, end: -1 };
      lieAcross();
      var lim = cutLimits(o, cutAxis(o)); cutting.x = clamp(0, lim.lo, lim.hi);
    }
    function stopCutting(){ cutting = null; }
    function chop(){
      var o = state.items[state.board], before = cutAxis(o), ok = act('cut', cutting.x);
      chopSound(ok);
      if (!ok){ cutting.cool = 0.22; say('Too close to another cut'); return; }
      cutting.cool = 0.3;
      if (isCut(o)){
        cutting.end = 0.75;
        say(o.cut.q >= 0.75 ? 'Evenly cut – very good!' : o.cut.q >= 0.45 ? 'Decently cut' : 'Roughly cut');
      } else if (cutAxis(o) !== before){   // turn it for the cuts the other way
        lieAcross(); cutting.cool = 0.65;
        var lim = cutLimits(o, cutAxis(o)); cutting.x = clamp(0, lim.lo, lim.hi);
      }
    }
    // the mouse while cutting (called from index.html; true = the movement was used here)
    function mouse(dx, dy){
      if (pouring){ pouring.tilt = clamp(pouring.tilt + dy * 0.0045); return true; }   // pulled down it tips further
      if (stirring){
        var S = stirring, P = place.pot, k = 0.0011, lim = P.inner * 0.7;
        var r0 = Math.hypot(S.x, S.z), a0 = Math.atan2(S.z, S.x);
        S.x += (S.r.x * dx - S.f.x * dy) * k; S.z += (S.r.z * dx - S.f.z * dy) * k;   // sideways and away from him / toward him
        var r1 = Math.hypot(S.x, S.z);
        if (r1 > lim){ S.x *= lim / r1; S.z *= lim / r1; r1 = lim; }
        if (r0 > P.inner * 0.15 && r1 > P.inner * 0.15){   // going round the middle is what stirs
          var da = angle(Math.atan2(S.z, S.x) - a0);
          if (Math.abs(da) > 1e-4 && act('stir', Math.abs(da))) P.spin += da * 3.2;
        }
        return true;
      }
      if (!cutting) return false;
      var o = state.items[state.board];
      if (!o || cutting.cool > 0 || cutting.end >= 0 || !cutAxis(o)) return true;
      var lim = cutLimits(o, cutAxis(o));
      if (cutting.h > 0.55) cutting.x = clamp(cutting.x + dx * CUT.side, lim.lo, lim.hi);   // the blade is clear of the vegetable
      cutting.h = clamp(cutting.h - dy * CUT.down);
      if (cutting.h >= 0.6) cutting.armed = true;
      if (cutting.h <= 0.03 && cutting.armed){ cutting.armed = false; chop(); }
      return true;
    }
    window.addEventListener('mousedown', function(e){ if (e.button === 2){ if (cutting) stopCutting(); if (pouring) stopPour(); if (stirring) stopStir(); } });
    // where the knife is while it is led (see knifeHold): its blade above the cut, the handle toward the chef
    function knifePose(out){
      if (!cutting || !place.board) return false;
      var kt = MODELS.knife.tool, B = place.board.pos;
      out.pos.copy(B).addScaledVector(cutting.r, cutting.x).addScaledVector(cutting.f, -kt.bladeMid);
      out.pos.y = B.y + 0.004 + cutting.h * CUT.lift + kt.edgeDrop;
      out.dir.copy(cutting.f); out.dir.y = 0.12 * cutting.h; out.dir.normalize();   // the tip a little up while it is lifted
      out.up.set(0, 1, 0);
      return true;
    }
    // ---------- at the pot: pouring broth, stirring, seasoning ------------------------------------
    // Pouring: pulling the mouse down tips the jug, the further the faster it runs.
    // Stirring: the mouse leads the ladle round in the pot. Seasoning: a shake per click.
    var pouring = null;    // { look, f, tilt (0..1), flow }
    var stirring = null;   // { look, f, r, x, z (where the ladle is in the pot) }
    var shake = null;      // { t (0..1), f }
    function facePot(){
      var chef = ctx.getChef(), P = place.pot.pos, f = V(P.x - chef.position.x, 0, P.z - chef.position.z).normalize(), th = Math.atan2(f.x, f.z);
      return { look: th, f: f, r: V(-Math.cos(th), 0, Math.sin(th)) };
    }
    function startPour(){ if (!pouring){ pouring = facePot(); pouring.tilt = 0; pouring.flow = 0; } }
    function stopPour(){ pouring = null; }
    function startStir(){
      if (stirring || carried()) return;
      stirring = facePot(); stirring.x = -stirring.f.x * place.pot.inner * 0.45; stirring.z = -stirring.f.z * place.pot.inner * 0.45;
      play.setCarry(place.pot.ladleTool, toolHold.ladle); shown.carry = 'tool';
    }
    function stopStir(){ if (!stirring) return; stirring = null; play.setCarry(null); shown.carry = null; }
    function seasonOnce(){
      if (!act('season')) return;
      shake = facePot(); shake.t = 0;
      shakeSound();
    }
    // where the tools are while they are led (see toolHold)
    function jugPose(out){
      if (!pouring) return false;
      // it stands to the right of the pot (so the pot stays in view) and tips over its rim to the left
      var P = place.pot, jt = MODELS.broth.tool, a = pouring.tilt * 1.45, f = pouring.f, r = pouring.r;
      var to = V(-r.x * 0.96 + f.x * 0.28, 0, -r.z * 0.96 + f.z * 0.28).normalize();   // the way it pours: toward the pot's middle
      out.pos.copy(P.pos).addScaledVector(to, -(P.inner * 0.42 + jt.body * 0.6 + jt.handle)); out.pos.y = P.pos.y + P.size.y + 0.07 + jt.grip.y;
      out.dir.set(0, Math.cos(a), 0).addScaledVector(to, Math.sin(a));
      out.up.copy(to).multiplyScalar(Math.cos(a)); out.up.y = -Math.sin(a);   // the spout points to the pot and down
      return true;
    }
    function ladlePose(out){
      if (!stirring) return false;
      var P = place.pot, S = stirring, tip = V(P.pos.x + S.x, P.pos.y + P.level + 0.012, P.pos.z + S.z);
      var back = V(-S.f.x * 0.3, 0.5, -S.f.z * 0.3).normalize();              // the handle comes up toward him
      out.pos.copy(tip).addScaledVector(back, MODELS.ladle.size.y * 0.88);
      out.dir.copy(back).negate(); out.up.copy(S.r);
      return true;
    }
    function spicePose(out){
      if (!shake) return false;
      var P = place.pot, f = shake.f, r = shake.r;
      out.pos.copy(P.pos).addScaledVector(r, P.inner * 0.95).addScaledVector(f, P.inner * 0.1); out.pos.y = P.pos.y + P.size.y + 0.19 + 0.03 * Math.sin(shake.t * Math.PI * 4);
      out.dir.set(-r.x * 0.75, -0.66, -r.z * 0.75).normalize();               // tipped over the pot from its right
      out.up.copy(shake.r);
      return true;
    }
    function shakeSound(){
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        for (var b = 0; b < 2; b++){
          var t = audio.currentTime + b * 0.11, n = Math.floor(audio.sampleRate * 0.05), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
          for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
          var src = audio.createBufferSource(); src.buffer = buf;
          var flt = audio.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 4200;
          var gn = audio.createGain(); gn.gain.value = 0.22;
          src.connect(flt); flt.connect(gn); gn.connect(audio.destination); src.start(t);
        }
      } catch (e) { /* no sound then */ }
    }

    // a short chop: the blade going through, then hitting the wood
    var audio = null;
    function chopSound(ok){
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        var t = audio.currentTime, n = Math.floor(audio.sampleRate * 0.09), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
        var src = audio.createBufferSource(); src.buffer = buf;
        var flt = audio.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = ok ? 1700 : 520; flt.Q.value = 0.8;
        var gn = audio.createGain(); gn.gain.value = ok ? 0.5 : 0.28;
        src.connect(flt); flt.connect(gn); gn.connect(audio.destination); src.start(t);
        var osc = audio.createOscillator(), og = audio.createGain();
        osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        og.gain.setValueAtTime(0.32, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(og); og.connect(audio.destination); osc.start(t); osc.stop(t + 0.11);
      } catch (e) { /* no sound then */ }
    }

    var DOOR = V(-1.3, 0, 9.9);   // the entrance door in the front wall (decor.js)
    // ---------- what the chef can do: F picks up / puts down, E uses ---------------------------
    function list(words){ return words.join(', ').replace(/, ([^,]*)$/, ' and $1'); }
    play.addInteractables(function(hands){
      var out = [], it = carried(), pot = state.pot;
      if (!place.pot) return out;
      if (cutting) return [{ pos: place.board.pos, reach: 9, key: 'E', label: 'Stop cutting', use: stopCutting }];
      if (pouring) return [{ pos: place.pot.pos, reach: 9, key: 'E', label: 'Stop pouring', use: stopPour }];
      if (stirring) return [{ pos: place.pot.pos, reach: 9, key: 'E', label: 'Stop stirring', use: stopStir }];
      function add(e){ out.push(e); }
      var free = !it && hands.handsFree;
      // the crates
      VEG.forEach(function(kind){
        var c = place.crates[kind], K = KINDS[kind], e = { pos: c.pos, reach: RULES.reach, key: 'F' };
        if (it && it.kind === kind && !it.cut){ e.label = 'Put ' + K.the + ' back'; e.use = function(){ act('putBack'); }; }
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
        add({ pos: V(o.x, 0, o.z), reach: RULES.itemReach, key: 'F', label: 'Pick up ' + nameOf(o, 'the'), use: function(){ act('pickUp', o.id); }, obj: objs[o.id] && objs[o.id].obj });
      });
      // putting down what he carries, where he looks
      // the chopping block and the knife beside it
      var B = place.board, onBoard = state.board ? state.items[state.board] : null, knife = state.items[state.knife];
      function see(o){ return objs[o.id] && objs[o.id].obj; }
      if (it && isVeg(it.kind)){
        add(onBoard ? { pos: B.pos, reach: RULES.reach, key: 'F', label: 'The block is taken' }
                    : { pos: B.pos, reach: RULES.reach, key: 'F', label: 'Put ' + nameOf(it, 'the') + ' on the block', use: function(){ act('toBoard', ctx.getChef().rotation.y + Math.PI); }, obj: B.obj });
      } else if (it && it.kind === 'knife'){
        add({ pos: place.knifeHome, reach: RULES.reach, key: 'F', label: 'Put the knife down', use: function(){ act('putKnife'); } });
        if (onBoard && cutAxis(onBoard)) add({ pos: B.pos, reach: RULES.cutReach, key: 'LMB', label: 'Cut ' + KINDS[onBoard.kind].the, use: startCutting, obj: see(onBoard) });
        else add({ pos: B.pos, reach: RULES.reach, key: 'LMB', label: onBoard ? 'It is cut up already' : 'Put a vegetable on the block first' });
      } else if (free){
        if (knife.at === 'home') add({ pos: place.knifeHome, reach: RULES.reach, key: 'F', label: 'Take the knife', use: function(){ act('pickUp', knife.id); }, obj: see(knife) });
        if (onBoard){
          add(!isCut(onBoard) && cutCount(onBoard) > 0
            ? { pos: B.pos, reach: RULES.reach, key: 'F', label: 'Finish cutting ' + KINDS[onBoard.kind].the + ' first' }
            : { pos: B.pos, reach: RULES.reach, key: 'F', label: 'Pick up ' + nameOf(onBoard, 'the'), use: function(){ act('pickUp', onBoard.id); }, obj: see(onBoard) });
        }
      }
      // the jug of broth and the spice shaker on the range
      ['broth', 'spice'].forEach(function(kind){
        var o = state.items[state.tools[kind]], at = place.home[kind].pos;
        var more = kind === 'broth' && o.left < COOK.jug - 0.05 && state.broth > 0.01;
        if (it === o) add({ pos: at, reach: RULES.reach, key: 'F', label: 'Put ' + KINDS[kind].the + ' back' + (more ? ' and fill it up' : ''), use: function(){ act('putHome'); } });
        else if (free && o.at === 'home') add({ pos: at, reach: RULES.reach, key: 'F', label: 'Take ' + KINDS[kind].the, use: function(){ act('pickUp', o.id); }, obj: see(o) });
      });
      if (it && !HOME[it.kind] && aim && !scoop){
        if (aim.free) add({ pos: V(aim.x, 0, aim.z), reach: 2.4, key: 'F', bias: 0.35, label: 'Put ' + nameOf(it, 'the') + ' down', use: function(){ if (aim && aim.free) act('putDown', aim); } });
        else add({ pos: V(aim.x, 0, aim.z), reach: 2.4, key: 'F', bias: 0.35, label: 'No room here' });
      }
      // the pot: E puts things in and ladles, the left button works with the tool in hand
      // (jug, shaker) or, with free hands, stirs with the ladle
      var pe = { pos: place.pot.pos, reach: RULES.reach, key: 'E' }, ready = pot.phase === 'ready', burnt = pot.phase === 'burnt', some = inPot();
      if (scoop) pe = null;
      else if (burnt){
        if (free){ pe.label = 'Throw the burnt stew away'; pe.use = function(){ act('dumpPot'); }; pe.obj = place.pot.model; }
        else pe.label = 'The stew is burnt';
      } else if (it && isVeg(it.kind)){
        if (!isCut(it)) pe.label = 'Cut ' + KINDS[it.kind].the + ' up first';
        else if (ready) pe.label = 'The stew is done already';
        else if (pot.has[it.kind] >= RECIPE.needs[it.kind]) pe.label = 'There is enough ' + it.kind + ' in the pot';
        else { pe.label = 'Put ' + nameOf(it, 'the') + ' in the pot'; pe.use = function(){ act('addToPot'); }; pe.obj = place.pot.model; }
      } else if (it && it.kind === 'bowl'){
        if (ready){ pe.label = 'Ladle a portion'; pe.use = function(){ if (act('ladle')) scoop = { t: 0, item: it.id }; }; pe.obj = place.pot.model; }
        else pe.label = some ? 'The stew is not ready yet' : 'The pot is empty';
      } else if (it && it.kind === 'stew'){
        if (ready && it.batch === pot.batch && pot.portions < RECIPE.portions){ pe.label = 'Pour it back'; pe.use = function(){ act('pourBack'); }; }
        else pe = null;
      } else if (it && it.kind === 'broth'){
        pe.key = 'LMB';
        if (ready) pe.label = 'The stew is done already';
        else if (it.left <= 0.01) pe.label = state.broth > 0.01 ? 'The jug is empty \u2013 fill it up at its place' : 'There is no broth left';
        else if (pot.broth >= COOK.brothMax - 0.01) pe.label = 'The pot is full';
        else { pe.label = 'Pour broth'; pe.use = startPour; pe.obj = place.pot.model; }
      } else if (it && it.kind === 'spice'){
        pe.key = 'LMB';
        if (!some) pe.label = 'Nothing in the pot to season';
        else { pe.label = 'Season'; pe.use = seasonOnce; pe.obj = place.pot.model; }
      } else if (free && some){ pe.key = 'LMB'; pe.label = 'Stir'; pe.use = startStir; pe.obj = place.pot.ladle; }
      else if (free) pe = null;
      else pe = null;
      if (pe) add(pe);
      // the heat (with free hands, or with jug or shaker in hand)
      if (!burnt && !scoop && (free || (it && (it.kind === 'broth' || it.kind === 'spice')))){
        add({ pos: place.pot.knob, reach: RULES.reach, key: 'E', label: 'Heat: ' + COOK.heat[pot.heat] + ' \u2192 ' + COOK.heat[(pot.heat + 1) % COOK.heat.length], use: function(){ act('heat'); } });
      }
      // the front door: opening and closing the restaurant
      add({ pos: DOOR, reach: 2.4, key: 'E', label: state.open ? 'Close the restaurant' : 'Open the restaurant', use: function(){ act('open'); } });
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
    function nameOf(o, form){
      var K = KINDS[o.kind];
      if (isVeg(o.kind) && isCut(o)) return (form === 'the' ? 'the ' : '') + K.cutName;
      return K[form];
    }
    // what an item looks like right now (a bowl being filled still looks empty until the ladle has poured)
    function lookOf(o){
      var kind = scoop && scoop.item === o.id && scoop.t < POUR_AT ? 'bowl' : o.kind;
      return kind + (o.cut ? '#' + o.cut.a.length + '.' + o.cut.b.length + (o.cut.done ? 'd' : '') : '');
    }
    function syncItems(dt){
      var it = carried();
      Object.keys(objs).forEach(function(id){
        if (state.items[id]) return;
        if (objs[id].obj.parent) objs[id].obj.parent.remove(objs[id].obj);
        delete objs[id];
      });
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id], want = lookOf(o), v = objs[id], rot;
        if (v && v.look !== want){ rot = v.rot; if (v.obj.parent) v.obj.parent.remove(v.obj); if (shown.carry === o.id) shown.carry = null; v = null; }
        if (!v){
          var kind = want.split('#')[0];
          v = objs[id] = { obj: o.cut && isVeg(kind) ? makeCut(kind, o.cut, o.cut.done) : instance(kind), look: want, placed: false, rot: rot };
        }
        if (o.at === 'hand'){
          if (shown.carry !== o.id){ shown.carry = o.id; v.placed = false; v.rot = undefined; play.setCarry(v.obj, toolHold[o.kind] || KINDS[o.kind].carry); }
          return;
        }
        if (!v.placed){
          if (o.at === 'table'){ var gv = views[o.guest]; placeBowl(gv); v.obj.position.copy(gv.bowlAt); v.obj.rotation.set(0, rnd(0, 6.28), 0); }
          else if (o.at === 'home'){ v.obj.position.copy(place.home[o.kind].pos); v.obj.rotation.set(0, place.home[o.kind].rot, 0); }
          else if (o.at === 'board'){ v.obj.position.copy(place.board.pos); if (v.rot === undefined) v.rot = o.rot || 0; v.obj.rotation.set(0, v.rot, 0); }
          else { v.obj.position.set(o.x, o.y, o.z); v.obj.rotation.set(0, o.rot || 0, 0); }
          v.obj.visible = true; root.add(v.obj); v.placed = true;
        }
        if (o.at === 'board'){   // it turns to how it is laid
          v.rot += angle((o.rot || 0) - v.rot) * Math.min(1, dt * 9);
          v.obj.rotation.y = v.rot;
        }
      });
      if (!it && shown.carry !== null && shown.carry !== 'tool'){ shown.carry = null; play.setCarry(null); }   // ('tool': the ladle while stirring)
      // the line above the hint: cutting, a short message, or what he carries
      var label = it ? 'Carrying ' + nameOf(it, 'a') : '', ob = state.board && state.items[state.board];
      if (cutting && ob && cutAxis(ob)){
        var pl = CUTS[ob.kind];
        label = 'Slide the mouse sideways, pull it down to cut   \u00b7   cut ' + (cutCount(ob) + 1) + ' of ' + (pl.a + pl.b);
      } else if (pouring) label = 'Pull the mouse down to tip the jug, push it up to stop   \u00b7   broth: ' + Math.round(state.pot.broth * 100) + '% of what is needed';
      else if (stirring) label = 'Move the mouse in circles to stir';
      else if (note.t > 0) label = note.text;
      if (carryEl.textContent !== label){ carryEl.textContent = label; carryEl.classList.toggle('on', !!label); }
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
      if (note.t > 0) note.t -= dt;
      if (cutting){
        var cit = carried(), cb = state.board && state.items[state.board];
        if (!cb || !cit || cit.kind !== 'knife' || ctx.isMoving()) stopCutting();
        else {
          if (cutting.cool > 0){   // after a cut the blade comes up by itself
            cutting.cool -= dt; cutting.h = Math.min(1, cutting.h + dt * 5);
            if (cutting.h >= 0.6) cutting.armed = true;
          }
          if (cutting.end >= 0){ cutting.end -= dt; if (cutting.end <= 0) stopCutting(); }
        }
      }
      if (pouring){
        var jug = carried();
        if (!jug || jug.kind !== 'broth' || ctx.isMoving()) stopPour();
        else {
          var flow = clamp((pouring.tilt - 0.35) / 0.65) * COOK.pour;
          if (dt > 0) pouring.flow = flow > 0 && act('pour', flow * dt) ? flow : 0;   // (a frame without time changes nothing)
        }
      }
      if (stirring && (carried() || ctx.isMoving() || state.pot.phase === 'burnt' || !inPot())) stopStir();
      if (shake){ shake.t += dt / 0.5; if (shake.t >= 1) shake = null; }
      // while a tool is led the view goes to where it works
      var work = cutting ? { yaw: cutting.look, at: place.board.pos } : pouring ? { yaw: pouring.look, at: place.pot.pos } : stirring ? { yaw: stirring.look, at: place.pot.pos } : null;
      if (work){
        var L = ctx.look.get(), cam = camera.position, wy = work.at.y + (cutting ? 0 : place.pot.size.y * 0.6);
        var ahead = (work.at.x - cam.x) * Math.sin(work.yaw) + (work.at.z - cam.z) * Math.cos(work.yaw);
        var pitch = clamp(-Math.atan2(cam.y - wy, Math.max(0.12, ahead)), -1.3, -0.5), e = 1 - Math.exp(-7 * dt);
        ctx.look.set(L.yaw + angle(work.yaw - Math.PI - L.yaw) * e, L.pitch + (pitch - L.pitch) * e);
      }
      syncItems(dt);

      if (state.open !== shown.open){
        if (shown.open !== null) say(state.open ? 'The restaurant is open' : 'The restaurant is closed');
        shown.open = state.open; openEl.classList.toggle('on', state.open); openEl.lastChild.textContent = state.open ? 'Open' : 'Closed';
      }
      // the first pot is ready and nobody can come in yet: say what to do
      if (state.pot.phase === 'ready' && !state.open && !shown.told){ shown.told = true; say('The stew is ready \u2013 open the restaurant at the front door'); }
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

      // the pot: what is in it, the heat under it, its panel and the steam
      var P = place.pot, pot = state.pot, ready = pot.phase === 'ready', burnt = pot.phase === 'burnt', filling = pot.phase === 'filling';
      var fill = ready ? Math.min(1, pot.broth) * pot.portions / RECIPE.portions : burnt ? Math.min(0.5, pot.broth) : pot.broth;
      P.level += (P.floor + (P.high - P.floor) * clamp(fill, 0, 1.18) - P.level) * Math.min(1, dt * 5);
      var wet = pot.phase !== 'empty' && pot.broth > 0.01;
      VEG.forEach(function(kind){
        var v = P.veg[kind], show = filling && pot.cooked < 0.3 && pot.has[kind] > 0 && !!pot.cut[kind];
        if (show && v.userData.cut !== pot.cut[kind]){   // the pieces as they were cut
          while (v.children.length) v.remove(v.children[0]);
          v.add(makeCut(kind, pot.cut[kind], true)); v.userData.cut = pot.cut[kind];
        }
        v.visible = show; v.position.y = Math.max(P.size.y * 0.23, P.level - 0.04);   // they float in the broth
      });
      // broth, turning into stew as it cooks; darker as it burns
      var done = ready || burnt ? 1 : smooth(pot.cooked / 0.6);
      P.liquid.visible = wet; P.liquid.position.y = P.level;
      P.stew.visible = (wet || burnt) && done > 0.02; P.stew.position.y = P.level + 0.002; P.stew.material.opacity = done;
      P.stew.material.color.copy(STEW_COL).lerp(BURNT_COL, burnt ? 1 : pot.burn * 0.8);
      P.spin *= Math.exp(-2.2 * dt);
      var turn = ((wet && pot.temp >= COOK.simmer ? 0.22 : 0) + P.spin) * dt;   // it simmers, and it goes round with the ladle
      P.stew.rotation.z += turn; P.liquid.rotation.z += turn; P.specks.mesh.rotation.z += turn;
      var jugInHand = carried() && carried().kind === 'broth';
      P.line.visible = !ready && !burnt && pot.broth < COOK.brothOk[1] && (jugInHand || (wet && pot.broth < COOK.brothOk[0]));   // how far the broth should come up
      P.line.position.y = P.floor + (P.high - P.floor) * 1;
      var sk = P.specks;
      if (sk.drawn !== pot.spice){   // the seasoning lies on top
        sk.drawn = pot.spice; sk.g.clearRect(0, 0, 128, 128);
        for (var q = 0; q < pot.spice * 22; q++){
          var qa = Math.random() * Math.PI * 2, qd = Math.sqrt(Math.random()) * 58;
          sk.g.fillStyle = q % 4 === 0 ? 'rgba(70,95,40,.85)' : 'rgba(45,30,18,.85)';
          sk.g.fillRect(64 + Math.cos(qa) * qd, 64 + Math.sin(qa) * qd, 2.2, 2.2);
        }
        sk.tex.needsUpdate = true;
      }
      sk.mesh.visible = wet && pot.spice > 0; sk.mesh.position.y = P.level + 0.004;
      P.flames.forEach(function(fl, i){
        var size = [0, 0.07, 0.11, 0.17][pot.heat] * (0.85 + 0.25 * Math.sin(clock * 17 + i * 2.1));
        fl.visible = pot.heat > 0; fl.scale.set(size * 0.55, size, 1); fl.position.y = size * 0.42 - 0.01;
      });
      // the broth running from the jug
      var jugObj = jugInHand && objs[carried().id] && objs[carried().id].obj;
      P.stream.visible = !!(pouring && pouring.flow > 0 && jugObj);
      if (P.stream.visible){
        jugObj.updateMatrixWorld(true);
        var sp = jugObj.localToWorld(MODELS.broth.tool.spout.clone());
        P.stream.position.copy(sp); P.stream.scale.set(1, Math.max(0.02, sp.y - (P.pos.y + P.level)), 1);
      }
      // the ladle: leaning in the pot; when ladling it lifts, swings over the bowl, pours and comes back
      var L = P.ladle, R = P.rest;
      L.visible = !stirring;
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
      var top = P.pos.y + P.size.y, chef = ctx.getChef();
      panel.sp.visible = (pot.phase !== 'empty' || pot.heat > 0) && !!chef && Math.hypot(chef.position.x - P.pos.x, chef.position.z - P.pos.z) < 5;
      if (panel.sp.visible){   // behind the pot as he sees it, just above its rim
        drawPanel(panel, pot, Math.sin(clock * 9) > 0);
        var away = V(P.pos.x - chef.position.x, 0, P.pos.z - chef.position.z).normalize();
        panel.sp.position.set(P.pos.x + away.x * P.inner * 1.3, top + 0.15, P.pos.z + away.z * P.inner * 1.3);
      }
      var smoke = burnt || pot.stick >= 1, strength = burnt ? 0.8 : wet ? clamp((pot.temp - 62) / 35) * (ready ? 0.7 : 1) : 0;
      puffs.forEach(function(pf){
        pf.t += dt * 0.55; if (pf.t >= 1){ pf.t -= 1; pf.dx = rnd(-1, 1); pf.dz = rnd(-1, 1); }
        pf.sp.visible = strength > 0;
        if (!strength) return;
        pf.sp.material.color.setHex(smoke ? 0x4a4541 : 0xffffff);
        var e = pf.t, size = 0.26 + e * 0.5;
        pf.sp.position.set(P.pos.x + pf.dx * (0.1 + e * 0.1), top + e * 0.75, P.pos.z + pf.dz * (0.1 + e * 0.1));
        pf.sp.scale.set(size, size, 1);
        pf.sp.material.opacity = strength * Math.sin(Math.PI * e) * 0.85;
      });
    }

    return {
      update: update, mouse: mouse,
      // ---- for tests only ----
      debugState: function(){
        var it = carried();
        return { money: state.money, served: state.served, lost: state.lost, carry: it ? it.kind : null,
                 crates: VEG.map(function(k){ return state.crates[k]; }).join('/'), bowls: state.bowls,
                 pot: state.pot.phase + ' x' + state.pot.portions + ' has ' + VEG.map(function(k){ return state.pot.has[k]; }).join('') +
                      ' broth ' + state.pot.broth.toFixed(2) + ' spice ' + state.pot.spice + ' heat ' + state.pot.heat + ' ' + Math.round(state.pot.temp) + 'deg cooked ' +
                      state.pot.cooked.toFixed(2) + ' stick ' + state.pot.stick.toFixed(2) + ' burn ' + state.pot.burn.toFixed(2),
                 mode: cutting ? 'cut' : pouring ? 'pour ' + pouring.tilt.toFixed(2) : stirring ? 'stir' : '',
                 items: Object.keys(state.items).map(function(id){ return state.items[id].kind + '@' + state.items[id].at; }).join(' '),
                 guests: state.guests.map(function(g){ return g.id + ':' + g.phase + (g.phase === 'waiting' ? ' ' + g.patience.toFixed(2) : ''); }).join(' '),
                 board: (function(){ var o = state.board && state.items[state.board]; return o ? o.kind + ' ' + (o.cut ? o.cut.a.length + '+' + o.cut.b.length + (o.cut.done ? ' done q=' + o.cut.q.toFixed(2) : '') : 'whole') : null; })(),
                 knife: state.items[state.knife].at, quality: +state.pot.quality.toFixed(2),
                 cutting: cutting ? { x: +cutting.x.toFixed(3), h: +cutting.h.toFixed(2), cool: +cutting.cool.toFixed(2) } : null, note: note.t > 0 ? note.text : '',
                 ready: !!place.pot, aim: aim ? [+aim.x.toFixed(2), +aim.z.toFixed(2)] : null };
      },
      debugStock: function(){ return { open: state.open, broth: +state.broth.toFixed(2), jug: +state.items[state.tools.broth].left.toFixed(2) }; },
      debugAct: act, debugPot: function(){ return state.pot; }, debugCookRules: COOK,
      debugTools: function(){ return { ids: state.tools, jug: MODELS.broth.tool, home: place.home, left: state.items[state.tools.broth].left }; },
      debugCut: { start: startCutting, stop: stopCutting, limits: function(){ var o = state.items[state.board]; return o && cutAxis(o) ? cutLimits(o, cutAxis(o)) : null; },
                  ranges: function(kind){ return MODELS[kind].range; }, knife: function(){ return MODELS.knife.tool; }, sizes: function(){ var o = {}; Object.keys(MODELS).forEach(function(k){ o[k] = MODELS[k].size.toArray().map(function(x){ return +x.toFixed(3); }); }); return o; } },
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
