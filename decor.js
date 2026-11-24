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
    var optionalModels = {};
    function loadModel(name){
      if (!modelCache[name]){
        modelCache[name] = fetch('models/d_' + name + '.glb')
          .then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function(buf){ return new Promise(function(res, rej){ gltf.parse(buf, '', function(g){ res(g.scene); }, rej); }); })
          .catch(function(e){ if (!optionalModels[name]) console.error('Could not load model ' + name + ':', e); return null; });
      }
      return modelCache[name];
    }
    // runs fn only if the model file exists (for models that are not made yet)
    function ifModel(name, fn){
      optionalModels[name] = true;
      loadModel(name).then(function(src){ if (src) fn(); });
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
    // The door hangs in a pivot at its hinge side and swings into the room; behind it is
    // the doorway with the daylight outside. entrance.target: 0 = shut, 1 = open.
    var doorWall = onWall('front', X1 + 1.3, 0), doorPivot = new T.Group();
    doorWall.add(doorPivot);
    var entrance = { open: 0, target: 0, pivot: doorPivot };
    place('door', { h: 2.6 }, doorPivot, 0, 0, 0, 0, { back: true, done: function(holder, size){
      doorPivot.position.x = -size.x / 2; holder.position.x = size.x / 2;   // hinges at the side away from the handle
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
      var g = cv.getContext('2d'), sky = g.createLinearGradient(0, 0, 0, 78);
      sky.addColorStop(0, '#bcdcff'); sky.addColorStop(1, '#f1f7fc');
      g.fillStyle = sky; g.fillRect(0, 0, 64, 78);
      g.fillStyle = '#c9c1b2'; g.fillRect(0, 70, 64, 10);                    // a wall across the street
      var ground = g.createLinearGradient(0, 80, 0, 128);
      ground.addColorStop(0, '#b3ab9d'); ground.addColorStop(1, '#8f887c');
      g.fillStyle = ground; g.fillRect(0, 80, 64, 48);
      var tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      var way = new T.Mesh(new T.PlaneGeometry(size.x * 0.84, size.y * 0.94), new T.MeshBasicMaterial({ map: tex }));
      way.position.set(0, size.y * 0.47, 0.006); doorWall.add(way);
    } }).scale.z = 0.35;   // flatter against the wall
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

    var office = { chair: null, screen: null, room: null, desk: null };   // what the game needs of the office: the swivel chair, the monitor's screen
    // ---------- back rooms behind the kitchen: corridor, office, storeroom, cleaning closet ----
    (function(){
      var B = ctx.BACKROOMS;
      if (!B) return;
      var x0 = B.x0, x1 = B.x1, zm = B.zMid, z1 = B.z1, z0 = -10;
      var texLoader = new T.TextureLoader(), aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
      function tex(url, normal){
        var t = texLoader.load(url); if (!normal) t.encoding = T.sRGBEncoding;
        t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; return t;
      }
      // materials: the plaster walls and the ceiling of the guest room, the kitchen's
      // slate floor and tiles, its dark planks as the office floor and for skirting boards / door frames
      var plasterTex = tex('textures/plaster.webp'), plasterNrm = tex('textures/plaster_n.webp', true);
      [plasterTex, plasterNrm].forEach(function(t){ t.wrapS = t.wrapT = T.MirroredRepeatWrapping; });
      var woodTex = tex('textures/k_wood.webp');
      var trim = std({ map: woodTex, roughness: 0.6, color: new T.Color().setScalar(0.55) });
      var M = {
        plaster: { mat: std({ map: plasterTex, normalMap: plasterNrm, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.9, color: new T.Color().setScalar(0.7), side: T.DoubleSide }), tu: 1.6, tv: 1.6 },
        tile: { mat: std({ map: tex('textures/k_wall.webp'), roughness: 0.4, color: new T.Color().setScalar(0.78), side: T.DoubleSide }), tu: 1.2, tv: 1.2 },
        slate: { mat: std({ map: tex('textures/k_floor.webp'), roughness: 0.55, color: new T.Color().setScalar(0.9) }), tu: 1.6, tv: 1.6 },
        planks: { mat: std({ map: tex('textures/k_wood.webp'), roughness: 0.8, color: new T.Color().setScalar(0.85) }), tu: 2.0, tv: 2.0 },
        ceiling: { mat: std({ map: tex('textures/ceil_color.jpg'), normalMap: tex('textures/ceil_normal.jpg', true), roughness: 0.9, color: new T.Color(1.17, 1.08, 1.25) }), tu: 5, tv: 5 }
      };
      function std(o){ return new T.MeshStandardMaterial(o); }
      // a flat rectangle with its texture repeating every tu x tv metres (u0 / v0 continue the pattern)
      function quad(m, w, h, u0, v0){
        var g = new T.PlaneGeometry(w, h), uv = g.attributes.uv;
        for (var i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / m.tu, (v0 + uv.getY(i) * h) / m.tv);
        var mesh = new T.Mesh(g, m.mat); mesh.receiveShadow = true; mesh.castShadow = true; root.add(mesh); return mesh;
      }
      // a wall along x (at z) or along z (at x) from a to b, with openings [centre, width, height]
      function wall(along, at, a, b, m, doors){
        var pieces = [[a, b, 0, H]];
        (doors || []).forEach(function(d){
          var d0 = d[0] - d[1] / 2, d1 = d[0] + d[1] / 2, next = [];
          pieces.forEach(function(p){
            if (p[2] > 0 || d1 <= p[0] || d0 >= p[1]){ next.push(p); return; }
            if (d0 > p[0]) next.push([p[0], d0, 0, H]);
            next.push([d0, d1, d[2], H]);                    // above the opening
            if (d1 < p[1]) next.push([d1, p[1], 0, H]);
          });
          pieces = next;
        });
        pieces.forEach(function(p){
          var q = quad(m, p[1] - p[0], p[3] - p[2], p[0], p[2]), c = (p[0] + p[1]) / 2, cy = (p[2] + p[3]) / 2;
          if (along === 'x'){ q.position.set(c, cy, at); }
          else { q.position.set(at, cy, c); q.rotation.y = Math.PI / 2; }
          if (p[2] === 0){
            if (along === 'x') addBox(c, at, p[1] - p[0], 0.12, H); else addBox(at, c, 0.12, p[1] - p[0], H);
            if (m !== M.tile) skirt(along, at, p[0], p[1], 0);   // skirting board on both sides
          }
        });
        // a wooden frame around each opening, as deep as a real wall, so the wall looks solid
        (doors || []).forEach(function(d){
          var d0 = d[0] - d[1] / 2, d1 = d[0] + d[1] / 2, fw = 0.09, fd = 0.26;
          [[d0 - fw / 2, d[2] / 2 + fw / 2, fw, d[2] + fw], [d1 + fw / 2, d[2] / 2 + fw / 2, fw, d[2] + fw], [d[0], d[2] + fw / 2, d[1] + 2 * fw, fw]].forEach(function(f){
            var b = along === 'x' ? new T.BoxGeometry(f[2], f[3], fd) : new T.BoxGeometry(fd, f[3], f[2]);
            var mesh = new T.Mesh(b, trim); mesh.castShadow = mesh.receiveShadow = true;
            if (along === 'x') mesh.position.set(f[0], f[1], at); else mesh.position.set(at, f[1], f[0]);
            root.add(mesh);
          });
        });
      }
      // skirting board along a wall from a to b; side 0 = both sides of a free-standing wall,
      // +1 / -1 = only on that side (for outer walls)
      function skirt(along, at, a, b, side){
        var len = b - a, c = (a + b) / 2, d = side ? 0.025 : 0.05, off = side * 0.0125;
        var g = along === 'x' ? new T.BoxGeometry(len, 0.12, d) : new T.BoxGeometry(d, 0.12, len);
        var mesh = new T.Mesh(g, trim); mesh.receiveShadow = true;
        if (along === 'x') mesh.position.set(c, 0.06, at + off); else mesh.position.set(at + off, 0.06, c);
        root.add(mesh);
      }
      // skirting boards in the guest room (outer walls and the guest side of the partition)
      var KDOOR0 = PART.door.z - PART.door.w / 2, KDOOR1 = PART.door.z + PART.door.w / 2;
      skirt('x', -10, -10, X1, 1);                                     // back wall
      skirt('x', 10, -10, -2.05, -1); skirt('x', 10, -0.55, X1, -1);   // front wall, around the entrance door
      skirt('z', -10, -10, 10, 1);                                     // left wall
      skirt('z', X1, -10, KDOOR0 - 0.16, -1); skirt('z', X1, KDOOR1 + 0.16, PART.pieces[1][1], -1); skirt('z', X1, PART.pieces[0][0], 10, -1);
      function floor(m, ax, bx, az, bz, y, down){
        var q = quad(m, bx - ax, bz - az, ax, az);
        q.rotation.x = down ? Math.PI / 2 : -Math.PI / 2; q.position.set((ax + bx) / 2, y, (az + bz) / 2);
        q.castShadow = false;
        return q;
      }
      var xo = 6.5, xs = 9.3;                                 // room dividers: office | storeroom | closet
      var doorO = (x0 + xo) / 2, doorS = (xo + xs) / 2, doorC = (xs + x1) / 2;
      // floors and ceilings
      floor(M.slate, x0, x1, zm, z0 + 0.0001, 0.002);         // corridor
      floor(M.planks, x0, xo, z1, zm, 0.002);                 // office
      floor(M.slate, xo, xs, z1, zm, 0.002);                  // storeroom
      floor(M.slate, xs, x1, z1, zm, 0.002);                  // closet
      floor(M.ceiling, x0, x1, z1, z0, H - 0.002, true);
      // walls
      var kd = B.door;
      wall('x', z0 - 0.01, x0, x1, M.plaster, [[kd.x, kd.w, kd.h]]);          // corridor side of the kitchen wall
      wall('z', x0, z1, z0, M.plaster);                                          // west end
      wall('z', x1, z1, z0, M.plaster);                                          // east end
      wall('x', zm, x0, x1, M.plaster, [[doorO, 1.0, 2.4], [doorS, 1.0, 2.4], [doorC, 1.0, 2.4]]);
      wall('z', xo, z1, zm, M.plaster);                                          // office | storeroom
      wall('z', xs, z1, zm, M.plaster);                                          // storeroom | closet
      wall('x', z1, x0, x1, M.plaster);                                          // far wall
      // the cleaning closet gets tiles in front of its plaster walls
      wall('x', z1 + 0.005, xs + 0.005, x1 - 0.005, M.tile);
      wall('z', x1 - 0.005, z1 + 0.005, zm - 0.005, M.tile);
      // ceiling lamps (Meshy) with their light
      [[(x0 + x1) / 2 - 1.5, (z0 + zm) / 2, 'lamp_enamel'], [doorO, (zm + z1) / 2, 'lamp_drum'],
       [doorS, (zm + z1) / 2, 'lamp_enamel'], [doorC, (zm + z1) / 2, 'lamp_enamel']].forEach(function(p){
        place(p[2], { w: 0.42 }, null, p[0], H, p[1], 0, { anchor: 'top', done: function(h){
          h.traverse(function(m){ if (m.isMesh && m.material){ m.material = m.material.clone(); m.material.emissive = new T.Color(1, 0.8, 0.55); m.material.emissiveIntensity = 0.18; if (m.material.map) m.material.emissiveMap = m.material.map; } });
        } });
        var l = new T.PointLight(0xffd29a, 0.9, 6, 2); l.position.set(p[0], H - 0.7, p[1]); root.add(l);
      });

      // office: desk with the computer against the far wall, chair, filing cabinet, bookshelf
      place('office_desk', { w: 1.9 }, null, doorO, 0, z1 + 0.03, 0, { back: true, cast: true, done: function(holder, size){
        // The monitor is switched on: a picture of the back-office program on its screen.
        // (where the screen is was measured on the model, as shares of its size)
        var cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
        var g = cv.getContext('2d'), i, sw = size.x * 0.572 * 0.955, sh = size.y * 0.341 * 0.92, wide = sw / sh / (512 / 288);
        g.fillStyle = '#4a2e1a'; g.fillRect(0, 0, 512, 288);                      // dark wood
        g.fillStyle = 'rgba(0,0,0,.2)'; for (i = 0; i < 9; i++) g.fillRect(i * 58 + 20, 0, 2, 288);   // its planks
        g.fillStyle = 'rgba(14,8,4,.5)'; g.fillRect(0, 0, 104, 288);              // the side
        g.fillStyle = '#f4ead2'; g.beginPath(); g.ellipse(20, 20, 9 / wide, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillRect(36, 13, 52, 6); g.fillRect(8, 50, 96, 22);                     // the program's name, the page that is open
        g.fillStyle = '#b79c74'; g.fillRect(36, 23, 34, 4); g.fillRect(14, 84, 62, 6); g.fillRect(14, 262, 44, 6);
        g.fillStyle = '#4a3626'; g.fillRect(20, 58, 50, 6);
        g.fillStyle = '#f4ead2'; g.fillRect(116, 9, 86, 10);                      // the page's name
        g.fillStyle = '#b79c74'; g.fillRect(116, 24, 110, 4);
        g.fillStyle = 'rgba(15,12,10,.6)'; g.fillRect(376, 9, 76, 15); g.fillRect(458, 9, 44, 15);   // the day, the till
        for (i = 0; i < 4; i++){                                                 // four things to order, each on its slip of paper
          var y = 42 + i * 61;
          g.fillStyle = '#f4ead2'; g.fillRect(116, y, 232, 53);
          g.fillStyle = '#e9dab6'; g.beginPath(); g.ellipse(142, y + 26, 19 / wide, 19, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = ['#d98a3a', '#ee7a2a', '#e39a3c', '#fbf6e6'][i]; g.beginPath(); g.ellipse(142, y + 26, 11 / wide, 11, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4a3626'; g.fillRect(170, y + 11, 56, 7);
          g.fillStyle = '#d8c7a2'; g.fillRect(170, y + 25, 110, 6);
          g.fillStyle = '#c9641f'; g.fillRect(170, y + 25, [56, 92, 92, 96][i], 6);
          g.fillStyle = '#b79c74'; g.fillRect(170, y + 37, 70, 4);
          g.strokeStyle = '#4a3626'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(302, y + 26, 7 / wide, 7, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(332, y + 26, 7 / wide, 7, 0, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = '#f4ead2'; g.fillRect(358, 42, 144, 126); g.fillRect(358, 178, 144, 98);   // the order, the deliveries
        g.fillStyle = '#b79c74'; g.fillRect(368, 70, 110, 3); g.fillRect(368, 82, 96, 3); g.fillRect(368, 206, 100, 3);
        g.fillStyle = '#4a3626'; g.fillRect(368, 52, 62, 6); g.fillRect(368, 102, 34, 7); g.fillRect(462, 102, 30, 7); g.fillRect(368, 126, 124, 26); g.fillRect(368, 188, 66, 6);
        g.fillStyle = '#3f8a2c'; g.fillRect(368, 222, 70, 5);
        var tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
        var scr = new T.Mesh(new T.PlaneGeometry(sw, sh), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        scr.position.set(size.x * 0.0523, size.y * (0.659 + 0.341 / 2), size.z * 0.306 + 0.004);
        holder.add(scr);
        holder.updateMatrixWorld(true);
        office.screen = scr.getWorldPosition(new T.Vector3());   // where the chef looks when he sits at the desk
        // the desk's top (measured on the model: the front edge of the top at 0.585 of its height), for his hands
        office.table = { x: doorO, z: z1 + 0.03 + size.z / 2, halfZ: size.z / 2, top: size.y * 0.585 };
      } });
      addBox(doorO, z1 + 0.62, 1.9, 1.18, 1.05);
      // The chef's swivel chair (Meshy): low and wide, without armrests, as his short legs and wide hips need
      // it. It stands a little askew and turns when he sits down (index.html). seat / back: its seat's
      // height and where the backrest begins, as shares of its height and depth (measured on the model);
      // box: half the width of its obstacle.
      var chairX = doorO, chairZ = z1 + 1.82;
      office.chair = { holder: place('chef_chair', { h: 0.6 }, null, chairX, 0, chairZ, Math.PI + 0.3, { cast: true }),
                       x: chairX, z: chairZ, rest: Math.PI + 0.3, face: Math.PI, seat: 0.74, back: 0.28, box: 0.3 };
      addBox(chairX, chairZ - 0.12, 0.6, 0.6, 0.5);   // (where the empty chair stands, pushed in: see CHEF_SEAT.tuck in index.html)
      office.room = { x0: x0, x1: xo, z0: z1, z1: zm };   // the office's floor (he sits down only from inside it)
      office.desk = { x: doorO, z: z1 + 1.25 };           // in front of the desk
      place('filing_cabinet', { h: 1.35 }, null, x0 + 0.03, 0, zm - 0.45, Math.PI / 2, { back: true, cast: true });
      addBox(x0 + 0.35, zm - 0.45, 0.7, 0.5, 1.35);   // (by the door: the chef walks past it to pull out his chair)
      place('office_shelf', { h: 1.8 }, null, xo - 0.03, 0, z1 + 1.9, -Math.PI / 2, { back: true, cast: true });
      addBox(xo - 0.2, z1 + 1.9, 0.4, 1.0, 1.8);
      // storeroom: big rack at the back, sacks, boxes, a pallet of water
      place('storage_rack', { w: 1.7 }, null, doorS, 0, z1 + 0.03, 0, { back: true, cast: true });
      addBox(doorS, z1 + 0.35, 1.7, 0.7, 2.2);
      place('boxes', { h: 1.2 }, null, xs - 0.03, 0, zm - 1.0, -Math.PI / 2, { back: true, cast: true });
      addBox(xs - 0.45, zm - 1.0, 0.9, 0.9, 1.2);
      // these appear as soon as their Meshy models exist (models/d_<name>.glb)
      ifModel('sacks', function(){
        place('sacks', { w: 1.0 }, null, xo + 0.03, 0, z1 + 1.9, Math.PI / 2, { back: true, cast: true });
        addBox(xo + 0.55, z1 + 1.9, 1.0, 1.0, 0.9);
      });
      ifModel('water_pallet', function(){
        place('water_pallet', { w: 0.9 }, null, xs - 0.55, 0, z1 + 1.55, -0.2, { cast: true });
        addBox(xs - 0.55, z1 + 1.55, 0.9, 0.9, 0.8);
      });
      // cleaning closet: shelf with supplies, utility sink, mop bucket, brooms
      ifModel('cleaning_shelf', function(){
        place('cleaning_shelf', { w: 1.1 }, null, doorC, 0, z1 + 0.03, 0, { back: true, cast: true });
        addBox(doorC, z1 + 0.25, 1.1, 0.5, 1.8);
      });
      ifModel('utility_sink', function(){
        place('utility_sink', { w: 0.75 }, null, x1 - 0.03, 0, zm - 1.4, -Math.PI / 2, { back: true, cast: true });
        addBox(x1 - 0.3, zm - 1.4, 0.6, 0.8, 0.9);
      });
      ifModel('mop_bucket', function(){
        place('mop_bucket', { h: 1.2 }, null, xs + 0.45, 0, z1 + 1.2, 0.6, { cast: true });
        addBox(xs + 0.45, z1 + 1.2, 0.55, 0.55, 0.5);
      });
      ifModel('brooms', function(){
        place('brooms', { h: 1.5 }, null, xs + 0.03, 0, zm - 0.7, Math.PI / 2, { back: true, cast: true });
        addBox(xs + 0.2, zm - 0.7, 0.35, 0.5, 1.5);
      });
    })();

    // ---------- tables: condiment caddy, candle in a bottle on two of them ------
    function dressTable(table, spot, size, i){
      var y = size.y;
      place('condiments', { w: 0.3 }, null, spot[0] - 0.12, y, spot[1], [0.2, -0.3, 1.4, 3.0][i % 4], { cast: true });
      if (i === 0 || i === 2) place('candlebottle', { h: 0.4 }, null, spot[0] + 0.28, y, spot[1] + 0.01, 0, {});
    }

    function update(dt, time){
      if (!barDone) dressBar();
      for (var i = 0; i < updaters.length; i++) updaters[i](dt, time);
      // the entrance door swings open and shut
      entrance.open += (entrance.target - entrance.open) * Math.min(1, dt * 4);
      doorPivot.rotation.y = -1.5 * entrance.open;
    }

    return { dressTable: dressTable, update: update, root: root, entrance: entrance, office: office };
  }

  window.HotPotDecor = { build: build };
})();
