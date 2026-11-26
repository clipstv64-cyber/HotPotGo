// Restaurant: while it is open, guests come in through the entrance door, sit down at
// their table, read the menu and order stew; when they have eaten and paid (or waited
// too long) they get up and leave. The chef fetches potatoes, carrots
// and onions from their crates in the kitchen's pantry corner, cuts them up on the
// chopping block with the knife (the mouse leads the knife: sideways to place it, down
// to cut) and puts the pieces into the big pot on the range. Broth is poured in from the
// jug by tipping it, the heat is set at the range, the stew is stirred with the ladle so
// it does not catch and burn, and seasoned from the shaker: one pot is 20 portions. With an empty bowl from the stack
// he ladles a portion, carries it to the guest and serves it; the guest eats, pays and
// tips for quick service. A guest who waits too long gives up.
//
// The day: in the morning the chef cooks in peace, the clock stands still. Opening the
// front door starts the opening hours; at closing time (or when he closes himself) nobody
// new comes in, the last guests finish, and "End the day" at the door shows the day's
// accounts.
//
// Supplies are ordered at the computer in the office. After a short while they arrive as
// a box in the storeroom; the chef carries it to the kitchen and unpacks it at the crates
// and at the broth shelf.
//
// The game saves itself (every few seconds, at every change of the day and when the
// window is closed) and offers to continue when it is started again.
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
    // cookTime: seconds of simmering; color: in the pot and the bowl; dot: on the guest's order bubble
    stew:   { name: 'Vegetable stew', short: 'stew', needs: { potato: 1, carrot: 1, onion: 1, sausage: 0 }, chunky: true, portions: 20, cookTime: 40, price: 9, color: 0x9a938c, dot: '#c8742c',
              lines: ['1 potato, cut into cubes', '1 carrot, cut into slices', '1 onion, chopped'] },
    potato: { name: 'Potato soup', short: 'potato soup', needs: { potato: 2, carrot: 0, onion: 1, sausage: 0 }, portions: 20, cookTime: 34, price: 8, color: 0xd8cca4, dot: '#e3cf8e',
              lines: ['2 potatoes, cut into cubes', '1 onion, chopped'] },
    carrot: { name: 'Carrot soup', short: 'carrot soup', needs: { potato: 0, carrot: 2, onion: 1, sausage: 0 }, portions: 20, cookTime: 34, price: 10, color: 0xd5641c, dot: '#e7792c',
              lines: ['2 carrots, cut into slices', '1 onion, chopped'] },
    // (the sausage comes out of the fridge)
    sausage: { name: 'Sausage stew', short: 'sausage stew', needs: { potato: 1, carrot: 0, onion: 1, sausage: 1 }, chunky: true, portions: 20, cookTime: 38, price: 12, color: 0x9c6a4a, dot: '#a5432c',
              lines: ['1 potato, cut into cubes', '1 onion, chopped', '1 sausage, cut into slices'] }
  };
  var RULES = {
    startMoney: 250,          // euros in the till at the start
    crateStock: 6,            // vegetables in each crate at the start (and what a kitchen crate holds)
    fridgeStock: 8,           // sausages the kitchen's fridge holds (it is empty at the start)
    storeStock: 12,           // what each of the storeroom's crates holds (they are empty at the start)
    bowls: 10,                // clean bowls on the stack at the start
    firstGuest: 3,            // seconds after opening until the first guest comes in
    guestEvery: [14, 26],     // seconds between guests coming in
    decide: [4, 8],           // seconds a guest reads the menu before ordering
    patience: 120,            // seconds a guest waits for the food
    orderPatience: 75,        // ... and for the chef to come and take the order (the same patience, used up faster here)
    linger: 2.5,              // seconds a guest stays seated after paying (or giving up) before getting up
    rest: 25,                 // seconds until a guest who has left may come again
    eatTime: 14,              // seconds a guest eats
    tip: 3,                   // the tip shrinks with the waiting time
    // the opening hours (minutes of the day) and how many seconds of play they take;
    // before the restaurant is opened the clock stands at `opens`
    day: { opens: 11 * 60, closes: 21 * 60, length: 720 },
    // what supplies cost at the computer (euros): one vegetable, broth for one pot (about 35 a pot)
    cost: { potato: 8, carrot: 8, onion: 8, broth: 11, sausage: 14 },
    delivery: 30,             // seconds until an order arrives in the storeroom
    // Reviews: a guest rates the visit by these parts (each 0 .. 1; the weights are the game
    // concept's), and that gives 1 to 5 stars. The restaurant's stars are the average of the
    // latest reviews, so bad ones can be made good again.
    review: { weights: { food: 0.35, wait: 0.25, clean: 0.2, value: 0.1, mood: 0.1 },
              writes: 0.75,          // share of the served guests who write a review (who leaves hungry always does)
              keep: 30,              // the restaurant's stars: the average of this many latest reviews
              dirt: 0.25,            // each stain on the floor takes this much off "clean"
              dishes: 0.15,          // ... and each dirty bowl left on a table
              spills: 0.1,           // ... and each spill on a table
              mood: 0.45,            // the room as it is: shabby (better furniture will raise it)
              draw: [0.8, 1.25] },   // guests come this much less / more often at 1 star and at 5 stars
    autosave: 20,             // seconds between two automatic saves
    staff: { wage: 30,        // what the waiter is paid at the end of each day
             wait: 0.8 },     // seconds he stays at a table to take an order or put a bowl down
    spill: { chance: 0.5,     // how often a guest leaves a spill on the table
             most: 24,        // (never more spills than this at once)
             wipe: 2.2 },     // metres the cloth has to go over it to wipe it off
    reach: 2.1,               // how close the chef has to be to a crate, the pot, the bowls
    cutReach: 1.75,           // ... to the chopping block to cut on it
    shelfReach: 1.75,         // ... to the shelf with jug and shaker
    itemReach: 1.9,           // ... to something lying on a work surface
    serveReach: 2.7           // ... and to a guest's chair (far enough to serve across the table from the aisle)
  };
  // The range and what happens in the pot (see tick): the heat sets where the pot's
  // temperature goes. It cooks from `slow` (at half speed), properly from `simmer`. From
  // `catchAt` it catches on the bottom unless it is stirred, and then it burns.
  var COOK = {
    heat: ['off', 'on'],                       // the stove is simply on or off
    target: [20, 97],                          // degrees the pot goes to
    warm: 0.16, cool: 0.08,                    // how fast (share of the difference per second)
    slow: 80, simmer: 90, hot: 108,
    catchAt: 86, catchTime: [[86, 34], [97, 24], [122, 6]],   // seconds without stirring until it catches, by temperature
    burnTime: 22,                              // seconds it may catch until it is burnt
    dry: 1.5, thick: 1.4,                      // it catches this much faster without broth / with too little
    hotBurn: 45,                               // above `hot` it burns slowly anyway (seconds)
    stirTurn: 0.75,                            // one full turn of the ladle loosens this much of the catching
    brothOk: [0.85, 1.2], brothMax: 1.45, jug: 1.6,   // broth: 1 = what the recipe needs; the jug holds a little more
    stock: 7,                                  // broth in the kitchen at the start (enough for about six pots)
    pour: 0.5,                                 // broth per second from the fully tipped jug
    spice: 3, spiceMax: 8                      // shakes of seasoning: just right, and at most
  };
  var HOME = { knife: true, broth: true, spice: true, roller: true, mallet: true, rag: true };   // tools with a place of their own
  var VEG = ['potato', 'carrot', 'onion'];        // in crates
  var FOOD = VEG.concat(['sausage']);              // what is cut and goes into the pot (the sausage lives in the fridge)
  // what can be ordered at the computer (broth: one unit is what one pot needs)
  var GOODS = ['potato', 'carrot', 'onion', 'broth', 'sausage'];
  var GOOD = {
    potato: { name: 'Potatoes', one: 'potato', many: 'potatoes' },
    carrot: { name: 'Carrots', one: 'carrot', many: 'carrots' },
    onion:  { name: 'Onions', one: 'onion', many: 'onions' },
    broth:  { name: 'Broth', one: 'broth for 1 pot', many: 'broth for # pots' },
    sausage: { name: 'Sausages', one: 'sausage', many: 'sausages' }
  };
  // The shop at the computer, in sections. Everything does something in the game:
  //   kitchen  more bowls; a strong burner (the stew cooks in less time)
  //   room     candles and plants make the room nicer (the reviews' "mood")
  //   expand   the restaurant's own areas grow: a bigger dining room (room for furniture, more guests),
  //            bigger crates in the kitchen, more crates in the storeroom
  //   furniture  bought as often as you like and placed freely (each piece makes the room nicer)
  //   walls / floors  the dining room's paint and floor (a nicer look, switched freely once bought)
  var SHOP = [
    { key: 'bowls',   cat: 'kitchen', name: 'More bowls',    price: 45,  pic: 'bowl',   text: 'Ten more bowls on the stack, so you run out less often.' },
    { key: 'stove',   cat: 'kitchen', name: 'Strong burner', price: 220, pic: 'pot',    text: 'A stronger flame under the pot: every dish is done in less time.' },
    { key: 'pot2',    cat: 'kitchen', name: 'Second pot',    price: 180, pic: 'pot',    text: 'A second pot on the other burner: cook two dishes at once.' },
    { key: 'candles', cat: 'room',    name: 'Table candles', price: 60,  pic: 'candle', text: 'A candle on every table. Guests like the room better.' },
    { key: 'plants',  cat: 'room',    name: 'Potted plants', price: 110, pic: 'plant',  text: 'Three big plants for the dining room. Guests like the room better.' },
    { key: 'bigroom',    cat: 'expand', name: 'Bigger dining room', price: 450, pic: 'table',  text: 'The left wall moves back: more room for furniture, and more guests come.' },
    { key: 'bigkitchen', cat: 'expand', name: 'Bigger kitchen crates', price: 220, pic: 'crate', text: 'Each vegetable crate in the kitchen holds 12 instead of 6.' },
    { key: 'bigstore',   cat: 'expand', name: 'More storage',     price: 180, pic: 'crate', text: 'A second crate for each vegetable in the storeroom: 24 instead of 12.' },
    // recipes: a new dish on the menu (key: 'recipe_' + the dish)
    // staff: hired once, paid every day
    { key: 'waiter', cat: 'staff', name: 'A waiter', price: 150, pic: '', text: 'He takes the orders at the tables and carries the bowls you put on the bar to the guests who ordered them. Wage: 30 \u20ac a day.' },
    { key: 'recipe_potato', cat: 'recipes', name: 'Potato soup', price: 70, pic: 'stew', text: 'Two potatoes and an onion. Cheap to cook, guests pay 8 \u20ac a bowl. Some guests will ask for it.' },
    { key: 'recipe_carrot', cat: 'recipes', name: 'Carrot soup', price: 120, pic: 'stew', text: 'Two carrots and an onion. Sweet and bright: guests pay 10 \u20ac a bowl. Some guests will ask for it.' },
    { key: 'recipe_sausage', cat: 'recipes', name: 'Sausage stew', price: 160, pic: 'sausage', text: 'A potato, an onion and a smoked sausage from the fridge. Hearty: guests pay 12 \u20ac a bowl. Order the sausages at the computer.' }
  ];
  var SHOP_EFFECT = { bowls: 10, candles: 0.15, plants: 0.2, stove: 0.7, bigroom: 0.08, guests: 1.2 };   // more bowls; mood added; cooking time (share)
  // furniture: placed freely; size: its footprint is measured on the model; mood: what each piece adds
  var FURNITURE = [
    { key: 'sofa',     name: 'Leather sofa',  price: 140, mood: 0.06, text: 'An old leather sofa. Somewhere to wait in comfort.' },
    { key: 'jukebox',  name: 'Jukebox',       price: 190, mood: 0.08, text: 'An old jukebox with warm lights. The room comes alive.' },
    { key: 'aquarium', name: 'Fish tank',     price: 160, mood: 0.07, text: 'A fish tank on a cabinet. Guests love to watch the fish.' },
    { key: 'coatrack', name: 'Coat rack',     price: 35,  mood: 0.02, text: 'A wooden coat rack for the guests\u2019 coats.' }
  ];
  var FURNITURE_MAX = 4;   // pieces of one kind at most
  // The dining room's walls and floor are done by hand: a bucket of paint is enough for PAINT_COVERS wall
  // panels, a pack of floor for FLOOR_COVERS squares. They are delivered to the storeroom like supplies,
  // carried to the dining room and put on panel by panel (E), square by square.
  var LOOK = {
    wall:  [{ key: 'cream', name: 'Cream plaster', price: 25, swatch: '#e9dcc0' }, { key: 'sage', name: 'Sage green', price: 30, swatch: '#a9bf96' },
            { key: 'terracotta', name: 'Terracotta', price: 30, swatch: '#d79a72' }, { key: 'blue', name: 'Faded blue', price: 30, swatch: '#a7b9d6' }],
    floor: [{ key: 'tiles', name: 'Old tiles', price: 30, img: 'textures/floor_color.jpg' }, { key: 'planks', name: 'Wooden planks', price: 50, img: 'textures/k_wood.webp' },
            { key: 'slate', name: 'Slate', price: 50, img: 'textures/k_floor.webp' }]
  };
  var PAINT_COVERS = 8, FLOOR_COVERS = 6;   // a bucket: paint for 8 wall panels (a dip of the roller each), a pack: boards for 6 floor squares
  // the roller: how wide its stroke is, how far it goes for a pixel of mouse movement (sideways, up), how
  // far from the wall he may stand; dipping takes this long; a square of floor is laid in this many rows
  var ROLL = { width: 0.27, side: 0.0032, up: 0.0055, near: 0.6, far: 2.7 }, DIP_TIME = 1.25, FLOOR_ROWS = 5;
  var DOCK_SLOTS = 3;   // places for deliveries in the storeroom: 0 the delivery box, 1 .. 2 buckets and packs
  var LOOK_MOOD = 0.08;   // a room done over completely, walls and floor (not with what it had), is this much nicer
  function shopItem(key){ for (var i = 0; i < SHOP.length; i++) if (SHOP[i].key === key) return SHOP[i]; return null; }
  function furnitureItem(key){ for (var i = 0; i < FURNITURE.length; i++) if (FURNITURE[i].key === key) return FURNITURE[i]; return null; }
  function lookItem(part, key){ var l = LOOK[part] || []; for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }
  // the guests' names, for their reviews
  var GUEST_NAMES = { woman: 'Greta', sailor: 'Hein', biker: 'Bruno', nerd: 'Milo', oldman: 'Walter', glamour: 'Lola', butcher: 'Otto', goth: 'Raven' };
  // What a guest writes. It follows from the visit: f = how the food, the wait and the
  // cleanliness were (0 .. 1), and the weakest of them is what the guest complains about.
  var REVIEW_TEXT = {
    5: { any: ['The place looks terrible, but the stew is incredible!', 'Wonderful stew, and it came quickly. I will be back.', 'Best stew in town. Do not let the furniture put you off.'] },
    4: { food: ['Quick and friendly. The stew was good, not great.'], wait: ['Really tasty. I just had to wait a little.'], clean: ['Lovely stew. The floor could do with a broom, though.'] },
    3: { food: ['It was okay. The stew was nothing special.'], wait: ['The stew was fine, but it took a long time.'], clean: ['Decent stew, but the floor was dirty.'] },
    2: { food: ['The stew was no good. I could not finish it.'], wait: ['I waited far too long for my stew.'], clean: ['It was filthy in there. I lost my appetite.'] },
    1: { food: ['Awful stew. Never again.'], wait: ['I waited ages, and then the stew was not even good.'], clean: ['Dirty floor, bad stew. Never again.'] },
    hungry: ['I waited and waited for a bowl of stew, then I went home hungry.', 'Nobody brought me anything. I left hungry.']
  };
  function reviewText(stars, f, served, n){
    if (!served) return REVIEW_TEXT.hungry[n % REVIEW_TEXT.hungry.length];
    var worst = f.wait < f.food ? (f.clean < f.wait ? 'clean' : 'wait') : (f.clean < f.food ? 'clean' : 'food');
    var list = REVIEW_TEXT[stars].any || REVIEW_TEXT[stars][worst];
    return list[n % list.length];
  }
  function esc(t){ return String(t).replace(/[&<>"']/g, function(c){ return '&#' + c.charCodeAt(0) + ';'; }); }   // for text that comes out of a saved game
  // "3 potatoes, 1 carrot and broth for 2 pots"
  function goodsText(goods){
    var words = GOODS.filter(function(k){ return goods[k] > 0; }).map(function(k){
      var n = Math.round(goods[k] * 10) / 10;
      return k === 'broth' ? (n === 1 ? GOOD.broth.one : GOOD.broth.many.replace('#', n)) : n + ' ' + (n === 1 ? GOOD[k].one : GOOD[k].many);
    });
    return words.length ? words.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'nothing';
  }
  // How each vegetable is cut: `a` cuts across its length, then (turned by a quarter)
  // `b` cuts across its width. from / to: the part of its length that is cut (shares,
  // from its thin end); dropEnd: what lies beyond the last cut is thrown away (the
  // carrot's leaves); cap: the colours of the cut faces.
  var CUTS = {
    carrot: { a: 5, b: 0, from: 0.04, to: 0.68, dropEnd: true, cap: ['#f9b25a', '#ee8f2e'] },
    potato: { a: 3, b: 3, from: 0.05, to: 0.95, cap: ['#f6e9b4', '#ecd98f'] },
    onion:  { a: 2, b: 3, from: 0.12, to: 0.9, cap: ['#fbf6e6', '#e6d9bd'] },
    sausage: { a: 5, b: 0, from: 0.08, to: 0.92, cap: ['#a8604a', '#7e3f30'] }
  };
  // what can be carried; carry: how the chef holds it (see gameplay.js)
  var KINDS = {
    potato: { a: 'a potato', the: 'the potato', many: 'potatoes', cutName: 'potato cubes', carry: { half: 0.105, fwd: 0.44, drop: -0.25, grip: 0.06, back: 0, curl: 0.45 } },
    carrot: { a: 'a carrot', the: 'the carrot', many: 'carrots', cutName: 'carrot slices', carry: { half: 0.115, fwd: 0.44, drop: -0.25, grip: 0.04, back: 0, curl: 0.45, yaw: 0.5 } },
    sausage: { a: 'a sausage', the: 'the sausage', many: 'sausages', cutName: 'sausage slices', carry: { half: 0.13, fwd: 0.44, drop: -0.25, grip: 0.05, back: 0, curl: 0.45, yaw: 0.5 } },
    onion:  { a: 'an onion', the: 'the onion', many: 'onions', cutName: 'chopped onion', carry: { half: 0.1, fwd: 0.44, drop: -0.25, grip: 0.07, back: 0, curl: 0.45 } },
    bowl:   { a: 'an empty bowl', the: 'the bowl', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    dirty:  { a: 'a dirty bowl', the: 'the dirty bowl', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    stew:   { a: 'a bowl of stew', the: 'the bowl of stew', carry: { half: 0.17, fwd: 0.46, drop: -0.25, grip: 0.06, back: 0, curl: 0.4 } },
    knife:  { a: 'the knife', the: 'the knife' },   // these three are held in one hand (see toolHold)
    broth:  { a: 'the jug of broth', the: 'the jug of broth' },
    spice:  { a: 'the spice shaker', the: 'the spice shaker' },
    roller: { a: 'the paint roller', the: 'the paint roller' },   // in the storeroom, held in both hands; item.color, item.load (0 .. 1: paint for a panel)
    mallet: { a: 'the rubber mallet', the: 'the rubber mallet' }, // in the storeroom, for laying the floor
    rag:    { a: 'the cleaning cloth', the: 'the cleaning cloth' }, // on the second prep table, for spills on the tables
    paint:  { a: 'a bucket of paint', the: 'the bucket of paint', carry: { half: 0.23, fwd: 0.46, drop: -0.26, grip: 0.12, back: 0, curl: 0.35 } },   // item.color, item.left (panels)
    boards: { a: 'a pack of flooring', the: 'the pack of flooring', carry: { half: 0.14, fwd: 0.5, drop: -0.26, grip: 0.14, back: 0, curl: 0.3, yaw: Math.PI / 2 } },   // item.floor, item.left (squares)
    parcel: { a: 'a delivery box', the: 'the delivery box', carry: { half: 0.215, fwd: 0.46, drop: -0.4, grip: 0.12, back: 0, curl: 0.3 } }   // item.goods = what is in it
  };
  // Meshy models and parts cut out of the kitchen's own models; width (or height): size in the game
  var MODELS = {
    // align: laid along its own length (X), its thin end at -X, its flat side down
    potato: { file: 'models/d_potato.glb', width: 0.2, align: true },
    carrot: { file: 'models/d_carrot.glb', width: 0.32, align: true },
    onion:  { file: 'models/d_onion.glb', width: 0.17, align: true },
    sausage: { file: 'models/d_sausage.glb', width: 0.27, align: true },
    knife:  { file: 'models/d_knife.glb', width: 0.44, align: true },   // the cleaver from the kitchen's chopping block
    board:  { file: 'models/d_board.glb', width: 0.62 },                // ... and the block without it
    broth:  { file: 'models/d_broth_jug.glb', height: 0.36 },
    spice:  { file: 'models/d_spice.glb', height: 0.2 },
    shelf:  { file: 'models/d_wall_shelf.glb', width: 0.86 },             // on the wall beside the pot, for jug and shaker
    bowl:   { file: 'models/d_bowl_empty.glb', width: 0.4 },
    stew:   { file: 'models/d_stew_bowl.glb', width: 0.4 },
    crate:  { file: 'models/d_crate.glb', width: 0.66 },
    pot:    { file: 'models/d_cookpot.glb', width: 0.86 },
    ladle:  { file: 'models/d_ladle.glb', height: 0.56 },
    parcel: { file: 'models/d_parcel.glb', width: 0.44 },
    paint:  { file: 'models/d_paintbucket.glb', height: 0.42 },          // an open bucket of paint
    roller: { file: 'models/d_roller.glb', width: 2.05, align: true },   // a paint roller on a long pole (its roller at +X)
    mallet: { file: 'models/d_mallet.glb', width: 0.4, align: true },    // a rubber mallet (its head at +X)
    boards: { file: 'models/d_floorboards.glb', width: 0.9 },                 // a bundle of planks tied with rope
    rag:    { file: 'models/d_rag.glb', width: 0.26 },                   // a folded cleaning cloth
    candle: { file: 'models/d_candlebottle.glb', height: 0.4 },           // (the shop's pictures)
    plant:  { file: 'models/d_plant.glb', height: 1.75 },
    table:  { file: 'models/table.glb', width: 1.4 },
    // furniture (placed freely)
    sofa:     { file: 'models/d_sofa.glb', width: 1.75 },
    jukebox:  { file: 'models/d_jukebox.glb', height: 1.75 },
    aquarium: { file: 'models/d_aquarium.glb', width: 1.2 },
    coatrack: { file: 'models/d_coatrack.glb', height: 1.9 }
  };

  function num(v){ return typeof v === 'number' && isFinite(v); }
  function isDish(k){ return typeof k === 'string' && Object.prototype.hasOwnProperty.call(RECIPES, k); }
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
    var scene = ctx.scene, camera = ctx.camera, play = ctx.gameplay;
    var root = new T.Group(); root.name = 'restaurant'; scene.add(root);
    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };

    // ---------- the state and the actions that change it ---------------------------------
    // the day: 'prep' (before opening) -> 'open' -> 'closed' (the last guests finish) -> 'done' (the accounts are shown)
    // (spent: euros for supplies ordered that day)
    // (reviewed, stars: how many reviews were written that day, and their stars added up)
    function newDay(n){ return { n: n, phase: 'prep', time: RULES.day.opens, served: 0, lost: 0, sales: 0, tips: 0, spent: 0, reviewed: 0, stars: 0, report: null }; }
    // a pot: 'empty' | 'filling' (things are put in, it cooks) | 'ready' | 'burnt'; dish: what it is becoming (once it has all of a recipe)
    function newPot(){
      return { phase: 'empty', has: { potato: 0, carrot: 0, onion: 0, sausage: 0 }, cut: {}, qs: [], broth: 0, spice: 0,
               heat: 0, temp: 20, cooked: 0, stick: 0, burn: 0, quality: 1, portions: 0, batch: 0, dish: null };
    }
    function newState(){
      var st = {
        money: RULES.startMoney, served: 0, lost: 0, nextId: 1,
        items: {},                                    // id -> { id, kind, at: 'hand' | 'surface' | 'board' | 'home' | 'table', x, y, z, rot, cut: { a, b, done, q }, batch, q, guest }
        board: null,                                  // id of the vegetable on the chopping block
        knife: null,                                  // id of the knife (at 'home' beside the block, or in the hand)
        tools: {},                                    // ids of the tools: knife, broth (the jug: item.left = what is in it), spice
        carry: null,                                  // id of the item in the chef's hands
        crates: { potato: RULES.crateStock, carrot: RULES.crateStock, onion: RULES.crateStock },
        store: { potato: 0, carrot: 0, onion: 0 },    // vegetables in the storeroom's crates
        fridge: 0,                                    // sausages in the kitchen's fridge
        bowls: RULES.bowls,                           // clean bowls on the stack
        // the pot: 'empty' | 'filling' (things are put in, it cooks) | 'ready' | 'burnt'
        pot: newPot(),                                // the pot the chef works at: one of pots (pots[potAt])
        // { id, phase, t, patience, pay, item, rest }; phase: 'away' -> 'coming' -> 'deciding' -> 'ready' (wants to order) -> 'waiting' -> 'eating' -> 'paid' -> 'leaving' -> 'away'
        // (from 'waiting' also -> 'angry' -> 'leaving' when the patience runs out)
        guests: [],
        open: false,                                  // guests come in (the same as day.phase === 'open')
        broth: 0,                                     // broth in stock (1 = what one pot needs), besides what is in the jug
        nextGuest: RULES.firstGuest,
        orders: [],                                   // supplies on their way: { id, goods: { potato, carrot, onion, broth }, cost, left (seconds) }
        delivered: 0,                                 // how many deliveries have arrived so far
        history: [],                                  // the accounts of the days that are over (see 'endDay')
        reviews: [],                                  // what guests wrote: { id, day, who, stars, text, food, wait, clean }
        owned: {},                                    // what was bought in the shop: { bowls: true, ... }
        decor: { walls: {}, floor: {} },              // each wall panel's paint and each floor square's flooring (index.html: ctx.surfaces); none: as it was
        prices: {}, offer: {},                        // the menu: a dish's price when it is not the usual one; offer[dish] false: not on the menu today
        furniture: [],                                // { id, key, x, z, rot, placed } (not placed yet: it is being put somewhere)
        tables: {},                                   // tables moved somewhere else: index -> { x, z }
        chairs: {},                                   // single chairs moved somewhere else: chair number -> { x, z, rot }
        props: {},                                    // the decor moved somewhere else: key -> { x, y, z, q } (decor.js movables)
        spills: [],                                   // on the tables: { id, x, y, z, kind, size, rot, left (1 fresh .. 0 wiped off) }
        day: newDay(1)
      };
      ['knife', 'broth', 'spice', 'roller', 'mallet', 'rag'].forEach(function(kind){
        var o = { id: st.nextId++, kind: kind, at: 'home' };
        if (kind === 'broth'){ o.left = COOK.jug; st.broth = COOK.stock - COOK.jug; }
        st.items[o.id] = o; st.tools[kind] = o.id;
      });
      st.knife = st.tools.knife;
      st.pots = [st.pot]; st.potAt = 0;   // (a second pot comes from the shop)
      return st;
    }
    var state = newState();
    // the pot the chef works at, and doing something with another pot for a moment (all the pot code uses state.pot / place.pot)
    function usePot(i){ if (!state.pots[i]) return; state.pot = state.pots[i]; state.potAt = i; if (place.pots && place.pots[i]) place.pot = place.pots[i]; }
    function withPot(i, fn){
      var a = state.pot, ai = state.potAt, b = place.pot;
      state.pot = state.pots[i]; state.potAt = i; if (place.pots && place.pots[i]) place.pot = place.pots[i];
      try { return fn(); } finally { state.pot = a; state.potAt = ai; place.pot = b; }
    }
    function inside(){ return state.guests.some(function(g){ return g.phase !== 'away'; }); }   // is a guest still in the restaurant?
    // supplies: what is in the kitchen, what the kitchen holds, and how much more may be ordered
    function emptyGoods(){ return { potato: 0, carrot: 0, onion: 0, broth: 0, sausage: 0 }; }
    function parcels(){ return Object.keys(state.items).map(function(id){ return state.items[id]; }).filter(function(o){ return o.kind === 'parcel'; }); }
    // (a whole vegetable taken out and not cut yet still counts: it goes back into a crate)
    function loose(kind){ return Object.keys(state.items).filter(function(id){ var o = state.items[id]; return o.kind === kind && !o.cut; }).length; }
    function stockOf(kind){ return kind === 'broth' ? state.broth + state.items[state.tools.broth].left : kind === 'sausage' ? state.fridge + loose(kind) : state.crates[kind] + state.store[kind] + loose(kind); }
    function kitchenCap(){ return RULES.crateStock * (state.owned.bigkitchen ? 2 : 1); }
    function storeCap(){ return RULES.storeStock * (state.owned.bigstore ? 2 : 1); }
    function holds(kind){ return kind === 'broth' ? COOK.stock : kind === 'sausage' ? RULES.fridgeStock : kitchenCap() + storeCap(); }
    function coming(kind){   // ordered or delivered, but not unpacked yet
      var n = 0;
      state.orders.forEach(function(o){ n += o.goods[kind] || 0; });
      parcels().forEach(function(p){ n += p.goods[kind] || 0; });
      return n;
    }
    function room(kind){ return Math.max(0, Math.floor(holds(kind) - stockOf(kind) - coming(kind) + 1e-6)); }
    // how nice the room is (0 .. 1): shabby to start with, better with what was bought
    function mood(){
      var m = RULES.review.mood + (state.owned.candles ? SHOP_EFFECT.candles : 0) + (state.owned.plants ? SHOP_EFFECT.plants : 0) + (state.owned.bigroom ? SHOP_EFFECT.bigroom : 0);
      state.furniture.forEach(function(f){ var it = furnitureItem(f.key); if (it && f.placed && !MODELS[f.key].failed) m += it.mood; });
      m += LOOK_MOOD * (doneShare('walls', 'cream') + doneShare('floor', 'tiles')) / 2;
      return clamp(m);
    }
    // The restaurant's stars: the average of the latest reviews (0 = nobody has written one yet).
    function reputation(){
      var list = state.reviews.slice(-RULES.review.keep), sum = 0;
      list.forEach(function(r){ sum += r.stars; });
      return list.length ? sum / list.length : 0;
    }
    // how much of the walls / the floor was done over (0 .. 1)
    function doneShare(part, plain){
      var S2 = ctx.surfaces, list = !S2 ? [] : part === 'walls' ? S2.panels : S2.squares, n = 0, all = 0;
      list.forEach(function(p){ if (p.area === (state.owned.bigroom ? 'left' : 'ext')) return; all++;   // (only what can be seen: see index.html panelShown)
        var v = state.decor[part][p.id]; if (v && v !== plain) n++; });
      return all ? n / all : 0;
    }
    // where a delivered thing is put down: the first free place in a row along the storeroom's wall
    // (there are at most DOCK_SLOTS - 1 buckets and packs at a time, bought or on their way: see buyLook)
    function freeSlot(){
      var taken = {};
      Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (o.at === 'dock') taken[o.slot || 0] = true; });
      taken[0] = true;   // (slot 0 is the delivery box's)
      for (var i = 1; i < DOCK_SLOTS; i++) if (!taken[i]) return i;
      return DOCK_SLOTS - 1;
    }
    function thingsAround(){
      return Object.keys(state.items).filter(function(id){ var k = state.items[id].kind; return k === 'paint' || k === 'boards'; }).length +
             state.orders.filter(function(o){ return !!o.thing; }).length;
    }
    function surfaceOf(list, id){ var S2 = ctx.surfaces; return S2 && S2[list].filter(function(p){ return p.id === id; })[0]; }
    function furniturePiece(id){ for (var i = 0; i < state.furniture.length; i++) if (state.furniture[i].id === id) return state.furniture[i]; return null; }
    function dirtyOnTables(){ return Object.keys(state.items).filter(function(id){ var o = state.items[id]; return o.kind === 'dirty' && o.at === 'table'; }).length; }
    // is a dirty bowl still standing at this guest's place? (nobody sits down there until it is cleared away)
    var MAX_SEATS = 64;   // (more chairs than the dining room could ever have: what a saved chair number may be)
    // the chairs nobody sits on (or is on the way to) and with no dirty bowl in front of them
    function bowlSpot(sp){
      var t = sp.table, f = V(Math.sin(sp.rot), 0, Math.cos(sp.rot));
      if (!t) return V(sp.x, 1, sp.z);
      var along = (t.x - sp.x) * f.x + (t.z - sp.z) * f.z, half = ctx.tables && ctx.tables.halfAlong ? ctx.tables.halfAlong(t, f) : t.halfZ;
      return V(sp.x, t.top, sp.z).addScaledVector(f, along - half + 0.34);
    }
    function freeSeats(){
      var info = ctx.getGuests()[0], n = info && info.chairs ? info.chairs() : 0, taken = {};
      state.guests.forEach(function(g){ if (g.phase !== 'away' && num(g.seat)) taken[g.seat] = true; });
      Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (o.kind === 'dirty' && o.at === 'table' && num(o.seat)) taken[o.seat] = true; });
      var out = []; for (var k = 0; k < n; k++) if (!taken[k] && (!ctx.tables || !ctx.tables.usable || ctx.tables.usable(k))) out.push(k);   // (a chair not at a table: nobody sits there)
      return out;
    }
    // A guest's visit is over: what it was like, the stars for it, and (if the guest writes one) the review.
    // served: the guest got the stew (g.q: how good it was, g.patience: the patience that was left when it came).
    function review(g, served){
      var W = RULES.review, stains = play.getStains ? play.getStains().length : 0;   // (the floor is gameplay.js's)
      var f = { food: served ? clamp(num(g.q) ? g.q : 1) : 0, wait: served ? clamp((num(g.patience) ? g.patience : 1) * 1.15) : 0,
                clean: clamp(1 - W.dirt * stains - W.dishes * dirtyOnTables() - W.spills * state.spills.length), value: 0, mood: mood() };
      f.value = served ? clamp(0.5 + 0.5 * f.food - PRICE_VALUE * ((num(g.price) ? g.price : dishOf(g.got).price) - dishOf(g.got).price)) : 0;   // a fair price for good food (dearer: worth less)
      var score = 0;
      Object.keys(W.weights).forEach(function(k){ score += W.weights[k] * f[k]; });
      var stars = served ? clamp(Math.round(1 + 4 * score), 1, 5) : 1;
      if (served && Math.random() > W.writes) return null;
      var r = { id: state.nextId++, day: state.day.n, who: g.id, stars: stars, text: '', food: +f.food.toFixed(2), wait: +f.wait.toFixed(2), clean: +f.clean.toFixed(2) };
      r.text = reviewText(stars, f, served, r.id);
      var ate = served && g.got && g.got !== 'stew' ? dishOf(g.got).short : null;   // (the sentences speak of stew: of what he had)
      if (ate) r.text = r.text.replace(/stew/g, ate);
      else if (!served && g.want && g.want !== 'stew') r.text = r.text.replace(/stew/g, dishOf(g.want).short);
      state.reviews.push(r);
      if (state.reviews.length > 60) state.reviews.shift();
      state.day.reviewed++; state.day.stars += stars; g.review = r.id; g.stars = stars;
      return r;
    }
    function priceOf(goods){ var c = 0; GOODS.forEach(function(k){ c += (goods[k] || 0) * RULES.cost[k]; }); return c; }
    function emptyPot(){
      var pot = state.pot;
      FOOD.forEach(function(k){ pot.has[k] = 0; });
      pot.cut = {}; pot.qs = []; pot.broth = 0; pot.spice = 0; pot.cooked = 0; pot.stick = 0; pot.burn = 0; pot.portions = 0; pot.phase = 'empty'; pot.dish = null;
    }
    function inPot(){ return state.pot.broth > 0.02 || FOOD.some(function(k){ return state.pot.has[k] > 0; }); }
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
    function isVeg(kind){ return VEG.indexOf(kind) >= 0; }     // (kept in a crate)
    function isFood(kind){ return FOOD.indexOf(kind) >= 0; }   // (cut on the block, put into the pot)
    function hasFridge(){ var k = ctx.getKitchen && ctx.getKitchen(); return !!(k && k.fridgeAt) && !MODELS.sausage.failed; }
    function known(k){ return k === 'stew' || !!state.owned['recipe_' + k]; }   // (a recipe he has)
    function menu(){ var m = Object.keys(RECIPES).filter(function(k){ return known(k) && state.offer[k] !== false; }); return m.length ? m : ['stew']; }
    var PRICE_RANGE = [5, 16];
    function dishPrice(k){ var p = state.prices[k]; return num(p) ? p : dishOf(k).price; }
    // dearer than usual: each euro more makes it worth this much less to a guest, and guests come this much less often
    var PRICE_VALUE = 0.12, PRICE_GUESTS = 0.07;
    function dearer(){ var m = menu(), d = 0; m.forEach(function(k){ d += dishPrice(k) - dishOf(k).price; }); return d / m.length; }
    function dishOf(k){ return isDish(k) ? RECIPES[k] : RECIPES.stew; }
    // the dishes the pot can still become (what is in it fits their recipe), the closest first
    function fits(has){
      return Object.keys(RECIPES).filter(known).filter(function(k){ return FOOD.every(function(v){ return has[v] <= RECIPES[k].needs[v]; }); })
        .sort(function(a, b){ return lacking(a, has) - lacking(b, has); });
    }
    function lacking(k, has){ var n = 0; FOOD.forEach(function(v){ n += Math.max(0, RECIPES[k].needs[v] - has[v]); }); return n; }
    function potDish(){ var pot = state.pot; if (pot.dish) return pot.dish; var f = fits(pot.has); return f[0] || null; }
    function missing(){ var k = potDish(); return k ? FOOD.filter(function(v){ return state.pot.has[v] < RECIPES[k].needs[v]; }) : FOOD.slice(); }
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
      var pot = state.pot, it = carried(), day = state.day, g;
      switch (type){
        case 'take':       // a vegetable out of its crate
          if (it || !isVeg(arg) || state.crates[arg] <= 0) return false;
          state.crates[arg]--; newItem(arg); return true;
        case 'putBack':    // ... and back into it
          if (!it || !isVeg(it.kind) || it.cut || state.crates[it.kind] >= kitchenCap()) return false;
          state.crates[it.kind]++; dropItem(it); return true;
        case 'takeStore':  // a vegetable out of its crate in the storeroom
          if (it || !isVeg(arg) || state.store[arg] <= 0) return false;
          state.store[arg]--; newItem(arg); return true;
        case 'putStore':   // ... and back into it
          if (!it || !isVeg(it.kind) || it.cut || state.store[it.kind] >= storeCap()) return false;
          state.store[it.kind]++; dropItem(it); return true;
        case 'unpackStore':   // out of the delivery box into the storeroom's crate: arg = which vegetable
          if (!it || it.kind !== 'parcel' || !isVeg(arg) || !(it.goods[arg] > 0)) return false;
          var putS = Math.min(it.goods[arg], storeCap() - state.store[arg]);
          if (putS <= 0) return false;
          state.store[arg] += putS; it.goods[arg] -= putS;
          if (!GOODS.some(function(k){ return it.goods[k] > 0; })) dropItem(it);
          return true;
        case 'takeFridge': // a sausage out of the fridge
          if (it || state.fridge <= 0) return false;
          state.fridge--; newItem('sausage'); return true;
        case 'putFridge':  // ... and back into it
          if (!it || it.kind !== 'sausage' || it.cut || state.fridge >= RULES.fridgeStock) return false;
          state.fridge++; dropItem(it); return true;
        case 'wipe':       // the cloth over a spill: arg = { id, amount } (share of it wiped off)
          var sp = null, si = -1;
          state.spills.forEach(function(s, i){ if (arg && s.id === arg.id){ sp = s; si = i; } });
          if (!it || it.kind !== 'rag' || !sp || !(arg.amount > 0)) return false;
          sp.left -= arg.amount; if (sp.left <= 0) state.spills.splice(si, 1);
          return true;
        case 'wash':       // the dirty bowl in his hands, at the sink: clean again
          if (!it || it.kind !== 'dirty') return false;
          it.kind = 'bowl'; return true;
        case 'takeBowl':
          if (it || state.bowls <= 0) return false;
          state.bowls--; newItem('bowl'); return true;
        case 'returnBowl':   // (a dirty one only where the kitchen has no sink to wash it)
          if (!it || (it.kind !== 'bowl' && !(it.kind === 'dirty' && !(ctx.getKitchen() || {}).sinkAt))) return false;
          state.bowls++; dropItem(it); return true;
        case 'putDown':    // onto a work surface: arg = { x, y, z }
          if (!it || !arg || HOME[it.kind] || it.kind === 'paint' || it.kind === 'boards') return false;   // (those go back to the storeroom)
          it.at = 'surface'; it.x = arg.x; it.y = arg.y; it.z = arg.z; it.rot = arg.rot || 0; state.carry = null; return true;
        case 'pickUp':     // arg = item id
          g = state.items[arg];
          if (it || !g || (g.at !== 'surface' && g.at !== 'board' && g.at !== 'home' && g.at !== 'dock' && g.at !== 'pass' && !(g.at === 'table' && g.kind === 'dirty'))) return false;
          if (g.at === 'pass') delete g.slot;
          delete g.tilt;
          if (g.at === 'table') delete g.guest;
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
        case 'toBoard':    // a vegetable (or a sausage) onto the chopping block: arg = which way it lies
          if (!it || !isFood(it.kind) || state.board) return false;
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
          if (!it || !isFood(it.kind) || !isCut(it) || (pot.phase !== 'empty' && pot.phase !== 'filling') || pot.dish) return false;
          var more = {}; FOOD.forEach(function(v){ more[v] = pot.has[v] + (v === it.kind ? 1 : 0); });
          if (!fits(more).length) return false;   // (no dish on the menu has that much of it)
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
        case 'open':       // the front door: the opening hours begin
          if (day.phase !== 'prep') return false;
          day.phase = 'open'; state.open = true; state.nextGuest = RULES.firstGuest; return true;
        case 'close':      // ... and end: nobody new comes in, who is inside finishes the meal
          if (day.phase !== 'open') return false;
          day.phase = 'closed'; state.open = false; return true;
        case 'purchase':   // something from the shop: arg = its key
          var thing = shopItem(arg);
          if (arg === 'recipe_sausage' && !hasFridge()) return false;
          if (arg === 'pot2' && !(ctx.getKitchen && ctx.getKitchen() && ctx.getKitchen().potAt2)) return false;
          if (arg === 'waiter' && !(ctx.getWaiter && ctx.getWaiter().ready())) return false;
          if (!thing || state.owned[arg] || state.money < thing.price) return false;
          state.money -= thing.price; day.spent += thing.price; state.owned[arg] = true;
          if (arg === 'bowls') state.bowls += SHOP_EFFECT.bowls;
          if (arg === 'pot2' && state.pots.length < 2) state.pots.push(newPot());
          return true;
        case 'buyFurniture':   // a piece of furniture: it waits to be placed (arg = its key)
          var fi = furnitureItem(arg);
          if (!fi || state.money < fi.price || state.furniture.some(function(f){ return !f.placed; }) || state.furniture.filter(function(f){ return f.key === arg; }).length >= FURNITURE_MAX) return false;
          state.money -= fi.price; day.spent += fi.price;
          state.furniture.push({ id: state.nextId++, key: arg, x: 0, z: 0, rot: 0, placed: false });
          return true;
        case 'place':      // a piece put down: arg = { id, x, z, rot } (checked by the one who places it: placeOk)
          var pf = furniturePiece(arg && arg.id);
          if (!pf || pf.placed || !num(arg.x) || !num(arg.z) || !num(arg.rot)) return false;
          pf.x = arg.x; pf.z = arg.z; pf.rot = arg.rot; pf.placed = true; return true;
        case 'unplace':    // picked up again to be moved
          var uf = furniturePiece(arg);
          if (!uf || !uf.placed || state.furniture.some(function(f){ return !f.placed; })) return false;
          uf.placed = false; return true;
        case 'buyLook':    // a bucket of paint or a pack of flooring: arg = 'wall:sage' / 'floor:planks'; it is delivered
          var lp = String(arg).split(':'), li = lookItem(lp[0], lp[1]);
          if (!li || state.money < li.price || thingsAround() >= DOCK_SLOTS - 1) return false;
          state.money -= li.price; day.spent += li.price;
          state.orders.push({ id: state.nextId++, goods: emptyGoods(), cost: li.price, left: RULES.delivery,
                              thing: lp[0] === 'wall' ? { kind: 'paint', color: lp[1], left: PAINT_COVERS } : { kind: 'boards', floor: lp[1], left: FLOOR_COVERS } });
          return true;
        case 'price':      // the menu: arg = { dish, price } (whole euros)
          if (!arg || !isDish(arg.dish) || !known(arg.dish) || !num(arg.price) || arg.price !== Math.round(arg.price) || arg.price < PRICE_RANGE[0] || arg.price > PRICE_RANGE[1]) return false;
          state.prices[arg.dish] = arg.price; return true;
        case 'offer':      // a dish on / off the menu: arg = { dish, on } (one stays on)
          if (!arg || !isDish(arg.dish) || !known(arg.dish)) return false;
          if (!arg.on && menu().length <= 1 && menu()[0] === arg.dish) return false;
          state.offer[arg.dish] = !!arg.on; return true;
        case 'setDown':    // a bucket or a pack onto the floor where he works: arg = { x, z, rot }
          if (!it || (it.kind !== 'paint' && it.kind !== 'boards') || !arg || !num(arg.x) || !num(arg.z)) return false;
          it.at = 'surface'; it.x = arg.x; it.y = 0; it.z = arg.z; it.rot = num(arg.rot) ? arg.rot : 0; state.carry = null; return true;
        case 'dip':        // the roller into a bucket of paint that stands somewhere: arg = the bucket's id
          g = state.items[arg];
          if (!it || it.kind !== 'roller' || !g || g.kind !== 'paint' || g.at === 'hand' || !(g.left > 0) || (it.color === g.color && it.load >= 0.999)) return false;
          it.color = g.color; it.load = 1;
          if (--g.left <= 0) dropItem(g);   // (the empty bucket is thrown away)
          return true;
        case 'roll':       // paint goes from the roller onto the wall: arg = how much (1 = a whole panel)
          if (!it || it.kind !== 'roller' || !it.color || !(arg > 0)) return false;
          it.load = Math.max(0, (it.load || 0) - arg); return true;
        case 'paint':      // a panel the roller has covered all over: arg = the panel's id
          if (!it || it.kind !== 'roller' || !it.color || !surfaceOf('panels', arg) || !ctx.panelShown(surfaceOf('panels', arg)) || (state.decor.walls[arg] || 'cream') === it.color) return false;
          state.decor.walls[arg] = it.color; return true;
        case 'lay':        // a floor square laid with the mallet, the boards from a pack nearby: arg = { id, pack }
          var pk = arg && state.items[arg.pack], sq = arg && surfaceOf('squares', arg.id);
          if (!it || it.kind !== 'mallet' || !pk || pk.kind !== 'boards' || pk.at === 'hand' || !(pk.left > 0) || !sq || !ctx.squareShown(sq) || (state.decor.floor[arg.id] || 'tiles') === pk.floor) return false;
          state.decor.floor[arg.id] = pk.floor; if (--pk.left <= 0) dropItem(pk); return true;
        case 'buy':        // an order at the computer: arg = { potato, carrot, onion, broth, sausage } (how many of each)
          if (!arg) return false;
          var goods = emptyGoods(), any = false, inRoom = true;   // (not "fits": that is the function for the pot)
          GOODS.forEach(function(k){
            var n = arg[k] || 0;
            if (n !== Math.floor(n) || n < 0 || n > room(k)) inRoom = false;
            goods[k] = n; if (n > 0) any = true;
          });
          var price = priceOf(goods);
          if (!inRoom || !any || price > state.money) return false;
          state.money -= price; day.spent += price;
          state.orders.push({ id: state.nextId++, goods: goods, cost: price, left: RULES.delivery });
          return true;
        case 'unpack':     // out of the delivery box in his hands into the kitchen's stock: arg = which goods
          if (!it || it.kind !== 'parcel' || !(it.goods[arg] > 0)) return false;
          var put = arg === 'broth' ? it.goods.broth : arg === 'sausage' ? Math.min(it.goods.sausage, RULES.fridgeStock - state.fridge) : Math.min(it.goods[arg], kitchenCap() - state.crates[arg]);
          if (put <= 0) return false;
          if (arg === 'broth'){
            var jug2 = state.items[state.tools.broth];
            state.broth += put;
            if (jug2.at === 'home'){ var top = Math.min(COOK.jug - jug2.left, state.broth); jug2.left += top; state.broth -= top; }
          } else if (arg === 'sausage') state.fridge += put;
          else state.crates[arg] += put;
          it.goods[arg] -= put;
          if (!GOODS.some(function(k){ return it.goods[k] > 0; })) dropItem(it);   // the empty box is thrown away
          return true;
        case 'toDock':     // a delivery back to where it was delivered
          if (!it || (it.kind !== 'parcel' && it.kind !== 'paint' && it.kind !== 'boards')) return false;
          if (it.kind === 'parcel' && parcels().some(function(p){ return p.at === 'dock'; })) return false;
          it.at = 'dock'; it.slot = it.kind === 'parcel' ? 0 : freeSlot(); state.carry = null; return true;
        case 'endDay':     // everybody has gone: the day's accounts
          if (day.phase !== 'closed' || inside()) return false;
          if (state.owned.waiter && waiterHere()){ state.money -= RULES.staff.wage; day.spent += RULES.staff.wage; }   // (the waiter's wage)
          day.report = { n: day.n, served: day.served, lost: day.lost, sales: day.sales, tips: day.tips, cost: day.spent,
                         reviews: day.reviewed, stars: day.reviewed ? day.stars / day.reviewed : 0,
                         profit: day.sales + day.tips - day.spent, money: state.money };
          state.history.push(day.report);
          if (state.history.length > 60) state.history.shift();
          day.phase = 'done'; return true;
        case 'nextDay':    // the next morning
          if (day.phase !== 'done') return false;
          state.day = newDay(day.n + 1);
          state.guests.forEach(function(x){ x.rest = 0; }); state.nextGuest = RULES.firstGuest; return true;
        case 'heat':       // the stove: on / off (or arg = 0 / 1)
          pot.heat = typeof arg === 'number' ? clamp(Math.round(arg), 0, COOK.heat.length - 1) : (pot.heat + 1) % COOK.heat.length; return true;
        case 'dumpPot':    // throw away what burnt
          if (it || pot.phase !== 'burnt') return false;
          emptyPot(); return true;
        case 'ladle':      // one portion from the pot into the empty bowl in his hands
          if (!it || it.kind !== 'bowl' || pot.phase !== 'ready' || pot.portions <= 0) return false;
          it.kind = 'stew'; it.batch = pot.batch; it.q = pot.quality; it.dish = pot.dish || 'stew';
          if (--pot.portions <= 0) emptyPot();
          return true;
        case 'pourBack':
          if (!it || it.kind !== 'stew' || pot.phase !== 'ready' || it.batch !== pot.batch || pot.portions >= dishOf(pot.dish).portions) return false;
          it.kind = 'bowl'; delete it.batch; delete it.dish; pot.portions++; return true;
        case 'arrive':     // a guest comes in: arg = { id, seat } (a free chair)
          g = guest(arg && arg.id); if (!g || g.phase !== 'away' || !num(arg.seat) || freeSeats().indexOf(arg.seat) < 0) return false;
          g.phase = 'coming'; g.seat = arg.seat; return true;
        case 'seated':     // ... has sat down and reads the menu
          g = guest(arg); if (!g || g.phase !== 'coming') return false;
          g.phase = 'deciding'; g.t = rnd(RULES.decide[0], RULES.decide[1]); return true;
        case 'ready':      // ... has read the menu and wants to order
          g = guest(arg); if (!g || g.phase !== 'deciding') return false;
          g.phase = 'ready'; g.patience = 1; return true;
        case 'order':      // the chef takes the order at the table
          g = guest(arg); if (!g || g.phase !== 'ready') return false;
          var m = menu(), smelt = state.pots.filter(function(p){ return p.dish && m.indexOf(p.dish) >= 0 && p.phase !== 'burnt'; }),
              cooking = smelt.length ? smelt[Math.floor(Math.random() * smelt.length)].dish : null;
          g.want = cooking && Math.random() < 0.7 ? cooking : m[Math.floor(Math.random() * m.length)] || 'stew';   // (most like what they can smell)
          g.phase = 'waiting'; g.patience = Math.min(1, g.patience + 0.25); return true;   // (glad somebody came)
        case 'left':       // ... has gone out of the door
          g = guest(arg); if (!g || g.phase !== 'leaving') return false;
          g.phase = 'away'; g.rest = RULES.rest; return true;
        case 'serve':
          g = guest(arg); if (!g || g.phase !== 'waiting' || !it || it.kind !== 'stew') return false;
          state.carry = null; serveTo(g, it); return true;
        case 'serveBy':    // the waiter puts the bowl he carries in front of the guest: arg = { guest, item }
          g = guest(arg && arg.guest); var wb = arg && state.items[arg.item];
          if (!g || g.phase !== 'waiting' || !wb || wb.kind !== 'stew' || wb.at !== 'waiter') return false;
          serveTo(g, wb); return true;
        case 'toPass':     // a full bowl onto the bar for the waiter: arg = the place on the bar
          if (!it || it.kind !== 'stew' || !state.owned.waiter || !(arg >= 0 && arg < PASS_SLOTS) || passTaken(arg)) return false;
          it.at = 'pass'; it.slot = arg; state.carry = null; return true;
      }
      return false;
    }
    // a bowl put in front of a guest: what it is worth to him
    function serveTo(g, o){
      o.at = 'table'; o.guest = g.id; delete o.slot;
      g.phase = 'eating'; g.t = 0; g.item = o.id;
      var got = o.dish || 'stew', right = got === (g.want || 'stew');
      g.q = (o.q === undefined ? 1 : o.q) * (right ? 1 : 0.75);   // (the review will be about this, and about the patience that was left; not what he ordered: worth less)
      g.got = got; g.price = dishPrice(got);
      g.pay = g.price + Math.round(RULES.tip * g.patience * (0.4 + 0.6 * g.q));   // quick service and a well made dish tip better
    }
    var PASS_SLOTS = 3, DIRTY_SLOTS = [3, 4];   // full bowls on the bar for the waiter; where he puts the dirty ones he cleared
    function passTaken(k){ return Object.keys(state.items).some(function(id){ var o = state.items[id]; return o.at === 'pass' && o.slot === k; }); }
    // a pot on the range as time passes (state.pot)
    function cookPot(dt){
      var pot = state.pot, C = COOK, target = C.target[pot.heat];
      // the temperature follows the heat
      pot.temp += (target - pot.temp) * Math.min(1, (target > pot.temp ? C.warm : C.cool) * dt);
      if (pot.phase === 'filling' || pot.phase === 'ready'){
        // it cooks once everything is in and it is hot enough
        if (pot.phase === 'filling' && !pot.dish && !missing().length && pot.broth >= 0.4 && pot.temp >= C.slow) pot.dish = potDish();
        if (pot.phase === 'filling' && pot.dish && pot.broth >= 0.4 && pot.temp >= C.slow){
          pot.cooked += dt / (dishOf(pot.dish).cookTime * (state.owned.stove ? SHOP_EFFECT.stove : 1)) * (pot.temp >= C.hot ? 1.25 : pot.temp >= C.simmer ? 1 : 0.5);
          if (pot.cooked >= 1){ pot.cooked = 1; pot.phase = 'ready'; pot.portions = dishOf(pot.dish).portions; pot.batch = state.nextId++; }
        }
        // unstirred it catches on the bottom (sooner with too little broth), then it burns
        if (FOOD.some(function(k){ return pot.has[k] > 0; })){
          var rate = catchRate(pot.temp) * (pot.broth < 0.05 ? C.dry : pot.broth < C.brothOk[0] ? C.thick : 1) * (pot.phase === 'ready' ? 0.5 : 1);
          pot.stick = Math.min(1, pot.stick + rate * dt);
          if (pot.stick >= 1) pot.burn += dt / C.burnTime;
          if (pot.temp > C.hot) pot.burn += dt / C.hotBurn;
          if (pot.burn >= 1){ pot.burn = 1; pot.phase = 'burnt'; pot.portions = 0; }
        }
      }
      pot.quality = potQuality();
    }
    // what happens by itself as time passes
    function tick(dt){
      var day = state.day;
      // the clock runs during the opening hours; at closing time the restaurant closes by itself
      if (day.phase === 'open'){
        day.time += dt * (RULES.day.closes - RULES.day.opens) / RULES.day.length;
        if (day.time >= RULES.day.closes){ day.time = RULES.day.closes; act('close'); }
      }
      // orders arrive in the storeroom: a box (what comes while a box still stands there goes into that one)
      for (var oi = state.orders.length - 1; oi >= 0; oi--){
        var od = state.orders[oi];
        od.left -= dt;
        if (od.left > 0) continue;
        if (od.thing){   // a bucket or a pack: put down where deliveries arrive, beside what is there
          var th = od.thing; th.id = state.nextId++; th.at = 'dock'; th.slot = freeSlot(); state.items[th.id] = th;
          state.orders.splice(oi, 1); state.delivered++; continue;
        }
        var box = parcels().filter(function(p){ return p.at === 'dock'; })[0];
        if (!box){ box = { id: state.nextId++, kind: 'parcel', at: 'dock', slot: 0, goods: emptyGoods() }; state.items[box.id] = box; }
        for (var gi = 0; gi < GOODS.length; gi++) box.goods[GOODS[gi]] += od.goods[GOODS[gi]] || 0;
        state.orders.splice(oi, 1); state.delivered++;
      }
      state.pots.forEach(function(p, i){ withPot(i, function(){ cookPot(dt); }); });   // (each pot on its own)
      var away = [];
      state.guests.forEach(function(g){
        if (g.phase === 'deciding'){
          g.t -= dt;
          if (g.t <= 0) act('ready', g.id);
        } else if (g.phase === 'ready'){
          g.patience -= dt / RULES.orderPatience;
          if (g.patience <= 0){ g.phase = 'angry'; g.t = 0; state.lost++; day.lost++; review(g, false); }
        } else if (g.phase === 'waiting'){
          g.patience -= dt / RULES.patience;
          if (g.patience <= 0){ g.phase = 'angry'; g.t = 0; state.lost++; day.lost++; review(g, false); }
        } else if (g.phase === 'eating'){
          g.t += dt;
          if (g.t >= RULES.eatTime){
            g.phase = 'paid'; g.t = 0; state.money += g.pay; state.served++;
            var paidFor = num(g.price) ? g.price : RECIPES.stew.price;
            day.served++; day.sales += paidFor; day.tips += g.pay - paidFor;
            review(g, true);
            var used = state.items[g.item];
            if (used){   // the empty bowl stays on the table, dirty, where it stood
              var gv2 = views[g.id];
              used.kind = 'dirty'; delete used.batch; delete used.q; used.seat = g.seat;
              if (gv2){ used.x = gv2.bowlAt.x; used.y = gv2.bowlAt.y; used.z = gv2.bowlAt.z; }
              else { dropItem(used); state.bowls++; }   // (nowhere to show it: back on the stack)
              if (gv2 && state.spills.length < RULES.spill.most && Math.random() < RULES.spill.chance){   // (beside the bowl and toward the middle of the table, so it shows and stays on it)
                var tbl = gv2.info.spot.table, inw = tbl ? V(tbl.x - gv2.bowlAt.x, 0, tbl.z - gv2.bowlAt.z).normalize() : V(0, 0, 1), acr = V(inw.z, 0, -inw.x);
                var sx = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.06), sz = 0.1 + Math.random() * 0.06;
                state.spills.push({ id: state.nextId++, x: gv2.bowlAt.x + acr.x * sx + inw.x * sz, y: gv2.bowlAt.y, z: gv2.bowlAt.z + acr.z * sx + inw.z * sz,
                                    kind: 3, size: 0.42 + Math.random() * 0.1, rot: Math.random() * 6.28, left: 1 });
              }
            }
            g.item = null;
          }
        } else if (g.phase === 'paid' || g.phase === 'angry'){
          g.t += dt;
          if (g.t >= RULES.linger) g.phase = 'leaving';
        } else if (g.phase === 'away'){
          g.rest = Math.max(0, (g.rest || 0) - dt);
          if (g.rest <= 0) away.push(g);
        }
      });
      // while the restaurant is open, guests come in one after the other
      if (!state.guests.length || !place.pot || !state.open) return;
      state.nextGuest -= dt;
      if (state.nextGuest <= 0){
        var seats = freeSeats();
        if (away.length && seats.length) act('arrive', { id: away[Math.floor(Math.random() * away.length)].id, seat: seats[Math.floor(Math.random() * seats.length)] });
        var stars = reputation(), draw = stars ? RULES.review.draw[0] + (RULES.review.draw[1] - RULES.review.draw[0]) * (stars - 1) / 4 : 1;
        state.nextGuest = rnd(RULES.guestEvery[0], RULES.guestEvery[1]) / draw / (state.owned.bigroom ? SHOP_EFFECT.guests : 1) * Math.max(0.7, 1 + PRICE_GUESTS * dearer());   // (cheaper: a few more come)   // a good name brings more guests
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
      'color:rgba(255,255,255,.85);font:600 13px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;pointer-events:none;user-select:none;white-space:pre}' +
      '.hp-stars{position:fixed;right:22px;top:92px;padding:5px 12px;border-radius:999px;background:rgba(15,12,10,.36);color:#ffd95a;' +
      'font:600 13px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;pointer-events:none;user-select:none;white-space:pre;opacity:0;transition:opacity .3s}' +
      '.hp-stars.on{opacity:1}.hp-stars span{color:rgba(255,255,255,.85)}' +
      '.hp-open i{width:9px;height:9px;border-radius:50%;background:#9a9a9a}.hp-open.on i{background:#6fd24f;box-shadow:0 0 6px rgba(111,210,79,.8)}.hp-open.late i{background:#e0a23a}' +
      // the day's accounts: a slip of paper in the middle of the screen
      '.hp-paper{width:360px;padding:26px 30px 22px;background:#f4ead2;color:#4a3626;font:500 17px/1.5 Georgia,"Times New Roman",serif;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.5);border-radius:2px;font-variant-numeric:lining-nums}' +
      '.hp-paper h2{margin:0;font:italic 700 30px/1.2 Georgia,"Times New Roman",serif;text-align:center}' +
      '.hp-paper .sub{text-align:center;font-style:italic;color:#8a6f55;margin:0 0 14px}' +
      '.hp-paper .row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dotted rgba(74,54,38,.4);padding:3px 0}' +
      '.hp-paper .row b{font-weight:700}.hp-paper .row.minus b{color:#b3321f}' +
      '.hp-paper .row.sum{border-bottom:none;border-top:2px solid #4a3626;margin-top:9px;padding-top:7px;font-size:19px;font-weight:700}' +
      '.hp-paper .row.plus b{color:#3f8a2c}' +
      '.hp-paper .small{font-size:13.5px;font-style:italic;color:#b3321f;padding:2px 0}' +
      '.hp-paper .go{margin-top:16px;text-align:center;font:600 14px/1.3 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;color:#6b513a}' +
      '.hp-paper kbd{display:inline-block;min-width:22px;padding:2px 6px;margin-right:7px;border-radius:5px;background:#4a3626;color:#f4ead2;font:700 13px/1.3 system-ui,"Segoe UI",sans-serif}' +
      '.hp-day{position:fixed;left:50%;top:45%;transform:translate(-50%,-50%) rotate(-1.2deg) scale(.94);opacity:0;transition:opacity .35s,transform .35s;' +
      'pointer-events:none;user-select:none;z-index:15}' +
      '.hp-day.on{opacity:1;transform:translate(-50%,-50%) rotate(-1.2deg) scale(1)}' +
      // continue or start over, when the game starts with a saved restaurant
      '.hp-start{position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(15,12,10,.5);z-index:20;user-select:none}' +
      '.hp-start .hp-paper{text-align:center;transform:rotate(-1deg)}' +
      '.hp-start h2{font-size:36px}.hp-start p{margin:6px 0 0;font-style:italic;color:#6b513a}.hp-start p.warn{color:#b3321f;font-size:14.5px}' +
      '.hp-start button{display:block;width:100%;margin-top:11px;padding:10px 12px;border:2px solid #4a3626;border-radius:3px;background:#4a3626;color:#f4ead2;' +
      'font:700 18px/1.2 Georgia,"Times New Roman",serif;cursor:pointer}' +
      '.hp-start button:first-of-type{margin-top:20px}.hp-start button.quiet{background:transparent;color:#4a3626}' +
      '.hp-start button:hover{background:#6b513a;color:#f4ead2}' +
      '.hp-hold .hp-money,.hp-hold .hp-open,.hp-hold .hp-stars,.hp-hold .hp-carry,.hp-hold .hp-hint{visibility:hidden}' +
      // the computer in the office: a flat monitor; on it paper notes on the kitchen's dark wood
      '.hp-pc{position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(8,6,4,.6);z-index:18;' +
      'font:15px/1.4 Georgia,"Times New Roman",serif;font-variant-numeric:lining-nums;color:#4a3626;user-select:none;' +
      'opacity:0;visibility:hidden;transition:opacity .35s,visibility .35s}' +
      '.hp-pc.on{opacity:1;visibility:visible}' +
      '.hp-pc .case{position:relative;flex:none;margin-bottom:40px;padding:10px;background:#111317;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px #2a2e36}' +
      '.hp-pc .case:before{content:"";position:absolute;left:50%;bottom:-30px;width:110px;height:30px;margin-left:-55px;background:linear-gradient(90deg,#1a1d22,#3a3f49,#1a1d22)}' +
      '.hp-pc .case:after{content:"";position:absolute;left:50%;bottom:-40px;width:300px;height:11px;margin-left:-150px;border-radius:6px 6px 3px 3px;background:#2a2e36;box-shadow:0 6px 14px rgba(0,0,0,.5)}' +
      '.hp-pc .screen{width:920px;height:570px;display:flex;overflow:hidden;border-radius:8px;background:#3a2414 url(textures/k_wood.webp) center/560px}' +
      '.hp-pc svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.hp-pc button{font:inherit;cursor:pointer;border:none}' +
      '.hp-pc button:disabled{cursor:default}' +
      // the side: the program's name and its pages, as paper tabs on the wood
      '.hp-pc .side{width:186px;flex:none;display:flex;flex-direction:column;gap:6px;padding:18px 0 14px 12px;background:linear-gradient(90deg,rgba(14,8,4,.62),rgba(14,8,4,.4));color:#ead9b8}' +
      '.hp-pc .logo{display:flex;align-items:center;gap:10px;padding:0 6px 16px;color:#f4ead2;font:italic 700 19px/1.15 Georgia,"Times New Roman",serif;text-shadow:0 2px 0 rgba(0,0,0,.45)}' +
      '.hp-pc .logo i{display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none;border-radius:50%;background:#f4ead2;color:#4a3626;box-shadow:0 2px 0 rgba(0,0,0,.4)}' +
      '.hp-pc .logo i svg{width:22px;height:22px}' +
      '.hp-pc .logo small{display:block;font:italic 400 13px/1.2 Georgia,"Times New Roman",serif;color:#c9b48f;text-shadow:none}' +
      '.hp-pc .nav{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:4px 0 0 4px;background:transparent;color:#ead9b8;font:700 16px/1.2 Georgia,"Times New Roman",serif;text-align:left}' +
      '.hp-pc .nav:hover{background:rgba(244,234,210,.14)}' +
      '.hp-pc .nav.on{background:#f4ead2;color:#4a3626;box-shadow:0 2px 0 rgba(0,0,0,.35)}' +
      '.hp-pc .nav.out{margin-right:12px;border-radius:4px}' +
      '.hp-pc kbd{font:700 11px/1 system-ui,"Segoe UI",sans-serif;padding:3px 6px;margin-left:auto;border-radius:5px;background:rgba(244,234,210,.2);color:inherit}' +
      // the top: the page's name on the wood, and the day and the till as in the game's own display
      '.hp-pc .main{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.hp-pc .top{display:flex;align-items:center;gap:10px;height:64px;flex:none;padding:0 20px}' +
      '.hp-pc .top h2{margin:0;font:italic 700 28px/1.1 Georgia,"Times New Roman",serif;color:#f4ead2;text-shadow:0 2px 0 rgba(0,0,0,.45)}' +
      '.hp-pc .top h2 small{display:block;font:italic 400 13.5px/1.3 Georgia,"Times New Roman",serif;color:#d2bf9b;text-shadow:none}' +
      '.hp-pc .grow{flex:1}' +
      '.hp-pc .chip{display:flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:rgba(15,12,10,.55);color:rgba(255,255,255,.92);' +
      'font:600 13px/1.2 system-ui,"Segoe UI",sans-serif;letter-spacing:.3px;white-space:nowrap}' +
      '.hp-pc .chip i{width:9px;height:9px;border-radius:50%;background:#9a9a9a}.hp-pc .chip.open i{background:#6fd24f;box-shadow:0 0 6px rgba(111,210,79,.8)}' +
      '.hp-pc .chip.late i{background:#e0a23a}' +
      '.hp-pc .chip.till{font-size:15px}.hp-pc .chip.till i{width:14px;height:14px;background:radial-gradient(circle at 35% 30%,#ffe48a,#d79a1e);box-shadow:inset 0 0 0 1.5px rgba(120,70,0,.45)}' +
      '.hp-pc .page{flex:1;min-height:0;display:flex;gap:16px;padding:4px 22px 18px 20px}' +
      '.hp-pc .col{display:flex;flex-direction:column;gap:11px;min-width:0}' +
      // a note: a slip of paper
      '.hp-pc .card{position:relative;background:#f4ead2;border-radius:2px;box-shadow:0 3px 9px rgba(0,0,0,.45);padding:11px 15px}' +
      // (pinned, like the recipe on the kitchen wall)
      '.hp-pc .card:before{content:"";position:absolute;left:50%;top:-5px;width:11px;height:11px;margin-left:-5px;border-radius:50%;' +
      'background:radial-gradient(circle at 35% 30%,#ff9a85,#b3321f 60%,#7a1d12);box-shadow:0 2px 2px rgba(0,0,0,.45)}' +
      '.hp-pc .good:before{left:16px;margin-left:0}' +
      '.hp-pc .col:first-child .note{transform:rotate(-.5deg)}' +
      '.hp-pc .col:last-child .card:nth-child(odd){transform:rotate(.5deg)}.hp-pc .col:last-child .card:nth-child(even){transform:rotate(-.4deg)}' +
      '.hp-pc h4{margin:0 0 7px;padding-bottom:4px;border-bottom:1px dotted rgba(74,54,38,.45);font:italic 700 17px/1.2 Georgia,"Times New Roman",serif;color:#4a3626}' +
      '.hp-pc p{margin:0}.hp-pc .muted{color:#8a6f55}.hp-pc .small{font-size:13px}' +
      '.hp-pc .warn{color:#b3321f;font-weight:700}.hp-pc .ok{color:#3f8a2c;font-weight:700}' +
      // one thing to order
      '.hp-pc .good{flex:1;display:flex;align-items:center;gap:16px;padding:8px 16px}' +
      '.hp-pc .good:nth-child(odd){transform:rotate(-.25deg)}.hp-pc .good:nth-child(even){transform:rotate(.2deg)}' +
      '.hp-pc .pic{width:76px;height:76px;flex:none;border-radius:50%;background:#e9dab6;box-shadow:inset 0 0 0 2px rgba(74,54,38,.18);display:flex;align-items:center;justify-content:center}' +
      '.hp-pc .pic img{width:70px;height:70px}' +
      '.hp-pc .tight .good{padding:3px 16px;gap:12px}.hp-pc .tight .pic{width:50px;height:50px}.hp-pc .tight .pic img{width:46px;height:46px}.hp-pc .tight .stock{margin:2px 0}.hp-pc .tight small{line-height:1.15}' +   // (five kinds of goods)
      '.hp-pc .what{flex:1;min-width:0}.hp-pc .what b{font-size:20px}.hp-pc .price{margin-left:9px;font-style:italic;color:#8a6f55}' +
      '.hp-pc .stock{display:flex;gap:4px;margin:6px 0 4px}' +
      '.hp-pc .stock i{width:15px;height:15px;border:2px solid #4a3626;border-radius:2px}' +
      '.hp-pc .stock.many{gap:2px}.hp-pc .stock.many i{width:8px;height:15px;border-width:1.5px}' +
      '.hp-pc .stock i.full{background:#c9641f}.hp-pc .stock i.half{background:linear-gradient(90deg,#c9641f 50%,transparent 50%)}' +
      '.hp-pc .stock i.way{border-style:dashed;border-color:#a0591c;background:repeating-linear-gradient(135deg,rgba(201,100,31,.4) 0 3px,transparent 3px 6px)}' +
      '.hp-pc .what small{font-style:italic;color:#8a6f55;font-size:13px}' +
      '.hp-pc .qty{display:flex;align-items:center;gap:6px;flex:none}' +
      '.hp-pc .qty b{min-width:26px;text-align:center;font-size:20px}' +
      '.hp-pc .qty button{width:32px;height:32px;border-radius:50%;background:#f4ead2;border:2px solid #4a3626;color:#4a3626;font:700 18px/1 Georgia,"Times New Roman",serif}' +
      '.hp-pc .qty button:hover{background:#4a3626;color:#f4ead2}' +
      '.hp-pc .qty button:disabled{background:transparent;border-color:rgba(74,54,38,.28);color:rgba(74,54,38,.28)}' +
      // the order and the deliveries
      '.hp-pc .row{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px dotted rgba(74,54,38,.4)}' +
      '.hp-pc .row.total{margin-top:8px;padding-top:7px;border-bottom:none;border-top:2px solid #4a3626;font-size:19px;font-weight:700}' +
      '.hp-pc .row.after{border-bottom:none;font-style:italic;color:#8a6f55}' +
      '.hp-pc .note .row{padding:4px 0}.hp-pc .note .row.total{padding-top:7px}.hp-pc .row.minus b{color:#b3321f}.hp-pc .row.plus b{color:#3f8a2c}.hp-pc .row.till{border-bottom:none}' +
      '.hp-pc .primary{display:block;width:100%;margin:9px 0 7px;padding:9px;border:2px solid #4a3626;border-radius:3px;background:#4a3626;color:#f4ead2;font:700 18px/1.2 Georgia,"Times New Roman",serif}' +
      '.hp-pc .primary:hover{background:#6b513a}' +
      '.hp-pc .primary:disabled{background:transparent;border:2px dashed rgba(74,54,38,.35);color:rgba(74,54,38,.45)}' +
      '.hp-pc .ship{padding:6px 0;border-top:1px dotted rgba(74,54,38,.4)}.hp-pc .ship:first-of-type{border-top:none;padding-top:0}' +
      '.hp-pc .ship .bar{height:6px;margin-top:5px;border-radius:3px;background:rgba(74,54,38,.16);overflow:hidden}.hp-pc .ship .bar i{display:block;height:100%;background:#3f8a2c}' +
      '.hp-pc .cats{display:flex;gap:6px;flex-wrap:wrap}' +
      '.hp-pc .cat{padding:5px 12px;border-radius:3px;background:rgba(244,234,210,.16);color:#f4ead2;font:700 14px/1.2 Georgia,"Times New Roman",serif}' +
      '.hp-pc .cat:hover{background:rgba(244,234,210,.3)}.hp-pc .cat.on{background:#f4ead2;color:#4a3626}' +
      '.hp-pc .swatch{display:block;width:62px;height:62px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(74,54,38,.25)}' +
      '.hp-pc .small-btn{width:auto;margin:0;padding:6px 16px;font-size:16px;flex:none}' +
      '.hp-pc .cut{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      // the reviews
      '.hp-pc .stars{color:#c9641f;letter-spacing:2px;font-size:17px}.hp-pc .stars i{font-style:normal;color:rgba(74,54,38,.22)}' +
      '.hp-pc .big{font-size:44px;font-weight:700;line-height:1.1}.hp-pc .big .stars{font-size:22px;vertical-align:middle}' +
      '.hp-pc .rev{padding:8px 15px}.hp-pc .quote{font-style:italic;font-size:16px;line-height:1.3;margin:2px 0}' +
      '.hp-pc .one .cut{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
      // (a rubber stamp)
      '.hp-pc .tag{display:inline-block;padding:1px 7px;margin-right:8px;border:2px solid currentColor;border-radius:3px;transform:rotate(-2deg);opacity:.9;' +
      'font:700 12px/1.3 Georgia,"Times New Roman",serif;letter-spacing:1.2px;text-transform:uppercase;color:#a0591c}.hp-pc .tag.here{color:#3f8a2c}' +
      // the accounts
      '.hp-pc table{width:100%;border-collapse:collapse}.hp-pc td,.hp-pc th{padding:4px 5px;text-align:right;white-space:nowrap;border-bottom:1px dotted rgba(74,54,38,.4)}' +
      '.hp-pc th{font:italic 700 13.5px/1.2 Georgia,"Times New Roman",serif;color:#8a6f55}' +
      '.hp-pc td:first-child,.hp-pc th:first-child{text-align:left}.hp-pc tr:last-child td{border-bottom:none}.hp-pc td.neg{color:#b3321f}.hp-pc td.pos{color:#3f8a2c}';
    document.head.appendChild(css);
    var moneyEl = document.createElement('div'); moneyEl.className = 'hp-money';
    moneyEl.innerHTML = '<span class="hp-coin"></span><span class="hp-amount"></span>'; document.body.appendChild(moneyEl);
    var amountEl = moneyEl.querySelector('.hp-amount');
    var carryEl = document.createElement('div'); carryEl.className = 'hp-carry'; document.body.appendChild(carryEl);
    function euro(n){ return '€' + n; }
    var openEl = document.createElement('div'); openEl.className = 'hp-open'; openEl.innerHTML = '<i></i><span></span>'; document.body.appendChild(openEl);
    var starsEl = document.createElement('div'); starsEl.className = 'hp-stars'; document.body.appendChild(starsEl);   // the restaurant's stars, once there are reviews
    var shown = { money: null, carry: null, hud: null };
    function signed(n){ return (n < 0 ? '\u2212' : '') + euro(Math.abs(n)); }
    // the day's accounts (null: put the slip away)
    var dayEl = document.createElement('div'); dayEl.className = 'hp-day hp-paper'; document.body.appendChild(dayEl);
    function dayPanel(r){
      dayEl.classList.toggle('on', !!r);
      if (!r) return;
      function row(name, value, cls){ return '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + name + '</span><b>' + value + '</b></div>'; }
      dayEl.innerHTML = '<h2>Day ' + r.n + '</h2><div class="sub">The day\u2019s accounts</div>' +
        row('Guests served', r.served) + row('Guests who left hungry', r.lost, r.lost ? 'minus' : '') +
        row('Reviews', r.reviews ? r.stars.toFixed(1) + ' \u2605 (' + r.reviews + ')' : 'none') +
        row('Food sold', euro(r.sales)) + row('Tips', euro(r.tips)) + row('Bought', signed(-r.cost), r.cost ? 'minus' : '') +
        row('Profit today', signed(r.profit), 'sum ' + (r.profit < 0 ? 'minus' : 'plus')) + row('In the till', signed(r.money)) +
        '<div class="go"><kbd>E</kbd>Start day ' + (r.n + 1) + '</div>';
    }

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
          if (key === 'rag') md.tool = { grip: V(0, md.size.y, 0), dir: V(0, -1, 0), up: V(1, 0, 0) };   // (held from above, lying flat)
          if (key === 'spice') md.tool = { grip: V(0, md.size.y * 0.45, 0), dir: V(0, 1, 0), up: V(1, 0, 0) };
          if (key === 'roller' || key === 'mallet') md.tool = measureLong(md, key === 'roller' ? 0.2 : 0.15, key === 'roller');
          if (key === 'ladle') md.tool = { grip: V(0, md.size.y * 0.88, 0), dir: V(0, -1, 0), up: V(1, 0, 0) };   // held near the top, the bowl down
          md.obj = holder;
        }, function(e){ md.failed = true; console.error('Could not load ' + md.file + ':', e); }); })
        .catch(function(e){ md.failed = true; console.error('Could not load ' + md.file + ':', e); });
    });
    // a long tool lying along X, its working end at +X: where the hands hold it (grip near the other end,
    // grip2 further along for the second hand), the middle of its head, which way the head runs (axis)
    // and how thick it is
    function measureLong(md, head, twoHands){
      var p = md.pts, n = p.length / 3, hx = md.size.x / 2, i;
      function mid(x0, x1){
        var s = V(), k = 0;
        for (i = 0; i < n; i++) if (p[i * 3] >= x0 && p[i * 3] <= x1){ s.x += p[i * 3]; s.y += p[i * 3 + 1]; s.z += p[i * 3 + 2]; k++; }
        return k ? s.multiplyScalar(1 / k) : V((x0 + x1) / 2, md.size.y / 2, 0);
      }
      var c = mid(hx - head, hx + 1), lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9);
      for (i = 0; i < n; i++) if (p[i * 3] >= hx - head){ var v = V(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); lo.min(v); hi.max(v); }
      var ey = hi.y - lo.y, ez = hi.z - lo.z, axis = ey > ez ? V(0, 1, 0) : V(0, 0, 1);
      // the very end (the roller itself, the mallet's head): the middle and the radius of its box
      var lo2 = V(1e9, 1e9, 1e9), hi2 = V(-1e9, -1e9, -1e9), endX = hx - head * 0.85;
      for (i = 0; i < n; i++) if (p[i * 3] >= endX){ var w = V(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); lo2.min(w); hi2.max(w); }
      // (the roller's cylinder may lie at a slant: its middle and its direction from the points themselves)
      var endC = V(), k2 = 0, cv = [0, 0, 0, 0, 0, 0];
      for (i = 0; i < n; i++) if (p[i * 3] >= endX){ endC.x += p[i * 3]; endC.y += p[i * 3 + 1]; endC.z += p[i * 3 + 2]; k2++; }
      endC.multiplyScalar(1 / Math.max(1, k2));
      for (i = 0; i < n; i++) if (p[i * 3] >= endX){ var ax = p[i * 3] - endC.x, ay = p[i * 3 + 1] - endC.y, az = p[i * 3 + 2] - endC.z; cv[0] += ax * ax; cv[1] += ax * ay; cv[2] += ax * az; cv[3] += ay * ay; cv[4] += ay * az; cv[5] += az * az; }
      var endAxis = eigen3(cv)[0].vec.normalize(), across = Math.min(hi2.y - lo2.y, 0.3);
      // (once more, only with the points close to that line: the frame holding it is left out)
      // (the cover's surface: points about a radius away from that line, not the thin axle along it)
      var rel = V(), pa = 1e9, pb = -1e9, k3 = 0;
      for (i = 0; i < n; i++) if (p[i * 3] >= endX){
        rel.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).sub(endC);
        var along2 = rel.dot(endAxis), off2 = rel.clone().addScaledVector(endAxis, -along2).length();
        if (off2 > across * 0.32 && off2 < across * 0.62){ pa = Math.min(pa, along2); pb = Math.max(pb, along2); k3++; }
      }
      var coverLen = 0.3;
      if (k3 > 20){ endC = endC.clone().addScaledVector(endAxis, (pa + pb) / 2); coverLen = pb - pa; }
      return { grip: mid(-hx + 0.05, -hx + 0.14), grip2: twoHands ? mid(-hx + 0.62, -hx + 0.72) : null, head: c, axis: axis,
               long: Math.max(ey, ez), thick: Math.min(ey, ez, hi.x - lo.x), end: endC, endAxis: endAxis, endR: across / 2, endLen: coverLen, dir: V(1, 0, 0), up: axis };
    }
    function instance(key){ var md = MODELS[key]; return (md.obj || (md.failed && MODELS.parcel.obj) || new T.Group()).clone(true); }   // (a missing model: a box)
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
    function allLoaded(){ return Object.keys(MODELS).every(function(k){ return MODELS[k].obj || MODELS[k].failed; }); }   // (a model that cannot be loaded does not hold up the game)

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
    function bowlIcon(g, cx, cy, s, dot){
      g.fillStyle = dot || '#c8742c'; g.beginPath(); g.ellipse(cx, cy - 4 * s, 27 * s, 9 * s, 0, 0, Math.PI * 2); g.fill();          // the stew
      g.fillStyle = '#7a4a2a'; g.beginPath(); g.moveTo(cx - 30 * s, cy - 3 * s);                                             // the bowl
      g.bezierCurveTo(cx - 28 * s, cy + 26 * s, cx + 28 * s, cy + 26 * s, cx + 30 * s, cy - 3 * s);
      g.bezierCurveTo(cx + 14 * s, cy + 5 * s, cx - 14 * s, cy + 5 * s, cx - 30 * s, cy - 3 * s); g.fill();
      g.strokeStyle = 'rgba(90,70,60,.75)'; g.lineWidth = 3 * s; g.lineCap = 'round';                                       // steam
      [-11, 0, 11].forEach(function(dx){
        g.beginPath(); g.moveTo(cx + dx * s, cy - 15 * s);
        g.bezierCurveTo(cx + (dx - 6) * s, cy - 22 * s, cx + (dx + 6) * s, cy - 27 * s, cx + dx * s, cy - 34 * s); g.stroke();
      });
    }
    // a guest's order: a bowl of the dish (in its colour) and a bar that runs out with the guest's patience
    function drawOrder(s, patience, want){
      var key = 'o' + Math.round(patience * 40) + (want || '');
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; bubbleShape(g, 'rgba(255,252,244,.96)'); bowlIcon(g, 64, 50, 1, dishOf(want).dot);
      g.fillStyle = 'rgba(60,45,35,.18)'; g.fillRect(28, 80, 72, 9);
      g.fillStyle = patience > 0.5 ? '#5aa046' : patience > 0.25 ? '#d9a21f' : '#cf4a32';
      g.fillRect(28, 80, 72 * clamp(patience), 9);
      s.tex.needsUpdate = true;
    }
    function drawDeciding(s){
      if (s.drawn === 'deciding') return; s.drawn = 'deciding';
      var g = s.g; bubbleShape(g, 'rgba(255,252,244,.96)');
      g.fillStyle = 'rgba(70,52,40,.75)';
      [40, 64, 88].forEach(function(x){ g.beginPath(); g.arc(x, 54, 8, 0, Math.PI * 2); g.fill(); });
      s.tex.needsUpdate = true;
    }
    function drawReady(s, patience){
      var key = 'r' + Math.round(patience * 40);
      if (s.drawn === key) return; s.drawn = key;
      var g = s.g; bubbleShape(g, 'rgba(255,252,244,.96)');
      g.fillStyle = '#f3e7c4'; g.strokeStyle = 'rgba(70,52,40,.8)'; g.lineWidth = 3;
      g.fillRect(40, 20, 40, 52); g.strokeRect(40, 20, 40, 52);                                   // the pad
      g.fillStyle = 'rgba(70,52,40,.55)'; [32, 42, 52, 62].forEach(function(y){ g.fillRect(46, y, 28, 3); });
      g.save(); g.translate(86, 30); g.rotate(0.6); g.fillStyle = '#d9a21f'; g.fillRect(-4, 0, 8, 40);   // the pencil
      g.fillStyle = '#5a4230'; g.beginPath(); g.moveTo(-4, 40); g.lineTo(4, 40); g.lineTo(0, 48); g.fill(); g.restore();
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
    // The recipe: a sheet of paper on the wall behind the range. What is done is ticked off.
    function drawRecipe(rc){
      var pot = state.pot, okBroth = pot.broth >= COOK.brothOk[0] - 0.02, cooking = pot.phase === 'filling' && pot.cooked > 0;
      var dk = potDish() || 'stew', D = dishOf(dk), others = menu().filter(function(k){ return k !== dk; });
      var lines = FOOD.filter(function(v){ return D.needs[v] > 0; }).map(function(v, n){
        return [D.lines[n] || (D.needs[v] + ' ' + v), pot.has[v] >= D.needs[v]];
      }).concat([
        ['Broth up to the line', okBroth],
        ['3 shakes of seasoning' + (pot.spice > 0 && pot.spice !== COOK.spice ? '  (' + pot.spice + ')' : ''), pot.spice === COOK.spice, pot.spice > COOK.spice],
        ['Stove on, stir now and then', cooking || pot.phase === 'ready']
      ]);
      var done = pot.phase === 'ready' || pot.phase === 'burnt';
      var key = (state.pots.length > 1 ? state.potAt : '') + dk + others.join() + lines.map(function(l){ return (l[1] ? 1 : 0) + (l[2] ? 'x' : '') + l[0].length; }).join('') + pot.phase;
      if (rc.drawn === key) return; rc.drawn = key;
      var g = rc.g, W = 512, H = 640;
      g.fillStyle = '#f4ead2'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(120,90,40,.10)'; for (var i = 0; i < 40; i++) g.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 90, 1.5);   // a little worn
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
      g.fillStyle = '#9a2f22'; g.beginPath(); g.arc(W / 2, 30, 13, 0, Math.PI * 2); g.fill();   // the pin
      if (state.pots.length > 1){   // which pot: the one he stands at
        g.font = 'italic 700 24px Georgia,"Times New Roman",serif'; g.fillStyle = '#9a2f22'; g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(state.potAt ? 'right pot' : 'left pot', W - 34, 34);
      }
      g.fillStyle = '#3b2a1c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'italic 700 50px Georgia,"Times New Roman",serif'; g.fillText(D.name, W / 2, 96);
      g.font = 'italic 400 25px Georgia,"Times New Roman",serif'; g.fillStyle = '#6b513a';
      g.fillText('one pot gives ' + D.portions + ' portions' + (!pot.dish && fits(pot.has).length > 1 ? '  \u00b7  or: ' + fits(pot.has).filter(function(k){ return k !== dk; }).map(function(k){ return RECIPES[k].short; }).join(', ') : ''), W / 2, 142);
      g.strokeStyle = 'rgba(90,60,30,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(60, 172); g.lineTo(W - 60, 172); g.stroke();
      g.textAlign = 'left';
      lines.forEach(function(l, n){
        var y = 222 + n * 62;
        g.strokeStyle = '#5a4230'; g.lineWidth = 3; g.strokeRect(44, y - 17, 34, 34);
        if (l[1]){ g.strokeStyle = '#3f8a2c'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(49, y); g.lineTo(60, y + 12); g.lineTo(84, y - 20); g.stroke(); }
        g.font = '400 31px Georgia,"Times New Roman",serif'; g.fillStyle = l[2] ? '#b3321f' : l[1] ? '#7b6a58' : '#3b2a1c';
        g.fillText(l[0], 98, y + 1);
      });
      g.textAlign = 'center'; g.font = 'italic 700 31px Georgia,"Times New Roman",serif';
      g.fillStyle = pot.phase === 'burnt' ? '#b3321f' : done ? '#3f8a2c' : '#6b513a';
      g.fillText(pot.phase === 'burnt' ? 'Burnt! Throw it away.' : done ? 'Ready: ladle it into bowls.' : 'It is ready when it is thick.', W / 2, 600);
      rc.tex.needsUpdate = true;
    }
    // how the pot is doing, in a few words (shown when he stands at it with free hands)
    function potStatus(){
      var pot = state.pot, chef = ctx.getChef(), P = place.pot;
      if (!chef || !P || Math.hypot(chef.position.x - P.pos.x, chef.position.z - P.pos.z) > 2.6) return '';
      var veg = FOOD.some(function(k){ return pot.has[k] > 0; });
      var dn = dishOf(potDish()).name;
      if (pot.phase === 'burnt') return 'The ' + dn.toLowerCase() + ' is burnt';
      if (pot.stick >= 0.6 && veg) return pot.broth < 0.05 ? 'It is catching \u2013 add broth!' : 'It is catching \u2013 stir!';
      if (pot.phase === 'ready') return dn + ' is ready \u2013 ' + pot.portions + (pot.portions === 1 ? ' portion' : ' portions') + ' left' + (pot.heat ? '   \u00b7   turn the stove off' : '');
      if (pot.phase !== 'filling') return '';
      if (missing().length || pot.broth < COOK.brothOk[0] - 0.02) return '';   // the recipe on the wall says what is missing
      if (!pot.heat) return 'Everything is in \u2013 turn the stove on';
      if (pot.temp < COOK.slow) return 'Heating up\u2026';
      return 'Cooking\u2026 ' + Math.round(pot.cooked * 100) + '%';
    }
    // "+€11" floating up from a table
    var pops = [];
    function popMoney(pos, amount){ popText(pos, '+' + euro(amount), 44); }
    // ... and the stars of a review floating up over the guest who wrote it
    // (five stars: the ones given in gold, the others dark)
    function popStars(pos, stars){
      var s = popText(pos, '', 23), g = s.g, five = '\u2605\u2605\u2605\u2605\u2605';
      g.textAlign = 'left';
      var x = 64 - g.measureText(five).width / 2;
      g.lineWidth = 5; g.strokeStyle = 'rgba(30,22,10,.85)'; g.strokeText(five, x, 64);
      g.fillStyle = '#5a4a3a'; g.fillText(five, x, 64);
      g.fillStyle = '#ffd95a'; g.fillText(five.slice(0, stars), x, 64);
      s.tex.needsUpdate = true;
    }
    function popText(pos, text, px){
      var s = sign(0.8), g = s.g;
      g.clearRect(0, 0, 128, 128);
      g.font = '800 ' + px + 'px system-ui,"Segoe UI","Segoe UI Symbol",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = px > 30 ? 8 : 5; g.strokeStyle = 'rgba(30,22,10,.85)'; g.strokeText(text, 64, 64);
      g.fillStyle = '#ffd95a'; g.fillText(text, 64, 64);
      s.tex.needsUpdate = true; s.sp.visible = true; s.sp.position.copy(pos);
      pops.push({ s: s, t: 0, y: pos.y });
      return s;
    }
    // steam over the pot: soft puffs that rise and fade
    var puffTex = (function(){
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(225,222,218,.5)'); gr.addColorStop(0.7, 'rgba(150,146,142,.2)'); gr.addColorStop(1, 'rgba(140,136,132,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(cv);
    })();
    function makePuffs(){
      var puffs = [];
      for (var i = 0; i < 8; i++){
        var p = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
        p.visible = false; root.add(p); puffs.push({ sp: p, t: i / 8, dx: rnd(-1, 1), dz: rnd(-1, 1) });
      }
      return puffs;
    }
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
    var place = { pot: null, crates: {}, stacks: null, board: null, knifeHome: null, recipe: null };
    var knifeHold = null, toolHold = {};   // how the tools are held (see gameplay.js: a tool)
    var BURNT_COL = new T.Color(0x1d1612);
    var STORE_X = [7.85, 8.4, 8.95], STORE_Z = -14.75, STORE_Z2 = -14.15;   // (second crates: bought)   // the storeroom's crates (in front of the rack, see decor.js)
    var STORE_GRID = null;   // (CRATE_GRID with a second layer: set below)
    var CRATE_GRID = [[-0.19, -0.075], [0, -0.075], [0.19, -0.075], [-0.19, 0.085], [0, 0.085], [0.19, 0.085]];
    STORE_GRID = CRATE_GRID.concat(CRATE_GRID.map(function(g){ return [g[0] + 0.09, g[1] + 0.04, 1]; }));
    function buildPlaces(){
      var k = ctx.getKitchen();
      if (place.pot || !allLoaded() || !k || !k.potAt || !k.bowlsAt || !k.board) return;
      // the chopping block is the cutting station; the cleaver that lay on it is the knife.
      // (the kitchen's own block model has the cleaver fixed to it: ours replaces it)
      k.board.obj.visible = false;
      var bo = instance('board'); bo.position.copy(k.board.pos); bo.rotation.y = 0.6; root.add(bo);
      place.board = { obj: bo, r: MODELS.board.size.x / 2, pos: V(k.board.pos.x, k.board.pos.y + MODELS.board.size.y, k.board.pos.z) };
      if (ctx.getMovables) ctx.getMovables().push({ key: 'k_board', name: 'k_board', holder: bo, box: null, big: false, upright: true,
        canMove: function(){ return !state.board; },   // (not with something on it)
        onPut: function(){ place.board.pos.set(bo.position.x, bo.position.y + MODELS.board.size.y, bo.position.z); } });
      place.knifeHome = V(k.board.pos.x, k.board.pos.y, k.board.pos.z - place.board.r - 0.17);
      // the wall behind the range (x = WALL): a shelf to the right of the pot for jug and
      // shaker, and the recipe above the pot
      var WALL = 9.97, SHELF_Y = 1.6, ss = MODELS.shelf.size, shelfX = WALL - ss.z / 2, shelfZ = k.potAt.z - 0.93;   // (left of the pots: the camera of a chef at the second pot would be in it on the right)
      var sh = instance('shelf'); sh.position.set(shelfX, SHELF_Y - ss.y, shelfZ); sh.rotation.y = -Math.PI / 2; root.add(sh);
      var rcv = document.createElement('canvas'); rcv.width = 512; rcv.height = 640;
      var rtex = new T.CanvasTexture(rcv); rtex.encoding = T.sRGBEncoding; rtex.anisotropy = 4;
      var sheet = new T.Mesh(new T.PlaneGeometry(0.52, 0.65), new T.MeshStandardMaterial({ map: rtex, roughness: 1, metalness: 0 }));
      sheet.position.set(WALL - 0.012, 1.95, k.potAt2 ? (k.potAt.z + k.potAt2.z) / 2 : k.potAt.z + 0.54);   // at eye level, between the two burners
      sheet.rotation.set(0, -Math.PI / 2, 0.02); sheet.receiveShadow = true; root.add(sheet);
      place.recipe = { mesh: sheet, g: rcv.getContext('2d'), tex: rtex, drawn: '' };
      // where the tools lie: the knife beside the block, jug and shaker on that shelf
      var jt = MODELS.broth.tool;
      place.home = { knife: { pos: place.knifeHome, rot: 0.25 },
                     broth: { pos: V(shelfX, SHELF_Y, shelfZ - 0.17), rot: Math.atan2(jt.up.z, jt.up.x) },   // its handle toward the aisle
                     spice: { pos: V(shelfX, SHELF_Y, shelfZ + 0.24), rot: 0.4 },
                     // in the storeroom, by its door: the roller leaning against the wall, the mallet on the floor below it
                     rag: { pos: V(6.72, k.bowlsAt.y, 4.22), rot: 0.3 },   // (between the block and the stock pot on the second prep table)
                     roller: leaning('roller', V(9.02, 0.01, -12.62), V(0.12, 1, 0), V(0, 0, 1)), mallet: { pos: V(8.72, 0, -12.45), rot: 0.15 } };
      function leaning(kind, foot, dir, axis){   // a long tool standing on its end
        var t = MODELS[kind].tool; if (!t) return { pos: foot, rot: 0 };
        var o = { pos: V(), dir: V(), up: V() }, d = dir.clone().normalize(), u = axis.clone().addScaledVector(d, -axis.dot(d)).normalize();
        rotA.makeBasis(d, u, V().crossVectors(d, u)); rotB.makeBasis(t.dir, t.up, V().crossVectors(t.dir, t.up));
        var q = new T.Quaternion().setFromRotationMatrix(rotA.multiply(rotB.transpose()));
        return { pos: foot.clone().addScaledVector(d, 0.9), q: q, at: foot.clone().sub(V(-MODELS[kind].size.x / 2, 0, 0).applyQuaternion(q)) };
      }
      function holdOf(kind, pose, more){
        var t = MODELS[kind].tool, o = { tool: true, grip: t.grip, dir: t.dir, up: t.up, lean: 0.3, pose: pose };
        Object.keys(more || {}).forEach(function(key){ o[key] = more[key]; });
        return o;
      }
      knifeHold = holdOf('knife', knifePose, { lean: 0.34 });
      toolHold = { knife: knifeHold, broth: holdOf('broth', jugPose, { upright: true }), spice: holdOf('spice', spicePose, { upright: true }), ladle: holdOf('ladle', ladlePose),
                   roller: MODELS.roller.tool && holdOf('roller', rollerPose, { grip2: MODELS.roller.tool && MODELS.roller.tool.grip2, pole: true, lean: 0.12 }),
                   mallet: MODELS.mallet.tool && holdOf('mallet', malletPose, { lean: 0.3, kneel: function(){ return !!laying; } }),
                   rag: MODELS.rag.tool && holdOf('rag', ragPose, { lean: 0.3 }) };
      // the pantry corner: three crates side by side at the kitchen's back wall, between
      // the door to the back rooms and the side counter, right beside the range
      var cs = MODELS.crate.size, wallZ = -10;
      VEG.forEach(function(kind, i){
        var grp = new T.Group(), model = instance('crate');
        grp.position.set(7.62 + i * 0.52, 0, wallZ + 0.06 + cs.x / 2); grp.rotation.y = Math.PI / 2;   // short side to the wall
        grp.add(model); root.add(grp);
        var crateBox = ctx.addBox ? ctx.addBox(grp.position.x, grp.position.z, cs.z, cs.x, cs.y) : null;
        if (crateBox && ctx.getMovables) ctx.getMovables().push({ key: 'k_crate' + i, name: 'k_crate', holder: grp, box: crateBox, big: true, boxOff: { x: 0, z: 0 }, half: { x: cs.z / 2, z: cs.x / 2, yaw: grp.rotation.y } });
        var inside = STORE_GRID.map(function(g){   // (a second layer once the crates are bigger)
          var v = instance(kind);
          v.position.set(g[0] + rnd(-0.015, 0.015), g[2] ? 0.13 : 0.045, g[1] + rnd(-0.01, 0.01));
          v.rotation.y = kind === 'carrot' ? 1.57 + rnd(-0.25, 0.25) : rnd(0, 6.28);
          grp.add(v); return v;
        });
        place.crates[kind] = { grp: grp, model: model, inside: inside, pos: grp.position };
      });
      // the storeroom: three crates in front of the big rack, up to twelve in each (two layers)
      place.store = {};

      VEG.forEach(function(kind, i){
        var grp = new T.Group(), model = instance('crate');
        grp.position.set(STORE_X[i], 0, STORE_Z); grp.rotation.y = Math.PI / 2;
        grp.add(model); root.add(grp);
        var storeBox = ctx.addBox ? ctx.addBox(grp.position.x, grp.position.z, cs.z, cs.x, cs.y) : null;
        if (storeBox && ctx.getMovables) ctx.getMovables().push({ key: 'k_storecrate' + i, name: 'k_storecrate', holder: grp, box: storeBox, big: true, boxOff: { x: 0, z: 0 }, half: { x: cs.z / 2, z: cs.x / 2, yaw: grp.rotation.y } });
        var inside = STORE_GRID.map(function(g){
          var v = instance(kind);
          v.position.set(g[0] + rnd(-0.015, 0.015), g[2] ? 0.13 : 0.045, g[1] + rnd(-0.01, 0.01));
          v.rotation.y = kind === 'carrot' ? 1.57 + rnd(-0.25, 0.25) : rnd(0, 6.28);
          grp.add(v); return v;
        });
        // the second crate (bought): in front of the first one, hidden until then
        var grp2 = new T.Group(), model2 = instance('crate');
        grp2.position.set(STORE_X[i], 0, STORE_Z2); grp2.rotation.y = Math.PI / 2; grp2.visible = false;
        grp2.add(model2); root.add(grp2);
        var inside2 = STORE_GRID.map(function(g){
          var v = instance(kind);
          v.position.set(g[0] + rnd(-0.015, 0.015), g[2] ? 0.13 : 0.045, g[1] + rnd(-0.01, 0.01));
          v.rotation.y = kind === 'carrot' ? 1.57 + rnd(-0.25, 0.25) : rnd(0, 6.28);
          grp2.add(v); return v;
        });
        place.store[kind] = { grp: grp, model: model, inside: inside.concat(inside2), pos: grp.position, second: grp2, box2: null };
      });
      // the clean bowls: two stacks side by side
      var st = new T.Group(); st.position.copy(k.bowlsAt); root.add(st);
      if (ctx.getMovables) ctx.getMovables().push({ key: 'k_bowls', name: 'k_bowls', holder: st, box: null, big: false, upright: true });   // (held like a small thing; it lands the right way up)
      place.stacks = { grp: st, pos: st.position, bowls: [] };
      for (var n = 0; n < RULES.bowls + SHOP_EFFECT.bowls; n++){   // (room for the bowls from the shop)
        var b = instance('bowl');
        // (four towers of five: the first ten bowls in front, the ten from the shop behind them)
        var m = n % 10, back = n >= 10 ? 1 : 0;
        b.position.set(back ? 0.44 : 0, Math.floor(m / 2) * 0.062, (m % 2 ? 0.23 : -0.23)); b.rotation.y = rnd(0, 6.28);
        st.add(b); place.stacks.bowls.push(b);
      }
      // the pots on the range (the second one shows once it is bought)
      place.pots = [makePot(k.potAt)].concat(k.potAt2 ? [makePot(k.potAt2)] : []);
      if (!place.pots[state.potAt]) usePot(0);
      place.pot = place.pots[state.potAt];
    }

    // a pot on a burner: the stew in it, the vegetables lying in it before it cooks, the ladle, its steam
    var flameMat = null;
    function makePot(at){
      var pg = new T.Group(), pm = instance('pot'), size = MODELS.pot.size;
      pg.position.copy(at); pg.add(pm); root.add(pg);
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
        var fs2 = new T.Sprite(flameMat || (flameMat = new T.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false })));   // (one material for all the flames)
        var fa = fi / 10 * Math.PI * 2;
        fs2.position.set(Math.cos(fa) * size.x * 0.415, 0, Math.sin(fa) * size.x * 0.415); fs2.visible = false;   // just outside the pot's wall
        pg.add(fs2); flames.push(fs2);
      }
      var veg = {};
      FOOD.forEach(function(kind, i){
        var v = new T.Group(), a = i * 1.6;   // filled with the cut pieces when they are put in
        v.position.set(Math.cos(a) * inner * 0.45, size.y * 0.23, Math.sin(a) * inner * 0.45); v.rotation.y = a; v.visible = false;
        pg.add(v); veg[kind] = v;
      });
      var ladle = instance('ladle'); pg.add(ladle);
      return { grp: pg, puffs: makePuffs(), model: pm, pos: pg.position, size: size, inner: inner, stew: stew, veg: veg, ladle: ladle,
                    liquid: liquid, line: line, specks: { mesh: specks, g: scv.getContext('2d'), tex: stex, drawn: -1 }, flames: flames,
                    floor: size.y * 0.24, level: size.y * 0.24, spin: 0,
                    ladleTool: instance('ladle'),                                    // the same ladle in the chef's hand while he stirs
                    knob: V(at.x - 0.6, 0, at.z),                          // the range's knobs are at its front
                    stream: (function(){   // the broth running from the jug
                      var geo = new T.CylinderGeometry(0.011, 0.016, 1, 8); geo.translate(0, -0.5, 0);
                      var m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(0xc79a3a).convertSRGBToLinear(), roughness: 0.4, transparent: true, opacity: 0.92 }));
                      m.visible = false; root.add(m); return m;
                    })(),
                    low: size.y * 0.27, high: size.y * 0.8,                         // the stew's level: nearly empty .. full (the inside floor is at 0.22)
                    rest: { x: inner * 0.3, y: size.y * 0.24, z: -inner * 0.35, tilt: 0.42 } };   // the ladle leaning in the pot
    }

    // what the chef can do at the pot (state.pot); out: the list the choices are added to (see interactables)
    function potChoices(it, free, out){
      var pot = state.pot;
      function add(e){ out.push(e); }
      // the pot: E puts things in and ladles, the left button works with the tool in hand
      // (jug, shaker) or, with free hands, stirs with the ladle
      var pe = { pos: place.pot.pos, reach: RULES.reach, key: 'E' }, ready = pot.phase === 'ready', burnt = pot.phase === 'burnt', some = inPot();
      if (scoop) pe = null;
      else if (burnt){
        if (free){ pe.label = 'Throw the burnt ' + dishOf(potDish()).short + ' away'; pe.use = function(){ act('dumpPot'); }; pe.obj = place.pot.model; }
        else pe.label = 'The ' + dishOf(potDish()).short + ' is burnt';
      } else if (it && isFood(it.kind)){
        if (!isCut(it)) pe.label = 'Cut ' + KINDS[it.kind].the + ' up first';
        else if (ready) pe.label = 'The pot is done already';
        else if (pot.dish) pe.label = 'Everything for the ' + dishOf(pot.dish).short + ' is in';
        else if (!fits((function(){ var m = {}; FOOD.forEach(function(v){ m[v] = pot.has[v] + (v === it.kind ? 1 : 0); }); return m; })()).length) pe.label = 'No dish you can cook needs more ' + KINDS[it.kind].many;
        else { pe.label = 'Put ' + nameOf(it, 'the') + ' in the pot'; pe.use = function(){ act('addToPot'); }; pe.obj = place.pot.model; }
      } else if (it && it.kind === 'bowl'){
        if (ready){ pe.label = 'Ladle a portion'; pe.use = function(){ if (act('ladle')) scoop = { t: 0, item: it.id }; }; pe.obj = place.pot.model; }
        else pe.label = some ? 'It is not ready yet' : 'The pot is empty';
      } else if (it && it.kind === 'stew'){
        if (ready && it.batch === pot.batch && pot.portions < dishOf(pot.dish).portions){ pe.label = 'Pour it back'; pe.use = function(){ act('pourBack'); }; }
        else pe = null;
      } else if (it && it.kind === 'broth'){
        pe.key = 'LMB';
        if (ready) pe.label = 'The pot is done already';
        else if (it.left <= 0.01) pe.label = state.broth > 0.01 ? 'The jug is empty \u2013 fill it up at its place' : 'There is no broth left';
        else if (pot.broth >= COOK.brothMax - 0.01) pe.label = 'The pot is full';
        else { pe.label = 'Pour broth'; pe.use = startPour; pe.obj = place.pot.model; }
      } else if (it && it.kind === 'spice'){
        pe.key = 'LMB';
        if (!some) pe.label = 'Nothing in the pot to season';
        else { pe.label = 'Season'; pe.use = seasonOnce; pe.obj = place.pot.model; }
      } else if (free && some){ pe.key = 'LMB'; pe.label = 'Stir'; pe.use = startStir; pe.obj = place.pot.grp; }
      else if (free) pe = null;
      else pe = null;
      if (pe) add(pe);
      // the heat (with free hands, or with jug or shaker in hand)
      if (!burnt && !scoop && (free || (it && (it.kind === 'broth' || it.kind === 'spice')))){
        add({ pos: place.pot.knob, reach: RULES.reach, key: 'E', label: pot.heat ? 'Turn the stove off' : 'Turn the stove on', use: function(){ act('heat'); } });
      }
    }

    // ---------- the guests' side ------------------------------------------------------------
    var views = {};   // per guest: { info, sign, bowlAt, review (the last one whose stars were shown) }
    function view(info){
      var v = views[info.id];
      if (!v){
        v = views[info.id] = { info: info, sign: sign(0.62), bowlAt: bowlSpot(info.spot) };
      }
      if (!guest(info.id)){   // (a saved game brings what its guests were doing)
        state.guests.push({ id: info.id, phase: 'away', t: 0, patience: 0, pay: 0, rest: 0, item: null });
      }
      return v;
    }
    var headPos = V();
    // The bowl goes on the table in front of the guest where it is clear of the hands
    // lying there: between them if they are far enough apart, else just beyond them.
    function placeBowl(v){
      var sp = v.info.spot, t = sp.table, R = MODELS.stew.width / 2;
      if (!t) return;
      var fw = V(Math.sin(sp.rot), 0, Math.cos(sp.rot)), rt = V(fw.z, 0, -fw.x), half = ctx.tables && ctx.tables.halfAlong ? ctx.tables.halfAlong(t, fw) : t.halfZ;
      var edge = (t.x - sp.x) * fw.x + (t.z - sp.z) * fw.z - half;   // (from the chair to the table's near edge)
      var segs = (v.info.hands || []).map(function(h){
        if (!h) return null;
        var a = V(); h.getWorldPosition(a);
        var b = a.clone(), kid = h.children[0];
        if (kid){ kid.getWorldPosition(b); b.sub(a).setY(0); if (b.lengthSq() > 1e-6) b.setLength(0.2); b.add(a); }
        return [a, b];
      }).filter(Boolean);
      var best = null, p = V();
      for (var d = 0.2; d <= half - R + 0.001; d += 0.03){
        for (var side = -0.18; side <= 0.181; side += 0.06){
          p.set(sp.x, 0, sp.z).addScaledVector(fw, edge + d).addScaledVector(rt, side);   // (on the table in front of him)
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
        if (o.at === 'surface' && Math.hypot(o.x - x, o.z - z) < (o.kind === 'parcel' ? 0.45 : o.kind === 'bowl' || o.kind === 'stew' || o.kind === 'dirty' ? 0.36 : 0.24)) ok = false;
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
    function say(text, secs){ note.text = text; note.t = secs || 3.2; }
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
      if (toolMouse(dx, dy)) return true;
      if (pouring){ pouring.tilt = clamp(pouring.tilt + dy * 0.0045); return true; }   // pulled down it tips further
      if (wiping){   // the cloth goes where the mouse moves it, over the spill and round it
        var W = wiping, x0 = W.x, z0 = W.z, wl = 0.2;
        W.x += (W.r.x * dx - W.f.x * dy) * 0.0011; W.z += (W.r.z * dx - W.f.z * dy) * 0.0011;
        var wr = Math.hypot(W.x, W.z); if (wr > wl){ W.x *= wl / wr; W.z *= wl / wr; }
        var went = Math.hypot(W.x - x0, W.z - z0);
        if (went > 0) act('wipe', { id: W.id, amount: went / RULES.spill.wipe });
        if (!spillOf(W.id)){ stopWipe(); note.text = 'Clean again'; note.t = 1.6; }
        return true;
      }
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
    window.addEventListener('mousedown', function(e){ if (e.button === 2){ if (cutting) stopCutting(); if (pouring) stopPour(); if (stirring) stopStir(); if (wiping) stopWipe(); stopRolling(); stopLaying(); dipping = null; } });
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
    var wiping = null;   // { id, at (the spill), look, f, r, x, z (the cloth, from the spill's middle) }
    function spillOf(id){ for (var i = 0; i < state.spills.length; i++) if (state.spills[i].id === id) return state.spills[i]; return null; }
    function startWipe(id){
      var s = spillOf(id), chef = ctx.getChef(); if (!s || wiping || !chef) return;
      var f = V(s.x - chef.position.x, 0, s.z - chef.position.z).normalize(), th = Math.atan2(f.x, f.z);
      wiping = { id: id, at: V(s.x, s.y, s.z), look: th, f: f, r: V(-Math.cos(th), 0, Math.sin(th)), x: f.x * 0.04, z: f.z * 0.04 };   // (starting on the spill, where he can see it)
    }
    function stopWipe(){ wiping = null; }
    function ragPose(out){
      if (!wiping) return false;
      out.pos.set(wiping.at.x + wiping.x, wiping.at.y + MODELS.rag.size.y + 0.004, wiping.at.z + wiping.z);
      out.dir.set(0, -1, 0); out.up.copy(wiping.r);
      return true;
    }
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
    // ---------- furniture: shown where it stands, and put somewhere new ---------------------------
    // A piece that is not placed yet follows the view as a see-through ghost on the floor; E puts it
    // down where it is green, F turns it. Placed pieces can be picked up again (E) to move them.
    var furnObjs = {};   // id -> { obj, box, key, x, z, rot }
    var ghost = null;    // { id, obj, rot, x, z, ok }
    var ghostMats = { ok: new T.MeshBasicMaterial({ color: 0x6fd24f, transparent: true, opacity: 0.45, depthWrite: false }),
                      no: new T.MeshBasicMaterial({ color: 0xd2503f, transparent: true, opacity: 0.45, depthWrite: false }) };
    function footprint(key, rot){   // half sizes along x and z of a piece turned by rot
      var sz = MODELS[key].size, c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
      return { hx: (sz.x * c + sz.z * sn) / 2, hz: (sz.x * sn + sz.z * c) / 2 };
    }
    // where furniture may stand: the middle of the dining room (clear of the guests' way in from the door and
    // of the tables) and its extension once it is bought; not on anything, not on the chef
    function placeOk(key, x, z, rot){
      var fp = footprint(key, rot), r = Math.max(fp.hx, fp.hz), L = ctx.extension, chef = ctx.getChef();
      var inExtension = state.owned.bigroom && L && x - fp.hx > L.x0 + 0.05 && x + fp.hx < L.x1 - 0.1 && z - fp.hz > L.z0 + 0.05 && z + fp.hz < L.z1 - 0.05;
      var inRoom = x - fp.hx > -4.75 && x + fp.hx < 2.05 && z - fp.hz > -9.7 && z + fp.hz < 8.1;   // (the guests walk along the front wall and the aisle by the tables)
      if (!inExtension && !inRoom) return false;
      if (chef && Math.abs(chef.position.x - x) < fp.hx + 0.4 && Math.abs(chef.position.z - z) < fp.hz + 0.4) return false;
      if (Object.keys(state.items).some(function(id){ var o = state.items[id]; return o.at === 'surface' && o.y < 0.05 && Math.abs(o.x - x) < fp.hx + 0.35 && Math.abs(o.z - z) < fp.hz + 0.35; })) return false;
      return ctx.boxFree ? ctx.boxFree(x - fp.hx, x + fp.hx, z - fp.hz, z + fp.hz) : true;
    }
    var aimDir2 = V(), aimFrom2 = V();
    function syncFurniture(){
      // the pieces that are placed: one object each, with an obstacle around it
      Object.keys(furnObjs).forEach(function(id){
        var f = furniturePiece(+id), o = furnObjs[id];
        if (f && f.placed && f.key === o.key && f.x === o.x && f.z === o.z && f.rot === o.rot) return;
        root.remove(o.obj); if (o.box && ctx.removeBox) ctx.removeBox(o.box); delete furnObjs[id];
      });
      state.furniture.forEach(function(f){
        if (!f.placed || furnObjs[f.id] || !MODELS[f.key] || !MODELS[f.key].obj) return;
        var obj = instance(f.key), fp = footprint(f.key, f.rot);
        obj.position.set(f.x, 0, f.z); obj.rotation.y = f.rot; root.add(obj);
        furnObjs[f.id] = { obj: obj, key: f.key, x: f.x, z: f.z, rot: f.rot, box: ctx.addBox ? ctx.addBox(f.x, f.z, fp.hx * 2, fp.hz * 2, MODELS[f.key].size.y) : null };
      });
      // a piece waiting to be placed whose model cannot be loaded: given back
      state.furniture.slice().forEach(function(f){
        if (f.placed || !MODELS[f.key].failed) return;
        state.money += furnitureItem(f.key).price; state.furniture.splice(state.furniture.indexOf(f), 1);
      });
      // the piece being placed follows the view
      var p = null;
      state.furniture.forEach(function(f){ if (!f.placed && !p) p = f; });
      var busy = hold || pc || (ctx.seat && ctx.seat.active()) || !p || !MODELS[p.key] || !MODELS[p.key].obj;
      if (busy){ if (ghost){ root.remove(ghost.obj); ghost = null; } return; }
      if (!ghost || ghost.id !== p.id || ghost.key !== p.key){
        if (ghost) root.remove(ghost.obj);
        var g = instance(p.key);
        g.traverse(function(m){ if (m.isMesh){ m.castShadow = false; m.material = ghostMats.ok; } });
        root.add(g); ghost = { id: p.id, key: p.key, obj: g, rot: p.rot || 0, x: 0, z: 0, ok: false };
      }
      camera.getWorldPosition(aimFrom2); camera.getWorldDirection(aimDir2);
      var dist = aimDir2.y < -0.05 ? clamp(-aimFrom2.y / aimDir2.y, 1.3, 3.5) : 3.0;
      ghost.x = aimFrom2.x + aimDir2.x * dist; ghost.z = aimFrom2.z + aimDir2.z * dist;
      if (aimDir2.y >= -0.05){ var hl = Math.hypot(aimDir2.x, aimDir2.z) || 1; ghost.x = aimFrom2.x + aimDir2.x / hl * dist; ghost.z = aimFrom2.z + aimDir2.z / hl * dist; }
      ghost.ok = placeOk(p.key, ghost.x, ghost.z, ghost.rot);
      ghost.obj.position.set(ghost.x, 0.01, ghost.z); ghost.obj.rotation.y = ghost.rot;
      var mat = ghost.ok ? ghostMats.ok : ghostMats.no;
      ghost.obj.traverse(function(m){ if (m.isMesh) m.material = mat; });
    }

    // ---------- painting and laying the floor ------------------------------------------------------
    // The bucket and the pack are put down where he works. The roller (from the storeroom) is dipped
    // into the bucket; with the left mouse button held against a wall the mouse leads it up and down
    // and sideways, and where it goes the paint goes. A panel is done when it is covered all over;
    // a dip holds paint for one panel. The rubber mallet lays the floor: kneeling at a square, each
    // knock (mouse up, then down) lays one row of boards from the pack beside him.
    var rayFrom = V(), rayDir = V(), hit = { c: 0, y: 0, x: 0, z: 0 };
    // the wall panel or floor square he looks at (within reach); hit: where
    function lookedAt(kind, far){
      var S2 = ctx.surfaces; if (!S2) return null;
      camera.getWorldPosition(rayFrom); camera.getWorldDirection(rayDir);
      if (kind === 'floor'){
        if (rayDir.y > -0.15) return null;
        var t0 = -rayFrom.y / rayDir.y, fx = rayFrom.x + rayDir.x * t0, fz = rayFrom.z + rayDir.z * t0;
        hit.x = fx; hit.z = fz;
        if (t0 > (far || 4.5)) return null;
        return S2.squares.filter(function(q){ return fx >= q.x0 && fx < q.x1 && fz >= q.z0 && fz < q.z1 && ctx.squareShown(q); })[0] || null;
      }
      var best = null, bt = far || ROLL.far + 0.9;
      S2.panels.forEach(function(p){
        if (!ctx.panelShown(p)) return;
        var o = p.along === 'x' ? rayFrom.z : rayFrom.x, dd = p.along === 'x' ? rayDir.z : rayDir.x;
        if (Math.abs(dd) < 1e-4 || dd * p.facing > 0) return;   // (only from the room's side)
        var t1 = (p.at - o) / dd; if (t1 < 0 || t1 > bt) return;
        var c = p.along === 'x' ? rayFrom.x + rayDir.x * t1 : rayFrom.z + rayDir.z * t1, y = rayFrom.y + rayDir.y * t1;
        if (c < p.a || c > p.b || y < (p.y0 || 0) || y > ctx.wallHeight) return;
        best = p; bt = t1; hit.c = c; hit.y = y;
      });
      return best;
    }
    function wallNormal(p){ return p.along === 'x' ? V(0, 0, p.facing) : V(p.facing, 0, 0); }
    function wallAlong(p){ return p.along === 'x' ? V(1, 0, 0) : V(0, 0, 1); }
    function wallPoint(p, c, y){ return p.along === 'x' ? V(c, y, p.at) : V(p.at, y, c); }
    function fromWall(p){ var me = ctx.getChef().position; return (p.along === 'x' ? me.z - p.at : me.x - p.at) * p.facing; }
    function whereOf(o){ return o.at === 'dock' ? dockSpot(o.slot) : V(o.x || 0, 0, o.z || 0); }
    function nearest(kind, from, test, within){
      var best = null, bd = within;
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id]; if (o.kind !== kind || o.at === 'hand' || (test && !test(o))) return;
        var w = whereOf(o), d = Math.hypot(w.x - from.x, w.z - from.z); if (d < bd){ bd = d; best = o; }
      });
      return best;
    }
    // what has been rolled of a panel so far (until it is done): its colour, a grid of covered cells, the strokes
    var partial = {};   // panel id -> { color, cols, rows, cells: [], strokes: [[c0, c1, lo, hi], ...] }
    var rolling = null; // { p, look, c, y, from (where he stood), stroke (the one going on), dry }
    var dipping = null; // { t, bucket, look, f, r }
    var laying = null;  // { q, pack, look, kind, axis, sign, rows, h, armed, cool, x (along the row), f, r, from }
    function partialOf(p, color){
      var pp = partial[p.id];
      if (!pp || pp.color !== color){
        var cols = Math.max(2, Math.round((p.b - p.a) / 0.2)), rows = Math.max(2, Math.round((ctx.wallHeight - (p.y0 || 0)) / 0.25));
        pp = partial[p.id] = { color: color, cols: cols, rows: rows, cells: new Array(cols * rows).fill(false), strokes: [], n: 0 };
      }
      return pp;
    }
    function startRolling(p){
      var it = carried(); if (!it || it.kind !== 'roller' || rolling) return;
      var me = ctx.getChef().position, y0 = (p.y0 || 0) + 0.08, top = ctx.wallHeight - 0.08;
      var n = wallNormal(p), look = Math.atan2(-n.x, -n.z);
      rolling = { p: p, look: look, c: clamp(hit.c, p.a + ROLL.width / 2, p.b - ROLL.width / 2), y: clamp(hit.y, y0, top), from: V(me.x, 0, me.z), stroke: null, dry: false };
      partialOf(p, it.color);
    }
    function stopRolling(){ if (rolling){ rolling = null; } }
    // the roller has moved from (c0, y0) to where it is: what it went over gets paint
    function rollOver(c0, y0){
      var R = rolling, it = carried(), p = R.p, pp = partialOf(p, it.color), w = ROLL.width / 2, band = 0.07;
      if (!(it.load > 0)){ if (!R.dry){ R.dry = true; say('The roller is dry \u2013 dip it in the paint again'); } return; }
      var lo = Math.min(y0, R.y) - band, hi = Math.max(y0, R.y) + band, a = Math.min(c0, R.c) - w, b = Math.max(c0, R.c) + w;
      // (the strokes: a column every 9 cm across the panel, each as high as the roller went in it)
      var COL = 0.09, grew = false;
      for (var cc = Math.floor((a - p.a) / COL); cc * COL + p.a < b; cc++){
        if (cc < 0) continue;
        var s0 = Math.max(p.a, p.a + cc * COL), s1 = Math.min(p.b, p.a + (cc + 1) * COL), s = pp.strokes[cc];
        if (!s){ pp.strokes[cc] = [s0, s1, lo, hi]; grew = true; }
        else if (lo < s[2] - 0.01 || hi > s[3] + 0.01){ s[2] = Math.min(s[2], lo); s[3] = Math.max(s[3], hi); grew = true; }
      }
      // the cells whose middle it went over
      var y0p = p.y0 || 0, cw = (p.b - p.a) / pp.cols, rh = (ctx.wallHeight - y0p) / pp.rows, fresh = 0;
      for (var i = 0; i < pp.cols; i++){
        var cx = p.a + (i + 0.5) * cw; if (cx < a || cx > b) continue;
        for (var j = 0; j < pp.rows; j++){
          var cy = y0p + (j + 0.5) * rh;
          if (cy >= lo && cy <= hi && !pp.cells[i * pp.rows + j]){ pp.cells[i * pp.rows + j] = true; pp.n++; fresh++; }
        }
      }
      if (fresh) act('roll', fresh / (pp.cols * pp.rows));
      if (grew) ctx.surfaces.strokes(p.id, pp.color, pp.strokes.filter(Boolean));
      if (pp.n >= Math.ceil(pp.cols * pp.rows * 0.97)){   // covered (all but a sliver at the edge: that is done with it)
        if (act('paint', p.id)) say('Done \u2013 a fresh coat of ' + lookItem('wall', pp.color).name.toLowerCase());
        delete partial[p.id]; ctx.surfaces.strokes(p.id, null, []);
        stopRolling();
      }
    }
    function startDip(bucket){
      var it = carried(); if (!it || it.kind !== 'roller' || dipping || rolling) return;
      var me = ctx.getChef().position, w = whereOf(bucket), f = V(w.x - me.x, 0, w.z - me.z).normalize(), look = Math.atan2(f.x, f.z);
      dipping = { t: 0, bucket: bucket.id, look: look, f: f, r: V(-Math.cos(look), 0, Math.sin(look)) };
    }
    function startLaying(q, pack){
      var it = carried(); if (!it || it.kind !== 'mallet' || laying) return;
      var me = ctx.getChef().position, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      // the rows run across the way he looks at the square; the first one at its far side
      var dx = cx - me.x, dz = cz - me.z, axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z', sign = (axis === 'x' ? dx : dz) > 0 ? 1 : -1;
      laying = { q: q, pack: pack.id, kind: pack.floor, before: state.decor.floor[q.id] || 'tiles', axis: axis, sign: sign, rows: 0, h: 1, armed: true, cool: 0.2, x: 0.5, from: V(me.x, 0, me.z), fresh: -1 };
      ctx.surfaces.boards(q.id, pack.floor, []);
    }
    function stopLaying(){
      if (!laying) return;
      ctx.surfaces.boards(laying.q.id, laying.kind, []);   // (rows of a square not finished are taken up again)
      laying = null;
    }
    function rowRect(L, rows){   // the part of the square the first rows cover: [x0, x1, z0, z1]
      var q = L.q, s = rows / FLOOR_ROWS;
      if (L.axis === 'x') return L.sign > 0 ? [q.x1 - (q.x1 - q.x0) * s, q.x1, q.z0, q.z1] : [q.x0, q.x0 + (q.x1 - q.x0) * s, q.z0, q.z1];
      return L.sign > 0 ? [q.x0, q.x1, q.z1 - (q.z1 - q.z0) * s, q.z1] : [q.x0, q.x1, q.z0, q.z0 + (q.z1 - q.z0) * s];
    }
    function rowSpot(L){   // where the mallet knocks: the middle of the row being laid, at L.x along it
      var q = L.q, k = (L.rows + 0.5) / FLOOR_ROWS;
      if (L.axis === 'x') return V(L.sign > 0 ? q.x1 - (q.x1 - q.x0) * k : q.x0 + (q.x1 - q.x0) * k, 0, q.z0 + (q.z1 - q.z0) * L.x);
      return V(q.x0 + (q.x1 - q.x0) * L.x, 0, L.sign > 0 ? q.z1 - (q.z1 - q.z0) * k : q.z0 + (q.z1 - q.z0) * k);
    }
    function chefSpot(L){   // where he kneels: a little behind the row being laid
      var s = rowSpot(L), back = L.axis === 'x' ? V(-L.sign, 0, 0) : V(0, 0, -L.sign);
      return s.addScaledVector(back, 0.45);
    }
    function knock(){
      var L = laying;
      L.rows++; L.cool = 0.28; L.fresh = 0;
      knockSound();
      ctx.surfaces.boards(L.q.id, L.kind, [rowRect(L, L.rows)]);
      if (L.rows >= FLOOR_ROWS){
        var ok = act('lay', { id: L.q.id, pack: L.pack });
        if (ok) say('Done \u2013 ' + lookItem('floor', L.kind).name.toLowerCase() + ' laid');
        ctx.surfaces.boards(L.q.id, L.kind, []);
        laying = null;
      }
    }
    function knockSound(){
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        var t = audio.currentTime, n = Math.floor(audio.sampleRate * 0.12), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = ((Math.random() * 2 - 1) * 0.5 + Math.sin(i / audio.sampleRate * 2 * Math.PI * 140)) * Math.pow(1 - i / n, 4);
        var src = audio.createBufferSource(); src.buffer = buf;
        var flt = audio.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900;
        var gn = audio.createGain(); gn.gain.value = 0.5;
        src.connect(flt); flt.connect(gn); gn.connect(audio.destination); src.start(t);
      } catch (e) { /* no sound then */ }
    }
    // the mouse while rolling or knocking (see mouse())
    function toolMouse(dx, dy){
      if (rolling){
        var R = rolling, p = R.p, c0 = R.c, y0 = R.y;
        R.c = clamp(R.c + dx * ROLL.side, p.a + ROLL.width / 2, p.b - ROLL.width / 2);
        R.y = clamp(R.y - dy * ROLL.up, (p.y0 || 0) + 0.08, ctx.wallHeight - 0.08);
        if (Math.abs(R.y - y0) > 1e-4 || Math.abs(R.c - c0) > 1e-4) rollOver(c0, y0);
        return true;
      }
      if (laying){
        var L = laying;
        L.x = clamp(L.x + dx * 0.0016, 0.15, 0.85);
        if (L.cool <= 0){
          L.h = clamp(L.h - dy * 0.006);
          if (L.h >= 0.7) L.armed = true;
          if (L.h <= 0.06 && L.armed){ L.armed = false; knock(); }
        }
        return true;
      }
      return false;
    }
    // where the tools are while they are led (see toolHold): pos = where the hand holding the end is
    var rotA = new T.Matrix4(), rotB = new T.Matrix4();
    // the tool's head at 'at', its handle toward dir. along: the roller's own direction in the world
    // (it lies flat along the wall / across the bucket): then that is kept exactly and the handle
    // comes as close to dir as it can
    function placeTool(out, kind, at, dir, up, along, hands){   // hands: where he would like to hold it (a long handle)
      var t = MODELS[kind].tool, d = dir.clone().normalize(), q, mid = along ? t.end : t.head;
      if (along){
        var a1 = along.clone().normalize(), a2 = d.clone().addScaledVector(a1, -d.dot(a1)).normalize();
        var b1 = t.endAxis.clone(), b2 = t.dir.clone().addScaledVector(b1, -t.dir.dot(b1)).normalize();
        rotA.makeBasis(a1, a2, V().crossVectors(a1, a2)); rotB.makeBasis(b1, b2, V().crossVectors(b1, b2));
      } else {
        var u = up.clone().addScaledVector(d, -up.dot(d)).normalize();
        rotA.makeBasis(d, u, V().crossVectors(d, u)); rotB.makeBasis(t.dir, t.up, V().crossVectors(t.dir, t.up));
      }
      q = new T.Quaternion().setFromRotationMatrix(rotA.multiply(rotB.transpose()));
      out.pos.copy(at).sub(mid.clone().sub(t.grip).applyQuaternion(q));
      out.dir.copy(t.dir).applyQuaternion(q); out.up.copy(t.up).applyQuaternion(q);
      out.slide = 0;
      if (hands){   // (along the pole toward the head, as far as it lets him: the other hand needs room above)
        out.slide = clamp(hands.clone().sub(out.pos).dot(out.dir), 0, MODELS[kind].size.x - 0.95);
        out.pos.addScaledVector(out.dir, out.slide);
      }
      return true;
    }
    function rollerPose(out){
      var me = ctx.getChef(), t = MODELS.roller.tool;
      if (rolling){
        var p = rolling.p, n = wallNormal(p), at = wallPoint(p, rolling.c, rolling.y).addScaledVector(n, t.thick * 0.5 + 0.012);
        var th = me.rotation.y, rr = V(-Math.cos(th), 0, Math.sin(th));   // (his hands: in front of his belly, to his right, so the pole passes beside his head)
        var hands = V(me.position.x, me.position.y + 1.05, me.position.z).addScaledVector(n, -0.42).addScaledVector(rr, 0.26);
        return placeTool(out, 'roller', at, hands.clone().sub(at).negate(), null, wallAlong(p), hands);
      }
      if (dipping){
        var b = state.items[dipping.bucket]; if (!b) return false;
        var w = whereOf(b), k = dipping.t / DIP_TIME, wob = Math.sin(k * Math.PI * 4);   // in, rolled back and forth, out
        var depth = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 0.12;
        var at2 = V(w.x, MODELS.paint.size.y + 0.06 - depth, w.z).addScaledVector(dipping.f, wob * 0.05);
        var hands2 = V(me.position.x, me.position.y + 1.1, me.position.z).addScaledVector(dipping.f, 0.38).addScaledVector(dipping.r, 0.2);
        return placeTool(out, 'roller', at2, hands2.clone().sub(at2).negate(), null, dipping.r, hands2);
      }
      return false;
    }
    function malletPose(out){
      if (!laying) return false;
      var me = ctx.getChef(), t = MODELS.mallet.tool, s = rowSpot(laying), f = V(s.x - me.position.x, 0, s.z - me.position.z), d = f.length();
      f.normalize(); if (d > 0.55) s = V(me.position.x, 0, me.position.z).addScaledVector(f, 0.55);   // (within reach of his hand: at the edge of the boards)
      var lift = laying.h * 0.55, at = V(s.x, 0.016 + t.long / 2 + lift, s.z).addScaledVector(f, -laying.h * 0.12);
      var dir = f.clone(); dir.y = -0.2 + laying.h * 1.3;   // swung up: the head high above the hand; knocking: the handle flat
      return placeTool(out, 'mallet', at, dir, V(0, 1, 0));
    }
    // every frame: the panels and squares show what the state says; tools being led
    var shownSurf = { walls: {}, floor: {} };
    function syncSurfaces(dt){
      var S2 = ctx.surfaces; if (!S2 || !S2.paint) return;
      S2.panels.forEach(function(p){ var v = state.decor.walls[p.id] || null; if (shownSurf.walls[p.id] === v) return; shownSurf.walls[p.id] = v; S2.paint(p.id, v); });
      S2.squares.forEach(function(q){ var v = state.decor.floor[q.id] || null; if (shownSurf.floor[q.id] === v) return; shownSurf.floor[q.id] = v; S2.lay(q.id, v); });
      var chefNow = ctx.getChef(); if (!chefNow) return;
      var it = carried(), me = chefNow.position;
      if (rolling && (!it || it.kind !== 'roller' || Math.hypot(me.x - rolling.from.x, me.z - rolling.from.z) > 0.35)) stopRolling();
      if (dipping){
        var db = state.items[dipping.bucket];
        if (!it || it.kind !== 'roller' || !db || db.at === 'hand' || Math.hypot(whereOf(db).x - me.x, whereOf(db).z - me.z) > 1.9){ dipping = null; }
        else if ((dipping.t += dt) >= DIP_TIME){
          var col = state.items[dipping.bucket].color;
          if (act('dip', dipping.bucket)) say('The roller is full of ' + lookItem('wall', col).name.toLowerCase());
          dipping = null;
        }
      }
      if (laying){
        var spotNow = chefSpot(laying), away = Math.hypot(me.x - spotNow.x, me.z - spotNow.z);
        laying.best = Math.min(laying.best === undefined ? away : laying.best, away);
        if (!it || it.kind !== 'mallet' || !state.items[laying.pack] || away > laying.best + 0.4) stopLaying();   // (he walked off: further from his spot than he has been)
        else {
          if (laying.cool > 0){ laying.cool -= dt; laying.h = clamp(laying.h + dt * 2.2 * (laying.cool > 0 ? 0.6 : 0)); if (laying.h >= 0.7) laying.armed = true; }
          if (laying.fresh >= 0) laying.fresh += dt;
          // he shuffles along on his knees, staying just behind the row he is laying
          var want = chefSpot(laying), gx = want.x - me.x, gz = want.z - me.z, gd = Math.hypot(gx, gz), step = Math.min(gd, 0.4 * dt);
          if (gd > 0.02 && ctx.nudgeChef && ctx.nudgeChef(me.x + gx / gd * step, me.z + gz / gd * step)) laying.from.set(me.x, 0, me.z);   // (from: where he was put, see the check above)
        }
      }
    }
    // a bowl of soup: the stew bowl with a smooth top in the soup's colour (the stew shows its own)
    var soupGeo = null, soupMats = {};
    function soupTop(v, o){
      var k = o.dish || 'stew', s = MODELS.stew.size; if (!s) return;
      if (k === 'stew'){ if (v.soup) v.soup.visible = false; return; }
      if (!soupGeo) soupGeo = new T.CircleGeometry(s.x * 0.385, 24);
      if (!soupMats[k]){
        var chunky = !!dishOf(k).chunky, col = new T.Color(dishOf(k).color);   // (chunky: the stew's pieces, coloured as in the pot)
        soupMats[k] = new T.MeshStandardMaterial({ map: chunky ? stewTex : null, color: chunky ? col : col.convertSRGBToLinear(), roughness: chunky ? 0.6 : 0.35, metalness: 0 });
      }
      if (!v.soup){ v.soup = new T.Mesh(soupGeo, soupMats[k]); v.soup.rotation.x = -Math.PI / 2; v.soup.position.y = s.y * 0.9; v.obj.add(v.soup); }
      v.soup.material = soupMats[k]; v.soup.visible = true;
    }
    // the paint in a bucket: its colour, lower with every dip
    function bucketPaint(v, o){
      var s = MODELS.paint.size; if (!s) return;
      if (!v.paint){
        v.paint = new T.Mesh(new T.CircleGeometry(Math.min(s.x, s.z) * 0.46, 28), new T.MeshStandardMaterial({ roughness: 0.25, metalness: 0 }));
        v.paint.rotation.x = -Math.PI / 2; v.obj.add(v.paint);
      }
      if (v.paintColor !== o.color){ v.paintColor = o.color; v.paint.material.color.set(lookItem('wall', o.color).swatch).convertSRGBToLinear(); }
      v.paint.position.y = s.y * 0.915;   // (over the white the model has in it)
    }
    // the roller's paint: its cover (the white fluff at the end of the pole) takes on the colour it was
    // dipped in. Its materials get a few lines more: at that end of the pole, what is not dark (the cover,
    // the frame holding it) takes on the paint colour (amount: 0 dry .. 1 full).
    function rollerCoat(v, o){
      var t = MODELS.roller.tool; if (!t) return;
      if (!v.coat){
        var U = v.coat = { color: { value: new T.Color() }, amount: { value: 0 }, x0: { value: MODELS.roller.size.x / 2 - 0.42 } };
        v.obj.updateMatrixWorld(true);
        var inv = new T.Matrix4().copy(v.obj.matrixWorld).invert();
        v.obj.traverse(function(m){
          if (!m.isMesh) return;
          var toHolder = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld);   // (the mesh's own space -> the tool's)
          m.material = m.material.clone();
          m.material.onBeforeCompile = function(sh){
            sh.uniforms.toHolder = { value: toHolder };
            ['color', 'amount', 'x0'].forEach(function(k){ sh.uniforms['coat_' + k] = U[k]; });
            sh.vertexShader = 'uniform mat4 toHolder;\nvarying vec3 vHold;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHold = (toHolder * vec4(transformed, 1.0)).xyz;');
            sh.fragmentShader = 'uniform vec3 coat_color;\nuniform float coat_amount, coat_x0;\nvarying vec3 vHold;\n' +
              sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' +
                '{ float lum = dot(diffuseColor.rgb, vec3(0.333)), sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));\n' +
                '  float on = step(coat_x0, vHold.x) * smoothstep(0.1, 0.25, lum) * (1.0 - 0.5 * smoothstep(0.15, 0.35, sat));\n' +
                '  diffuseColor.rgb = mix(diffuseColor.rgb, coat_color * (0.75 + 0.25 * diffuseColor.g), on * coat_amount); }');
          };
          m.material.customProgramCacheKey = function(){ return 'roller-coat'; };
        });
      }
      var want = o.color && o.load > 0 ? o.color : null;
      v.coat.amount.value = want ? 0.35 + 0.6 * clamp(o.load) : 0;
      if (want && v.coatColor !== want){ v.coatColor = want; v.coat.color.value.set(lookItem('wall', want).swatch).convertSRGBToLinear(); }
    }

    // ---------- what the chef can do: F picks up / puts down, E uses ---------------------------
    function list(words){ return words.join(', ').replace(/, ([^,]*)$/, ' and $1'); }
    play.addInteractables(function(hands){
      var out = [], it = carried(), pot = state.pot;
      if (!place.pot || hold || pc || (ctx.seat && ctx.seat.active())) return out;
      if (rolling) return [{ pos: rolling.from, reach: 9, key: 'E', label: 'Stop painting', use: stopRolling }];
      if (laying) return [{ pos: laying.from, reach: 9, key: 'E', label: 'Stop laying the floor', use: stopLaying }];
      if (dipping) return out;
      if (movingChair){   // a chair is being moved: let go puts it down, F leaves it where it was
        var me6 = ctx.getChef();
        return [{ pos: me6.position, reach: 9, key: 'F', label: 'Leave it where it was', use: function(){ putChair(true); } }];
      }
      if (movingTable){   // a table is being moved: that is all he can do
        var me5 = ctx.getChef();
        return [movingTable.ok ? { pos: me5.position, reach: 9, key: 'E', label: 'Put the table here', use: function(){ putTable(false); } } : { pos: me5.position, reach: 9, key: 'E', label: 'No room here' },
                { pos: me5.position, reach: 9, key: 'F', label: 'Leave it where it was', use: function(){ putTable(true); } }];
      }
      if (movingProp){   // a big decor thing is being moved: that is all he can do
        var me4 = ctx.getChef(), mp = movingProp;
        return [mp.ok ? { pos: me4.position, reach: 9, key: 'E', label: 'Put the ' + propName(mp) + ' here', use: putMoving } : { pos: me4.position, reach: 9, key: 'E', label: 'No room here' },
                { pos: me4.position, reach: 9, key: 'F', label: 'Turn it (or the mouse wheel)', use: function(){ if (movingProp) movingProp.rot = (movingProp.rot + Math.PI / 4) % (Math.PI * 2); } }];
      }
      if (heldProp) return [];   // (a decor thing in his hands: let go of it first)
      if (ghost){   // a piece of furniture is being placed: that is all he can do
        var me2 = ctx.getChef(), name = furnitureItem(ghost.key).name.toLowerCase();
        return [ghost.ok ? { pos: me2.position, reach: 9, key: 'E', label: 'Put the ' + name + ' here', use: function(){ if (ghost && ghost.ok && act('place', { id: ghost.id, x: +ghost.x.toFixed(3), z: +ghost.z.toFixed(3), rot: ghost.rot })){ furnWas = null; saveNow(false); } } }
                          : { pos: me2.position, reach: 9, key: 'E', label: 'The ' + name + ' cannot stand here' },
                { pos: me2.position, reach: 9, key: 'F', label: 'Turn it (or the mouse wheel)', use: function(){ if (ghost) ghost.rot = (ghost.rot + Math.PI / 4) % (Math.PI * 2); } }];
      }
      if (state.day.phase === 'done'){   // the accounts are on screen: on to the next morning
        var me = ctx.getChef();
        return me ? [{ pos: me.position, reach: 9, key: 'E', label: 'Start day ' + (state.day.n + 1), use: function(){ act('nextDay'); } }] : out;
      }
      if (cutting) return [{ pos: place.board.pos, reach: 9, key: 'E', label: 'Stop cutting', use: stopCutting }];
      if (pouring) return [{ pos: place.pot.pos, reach: 9, key: 'E', label: 'Stop pouring', use: stopPour }];
      if (stirring) return [{ pos: place.pot.pos, reach: 9, key: 'E', label: 'Stop stirring', use: stopStir }];
      if (wiping) return [{ pos: V(wiping.at.x, 0, wiping.at.z), reach: 9, key: 'E', label: 'Stop wiping', use: stopWipe }];
      function add(e){ out.push(e); }
      var free = !it && hands.handsFree && !heldProp;
      // the crates
      VEG.forEach(function(kind){
        var c = place.crates[kind], K = KINDS[kind], e = { pos: c.pos, reach: RULES.reach, key: 'F' };
        if (it && it.kind === 'parcel'){   // unpacking a delivery
          if (!(it.goods[kind] > 0)) return;
          e.key = 'E';
          if (state.crates[kind] >= kitchenCap()) e.label = 'This crate is full';
          else { e.label = 'Unpack the ' + K.many + ' (' + it.goods[kind] + ')'; e.use = function(){ act('unpack', kind); }; e.obj = c.model; }
          add(e); return;
        }
        if (it && it.kind === kind && !it.cut){
          if (state.crates[kind] >= kitchenCap()) e.label = 'This crate is full';
          else { e.label = 'Put ' + K.the + ' back'; e.use = function(){ act('putBack'); }; e.obj = c.model; }   // (only when he looks at the crate)
        }
        else if (it) return;
        else if (!free) e.label = 'Hands full';
        else if (state.crates[kind] <= 0) e.label = state.store[kind] > 0 ? 'No ' + K.many + ' left \u2013 fetch some from the storeroom' : 'No ' + K.many + ' left \u2013 order some at the computer in the office';
        else { e.key = 'HOLD'; e.label = 'Take ' + K.a; e.use = function(){ act('take', kind); }; e.obj = c.model; }
        add(e);
      });
      // the storeroom's crates
      VEG.forEach(function(kind){
        var c = place.store[kind], K = KINDS[kind], e = { pos: c.pos, reach: RULES.reach, key: 'F' };
        if (it && it.kind === 'parcel'){
          if (!(it.goods[kind] > 0)) return;
          e.key = 'E';
          if (state.store[kind] >= storeCap()) e.label = 'This crate is full';
          else { e.label = 'Store the ' + K.many + ' here (' + it.goods[kind] + ')'; e.use = function(){ act('unpackStore', kind); }; e.obj = c.model; }
          add(e); return;
        }
        if (it && it.kind === kind && !it.cut){
          if (state.store[kind] >= storeCap()) e.label = 'This crate is full';
          else { e.label = 'Put ' + K.the + ' in the store'; e.use = function(){ act('putStore'); }; e.obj = c.grp; }
        }
        else if (it) return;
        else if (!free) e.label = 'Hands full';
        else if (state.store[kind] <= 0) e.label = 'No ' + K.many + ' in the store';
        else { e.key = 'HOLD'; e.label = 'Take ' + K.a + ' (' + state.store[kind] + ' in the store)'; e.use = function(){ act('takeStore', kind); }; e.obj = c.grp; }
        add(e);
      });
      // the fridge (once there is a reason to open it: the recipe, or sausages in it)
      var fAt = ctx.getKitchen().fridgeAt;
      if (fAt && (known('sausage') || state.fridge > 0 || (it && it.kind === 'sausage'))){
        var fe = { pos: fAt, reach: RULES.reach, key: 'F', obj: ctx.getKitchen().fridge };
        if (it && it.kind === 'parcel'){
          if (it.goods.sausage > 0){
            fe.key = 'E';
            if (state.fridge >= RULES.fridgeStock) fe.label = 'The fridge is full';
            else { fe.label = 'Put the sausages in the fridge (' + it.goods.sausage + ')'; fe.use = function(){ act('unpack', 'sausage'); }; }
            add(fe);
          }
        } else if (it && it.kind === 'sausage' && !it.cut){
          if (state.fridge >= RULES.fridgeStock) fe.label = 'The fridge is full';
          else { fe.label = 'Put the sausage back in the fridge'; fe.use = function(){ act('putFridge'); }; }
          add(fe);
        } else if (!it){
          if (!free) fe.label = 'Hands full';
          else if (state.fridge <= 0) fe.label = 'No sausages in the fridge \u2013 order some at the computer in the office';
          else { fe.key = 'HOLD'; fe.label = 'Take a sausage (' + state.fridge + ' in the fridge)'; fe.use = function(){ act('takeFridge'); }; }
          add(fe);
        }
      }
      // the stack of clean bowls
      var sb = { pos: place.stacks.pos, reach: RULES.reach, key: 'F' };
      if (it && (it.kind === 'bowl' || (it.kind === 'dirty' && !ctx.getKitchen().sinkAt))){ sb.label = 'Put the bowl back'; sb.use = function(){ act('returnBowl'); }; sb.obj = place.stacks.grp; add(sb); }
      else if (!it){
        if (!free) sb.label = 'Hands full';
        else if (state.bowls <= 0) sb.label = 'No clean bowls left \u2013 clear the tables and wash up';
        else { sb.key = 'HOLD'; sb.label = 'Take a bowl'; sb.use = function(){ act('takeBowl'); }; sb.obj = place.stacks.grp; }
        add(sb);
      }
      // things lying on the work surfaces
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.at !== 'surface' || !free) return;
        add({ pos: V(o.x, 0, o.z), reach: RULES.itemReach, key: 'HOLD', label: 'Pick up ' + nameOf(o, 'the'), use: function(){ act('pickUp', o.id); }, obj: objs[o.id] && objs[o.id].obj });
      });
      // putting down what he carries, where he looks
      // the chopping block and the knife beside it
      var B = place.board, onBoard = state.board ? state.items[state.board] : null, knife = state.items[state.knife];
      function see(o){ return objs[o.id] && objs[o.id].obj; }
      if (it && isFood(it.kind)){
        add(onBoard ? { pos: B.pos, reach: RULES.reach, key: 'F', label: 'The block is taken' }
                    : { pos: B.pos, reach: RULES.reach, key: 'F', label: 'Put ' + nameOf(it, 'the') + ' on the block', use: function(){ act('toBoard', ctx.getChef().rotation.y + Math.PI); }, obj: B.obj });
      } else if (it && it.kind === 'knife'){
        add({ pos: place.knifeHome, reach: RULES.reach, key: 'E', label: 'Put the knife down', use: function(){ act('putKnife'); } });
        if (onBoard && cutAxis(onBoard)) add({ pos: B.pos, reach: RULES.cutReach, key: 'LMB', label: 'Cut ' + KINDS[onBoard.kind].the, use: startCutting, obj: see(onBoard) });
        else add({ pos: B.pos, reach: RULES.reach, key: 'LMB', label: onBoard ? 'It is cut up already' : 'Put a vegetable on the block first' });
      } else if (free){
        if (knife.at === 'home') add({ pos: place.knifeHome, reach: RULES.reach, key: 'E', label: 'Take the knife', use: function(){ act('pickUp', knife.id); }, obj: see(knife) });
        if (onBoard){
          add(!isCut(onBoard) && cutCount(onBoard) > 0
            ? { pos: B.pos, reach: RULES.reach, key: 'F', label: 'Finish cutting ' + KINDS[onBoard.kind].the + ' first' }
            : { pos: B.pos, reach: RULES.reach, key: 'HOLD', label: 'Pick up ' + nameOf(onBoard, 'the'), use: function(){ act('pickUp', onBoard.id); }, obj: see(onBoard) });
        }
      }
      // the jug of broth and the spice shaker on the range
      ['broth', 'spice'].forEach(function(kind){
        var o = state.items[state.tools[kind]], at = place.home[kind].pos;
        var more = kind === 'broth' && o.left < COOK.jug - 0.05 && state.broth > 0.01;
        if (it === o) add({ pos: at, reach: RULES.shelfReach, key: 'E', label: 'Put ' + KINDS[kind].the + ' back' + (more ? ' and fill it up' : ''), use: function(){ act('putHome'); } });
        else if (free && o.at === 'home') add({ pos: at, reach: RULES.shelfReach, key: 'E', label: 'Take ' + KINDS[kind].the, use: function(){ act('pickUp', o.id); }, obj: see(o) });
      });
      // a delivery: the box in the storeroom, its broth at the shelf
      var atDock = parcels().filter(function(p){ return p.at === 'dock'; })[0];
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.at !== 'dock' || o.kind === 'parcel' || !free) return;
        add({ pos: dockSpot(o.slot), reach: RULES.itemReach, key: 'HOLD', label: 'Pick up ' + nameOf(o, 'the') + thingNote(o), use: function(){ act('pickUp', o.id); }, obj: see(o) });
      });
      if (it && (it.kind === 'paint' || it.kind === 'boards')) add({ aimAt: V(DOCK.x, 0.2, DOCK.z), aimR: 0.7, pos: DOCK, reach: RULES.itemReach + 0.6, key: 'F', label: 'Put ' + nameOf(it, 'the') + ' down here', use: function(){ act('toDock'); } });
      if (atDock && free) add({ pos: DOCK, reach: RULES.itemReach, key: 'HOLD', label: 'Pick up the delivery box', use: function(){ act('pickUp', atDock.id); }, obj: see(atDock) });
      if (it && it.kind === 'parcel'){
        if (!atDock) add({ pos: DOCK, reach: RULES.itemReach, key: 'F', aimAt: V(DOCK.x, 0.2, DOCK.z), aimR: 0.6, label: 'Put the delivery box down', use: function(){ act('toDock'); } });
        if (it.goods.broth > 0) add({ pos: place.home.broth.pos, reach: RULES.shelfReach, key: 'E', label: 'Unpack the broth', use: function(){ act('unpack', 'broth'); }, obj: see(state.items[state.tools.broth]) });
      }
      // the tools for walls and floor, in the storeroom
      // the bar: full bowls for the waiter
      var WP = waiterHere() && ctx.getWaiter().place;
      if (WP && state.owned.waiter){
        if (it && it.kind === 'stew'){
          for (var ps = 0; ps < PASS_SLOTS; ps++) if (!passTaken(ps)) break;
          if (ps < PASS_SLOTS) add({ pos: V(WP.pass[ps].x, 0, WP.pass[ps].z), reach: 1.9, key: 'F', aimAt: V(WP.pass[ps].x, WP.barTop, WP.pass[ps].z), aimR: 0.5, label: 'Put the bowl on the bar for the waiter', use: (function(k){ return function(){ act('toPass', k); }; })(ps) });
          else add({ pos: V(WP.pass[1].x, 0, WP.pass[1].z), reach: 1.9, key: 'F', label: 'The bar is full' });
        } else if (free) Object.keys(state.items).forEach(function(id){
          var o = state.items[id];
          if (o.at === 'pass') add({ pos: V(WP.pass[o.slot].x, 0, WP.pass[o.slot].z), reach: 1.9, key: 'HOLD', label: 'Pick up ' + nameOf(o, 'the'), use: function(){ act('pickUp', o.id); }, obj: see(o) });
        });
      }
      // the tables (with their chairs): moved with E while nobody is in the restaurant
      if (free && ctx.tables) ctx.tables.list().forEach(function(t){
        if (tableBusy(t)) return;
        add({ pos: V(t.x, 0, t.z), reach: 3.0, key: 'HOLD', charge: 0.6, label: 'Move the table', use: function(){ startTable(t); }, obj: t.obj, bias: 0.6 });
      });
      if (free && ctx.tables && ctx.tables.chairs) ctx.tables.chairs().forEach(function(c){
        if (c.obj && !seatBusy(c.k)) add({ pos: V(c.x, 0, c.z), reach: 2.2, key: 'HOLD', charge: 0.45, label: 'Move the chair', use: function(){ startChair(c); }, obj: c.obj, bias: 0.4 });
      });
      // the decor's movable things: small ones held with the mouse button, big ones moved with E
      if (free && ctx.getMovables) ctx.getMovables().forEach(function(m){
        if (propFalling[m.key] || !m.holder.parent || (m.canMove && !m.canMove())) return;
        var mp2 = m.holder.getWorldPosition(V());
        if (m.big) add({ pos: V(mp2.x, 0, mp2.z), reach: 2.4, key: 'HOLD', charge: 0.6, label: 'Move the ' + propName(m), use: function(){ startMoving(m); }, obj: m.holder, bias: 0.3 });
        else add({ pos: V(mp2.x, 0, mp2.z), reach: RULES.itemReach, key: 'HOLD', label: 'Pick up the ' + propName(m), use: function(){ grabProp(m); }, obj: m.holder, bias: 0.2 });
      });
      // spills on the tables: wiped with the cloth
      if (it && it.kind === 'rag') state.spills.forEach(function(s){
        add({ pos: V(s.x, 0, s.z), reach: 1.75, key: 'LMB', label: 'Wipe the table', use: function(){ startWipe(s.id); }, obj: spillMeshes[s.id] });
      });
      ['roller', 'mallet', 'rag'].forEach(function(kind){
        var o = state.items[state.tools[kind]], at = place.home[kind].pos;
        if (it === o) add({ pos: at, reach: 1.7, key: 'E', label: 'Put ' + KINDS[kind].the + ' back', use: function(){ act('putHome'); } });
        else if (free && o.at === 'home') add({ pos: at, reach: 1.7, key: 'E', label: 'Take ' + KINDS[kind].the, use: function(){ act('pickUp', o.id); }, obj: see(o) });
      });
      var me3 = ctx.getChef();
      // the roller: dipped into a bucket, then against the wall
      if (it && it.kind === 'roller'){
        var bucket = nearest('paint', me3.position, function(o){ return o.left > 0; }, 1.6);
        if (bucket && bucket.color === it.color && it.load >= 0.999) add({ pos: whereOf(bucket), reach: 1.6, key: 'E', bias: -0.5, label: 'The roller is full of paint' });
        else if (bucket) add({ pos: whereOf(bucket), reach: 1.6, key: 'E', bias: -0.5, label: 'Dip the roller in the ' + lookItem('wall', bucket.color).name.toLowerCase(), use: function(){ startDip(bucket); }, obj: see(bucket) });
        var pw = lookedAt('wall');
        if (pw){
          var cur = state.decor.walls[pw.id] || 'cream', dist = fromWall(pw);
          var lw = !(it.load > 0) ? 'Dip the roller in paint first' : cur === it.color ? 'This part of the wall has that colour already'
                 : dist < ROLL.near ? 'Step back from the wall a little' : dist > ROLL.far ? 'Go closer to the wall' : null;
          add(lw ? { pos: me3.position, reach: 9, key: 'LMB', bias: 4, label: lw } : { pos: me3.position, reach: 9, key: 'LMB', bias: -1, label: 'Paint the wall', use: function(){ startRolling(pw); } });
        }
      }
      // the mallet: at a square of the floor, with a pack of boards beside him
      if (it && it.kind === 'mallet'){
        var sq = lookedAt('floor', 3.2);
        if (sq){
          var have = state.decor.floor[sq.id] || 'tiles', pack = nearest('boards', me3.position, function(o){ return o.left > 0 && o.floor !== have; }, 3.2);
          var dSq = Math.hypot(Math.max(sq.x0 - me3.position.x, 0, me3.position.x - sq.x1), Math.max(sq.z0 - me3.position.z, 0, me3.position.z - sq.z1));   // (from the square's edge)
          var ll = !pack ? (nearest('boards', me3.position, null, 3.2) ? 'This square has that floor already' : 'Put a pack of flooring down beside you') : dSq > 1.9 ? 'Go closer to the square' : null;
          add(ll ? { pos: me3.position, reach: 9, key: 'LMB', bias: 4, label: ll } : { pos: me3.position, reach: 9, key: 'LMB', bias: -1, label: 'Lay ' + lookItem('floor', pack.floor).name.toLowerCase() + ' here', use: function(){ startLaying(sq, pack); } });
        }
      }
      // furniture that stands somewhere: it can be moved
      if (free) state.furniture.forEach(function(f){
        var o = furnObjs[f.id];
        if (!f.placed || !o) return;
        add({ pos: V(f.x, 0, f.z), reach: Math.max(footprint(f.key, f.rot).hx, footprint(f.key, f.rot).hz) + 1.1, key: 'HOLD', charge: 0.6, label: 'Move the ' + furnitureItem(f.key).name.toLowerCase(),
              use: function(){ var was = { id: f.id, x: f.x, z: f.z, rot: f.rot }; if (act('unplace', f.id)) furnWas = was; }, obj: o.obj, bias: 0.6 });
      });
      // the computer in the office
      var office = ctx.getOffice && ctx.getOffice(), swivel = office && office.chair, me = ctx.getChef();
      var inOffice = !!office && !!office.room && me.position.x > office.room.x0 && me.position.x < office.room.x1 && me.position.z > office.room.z0 && me.position.z < office.room.z1;
      if (inOffice && swivel && ctx.seat && ctx.seat.ready()){   // he sits down on the chair first; the screen comes on once he sits
        var atChair = V(swivel.x, 0, swivel.z);
        add(free ? { pos: atChair, reach: 2.1, key: 'E', label: 'Sit down at the computer', use: sitAtPC }
                 : { pos: atChair, reach: 2.1, key: 'E', label: 'Hands full' });
      } else if (inOffice && office.desk){   // (as long as the chair cannot be sat on: standing at the desk)
        add({ pos: V(office.desk.x, 0, office.desk.z), reach: 2.2, key: 'E', label: 'Use the computer', use: openPC });
      }
      state.pots.forEach(function(p, pi){
        if (!place.pots[pi]) return;
        var n0 = out.length;
        withPot(pi, function(){ potChoices(it, free, out); });
        out.slice(n0).forEach(function(e){ if (e.use){ var u = e.use; e.use = function(){ usePot(pi); return u.apply(this, arguments); }; } });
      });
      // the front door: opening and closing the restaurant
      var phase = state.day.phase, de = { pos: DOOR, reach: 2.4, key: 'E' };
      if (phase === 'prep'){ de.label = 'Open the restaurant'; de.use = function(){ act('open'); }; }
      else if (phase === 'open'){ de.label = 'Close for today'; de.use = function(){ act('close'); }; }
      else if (inside()) de.label = 'Closed \u2013 the last guests are still here';
      else { de.label = 'End the day'; de.use = function(){ act('endDay'); }; }
      add(de);
      // dirty bowls left on the tables, and the sink
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id];
        if (o.kind !== 'dirty' || o.at !== 'table') return;
        if (free) add({ pos: V(o.x, 0, o.z), reach: RULES.serveReach, key: 'HOLD', label: 'Clear away the dirty bowl', use: function(){ act('pickUp', o.id); }, obj: objs[o.id] && objs[o.id].obj });
      });
      var k2 = ctx.getKitchen();
      if (it && it.kind === 'dirty' && k2.sinkAt) add({ pos: k2.sinkAt, reach: RULES.reach, key: 'E', label: 'Wash the bowl', use: function(){ if (act('wash')) say('Clean again \u2013 put it back on the stack'); } });
      // guests who want to order
      state.guests.forEach(function(g){
        if (g.phase !== 'ready' || !views[g.id]) return;
        add({ pos: V(views[g.id].info.spot.x, 0, views[g.id].info.spot.z), reach: RULES.serveReach, key: 'E', label: 'Take the order', use: function(){ act('order', g.id); }, bias: -0.2 });
      });
      // guests waiting for their food
      state.guests.forEach(function(g){
        if (g.phase !== 'waiting') return;
        var at = V(views[g.id].info.spot.x, 0, views[g.id].info.spot.z);
        var wants = dishOf(g.want).short;
        add(it && it.kind === 'stew' ? { pos: at, reach: RULES.serveReach, key: 'E', label: 'Serve the ' + dishOf(it.dish).short + ((it.dish || 'stew') !== (g.want || 'stew') ? ' (ordered ' + wants + ')' : ''), use: function(){ act('serve', g.id); } }
                                     : { pos: at, reach: RULES.serveReach, key: 'E', label: 'Wants ' + wants });
      });
      return out;
    });

    // ---------- the things themselves: one object per item, following the state --------------
    var objs = {};   // item id -> { obj, kind }
    // what a bucket / a pack is for, in a few words
    function thingNote(o){
      if (o.kind === 'roller') return o.color && o.load > 0 ? ' (' + lookItem('wall', o.color).name.toLowerCase() + ')' : '';
      if (o.kind === 'paint') return ' (' + lookItem('wall', o.color).name.toLowerCase() + ', ' + o.left + (o.left === 1 ? ' wall panel' : ' wall panels') + ')';
      if (o.kind === 'boards') return ' (' + lookItem('floor', o.floor).name.toLowerCase() + ', ' + o.left + (o.left === 1 ? ' square' : ' squares') + ')';
      return '';
    }
    function nameOf(o, form){
      var K = KINDS[o.kind];
      if (isFood(o.kind) && isCut(o)) return (form === 'the' ? 'the ' : '') + K.cutName;
      if (o.kind === 'stew' && o.dish && o.dish !== 'stew') return (form === 'the' ? 'the bowl of ' : 'a bowl of ') + dishOf(o.dish).short;
      return K[form];
    }
    // what an item looks like right now (a bowl being filled still looks empty until the ladle has poured)
    function lookOf(o){
      var kind = scoop && scoop.item === o.id && scoop.t < POUR_AT ? 'bowl' : o.kind;
      return kind + (o.cut ? '#' + o.cut.a.length + '.' + o.cut.b.length + (o.cut.done ? 'd' : '') : '');
    }
    // an empty bowl with the rest of the stew in it
    var dirtyTex = null, dirtyRest = null;
    function makeDirty(){
      var b = instance('bowl'), sz = MODELS.bowl.size;
      if (!dirtyTex){
        var cv = document.createElement('canvas'); cv.width = cv.height = 64;
        var g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
        gr.addColorStop(0, 'rgba(120,58,20,1)'); gr.addColorStop(0.7, 'rgba(135,70,28,.95)'); gr.addColorStop(1, 'rgba(150,82,36,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        for (var n = 0; n < 14; n++){ g.fillStyle = n % 2 ? 'rgba(224,138,44,.9)' : 'rgba(226,201,138,.9)'; g.fillRect(14 + Math.random() * 34, 14 + Math.random() * 34, 4, 3); }
        dirtyTex = new T.CanvasTexture(cv); dirtyTex.encoding = T.sRGBEncoding;
      }
      if (!dirtyRest) dirtyRest = { geo: new T.CircleGeometry(sz.x * 0.33, 20), mat: new T.MeshStandardMaterial({ map: dirtyTex, transparent: true, depthWrite: false, roughness: 0.5 }) };
      var rest = new T.Mesh(dirtyRest.geo, dirtyRest.mat);
      rest.rotation.x = -Math.PI / 2; rest.position.y = sz.y * 0.55; rest.renderOrder = 2; b.add(rest);
      return b;
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
          v = objs[id] = { obj: o.cut && isFood(kind) ? makeCut(kind, o.cut, o.cut.done) : kind === 'dirty' ? makeDirty() : instance(kind), look: want, placed: false, rot: rot };
        }
        if (v.placed && (v.at !== o.at || v.px !== o.x || v.pz !== o.z || v.slot !== o.slot)) v.placed = false;   // (it was moved)
        if (o.kind === 'roller') rollerCoat(v, o);
        if (o.kind === 'paint') bucketPaint(v, o);
        if (o.kind === 'stew' && v.look === 'stew') soupTop(v, o);
        if (o.at === 'hand' && !HOME[o.kind]){   // held with the mouse button: it floats in front of where he looks
          if (shown.carry === o.id){ play.setCarry(null); shown.carry = null; }
          if (v.obj.parent !== root) root.add(v.obj);
          if (v.floating !== true) v.obj.userData.wheelTurn = 0;   // (just picked up: as he looks)
          v.obj.visible = true; v.placed = false; floatAt(v.obj, dt, v.floating !== true); v.floating = true;
          return;
        }
        v.floating = false;
        if (o.at === 'hand'){
          if (shown.carry !== o.id){ shown.carry = o.id; v.placed = false; v.rot = undefined; play.setCarry(v.obj, toolHold[o.kind] || KINDS[o.kind].carry); }
          return;
        }
        if (o.at === 'falling'){ if (!v.obj.parent) root.add(v.obj); v.obj.visible = true; v.placed = false; return; }   // (stepFalling moves it)
        if (o.at === 'waiter'){   // (index.html holds it in front of him)
          if (!v.placed){ v.obj.visible = true; root.add(v.obj); v.placed = true; v.at = o.at; v.slot = o.slot; v.px = o.x; v.pz = o.z; if (waiterHere()) ctx.getWaiter().hold(v.obj); }
          return;
        }
        if (o.at === 'table' && o.kind !== 'dirty' && !(views[o.guest] && views[o.guest].info.where() === 'seated')) return;   // (right after loading: once the guest sits)
        if (!v.placed){
          if (o.at === 'table' && o.kind === 'dirty' && num(o.x)){ v.obj.position.set(o.x, o.y, o.z); v.obj.rotation.set(0, rnd(0, 6.28), 0); }
          else if (o.at === 'table'){ var gv = views[o.guest]; placeBowl(gv); v.obj.position.copy(gv.bowlAt); v.obj.rotation.set(0, rnd(0, 6.28), 0); }
          else if (o.at === 'home' && place.home[o.kind].q){ v.obj.position.copy(place.home[o.kind].at); v.obj.quaternion.copy(place.home[o.kind].q); }
          else if (o.at === 'home'){ v.obj.position.copy(place.home[o.kind].pos); v.obj.rotation.set(0, place.home[o.kind].rot, 0); }
          else if (o.at === 'pass'){ var pp = ctx.getWaiter().place; v.obj.position.set(pp.pass[o.slot].x, pp.barTop, pp.pass[o.slot].z); v.obj.rotation.set(0, 0.4 * o.slot, 0); }
          else if (o.at === 'dock'){ v.obj.position.copy(dockSpot(o.slot)); v.obj.rotation.set(0, o.slot ? 0 : 0.35, 0); }
          else if (o.at === 'board'){ v.obj.position.copy(place.board.pos); if (v.rot === undefined) v.rot = o.rot || 0; v.obj.rotation.set(0, v.rot, 0); }
          else { v.obj.position.set(o.x, o.y, o.z); if (o.tilt) v.obj.quaternion.fromArray(o.tilt); else v.obj.rotation.set(0, o.rot || 0, 0); }
          v.obj.visible = true; root.add(v.obj); v.placed = true; v.at = o.at; v.px = o.x; v.pz = o.z; v.slot = o.slot;
        }
        if (o.at === 'board'){   // it turns to how it is laid
          v.rot += angle((o.rot || 0) - v.rot) * Math.min(1, dt * 9);
          v.obj.rotation.y = v.rot;
        }
      });
      if (!it && shown.carry !== null && shown.carry !== 'tool' && !heldProp){ shown.carry = null; play.setCarry(null); }   // ('tool': the ladle while stirring)
      // the line above the hint: cutting, a short message, or what he carries
      var label = it ? 'Carrying ' + nameOf(it, 'a') + (it.kind === 'parcel' ? ': ' + goodsText(it.goods) : thingNote(it)) : '', ob = state.board && state.items[state.board];
      if (cutting && ob && cutAxis(ob)){
        var pl = CUTS[ob.kind];
        label = 'Slide the mouse sideways, pull it down to cut   \u00b7   cut ' + (cutCount(ob) + 1) + ' of ' + (pl.a + pl.b);
      } else if (pouring) label = 'Pull the mouse down to tip the jug, push it up to stop   \u00b7   broth: ' + Math.round(state.pot.broth * 100) + '% of what is needed';
      else if (stirring) label = 'Move the mouse in circles to stir';
      else if (ghost) label = 'Placing the ' + furnitureItem(ghost.key).name.toLowerCase() + ' – look where it should go';
      else if (note.t > 0) label = note.text;
      else if (!it) label = potStatus();
      if (carryEl.textContent !== label){ carryEl.textContent = label; carryEl.classList.toggle('on', !!label); }
    }

    // ---------- every frame: time passes, then everything shown follows the state -------------
    var clock = 0;
    // ---------- letting things fall ----------------------------------------------------------
    // Something held with the mouse button and let go (not over a place for it) falls: a box the
    // size of its model in a cannon-es world, against the floor and the furniture's boxes. Once it lies
    // still it is put down there (at 'surface', tilted as it fell); landing in a pot or in front of a
    // guest waiting for that bowl counts as putting it in / serving it.
    var phys = null, falling = {};   // falling: id -> { body, off (model origin from the box's middle, in the box's frame), q (model turn in the box's frame), t }
    var UPRIGHT = { bowl: true, stew: true, dirty: true, paint: true, parcel: true, boards: true };   // (these land the right way up: bowls do not spill)
    function physics(){
      if (phys || !window.CANNON) return phys;
      var C = window.CANNON, w = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
      // (the plain broadphase: the sweep-and-prune one let things fall through tables here)
      w.allowSleep = true; w.defaultContactMaterial.friction = 0.45; w.defaultContactMaterial.restitution = 0.12;
      var ground = new C.Body({ mass: 0, shape: new C.Plane() }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); w.addBody(ground);
      phys = { C: C, world: w, statics: [], sig: '' };
      return phys;
    }
    function syncStatics(){   // the furniture's boxes, built again whenever they change (furniture moved, the room grown)
      var obs = ctx.getObstacles ? ctx.getObstacles() : [], sig = obs.length;
      obs.forEach(function(o){ sig += '|' + [o.minX, o.maxX, o.minZ, o.maxZ, o.top || 0].map(function(n){ return n.toFixed(2); }).join(','); });
      if (sig === phys.sig) return;
      phys.sig = sig;
      phys.statics.forEach(function(b){ phys.world.removeBody(b); }); phys.statics = [];
      var C = phys.C;
      obs.forEach(function(o){
        var top = o.top || 0; if (!(top > 0.02)) return;
        var b = new C.Body({ mass: 0, shape: new C.Box(new C.Vec3((o.maxX - o.minX) / 2, top / 2, (o.maxZ - o.minZ) / 2)) });
        b.position.set((o.minX + o.maxX) / 2, top / 2, (o.minZ + o.maxZ) / 2);
        phys.world.addBody(b); phys.statics.push(b);
      });
    }
    // things saved while falling: let fall from where they were
    function refall(){
      if (!physics()) return;
      Object.keys(state.items).forEach(function(id){
        var it = state.items[id]; if (!it.refall || it.at !== 'surface') return;
        var v = objs[id]; if (!v || !v.placed) return;
        delete it.refall;
        var had = state.carry; it.at = 'hand'; state.carry = it.id; letFall(it); state.carry = had;
      });
    }
    // let the thing in his hands fall from where it is held
    function letFall(it){
      hpLog('letFall', it.kind);
      var v = objs[it.id], P = physics();
      play.setCarry(null); shown.carry = null;
      if (!v || !P){ state.carry = null; it.at = 'surface'; var c0 = ctx.getChef(); it.x = c0.position.x + Math.sin(c0.rotation.y) * 0.6; it.y = 0; it.z = c0.position.z + Math.cos(c0.rotation.y) * 0.6; it.rot = 0; delete it.tilt; return; }
      syncStatics();
      var C = P.C, obj = v.obj;
      // (a falling item: stepFalling moves it, landed() decides what it became)
      obj.updateMatrixWorld(true);
      var wp = obj.getWorldPosition(V()), wq = obj.getWorldQuaternion(new T.Quaternion()), box = new T.Box3().setFromObject(obj), size = box.getSize(V()), mid = box.getCenter(V());
      if (obj.parent !== root){ root.add(obj); }
      obj.position.copy(wp); obj.quaternion.copy(wq);   // (root stands at the world's origin)
      var body = new C.Body({ mass: 1, shape: new C.Box(new C.Vec3(Math.max(0.02, size.x / 2), Math.max(0.02, size.y / 2), Math.max(0.02, size.z / 2))),
                               linearDamping: 0.05, angularDamping: 0.25, fixedRotation: !!UPRIGHT[it.kind] });
      // (let go inside a box it cannot be in: a low one, it starts on top of it; a tall one (a wall, a shelf), it starts at his side of it)
      (ctx.getObstacles ? ctx.getObstacles() : []).forEach(function(o){
        if (!(mid.x > o.minX && mid.x < o.maxX && mid.z > o.minZ && mid.z < o.maxZ && mid.y - size.y / 2 < (o.top || 0))) return;
        if ((o.top || 0) < 1.6){ var dy = o.top + size.y / 2 + 0.01 - mid.y; mid.y += dy; wp.y += dy; return; }
        var c1 = ctx.getChef(), nx = Math.max(o.minX - 0.05 - size.x / 2, Math.min(o.maxX + 0.05 + size.x / 2, c1.position.x)), nz = Math.max(o.minZ - 0.05 - size.z / 2, Math.min(o.maxZ + 0.05 + size.z / 2, c1.position.z));
        var inX = c1.position.x > o.minX && c1.position.x < o.maxX, sx = inX ? 0 : nx - mid.x, sz = inX ? nz - mid.z : 0;
        if (!inX && c1.position.z > o.minZ && c1.position.z < o.maxZ) sz = 0;
        mid.x += sx; mid.z += sz; wp.x += sx; wp.z += sz;
      });
      body.position.set(mid.x, mid.y, mid.z); body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.35;
      var ch = ctx.getChef();   // (a little of his walking goes along)
      if (ch && ctx.isMoving()){ body.velocity.set(Math.sin(ch.rotation.y) * 0.8, 0, Math.cos(ch.rotation.y) * 0.8); }
      P.world.addBody(body);
      state.carry = null; it.at = 'falling'; it.x = wp.x; it.y = wp.y; it.z = wp.z;
      falling[it.id] = { body: body, off: wp.clone().sub(mid), q: wq.clone(), t: 0 };
      delete it.tilt;
    }
    // a decor thing let fall the same way (props: key -> the same as falling, for the decor)
    var propFalling = {};
    function propFall(m, from){
      var P = physics(), obj = m.holder, home = propHome();
      obj.updateMatrixWorld(true);
      var wp = obj.getWorldPosition(V()), wq = obj.getWorldQuaternion(new T.Quaternion());
      home.add(obj); obj.position.copy(home.worldToLocal(wp.clone())); obj.quaternion.copy(wq);   // (the decor's own group stands at the origin, unturned)
      if (!P){ putProp(m, V(wp.x, 0, wp.z), new T.Quaternion()); return; }
      syncStatics();
      var box = new T.Box3().setFromObject(obj), size = box.getSize(V()), mid = box.getCenter(V()), C = P.C;
      var body = new C.Body({ mass: 1, shape: new C.Box(new C.Vec3(Math.max(0.02, size.x / 2), Math.max(0.02, size.y / 2), Math.max(0.02, size.z / 2))), linearDamping: 0.05, angularDamping: 0.25, fixedRotation: !!m.upright });
      body.position.set(mid.x, mid.y, mid.z); body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.35;
      P.world.addBody(body);
      propFalling[m.key] = { m: m, body: body, off: wp.clone().sub(mid), q: wq.clone(), t: 0 };
    }
    function stepPropFalling(dt){
      var keys = Object.keys(propFalling); if (!keys.length || !phys) return;
      if (!Object.keys(falling).length) phys.world.step(1 / 60, dt, 4);   // (stepFalling steps it otherwise)
      keys.forEach(function(k){
        var f = propFalling[k], b = f.body, iq = b.interpolatedQuaternion, ip = b.interpolatedPosition, bq = new T.Quaternion(iq.x, iq.y, iq.z, iq.w);
        var p = V(ip.x, ip.y, ip.z).add(f.off.clone().applyQuaternion(bq)), q = bq.clone().multiply(f.q);
        f.m.holder.position.copy(p); f.m.holder.quaternion.copy(q);
        f.t += dt;
        if (b.sleepState === phys.C.Body.SLEEPING || f.t > 5 || p.y < -2){ phys.world.removeBody(b); delete propFalling[k]; putProp(f.m, V(p.x, Math.max(0, p.y), p.z), q); }
      });
    }
    function propHome(){ var ms = ctx.getMovables(); return ms.length && ms[0].holder.parent && ms[0].holder.parent !== play.root ? ms[0].holder.parent : (propHome.g || (propHome.g = ms.length ? ms[0].home : root)); }
    // a decor thing put somewhere: there, its box (if it has one) moved along, remembered in the game
    function putProp(m, p, q){
      var home = m.home || propHome();
      if (m.holder.parent !== home) home.add(m.holder);
      m.holder.position.copy(p); m.holder.quaternion.copy(q);
      state.props[m.key] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), q: [q.x, q.y, q.z, q.w].map(function(n){ return +n.toFixed(4); }) };
      boxAlong(m);
      if (m.onPut) m.onPut();   // (what it is used for: there now)
    }
    function boxAlong(m){
      if (!m.box) return;
      if (!m.half) m.half = { x: (m.box.maxX - m.box.minX) / 2, z: (m.box.maxZ - m.box.minZ) / 2, yaw: 0 };
      var yaw = new T.Euler().setFromQuaternion(m.holder.quaternion, 'YXZ').y, o = m.boxOff || { x: 0, z: 0 };
      var turned = Math.abs(Math.sin(yaw - (m.half.yaw || 0))) > 0.7;   // (about a quarter turn from how it stood: the box turns too)
      var hx = turned ? m.half.z : m.half.x, hz = turned ? m.half.x : m.half.z, p = m.holder.position;
      var cx = p.x + o.x * Math.cos(yaw) + o.z * Math.sin(yaw), cz = p.z - o.x * Math.sin(yaw) + o.z * Math.cos(yaw);   // (its box's middle, turned with it)
      m.box.minX = cx - hx; m.box.maxX = cx + hx; m.box.minZ = cz - hz; m.box.maxZ = cz + hz;
    }
    // the saved places, put into effect once (and again after loading)
    var propsShown = null, propsCount = 0;
    function showProps(){
      var ms = ctx.getMovables ? ctx.getMovables() : [];
      ms.forEach(function(m){ if (!m.home && m.holder.parent && m.holder.parent !== play.root) m.home = m.holder.parent; });
      if (propsShown === state.props && propsCount === ms.length) return;   // (also again when more things became movable: the kitchen's, once it is built)
      propsShown = state.props; propsCount = ms.length;
      ms.forEach(function(m){
        var s = state.props[m.key]; if (!s || m === heldProp || m === movingProp) return;
        if (m.holder.parent !== m.home && m.home) m.home.add(m.holder);
        m.holder.position.set(s.x, s.y, s.z); m.holder.quaternion.fromArray(s.q); boxAlong(m);
        if (m.onPut) m.onPut();
      });
    }
    var WALL_PICTURE = { fish: true, antlers: true, chalkboard: true };
    var heldProp = null, movingProp = null, movingTable = null;   // movingTable: { i, x, z, ok, half, from, boxes (what its boxes were) }
    function seatBusy(k){ return state.guests.some(function(g){ return g.phase !== 'away' && g.seat === k; }) ||
                                  Object.keys(state.items).some(function(id){ var o = state.items[id]; return o.at === 'table' && o.seat === k; }); }
    function tableBusy(t){ return ctx.tables.chairs().some(function(c){ return c.table === t.i && seatBusy(c.k); }); }
    function startTable(t){
      if (carried() || heldProp || movingProp || movingTable) return;
      if (tableBusy(t)){ say('Not while guests are at this table'); return; }
      if (job){ say('Wait until the waiter is back at the bar'); return; }
      var own = t.boxes.slice(0, 1).concat(ctx.tables.chairs().filter(function(c){ return c.table === t.i; }).reduce(function(a, c){ return a.concat(c.boxes); }, []));
      movingTable = { i: t.i, x: t.x, z: t.z, rot: t.rot || 0, ok: false, half: t.half, from: { x: t.x, z: t.z, rot: t.rot || 0 },
                      boxes: own.map(function(b){ var w = { b: b, minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }; b.minX = b.maxX = b.minZ = b.maxZ = 999; return w; }) };   // (not in its own way)
    }
    function stepTable(){
      var m = movingTable; if (!m) return;
      var me = ctx.getChef(), f = V(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y));
      var quarter = Math.abs(Math.round(m.rot / (Math.PI / 2))) % 2 === 1, hx = quarter ? m.half.z : m.half.x, hz = quarter ? m.half.x : m.half.z;
      var dist = 0.8 + Math.max(hx, hz) + 0.2;
      m.x = me.position.x + f.x * dist; m.z = me.position.z + f.z * dist;
      var wx = hx + 0.15, wz = hz + 0.15;   // (a little room around it)
      m.ok = ctx.boxFree(m.x - wx, m.x + wx, m.z - wz, m.z + wz) &&
             !Object.keys(state.items).some(function(id){ var o = state.items[id]; return o.at === 'surface' && o.y < 0.3 && Math.abs(o.x - m.x) < hx && Math.abs(o.z - m.z) < hz; }) &&
             m.x - hx > -10 && m.x + hx < 2.05 && m.z - hz > -9.9 && m.z + hz < 8.1;   // (in the dining room, not on the waiter's way along the bar or the guests' along the front wall)
      ctx.tables.preview(m.i, m.x, m.z, m.rot);   // (the table and its chairs where they would go)
      var tl = ctx.tables.list()[m.i]; if (tl) showRoom(tl.obj, m.ok);
    }
    function putTable(cancel){
      var m = movingTable; if (!m || (!m.ok && !cancel)) return;
      if (!cancel && job){ cancel = true; say('The waiter is on his way \u2013 the table stays where it was'); }
      movingTable = null;
      m.boxes.forEach(function(w){ w.b.minX = w.minX; w.b.maxX = w.maxX; w.b.minZ = w.minZ; w.b.maxZ = w.maxZ; });   // (back where they were: moveTableSet moves them along)
      ctx.tables.unpreview(m.i);
      var tl = ctx.tables.list()[m.i]; if (tl) showRoom(tl.obj, true);
      if (cancel) return;
      if (!tableTo(m.i, m.x, m.z, true, m.rot)) say('A guest is on the way to it \u2013 the table stays where it was');
    }
    // a table put somewhere: its chairs, and what lies on it or belongs to it, go along
    function tableTo(i, x, z, along, rot){
      var tl = ctx.tables.list()[i]; if (!tl) return false;
      if (rot === undefined) rot = tl.rot || 0;
      var dr = rot - (tl.rot || 0), co = Math.cos(dr), si = Math.sin(dr);
      function moved(px, pz){ var rx = px - tl.x, rz = pz - tl.z; return { x: x + rx * co + rz * si, z: z - rx * si + rz * co }; }   // (with the table: shifted and turned about its middle)
      var at = function(px, pz){ var a = -(tl.rot || 0), lx = (px - tl.x) * Math.cos(a) + (pz - tl.z) * Math.sin(a), lz = -(px - tl.x) * Math.sin(a) + (pz - tl.z) * Math.cos(a);
                                 return Math.abs(lx) < tl.info.halfX + 0.1 && Math.abs(lz) < tl.info.halfZ + 0.1; };   // (on the table top)
      var mine = ctx.tables.chairs().filter(function(c){ return c.table === i; }).map(function(c){ return c.k; });
      if (!ctx.tables.move(i, x, z, rot)) return false;
      state.tables[i] = { x: +x.toFixed(3), z: +z.toFixed(3), rot: +rot.toFixed(4) };
      if (along) mine.forEach(function(k){ var s = state.chairs[k]; if (s){ var p = moved(s.x, s.z); s.x = +p.x.toFixed(3); s.z = +p.z.toFixed(3); s.rot = +(s.rot + dr).toFixed(4); } });
      tableViews();
      if (!along) return true;
      Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (num(o.x) && num(o.z) && (o.at === 'table' || o.at === 'surface') && at(o.x, o.z) && o.y > 0.5){ var p = moved(o.x, o.z); o.x = p.x; o.z = p.z; if (objs[id]) objs[id].placed = false; } });
      state.spills.forEach(function(s){ if (at(s.x, s.z)){ var p = moved(s.x, s.z); s.x = p.x; s.z = p.z; if (spillMeshes[s.id]){ spillMeshes[s.id].position.x = p.x; spillMeshes[s.id].position.z = p.z; } } });
      (ctx.getMovables ? ctx.getMovables() : []).forEach(function(mv){
        var p0 = mv.holder.position; if (mv.big || !at(p0.x, p0.z) || p0.y < 0.5) return;
        var p = moved(p0.x, p0.z), q = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), dr).multiply(mv.holder.quaternion);
        putProp(mv, V(p.x, p0.y, p.z), q);
      });
      return true;
    }
    var movingChair = null;   // { k, t (its table), x, z, rot, ok, from, boxes }
    function startChair(c){
      if (carried() || heldProp || movingProp || movingTable || movingChair) return;
      if (seatBusy(c.k)){ say('Somebody sits there'); return; }
      if (job){ say('Wait until the waiter is back at the bar'); return; }
      movingChair = { k: c.k, x: c.x, z: c.z, rot: c.rot, ok: false, obj: c.obj, size: c.size, from: { x: c.x, z: c.z, rot: c.rot },
                      boxes: c.boxes.map(function(b){ var w = { b: b, minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }; b.minX = b.maxX = b.minZ = b.maxZ = 999; return w; }) };
    }
    function stepChair(){
      var m = movingChair; if (!m) return;
      var me = ctx.getChef(), f = V(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y));
      m.x = me.position.x + f.x * 1.0; m.z = me.position.z + f.z * 1.0;
      var r0 = Math.max(m.size.x, m.size.z) / 2 - 0.12;   // (its middle part: a chair may be pushed in under a table)
      m.ok = ctx.boxFree(m.x - r0, m.x + r0, m.z - r0, m.z + r0) && m.x > -9.9 && m.x < 2.05 && m.z > -9.8 && m.z < 9.4;
      m.obj.position.set(m.x, 0, m.z); m.obj.rotation.y = m.rot; showRoom(m.obj, m.ok);
    }
    function putChair(cancel){
      var m = movingChair; if (!m) return;
      if (!cancel && job){ cancel = true; say('The waiter is on his way \u2013 the chair stays where it was'); }
      movingChair = null;
      m.boxes.forEach(function(w){ w.b.minX = w.minX; w.b.maxX = w.maxX; w.b.minZ = w.minZ; w.b.maxZ = w.maxZ; });
      m.obj.position.set(m.from.x, 0, m.from.z); m.obj.rotation.y = m.from.rot; showRoom(m.obj, true);
      if (cancel || !m.ok) return;
      if (ctx.tables.moveChair(m.k, m.x, m.z, m.rot)){ state.chairs[m.k] = { x: +m.x.toFixed(3), z: +m.z.toFixed(3), rot: +m.rot.toFixed(4) }; tableViews(); }
      else say('A guest is on the way to it \u2013 the chair stays where it was');
    }
    function tableViews(){   // (where a guest's bowl goes: at the table where his chair is now)
      Object.keys(views).forEach(function(id){ var v = views[id]; if (v.info.spot.table) v.bowlAt = bowlSpot(v.info.spot); });
    }
    var tablesShown = null;
    function showTables(){
      if (!ctx.tables || tablesShown === state.tables || !ctx.tables.list().length || movingTable || movingChair) return;
      if (state.guests.some(function(g){ return g.phase !== 'away'; }) && tablesShown !== null) return;
      var allThere = true;
      Object.keys(state.tables).forEach(function(i){ var s = state.tables[i]; if (!tableTo(+i, s.x, s.z, false, s.rot || 0)) allThere = false; });
      Object.keys(state.chairs).forEach(function(k){ var s = state.chairs[k]; if (!ctx.tables.moveChair(+k, s.x, s.z, s.rot)) allThere = false; });
      tableViews();
      if (allThere) tablesShown = state.tables;
    }
    // something held with the mouse button floats in front of the view: further up when he looks up, over the pot when
    // he looks at it (a little in front of the eyes, at least above the floor); jump: put there at once (just picked up)
    var FLOAT = { dist: 0.95, ease: 16 }, floatDir = V(), floatTo = V();
    // how far along a ray from the eye the first furniture box (or the floor) is
    function sightHit(o, dir){
      var best = dir.y < -1e-4 ? -o.y / dir.y : dir.y > 1e-4 ? (3.85 - o.y) / dir.y : 1e9;   // (the floor, the ceiling)
      if (dir.z > 1e-4) best = Math.min(best, (9.9 - o.z) / dir.z);   // (the front wall has no box)
      (ctx.getObstacles ? ctx.getObstacles() : []).forEach(function(b){
        var t0 = 0, t1 = best, lo = [b.minX, 0, b.minZ], hi = [b.maxX, b.top || 0, b.maxZ], p = [o.x, o.y, o.z], dv = [dir.x, dir.y, dir.z];
        for (var k = 0; k < 3; k++){
          if (Math.abs(dv[k]) < 1e-6){ if (p[k] < lo[k] || p[k] > hi[k]) return; continue; }
          var a = (lo[k] - p[k]) / dv[k], c = (hi[k] - p[k]) / dv[k]; if (a > c){ var s = a; a = c; c = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return;
        }
        if (t0 > 0.05 && t0 < best) best = t0;
      });
      return best;
    }
    function floatAt(obj, dt, jump){
      camera.getWorldDirection(floatDir);
      if (!(obj.userData.floatR > 0)){   // (its size and where its middle is from its origin, measured once unturned)
        var q0 = obj.quaternion.clone(); obj.quaternion.identity(); obj.updateMatrixWorld(true);
        var box = new T.Box3().setFromObject(obj);
        obj.userData.floatR = box.isEmpty() ? 0.1 : Math.min(0.45, box.getSize(V()).length() / 2);
        obj.userData.floatOff = box.isEmpty() ? V() : obj.position.clone().sub(box.getCenter(V()));
        obj.quaternion.copy(q0);
      }
      var r0 = obj.userData.floatR;
      // (not into what he looks at: it stops just in front of the first box or the floor on the way)
      var d = Math.min(FLOAT.dist + r0, Math.max(0.3, sightHit(camera.position, floatDir) - r0 * 0.9));
      floatTo.copy(camera.position).addScaledVector(floatDir, d);
      floatTo.y = Math.max(floatTo.y, 0.05 + r0 * 0.5);
      var yaw0 = Math.atan2(floatDir.x, floatDir.z);
      floatTo.add(obj.userData.floatOff.clone().applyAxisAngle(V(0, 1, 0), yaw0 + (obj.userData.wheelTurn || 0)));   // (its middle goes there, not its foot)
      if (jump) obj.position.copy(floatTo); else obj.position.lerp(floatTo, 1 - Math.exp(-FLOAT.ease * dt));
      var yaw = Math.atan2(floatDir.x, floatDir.z) + (obj.userData.wheelTurn || 0);   // (turned further with the mouse wheel)
      obj.quaternion.setFromEuler(new T.Euler(0, yaw, 0));
    }
    var PROP_NAME = { radiator: 'radiator', fish: 'mounted fish', antlers: 'antlers', chalkboard: 'chalkboard', boughtcandle: 'candle', boughtplant: 'plant',
                      k_crate: 'crate', k_storecrate: 'crate', k_bowls: 'stack of bowls', k_board: 'chopping block', k_sink: 'sink', k_fridge: 'fridge', k_shelfjars: 'shelf with jars', k_shelfveg: 'vegetable shelf', filing_cabinet: 'filing cabinet', office_shelf: 'office shelf', storage_rack: 'storage rack', boxes: 'boxes', sacks: 'sacks', cleaning_shelf: 'cleaning shelf', mop_bucket: 'mop bucket', brooms: 'brooms', umbrellastand: 'umbrella stand', slotmachine: 'slot machine', fridge: 'old fridge', plant: 'plant', coatrack: 'coat rack', wetsign: 'wet floor sign', crates: 'beer crates',
                      register: 'cash register', trophies: 'trophy', dogfigure: 'china dog', condiments: 'condiments', candlebottle: 'candle' };
    function propName(m){ return PROP_NAME[m.name] || m.name; }
    function grabProp(m){
      if (carried() || heldProp || movingProp) return;
      if (!m.home) m.home = m.holder.parent;
      heldProp = m; m.floatJump = true; m.holder.userData.floatR = 0; m.holder.userData.wheelTurn = WALL_PICTURE[m.name] ? Math.PI : 0;   // (a picture off the wall: its front toward him)
      if (m.box){ if (!m.half) m.half = { x: (m.box.maxX - m.box.minX) / 2, z: (m.box.maxZ - m.box.minZ) / 2, yaw: 0 }; m.boxWas = { minX: m.box.minX, maxX: m.box.maxX, minZ: m.box.minZ, maxZ: m.box.maxZ }; m.box.minX = m.box.maxX = m.box.minZ = m.box.maxZ = 999; }   // (boxAlong puts it where it lands)
      m.holder.visible = true;   // (it floats in front of the view: showProps / floatAt)
    }
    function dropProp(){
      var m = heldProp; if (!m) return;
      heldProp = null;
      m.holder.updateMatrixWorld(true);
      var wp = m.holder.getWorldPosition(V()), wq = m.holder.getWorldQuaternion(new T.Quaternion());
      play.setCarry(null); shown.carry = null;
      var home = m.home || propHome(); home.add(m.holder); m.holder.position.copy(home.worldToLocal(wp)); m.holder.quaternion.copy(wq); m.holder.visible = true;
      propFall(m);
    }
    // a big thing: picked up with E, it follows the view on the floor; E puts it down where there is room, F turns it
    function startMoving(m){
      if (carried() || heldProp || movingProp) return;
      if (!m.home) m.home = m.holder.parent;
      movingProp = m; movingProp.rot = new T.Euler().setFromQuaternion(m.holder.quaternion, 'YXZ').y; movingProp.ok = false;
      m.homePos = m.holder.position.clone(); m.homeQ = m.holder.quaternion.clone();   // (to go back to if there is no room where it is let go)
      if (m.box){ m.boxWas = { minX: m.box.minX, maxX: m.box.maxX, minZ: m.box.minZ, maxZ: m.box.maxZ }; if (!m.half) m.half = { x: (m.box.maxX - m.box.minX) / 2, z: (m.box.maxZ - m.box.minZ) / 2, yaw: 0 }; m.box.minX = m.box.maxX = m.box.minZ = m.box.maxZ = 999; }   // (not in its own way)
    }
    // a carried big thing shows red where it cannot stand (its materials copied once, so nothing else turns red)
    var BAD = new T.Color(0.55, 0.06, 0.03);
    function showRoom(obj, ok){
      if (!obj) return;
      obj.traverse(function(o){
        if (!o.isMesh || !o.material || o.userData.hull) return;
        if (!o.userData.ownMat){ o.material = Array.isArray(o.material) ? o.material.map(function(mm){ return mm.clone(); }) : o.material.clone(); o.userData.ownMat = true; }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(mm){
          if (!mm.emissive) return;
          if (!mm.userData.em0) mm.userData.em0 = mm.emissive.clone();
          mm.emissive.copy(ok ? mm.userData.em0 : BAD);
        });
      });
    }
    function stepMoving(){
      var m = movingProp; if (!m) return;
      var me = ctx.getChef(), f = V(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y));
      var half = m.half || { x: 0.3, z: 0.3 }, turned = Math.abs(Math.sin(m.rot - (half.yaw || 0))) > 0.7, hx = turned ? half.z : half.x, hz = turned ? half.x : half.z;
      var dist = 0.6 + Math.max(hx, hz) + 0.35, x = me.position.x + f.x * dist, z = me.position.z + f.z * dist;
      m.holder.position.set(x, 0, z); m.holder.quaternion.setFromEuler(new T.Euler(0, m.rot, 0));
      m.ok = ctx.boxFree(x - hx, x + hx, z - hz, z + hz) && Math.hypot(x - me.position.x, z - me.position.z) > 0.4;
      if (/^k_shelf/.test(m.key)){   // (a kitchen shelf: in the kitchen, not in front of what is used there)
        var k = ctx.getKitchen() || {};
        m.ok = m.ok && x - hx > 4.0 && z - hz > -10 && z + hz < 10 &&
               [k.sinkAt, k.fridgeAt, k.potAt, k.potAt2].every(function(p){ return !p || Math.hypot(p.x - x, p.z - z) > 1.4; });
      } else if (/^k_/.test(m.key)) m.ok = m.ok && x - hx > 3.95;   // (the kitchen's things stay behind the bar: in the kitchen or the back rooms)
      showRoom(m.holder, m.ok);
    }
    function cancelMoving(){   // back where it stood
      var m = movingProp; if (!m) return;
      movingProp = null; showRoom(m.holder, true);
      var s = state.props[m.key];
      if (m.box && m.boxWas){ m.box.minX = m.boxWas.minX; m.box.maxX = m.boxWas.maxX; m.box.minZ = m.boxWas.minZ; m.box.maxZ = m.boxWas.maxZ; }
      if (s){ m.holder.position.set(s.x, s.y, s.z); m.holder.quaternion.fromArray(s.q); boxAlong(m); }
      else if (m.homePos){ m.holder.position.copy(m.homePos); m.holder.quaternion.copy(m.homeQ); if (m.box && m.boxWas) boxAlong(m); }
    }
    function putMoving(){
      var m = movingProp; if (!m || !m.ok) return;
      movingProp = null; showRoom(m.holder, true);
      if (m.box && m.boxWas){ m.box.minX = 0; }   // (boxAlong sets it where it now stands)
      putProp(m, m.holder.position.clone(), m.holder.quaternion.clone());
    }
    var spillTex = null, spillMeshes = {};
    function stepFalling(dt){
      var ids = Object.keys(falling); if (!ids.length || !phys) return;
      phys.world.step(1 / 60, dt, 4);
      ids.forEach(function(id){
        var f = falling[id], it = state.items[id], v = objs[id];
        if (!it || it.at !== 'falling'){ phys.world.removeBody(f.body); delete falling[id]; return; }
        var b = f.body, iq = b.interpolatedQuaternion, ip = b.interpolatedPosition, bq = new T.Quaternion(iq.x, iq.y, iq.z, iq.w);   // (between two physics steps: smooth on any screen)
        var p = V(ip.x, ip.y, ip.z).add(f.off.clone().applyQuaternion(bq)), q = bq.clone().multiply(f.q);
        if (v){ v.obj.position.copy(p); v.obj.quaternion.copy(q); }
        it.x = p.x; it.y = p.y; it.z = p.z;
        f.t += dt;
        if (b.sleepState === phys.C.Body.SLEEPING || f.t > 5 || p.y < -2){   // lying still: put down there (or where it is caught)
          phys.world.removeBody(b); delete falling[id];
          landed(it, p, q);
        }
      });
    }
    function landed(it, p, q){
      hpLog('landed', it.kind, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
      it.at = 'surface'; it.x = +p.x.toFixed(3); it.y = Math.max(0, +p.y.toFixed(3)); it.z = +p.z.toFixed(3);
      it.rot = +Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)).toFixed(3);
      it.tilt = [q.x, q.y, q.z, q.w].map(function(n){ return +n.toFixed(4); });
      if (objs[it.id]) objs[it.id].placed = false;
      // in a pot: as if put in (cut food); in front of a guest waiting for it: served
      for (var i = 0; i < state.pots.length && place.pots && place.pots[i]; i++){
        var PP = place.pots[i];
        if (Math.hypot(p.x - PP.pos.x, p.z - PP.pos.z) < PP.inner && p.y < PP.pos.y + PP.size.y + 0.1 && isFood(it.kind) && isCut(it)){
          var had = state.carry, done = withPot(i, function(){ state.carry = it.id; return act('addToPot'); });
          state.carry = had;   // (what he holds by now stays in his hands)
          if (done){ usePot(i); return; }
        }
      }
      if (it.kind === 'stew') for (var gi = 0; gi < state.guests.length; gi++){
        var g = state.guests[gi], gv = views[g.id];
        if (g.phase === 'waiting' && gv && gv.info.where() === 'seated' && Math.hypot(p.x - gv.bowlAt.x, p.z - gv.bowlAt.z) < 0.45 && Math.abs(p.y - gv.bowlAt.y) < 0.25){
          var had2 = state.carry; state.carry = it.id; delete it.tilt; if (act('serve', g.id)){ state.carry = had2; return; } state.carry = had2;
        }
      }
    }
    // the mouse button let go: put there if he looks at a place for it, else let it fall
    window.addEventListener('wheel', function(e){
      if (hold || pc || !e.deltaY){ hpLog('wheel ignored', 'hold', hold, 'pc', !!pc, 'deltaY', e.deltaY); return; }
      wheelTurn(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    function wheelTurn(s){
      var it1 = carried(); hpLog('wheelTurn', s, 'carried', it1 && it1.kind, 'heldProp', heldProp && heldProp.key, 'movingProp', movingProp && movingProp.key, 'ghost', !!ghost);
      var it = carried(), v = it && !HOME[it.kind] && objs[it.id];
      if (movingTable) movingTable.rot = (movingTable.rot + s * Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      else if (movingChair) movingChair.rot = (movingChair.rot + s * Math.PI / 8 + Math.PI * 2) % (Math.PI * 2);
      else if (movingProp) movingProp.rot = (movingProp.rot + s * Math.PI / 8 + Math.PI * 2) % (Math.PI * 2);
      else if (ghost) ghost.rot = (ghost.rot + s * Math.PI / 8 + Math.PI * 2) % (Math.PI * 2);
      else if (heldProp) heldProp.holder.userData.wheelTurn = (heldProp.holder.userData.wheelTurn || 0) + s * Math.PI / 12;
      else if (v) v.obj.userData.wheelTurn = (v.obj.userData.wheelTurn || 0) + s * Math.PI / 12;
    }
    var furnWas = null;   // a bought piece picked up again: where it stood ({ id, x, z, rot })
    function hpLog(){ try { if (window.hotpotLog) window.hotpotLog.log(Array.prototype.join.call(arguments, ' ')); } catch (e){} }
    function letGo(){
      var it0 = carried();
      hpLog('letGo', 'hold', hold, 'pc', !!pc, 'carried', it0 && it0.kind, 'heldProp', heldProp && heldProp.key, 'movingProp', movingProp && movingProp.key + ' ok ' + movingProp.ok,
            'table', movingTable && movingTable.ok, 'chair', movingChair && movingChair.ok, 'F', (play.focusNow && play.focusNow().F || {}).label);
      if (hold || pc) return;   // (the pause card, the computer screen: clicks there are not letting go)
      if (movingChair){ putChair(false); return; }
      if (movingTable){ if (movingTable.ok) putTable(false); else { putTable(true); say('No room there \u2013 the table went back'); } return; }
      if (movingProp){ if (movingProp.ok) putMoving(); else { cancelMoving(); say('No room there \u2013 it went back'); } return; }
      if (furnWas && ghost && ghost.id === furnWas.id){
        var fw = furnWas; furnWas = null;
        if (ghost.ok && act('place', { id: ghost.id, x: +ghost.x.toFixed(3), z: +ghost.z.toFixed(3), rot: ghost.rot })){ saveNow(false); return; }
        act('place', fw); say('No room there \u2013 it went back'); return;
      }
      if (heldProp){ dropProp(); return; }
      var it = carried();
      if (!it || HOME[it.kind]) return;
      var f = play.focusNow ? play.focusNow().F : null;
      if (f && f.use){ f.use(); if (!carried()) return; }
      it = carried(); if (it && !HOME[it.kind]) letFall(it);
    }
    if (play.onLetGo) play.onLetGo(letGo);
    if (play.holdInfo) play.holdInfo(function(){
      if (movingChair) return movingChair.ok ? 'put the chair here' : 'no room \u2013 it goes back';
      if (movingTable) return movingTable.ok ? 'put the table here' : 'no room \u2013 it goes back';
      if (movingProp) return movingProp.ok ? 'put the ' + propName(movingProp) + ' here' : 'no room \u2013 it goes back';
      if (furnWas && ghost && ghost.id === furnWas.id) return ghost.ok ? 'put it here' : 'no room \u2013 it goes back';
      var it = carried(); return (!!it && !HOME[it.kind] && !pc) || !!heldProp;
    });
    function showSpills(){
      if (!spillTex){ spillTex = new T.TextureLoader().load('textures/stains.png'); spillTex.encoding = T.sRGBEncoding; }
      var live = {};
      state.spills.forEach(function(s){
        live[s.id] = true;
        var m = spillMeshes[s.id];
        if (!m){
          var geo = new T.PlaneGeometry(1, 1), uv = geo.attributes.uv, u0 = (s.kind % 2) * 0.5, v0 = s.kind < 2 ? 0.5 : 0;
          for (var i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
          m = spillMeshes[s.id] = new T.Mesh(geo, new T.MeshStandardMaterial({ map: spillTex, color: new T.Color(0x8c5a3c).convertSRGBToLinear(), transparent: true, alphaTest: 0.2, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
          m.rotation.set(-Math.PI / 2, 0, s.rot); m.position.set(s.x, s.y + 0.003, s.z); m.scale.setScalar(s.size); m.receiveShadow = true;
          root.add(m);
        }
        m.material.opacity = 0.25 + 0.75 * s.left; m.scale.setScalar(s.size * (0.7 + 0.3 * s.left));
      });
      Object.keys(spillMeshes).forEach(function(id){
        if (live[id]) return;
        var m = spillMeshes[id]; root.remove(m); m.geometry.dispose(); m.material.dispose(); delete spillMeshes[id];
      });
    }
    // ---------- the waiter ----------------------------------------------------------------
    // job: { kind: 'order' | 'serve' | 'clear', guest (null when clearing), item, step: 'go' | 'there' | 'back', t, way }
    var job = null;
    function waiterWay(g){   // from the bar to the guest's chair: along the bar to the front wall, then the guest's own way in
      var v = views[g.id], r = v && v.info.route && v.info.route(), W = ctx.getWaiter().place;
      if (!r || r.length < 5) return null;
      return [V(W.lane, 0, r[1].z), r[1], r[2], r[3], r[4]];
    }
    function waiterHere(){ return !!(ctx.getWaiter && ctx.getWaiter().ready()); }   // (his model loaded)
    function guestSeated(g){ return !!views[g.id] && views[g.id].info.where() === 'seated'; }
    function barPlace(kind){ var ks = kind === 'dirty' ? DIRTY_SLOTS : [0, 1, 2]; for (var i = 0; i < ks.length; i++) if (!passTaken(ks[i])) return ks[i]; return -1; }
    function dropWaiterBowl(){
      var W = ctx.getWaiter();
      Object.keys(state.items).forEach(function(id){
        var o = state.items[id]; if (o.at !== 'waiter') return;
        var k = barPlace(o.kind);
        if (k >= 0){ o.at = 'pass'; o.slot = k; }
        else { o.at = 'surface'; o.x = W.place.pass[1].x; o.y = W.place.barTop; o.z = W.place.pass[0].z - 1.1; o.rot = 0; }   // (on the bar, clear of its places)
      });
    }
    function waiterStep(dt){
      var W = ctx.getWaiter && ctx.getWaiter();
      if (!W || !W.ready()) return;
      if (!state.owned.waiter){ if (W.shown()) W.show(false); return; }
      if (!W.shown()){ W.show(true, W.place.home, Math.PI / 2); dropWaiterBowl(); job = null; }
      if (!job && (movingTable || movingChair)) return;   // (furniture being moved: he waits)
      if (!job){
        // a bowl on the bar for a guest who ordered that dish (the one waiting longest), else an order to take
        var best = null;
        Object.keys(state.items).forEach(function(id){
          var o = state.items[id]; if (o.at !== 'pass' || o.kind !== 'stew') return;
          state.guests.forEach(function(g){
            if (g.phase !== 'waiting' || !guestSeated(g) || (o.dish || 'stew') !== (g.want || 'stew') || !waiterWay(g)) return;
            if (!best || g.patience < best.g.patience) best = { kind: 'serve', g: g, item: o };
          });
        });
        if (!best) state.guests.forEach(function(g){
          if (g.phase !== 'ready' || !guestSeated(g) || !waiterWay(g)) return;
          if (!best || g.patience < best.g.patience) best = { kind: 'order', g: g };
        });
        if (!best && barPlace('dirty') >= 0) Object.keys(state.items).forEach(function(id){
          var o = state.items[id];
          if (best || o.kind !== 'dirty' || o.at !== 'table' || !num(o.seat) || !num(o.x)) return;
          if (state.guests.some(function(q){ return q.phase !== 'away' && q.seat === o.seat; })) return;   // (not while the guest is still getting up and going)
          var rt = W.routeTo(o.seat);
          if (rt && rt.length >= 5) best = { kind: 'clear', item: o, way: [V(W.place.lane, 0, rt[1].z), rt[1], rt[2], rt[3], rt[4]] };
        });
        if (!best) return;
        var way = best.way || waiterWay(best.g);
        job = { kind: best.kind, guest: best.g ? best.g.id : null, item: best.item ? best.item.id : null, step: 'go', t: 0, way: way };
        if (best.kind === 'clear'){ W.walk(way, function(){ if (job) { job.step = 'there'; job.t = 0; } }); return; }
        if (best.item){ best.item.at = 'waiter'; delete best.item.slot; }
        W.walk(way, function(){ if (job) { job.step = 'there'; job.t = 0; } });
        return;
      }
      var g = guest(job.guest), bowl = job.item ? state.items[job.item] : null;
      if (bowl && bowl.at === 'waiter' && objs[bowl.id]) W.hold(objs[bowl.id].obj);
      if (job.step === 'there'){
        var bv = views[job.guest], at = job.kind === 'clear' && bowl ? bowl : bv && bv.bowlAt;
        if (at) W.face(Math.atan2(at.x - W.pos().x, at.z - W.pos().z));
        job.t += dt;
        var gone = job.kind === 'clear' && !(bowl && bowl.at === 'table' && bowl.kind === 'dirty');   // (the chef took it meanwhile: nothing to wait for)
        if (job.t < RULES.staff.wait && !gone) return;
        if (job.kind === 'order' && g && g.phase === 'ready') act('order', g.id);
        if (job.kind === 'serve' && bowl && g && act('serveBy', { guest: g.id, item: bowl.id })) W.hold(null);
        if (job.kind === 'clear' && bowl && bowl.kind === 'dirty' && bowl.at === 'table'){ bowl.at = 'waiter'; delete bowl.guest; delete bowl.seat; }   // (he takes it along)
        // the next guest who wants to order, straight from this table (unless a bowl on the bar is waiting for somebody)
        var bowlFor = Object.keys(state.items).some(function(id){ var o = state.items[id]; return o.at === 'pass' && o.kind === 'stew' && state.guests.some(function(q){ return q.phase === 'waiting' && guestSeated(q) && (o.dish || 'stew') === (q.want || 'stew'); }); });
        var next = null;
        if (!bowlFor && !(bowl && bowl.at === 'waiter')) state.guests.forEach(function(q){ if (q.phase === 'ready' && guestSeated(q) && waiterWay(q) && (!next || q.patience < next.patience)) next = q; });
        if (next){
          var nway = waiterWay(next), hop = job.way.slice(2, 4).reverse().concat(nway.slice(2));   // (back to the aisle, along it, and in to the next chair)
          job = { kind: 'order', guest: next.id, item: null, step: 'go', t: 0, way: nway };
          W.walk(hop, function(){ if (job) { job.step = 'there'; job.t = 0; } });
          return;
        }
        job.step = 'back';
        var back = job.way.slice(0, 4).reverse().concat([W.place.home]);
        W.walk(back, function(){
          if (!job) return;
          var b2 = job.item ? state.items[job.item] : null;
          dropWaiterBowl();   // (the guest had gone: the bowl goes back on the bar)
          W.hold(null); W.face(Math.PI / 2); job = null;
        });
      }
    }
    function update(dt){
      clock += dt;
      buildPlaces();
      showSpills();
      if (!hold){ refall(); stepFalling(dt); stepPropFalling(dt); }
      showProps(); stepMoving(); showTables(); stepTable(); stepChair();
      if (heldProp){ var hp0 = heldProp; if (hp0.home && hp0.holder.parent !== hp0.home) hp0.home.add(hp0.holder); floatAt(hp0.holder, dt, hp0.floatJump); hp0.floatJump = false; }
      if (!phys && window.CANNON && place.pot && clock > 3){ physics(); syncStatics(); }   // (ready before anything is first let go)
      if (ctx.getWaiter && ctx.getWaiter().ready()) ctx.getWaiter().freeze(!!hold);
      if (!hold) waiterStep(dt);
      if (wiping && (ctx.isMoving() || !carried() || carried().kind !== 'rag' || !spillOf(wiping.id))) stopWipe();
      ctx.getGuests().forEach(view);
      if (!hold){
        tick(dt);
        sinceSave += dt;
        if (sinceSave >= RULES.autosave) saveNow(false);
      }
      if (pendingChef && ctx.chefAt && ctx.chefAt.set(pendingChef.x, pendingChef.z)){   // a loaded game: he stands where he stood
        if (num(pendingChef.yaw) && num(pendingChef.pitch)) ctx.look.set(pendingChef.yaw, pendingChef.pitch);
        pendingChef = null;
      }
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
      if (shown.delivered !== state.delivered){
        if (shown.delivered !== undefined) say('A delivery has arrived \u2013 it is in the storeroom', 6);
        shown.delivered = state.delivered;
      }
      drawPC();
      syncFurniture();
      syncSurfaces(dt);
      // the dining room's look and its extension (index.html)

      if (!!state.owned.bigroom !== !!shown.bigroom && ctx.openExtension){ shown.bigroom = !!state.owned.bigroom; ctx.openExtension(shown.bigroom); }
      // while a tool is led the view goes to where it works
      var work = cutting ? { yaw: cutting.look, at: place.board.pos } : pouring ? { yaw: pouring.look, at: place.pot.pos } : stirring ? { yaw: stirring.look, at: place.pot.pos } : wiping ? { yaw: wiping.look, at: wiping.at } : null;
      var job = rolling ? wallPoint(rolling.p, rolling.c, rolling.y) : laying ? rowSpot(laying) : dipping && state.items[dipping.bucket] ? whereOf(state.items[dipping.bucket]) : null;
      if (job){   // painting / laying / dipping: he looks at where the roller / mallet is
        var cam2 = camera.position, dxj = job.x - cam2.x, dzj = job.z - cam2.z, yawJ = Math.atan2(dxj, dzj) + Math.PI, L2 = ctx.look.get();
        var pitchJ = clamp(Math.atan2(job.y - cam2.y, Math.max(0.15, Math.hypot(dxj, dzj))), -1.25, 1.1), e2 = 1 - Math.exp(-6 * dt);
        ctx.look.set(L2.yaw + angle(yawJ - L2.yaw) * e2, L2.pitch + (pitchJ - L2.pitch) * e2);
      }
      if (work){
        var L = ctx.look.get(), cam = camera.position, wy = work.at.y + (cutting || wiping ? 0 : place.pot.size.y * 0.6);
        var ahead = (work.at.x - cam.x) * Math.sin(work.yaw) + (work.at.z - cam.z) * Math.cos(work.yaw);
        var pitch = clamp(-Math.atan2(cam.y - wy, Math.max(0.12, ahead)), -1.3, -0.5), e = 1 - Math.exp(-7 * dt);
        ctx.look.set(L.yaw + angle(work.yaw - Math.PI - L.yaw) * e, L.pitch + (pitch - L.pitch) * e);
      }
      syncItems(dt);

      // the day: what changed is said (and saved), the clock, the accounts at the end
      var day = state.day;
      if (shown.phase !== day.phase || shown.dayN !== day.n){
        if (shown.phase !== undefined){   // (not when the game starts or was just loaded)
          if (day.phase === 'open') say('The restaurant is open');
          else if (day.phase === 'closed' && inside()) say((day.time >= RULES.day.closes ? 'Closing time' : 'Closed for today') + ' \u2013 the last guests finish their meal', 5);
          else if (day.phase === 'prep'){
            var left = state.pots.filter(function(p){ return p.phase === 'ready'; })[0];
            shown.told = !!left;
            say('Day ' + day.n + ' \u2013 ' + (shown.told ? 'there is ' + dishOf(left.dish).short + ' left: open the restaurant when you are ready' : 'cook a pot of something, then open the restaurant'), 6);
          }
          saveNow(day.phase === 'prep');   // a new day: the save from before is kept as the backup
        }
        shown.phase = day.phase; shown.dayN = day.n; shown.empty = false;
        dayPanel(day.phase === 'done' ? day.report : null);
      }
      if (day.phase === 'closed' && !shown.empty && !inside()){ shown.empty = true; say('Everybody has gone \u2013 end the day at the front door', 6); }
      var mins = Math.floor(day.time + 1e-6), hud = 'Day ' + day.n + '   \u00b7   ' + Math.floor(mins / 60) + ':' + (mins % 60 < 10 ? '0' : '') + (mins % 60) + '   \u00b7   ' +
                (day.phase === 'open' ? 'Open' : day.phase === 'prep' ? 'Closed' : 'Closed for today');
      if (hud !== shown.hud){
        shown.hud = hud; openEl.lastChild.textContent = hud;
        openEl.classList.toggle('on', day.phase === 'open'); openEl.classList.toggle('late', day.phase === 'closed' || day.phase === 'done');
      }
      // the first pot is ready and nobody can come in yet: say what to do
      var readyPot = state.pots.filter(function(p){ return p.phase === 'ready'; })[0];
      if (readyPot && day.phase === 'prep' && !shown.told){ shown.told = true; say(dishOf(readyPot.dish).name + ' is ready \u2013 open the restaurant at the front door'); }
      if (state.money !== shown.money){
        var first = shown.money === null;
        shown.money = state.money; amountEl.textContent = euro(state.money);
        if (!first){ moneyEl.classList.add('bump'); setTimeout(function(){ moneyEl.classList.remove('bump'); }, 260); }
      }
      // crates and bowl stacks show what is left
      VEG.forEach(function(kind){ place.crates[kind].inside.forEach(function(v, i){ v.visible = i < state.crates[kind]; }); });
      VEG.forEach(function(kind){
        var c = place.store[kind], two = !!state.owned.bigstore;
        if (c.second.visible !== two){
          c.second.visible = two;
          if (two && ctx.addBox) c.box2 = ctx.addBox(c.second.position.x, c.second.position.z, MODELS.crate.size.z, MODELS.crate.size.x, MODELS.crate.size.y);
          else if (!two && c.box2 && ctx.removeBox){ ctx.removeBox(c.box2); c.box2 = null; }
        }
        // the first crate fills up first, then the second
        c.inside.forEach(function(v, i){ v.visible = i < state.store[kind]; });
      });
      place.stacks.bowls.forEach(function(b, i){ b.visible = i < state.bowls; });
      // what was bought for the dining room (decor.js puts it there)
      SHOP.forEach(function(t){ if (!!state.owned[t.key] !== !!shown['own_' + t.key]){ shown['own_' + t.key] = !!state.owned[t.key]; if (ctx.showBought) ctx.showBought(t.key, !!state.owned[t.key]); } });

      // (an older game: a dirty bowl stands at the chair of the guest who ate from it)
      Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (o.kind === 'dirty' && o.at === 'table' && !num(o.seat) && views[o.guest] && views[o.guest].info.seat) o.seat = views[o.guest].info.seat(); });
      // the guests: sent in and out as the rules say, and their signs (menu, order, eating, angry)
      state.guests.forEach(function(g){
        var v = views[g.id];
        if (!v) return;
        var s = v.sign, where = v.info.where();
        // (a loaded game: who sat at the table sits there again)
        if (where === 'away' && (g.phase === 'deciding' || g.phase === 'ready' || g.phase === 'waiting' || g.phase === 'eating')){ if (v.info.sitAt && !v.info.sitAt(g.seat)) g.seat = v.info.seat(); v.info.seatNow(); where = v.info.where(); }
        if (g.phase !== 'away' && !num(g.seat) && v.info.seat) g.seat = v.info.seat();   // (an older game: the chair he always had)
        if (g.phase === 'coming'){ if (where === 'away'){ if (v.info.sitAt && !v.info.sitAt(g.seat)) g.seat = v.info.seat(); v.info.come(); } else if (where === 'seated') act('seated', g.id); }
        if (g.phase === 'leaving'){ if (where === 'seated') v.info.leave(); else if (where === 'away') act('left', g.id); }
        var show = where === 'seated' && (g.phase === 'deciding' || g.phase === 'ready' || g.phase === 'waiting' || g.phase === 'angry' || g.phase === 'eating');
        s.sp.visible = show;
        if (show){
          v.info.head.getWorldPosition(headPos);
          s.sp.position.set(headPos.x, headPos.y + 0.78 + Math.sin(clock * 2 + headPos.z) * 0.015, headPos.z);
          var size = 0.62;
          if (g.phase === 'waiting'){
            drawOrder(s, g.patience, g.want);
            if (g.patience < 0.25) size *= 1 + Math.sin(clock * 9) * 0.05;   // getting impatient
          } else if (g.phase === 'eating'){ drawEating(s, g.t / RULES.eatTime); size = 0.36; }
          else if (g.phase === 'deciding'){ drawDeciding(s); size = 0.46; }
          else if (g.phase === 'ready'){ drawReady(s, g.patience); size = 0.56; if (g.patience < 0.25) size *= 1 + Math.sin(clock * 9) * 0.05; }
          else drawAngry(s);
          s.sp.scale.set(size, size, 1);
        }
        if (g.phase === 'paid' && !g.popped){ g.popped = true; popMoney(V(v.bowlAt.x, v.bowlAt.y + 0.45, v.bowlAt.z), g.pay); }
        if (g.phase !== 'paid') g.popped = false;
        if (v.review === undefined) v.review = g.review || 0;   // (first seen, e.g. in a loaded game: nothing new)
        if (g.review && v.review !== g.review){   // a review was written: its stars float up over the guest
          v.review = g.review;
          if (where !== 'away'){ v.info.head.getWorldPosition(headPos); popStars(V(headPos.x, headPos.y + (g.phase === 'angry' ? 1.05 : 0.6), headPos.z), g.stars); }   // (above the cross of a guest who gave up)
        }
      });
      var stars = reputation(), counted = Math.min(state.reviews.length, RULES.review.keep);
      var starText = stars ? '\u2605 ' + stars.toFixed(1) + '<span>  \u00b7  ' + counted + (counted === 1 ? ' review' : ' reviews') + '</span>' : '';
      if (starText !== shown.stars){
        shown.stars = starText; starsEl.classList.toggle('on', !!starText);
        if (starText) starsEl.innerHTML = starText;
      }
      // the entrance door stands open while the restaurant is open or somebody is still inside
      var door = ctx.getEntrance && ctx.getEntrance();
      if (door) door.target = state.open || state.guests.some(function(g){ return g.phase !== 'away'; }) ? 1 : 0;
      for (var i = pops.length - 1; i >= 0; i--){
        var p = pops[i]; p.t += dt / 1.6;
        p.s.sp.position.y = p.y + p.t * 0.7; p.s.sp.material.opacity = clamp(2.2 * (1 - p.t));
        if (p.t >= 1){ root.remove(p.s.sp); p.s.tex.dispose(); p.s.sp.material.dispose(); pops.splice(i, 1); }
      }

      // the pots: the one he works at is the one he stands nearest to (not while he is busy at one)
      var chefNow = ctx.getChef();
      if (chefNow && place.pots.length > 1 && state.pots.length > 1 && !stirring && !pouring && !scoop && !shake){
        var near = state.potAt, dNear = Math.hypot(place.pots[near].pos.x - chefNow.position.x, place.pots[near].pos.z - chefNow.position.z) - 0.15;   // (it changes only once the other one is clearly nearer)
        place.pots.forEach(function(PP, i){ var d = Math.hypot(PP.pos.x - chefNow.position.x, PP.pos.z - chefNow.position.z); if (state.pots[i] && d < dNear){ near = i; dNear = d; } });
        if (near !== state.potAt) usePot(near);
      }
      var working = state.potAt;
      place.pots.forEach(function(PP, i){
        PP.grp.visible = !!state.pots[i];
        if (!state.pots[i]){ PP.puffs.forEach(function(pf){ pf.sp.visible = false; }); PP.stream.visible = false; return; }
        withPot(i, function(){ potView(dt, i === working); });
      });
    }

    // a pot as it looks (state.pot, place.pot); active: the one the chef works at (the jug, the ladling, the recipe)
    function potView(dt, active){
      var P = place.pot, pot = state.pot, ready = pot.phase === 'ready', burnt = pot.phase === 'burnt', filling = pot.phase === 'filling';
      var fill = ready ? Math.min(1, pot.broth) * pot.portions / dishOf(pot.dish).portions : burnt ? Math.min(0.5, pot.broth) : pot.broth;
      P.level += (P.floor + (P.high - P.floor) * clamp(fill, 0, 1.18) - P.level) * Math.min(1, dt * 5);
      var wet = pot.phase !== 'empty' && pot.broth > 0.01;
      FOOD.forEach(function(kind){
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
      if (P.stewMap === undefined) P.stewMap = P.stew.material.map;
      var dk = potDish() || 'stew', soupy = !dishOf(dk).chunky, wantMap = soupy ? null : P.stewMap;   // (a soup is smooth: no chunks of carrot in it)
      if (P.stew.material.map !== wantMap){ P.stew.material.map = wantMap; P.stew.material.needsUpdate = true; }
      P.stew.material.color.setHex(dishOf(dk).color); if (soupy) P.stew.material.color.convertSRGBToLinear();
      P.stew.material.color.lerp(BURNT_COL, burnt ? 1 : pot.burn * 0.8);
      P.spin *= Math.exp(-2.2 * dt);
      var turn = ((wet && pot.temp >= COOK.simmer ? 0.22 : 0) + P.spin) * dt;   // it simmers, and it goes round with the ladle
      P.stew.rotation.z += turn; P.liquid.rotation.z += turn; P.specks.mesh.rotation.z += turn;
      var jugInHand = active && carried() && carried().kind === 'broth';
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
        var size = [0, 0.11][pot.heat] * (0.85 + 0.25 * Math.sin(clock * 17 + i * 2.1));
        fl.visible = pot.heat > 0; fl.scale.set(size * 0.55, size, 1); fl.position.y = size * 0.42 - 0.01;
      });
      // the broth running from the jug
      var jugObj = jugInHand && objs[carried().id] && objs[carried().id].obj;
      P.stream.visible = !!(active && pouring && pouring.flow > 0 && jugObj);
      if (P.stream.visible){
        jugObj.updateMatrixWorld(true);
        var sp = jugObj.localToWorld(MODELS.broth.tool.spout.clone());
        P.stream.position.copy(sp); P.stream.scale.set(1, Math.max(0.02, sp.y - (P.pos.y + P.level)), 1);
      }
      // the ladle: leaning in the pot; when ladling it lifts, swings over the bowl, pours and comes back
      var L = P.ladle, R = P.rest;
      L.visible = !(stirring && active);
      L.position.set(R.x, R.y, R.z); L.rotation.set(0, 0.6, -R.tilt);
      if (scoop && active){
        var t = scoop.t, bowl = objs[scoop.item] && objs[scoop.item].obj, up = P.size.y + 0.1;
        var over = bowl ? P.grp.worldToLocal(bowl.position.clone()) : V(0, 0, -0.5);
        over.y = Math.max(over.y + 0.2, up - 0.05);
        var a = smooth(t / 0.22), b = smooth((t - 0.22) / 0.33), c = smooth((t - 0.55) / 0.2), d = smooth((t - 0.8) / 0.2);
        var lift = V(0, up, 0);
        L.position.lerp(lift, a).lerp(over, b).lerp(V(R.x, R.y, R.z), d);
        L.rotation.z = -R.tilt * (1 - a) - 1.25 * c * (1 - d) - R.tilt * d;
      }
      var top = P.pos.y + P.size.y;
      if (place.recipe && active) drawRecipe(place.recipe);
      var smoke = burnt || pot.stick >= 1, strength = burnt ? 0.8 : wet ? clamp((pot.temp - 62) / 35) * (ready ? 0.7 : 1) : 0;
      P.puffs.forEach(function(pf){
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

    // ---------- the computer in the office ------------------------------------------------------
    // E at the office chair: the chef sits down (index.html), then the screen comes on, the
    // restaurant's back-office program: ordering supplies, and the accounts. It looks like
    // the game's own paper notes (the recipe, the day's slip) pinned on dark wood. The mouse
    // is free while it is on; E or Esc switches it off and he gets up. The game goes on.
    var DOCK = V(6.95, 0, -12.75);   // where deliveries are put down in the storeroom
    // spot 0 for the delivery box, 1 .. 4 for buckets and packs, along the wall
    function dockSpot(slot){ return slot ? V(7.62, 0, -12.9 - (slot - 1) * 0.55) : DOCK.clone(); }   // (between the sacks and the boxes)
    var pc = null;   // while it is used: { page: 'supplies' | 'accounts' | 'reviews', cart, said: [text, kind], fresh, sig, when }
    var pcEl = document.createElement('div'); pcEl.className = 'hp-pc';
    pcEl.innerHTML = '<div class="case"><div class="screen"></div></div>';
    document.body.appendChild(pcEl);
    var pcScreen = pcEl.querySelector('.screen'), pcCase = pcEl.querySelector('.case');
    function fitPC(){ pcCase.style.transform = 'scale(' + Math.min(1, (window.innerWidth - 24) / 944, (window.innerHeight - 24) / 650) + ')'; }
    window.addEventListener('resize', fitPC);
    function lockMouse(){
      var cv = document.querySelector('canvas');
      try { var lock = cv && cv.requestPointerLock && cv.requestPointerLock(); if (lock && lock.catch) lock.catch(function(){}); } catch (err){}
    }
    function openPC(){
      if (pc) return;
      pc = { page: 'supplies', cart: emptyGoods(), said: null, fresh: true, sig: '' };
      setTimeout(function(){ if (pc) pc.fresh = false; }, 0);   // (fresh: until the key press that switched it on is over)
      if (ctx.releaseKeys) ctx.releaseKeys();
      if (document.exitPointerLock) document.exitPointerLock();
      fitPC(); pcEl.classList.add('on'); document.body.classList.add('hp-hold');
      drawPC();
    }
    function closePC(){
      if (!pc) return;
      pc = null; pcEl.classList.remove('on'); document.body.classList.remove('hp-hold');
      lockMouse();
      if (ctx.seat && ctx.seat.seated()) ctx.seat.stand();   // he gets up
    }
    // E at the chair: he sits down, then the screen comes on
    function sitAtPC(){
      if (pc || !ctx.seat || carried() || cutting || pouring || stirring) return;
      ctx.seat.sit(openPC, function(){ say('He cannot get to the chair \u2013 something is in the way', 4); });   // (refused while he jumps or stands on something)
    }
    // a small picture of a model, drawn once with the game's own renderer
    var thumbs = {};
    function thumb(kind){
      if (thumbs[kind] !== undefined) return thumbs[kind];
      var Rn = ctx.renderer, md = MODELS[kind];
      if (!Rn || !md || !md.obj) return '';
      try {
        var px = 128, rt = new T.WebGLRenderTarget(px, px), sc = new T.Scene(), sz = md.size, r = Math.max(sz.x, sz.y, sz.z);
        rt.texture.encoding = T.sRGBEncoding;
        sc.environment = scene.environment;
        sc.add(new T.AmbientLight(0xffffff, 0.7));
        var lamp = new T.DirectionalLight(0xffffff, 1.2); lamp.position.set(1.5, 3, 2); sc.add(lamp);
        var thing = instance(kind);
        if (md.align){ thing.rotation.y = Math.atan2(1.5, 1.9); r = Math.max(sz.x * 0.8, sz.y * 1.15, sz.z); }   // its length across the picture
        sc.add(thing);
        var cam = new T.PerspectiveCamera(28, 1, 0.01, 20);
        cam.position.set(r * 1.5, sz.y / 2 + r * 1.3, r * 1.9); cam.lookAt(V(0, sz.y / 2, 0));
        var oldTarget = Rn.getRenderTarget(), oldColor = new T.Color(), oldAlpha = Rn.getClearAlpha(), buf = new Uint8Array(px * px * 4);
        Rn.getClearColor(oldColor);
        try {
          Rn.setRenderTarget(rt); Rn.setClearColor(0x000000, 0); Rn.clear(); Rn.render(sc, cam);
          Rn.readRenderTargetPixels(rt, 0, 0, px, px, buf);
        } finally { Rn.setRenderTarget(oldTarget); Rn.setClearColor(oldColor, oldAlpha); rt.dispose(); }
        var cv = document.createElement('canvas'); cv.width = cv.height = px;
        var g = cv.getContext('2d'), img = g.createImageData(px, px);
        for (var y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);   // (it comes upside down)
        g.putImageData(img, 0, 0);
        thumbs[kind] = cv.toDataURL();
      } catch (e){ console.error('Drawing the picture of ' + kind + ' failed:', e); thumbs[kind] = ''; }
      return thumbs[kind];
    }
    function clockText(){ var m = Math.floor(state.day.time + 1e-6); return Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
    function minSec(t){ t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); }
    function oneDec(x){ return Math.round(x * 10) / 10; }
    var ICON = {
      pot: '<svg viewBox="0 0 24 24"><path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 11h20M9 8c0-1.6 1.4-1.6 1.4-3.2M13.6 8c0-1.6 1.4-1.6 1.4-3.2"/></svg>'
    };
    function pct(x){ return Math.round(clamp(x) * 100); }
    // one little box for each place in the kitchen: filled = there, dashed = on its way, empty = room
    function stockBoxes(have, coming, holds){
      var h = '';
      for (var n = 0; n < holds; n++) h += '<i class="' + (have - n > 0.95 ? 'full' : have - n > 0.05 ? 'half' : have + coming - n > 0.5 ? 'way' : '') + '"></i>';
      return h;
    }
    // the screen follows the state: drawn again whenever something on it has changed
    function drawPC(){
      if (!pc) return;
      var day = state.day, total = priceOf(pc.cart), boxes = parcels();
      var sig = [pc.page, JSON.stringify(pc.cart), pc.said, state.money, JSON.stringify(state.prices) + JSON.stringify(state.offer), GOODS.map(function(k){ return oneDec(stockOf(k)) + '/' + room(k) + '/' + coming(k) + '/' + (state.store[k] || 0); }).join(' '),
                 state.orders.map(function(o){ return Math.ceil(o.left); }).join(','), boxes.map(function(p){ return p.at + JSON.stringify(p.goods); }).join(','),
                 day.n, day.phase, day.served, day.lost, day.sales, day.tips, day.spent, state.history.length, Object.keys(state.owned).join(','), pc.shopCat, state.furniture.length, state.furniture.filter(function(f){ return f.placed; }).length, state.reviews.length ? state.reviews[state.reviews.length - 1].id : 0].join('|');
      var when = 'Day ' + day.n + ' · ' + clockText() + ' · ' + (day.phase === 'open' ? 'Open' : day.phase === 'prep' ? 'Closed' : 'Closed for today');
      if (sig === pc.sig){   // only the clock has moved on: its text alone is changed, the screen is not built again
        if (when !== pc.when){ pc.when = when; var clockEl = pcScreen.querySelector('.when'); if (clockEl) clockEl.textContent = when; }
        return;
      }
      pc.sig = sig; pc.when = when;
      var html = '', title, sub;
      if (pc.page === 'supplies'){
        title = 'Supplies'; sub = 'Order what the kitchen needs';
        var cards = '';
        var shownG = GOODS.filter(function(k){ return k !== 'sausage' || (hasFridge() && known('sausage')) || stockOf(k) + coming(k) > 0; });
        shownG.forEach(function(k){
          var pic = thumb(k), have = stockOf(k), cap = holds(k), on = coming(k), n = pc.cart[k];
          cards += '<div class="card good"><div class="pic">' + (pic ? '<img src="' + pic + '" alt="">' : '') + '</div>' +
            '<div class="what"><b>' + GOOD[k].name + '</b><span class="price">' + euro(RULES.cost[k]) + (k === 'broth' ? ' per pot' : ' each') + '</span>' +
            '<div class="stock' + (cap > 8 ? ' many' : '') + '">' + stockBoxes(have, on, cap) + '</div>' +
            '<small>' + (k === 'broth' ? 'For ' + oneDec(have) + ' of ' + cap + ' pots' : k === 'sausage' ? state.fridge + ' in the fridge' : state.crates[k] + ' in the kitchen \u00b7 ' + state.store[k] + ' in the store') + (on ?' \u00b7 ' + on + ' on the way' : '') + '</small></div>' +
            '<div class="qty"><button data-do="minus:' + k + '"' + (n > 0 ? '' : ' disabled') + '>\u2212</button><b>' + n + '</b>' +
            '<button data-do="plus:' + k + '"' + (n < room(k) ? '' : ' disabled') + '>+</button></div></div>';
        });
        var poor = total > state.money, lines = '';
        GOODS.forEach(function(k){ if (pc.cart[k] > 0) lines += '<div class="row"><span>' + pc.cart[k] + ' \u00d7 ' + GOOD[k].name + '</span><span>' + euro(pc.cart[k] * RULES.cost[k]) + '</span></div>'; });
        var full = shownG.every(function(k){ return room(k) === 0; });
        var order = '<div class="card"><h4>Your order</h4>' + (lines || '<p class="muted">' + (full ? 'The kitchen is full \u2013 there is no room for more right now.' : 'Choose what you need with + and \u2212.') + '</p>') +
          '<div class="row total"><span>Total</span><b>' + euro(total) + '</b></div>' +
          '<div class="row after"><span>Till afterwards</span><span>' + signed(state.money - total) + '</span></div>' +
          (poor ? '<p class="warn">Not enough money in the till.</p>' : '') +
          '<button class="primary" data-do="buy"' + (total > 0 && !poor ? '' : ' disabled') + '>Order now</button>' +
          '<p class="muted small">Delivered to the storeroom in ' + RULES.delivery + ' s.</p></div>';
        var ships = '';
        if (pc.said) ships += '<p class="' + pc.said[1] + '" style="margin-bottom:6px">' + pc.said[0] + '</p>';
        var rows = [];   // boxes that are there first, then what is on its way
        boxes.forEach(function(p){
          rows.push('<div class="ship"><span class="tag here">' + (p.at === 'dock' ? 'In the storeroom' : 'Not unpacked') + '</span><div class="small cut">A box with ' + goodsText(p.goods) + '</div></div>');
        });
        state.orders.forEach(function(o){
          rows.push('<div class="ship"><span class="tag">On its way</span>' + minSec(o.left) + '<div class="small cut">' + (o.thing ? nameOf(o.thing, 'a') + thingNote(o.thing) : goodsText(o.goods)) + '</div>' +
                    '<div class="bar"><i style="width:' + pct(1 - o.left / RULES.delivery) + '%"></i></div></div>');
        });
        var fit = GOODS.filter(function(k){ return pc.cart[k] > 0; }).length >= 3 ? 1 : 2;   // (a long order leaves less room below it)
        ships += '<div class="' + (Math.min(fit, rows.length) === 1 ? 'one' : '') + '">' + rows.slice(0, fit).join('') + '</div>';
        if (rows.length > fit) ships += '<p class="muted small">+ ' + (rows.length - fit) + ' more</p>';
        if (!state.orders.length && !boxes.length && !pc.said) ships += '<p class="muted">Nothing on its way.</p><p class="muted small">Unpack a delivered box at the crates in the storeroom or in the kitchen, the broth at its shelf and sausages at the fridge.</p>';
        html = '<div class="col' + (shownG.length > 4 ? ' tight' : '') + '" style="flex:1">' + cards + '</div><div class="col" style="width:252px;flex:none">' + order + '<div class="card" style="flex:1;min-height:0"><h4>Deliveries</h4>' + ships + '</div></div>';
      } else if (pc.page === 'menu'){
        title = 'Menu'; sub = 'What the guests can order, and what it costs';
        var rowsM = '';
        Object.keys(RECIPES).forEach(function(k){
          var D = dishOf(k), on = known(k) && state.offer[k] !== false, pr = dishPrice(k), diff = pr - D.price;
          if (!known(k)){ rowsM += '<div class="card good"><div class="what"><b>' + D.name + '</b><br><small>Buy the recipe in the shop (Recipes) to put it on the menu.</small></div></div>'; return; }
          rowsM += '<div class="card good"><div class="what"><b>' + D.name + '</b><span class="price">' + euro(pr) + ' a bowl</span><br><small>' +
            FOOD.filter(function(v){ return D.needs[v] > 0; }).map(function(v){ return D.needs[v] + ' ' + (D.needs[v] > 1 ? GOOD[v].name.toLowerCase() : KINDS[v].a.replace(/^an? /, '')); }).join(', ') +
            ' \u00b7 usually ' + euro(D.price) + (diff > 0 ? ' \u00b7 <span class="warn">dearer: guests like it less</span>' : diff < 0 ? ' \u00b7 cheaper: guests like it more' : '') + '</small></div>' +
            '<div class="qty"><button data-do="cheaper:' + k + '"' + (on && pr > PRICE_RANGE[0] ? '' : ' disabled') + '>\u2212</button><b>' + pr + '</b>' +
            '<button data-do="dearer:' + k + '"' + (on && pr < PRICE_RANGE[1] ? '' : ' disabled') + '>+</button></div>' +
            '<button class="' + (on ? '' : 'primary ') + 'small-btn" data-do="offer:' + k + ':' + (on ? 'off' : 'on') + '">' + (on ? 'Take off' : 'Put on') + '</button></div>';
        });
        var noteM = (pc.said ? '<p class="' + pc.said[1] + '">' + pc.said[0] + '</p>' : '') +
          '<p class="muted">Guests order one of the dishes on the menu. If they get something else, they like it less.</p>' +
          '<p class="muted small">The usual price is fair. Each euro more brings more money per bowl, but the guests think it is worth less and a few stay away. Cheaper brings a few more.</p>';
        html = '<div class="col" style="flex:1">' + rowsM + '</div><div class="col" style="width:252px;flex:none"><div class="card"><h4>On the menu today</h4>' +
          menu().map(function(k){ return '<div class="row"><span>' + dishOf(k).name + '</span><b>' + euro(dishPrice(k)) + '</b></div>'; }).join('') + noteM + '</div></div>';
      } else if (pc.page === 'shop'){
        title = 'Shop'; sub = 'Things for the restaurant';
        var cat = pc.shopCat || 'kitchen', CATS = [['kitchen', 'Kitchen'], ['room', 'Room'], ['furniture', 'Furniture'], ['walls', 'Walls'], ['floors', 'Floors'], ['expand', 'Expand'], ['recipes', 'Recipes'], ['staff', 'Staff']];
        var items = '<div class="cats">' + CATS.map(function(c){ return '<button class="cat' + (c[0] === cat ? ' on' : '') + '" data-do="cat:' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
        function card(picHtml, name, price, text, action){
          return '<div class="card good">' + '<div class="pic">' + picHtml + '</div>' +
            '<div class="what"><b>' + name + '</b>' + (price !== null ? '<span class="price">' + euro(price) + '</span>' : '') + '<br><small>' + text + '</small></div>' + action + '</div>';
        }
        function img(k){ var p = thumb(k); return p ? '<img src="' + p + '" alt="">' : ''; }
        function buyBtn(cmd, price, label){ return '<button class="primary small-btn" data-do="' + cmd + '"' + (state.money < price ? ' disabled' : '') + '>' + (label || 'Buy') + '</button>'; }
        if (cat === 'kitchen' || cat === 'room' || cat === 'expand' || cat === 'recipes' || cat === 'staff') SHOP.forEach(function(t){
          if (t.cat !== cat || (t.key === 'waiter' && !(ctx.getWaiter && ctx.getWaiter().ready())) || (t.key === 'recipe_sausage' && !hasFridge()) || (t.key === 'pot2' && !ctx.getKitchen().potAt2)) return;
          items += card(img(t.pic), t.name, t.price, t.text, state.owned[t.key] ? '<span class="tag here">Bought</span>' : buyBtn('purchase:' + t.key, t.price));
        });
        else if (cat === 'furniture') FURNITURE.forEach(function(t){
          if (MODELS[t.key].failed) return;   // (its model is missing)
          var n = state.furniture.filter(function(f){ return f.key === t.key; }).length, waiting = state.furniture.some(function(f){ return !f.placed; });
          items += card(img(t.key), t.name, t.price, t.text + (n ? ' (you have ' + n + ')' : ''),
            n >= FURNITURE_MAX ? '<span class="tag here">Enough</span>' : waiting ? '<span class="tag">Place the last one first</span>' : buyBtn('furniture:' + t.key, t.price));
        });
        else {
          var part = cat === 'walls' ? 'wall' : 'floor';
          LOOK[part].forEach(function(t){
            var id = part + ':' + t.key;
            var pic = t.swatch ? '<i class="swatch" style="background:' + t.swatch + '"></i>' : '<i class="swatch" style="background:#3a2414 url(' + t.img + ') center/120px"></i>';
            items += card(pic, t.name + (part === 'wall' ? ' paint' : ''), t.price,
              part === 'wall' ? 'A bucket with a roller, for ' + PAINT_COVERS + ' wall panels. Paint them one by one.' : 'A pack for ' + FLOOR_COVERS + ' squares of floor. Lay them one by one.',
              buyBtn('buylook:' + id, t.price));
          });
          items += '<p class="muted small" style="color:#ead9b8">Delivered to the storeroom like supplies. Carry it to the dining room and put it down there (F). Paint with the roller from the storeroom: dip it in the bucket (E), then hold the left mouse button at a wall and move the mouse. Lay boards with the rubber mallet: look at a square beside the pack, left mouse button, mouse up and down to knock.</p>';
        }
        var placedN = state.furniture.filter(function(f){ return f.placed; }).length;
        var info = '<div class="card note"><h4>The restaurant</h4>' +
          '<div class="row"><span>How guests like the room</span><b>' + Math.round(mood() * 100) + ' %</b></div>' +
          '<div class="row"><span>Furniture placed</span><b>' + placedN + '</b></div>' +
          '<div class="row"><span>Crates (kitchen / store)</span><b>' + kitchenCap() + ' / ' + storeCap() + '</b></div>' +
          '<div class="row"><span>Bowls</span><b>' + (RULES.bowls + (state.owned.bowls ? SHOP_EFFECT.bowls : 0)) + '</b></div>' +
          '<div class="row"><span>Cooking time</span><b>' + Math.round(dishOf(potDish()).cookTime * (state.owned.stove ? SHOP_EFFECT.stove : 1)) + ' s</b></div>' +
          '<p class="muted small" style="margin-top:9px">' + (cat === 'furniture' ? 'When you get up, the new piece follows your view: E puts it down, F turns it. E at a piece moves it again.' : 'Everything is delivered at once and paid from the till.') + '</p>' +
          (pc.said ? '<p class="' + pc.said[1] + '" style="margin-top:6px">' + pc.said[0] + '</p>' : '') + '</div>';
        html = '<div class="col" style="flex:1">' + items + '</div><div class="col" style="width:252px;flex:none">' + info + '</div>';
      } else if (pc.page === 'reviews'){
        title = 'Reviews'; sub = 'What the guests say';
        var latest = state.reviews.slice(-RULES.review.keep), count = [0, 0, 0, 0, 0, 0], avg = reputation();
        latest.forEach(function(r){ count[r.stars]++; });
        function starRow(n){ return '<span class="stars">' + '\u2605\u2605\u2605\u2605\u2605'.slice(0, n) + '<i>' + '\u2605\u2605\u2605\u2605\u2605'.slice(n) + '</i></span>'; }
        var sum = '<div class="card note"><h4>The restaurant\u2019s stars</h4>';
        if (latest.length){
          sum += '<div class="big">' + avg.toFixed(1) + ' ' + starRow(Math.round(avg)) + '</div><p class="muted small">from the last ' + latest.length + (latest.length === 1 ? ' review' : ' reviews') + '</p>';
          [5, 4, 3, 2, 1].forEach(function(n){ sum += '<div class="row"><span>' + starRow(n) + '</span><b>' + count[n] + '</b></div>'; });
        } else sum += '<p class="muted">Nobody has written a review yet.</p>';
        sum += '<p class="muted small" style="margin-top:9px">Good food, quick service and a clean floor make good reviews. More stars bring more guests.</p></div>';
        var said = '';
        latest.slice(-4).reverse().forEach(function(r){
          said += '<div class="card rev">' + starRow(r.stars) + '<p class="quote">\u201c' + esc(r.text) + '\u201d</p><p class="muted small">\u2013 ' + esc(GUEST_NAMES.hasOwnProperty(r.who) ? GUEST_NAMES[r.who] : 'A guest') + ', day ' + r.day + '</p></div>';
        });
        html = '<div class="col" style="width:278px;flex:none">' + sum + '</div><div class="col" style="flex:1">' + said + '</div>';
      } else {
        title = 'Accounts'; sub = 'Day ' + day.n + ' so far, and the days before';
        var soFar = day.sales + day.tips - day.spent;
        function line(name, value, cls){ return '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + name + '</span><b>' + value + '</b></div>'; }
        var days = '';
        if (!state.history.length) days = '<p class="muted">No day is finished yet. End a day at the front door to see it here.</p>';
        else {
          days = '<table><tr><th>Day</th><th>Guests</th><th>Takings</th><th>Supplies</th><th>Profit</th><th>Till</th></tr>';
          state.history.slice(-5).reverse().forEach(function(r){
            days += '<tr><td>Day ' + r.n + '</td><td>' + r.served + '</td><td>' + euro(r.sales + r.tips) + '</td><td>' + signed(-r.cost) + '</td><td class="' + (r.profit < 0 ? 'neg' : r.profit > 0 ? 'pos' : '') + '">' + signed(r.profit) + '</td><td>' + signed(r.money) + '</td></tr>';
          });
          days += '</table>';
        }
        // (the same lines as on the slip at the end of the day)
        html = '<div class="col" style="width:278px;flex:none"><div class="card note"><h4>Today \u2013 day ' + day.n + '</h4>' +
          line('Guests served', day.served) + line('Guests who left hungry', day.lost, day.lost ? 'minus' : '') +
          line('Food sold', euro(day.sales)) + line('Tips', euro(day.tips)) + line('Bought', signed(-day.spent), day.spent ? 'minus' : '') +
          line('Profit so far', signed(soFar), 'total ' + (soFar < 0 ? 'minus' : soFar > 0 ? 'plus' : '')) + line('In the till', signed(state.money), 'till') + '</div></div>' +
          '<div class="col" style="flex:1"><div class="card note"><h4>Earlier days</h4>' + days + '</div></div>';
      }
      pcScreen.innerHTML =
        '<div class="side"><div class="logo"><i>' + ICON.pot + '</i><span>Hot Pot Go<small>Back office</small></span></div>' +
        '<button class="nav' + (pc.page === 'supplies' ? ' on' : '') + '" data-do="page:supplies">Supplies</button>' +
        '<button class="nav' + (pc.page === 'accounts' ? ' on' : '') + '" data-do="page:accounts">Accounts</button>' +
        '<button class="nav' + (pc.page === 'reviews' ? ' on' : '') + '" data-do="page:reviews">Reviews</button>' +
        '<button class="nav' + (pc.page === 'menu' ? ' on' : '') + '" data-do="page:menu">Menu</button>' +
        '<button class="nav' + (pc.page === 'shop' ? ' on' : '') + '" data-do="page:shop">Shop</button>' +
        '<span class="grow"></span><button class="nav out" data-do="close">Get up<kbd>E</kbd></button></div>' +
        '<div class="main"><div class="top"><h2>' + title + '<small>' + sub + '</small></h2><span class="grow"></span>' +
        '<span class="chip' + (day.phase === 'open' ? ' open' : day.phase === 'prep' ? '' : ' late') + '"><i></i><span class="when">' + when + '</span></span>' +
        '<span class="chip till"><i></i>' + signed(state.money) + '</span></div><div class="page">' + html + '</div></div>';
    }
    // a button on the screen: 'plus:potato', 'minus:potato', 'buy', 'page:accounts', 'close'
    function pcDo(cmd){
      if (!pc) return;
      var p = cmd.split(':'), k = p[1];
      pc.said = null;
      if (p[0] === 'plus'){ if (GOOD[k] && pc.cart[k] < room(k)) pc.cart[k]++; }
      else if (p[0] === 'minus'){ if (GOOD[k] && pc.cart[k] > 0) pc.cart[k]--; }
      else if (p[0] === 'page') pc.page = k === 'accounts' || k === 'reviews' || k === 'shop' || k === 'menu' ? k : 'supplies';
      else if (p[0] === 'dearer' || p[0] === 'cheaper'){ if (!act('price', { dish: k, price: dishPrice(k) + (p[0] === 'dearer' ? 1 : -1) })) pc.said = ['The price cannot go ' + (p[0] === 'dearer' ? 'higher.' : 'lower.'), 'warn']; else saveNow(false); }
      else if (p[0] === 'offer'){ if (!act('offer', { dish: k, on: p[2] === 'on' })) pc.said = ['At least one dish stays on the menu.', 'warn']; else saveNow(false); }
      else if (p[0] === 'cat') pc.shopCat = k;
      else if (p[0] === 'furniture'){
        var ft = furnitureItem(k);
        if (ft && act('buyFurniture', k)){ pc.said = [ft.name + ' \u2013 bought! Get up and place it.', 'ok']; saveNow(false); }
        else pc.said = ['This is not possible.', 'warn'];
      }
      else if (p[0] === 'buylook'){
        var lid = k + ':' + p[2], lt = lookItem(k, p[2]);
        if (lt && act('buyLook', lid)){ pc.said = [lt.name + ' \u2013 ordered! It comes to the storeroom.', 'ok']; saveNow(false); }
        else pc.said = [lt && state.money >= lt.price ? 'No more room in the storeroom \u2013 use up what is there first.' : 'This is not possible.', 'warn'];
      }
      else if (p[0] === 'purchase'){
        var t = shopItem(k);
        if (t && act('purchase', k)){ pc.said = [t.name + ' \u2013 bought!', 'ok']; saveNow(false); }
        else pc.said = ['This is not possible.', 'warn'];
      }
      else if (p[0] === 'buy'){
        if (act('buy', pc.cart)){ pc.cart = emptyGoods(); pc.said = ['Ordered \u2013 thank you!', 'ok']; saveNow(false); }
        else pc.said = ['This order is not possible.', 'warn'];
      } else if (p[0] === 'close'){ closePC(); return; }
      drawPC();
    }
    // (on pressing down, not on letting go: the screen may be drawn again in between)
    pcEl.addEventListener('mousedown', function(e){
      var t = e.target;
      while (t && t !== pcEl && !(t.getAttribute && t.getAttribute('data-do'))) t = t.parentNode;
      if (!t || t === pcEl || t.disabled) return;
      e.preventDefault(); pcDo(t.getAttribute('data-do'));
    });
    window.addEventListener('keydown', function(e){
      if (!pc || pc.fresh || e.repeat) return;   // (not the key press that switched it on, not a key held down)
      var k = e.key.toLowerCase();
      if (k === 'e' || k === 'escape') closePC();
    });

    // ---------- the saved game ---------------------------------------------------------------
    // Everything the rules know (`state`), where the chef stands and the stains on the
    // floor, as one text. `hold`: the game waits for "Continue" or "New restaurant".
    var store = window.hotpotSave || null, SAVE_VERSION = 1, hold = false, sinceSave = 0, pendingChef = null, saved = null, startEl = null;

    function snapshot(){
      var at = ctx.chefAt && ctx.chefAt.get(), L = ctx.look.get();
      return JSON.stringify({ game: 'Hot Pot Go', version: SAVE_VERSION, saved: new Date().toISOString(), state: state,
                              chef: at ? { x: at.x, z: at.z, yaw: L.yaw, pitch: L.pitch } : null, stains: play.getStains ? play.getStains() : [] });
    }
    function saveNow(keepBackup){
      sinceSave = 0;
      if (!store || hold) return false;
      try { return !!store.write(snapshot(), !!keepBackup); }
      catch (e){ console.error('Saving the game failed:', e); return false; }
    }
    // Checks a saved game and tidies it: returns it ready to use, or null if it cannot be used.
    function readSave(text){
      var d, st;
      try { d = JSON.parse(text); } catch (e){ return null; }
      if (!d || d.game !== 'Hot Pot Go' || d.version !== SAVE_VERSION || !d.state) return null;   // (an older version would be brought up to date here)
      st = d.state;
      function oneOf(v, list){ return list.indexOf(v) >= 0; }
      function okCut(c){ return !!c && Array.isArray(c.a) && Array.isArray(c.b) && c.a.every(num) && c.b.every(num); }
      var ok = num(st.money) && num(st.nextId) && num(st.bowls) && num(st.broth) && !!st.items && typeof st.items === 'object' && Array.isArray(st.guests) &&
        !!st.crates && !!st.pot && !!st.pot.has && !!st.tools && !!st.day && num(st.day.n) && st.day.n >= 1 && num(st.day.time) &&
        oneOf(st.day.phase, ['prep', 'open', 'closed', 'done']) && oneOf(st.pot.phase, ['empty', 'filling', 'ready', 'burnt']);
      ok = ok && VEG.every(function(k){ return num(st.crates[k]) && num(st.pot.has[k]); });
      if (ok) VEG.forEach(function(k){ st.crates[k] = Math.max(0, Math.min(RULES.crateStock * (st.owned && st.owned.bigkitchen === true ? 2 : 1), Math.floor(st.crates[k]))); });
      if (ok){   // the other pot (one bought in the shop): looked over roughly, emptied if it is not right
        var okPot = function(p){
          return !!p && typeof p === 'object' && oneOf(p.phase, ['empty', 'filling', 'ready', 'burnt']) && !!p.has && FOOD.every(function(k){ return num(p.has[k]) || (k === 'sausage' && p.has[k] === undefined); }) &&
            ['broth', 'spice', 'heat', 'temp', 'cooked', 'stick', 'burn', 'quality', 'portions', 'batch'].every(function(k){ return num(p[k]); }) && Array.isArray(p.qs) && p.qs.every(num) &&
            !!p.cut && typeof p.cut === 'object' && (p.dish === null || p.dish === undefined || isDish(p.dish)) && (p.phase !== 'ready' || isDish(p.dish));
        };
        var pots = Array.isArray(st.pots) ? st.pots.slice(0, 2) : [], at = st.potAt === 1 && pots.length === 2 ? 1 : 0;
        if (!(st.owned && st.owned.pot2 === true)){ pots = []; at = 0; }
        pots = pots.map(function(p, i){
          if (i === at) return st.pot;
          if (!okPot(p)) return newPot();
          FOOD.forEach(function(k){ p.has[k] = num(p.has[k]) ? Math.max(0, Math.floor(p.has[k])) : 0; });
          p.heat = p.heat ? 1 : 0; p.dish = p.dish || null; p.qs = p.qs.slice(0, 20);
          var cut = {}; FOOD.forEach(function(k){ if (p.cut[k] && okCut(p.cut[k])) cut[k] = p.cut[k]; }); p.cut = cut;
          if (p.phase === 'empty') p.dish = null;
          else if (p.phase === 'ready' || p.phase === 'burnt' || p.cooked > 0){ if (!p.dish) p.dish = 'stew'; }
          else if (p.dish && !FOOD.every(function(v){ return p.has[v] === RECIPES[p.dish].needs[v]; })) p.dish = null;
          p.portions = Math.max(0, Math.min(p.phase === 'ready' ? dishOf(p.dish).portions : 0, Math.floor(p.portions)));
          if (p.phase === 'ready' && p.portions <= 0) return newPot();
          return p;
        });
        if (!pots.length) pots = [st.pot];
        if (st.owned && st.owned.pot2 === true && pots.length < 2) pots.push(newPot());
        st.pots = pots; st.potAt = at;
      }
      if (ok){   // bowls on the bar, or in the waiter's hands (he starts at the bar again): each on its own place on the bar
        var onBar = {};
        Object.keys(st.items).forEach(function(id){
          var o = st.items[id]; if (!o || (o.at !== 'pass' && o.at !== 'waiter')) return;
          var ks = o.kind === 'dirty' ? DIRTY_SLOTS : [0, 1, 2], k = -1;
          if (o.at === 'pass' && ks.indexOf(o.slot) >= 0 && !onBar[o.slot]) k = o.slot;
          for (var q = 0; k < 0 && q < ks.length; q++) if (!onBar[ks[q]]) k = ks[q];
          if ((o.kind !== 'stew' && o.kind !== 'dirty') || k < 0){ if (o.kind === 'stew' || o.kind === 'bowl' || o.kind === 'dirty') st.bowls++; delete st.items[id]; return; }   // (only bowls go on the bar)
          o.at = 'pass'; o.slot = k; onBar[k] = true;
        });
      }
      if (ok) Object.keys(st.items).forEach(function(id){   // (falling when it was saved: lying there; a tilt must be a turn)
        var o = st.items[id]; if (!o) return;
        if (o.at === 'falling'){ o.at = 'surface'; o.y = num(o.y) ? Math.max(0, o.y) : 0; delete o.tilt; o.refall = true; }   // (it falls on once the game is loaded)
        if (o.refall !== undefined && o.refall !== true) delete o.refall;
        if (o.tilt !== undefined && !(Array.isArray(o.tilt) && o.tilt.length === 4 && o.tilt.every(num) && Math.abs(Math.hypot(o.tilt[0], o.tilt[1], o.tilt[2], o.tilt[3]) - 1) < 0.01)) delete o.tilt;
      });
      if (ok){   // single chairs moved (an older save has none)
        var chairs = {};
        if (st.chairs && typeof st.chairs === 'object') Object.keys(st.chairs).forEach(function(k){
          var s = st.chairs[k];
          if (/^[0-9]+$/.test(k) && +k < MAX_SEATS && s && num(s.x) && num(s.z) && s.x > -10 && s.x < 2.3 && s.z > -10 && s.z < 9.5) chairs[k] = { x: s.x, z: s.z, rot: num(s.rot) ? s.rot : 0 };
        });
        st.chairs = chairs;
      }
      if (ok){   // where tables were moved to (an older save has none)
        var tables = {};
        if (st.tables && typeof st.tables === 'object') Object.keys(st.tables).forEach(function(k){
          var s = st.tables[k];
          if (/^[0-9]$/.test(k) && s && num(s.x) && num(s.z) && s.x > -10 && s.x < 2.3 && s.z > -10 && s.z < 8.2) tables[k] = { x: s.x, z: s.z, rot: num(s.rot) ? Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2) : 0 };
        });
        st.tables = tables;
      }
      if (ok){   // where decor things were moved to (an older save has none)
        var props = {};
        if (st.props && typeof st.props === 'object') Object.keys(st.props).forEach(function(k){
          var s = st.props[k];
          if (/^[a-z_]+[0-9]*$/.test(k) && s && num(s.x) && num(s.y) && num(s.z) && Math.abs(s.x) < 40 && Math.abs(s.z) < 40 && s.y >= 0 && s.y < 5 &&
              Array.isArray(s.q) && s.q.length === 4 && s.q.every(num) && Math.abs(Math.hypot(s.q[0], s.q[1], s.q[2], s.q[3]) - 1) < 0.01) props[k] = { x: s.x, y: s.y, z: s.z, q: s.q };
        });
        st.props = props;
      }
      if (ok){   // spills on the tables (an older save has none)
        st.spills = (Array.isArray(st.spills) ? st.spills : []).filter(function(s){
          return !!s && num(s.id) && num(s.x) && num(s.y) && num(s.z) && (s.kind === 1 || s.kind === 3) && num(s.size) && s.size > 0 && s.size < 1 && num(s.rot) && num(s.left) && s.left > 0 && s.left <= 1;
        }).slice(0, RULES.spill.most);
        var seen = {}; st.spills = st.spills.filter(function(s){ if (seen[s.id] || s.id >= st.nextId) return false; seen[s.id] = true; return true; });   // (each its own id)
      }
      if (ok){   // (an older save has no fridge and no sausage in the pot)
        st.fridge = num(st.fridge) ? Math.max(0, Math.min(RULES.fridgeStock, Math.floor(st.fridge))) : 0;
        if (!num(st.pot.has.sausage)) st.pot.has.sausage = 0;
        [st.orders || []].concat([Object.keys(st.items).map(function(id){ return st.items[id]; })]).forEach(function(list){
          (Array.isArray(list) ? list : []).forEach(function(o){ if (o && o.goods && typeof o.goods === 'object' && o.goods.sausage === undefined) o.goods.sausage = 0; });
        });
      }
      if (ok){   // (an older save has no store)
        var kept = { potato: 0, carrot: 0, onion: 0 };   // (not "store": that is where the game is saved)
        VEG.forEach(function(k){ if (st.store && num(st.store[k])) kept[k] = Math.max(0, Math.min(RULES.storeStock * (st.owned && st.owned.bigstore === true ? 2 : 1), Math.floor(st.store[k]))); });
        st.store = kept;
      }
      if (ok && st.tools && typeof st.tools === 'object' && num(st.nextId)) ['roller', 'mallet', 'rag'].forEach(function(k){   // (an older game had no tools for walls and floor, or no cloth)
        if (st.tools[k] !== undefined) return;
        var t = { id: st.nextId++, kind: k, at: 'home' }; st.items[t.id] = t; st.tools[k] = t.id;
      });
      ok = ok && Object.keys(HOME).every(function(k){ var o = st.items[st.tools[k]]; return !!o && o.kind === k; });
      ok = ok && Object.keys(st.items).every(function(id){
        var o = st.items[id];
        return !!o && o.id === +id && !!KINDS[o.kind] && oneOf(o.at, ['hand', 'surface', 'board', 'home', 'table', 'dock', 'pass', 'waiter', 'falling']) &&
               (o.at !== 'surface' || (num(o.x) && num(o.y) && num(o.z))) && (!o.cut || (isFood(o.kind) && okCut(o.cut))) &&
               (o.kind !== 'parcel' || (!!o.goods && GOODS.every(function(k){ return num(o.goods[k]) && o.goods[k] >= 0; })));
      });
      ok = ok && num(st.items[st.tools.broth].left) && (st.day.phase !== 'done' || (!!st.day.report && num(st.day.report.n)));
      if (!ok) return null;
      var hadDecor = !!st.decor && typeof st.decor === 'object' && !!st.decor.walls && !!st.decor.floor;
      // what a newer game knows and this save does not: as in a new game
      var fresh = newState();
      Object.keys(fresh).forEach(function(k){ if (st[k] === undefined || st[k] === null && fresh[k] !== null) st[k] = fresh[k]; });
      Object.keys(fresh.pot).forEach(function(k){ if (typeof fresh.pot[k] === 'number' && !num(st.pot[k])) st.pot[k] = fresh.pot[k]; });
      Object.keys(fresh.day).forEach(function(k){ if (typeof fresh.day[k] === 'number' && !num(st.day[k])) st.day[k] = fresh.day[k]; });
      st.orders = (Array.isArray(st.orders) ? st.orders : []).filter(function(o){ return !!o && !!o.goods && num(o.left) && GOODS.every(function(k){ return num(o.goods[k]) && o.goods[k] >= 0; }); });
      st.history = (Array.isArray(st.history) ? st.history : []).filter(function(r){ return !!r && ['n', 'served', 'lost', 'sales', 'tips', 'cost', 'profit', 'money'].every(function(k){ return num(r[k]); }); });
      if (!num(st.delivered)) st.delivered = 0;
      var prices = {}, offer = {};   // (the menu: known dishes, whole euros in the range)
      Object.keys(RECIPES).forEach(function(k){
        if (st.prices && num(st.prices[k]) && st.prices[k] === Math.round(st.prices[k]) && st.prices[k] >= PRICE_RANGE[0] && st.prices[k] <= PRICE_RANGE[1]) prices[k] = st.prices[k];
        if (st.offer && st.offer[k] === false) offer[k] = false;
      });
      st.prices = prices; st.offer = offer;
      // the dishes: known ones only; the pot's fits what is in it (older games: it was always stew)
      if (st.pot.dish !== null && st.pot.dish !== undefined && !isDish(st.pot.dish)) st.pot.dish = 'stew';
      if (st.pot.phase === 'empty') st.pot.dish = null;
      else if (st.pot.phase === 'ready' || st.pot.phase === 'burnt' || st.pot.cooked > 0){ if (!st.pot.dish) st.pot.dish = 'stew'; }
      else if (st.pot.dish && !FOOD.every(function(v){ return st.pot.has[v] === RECIPES[st.pot.dish].needs[v]; })) st.pot.dish = null;
      if (st.pot.dish === undefined) st.pot.dish = null;
      (Array.isArray(st.guests) ? st.guests : []).forEach(function(g){
        if (!g) return;
        if (g.want !== undefined && !isDish(g.want)) g.want = 'stew';
        if (g.got !== undefined && !isDish(g.got)) g.got = 'stew';
        if (g.price !== undefined && !(num(g.price) && g.price >= PRICE_RANGE[0] && g.price <= PRICE_RANGE[1])) g.price = dishOf(g.got).price;
      });
      Object.keys(st.items).forEach(function(id){ var o = st.items[id]; if (o.kind === 'stew' && !isDish(o.dish)) o.dish = 'stew'; else if (o.kind !== 'stew') delete o.dish;
        if (o.seat !== undefined && !(num(o.seat) && o.seat === Math.floor(o.seat) && o.seat >= 0 && o.seat < MAX_SEATS)) delete o.seat; });
      if (st.owned && st.owned.lounge === true && !st.owned.bigroom) st.owned.bigroom = true;   // (an older game had a lounge there instead)
      var owned = {};   // (only things the shop has)
      if (st.owned && typeof st.owned === 'object') SHOP.forEach(function(t){ if (st.owned[t.key] === true) owned[t.key] = true; });
      st.owned = owned;
      // the room's look: only known paints and floors
      // the walls and the floor: known panels / squares with known paints / floors; an older game's look becomes them
      var decorS = { walls: {}, floor: {} }, SS = ctx.surfaces;
      if (SS){
        var oldWall = st.look && lookItem('wall', st.look.wall) ? st.look.wall : null, oldFloor = st.look && lookItem('floor', st.look.floor) ? st.look.floor : null;
        SS.panels.forEach(function(p){ var v = hadDecor ? st.decor.walls[p.id] : oldWall; if (lookItem('wall', v) && v !== 'cream') decorS.walls[p.id] = v; });
        SS.squares.forEach(function(q){ var v = hadDecor ? st.decor.floor[q.id] : oldFloor; if (lookItem('floor', v) && v !== 'tiles') decorS.floor[q.id] = v; });
      }
      st.decor = decorS; delete st.look;
      var rl = st.items[st.tools.roller];   // (the paint on the roller: a known one, 0 .. 1)
      if (!(rl.color && lookItem('wall', rl.color) && num(rl.load) && rl.load > 0)){ delete rl.color; delete rl.load; } else rl.load = Math.min(1, rl.load);
      // buckets and packs: made anew from what is known of them (a known paint / floor, a whole number left),
      // in the hands or at the storeroom's spots; at most DOCK_SLOTS - 1 of them, bought ones included
      function thingOf(o){
        if (!o) return null;
        var paint = o.kind === 'paint', max = paint ? PAINT_COVERS : FLOOR_COVERS;
        if (!(paint ? lookItem('wall', o.color) : o.kind === 'boards' && lookItem('floor', o.floor)) || !num(o.left) || o.left < 1) return null;
        var t = paint ? { kind: 'paint', color: o.color } : { kind: 'boards', floor: o.floor };
        t.left = Math.min(max, Math.floor(o.left)); return t;
      }
      var things = 0, spots = {};
      function nextSpot(){ for (var s = 1; spots[s]; s++); spots[s] = true; return s; }
      Object.keys(st.items).forEach(function(id){ var o = st.items[id];
        if (o.kind !== 'paint' && o.kind !== 'boards') return;
        var t = thingOf(o);
        if (!t || things >= DOCK_SLOTS - 1){ delete st.items[id]; if (st.carry === +id) st.carry = null; return; }
        things++; t.id = o.id; t.at = o.at === 'hand' && st.carry === +id ? 'hand' : o.at === 'surface' && num(o.x) && num(o.z) && Math.abs(o.x) < 40 && Math.abs(o.z) < 40 ? 'surface' : 'dock';
        if (t.at === 'surface'){ t.x = o.x; t.y = num(o.y) ? Math.max(0, Math.min(3, o.y)) : 0; t.z = o.z; t.rot = num(o.rot) ? o.rot : 0; }
        if (t.at === 'dock'){ var sl = o.slot; if (o.at === 'dock' && sl >= 1 && sl < DOCK_SLOTS && sl === Math.floor(sl) && !spots[sl]) spots[sl] = true; else sl = nextSpot(); t.slot = sl; }
        st.items[id] = t;
      });
      Object.keys(st.items).forEach(function(id){ var o = st.items[id]; if (o.kind === 'parcel') o.slot = 0; });
      st.orders = st.orders.filter(function(o){
        if (!o.thing) return true;
        var t = things < DOCK_SLOTS - 1 ? thingOf(o.thing) : null;
        if (!t){ if (num(o.cost) && o.cost > 0) st.money += o.cost; return false; }   // (what cannot come is paid back)
        things++; o.thing = t; return true;
      });
      // furniture: known pieces with numbers for places; at most one waiting to be placed
      var waiting = false, ids = {};
      st.furniture = (Array.isArray(st.furniture) ? st.furniture : []).filter(function(f){
        if (!f || !furnitureItem(f.key) || !num(f.id) || !num(f.x) || !num(f.z) || !num(f.rot) || ids[f.id] || f.id >= st.nextId) return false;
        ids[f.id] = true;
        f.placed = f.placed === true;
        if (!f.placed){ if (waiting) return false; waiting = true; }
        return true;
      }).slice(0, FURNITURE.length * FURNITURE_MAX);
      st.bowls = Math.max(0, Math.min(Math.floor(st.bowls), RULES.bowls + (owned.bowls ? SHOP_EFFECT.bowls : 0)));   // (whole bowls, no more than the stack holds)
      st.reviews = (Array.isArray(st.reviews) ? st.reviews : []).filter(function(r){
        return !!r && num(r.id) && num(r.day) && num(r.stars) && r.stars >= 1 && r.stars <= 5 && typeof r.text === 'string' && typeof r.who === 'string';
      }).slice(-60);
      st.reviews.forEach(function(r){ r.stars = Math.round(r.stars); r.text = r.text.slice(0, 200); r.who = r.who.slice(0, 40); });
      var FIGURES = ['n', 'served', 'lost', 'sales', 'tips', 'cost', 'profit', 'money', 'reviews', 'stars'];
      function figures(r){ FIGURES.forEach(function(k){ if (!num(r[k])) r[k] = 0; }); }
      if (st.day.report) figures(st.day.report);
      st.history.forEach(figures);
      if (!Array.isArray(st.pot.qs)) st.pot.qs = [];
      if (!st.pot.cut || typeof st.pot.cut !== 'object') st.pot.cut = {};
      FOOD.forEach(function(k){ if (st.pot.cut[k] && !okCut(st.pot.cut[k])) delete st.pot.cut[k]; });
      st.pot.heat = st.pot.heat ? 1 : 0;
      st.day.time = clamp(st.day.time, RULES.day.opens, RULES.day.closes);
      // what was in the middle of happening is settled: guests on their way in or out are
      // outside, a bowl without its guest is back on the stack, a thing in nobody's hand is gone
      st.guests = st.guests.filter(function(g){ return !!g && typeof g.id === 'string'; });
      st.guests.forEach(function(g){
        var bowl = st.items[g.item], sits = g.phase === 'deciding' || g.phase === 'ready' || g.phase === 'waiting' || (g.phase === 'eating' && !!bowl && bowl.at === 'table' && bowl.guest === g.id);
        if (!sits){ g.phase = 'away'; g.rest = 0; g.item = null; }
        if (!num(g.t)) g.t = 0;
        if (!num(g.patience)) g.patience = 1;
        if (!num(g.pay)) g.pay = RECIPES.stew.price;
        if (!num(g.rest)) g.rest = 0;
        if (g.seat !== undefined && !(num(g.seat) && g.seat === Math.floor(g.seat) && g.seat >= 0 && g.seat < MAX_SEATS)) delete g.seat;
        if (!num(g.q)) delete g.q;
        if (!num(g.review) || !num(g.stars)){ delete g.review; delete g.stars; }
        delete g.waited;
        g.popped = false;
      });
      if (st.carry !== null && !(st.items[st.carry] && st.items[st.carry].at === 'hand')) st.carry = null;
      if (st.board !== null && !(st.items[st.board] && st.items[st.board].at === 'board')) st.board = null;
      Object.keys(st.items).forEach(function(id){
        var o = st.items[id], lost = false;
        if (o.at === 'table') lost = o.kind === 'dirty' ? !(num(o.x) && num(o.y) && num(o.z)) : !st.guests.some(function(g){ return g.phase === 'eating' && g.item === o.id; });
        else if (o.at === 'hand') lost = st.carry !== o.id;
        else if (o.at === 'board') lost = st.board !== o.id;
        else if (o.at === 'dock') lost = o.kind !== 'parcel' && o.kind !== 'paint' && o.kind !== 'boards';
        if (!lost) return;
        if (HOME[o.kind]) o.at = 'home';
        else { if (o.kind === 'bowl' || o.kind === 'stew' || o.kind === 'dirty') st.bowls++; delete st.items[id]; }
      });
      st.knife = st.tools.knife; st.open = st.day.phase === 'open';
      return d;
    }
    // the game goes on from a saved one: everything shown is built again from its state
    function applySave(d){
      state = d.state;
      if (place.pots){ if (!place.pots[state.potAt]) usePot(0); place.pot = place.pots[state.potAt]; }
      Object.keys(objs).forEach(function(id){ if (objs[id].obj.parent) objs[id].obj.parent.remove(objs[id].obj); delete objs[id]; });
      play.setCarry(null);
      cutting = null; pouring = null; stirring = null; shake = null; scoop = null; wiping = null; note.t = 0;
      Object.keys(falling).forEach(function(id){ if (phys) phys.world.removeBody(falling[id].body); delete falling[id]; });
      Object.keys(propFalling).forEach(function(k){ if (phys) phys.world.removeBody(propFalling[k].body); delete propFalling[k]; });
      if (heldProp){ var hp = heldProp; heldProp = null; if (hp.home) hp.home.add(hp.holder); if (hp.box && hp.boxWas){ hp.box.minX = hp.boxWas.minX; hp.box.maxX = hp.boxWas.maxX; hp.box.minZ = hp.boxWas.minZ; hp.box.maxZ = hp.boxWas.maxZ; } }
      if (movingProp) cancelMoving();   // (back where it stood, box and all)
      propsShown = null;   // (the loaded game's places)
      if (movingTable) putTable(true);
      if (movingChair) putChair(true);
      if (movingProp) cancelMoving();
      furnWas = null;
      tablesShown = null;
      if (ctx.tables) ctx.tables.list().forEach(function(t, i){ if (!d.state.tables[i] && t.home && (t.x !== t.home.x || t.z !== t.home.z || t.rot)){ tableTo(i, t.home.x, t.home.z, false, 0); delete state.tables[i]; } });
      if (ctx.tables) ctx.tables.list().forEach(function(t){   // (chairs the loaded game did not move: at their table as at first)
        t.chairs.forEach(function(c){ if (!d.state.chairs[c.k] && c.off && (Math.abs(c.x - t.x - c.off.x) > 1e-3 || Math.abs(c.z - t.z - c.off.z) > 1e-3 || c.rot !== c.rot0)) ctx.tables.moveChair(c.k, t.x + c.off.x, t.z + c.off.z, c.rot0); });
      });   // (a table the loaded game did not move: where it stood at first)
      job = null; if (ctx.getWaiter && ctx.getWaiter().ready()){ ctx.getWaiter().hold(null); ctx.getWaiter().show(false); }   // (he starts at the bar again)
      Object.keys(spillMeshes).forEach(function(id){ var m = spillMeshes[id]; root.remove(m); m.geometry.dispose(); m.material.dispose(); delete spillMeshes[id]; });   // (the loaded game's spills are drawn anew)
      closePC(); shown.delivered = undefined; shown.stars = null; shownSurf = { walls: {}, floor: {} };
      rolling = null; dipping = null; if (laying) stopLaying(); Object.keys(partial).forEach(function(id){ ctx.surfaces.strokes(id, null, []); }); partial = {};
      Object.keys(views).forEach(function(id){ views[id].review = undefined; });   // (their reviews are the loaded game's)
      if (ctx.seat && ctx.seat.reset) ctx.seat.reset();   // (not sitting in a loaded game)
      shown.carry = null; shown.money = null; shown.hud = null; shown.phase = undefined; shown.told = true;
      if (play.setStains) play.setStains(d.stains);
      pendingChef = d.chef && num(d.chef.x) && num(d.chef.z) ? d.chef : null;
    }
    // the pause card: the game stands still behind it (as behind the start card)
    var pauseEl = null, pauseAt = 0;
    function showPause(){
      if (hold || pc || pauseEl || (ctx.seat && ctx.seat.active())) return;
      hold = true; document.body.classList.add('hp-hold');
      if (ctx.releaseKeys) ctx.releaseKeys();
      var el = pauseEl = document.createElement('div'), st = state; pauseAt = Date.now();
      el.className = 'hp-start';
      function card(note){
        el.innerHTML = '<div class="hp-paper"><h2>Paused</h2><p>Day ' + st.day.n + ' \u00b7 ' + signed(Math.round(st.money)) + ' in the till</p>' +
          (note ? '<p class="sub">' + note + '</p>' : '') +
          '<button data-do="resume">Back to the game</button>' + (store ? '<button class="quiet" data-do="save">Save now</button><button class="quiet" data-do="quit">Save and quit</button>' : '') + '</div>';
      }
      el.addEventListener('click', function(e){
        var what = e.target && e.target.getAttribute && e.target.getAttribute('data-do');
        if (what === 'resume') resume();
        else if (what === 'save') card(savePaused() ? 'Saved.' : 'It could not be saved.');
        else if (what === 'quit'){ if (savePaused()) window.close(); else card('It could not be saved.'); }
      });
      card(''); document.body.appendChild(el);
    }
    function savePaused(){ hold = false; var ok = saveNow(false); hold = true; return ok; }
    function resume(){
      if (!pauseEl) return;
      pauseEl.parentNode.removeChild(pauseEl); pauseEl = null;
      hold = false; document.body.classList.remove('hp-hold');
      var cv = document.querySelector('canvas');   // straight back into the game
      try { var lock = cv && cv.requestPointerLock && cv.requestPointerLock(); if (lock && lock.catch) lock.catch(function(){}); } catch (err){}
    }
    document.addEventListener('pointerlockchange', function(){ if (!document.pointerLockElement && !startEl) showPause(); });
    window.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;   // (Enter: a key press may take the mouse back, Esc may not)
      if (pauseEl && !e.repeat && Date.now() - pauseAt > 400) resume();   // (not the Esc that let the mouse go)
    });
    // 'continue' with the saved restaurant, or a 'new' one (the saved one stays as the backup)
    function begin(what){
      if (!hold || pauseEl) return false;
      if (what === 'continue') applySave(saved.data);
      hold = false;
      if (startEl){ startEl.parentNode.removeChild(startEl); startEl = null; }
      document.body.classList.remove('hp-hold');
      if (what !== 'continue') saveNow(true);
      return true;
    }
    function showStart(){
      var el = startEl = document.createElement('div'), st = saved.data.state;
      el.className = 'hp-start';
      function card(html){ el.innerHTML = '<div class="hp-paper">' + html + '</div>'; }
      function first(){
        card('<h2>Hot Pot Go</h2><p>Your restaurant \u00b7 day ' + st.day.n + ' \u00b7 ' + signed(Math.round(st.money)) + ' in the till</p>' +
             (saved.backup ? '<p class="warn">The last save could not be read. This is the one from before.</p>' : '') +
             '<button data-do="continue">Continue</button><button class="quiet" data-do="ask">New restaurant</button>');
      }
      el.addEventListener('click', function(e){
        var what = e.target && e.target.getAttribute && e.target.getAttribute('data-do');
        if (what === 'ask') card('<h2>Start over?</h2><p>A new restaurant takes the place of the saved one.</p>' +
                                 '<button data-do="new">Yes, start over</button><button class="quiet" data-do="back">Back</button>');
        else if (what === 'back') first();
        else if (what){
          begin(what);
          var cv = document.querySelector('canvas');   // straight back into the game
          try { var lock = cv && cv.requestPointerLock && cv.requestPointerLock(); if (lock && lock.catch) lock.catch(function(){}); } catch (err){}
        }
      });
      first(); document.body.appendChild(el); document.body.classList.add('hp-hold');
    }
    if (store){
      try {
        var files = store.read() || {}, main = files.main ? readSave(files.main) : null, backup = !main && files.backup ? readSave(files.backup) : null;
        if (main) saved = { data: main };
        else if (backup) saved = { data: backup, backup: true };
        if (files.main && !main){   // it is kept beside the new save, not overwritten
          console.error('The saved game could not be read' + (backup ? '; using the backup.' : '; starting a new restaurant.'));
          if (store.setAside) store.setAside();
        }
      } catch (e){ console.error('Loading the saved game failed:', e); }
      if (saved){ hold = true; showStart(); }
      window.addEventListener('keydown', function(e){ if (hold && startEl && e.key === 'Enter') begin('continue'); });
      window.addEventListener('beforeunload', function(){ if (pauseEl) savePaused(); else saveNow(false); });
    }

    return {
      update: update, mouse: mouse,
      atScreen: function(){ return !!pc || hold || !!(ctx.seat && ctx.seat.active()); },   // the keys belong to a screen (or he is sitting down), not to the chef
      // ---- for tests only ----
      debugPC: function(cmd){ if (cmd === 'open') openPC(); else if (cmd) pcDo(cmd); return pc ? { page: pc.page, cart: pc.cart, said: pc.said } : null; },
      debugStore: function(){ return { kitchen: VEG.map(function(k){ return state.crates[k]; }).join('/'), store: VEG.map(function(k){ return state.store[k]; }).join('/') }; },
      debugFurniture: function(){ return { pieces: state.furniture.map(function(f){ return f.key + (f.placed ? '@' + f.x.toFixed(2) + ',' + f.z.toFixed(2) : ' waiting'); }), ghost: ghost ? { x: +ghost.x.toFixed(2), z: +ghost.z.toFixed(2), ok: ghost.ok } : null, walls: state.decor.walls, floor: state.decor.floor, bigroom: !!state.owned.bigroom }; },
      debugShop: function(){ return { owned: Object.keys(state.owned), mood: +mood().toFixed(2), bowls: state.bowls, money: state.money }; },
      debugReviews: function(){ return { stars: +reputation().toFixed(2), list: state.reviews.map(function(r){ return r.stars + ' ' + r.who + ' (food ' + r.food + ' wait ' + r.wait + ' clean ' + r.clean + '): ' + r.text; }) }; },
      debugSupplies: function(){ var o = {}; GOODS.forEach(function(k){ o[k] = oneDec(stockOf(k)) + ' room ' + room(k) + ' coming ' + coming(k); }); o.orders = state.orders.map(function(x){ return goodsText(x.goods) + ' in ' + Math.ceil(x.left); }); o.boxes = parcels().map(function(p){ return p.at + ': ' + goodsText(p.goods); }); return o; },
      debugDay: function(){ return JSON.parse(JSON.stringify(state.day)); },
      debugTime: function(minutes){ state.day.time = minutes; },
      debugSave: saveNow, debugPause: function(on){ if (on) showPause(); else resume(); return !!pauseEl; }, debugSnapshot: snapshot, debugBegin: begin, debugHold: function(){ return hold; },
      debugLoad: function(text){ var d = readSave(text); if (d) applySave(d); return !!d; },
      debugCheck: function(text){ return !!readSave(text); },
      // ---- for tests only ----
      debugState: function(){
        var it = carried();
        return { money: state.money, served: state.served, lost: state.lost, carry: it ? it.kind : null,
                 day: state.day.n + ' ' + state.day.phase + ' ' + Math.floor(state.day.time / 60) + ':' + ('0' + Math.floor(state.day.time % 60)).slice(-2),
                 crates: VEG.map(function(k){ return state.crates[k]; }).join('/'), bowls: state.bowls,
                 pot: state.pot.phase + ' x' + state.pot.portions + ' has ' + FOOD.map(function(k){ return state.pot.has[k]; }).join('') +
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
      // for tests: this guest sits at the table right now and has ordered
      debugOrder: function(id){
        var g = guest(id), v = views[id];
        if (!g || !v) return false;
        v.info.seatNow(); g.phase = 'waiting'; g.patience = 1; return true;
      },
      debugPatience: function(id, left){ var g = guest(id); if (g) g.patience = left; },
      debugPhase: function(id, phase){ var g = guest(id); if (g){ g.phase = phase; g.t = 0; } },
      debugGuests: function(){ return state.guests.map(function(g){ return g.id + ':' + g.phase + '/' + views[g.id].info.where(); }).join(' '); },
      debugMoney: function(n){ state.money = n; },
      debugPhys: function(){ if (!phys) return null; var out = { statics: phys.statics.length, sig: phys.sig.length, falling: Object.keys(falling).map(function(id){ var b = falling[id].body; return [id, +b.position.x.toFixed(2), +b.position.y.toFixed(2), +b.position.z.toFixed(2)]; }) }; out.near = phys.statics.filter(function(b){ return Math.abs(b.position.x + 7.5) < 1 && Math.abs(b.position.z + 2.33) < 1; }).map(function(b){ return [b.position.x, b.position.y, b.position.z, b.shapes[0].halfExtents.y]; }); return out; },
      debugChair: function(){ return movingChair && { x: +movingChair.x.toFixed(2), z: +movingChair.z.toFixed(2), rot: +movingChair.rot.toFixed(2), ok: movingChair.ok }; },
      debugSeats: function(){ return freeSeats(); },
      debugWheel: function(s){ wheelTurn(s); },
      debugLetGo: letGo, debugTables: function(){ return ctx.tables ? ctx.tables.list().map(function(t){ return [t.x, t.z]; }) : null; },
      debugMoveTable: function(i){ var t = ctx.tables.list()[i]; if (t) startTable(t); return !!movingTable; }, debugPutTable: function(){ putTable(false); return !movingTable; }, debugProps: function(){ return { props: state.props, held: heldProp && heldProp.key, moving: movingProp && movingProp.key, movables: (ctx.getMovables ? ctx.getMovables() : []).map(function(m){ return m.key; }) }; },
      debugGrabProp: function(k){ var m = (ctx.getMovables() || []).filter(function(x){ return x.key === k; })[0]; if (m){ if (m.big) startMoving(m); else grabProp(m); } return !!m; }, debugPutMoving: function(){ putMoving(); return !movingProp; }, debugFalling: function(){ return Object.keys(falling).length; },
      debugAct: act, debugPot: function(){ return state.pot; }, debugPots: function(){ return state.pots.map(function(p){ return p.phase + ' ' + p.dish + ' x' + p.portions + ' has ' + FOOD.map(function(k){ return p.has[k]; }).join('') + ' heat ' + p.heat + ' ' + Math.round(p.temp); }).join(' / ') + ' at ' + state.potAt; }, debugCookRules: COOK,
      debugTools: function(){ return { ids: state.tools, jug: MODELS.broth.tool, home: place.home, left: state.items[state.tools.broth].left }; },
      debugCut: { start: startCutting, stop: stopCutting, limits: function(){ var o = state.items[state.board]; return o && cutAxis(o) ? cutLimits(o, cutAxis(o)) : null; },
                  ranges: function(kind){ return MODELS[kind].range; }, knife: function(){ return MODELS.knife.tool; }, sizes: function(){ var o = {}; Object.keys(MODELS).forEach(function(k){ if (MODELS[k].size) o[k] = MODELS[k].size.toArray().map(function(x){ return +x.toFixed(3); }); }); return o; } },
      debugEat: function(){ Object.keys(state.items).forEach(function(id){ var o = state.items[id]; if (o.kind === 'stew' && o.at === 'surface'){ delete state.items[id]; state.bowls++; } }); },
      debugIds: function(kind){ return Object.keys(state.items).filter(function(id){ return state.items[id].kind === kind; }).map(Number); },
      debugTool: function(k){ var t = MODELS[k] && MODELS[k].tool; return t ? { grip: t.grip.toArray(), grip2: t.grip2 && t.grip2.toArray(), head: t.head.toArray(), axis: t.axis.toArray(), long: t.long, thick: t.thick, size: MODELS[k].size.toArray() } : null; },      debugAim: function(){ var q = lookedAt('floor', 3); return { q: q && q.id, hit: [hit.x, hit.z], from: rayFrom.toArray(), dir: rayDir.toArray(), free: ctx.floorFree(hit.x, hit.z, 0.3) }; },
      debugSlices: function(k){ var md = MODELS[k], p = md.pts, n = p.length / 3, hx = md.size.x / 2, out = []; for (var x0 = hx - 0.3; x0 < hx; x0 += 0.03){ var lo = [9, 9], hi = [-9, -9], c = 0; for (var i = 0; i < n; i++){ var x = p[i * 3]; if (x < x0 || x >= x0 + 0.03) continue; c++; lo[0] = Math.min(lo[0], p[i * 3 + 1]); hi[0] = Math.max(hi[0], p[i * 3 + 1]); lo[1] = Math.min(lo[1], p[i * 3 + 2]); hi[1] = Math.max(hi[1], p[i * 3 + 2]); } out.push([+x0.toFixed(2), c, +lo[0].toFixed(3), +hi[0].toFixed(3), +lo[1].toFixed(3), +hi[1].toFixed(3)]); } return { hx: hx, end: md.tool.end.toArray().map(function(v){ return +v.toFixed(3); }), endR: md.tool.endR, slices: out }; },
      debugPaint: function(){ return { rolling: rolling && { c: +rolling.c.toFixed(2), y: +rolling.y.toFixed(2) }, dipping: !!dipping, laying: laying && { rows: laying.rows, h: +laying.h.toFixed(2) }, partial: Object.keys(partial).map(function(k){ return k + ':' + partial[k].n + '/' + partial[k].cells.length; }), roller: state.items[state.tools.roller] }; },
      debugRules: RULES, debugRecipe: RECIPES, debugMenu: function(){ return { menu: menu(), pot: state.pot.dish, becoming: potDish(), wants: state.guests.filter(function(g){ return g.phase === 'waiting'; }).map(function(g){ return g.want; }) }; },
      debugGuest: function(id){ var v = views[id]; return v ? { spot: [v.info.spot.x, v.info.spot.z], bowlAt: v.bowlAt.toArray() } : null; },
      debugPlaces: function(){
        if (!place.pot) return null;
        var k = ctx.getKitchen(), r = function(v){ return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; };
        return { pot: r(place.pot.pos), potSize: r(place.pot.size), bowls: r(place.stacks.pos), surfaces: k.surfaces,
                 crates: VEG.map(function(kind){ return r(place.crates[kind].pos); }), sink: k.sinkAt ? r(k.sinkAt) : null };
      }
    };
  }

  window.HotPotRestaurant = { build: build };
})();
