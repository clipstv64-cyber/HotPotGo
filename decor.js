// Furnishing of the guest room: a slightly run-down, odd but perfectly normal
// restaurant (pub / diner). Furniture and props are Meshy models (made from
// ChatGPT reference images, see art/), pictures and wall textures are ChatGPT
// images; small things (signs, posters, lights) are drawn on canvases here.
//
// Guest room: x from -10 to the partition (PARTITION.x - thickness / 2), z from -10 to 10.
// Used from index.html:
//   decor = HotPotDecor.build({ scene, renderer, addBox, WALL_HEIGHT, PARTITION })
//   decor.dressTable(tableObj, spot, tableSize, index)   // when the tables are placed
//   decor.dressChair(chairObj, index)                    // when the chairs are placed
//   decor.update(delta, time)                            // every frame
(function(){
  'use strict';
  var T = THREE;
  var Y_AXIS = new T.Vector3(0, 1, 0);

  // repeatable randomness (same result on every start)
  function rng(seed){
    return function(){
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function build(ctx){
    var scene = ctx.scene, renderer = ctx.renderer, addBox = ctx.addBox, H = ctx.WALL_HEIGHT;
    var PART = ctx.PARTITION, X1 = PART.x - PART.thickness / 2;   // guest side of the partition
    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var R = rng(1987);
    var updaters = [];
    var root = new T.Group(); root.name = 'decor'; scene.add(root);
    var texLoader = new T.TextureLoader();

    // ---------- helpers ----------------------------------------------------
    function C(hex){ return new T.Color(hex).convertSRGBToLinear(); }
    function rnd(a, b){ return a + (b - a) * R(); }
    function pick(arr){ return arr[Math.floor(R() * arr.length)]; }
    function canvas(w, h, draw){
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h); return c;
    }
    function ctex(c, opts){
      opts = opts || {};
      var t = new T.CanvasTexture(c);
      if (!opts.linear) t.encoding = T.sRGBEncoding;
      t.anisotropy = aniso;
      if (opts.repeat){ t.wrapS = t.wrapT = T.RepeatWrapping; }
      return t;
    }
    function ftex(url, repeat){
      var t = texLoader.load(url);
      t.encoding = T.sRGBEncoding; t.anisotropy = aniso;
      if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    }
    function std(o){ return new T.MeshStandardMaterial(o); }
    function basic(o){ return new T.MeshBasicMaterial(o); }
    function mesh(parent, geo, mat, x, y, z, rx, ry, rz){
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.receiveShadow = true;
      (parent || root).add(m);
      return m;
    }
    function box(parent, w, h, d, mat, x, y, z, rx, ry, rz){ return mesh(parent, new T.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
    function cyl(parent, rt, rb, h, seg, mat, x, y, z, rx, ry, rz, open){
      return mesh(parent, new T.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open), mat, x, y, z, rx, ry, rz);
    }
    function font(px, family, weight){ return (weight || '') + ' ' + px + 'px ' + (family || 'Arial, sans-serif'); }
    var HAND = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
    function noise(g, w, h, n, dark, light){
      for (var i = 0; i < n; i++){
        g.fillStyle = R() < 0.5 ? dark : light;
        g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
      }
    }
    // a flat picture (canvas or texture) as a plane
    function picture(parent, w, h, src, opts){
      opts = opts || {};
      var t = src.isTexture ? src : ctex(src);
      var mat = opts.glow ? basic({ map: t, transparent: !!opts.alpha, depthWrite: !opts.alpha })
                          : std({ map: t, roughness: opts.rough !== undefined ? opts.rough : 0.8, metalness: 0,
                                  transparent: !!opts.alpha, alphaTest: opts.alpha ? 0.05 : 0, side: opts.double ? T.DoubleSide : T.FrontSide });
      return mesh(parent, new T.PlaneGeometry(w, h), mat, opts.x || 0, opts.y || 0, opts.z || 0, opts.rx || 0, opts.ry || 0, opts.rz || 0);
    }

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
      left:  { ox: -10 + o, oz: 10,      rot: Math.PI / 2 },   // u = 10 - z
      part:  { ox: X1 - o,  oz: -10,     rot: -Math.PI / 2 }   // u = z + 10
    };
    function onWall(w, u, y, d){
      var W = WALLS[w], g = new T.Group();
      var dir = new T.Vector3(1, 0, 0).applyAxisAngle(Y_AXIS, W.rot);
      var nrm = new T.Vector3(0, 0, 1).applyAxisAngle(Y_AXIS, W.rot);
      d = d || 0;
      g.position.set(W.ox + dir.x * u + nrm.x * d, y, W.oz + dir.z * u + nrm.z * d);
      g.rotation.y = W.rot;
      root.add(g);
      return g;
    }

    // 1970s wallpaper (ChatGPT texture), yellowed from smoke towards the ceiling
    var WP_TILE = 1.0;
    var wpMat = std({ map: ftex('textures/d_wallpaper.webp', true), roughness: 0.93, metalness: 0, vertexColors: true, color: new T.Color(0.62, 0.6, 0.58) });
    // dark wooden wainscoting below (ChatGPT texture)
    var WAIN_H = 1.1, WAIN_TILE = 1.1;
    var wainMat = std({ map: ftex('textures/d_wainscot.webp', true), roughness: 0.5, metalness: 0, color: new T.Color(0.85, 0.85, 0.85) });
    var trimMat = std({ color: C('#3d2214'), roughness: 0.45, metalness: 0 });
    var crownMat = std({ color: C('#e6dcc4'), roughness: 0.8, metalness: 0 });

    // one stretch of wall from u0 to u1: wallpaper, below it wainscoting with trims.
    // gaps: openings down to the floor (doors), no wainscoting there
    function wallRun(w, u0, u1, opts){
      opts = opts || {};
      var len = u1 - u0, y0 = opts.y0 || 0;
      var from = y0 > 0 ? y0 : WAIN_H, hh = H - from;
      var g = onWall(w, (u0 + u1) / 2, from + hh / 2, 0.002);
      var geo = new T.PlaneGeometry(len, hh, 1, 8), uv = geo.attributes.uv, pos = geo.attributes.position;
      var colors = new Float32Array(pos.count * 3), tint = 0.96 + R() * 0.06;
      for (var i = 0; i < pos.count; i++){
        uv.setXY(i, (u0 + uv.getX(i) * len) / WP_TILE, (from + uv.getY(i) * hh) / WP_TILE);
        var wy = from + hh / 2 + pos.getY(i);
        var f = Math.max(0, Math.min(1, (wy - 2.4) / 1.6));
        f = f * f * 0.45;
        colors[3 * i] = tint * (1 - 0.12 * f); colors[3 * i + 1] = tint * (1 - 0.22 * f); colors[3 * i + 2] = tint * (1 - 0.48 * f);
      }
      geo.setAttribute('color', new T.BufferAttribute(colors, 3));
      mesh(g, geo, wpMat);
      box(onWall(w, (u0 + u1) / 2, H - 0.045, 0.035), len, 0.09, 0.07, crownMat);   // cornice
      if (y0 > 0) return;
      var pieces = [[u0, u1]];
      (opts.gaps || []).forEach(function(gp){
        var next = [];
        pieces.forEach(function(p){
          if (gp[1] <= p[0] || gp[0] >= p[1]) { next.push(p); return; }
          if (gp[0] > p[0]) next.push([p[0], gp[0]]);
          if (gp[1] < p[1]) next.push([gp[1], p[1]]);
        });
        pieces = next;
      });
      pieces.forEach(function(p){
        var l = p[1] - p[0], c = (p[0] + p[1]) / 2;
        var pg = new T.PlaneGeometry(l, WAIN_H), puv = pg.attributes.uv;
        for (var i = 0; i < puv.count; i++) puv.setXY(i, (p[0] + puv.getX(i) * l) / WAIN_TILE, puv.getY(i));
        mesh(onWall(w, c, WAIN_H / 2, 0.012), pg, wainMat);
        box(onWall(w, c, 0.07, 0.03), l, 0.14, 0.035, trimMat);        // skirting board
        box(onWall(w, c, WAIN_H, 0.035), l, 0.055, 0.05, trimMat);     // dado rail
      });
    }

    // entrance door and windows in the front wall (z = 10), kitchen door in the partition
    var DOOR_U = X1 + 1.3, DOOR_W = 1.4, DOOR_H = 2.6;                // entrance door at x = -1.3
    var WIN = [{ u: X1 + 6.0, w: 2.0 }, { u: X1 - 1.6, w: 1.8 }];   // windows at x = -6 and x = 1.6
    wallRun('back', 0, X1 + 10);
    wallRun('front', 0, X1 + 10, { gaps: [[DOOR_U - DOOR_W / 2 - 0.1, DOOR_U + DOOR_W / 2 + 0.1]] });
    wallRun('left', 0, 20);
    var KD = PART.door, kd0 = KD.z - KD.w / 2 + 10 - 0.16, kd1 = KD.z + KD.w / 2 + 10 + 0.16;
    wallRun('part', 0, kd0);
    wallRun('part', kd0, kd1, { y0: KD.h + 0.16 });
    wallRun('part', kd1, PART.pieces[1][1] + 10);
    wallRun('part', PART.pieces[0][0] + 10, 20);

    // ---------- the view outside (windows) -----------------------------------
    var outside = canvas(1024, 512, function(g, w, h){
      var sky = g.createLinearGradient(0, 0, 0, h * 0.5);
      sky.addColorStop(0, '#aebfd2'); sky.addColorStop(1, '#e4e8e2');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      var houses = [['#8e5a48', 0, 300], ['#c9b68f', 300, 260], ['#7a7f86', 560, 230], ['#a8634e', 790, 234]];
      houses.forEach(function(hs, i){
        var top = 40 + i * 13 % 50;
        g.fillStyle = hs[0]; g.fillRect(hs[1], top, hs[2], h);
        for (var yy = top + 30; yy < h * 0.68; yy += 70) for (var xx = hs[1] + 25; xx < hs[1] + hs[2] - 40; xx += 62){
          g.fillStyle = '#3e4a58'; g.fillRect(xx, yy, 34, 46);
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(xx + 3, yy + 3, 12, 40);
          g.strokeStyle = '#e8e2d6'; g.lineWidth = 3; g.strokeRect(xx, yy, 34, 46);
        }
      });
      g.fillStyle = '#2f4f3a'; g.fillRect(330, h * 0.5, 200, 36);
      g.fillStyle = '#f2e8c8'; g.font = font(26, 'Georgia, serif', 'bold'); g.textAlign = 'center'; g.fillText('BAKERY', 430, h * 0.5 + 27);
      g.fillStyle = '#8d8a84'; g.fillRect(0, h * 0.72, w, h * 0.08);
      g.fillStyle = '#4b4b4d'; g.fillRect(0, h * 0.8, w, h * 0.2);
      g.fillStyle = '#2b2b2b'; g.fillRect(700, h * 0.25, 7, h * 0.5); g.fillRect(680, h * 0.25, 40, 10);
      g.fillStyle = '#7d2a26'; g.beginPath(); g.moveTo(120, h * 0.9); g.lineTo(140, h * 0.8); g.lineTo(200, h * 0.76); g.lineTo(300, h * 0.76);
      g.lineTo(340, h * 0.82); g.lineTo(380, h * 0.84); g.lineTo(380, h * 0.92); g.lineTo(120, h * 0.92); g.fill();
      g.fillStyle = '#1b1b1b'; [170, 330].forEach(function(x){ g.beginPath(); g.arc(x, h * 0.92, 18, 0, Math.PI * 2); g.fill(); });
      var copy = document.createElement('canvas'); copy.width = w; copy.height = h;
      copy.getContext('2d').drawImage(g.canvas, 0, 0);
      g.filter = 'blur(3px)'; g.drawImage(copy, 0, 0); g.filter = 'none';
      g.fillStyle = 'rgba(235, 228, 205, 0.18)'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 1500, 'rgba(90,80,60,0.15)', 'rgba(255,255,255,0.08)');
    });
    var glassMat = basic({ map: ctex(outside), color: new T.Color(0.92, 0.92, 0.9) });
    function glass(parent, w, h, u0, u1, v0, v1, x, y, z){
      var geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      return mesh(parent, geo, glassMat, x, y, z);
    }

    // ---------- entrance door (Meshy), bell, doormat, umbrella stand ----------
    (function(){
      var g = onWall('front', DOOR_U, 0, 0);
      place('door', { h: DOOR_H }, g, 0, 0, 0, 0, { back: true }).scale.z = 0.35;   // flatter against the wall
      var brass = std({ color: C('#c8a04a'), roughness: 0.3, metalness: 0.9 });
      box(g, 0.03, 0.03, 0.2, brass, DOOR_W / 2 - 0.2, DOOR_H + 0.05, 0.1);
      mesh(g, new T.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, DOOR_W / 2 - 0.2, DOOR_H - 0.04, 0.2);
      // opening hours sticker on the glass
      picture(g, 0.24, 0.3, canvas(256, 330, function(c, w, h){
        c.fillStyle = 'rgba(250,250,245,0.92)'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#222'; c.textAlign = 'center'; c.font = font(28, 'Arial', 'bold'); c.fillText('Opening hours', w / 2, 42);
        c.font = font(22, 'Arial'); ['Mon – Sat  11 am – 11 pm', 'Sun  12 – 10 pm', 'Tue  closed', '', '(usually)'].forEach(function(s, i){ c.fillText(s, w / 2, 92 + i * 42); });
      }), { x: -0.3, y: 1.35, z: 0.1, rz: 0.03 });
      // doormat
      picture(null, 1.2, 0.65, canvas(512, 280, function(c, w, h){
        c.fillStyle = '#6e4b2c'; c.fillRect(0, 0, w, h);
        noise(c, w, h, 9000, 'rgba(40,25,10,0.35)', 'rgba(170,130,80,0.25)');
        c.fillStyle = 'rgba(30,18,8,0.55)'; c.font = font(72, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('WELCOME', w / 2, h / 2 + 24);
        c.fillStyle = 'rgba(110,80,50,0.5)'; c.fillRect(w * 0.3, h * 0.35, w * 0.25, h * 0.3);   // worn patch
      }), { x: -1.3, y: 0.012, z: 9.4, rx: -Math.PI / 2, rz: 0.05, rough: 1 });
      place('umbrellastand', { h: 0.85 }, null, -2.55, 0, 9.65, Math.PI, { cast: true });
      addBox(-2.55, 9.65, 0.35, 0.35, 0.6);
    })();

    // ---------- windows with blinds, sills and radiators (Meshy) -------------
    var frameMat = std({ color: C('#ebe6d8'), roughness: 0.65, metalness: 0 });
    var blindMat = std({ color: C('#e3dccb'), roughness: 0.5, metalness: 0.2, side: T.DoubleSide });
    WIN.forEach(function(wn, wi){
      var g = onWall('front', wn.u, 0, 0), W = wn.w, y0 = 1.3, y1 = 2.95, hh = y1 - y0, cy = (y0 + y1) / 2;
      glass(g, W, hh, wi * 0.48, wi * 0.48 + 0.5 * W / 2, 0.15, 0.95, 0, cy, 0.004);
      box(g, W + 0.16, 0.08, 0.08, frameMat, 0, y1 + 0.04, 0.04);
      box(g, W + 0.16, 0.08, 0.08, frameMat, 0, y0 - 0.04, 0.04);
      box(g, 0.08, hh, 0.08, frameMat, -W / 2 - 0.04, cy, 0.04);
      box(g, 0.08, hh, 0.08, frameMat, W / 2 + 0.04, cy, 0.04);
      box(g, 0.05, hh, 0.06, frameMat, 0, cy, 0.03);
      box(g, W + 0.3, 0.04, 0.22, frameMat, 0, y0 - 0.06, 0.11);            // window sill
      // blind: half down and crooked, one slat hanging out
      var bl = new T.Group(); bl.position.set(0, 0, 0.1); bl.rotation.z = wi ? -0.025 : 0.03; g.add(bl);
      box(bl, W + 0.04, 0.05, 0.06, blindMat, 0, y1 - 0.02, 0);
      var bottom = wi ? 2.2 : 2.45;
      for (var s = y1 - 0.08; s > bottom; s -= 0.052){
        var broken = wi === 0 && Math.abs(s - 2.6) < 0.026;
        box(bl, W - 0.02, 0.004, 0.05, blindMat, broken ? 0.25 : 0, s - (broken ? 0.05 : 0), 0, broken ? 0.3 : 0.95, 0, broken ? -0.18 : 0).receiveShadow = false;
      }
      box(bl, W - 0.02, 0.02, 0.05, blindMat, 0, bottom, 0);
      cyl(bl, 0.003, 0.003, y1 - bottom + 0.5, 4, blindMat, W / 2 - 0.12, (y1 + bottom - 0.5) / 2, 0.03);
      // radiator under the window
      place('radiator', { w: 1.3 }, g, 0, 0.06, 0.02, 0, { back: true });
      if (wi === 0){
        // dried-up plant on the sill and a note on the glass
        var pl = new T.Group(); pl.position.set(-0.55, y0 - 0.04, 0.12); g.add(pl);
        cyl(pl, 0.08, 0.06, 0.13, 12, std({ color: C('#b5603a'), roughness: 0.85 }), 0, 0.065, 0);
        var dry = std({ color: C('#8a6a3a'), roughness: 0.9, side: T.DoubleSide });
        for (var k = 0; k < 6; k++){
          var lf = mesh(pl, new T.PlaneGeometry(0.03, 0.2), dry, 0, 0.2, 0);
          lf.rotation.set(rnd(0.6, 1.6), k * 1.05, rnd(-0.3, 0.3)); lf.translateY(0.08);
        }
        picture(g, 0.24, 0.3, canvas(240, 300, function(c, w, h){
          c.fillStyle = '#fbf7e8'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a3d8a'; c.textAlign = 'center';
          c.font = font(34, HAND, 'bold'); c.fillText('Help', w / 2, 60); c.fillText('wanted!', w / 2, 102);
          c.font = font(21, HAND); c.fillText('Interested?', w / 2, 170); c.fillText('Just ask inside', w / 2, 200);
          c.fillStyle = 'rgba(240,230,170,0.7)'; c.fillRect(w / 2 - 30, 0, 60, 18);
        }), { x: 0.55, y: 2.0, z: 0.012, rz: -0.06 });
      } else {
        // neon OPEN sign in the window
        var neonC = canvas(512, 160, function(c, w, h){
          c.clearRect(0, 0, w, h);
          c.lineWidth = 7; c.strokeStyle = '#4fb6ff'; c.shadowColor = '#4fb6ff'; c.shadowBlur = 18;
          c.beginPath(); c.moveTo(30, 20); c.lineTo(w - 30, 20); c.arcTo(w - 12, 20, w - 12, 40, 18); c.lineTo(w - 12, h - 40);
          c.arcTo(w - 12, h - 20, w - 30, h - 20, 18); c.lineTo(30, h - 20); c.arcTo(12, h - 20, 12, h - 40, 18); c.lineTo(12, 40); c.arcTo(12, 20, 30, 20, 18); c.stroke();
          c.font = font(104, 'Arial Rounded MT Bold, Arial', 'bold'); c.textAlign = 'center'; c.lineWidth = 5;
          c.strokeStyle = '#ff3b3b'; c.shadowColor = '#ff2020'; c.shadowBlur = 22; c.strokeText('OPEN', w / 2, 118);
          c.fillStyle = 'rgba(255,170,170,0.9)'; c.shadowBlur = 0; c.fillText('OPEN', w / 2, 118);
        });
        var neonMat = basic({ map: ctex(neonC), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
        mesh(g, new T.PlaneGeometry(0.75, 0.24), neonMat, -0.42, 2.05, 0.035);
        cyl(g, 0.002, 0.002, 0.8, 3, blindMat, -0.76, 2.6, 0.035); cyl(g, 0.002, 0.002, 0.8, 3, blindMat, -0.08, 2.6, 0.035);
        var nt = 0;
        updaters.push(function(dt){
          nt -= dt;
          if (nt < 0){ nt = R() < 0.15 ? rnd(0.04, 0.12) : rnd(1.5, 6); neonMat.opacity = neonMat.opacity < 1 ? 1 : (R() < 0.15 ? 0.35 : 1); }
        });
      }
    });
    addBox(-6, 9.85, 1.4, 0.25, 0.85); addBox(1.6, 9.85, 1.4, 0.25, 0.85);

    // ---------- framed pictures (ChatGPT paintings) ---------------------------
    var FRAMES = {
      gold: std({ color: C('#b48b37'), roughness: 0.35, metalness: 0.75 }),
      black: std({ color: C('#1e1c1a'), roughness: 0.5, metalness: 0.1 }),
      wood: std({ color: C('#6b4428'), roughness: 0.55, metalness: 0 }),
      white: std({ color: C('#efece4'), roughness: 0.6, metalness: 0 })
    };
    function framed(w, u, y, pw, ph, src, frame, fw, tilt){
      var g = onWall(w, u, y, 0.02); g.rotation.z = tilt || 0;
      var fm = FRAMES[frame], d = 0.04;
      picture(g, pw, ph, src, { z: 0.005, rough: 0.6 });
      box(g, pw + 2 * fw, fw, d, fm, 0, ph / 2 + fw / 2, 0); box(g, pw + 2 * fw, fw, d, fm, 0, -ph / 2 - fw / 2, 0);
      box(g, fw, ph, d, fm, -pw / 2 - fw / 2, 0, 0); box(g, fw, ph, d, fm, pw / 2 + fw / 2, 0, 0);
      return g;
    }
    var employee = canvas(300, 400, function(c, w, h){
      c.fillStyle = '#f6f0dc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#a32020'; c.font = font(26, 'Georgia, serif', 'bold'); c.textAlign = 'center';
      c.fillText('Employee', w / 2, 40); c.fillText('of the Month', w / 2, 70);
      c.fillStyle = '#7c8f9a'; c.fillRect(60, 90, 180, 200);
      c.fillStyle = '#3d3029'; c.beginPath(); c.arc(150, 170, 42, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8cfb0'; c.beginPath(); c.arc(150, 178, 34, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(80, 290); c.quadraticCurveTo(150, 205, 220, 290); c.fill();
      c.fillStyle = '#222'; c.font = font(32, HAND, 'bold'); c.fillText('Bernie', w / 2, 335);
      c.font = font(20, 'Georgia, serif'); c.fillText('March 2014', w / 2, 372);
    });
    framed('left', 10 - 7, 2.55, 1.0, 0.75, ftex('textures/d_art_sunset.webp'), 'gold', 0.07, 0.035);
    framed('left', 10 - 2.33, 2.5, 0.6, 0.75, ftex('textures/d_art_cow.webp'), 'gold', 0.1, -0.02);
    framed('left', 10 + 2.33, 2.55, 0.95, 0.71, ftex('textures/d_art_ship.webp'), 'wood', 0.06, 0.05);
    framed('left', 10 + 7, 2.45, 0.85, 0.64, ftex('textures/d_art_team.webp'), 'black', 0.03, -0.03);
    framed('left', 10 + 0.1, 2.0, 0.3, 0.4, employee, 'white', 0.025, 0.02);
    // mounted pike and deer antlers (Meshy)
    place('fish', { w: 1.05 }, onWall('left', 10 + 4.66, 2.4, 0), 0, 0, 0, 0, { back: true, anchor: 'center' }).rotation.z = -0.03;
    place('antlers', { w: 0.8 }, onWall('left', 10 - 4.66, 2.7, 0), 0, 0, 0, 0, { back: true, anchor: 'center' });

    // fairy lights, apparently up since Christmas 2015
    (function(){
      var pts = [], hooks = [];
      for (var u = 0.4; u <= 19.6; u += 1.6) hooks.push(u);
      for (var i = 0; i < hooks.length - 1; i++){
        for (var k = 0; k < 8; k++){
          var t = k / 8, uu = hooks[i] + (hooks[i + 1] - hooks[i]) * t;
          pts.push(new T.Vector3(-10 + 0.03, 3.62 - Math.sin(Math.PI * t) * 0.18, 10 - uu));
        }
      }
      pts.push(new T.Vector3(-10 + 0.03, 3.62, 10 - hooks[hooks.length - 1]));
      root.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: C('#1f3a1f') })));
      var cols = ['#ff4a3a', '#ffd23a', '#3aa0ff', '#4aff6a', '#ff7af0'];
      var n = pts.length, bulbs = new T.InstancedMesh(new T.SphereGeometry(0.022, 8, 6), basic({ toneMapped: false }), n);
      var mtx = new T.Matrix4(), base = [];
      for (i = 0; i < n; i++){
        mtx.makeTranslation(pts[i].x + 0.01, pts[i].y - 0.03, pts[i].z);
        bulbs.setMatrixAt(i, mtx);
        var dead = R() < 0.18, c = dead ? new T.Color(0.12, 0.12, 0.1) : new T.Color(cols[i % cols.length]).multiplyScalar(1.6);
        base.push({ c: c, dead: dead, ph: R() * 6 }); bulbs.setColorAt(i, c);
      }
      bulbs.frustumCulled = false;   // the bulbs are far from the mesh's own origin
      root.add(bulbs);
      var tmp = new T.Color(), acc = 0;
      updaters.push(function(dt, time){
        acc += dt; if (acc < 0.12) return; acc = 0;
        for (var j = 0; j < n; j++){ if (base[j].dead) continue;
          tmp.copy(base[j].c).multiplyScalar(0.55 + 0.45 * Math.max(0, Math.sin(time * 1.3 + base[j].ph))); bulbs.setColorAt(j, tmp); }
        bulbs.instanceColor.needsUpdate = true;
      });
    })();

    // old CRT TV in the corner on a wall bracket (Meshy)
    (function(){
      var black = std({ color: C('#1b1b1b'), roughness: 0.5, metalness: 0.4 });
      var g = new T.Group(); g.position.set(-9.3, 2.65, 9.3); g.rotation.y = Math.PI * 0.75; root.add(g);
      box(g, 0.55, 0.03, 0.5, black, 0, -0.015, 0);
      box(null, 0.05, 0.05, 0.6, black, -9.65, 2.6, 9.65, 0, Math.PI * 0.25, 0);
      place('crttv', { w: 0.66 }, g, 0, 0, 0, 0, {});
    })();

    // ---------- back wall: menu board, clock, shelf, machines, plant, coat rack ----
    (function(){
      // blackboard (Meshy) with the menu written on it (ChatGPT)
      var g = onWall('back', 10 - 3.5, 2.25, 0);
      place('chalkboard', { w: 1.9 }, g, 0, 0, 0, 0, { back: true, anchor: 'center', done: function(h, s){
        picture(h, s.x * 0.8, s.y * 0.72, ftex('textures/d_art_menu.webp'), { x: s.x * 0.07, y: s.y * 0.01, z: s.z + 0.004, rough: 0.95 });
      } });
    })();
    // wall clock (shows the real time)
    (function(){
      var g = onWall('back', 10 - 6.6, 3.0, 0.03); g.rotation.z = 0.04;
      picture(g, 0.5, 0.5, canvas(256, 256, function(c, w, h){
        c.fillStyle = '#f3ecd8'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#222'; c.font = font(26, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
        for (var i = 1; i <= 12; i++){ var a = i / 12 * Math.PI * 2; c.fillText(String(i), 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
        for (i = 0; i < 60; i++){ a = i / 60 * Math.PI * 2; c.fillRect(128 + Math.sin(a) * 114 - 1, 128 - Math.cos(a) * 114 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4); }
        c.font = font(14, 'Arial'); c.fillText('QUARTZ', 128, 170);
        c.fillStyle = 'rgba(120,90,40,0.15)'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
      }), { z: 0.01, rough: 0.4 });
      mesh(g, new T.TorusGeometry(0.255, 0.022, 8, 40), FRAMES.black, 0, 0, 0.012);
      var handMat = std({ color: C('#151515'), roughness: 0.5 });
      function hand(len, wid, mat){ var p = new T.Group(); p.position.z = 0.025; g.add(p); box(p, wid, len, 0.004, mat, 0, len / 2 - 0.02, 0); return p; }
      var hh = hand(0.13, 0.016, handMat), mh = hand(0.19, 0.01, handMat), sh = hand(0.2, 0.004, std({ color: C('#c02020') }));
      updaters.push(function(){
        var d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60;
        sh.rotation.z = -s / 60 * Math.PI * 2; mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2;
      });
    })();
    // lighter patch where a picture used to hang (with the nail)
    (function(){
      var g = onWall('back', 1.5, 2.55, 0.004);
      var m = wpMat.clone(); m.vertexColors = false; m.color = new T.Color(1.08, 1.06, 1.04);
      var geo = new T.PlaneGeometry(0.55, 0.72), uv = geo.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, (1.5 - 0.275 + uv.getX(i) * 0.55) / WP_TILE, (2.55 - 0.36 + uv.getY(i) * 0.72) / WP_TILE);
      mesh(g, geo, m);
      cyl(g, 0.004, 0.004, 0.03, 6, std({ color: C('#777'), metalness: 0.8, roughness: 0.4 }), 0, 0.3, 0.015, Math.PI / 2, 0, 0);
    })();
    // shelf with odds and ends: trophies and a porcelain dog (Meshy), board games, books, snow globe
    (function(){
      var g = onWall('back', 10 + 0.3, 2.45, 0.13);
      var wood = std({ color: C('#7a5232'), roughness: 0.6 });
      var iron = std({ color: C('#2a2a2a'), metalness: 0.6, roughness: 0.4 });
      box(g, 1.6, 0.04, 0.26, wood, 0, 0, 0);
      [-0.6, 0.6].forEach(function(x){ box(g, 0.03, 0.2, 0.03, iron, x, -0.11, -0.11); box(g, 0.03, 0.03, 0.22, iron, x, -0.04, -0.01, 0.6, 0, 0); });
      place('trophies', { w: 0.34 }, g, -0.55, 0.02, 0, 0.15, {});
      place('dogfigure', { h: 0.2 }, g, 0.45, 0.02, 0, -0.5, {});
      cyl(g, 0.05, 0.06, 0.04, 16, std({ color: C('#3a2414'), roughness: 0.5 }), -0.2, 0.04, 0.02);
      mesh(g, new T.SphereGeometry(0.06, 16, 12), std({ color: C('#dfe8ee'), roughness: 0.05, transparent: true, opacity: 0.35 }), -0.2, 0.12, 0.02);
      box(g, 0.035, 0.03, 0.03, std({ color: C('#c84a3a') }), -0.2, 0.09, 0.02);
      [['#2c5aa0', 0.05], ['#c8a020', 0.04], ['#8a2a2a', 0.05]].forEach(function(b, i){
        box(g, 0.34 - i * 0.02, b[1], 0.24, std({ color: C(b[0]), roughness: 0.7 }), 0.12, 0.02 + b[1] / 2 + i * 0.048, 0, 0, 0.08 * (i - 1), 0);
      });
      [['#5a3a2a', 0.2], ['#2f4a3a', 0.18], ['#7a6a4a', 0.22]].forEach(function(b, i){
        box(g, 0.035, b[1], 0.15, std({ color: C(b[0]), roughness: 0.8 }), 0.66 + i * 0.04, 0.02 + b[1] / 2, -0.03, 0, 0, i === 2 ? 0.3 : 0);
      });
    })();
    // slot machine, drinks fridge, rubber plant, coat rack (Meshy)
    place('slotmachine', { h: 1.75 }, null, -0.85, 0, -10 + 0.03, 0, { back: true, cast: true });
    addBox(-0.85, -9.65, 0.75, 0.6, 1.75);
    place('fridge', { h: 1.95 }, null, 1.65, 0, -10 + 0.03, 0, { back: true, cast: true });
    addBox(1.65, -9.62, 0.85, 0.7, 1.95);
    place('plant', { h: 1.75 }, null, -5.3, 0, -9.45, 0.4, { cast: true });
    addBox(-5.3, -9.45, 0.5, 0.5, 0.45);
    place('coatrack', { h: 1.9 }, null, -9.4, 0, -9.4, Math.PI * 0.25, { cast: true });
    addBox(-9.4, -9.4, 0.5, 0.5, 1.9);

    // ---------- partition (guest side): dartboard, posters, signs --------------
    (function(){
      var g = onWall('part', 10 + 8.0, 1.75, 0.03);
      var dart = canvas(512, 512, function(c, w, h){
        var cx = 256, cy = 256; c.fillStyle = '#111'; c.beginPath(); c.arc(cx, cy, 255, 0, Math.PI * 2); c.fill();
        var rings = [[200, 190, 'd'], [190, 130, 's'], [130, 120, 't'], [120, 0, 's']];
        for (var i = 0; i < 20; i++){
          var a0 = (i - 0.5) / 20 * Math.PI * 2 - Math.PI / 2, a1 = (i + 0.5) / 20 * Math.PI * 2 - Math.PI / 2;
          rings.forEach(function(r){
            c.fillStyle = r[2] === 's' ? (i % 2 ? '#efe2c0' : '#1a1a1a') : (i % 2 ? '#1b7a3a' : '#c02a2a');
            c.beginPath(); c.arc(cx, cy, r[0], a0, a1); c.arc(cx, cy, r[1], a1, a0, true); c.closePath(); c.fill();
          });
        }
        c.fillStyle = '#1b7a3a'; c.beginPath(); c.arc(cx, cy, 18, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c02a2a'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
        var nums = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
        c.fillStyle = '#eee'; c.font = font(26, 'Arial', 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
        nums.forEach(function(n, i){ var a = i / 20 * Math.PI * 2 - Math.PI / 2; c.fillText(String(n), cx + Math.cos(a) * 228, cy + Math.sin(a) * 228); });
        noise(c, w, h, 2500, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.1)');
      });
      cyl(g, 0.23, 0.23, 0.04, 40, [std({ color: C('#222') }), std({ map: ctex(dart), roughness: 0.9 }), std({ color: C('#222') })], 0, 0, 0, Math.PI / 2, 0, 0);
      var dm = std({ color: C('#c0c0c0'), metalness: 0.9, roughness: 0.3 }), fl = std({ color: C('#e0402a'), side: T.DoubleSide });
      [[0.05, 0.08], [-0.1, -0.03], [0.02, -0.12]].forEach(function(p){
        var d = new T.Group(); d.position.set(p[0], p[1], 0.02); d.rotation.set(rnd(-0.2, 0.2), rnd(-0.2, 0.2), 0); g.add(d);
        cyl(d, 0.006, 0.003, 0.12, 6, dm, 0, 0, 0.06, Math.PI / 2, 0, 0);
        mesh(d, new T.PlaneGeometry(0.04, 0.05), fl, 0, 0, 0.14, Math.PI / 2, 0, 0); mesh(d, new T.PlaneGeometry(0.04, 0.05), fl, 0, 0, 0.14, Math.PI / 2, Math.PI / 2, 0);
      });
      // score board
      picture(onWall('part', 10 + 9.2, 1.7, 0.02), 0.36, 0.5, canvas(200, 280, function(c, w, h){
        c.fillStyle = '#1f2a25'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2f0e6'; c.font = font(28, HAND, 'bold'); c.textAlign = 'center';
        c.fillText('BOB', 52, 40); c.fillText('DAVE', 150, 40); c.fillRect(w / 2 - 1, 15, 2, h - 30); c.fillRect(10, 52, w - 20, 2);
        c.font = font(24, HAND); ['501', '377', '212'].forEach(function(s, i){ c.fillText(s, 52, 90 + i * 40); });
        ['501', '41'].forEach(function(s, i){ c.fillText(s, 150, 90 + i * 40); });
      }), { rough: 0.95 });
      // faded poster of the 2009 summer fair
      picture(onWall('part', 10 + 6.5, 2.7, 0.012), 0.55, 0.78, canvas(330, 470, function(c, w, h){
        c.fillStyle = '#e9e0c4'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#2a6aa8'; c.fillRect(0, 0, w, 120);
        c.fillStyle = '#f6f0dc'; c.font = font(44, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('Summer Fair', w / 2, 60); c.font = font(34, 'Georgia, serif'); c.fillText('2009', w / 2, 102);
        c.fillStyle = '#8a2a20'; c.font = font(24, 'Arial', 'bold'); ['Big tent at the sports field', 'Sat 18 July from 2 pm', 'Live: The Village Rockers', 'Free entry!'].forEach(function(s, i){ c.fillText(s, w / 2, 190 + i * 52); });
        c.fillStyle = 'rgba(240,230,200,0.45)'; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(220,210,150,0.8)'; c.fillRect(0, 0, 50, 20); c.fillRect(w - 50, 0, 50, 20);
      }), { rz: 0.02, rough: 0.9 });
      // missing cat flyer with tear-off strips
      picture(onWall('part', 10 + 6.6, 1.6, 0.012), 0.3, 0.42, canvas(240, 336, function(c, w, h){
        c.fillStyle = '#fafaf4'; c.fillRect(0, 0, w, h); c.fillStyle = '#c01010'; c.font = font(38, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('MISSING!', w / 2, 44);
        c.fillStyle = '#777'; c.fillRect(50, 60, 140, 100); c.fillStyle = '#e8a040'; c.beginPath(); c.ellipse(120, 120, 40, 30, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(90, 100); c.lineTo(96, 76); c.lineTo(108, 96); c.moveTo(132, 96); c.lineTo(144, 76); c.lineTo(150, 100); c.fill();
        c.fillStyle = '#222'; c.font = font(19, 'Arial'); ['Tomcat "Mousey",', 'does not listen.', 'Please call!'].forEach(function(s, i){ c.fillText(s, w / 2, 190 + i * 24); });
        for (var i = 0; i < 8; i++){ if (i === 2 || i === 5) continue; c.save(); c.translate(15 + i * 30, h - 4); c.rotate(-Math.PI / 2); c.font = font(11, 'Arial'); c.fillText('0172 55 ...', 30, 4); c.restore();
          c.fillStyle = '#ccc'; c.fillRect(i * 30, h - 70, 1, 70); c.fillStyle = '#222'; }
      }), { rz: -0.04, rough: 0.9 });
      // calendar from 2019 next to the kitchen door
      picture(onWall('part', 0.6, 2.2, 0.012), 0.36, 0.56, canvas(240, 372, function(c, w, h){
        c.fillStyle = '#f8f6ee'; c.fillRect(0, 0, w, h);
        var sky = c.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, '#6aa0d8'); sky.addColorStop(1, '#d8e8f0'); c.fillStyle = sky; c.fillRect(10, 10, w - 20, 150);
        c.fillStyle = '#4a7a3a'; c.beginPath(); c.moveTo(10, 160); c.lineTo(80, 80); c.lineTo(140, 130); c.lineTo(190, 70); c.lineTo(w - 10, 120); c.lineTo(w - 10, 160); c.fill();
        c.fillStyle = '#222'; c.font = font(24, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('July 2019', w / 2, 192);
        c.font = font(14, 'Arial');
        for (var d = 0; d < 31; d++){ var col = d % 7, row = Math.floor(d / 7); c.fillStyle = col === 6 ? '#c02020' : '#333'; c.fillText(String(d + 1), 25 + col * 32, 225 + row * 30); }
        c.strokeStyle = '#c02020'; c.lineWidth = 2; c.beginPath(); c.arc(25 + 3 * 32, 225 + 2 * 30 - 5, 13, 0, Math.PI * 2); c.stroke();
      }), { rough: 0.9 });
      // no smoking sign (enamel)
      picture(onWall('part', 0.6, 3.1, 0.012), 0.3, 0.2, canvas(240, 160, function(c, w, h){
        c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c01818'; c.lineWidth = 10; c.beginPath(); c.arc(60, 80, 46, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#333'; c.fillRect(30, 72, 60, 14); c.beginPath(); c.moveTo(28, 48); c.lineTo(94, 112); c.stroke();
        c.fillStyle = '#222'; c.font = font(24, 'Arial', 'bold'); c.textAlign = 'left'; c.fillText('No', 120, 72); c.fillText('smoking', 116, 102);
      }), { rough: 0.3 });
      // toilet sign (through the kitchen ...)
      picture(onWall('part', 10 - 6.55, 2.7, 0.012), 0.46, 0.2, canvas(368, 160, function(c, w, h){
        c.fillStyle = '#1f6a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = font(60, 'Arial', 'bold'); c.textAlign = 'left'; c.fillText('WC', 24, 82);
        c.beginPath(); c.moveTo(150, 60); c.lineTo(230, 60); c.lineTo(230, 40); c.lineTo(270, 70); c.lineTo(230, 100); c.lineTo(230, 80); c.lineTo(150, 80); c.fill();
        c.font = font(20, 'Arial'); c.fillText('through the kitchen, then left', 18, 136);
      }), { rough: 0.4 });
    })();

    // ---------- floor: wet floor sign, beer crates (Meshy) -------------------
    place('wetsign', { h: 0.65 }, null, 1.05, 0, 7.6, 0.5, { cast: true });
    addBox(1.05, 7.6, 0.4, 0.35, 0.65);
    place('crates', { h: 0.95 }, null, 3.1, 0, 9.45, -Math.PI / 2, { cast: true });
    addBox(3.1, 9.45, 0.5, 0.5, 0.95);

    // worn, stained floor in the guest room
    (function(){
      var W = X1 + 10, c = canvas(1024, 1480, function(g, w, h){
        g.clearRect(0, 0, w, h);
        var sx = w / W, sz = h / 20;   // pixels per metre
        function blot(x, z, r, a, col){
          var gr = g.createRadialGradient((x + 10) * sx, (z + 10) * sz, 0, (x + 10) * sx, (z + 10) * sz, r * sx);
          gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = gr; g.beginPath(); g.arc((x + 10) * sx, (z + 10) * sz, r * sx, 0, Math.PI * 2); g.fill();
        }
        for (var t = 0; t <= 1; t += 0.04){ blot(-1.3 + 3.3 * t, 9 - 9 * t, 1.1, 0.13, '70,50,30'); blot(-1.3 - 4.2 * t, 9 - 9 * t, 1.0, 0.12, '70,50,30'); }
        for (var z = -5.5; z <= 5.5; z += 0.5) blot(2.3, z, 0.9, 0.12, '60,45,25');
        [-7, -2.33, 2.33, 7].forEach(function(tz){ blot(-7.5, tz, 1.6, 0.15, '60,45,25'); });
        blot(-0.85, -9.1, 0.7, 0.1, '50,35,20'); blot(1.65, -9.0, 0.6, 0.08, '50,35,20');
        for (var i = 0; i < 26; i++) blot(rnd(-9.5, X1 - 0.5), rnd(-9.5, 9.5), rnd(0.08, 0.3), rnd(0.12, 0.25), pick(['90,60,25', '60,40,20', '110,80,40']));
        noise(g, w, h, 20000, 'rgba(40,30,20,0.05)', 'rgba(40,30,20,0.03)');
      });
      mesh(null, new T.PlaneGeometry(W, 20), std({ map: ctex(c), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
           (X1 - 10) / 2, 0.003, 0, -Math.PI / 2, 0, 0);
    })();

    // ---------- plastic patio furniture in the middle (nobody knows why, Meshy) ----
    function patioSet(x, z, chairs, umbrella){
      var top = 0.74;
      place('patiotable', { h: top }, null, x, 0, z, 0.3, { cast: true });
      chairs.forEach(function(ch){
        var a = ch[0], cx = x + Math.cos(a) * 0.78, cz = z + Math.sin(a) * 0.78;
        place('monobloc', { h: 0.9 }, null, cx, 0, cz, Math.atan2(x - cx, z - cz) + (ch[1] || 0), { cast: true });
        addBox(cx, cz, 0.5, 0.5, 0.45);
      });
      if (umbrella){
        cyl(null, 0.018, 0.018, 2.3, 8, std({ color: C('#d8d8d8'), metalness: 0.7, roughness: 0.3 }), x, 1.15, z);
        var cloth = std({ color: C('#2f6a8a'), roughness: 0.8, side: T.DoubleSide });
        mesh(null, new T.ConeGeometry(0.12, 1.1, 8, 1, true), cloth, x, 1.8, z, Math.PI, 0, 0);
        mesh(null, new T.ConeGeometry(0.03, 0.08, 8), std({ color: C('#888') }), x, 2.33, z);
        picture(null, 0.16, 0.04, canvas(256, 60, function(c, w, h){ c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#c01818'; c.font = font(38, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('ICE CREAM', w / 2, 44); }), { x: x, y: 1.75, z: z + 0.105, rough: 0.6 });
      }
      cyl(null, 0.06, 0.05, 0.03, 16, std({ color: C('#b8c0c4'), metalness: 0.8, roughness: 0.3 }), x + 0.1, top + 0.015, z - 0.05);
      addBox(x, z, 0.9, 0.9, top);
    }
    patioSet(-3.2, -5.6, [[0.3], [2.4, 0.4], [4.1, -0.2]], false);
    patioSet(-2.6, 5.0, [[1.2], [3.6, 0.2]], true);
    // a chair that has fallen over next to it
    var fallen = place('monobloc', { h: 0.9 }, null, -1.3, 0.3, 3.4, 0, { cast: true });
    fallen.rotation.set(Math.PI / 2 - 0.08, 0.6, 0, 'YXZ');
    addBox(-1.3, 3.4, 0.8, 0.8, 0.5);

    // ---------- ceiling: lamps over the tables, fan, strip lights, stains -------
    var lampSpots = [[-7.5, -7, 'lamp_enamel'], [-7.5, -2.33, 'lamp_tiffany'], [-7.5, 2.33, 'lamp_drum'], [-7.5, 7, 'lamp_enamel']];
    var cordMat = std({ color: C('#151515'), roughness: 0.6 });
    lampSpots.forEach(function(p, i){
      var y = H - [1.0, 1.15, 1.05, 0.95][i];
      cyl(null, 0.006, 0.006, H - y, 4, cordMat, p[0], (H + y) / 2, p[1]);
      cyl(null, 0.06, 0.06, 0.03, 12, cordMat, p[0], H - 0.015, p[1]);
      place(p[2], { w: p[2] === 'lamp_tiffany' ? 0.55 : 0.48 }, null, p[0], y, p[1], i * 0.7, { anchor: 'top', done: function(h){
        h.traverse(function(m){ if (m.isMesh && m.material){ m.material = m.material.clone(); m.material.emissive = new T.Color(1, 0.8, 0.55); m.material.emissiveIntensity = 0.18; if (m.material.map) m.material.emissiveMap = m.material.map; } });
      } });
      var light = new T.PointLight(0xffc98a, 0.95, 6.5, 2);
      light.position.set(p[0], y - 0.35, p[1]); root.add(light);
    });
    // ceiling fan (wobbles a little)
    (function(){
      var g = new T.Group(); g.position.set(-3.2, H, 0.2); root.add(g);
      var spin = place('ceilingfan', { w: 1.5 }, g, 0, 0, 0, 0, { anchor: 'top' });
      updaters.push(function(dt, time){ spin.rotation.y += dt * 2.6; g.rotation.x = Math.sin(time * 2.6) * 0.012; g.rotation.z = Math.cos(time * 2.6) * 0.012; });
    })();
    // strip lights over the bar: one flickers, one is broken
    (function(){
      var housing = std({ color: C('#e9e9e4'), roughness: 0.5, metalness: 0.3 });
      var onMat = basic({ color: new T.Color(0.92, 0.97, 1).multiplyScalar(1.6), toneMapped: false });
      var offMat = std({ color: C('#8a8f90'), roughness: 0.4 });
      [[-2.2, true], [2.2, false]].forEach(function(f){
        var g = new T.Group(); g.position.set(2.3, H - 0.05, f[0]); root.add(g);
        box(g, 0.16, 0.06, 1.55, housing, 0, 0, 0);
        cyl(g, 0.018, 0.018, 1.45, 10, f[1] ? onMat : offMat, 0, -0.05, 0, Math.PI / 2, 0, 0);
        if (f[1]){
          var light = new T.PointLight(0xe8f2ff, 0.55, 6, 2); light.position.set(2.3, H - 0.3, f[0]); root.add(light);
          var t = 0;
          updaters.push(function(dt){
            t -= dt;
            if (t < 0){
              var off = R() < 0.25 && onMat.color.r > 1;
              onMat.color.setRGB(0.92, 0.97, 1).multiplyScalar(off ? 0.25 : 1.6);
              light.intensity = off ? 0.1 : 0.55;
              t = off ? rnd(0.03, 0.09) : rnd(0.5, 5);
            }
          });
        }
      });
    })();
    // missing ceiling tile with a cable hanging out, water stains
    (function(){
      mesh(null, new T.PlaneGeometry(1.25, 1.25), basic({ color: C('#16120e') }), -0.625, H - 0.004, 5.625, Math.PI / 2, 0, 0);
      var curve = new T.CatmullRomCurve3([new T.Vector3(-0.4, H + 0.05, 5.4), new T.Vector3(-0.35, H - 0.25, 5.5), new T.Vector3(-0.25, H - 0.5, 5.65), new T.Vector3(-0.15, H - 0.35, 5.8)]);
      mesh(null, new T.TubeGeometry(curve, 20, 0.008, 6, false), std({ color: C('#d8d2c0'), roughness: 0.6 }));
      function stain(x, z, r){
        var c = canvas(256, 256, function(g, w, h){
          g.clearRect(0, 0, w, h);
          for (var i = 0; i < 4; i++){ g.strokeStyle = 'rgba(120, 80, 30, ' + (0.25 - i * 0.05) + ')'; g.lineWidth = 6 + i * 4; g.beginPath();
            for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.2){ var rr = (90 - i * 18) * (1 + Math.sin(a * 3 + i) * 0.08); g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); }
            g.stroke(); }
          var f = g.createRadialGradient(128, 128, 10, 128, 128, 100); f.addColorStop(0, 'rgba(150,110,50,0.18)'); f.addColorStop(1, 'rgba(150,110,50,0)');
          g.fillStyle = f; g.fillRect(0, 0, w, h);
        });
        mesh(null, new T.PlaneGeometry(r * 2, r * 2), std({ map: ctex(c), transparent: true, depthWrite: false, roughness: 1 }), x, H - 0.006, z, Math.PI / 2, 0, 0);
      }
      stain(-6.2, -3.6, 0.8); stain(1.0, -7.2, 0.55); stain(-1.4, 6.6, 0.45);
    })();

    // ---------- bar: cash register (Meshy), tip jar, peanuts, bell, menus (once it is loaded) ---
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
      var jar = new T.Group(); jar.position.set(x + 0.05, top, -3.1); jar.rotation.y = -Math.PI / 2; root.add(jar);
      cyl(jar, 0.07, 0.065, 0.16, 20, std({ color: C('#e6eef0'), roughness: 0.05, transparent: true, opacity: 0.35 }), 0, 0.08, 0, 0, 0, 0, true);
      var coin = std({ color: C('#b88a3a'), metalness: 0.9, roughness: 0.3 });
      for (var i = 0; i < 9; i++) cyl(jar, 0.012, 0.012, 0.003, 10, coin, rnd(-0.04, 0.04), 0.004 + i * 0.004, rnd(-0.04, 0.04), rnd(0, 0.5), 0, rnd(0, 0.5));
      picture(jar, 0.11, 0.045, canvas(220, 90, function(c, w, h){ c.fillStyle = '#fffbe8'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = font(34, HAND, 'bold'); c.textAlign = 'center'; c.fillText('TIPS', w / 2, 42); c.font = font(20, HAND); c.fillText('thank you :)', w / 2, 76); }), { y: 0.1, z: 0.071, rough: 0.8 });
      var bowl = new T.Group(); bowl.position.set(x, top, 1.4); root.add(bowl);
      mesh(bowl, new T.SphereGeometry(0.1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: C('#8a2a20'), roughness: 0.3, side: T.DoubleSide }), 0, 0.1, 0);
      var nut = std({ color: C('#c08a4a'), roughness: 0.8 });
      for (i = 0; i < 18; i++){ var a = R() * 6.28, r = R() * 0.07; mesh(bowl, new T.SphereGeometry(0.014, 6, 4), nut, Math.cos(a) * r, 0.04 + R() * 0.03, Math.sin(a) * r).scale.set(1, 0.8, 1.5); }
      var bell = new T.Group(); bell.position.set(x - 0.05, top, 4.3); root.add(bell);
      cyl(bell, 0.045, 0.05, 0.015, 16, std({ color: C('#222') }), 0, 0.008, 0);
      mesh(bell, new T.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: C('#d8d8d8'), metalness: 1, roughness: 0.15 }), 0, 0.015, 0);
      var menus = new T.Group(); menus.position.set(x, top, 2.6); menus.rotation.y = -Math.PI / 2 + 0.2; root.add(menus);
      box(menus, 0.12, 0.05, 0.08, std({ color: C('#3a2a1a') }), 0, 0.025, 0);
      [['#7a1e1e', 0], ['#7a1e1e', 0.02], ['#1e3a6a', 0.04]].forEach(function(m){ box(menus, 0.2, 0.28, 0.006, std({ color: C(m[0]), roughness: 0.4 }), 0, 0.15, -0.02 + m[1], -0.06); });
    }

    // ---------- tables: tablecloths, condiment caddy and candle bottle (Meshy) ------
    var CLOTHS = [['#b3262b', false], ['#b3262b', true], ['#2a4d8f', false], ['#2f6a3a', false]];
    function dressTable(table, spot, size, i){
      var cl = CLOTHS[i % CLOTHS.length], top = size.y;
      var tex = ctex(canvas(256, 256, function(c, w, h){
        c.fillStyle = '#f2ece0'; c.fillRect(0, 0, w, h);
        c.fillStyle = cl[0]; c.globalAlpha = 0.85;
        for (var k = 0; k < 8; k++){ c.fillRect(k * 32, 0, 16, h); c.fillRect(0, k * 32, w, 16); }
        c.globalAlpha = 1; noise(c, w, h, 1200, 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.06)');
      }), { repeat: true });
      var w = size.x + 0.12, d = size.z + 0.12, hang = 0.13;
      tex.repeat.set(w / 0.75, d / 0.75);   // checks about 9 cm
      var mat = std({ map: tex, roughness: 0.9, side: T.DoubleSide });
      var g = new T.Group(); g.position.set(spot[0], top + 0.004, spot[1]); root.add(g);
      mesh(g, new T.PlaneGeometry(w, d), mat, 0, 0, 0, -Math.PI / 2, 0, 0);
      [[0, -d / 2, 0, w], [0, d / 2, 0, w], [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d]].forEach(function(s){
        var sg = new T.PlaneGeometry(s[3], hang), suv = sg.attributes.uv, full = s[3] === w ? w : d;
        for (var k = 0; k < suv.count; k++) suv.setXY(k, suv.getX(k) * s[3] / full, suv.getY(k) * hang / d);
        mesh(g, sg, mat, s[0], -hang / 2, s[1], 0, s[2], 0);
      });
      if (cl[1]){   // coffee stain
        mesh(g, new T.PlaneGeometry(0.16, 0.16), std({ map: ctex(canvas(128, 128, function(c, ww, hh){
          c.clearRect(0, 0, ww, hh); c.strokeStyle = 'rgba(110,70,30,0.55)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 46, 0.3, 5.9); c.stroke();
          c.fillStyle = 'rgba(130,90,40,0.18)'; c.beginPath(); c.arc(64, 64, 46, 0, 6.3); c.fill();
        })), transparent: true, depthWrite: false, roughness: 1 }), 0.32, 0.002, 0.12, -Math.PI / 2, 0, 0);
      }
      var y = top + 0.006;
      place('condiments', { w: 0.3 }, null, spot[0] - 0.12, y, spot[1], [0.2, -0.3, 1.4, 3.0][i % 4], { cast: true });
      if (i === 0 || i === 2){   // candle in a wine bottle, dripping wax
        place('candlebottle', { h: 0.4 }, null, spot[0] + 0.28, y, spot[1] + 0.01, 0, { done: function(h, s){
          var flame = mesh(h, new T.ConeGeometry(0.009, 0.035, 8), basic({ color: new T.Color(1, 0.7, 0.3).multiplyScalar(2), toneMapped: false }), 0, s.y + 0.015, 0);
          updaters.push(function(dt, time){ var k = 1 + Math.sin(time * 13 + i) * 0.12 + Math.sin(time * 31 + i) * 0.08; flame.scale.set(1, k, 1); flame.rotation.z = Math.sin(time * 7 + i) * 0.1; });
        } });
      }
      var p = new T.Group(); p.position.set(spot[0], y, spot[1]); root.add(p);
      if (i === 3){   // "Reserved" (but nobody comes)
        var card = canvas(256, 100, function(c, ww, hh){ c.fillStyle = '#fbf7ea'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#222'; c.font = font(44, 'Georgia, serif', 'italic'); c.textAlign = 'center'; c.fillText('Reserved', ww / 2, 64); });
        var cm = std({ map: ctex(card), roughness: 0.8, side: T.DoubleSide });
        mesh(p, new T.PlaneGeometry(0.16, 0.065), cm, 0.25, 0.03, 0.013, -0.35, 0, 0); mesh(p, new T.PlaneGeometry(0.16, 0.065), cm, 0.25, 0.03, -0.013, 0.35, Math.PI, 0);
      }
      if (i === 0){   // newspaper someone left behind
        mesh(p, new T.PlaneGeometry(0.28, 0.38), std({ map: ctex(canvas(280, 380, function(c, ww, hh){
          c.fillStyle = '#e9e5da'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#111'; c.font = font(32, 'Georgia, serif', 'bold'); c.fillText('Daily Herald', 14, 40);
          c.font = font(18, 'Georgia, serif', 'bold'); c.fillText('Market Square roundabout', 14, 80); c.fillText('dug up again', 14, 102);
          for (var r = 0; r < 20; r++){ c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(14 + (r % 2) * 130, 120 + Math.floor(r / 2) * 22, 120, 6); }
          c.fillStyle = '#8a8a80'; c.fillRect(14, 350, 250, 20);
        })), roughness: 0.95 }), -0.48, 0.001, 0.15, -Math.PI / 2, 0, 0.3);
      }
    }

    // a few chairs don't match the rest
    var CHAIR_TINT = { 2: '#7a9a72', 7: '#c9b28a', 13: '#5a2c22', 14: '#7a9a72' };
    function dressChair(chair, idx){
      var tint = CHAIR_TINT[idx];
      if (!tint) return;
      chair.traverse(function(m){
        if (m.isMesh){ m.material = m.material.clone(); m.material.color = C(tint).multiplyScalar(1.4); }
      });
    }

    function update(dt, time){
      if (!barDone) dressBar();
      for (var i = 0; i < updaters.length; i++) updaters[i](dt, time);
    }

    return { dressTable: dressTable, dressChair: dressChair, update: update, root: root };
  }

  window.HotPotDecor = { build: build };
})();
