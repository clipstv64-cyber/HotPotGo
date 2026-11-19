// Furnishing of the guest room: only Meshy models (made from ChatGPT
// reference images, see art/refs), placed in the room.
//
// Guest room: x from -10 to the partition (PARTITION.x - thickness / 2), z from -10 to 10.
// Used from index.html:
//   decor = HotPotDecor.build({ scene, renderer, addBox, WALL_HEIGHT, PARTITION })
//   decor.dressTable(tableObj, spot, tableSize, index)   // when the tables are placed
//   decor.update(delta, time)                            // every frame
(function(){
  'use strict';
  var T = THREE;
  var Y_AXIS = new T.Vector3(0, 1, 0);

  function build(ctx){
    var scene = ctx.scene, addBox = ctx.addBox, H = ctx.WALL_HEIGHT;
    var PART = ctx.PARTITION, X1 = PART.x - PART.thickness / 2;   // guest side of the partition
    var updaters = [];
    var root = new T.Group(); root.name = 'decor'; scene.add(root);

    // ---------- Meshy models (models/d_*.glb) --------------------------------
    var gltf = new T.GLTFLoader();
    if (window.MeshoptDecoder) gltf.setMeshoptDecoder(MeshoptDecoder);
    var modelCache = {};
    function loadModel(name){
      if (!modelCache[name]){
        modelCache[name] = fetch('models/d_' + name + '.glb')
          .then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function(buf){ return new Promise(function(res, rej){ gltf.parse(buf, '', function(g){ res(g.scene); }, rej); }); })
          .catch(function(e){ console.error('Could not load model ' + name + ':', e); return null; });
      }
      return modelCache[name];
    }
    // Places a model scaled to a real size: size = { h } (height), { w } (width) or { d } (depth).
    // The returned group is the anchor: by default the model stands on it, centred;
    // anchor 'top' hangs it below, 'center' centres it, back: true puts its back at the anchor
    // (for things against a wall). opts.done(holder, size) runs once it is loaded.
    function place(name, size, parent, x, y, z, ry, opts){
      opts = opts || {};
      var holder = new T.Group(); holder.position.set(x || 0, y || 0, z || 0); holder.rotation.y = ry || 0;
      (parent || root).add(holder);
      loadModel(name).then(function(src){
        if (!src) return;
        var obj = src.clone(true);
        obj.traverse(function(m){ if (m.isMesh){ m.castShadow = !!opts.cast; m.receiveShadow = true; } });
        var bb = new T.Box3().setFromObject(obj), s = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3());
        var k = size.h ? size.h / s.y : size.w ? size.w / s.x : size.d / s.z;
        obj.scale.setScalar(k);
        obj.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
        if (opts.anchor === 'top') obj.position.y = -bb.max.y * k;
        if (opts.anchor === 'center') obj.position.y = -c.y * k;
        if (opts.back) obj.position.z = -bb.min.z * k;
        holder.add(obj);
        holder.userData.size = s.multiplyScalar(k);
        if (opts.done) opts.done(holder, holder.userData.size, obj);
      });
      return holder;
    }

    // ---------- walls: coordinates along each wall --------------------------
    // u = position along the wall, local +z points into the room
    var o = 0.006;
    var WALLS = {
      back:  { ox: -10,     oz: -10 + o, rot: 0 },             // u = x + 10
      front: { ox: X1,      oz: 10 - o,  rot: Math.PI },       // u = X1 - x
      left:  { ox: -10 + o, oz: 10,      rot: Math.PI / 2 }    // u = 10 - z
    };
    function onWall(w, u, y){
      var W = WALLS[w], g = new T.Group();
      var dir = new T.Vector3(1, 0, 0).applyAxisAngle(Y_AXIS, W.rot);
      g.position.set(W.ox + dir.x * u, y, W.oz + dir.z * u);
      g.rotation.y = W.rot;
      root.add(g);
      return g;
    }

    // ---------- front wall: entrance door, radiators, umbrella stand ------------
    place('door', { h: 2.6 }, onWall('front', X1 + 1.3, 0), 0, 0, 0, 0, { back: true }).scale.z = 0.35;   // flatter against the wall
    place('radiator', { w: 1.3 }, onWall('front', X1 + 6.0, 0.06), 0, 0, 0.02, 0, { back: true });
    place('radiator', { w: 1.3 }, onWall('front', X1 - 1.6, 0.06), 0, 0, 0.02, 0, { back: true });
    addBox(-6, 9.85, 1.4, 0.25, 0.85); addBox(1.6, 9.85, 1.4, 0.25, 0.85);
    place('umbrellastand', { h: 0.85 }, null, -2.55, 0, 9.65, Math.PI, { cast: true });
    addBox(-2.55, 9.65, 0.35, 0.35, 0.6);

    // ---------- left wall: mounted pike and deer antlers -------------------------
    place('fish', { w: 1.05 }, onWall('left', 10 + 4.66, 2.4), 0, 0, 0, 0, { back: true, anchor: 'center' }).rotation.z = -0.03;
    place('antlers', { w: 0.8 }, onWall('left', 10 - 4.66, 2.7), 0, 0, 0, 0, { back: true, anchor: 'center' });

    // ---------- back wall: chalkboard, slot machine, fridge with the TV on top, plant, coat rack ----
    place('chalkboard', { w: 1.9 }, onWall('back', 10 - 3.5, 2.25), 0, 0, 0, 0, { back: true, anchor: 'center' });
    place('slotmachine', { h: 1.75 }, null, -0.85, 0, -10 + 0.03, 0, { back: true, cast: true });
    addBox(-0.85, -9.65, 0.75, 0.6, 1.75);
    place('fridge', { h: 1.95 }, null, 1.65, 0, -10 + 0.03, 0, { back: true, cast: true, done: function(h, s){
      place('crttv', { w: 0.62 }, h, 0, s.y, s.z / 2, -0.15, { cast: true });   // old TV standing on the fridge
    } });
    addBox(1.65, -9.62, 0.85, 0.7, 1.95);
    place('plant', { h: 1.75 }, null, -5.3, 0, -9.45, 0.4, { cast: true });
    addBox(-5.3, -9.45, 0.5, 0.5, 0.45);
    place('coatrack', { h: 1.9 }, null, -9.4, 0, -9.4, Math.PI * 0.25, { cast: true });
    addBox(-9.4, -9.4, 0.5, 0.5, 1.9);

    // ---------- floor: wet floor sign, beer crates ---------------------------
    place('wetsign', { h: 0.65 }, null, 1.05, 0, 7.6, 0.5, { cast: true });
    addBox(1.05, 7.6, 0.4, 0.35, 0.65);
    place('crates', { h: 0.95 }, null, 3.1, 0, 9.45, -Math.PI / 2, { cast: true });
    addBox(3.1, 9.45, 0.5, 0.5, 0.95);

    // ---------- ceiling: lamps over the tables (with their light), ceiling fan ----
    [[-7.5, -7, 'lamp_enamel'], [-7.5, -2.33, 'lamp_tiffany'], [-7.5, 2.33, 'lamp_drum'], [-7.5, 7, 'lamp_enamel']].forEach(function(p, i){
      var lamp = place(p[2], { w: p[2] === 'lamp_tiffany' ? 0.55 : 0.48 }, null, p[0], H, p[1], i * 0.7, { anchor: 'top', done: function(h, s){
        h.traverse(function(m){ if (m.isMesh && m.material){ m.material = m.material.clone(); m.material.emissive = new T.Color(1, 0.8, 0.55); m.material.emissiveIntensity = 0.18; if (m.material.map) m.material.emissiveMap = m.material.map; } });
        light.position.y = H - s.y + 0.05;
      } });
      var light = new T.PointLight(0xffc98a, 0.95, 6.5, 2);
      light.position.set(p[0], H - 0.6, p[1]); root.add(light);
    });
    (function(){
      var g = new T.Group(); g.position.set(-3.2, H, 0.2); root.add(g);
      var spin = place('ceilingfan', { w: 1.5 }, g, 0, 0, 0, 0, { anchor: 'top' });
      updaters.push(function(dt, time){ spin.rotation.y += dt * 2.6; g.rotation.x = Math.sin(time * 2.6) * 0.012; g.rotation.z = Math.cos(time * 2.6) * 0.012; });
    })();

    // ---------- bar: cash register, trophies, porcelain dog (once the bar is loaded) ----
    var barDone = false;
    function dressBar(){
      var bar = scene.getObjectByName('bar');
      if (!bar) return;
      barDone = true;
      // top from the bounding box (raycasting doesn't decode the compressed vertex data in three.js r128)
      var top = new T.Box3().setFromObject(bar).max.y;
      if (!(top > 0.5 && top < 3)) top = 1.47;
      var x = PART.x - 0.3;
      place('register', { w: 0.45 }, null, x, top, -3.9, -Math.PI / 2 - 0.25, { cast: true });
      place('trophies', { w: 0.34 }, null, x, top, 1.2, -Math.PI / 2 + 0.2, { cast: true });
      place('dogfigure', { h: 0.22 }, null, x, top, 3.6, -Math.PI / 2 - 0.5, { cast: true });
    }

    // ---------- tables: condiment caddy, candle in a bottle on two of them ------
    function dressTable(table, spot, size, i){
      var y = size.y;
      place('condiments', { w: 0.3 }, null, spot[0] - 0.12, y, spot[1], [0.2, -0.3, 1.4, 3.0][i % 4], { cast: true });
      if (i === 0 || i === 2) place('candlebottle', { h: 0.4 }, null, spot[0] + 0.28, y, spot[1] + 0.01, 0, {});
    }

    function update(dt, time){
      if (!barDone) dressBar();
      for (var i = 0; i < updaters.length; i++) updaters[i](dt, time);
    }

    return { dressTable: dressTable, update: update, root: root };
  }

  window.HotPotDecor = { build: build };
})();
