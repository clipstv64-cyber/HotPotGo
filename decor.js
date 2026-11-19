// Einrichtung des Gastraums: ein etwas verramschtes, merkwürdiges, aber ganz
// normales Restaurant (Kneipe/Imbiss). Alles wird aus einfachen Formen und
// selbst gezeichneten Canvas-Texturen gebaut – keine externen Dateien.
//
// Gastraum: x von -10 bis zur Trennwand (PARTITION.x - Dicke/2), z von -10 bis 10.
// Einbindung in index.html:
//   decor = HotPotDecor.build({ scene, renderer, addBox, WALL_HEIGHT, PARTITION })
//   decor.dressTable(tableObj, spot, tableSize, index)   // beim Aufstellen der Tische
//   decor.dressChair(chairObj, index)                    // beim Aufstellen der Stühle
//   decor.update(delta, time)                            // jedes Bild
(function(){
  'use strict';
  var T = THREE;
  var Y_AXIS = new T.Vector3(0, 1, 0);

  // reproduzierbarer Zufall (gleiches Ergebnis bei jedem Start)
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
    var PART = ctx.PARTITION, X1 = PART.x - PART.thickness / 2;   // Gastraumseite der Trennwand
    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var R = rng(1987);
    var updaters = [];
    var root = new T.Group(); root.name = 'decor'; scene.add(root);

    // ---------- Helfer ----------------------------------------------------
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
    function shadow(o){ o.traverse(function(m){ if (m.isMesh) m.castShadow = true; }); return o; }
    function font(px, family, weight){ return (weight || '') + ' ' + px + 'px ' + (family || 'Arial, sans-serif'); }
    var HAND = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
    function noise(g, w, h, n, dark, light){
      for (var i = 0; i < n; i++){
        g.fillStyle = R() < 0.5 ? dark : light;
        g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
      }
    }
    // ein flaches Bild (Canvas) als Fläche
    function picture(parent, w, h, c, opts){
      opts = opts || {};
      var t = ctex(c);
      var mat = opts.glow ? basic({ map: t, transparent: !!opts.alpha, depthWrite: !opts.alpha })
                          : std({ map: t, roughness: opts.rough !== undefined ? opts.rough : 0.8, metalness: 0,
                                  transparent: !!opts.alpha, alphaTest: opts.alpha ? 0.05 : 0, side: opts.double ? T.DoubleSide : T.FrontSide });
      return mesh(parent, new T.PlaneGeometry(w, h), mat, opts.x || 0, opts.y || 0, opts.z || 0, opts.rx || 0, opts.ry || 0, opts.rz || 0);
    }

    // ---------- Wände: Koordinaten entlang jeder Wand ------------------------
    // u = Position entlang der Wand, lokale +z-Achse zeigt in den Raum
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

    // 70er-Jahre-Tapete: Kreise in Braun, Orange und Oliv auf vergilbtem Beige
    var WP_TILE = 1.5;
    var wpTex = ctex(canvas(512, 512, function(g, w, h){
      g.fillStyle = '#d9c79c'; g.fillRect(0, 0, w, h);
      var cols = ['#7b4b24', '#c27433', '#8f873a', '#a35a2a'];
      for (var row = 0; row < 4; row++) for (var col = 0; col < 4; col++){
        var cx = col * 128 + 64 + (row % 2 ? 64 : 0), cy = row * 128 + 64;
        for (var dx = -512; dx <= 512; dx += 512) for (var dy = -512; dy <= 512; dy += 512){
          [54, 41, 28, 15].forEach(function(r, k){
            g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
            g.strokeStyle = cols[(row + col + k) % 4]; g.lineWidth = 8; g.stroke();
          });
        }
      }
      g.fillStyle = 'rgba(225, 205, 160, 0.4)'; g.fillRect(0, 0, w, h);   // verblichen
      noise(g, w, h, 5000, 'rgba(70,50,25,0.07)', 'rgba(255,240,210,0.06)');
    }), { repeat: true });
    var wpMat = std({ map: wpTex, roughness: 0.93, metalness: 0, vertexColors: true });

    // dunkle Holzvertäfelung unten (Nut-und-Feder-Bretter, unten abgestoßen)
    var WAIN_H = 1.1, WAIN_TILE = 1.2;
    function boards(g, w, h, forBump){
      var n = 8, bw = w / n;
      for (var i = 0; i < n; i++){
        var x = i * bw;
        if (forBump){ g.fillStyle = '#a0a0a0'; g.fillRect(x, 0, bw, h); }
        else {
          var l = 18 + R() * 9;
          g.fillStyle = 'hsl(' + (20 + R() * 6) + ', 45%, ' + l + '%)'; g.fillRect(x, 0, bw, h);
          for (var k = 0; k < 26; k++){
            var gx = x + R() * bw, wob = R() * 3;
            g.beginPath(); g.moveTo(gx, 0);
            for (var y = 0; y <= h; y += 16) g.lineTo(gx + Math.sin(y * 0.02 + k) * wob, y);
            g.strokeStyle = 'rgba(25, 12, 4, ' + (0.12 + R() * 0.2) + ')'; g.lineWidth = 1 + R() * 1.5; g.stroke();
          }
          for (var s = 0; s < 14; s++){   // Kratzer von Stuhlbeinen und Schuhen
            var sx = x + R() * bw, sy = h * (0.72 + R() * 0.26);
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + rnd(-14, 14), sy + rnd(-4, 4));
            g.strokeStyle = 'rgba(210, 170, 120, 0.22)'; g.lineWidth = 1; g.stroke();
          }
        }
        g.fillStyle = forBump ? '#202020' : 'rgba(12, 6, 2, 0.9)'; g.fillRect(x, 0, 3, h);
        if (!forBump){ g.fillStyle = 'rgba(255, 220, 170, 0.1)'; g.fillRect(x + 3, 0, 1, h); }
      }
    }
    var wainMap = ctex(canvas(512, 512, function(g, w, h){ boards(g, w, h, false); }), { repeat: true });
    var wainBump = ctex(canvas(512, 512, function(g, w, h){ boards(g, w, h, true); }), { repeat: true, linear: true });
    var wainMat = std({ map: wainMap, bumpMap: wainBump, bumpScale: 0.012, roughness: 0.5, metalness: 0 });
    var trimMat = std({ color: C('#3d2214'), roughness: 0.45, metalness: 0 });
    var crownMat = std({ color: C('#e6dcc4'), roughness: 0.8, metalness: 0 });

    // eine Wandstrecke von u0 bis u1: Tapete, darunter Vertäfelung mit Leisten.
    // gaps: Öffnungen bis zum Boden (Türen), dort keine Vertäfelung
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
        var f = Math.max(0, Math.min(1, (wy - 2.4) / 1.6));   // oben vom Rauch vergilbt
        f = f * f * 0.45;
        colors[3 * i] = tint * (1 - 0.12 * f); colors[3 * i + 1] = tint * (1 - 0.22 * f); colors[3 * i + 2] = tint * (1 - 0.48 * f);
      }
      geo.setAttribute('color', new T.BufferAttribute(colors, 3));
      mesh(g, geo, wpMat);
      // Stuckleiste oben
      box(onWall(w, (u0 + u1) / 2, H - 0.045, 0.035), len, 0.09, 0.07, crownMat);
      if (y0 > 0) return;
      // Vertäfelung zwischen den Öffnungen
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
        box(onWall(w, c, 0.07, 0.03), l, 0.14, 0.035, trimMat);        // Fußleiste
        box(onWall(w, c, WAIN_H, 0.035), l, 0.055, 0.05, trimMat);     // Abschlussleiste
      });
    }

    // Eingangstür und Fenster an der Vorderwand (z = 10), Küchentür in der Trennwand
    var DOOR_U = X1 + 1.3, DOOR_W = 1.3, DOOR_H = 2.5;    // Eingangstür bei x = -1.3
    var WIN = [{ u: X1 + 6.0, w: 2.0 }, { u: X1 - 1.6, w: 1.8 }];   // Fenster bei x = -6 und x = 1.6
    wallRun('back', 0, X1 + 10);
    wallRun('front', 0, X1 + 10, { gaps: [[DOOR_U - DOOR_W / 2 - 0.13, DOOR_U + DOOR_W / 2 + 0.13]] });
    wallRun('left', 0, 20);
    var KD = PART.door, kd0 = KD.z - KD.w / 2 + 10 - 0.16, kd1 = KD.z + KD.w / 2 + 10 + 0.16;
    wallRun('part', 0, kd0);
    wallRun('part', kd0, kd1, { y0: KD.h + 0.16 });
    wallRun('part', kd1, PART.pieces[1][1] + 10);
    wallRun('part', PART.pieces[0][0] + 10, 20);

    // ---------- Blick nach draußen (für Fenster und Türglas) ---------------
    var outside = canvas(1024, 512, function(g, w, h){
      var sky = g.createLinearGradient(0, 0, 0, h * 0.5);
      sky.addColorStop(0, '#aebfd2'); sky.addColorStop(1, '#e4e8e2');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      // Häuser gegenüber
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
      g.fillStyle = '#f2e8c8'; g.font = font(26, 'Georgia, serif', 'bold'); g.textAlign = 'center'; g.fillText('BÄCKEREI', 430, h * 0.5 + 27);
      g.fillStyle = '#8d8a84'; g.fillRect(0, h * 0.72, w, h * 0.08);     // Gehweg
      g.fillStyle = '#4b4b4d'; g.fillRect(0, h * 0.8, w, h * 0.2);       // Straße
      // Laterne und geparktes Auto
      g.fillStyle = '#2b2b2b'; g.fillRect(700, h * 0.25, 7, h * 0.5); g.fillRect(680, h * 0.25, 40, 10);
      g.fillStyle = '#7d2a26'; g.beginPath(); g.moveTo(120, h * 0.9); g.lineTo(140, h * 0.8); g.lineTo(200, h * 0.76); g.lineTo(300, h * 0.76);
      g.lineTo(340, h * 0.82); g.lineTo(380, h * 0.84); g.lineTo(380, h * 0.92); g.lineTo(120, h * 0.92); g.fill();
      g.fillStyle = '#1b1b1b'; [170, 330].forEach(function(x){ g.beginPath(); g.arc(x, h * 0.92, 18, 0, Math.PI * 2); g.fill(); });
      // leicht unscharf und schmutzig durch die Scheibe
      var copy = document.createElement('canvas'); copy.width = w; copy.height = h;
      var cg = copy.getContext('2d'); cg.drawImage(g.canvas, 0, 0);
      g.filter = 'blur(3px)'; g.drawImage(copy, 0, 0); g.filter = 'none';
      g.fillStyle = 'rgba(235, 228, 205, 0.18)'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 1500, 'rgba(90,80,60,0.15)', 'rgba(255,255,255,0.08)');
    });
    var outsideTex = ctex(outside);
    var glassMat = basic({ map: outsideTex, color: new T.Color(0.92, 0.92, 0.9) });
    function glass(parent, w, h, u0, u1, v0, v1, x, y, z){
      var geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      return mesh(parent, geo, glassMat, x, y, z);
    }

    // ---------- Eingangstür -------------------------------------------------
    (function(){
      var g = onWall('front', DOOR_U, 0, 0);
      var paint = std({ color: C('#33503f'), roughness: 0.55, metalness: 0 });
      var casing = std({ color: C('#d8d0bc'), roughness: 0.7, metalness: 0 });
      var steel = std({ color: C('#b9bcc0'), roughness: 0.3, metalness: 0.8 });
      // Türblatt mit Glasfenster
      box(g, DOOR_W, 0.55, 0.05, paint, 0, 0.275, 0.03);
      box(g, DOOR_W, 0.32, 0.05, paint, 0, DOOR_H - 0.16, 0.03);
      box(g, 0.2, DOOR_H - 0.87, 0.05, paint, -DOOR_W / 2 + 0.1, 0.55 + (DOOR_H - 0.87) / 2, 0.03);
      box(g, 0.2, DOOR_H - 0.87, 0.05, paint, DOOR_W / 2 - 0.1, 0.55 + (DOOR_H - 0.87) / 2, 0.03);
      glass(g, DOOR_W - 0.4, DOOR_H - 0.87, 0.45, 0.62, 0.25, 0.75, 0, 0.55 + (DOOR_H - 0.87) / 2, 0.015);
      box(g, DOOR_W - 0.02, 0.22, 0.008, steel, 0, 0.13, 0.06);                         // Trittblech
      cyl(g, 0.018, 0.018, 0.9, 10, steel, 0, 1.05, 0.11, 0, 0, Math.PI / 2);          // Griffstange
      box(g, 0.03, 0.03, 0.06, steel, -0.42, 1.05, 0.08); box(g, 0.03, 0.03, 0.06, steel, 0.42, 1.05, 0.08);
      // Zarge
      box(g, 0.12, DOOR_H + 0.12, 0.05, casing, -DOOR_W / 2 - 0.06, (DOOR_H + 0.12) / 2, 0.025);
      box(g, 0.12, DOOR_H + 0.12, 0.05, casing, DOOR_W / 2 + 0.06, (DOOR_H + 0.12) / 2, 0.025);
      box(g, DOOR_W + 0.24, 0.12, 0.05, casing, 0, DOOR_H + 0.06, 0.025);
      // Aufkleber: ZIEHEN und Öffnungszeiten
      picture(g, 0.22, 0.07, canvas(256, 80, function(c, w, h){
        c.fillStyle = '#f0e9d8'; c.fillRect(0, 0, w, h); c.fillStyle = '#b02020'; c.font = font(46, 'Arial', 'bold');
        c.textAlign = 'center'; c.fillText('ZIEHEN', w / 2, 58);
      }), { x: 0, y: 1.2, z: 0.058 });
      picture(g, 0.28, 0.36, canvas(256, 330, function(c, w, h){
        c.fillStyle = 'rgba(250,250,245,0.92)'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#222'; c.textAlign = 'center'; c.font = font(26, 'Arial', 'bold'); c.fillText('Öffnungszeiten', w / 2, 40);
        c.font = font(22, 'Arial'); ['Mo – Sa  11 – 23 Uhr', 'So  12 – 22 Uhr', 'Di  Ruhetag', '', '(meistens)'].forEach(function(s, i){ c.fillText(s, w / 2, 90 + i * 42); });
      }), { x: -0.32, y: 0.85, z: 0.057, rz: 0.03 });
      // Türglocke oben
      var brass = std({ color: C('#c8a04a'), roughness: 0.3, metalness: 0.9 });
      box(g, 0.03, 0.03, 0.18, brass, DOOR_W / 2 - 0.15, DOOR_H + 0.03, 0.09);
      mesh(g, new T.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, DOOR_W / 2 - 0.15, DOOR_H - 0.06, 0.18);
      // Fußmatte
      picture(null, 1.2, 0.65, canvas(512, 280, function(c, w, h){
        c.fillStyle = '#6e4b2c'; c.fillRect(0, 0, w, h);
        noise(c, w, h, 9000, 'rgba(40,25,10,0.35)', 'rgba(170,130,80,0.25)');
        c.fillStyle = 'rgba(30,18,8,0.55)'; c.font = font(64, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('WILLKOMMEN', w / 2, h / 2 + 22);
        c.fillStyle = 'rgba(110,80,50,0.5)'; c.fillRect(w * 0.3, h * 0.35, w * 0.25, h * 0.3);   // abgelaufene Stelle
      }), { x: -1.3, y: 0.012, z: 9.45, rx: -Math.PI / 2, rz: 0.05, rough: 1 });
      // Schirmständer
      var st = new T.Group(); st.position.set(-2.45, 0, 9.65); root.add(st);
      cyl(st, 0.14, 0.13, 0.55, 16, std({ color: C('#5c6670'), roughness: 0.4, metalness: 0.7 }), 0, 0.275, 0, 0, 0, 0, true);
      [[0.04, 0.03, '#1d2a4a'], [-0.05, -0.02, '#7a1e1e']].forEach(function(u){
        var m = std({ color: C(u[2]), roughness: 0.6 });
        cyl(st, 0.012, 0.012, 0.9, 6, m, u[0], 0.5, u[1], 0, 0, u[0] * 2);
        mesh(st, new T.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), std({ color: C('#3a2414'), roughness: 0.5 }), u[0], 0.97, u[1], 0, 0, Math.PI);
      });
      addBox(-2.45, 9.65, 0.3, 0.3, 0.55);
    })();

    // ---------- Fenster mit Jalousie, Fensterbank und Heizkörper -----------
    var frameMat = std({ color: C('#ebe6d8'), roughness: 0.65, metalness: 0 });
    var blindMat = std({ color: C('#e3dccb'), roughness: 0.5, metalness: 0.2, side: T.DoubleSide });
    var radMat = std({ color: C('#e8e5dc'), roughness: 0.45, metalness: 0.3 });
    WIN.forEach(function(wn, wi){
      var g = onWall('front', wn.u, 0, 0), W = wn.w, y0 = 1.3, y1 = 2.95, hh = y1 - y0, cy = (y0 + y1) / 2;
      glass(g, W, hh, wi * 0.48, wi * 0.48 + 0.5 * W / 2, 0.15, 0.95, 0, cy, 0.004);
      box(g, W + 0.16, 0.08, 0.08, frameMat, 0, y1 + 0.04, 0.04);
      box(g, W + 0.16, 0.08, 0.08, frameMat, 0, y0 - 0.04, 0.04);
      box(g, 0.08, hh, 0.08, frameMat, -W / 2 - 0.04, cy, 0.04);
      box(g, 0.08, hh, 0.08, frameMat, W / 2 + 0.04, cy, 0.04);
      box(g, 0.05, hh, 0.06, frameMat, 0, cy, 0.03);
      box(g, W + 0.3, 0.04, 0.22, frameMat, 0, y0 - 0.06, 0.11);            // Fensterbank
      // Jalousie: halb heruntergelassen und schief, eine Lamelle hängt raus
      var bl = new T.Group(); bl.position.set(0, 0, 0.1); bl.rotation.z = wi ? -0.025 : 0.03; g.add(bl);
      box(bl, W + 0.04, 0.05, 0.06, blindMat, 0, y1 - 0.02, 0);
      var bottom = wi ? 2.2 : 2.45;
      for (var s = y1 - 0.08; s > bottom; s -= 0.052){
        var broken = wi === 0 && Math.abs(s - 2.6) < 0.026;
        var sl = box(bl, W - 0.02, 0.004, 0.05, blindMat, broken ? 0.25 : 0, s - (broken ? 0.05 : 0), 0, broken ? 0.3 : 0.95, 0, broken ? -0.18 : 0);
        sl.receiveShadow = false;
      }
      box(bl, W - 0.02, 0.02, 0.05, blindMat, 0, bottom, 0);
      cyl(bl, 0.003, 0.003, y1 - bottom + 0.5, 4, blindMat, W / 2 - 0.12, (y1 + bottom - 0.5) / 2, 0.03);
      // Heizkörper unter dem Fenster
      var rad = new T.Group(); rad.position.set(0, 0, 0.09); g.add(rad);
      for (var f = 0; f < 14; f++) box(rad, 0.05, 0.62, 0.07, radMat, -0.62 + f * 0.095, 0.5, 0);
      box(rad, 1.34, 0.04, 0.07, radMat, 0, 0.83, 0); box(rad, 1.34, 0.04, 0.07, radMat, 0, 0.18, 0);
      cyl(rad, 0.015, 0.015, 0.18, 8, std({ color: C('#d0d0cc'), roughness: 0.3, metalness: 0.8 }), 0.72, 0.1, 0);
      if (wi === 0){
        // vertrocknete Pflanze auf der Fensterbank und ein Zettel an der Scheibe
        var pl = new T.Group(); pl.position.set(-0.55, y0 - 0.04, 0.12); g.add(pl);
        cyl(pl, 0.08, 0.06, 0.13, 12, std({ color: C('#b5603a'), roughness: 0.85 }), 0, 0.065, 0);
        var dry = std({ color: C('#8a6a3a'), roughness: 0.9, side: T.DoubleSide });
        for (var k = 0; k < 6; k++){
          var lf = mesh(pl, new T.PlaneGeometry(0.03, 0.2), dry, 0, 0.2, 0);
          lf.rotation.set(rnd(0.6, 1.6), k * 1.05, rnd(-0.3, 0.3)); lf.translateY(0.08);
        }
        picture(g, 0.24, 0.3, canvas(240, 300, function(c, w, h){
          c.fillStyle = '#fbf7e8'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a3d8a'; c.textAlign = 'center';
          c.font = font(30, HAND, 'bold'); c.fillText('Aushilfe', w / 2, 60); c.fillText('gesucht!', w / 2, 100);
          c.font = font(20, HAND); c.fillText('Bei Interesse', w / 2, 170); c.fillText('bitte fragen', w / 2, 200);
          c.fillStyle = 'rgba(240,230,170,0.7)'; c.fillRect(w / 2 - 30, 0, 60, 18);
        }), { x: 0.55, y: 2.0, z: 0.012, rz: -0.06 });
      } else {
        // Leuchtschild GEÖFFNET im Fenster
        var neonC = canvas(512, 160, function(c, w, h){
          c.clearRect(0, 0, w, h);
          c.lineWidth = 7; c.strokeStyle = '#4fb6ff'; c.shadowColor = '#4fb6ff'; c.shadowBlur = 18;
          c.beginPath(); c.moveTo(30, 20); c.lineTo(w - 30, 20); c.arcTo(w - 12, 20, w - 12, 40, 18); c.lineTo(w - 12, h - 40);
          c.arcTo(w - 12, h - 20, w - 30, h - 20, 18); c.lineTo(30, h - 20); c.arcTo(12, h - 20, 12, h - 40, 18); c.lineTo(12, 40); c.arcTo(12, 20, 30, 20, 18); c.stroke();
          c.font = font(86, 'Arial Rounded MT Bold, Arial', 'bold'); c.textAlign = 'center'; c.lineWidth = 5;
          c.strokeStyle = '#ff3b3b'; c.shadowColor = '#ff2020'; c.shadowBlur = 22; c.strokeText('GEÖFFNET', w / 2, 112);
          c.fillStyle = 'rgba(255,170,170,0.9)'; c.shadowBlur = 0; c.fillText('GEÖFFNET', w / 2, 112);
        });
        var neonMat = basic({ map: ctex(neonC), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
        var neon = mesh(g, new T.PlaneGeometry(0.85, 0.27), neonMat, -0.4, 2.05, 0.035);
        cyl(g, 0.002, 0.002, 0.8, 3, blindMat, -0.78, 2.6, 0.035); cyl(g, 0.002, 0.002, 0.8, 3, blindMat, -0.02, 2.6, 0.035);
        var nt = 0;
        updaters.push(function(dt){
          nt -= dt;
          if (nt < 0){ nt = R() < 0.15 ? rnd(0.04, 0.12) : rnd(1.5, 6); neonMat.opacity = neonMat.opacity < 1 ? 1 : (R() < 0.15 ? 0.35 : 1); }
        });
      }
    });
    addBox(-6, 9.85, 1.4, 0.2, 0.85); addBox(1.6, 9.85, 1.4, 0.2, 0.85);

    // ---------- Gerahmte Bilder -------------------------------------------
    var FRAMES = {
      gold: std({ color: C('#b48b37'), roughness: 0.35, metalness: 0.75 }),
      black: std({ color: C('#1e1c1a'), roughness: 0.5, metalness: 0.1 }),
      wood: std({ color: C('#6b4428'), roughness: 0.55, metalness: 0 }),
      white: std({ color: C('#efece4'), roughness: 0.6, metalness: 0 })
    };
    function framed(w, u, y, pw, ph, c, frame, fw, tilt){
      var g = onWall(w, u, y, 0.02); g.rotation.z = tilt || 0;
      var fm = FRAMES[frame], d = 0.04;
      picture(g, pw, ph, c, { z: 0.005, rough: 0.6 });
      box(g, pw + 2 * fw, fw, d, fm, 0, ph / 2 + fw / 2, 0); box(g, pw + 2 * fw, fw, d, fm, 0, -ph / 2 - fw / 2, 0);
      box(g, fw, ph, d, fm, -pw / 2 - fw / 2, 0, 0); box(g, fw, ph, d, fm, pw / 2 + fw / 2, 0, 0);
      return g;
    }
    // Gemälde
    function oil(c, w, h){ noise(c, w, h, 6000, 'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'); c.fillStyle = 'rgba(200,170,90,0.12)'; c.fillRect(0, 0, w, h); }
    var paintSunset = canvas(512, 384, function(c, w, h){
      var s = c.createLinearGradient(0, 0, 0, h * 0.6); s.addColorStop(0, '#4b3a6b'); s.addColorStop(0.6, '#e2774a'); s.addColorStop(1, '#f3c76a');
      c.fillStyle = s; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffe08a'; c.beginPath(); c.arc(w * 0.62, h * 0.5, 34, 0, Math.PI * 2); c.fill();
      [['#5a3e5e', 0.42], ['#3b2c45', 0.52], ['#24202e', 0.62]].forEach(function(m){
        c.fillStyle = m[0]; c.beginPath(); c.moveTo(0, h);
        for (var x = 0; x <= w; x += 32) c.lineTo(x, h * m[1] + Math.sin(x * 0.013 + m[1] * 9) * 40 + Math.sin(x * 0.05) * 10);
        c.lineTo(w, h); c.fill();
      });
      c.fillStyle = '#2d3f5a'; c.fillRect(0, h * 0.78, w, h * 0.22);
      for (var i = 0; i < 40; i++){ c.fillStyle = 'rgba(255,200,120,' + rnd(0.1, 0.4) + ')'; c.fillRect(w * 0.62 + rnd(-40, 40), h * 0.8 + i * 2, rnd(10, 40), 2); }
      oil(c, w, h);
    });
    var paintCow = canvas(400, 500, function(c, w, h){
      var bg = c.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h / 2, w); bg.addColorStop(0, '#4d6b46'); bg.addColorStop(1, '#1d2a1c');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8e0cf';
      c.beginPath(); c.ellipse(w * 0.22, h * 0.36, 55, 24, -0.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(w * 0.78, h * 0.36, 55, 24, 0.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d9c9a0'; c.beginPath(); c.ellipse(w * 0.33, h * 0.24, 12, 34, -0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(w * 0.67, h * 0.24, 12, 34, 0.6, 0, Math.PI * 2); c.fill();
      c.save(); c.beginPath(); c.ellipse(w / 2, h * 0.5, 115, 170, 0, 0, Math.PI * 2); c.fillStyle = '#efe8da'; c.fill(); c.clip();
      c.fillStyle = '#1b1715';
      [[0.35, 0.36, 50], [0.62, 0.52, 40], [0.45, 0.66, 28]].forEach(function(b){ c.beginPath(); c.ellipse(w * b[0], h * b[1], b[2], b[2] * 1.3, 0.7, 0, Math.PI * 2); c.fill(); });
      c.restore();
      c.fillStyle = '#e7a7a0'; c.beginPath(); c.ellipse(w / 2, h * 0.75, 80, 52, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5a2a28'; c.beginPath(); c.ellipse(w * 0.43, h * 0.76, 12, 8, 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(w * 0.57, h * 0.76, 12, 8, -0.3, 0, Math.PI * 2); c.fill();
      [0.39, 0.61].forEach(function(x){ c.fillStyle = '#111'; c.beginPath(); c.arc(w * x, h * 0.45, 13, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(w * x + 4, h * 0.45 - 4, 4, 0, Math.PI * 2); c.fill(); });
      oil(c, w, h);
    });
    var paintShip = canvas(512, 360, function(c, w, h){
      var s = c.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#5f6a70'); s.addColorStop(0.55, '#b8b9a8'); s.addColorStop(1, '#2a4250');
      c.fillStyle = s; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 18; i++){ c.fillStyle = 'rgba(40,60,70,' + rnd(0.2, 0.5) + ')'; c.beginPath(); c.ellipse(rnd(0, w), h * rnd(0.65, 1), rnd(40, 120), rnd(8, 20), 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#4a2d1a'; c.beginPath(); c.moveTo(w * 0.28, h * 0.68); c.lineTo(w * 0.74, h * 0.68); c.lineTo(w * 0.68, h * 0.8); c.lineTo(w * 0.33, h * 0.8); c.fill();
      c.strokeStyle = '#3a2416'; c.lineWidth = 4;
      [0.38, 0.5, 0.62].forEach(function(x, i){
        c.beginPath(); c.moveTo(w * x, h * 0.68); c.lineTo(w * x, h * (0.2 + i % 2 * 0.06)); c.stroke();
        c.fillStyle = '#e9e2cc';
        [0.25, 0.42].forEach(function(yy){ c.beginPath(); c.moveTo(w * x - 40, h * yy); c.lineTo(w * x + 40, h * yy); c.lineTo(w * x + 34, h * (yy + 0.14)); c.lineTo(w * x - 34, h * (yy + 0.14)); c.fill(); });
      });
      c.fillStyle = 'rgba(255,255,255,0.6)'; for (i = 0; i < 30; i++) c.fillRect(rnd(0, w), h * rnd(0.7, 0.95), rnd(6, 20), 2);
      oil(c, w, h);
    });
    var photoTeam = canvas(512, 380, function(c, w, h){
      c.fillStyle = '#f1ead8'; c.fillRect(0, 0, w, h);
      var bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#b59a72'); bg.addColorStop(1, '#6e5537');
      c.fillStyle = bg; c.fillRect(20, 20, w - 40, h - 80);
      function person(x, y, s){
        c.fillStyle = '#3b2a1a'; c.beginPath(); c.arc(x, y, 15 * s, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e8dcc0'; c.beginPath(); c.moveTo(x - 30 * s, y + 70 * s); c.quadraticCurveTo(x - 30 * s, y + 18 * s, x, y + 18 * s);
        c.quadraticCurveTo(x + 30 * s, y + 18 * s, x + 30 * s, y + 70 * s); c.fill();
        c.fillStyle = '#d7c7a4'; c.beginPath(); c.arc(x, y - 2 * s, 11 * s, 0, Math.PI * 2); c.fill();
      }
      for (var i = 0; i < 6; i++) person(70 + i * 75, 110, 1);
      for (i = 0; i < 5; i++) person(105 + i * 75, 190, 1.05);
      c.fillStyle = '#f5f0e0'; c.beginPath(); c.arc(w / 2, 280, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(90,60,30,0.25)'; c.fillRect(20, 20, w - 40, h - 80);
      c.fillStyle = '#3a2e22'; c.font = font(22, 'Georgia, serif', 'italic'); c.textAlign = 'center';
      c.fillText('SV Blau-Weiß  ·  Saison 1987/88', w / 2, h - 28);
      noise(c, w, h, 3000, 'rgba(60,40,20,0.08)', 'rgba(255,255,255,0.06)');
    });
    var employee = canvas(300, 400, function(c, w, h){
      c.fillStyle = '#f6f0dc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#a32020'; c.font = font(24, 'Georgia, serif', 'bold'); c.textAlign = 'center';
      c.fillText('Mitarbeiter', w / 2, 40); c.fillText('des Monats', w / 2, 68);
      c.fillStyle = '#7c8f9a'; c.fillRect(60, 90, 180, 200);
      c.fillStyle = '#3d3029'; c.beginPath(); c.arc(150, 170, 42, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8cfb0'; c.beginPath(); c.arc(150, 178, 34, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(80, 290); c.quadraticCurveTo(150, 205, 220, 290); c.fill();
      c.fillStyle = '#222'; c.font = font(30, HAND, 'bold'); c.fillText('Bernd', w / 2, 335);
      c.font = font(20, 'Georgia, serif'); c.fillText('März 2014', w / 2, 372);
    });
    framed('left', 10 - 7, 2.55, 1.0, 0.75, paintSunset, 'gold', 0.07, 0.035);      // über Tisch 1 (z = -7)
    framed('left', 10 - 2.33, 2.5, 0.6, 0.75, paintCow, 'gold', 0.1, -0.02);       // Kuh im Goldrahmen
    framed('left', 10 + 2.33, 2.55, 0.95, 0.67, paintShip, 'wood', 0.06, 0.05);    // Segelschiff, schief
    framed('left', 10 + 7, 2.45, 0.8, 0.6, photoTeam, 'black', 0.03, -0.03);       // Mannschaftsfoto
    framed('left', 10 + 0.1, 2.0, 0.3, 0.4, employee, 'white', 0.025, 0.02);       // Mitarbeiter des Monats

    // ausgestopfter Hecht auf Brett
    (function(){
      var g = onWall('left', 10 + 4.66, 2.35, 0.02); g.rotation.z = -0.03;
      box(g, 0.95, 0.32, 0.03, FRAMES.wood, 0, 0, 0);
      var fish = canvas(512, 160, function(c, w, h){
        c.clearRect(0, 0, w, h);
        var b = c.createLinearGradient(0, 30, 0, 130); b.addColorStop(0, '#3e4f2c'); b.addColorStop(0.6, '#8a9a5a'); b.addColorStop(1, '#e2dcb2');
        c.fillStyle = b; c.beginPath(); c.moveTo(20, 80); c.quadraticCurveTo(90, 25, 300, 40); c.quadraticCurveTo(420, 50, 440, 80);
        c.lineTo(500, 40); c.lineTo(492, 80); c.lineTo(500, 122); c.lineTo(440, 82); c.quadraticCurveTo(420, 115, 300, 120); c.quadraticCurveTo(90, 132, 20, 80); c.fill();
        c.fillStyle = 'rgba(230,225,170,0.5)'; for (var i = 0; i < 40; i++){ c.beginPath(); c.ellipse(rnd(80, 420), rnd(55, 100), 7, 3, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#d7c25a'; c.beginPath(); c.arc(70, 70, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(70, 70, 4, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(20, 82); c.lineTo(60, 90); c.stroke();
      });
      picture(g, 0.85, 0.27, fish, { z: 0.025, alpha: true, rough: 0.3 });
      picture(g, 0.22, 0.05, canvas(256, 60, function(c, w, h){
        c.fillStyle = '#c9a54e'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a2a10'; c.font = font(30, 'Georgia, serif', 'italic'); c.textAlign = 'center'; c.fillText('Hecht, 1996', w / 2, 42);
      }), { y: -0.2, z: 0.02, rough: 0.3 });
    })();
    // Hirschgeweih
    (function(){
      var g = onWall('left', 10 - 4.66, 2.75, 0.02);
      cyl(g, 0.2, 0.2, 0.04, 7, FRAMES.wood, 0, 0, 0.02, Math.PI / 2, 0, 0);
      var bone = std({ color: C('#d8c8a6'), roughness: 0.7 });
      var skull = mesh(g, new T.SphereGeometry(0.07, 12, 8), bone, 0, 0.02, 0.07); skull.scale.set(1, 0.8, 0.6);
      [-1, 1].forEach(function(s){
        var main = new T.CatmullRomCurve3([new T.Vector3(s * 0.04, 0.05, 0.08), new T.Vector3(s * 0.18, 0.18, 0.12), new T.Vector3(s * 0.26, 0.38, 0.1), new T.Vector3(s * 0.22, 0.58, 0.06)]);
        mesh(g, new T.TubeGeometry(main, 16, 0.018, 6, false), bone);
        [[0.3, 0.12], [0.55, 0.1], [0.8, 0.09]].forEach(function(t){
          var p = main.getPoint(t[0]);
          var tine = mesh(g, new T.ConeGeometry(0.012, t[1], 6), bone, p.x - s * 0.03, p.y + t[1] / 2, p.z + 0.02);
          tine.rotation.z = s * 0.4;
        });
      });
    })();

    // Lichterkette, die wohl seit Weihnachten 2015 hängt
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
      var wire = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: C('#1f3a1f') }));
      root.add(wire);
      var cols = ['#ff4a3a', '#ffd23a', '#3aa0ff', '#4aff6a', '#ff7af0'];
      var n = pts.length, bulbs = new T.InstancedMesh(new T.SphereGeometry(0.022, 8, 6), basic({ toneMapped: false }), n);
      var mtx = new T.Matrix4(), base = [];
      for (i = 0; i < n; i++){
        mtx.makeTranslation(pts[i].x + 0.01, pts[i].y - 0.03, pts[i].z);
        bulbs.setMatrixAt(i, mtx);
        var dead = R() < 0.18, c = dead ? new T.Color(0.12, 0.12, 0.1) : new T.Color(cols[i % cols.length]).multiplyScalar(1.6);
        base.push({ c: c, dead: dead, ph: R() * 6 }); bulbs.setColorAt(i, c);
      }
      bulbs.frustumCulled = false;   // die Kugeln liegen weit weg vom Ursprung des Meshs
      root.add(bulbs);
      var tmp = new T.Color(), acc = 0;
      updaters.push(function(dt, time){
        acc += dt; if (acc < 0.12) return; acc = 0;
        for (var j = 0; j < n; j++){ if (base[j].dead) continue;
          tmp.copy(base[j].c).multiplyScalar(0.55 + 0.45 * Math.max(0, Math.sin(time * 1.3 + base[j].ph))); bulbs.setColorAt(j, tmp); }
        bulbs.instanceColor.needsUpdate = true;
      });
    })();

    // alter Röhrenfernseher in der Ecke, es läuft Fußball
    (function(){
      var g = new T.Group(); g.position.set(-9.35, 2.95, 9.35); g.rotation.y = Math.PI * 0.75; root.add(g);
      var plastic = std({ color: C('#8a857a'), roughness: 0.6 });
      var black = std({ color: C('#1b1b1b'), roughness: 0.5, metalness: 0.4 });
      box(g, 0.64, 0.5, 0.42, plastic, 0, 0, 0); box(g, 0.46, 0.38, 0.28, plastic, 0, 0.01, -0.3);
      box(g, 0.08, 0.04, 0.5, black, 0, -0.27, -0.25); box(g, 0.5, 0.03, 0.5, black, 0, -0.3, -0.05);
      cyl(g, 0.004, 0.004, 0.45, 4, black, -0.1, 0.42, -0.1, 0, 0, 0.5); cyl(g, 0.004, 0.004, 0.45, 4, black, 0.1, 0.42, -0.1, 0, 0, -0.5);
      var scr = canvas(256, 192, function(){}), sg = scr.getContext('2d'), st = ctex(scr);
      mesh(g, new T.PlaneGeometry(0.5, 0.375), basic({ map: st, toneMapped: true }), -0.02, 0.01, 0.212);
      var players = []; for (var i = 0; i < 12; i++) players.push({ x: R() * 256, y: 40 + R() * 140, s: R() * 6, team: i % 2 });
      var acc = 0, ball = { x: 128, y: 110 };
      function draw(time){
        for (var k = 0; k < 8; k++){ sg.fillStyle = k % 2 ? '#2f7a2f' : '#358a35'; sg.fillRect(k * 32, 0, 32, 192); }
        sg.strokeStyle = 'rgba(255,255,255,0.8)'; sg.lineWidth = 2; sg.strokeRect(8, 30, 240, 155); sg.beginPath(); sg.moveTo(128, 30); sg.lineTo(128, 185); sg.stroke();
        sg.beginPath(); sg.arc(128, 108, 22, 0, Math.PI * 2); sg.stroke();
        ball.x = 128 + Math.sin(time * 0.7) * 90 + Math.sin(time * 2.1) * 20; ball.y = 108 + Math.sin(time * 0.9 + 1) * 50;
        players.forEach(function(p){
          var tx = ball.x + Math.sin(time * 0.5 + p.s) * 60, ty = ball.y + Math.cos(time * 0.4 + p.s * 2) * 45;
          p.x += (tx - p.x) * 0.04; p.y += (ty - p.y) * 0.04;
          sg.fillStyle = p.team ? '#d23a2a' : '#f0f0f0'; sg.fillRect(p.x - 3, p.y - 7, 6, 12);
        });
        sg.fillStyle = '#fff'; sg.fillRect(ball.x - 2, ball.y - 2, 4, 4);
        sg.fillStyle = 'rgba(0,0,0,0.6)'; sg.fillRect(6, 6, 96, 18); sg.fillStyle = '#fff'; sg.font = font(13, 'Arial', 'bold'); sg.fillText('FCH 1 : 1 SVW', 10, 20);
        for (var y = 0; y < 192; y += 3){ sg.fillStyle = 'rgba(0,0,0,0.18)'; sg.fillRect(0, y, 256, 1); }
        if (R() < 0.04){ for (var n2 = 0; n2 < 600; n2++){ sg.fillStyle = R() < 0.5 ? '#000' : '#ddd'; sg.fillRect(R() * 256, R() * 192, 3, 2); } }
        st.needsUpdate = true;
      }
      draw(0);
      updaters.push(function(dt, time){ acc += dt; if (acc > 0.09){ acc = 0; draw(time); } });
      // Wandhalterung
      box(null, 0.05, 0.05, 0.6, black, -9.7, 2.65, 9.7, 0, Math.PI * 0.25, 0);
    })();

    // ---------- Rückwand: Tafel, Uhr, Regal, Automaten, Pflanze, Garderobe ----
    // Kreidetafel mit der Tageskarte
    (function(){
      var g = onWall('back', 10 - 3.5, 2.25, 0.03);
      var board = canvas(1024, 660, function(c, w, h){
        c.fillStyle = '#1f2a25'; c.fillRect(0, 0, w, h);
        for (var i = 0; i < 40; i++){ c.fillStyle = 'rgba(255,255,255,' + rnd(0.01, 0.05) + ')'; c.beginPath(); c.ellipse(rnd(0, w), rnd(0, h), rnd(40, 200), rnd(10, 50), rnd(0, 3), 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#f4f1e6'; c.textAlign = 'center'; c.font = font(72, HAND, 'bold'); c.fillText('Tageskarte', w / 2, 90);
        c.strokeStyle = '#f4f1e6'; c.lineWidth = 3; c.beginPath(); c.moveTo(300, 108); c.quadraticCurveTo(512, 118, 724, 104); c.stroke();
        var items = [['Hot Pot "Spezial"', '8,50'], ['Hot Pot vegetarisch', '7,90'], ['Suppe vom Vortag', '3,00'],
                     ['Schnitzel (fragen!)', '?'], ['Kaffee', '1,80'], ['Bier 0,5', '3,20']];
        c.textAlign = 'left'; c.font = font(40, HAND);
        items.forEach(function(it, i){
          var y = 175 + i * 62; c.fillStyle = i === 3 ? '#ffd86a' : '#f4f1e6';
          c.fillText(it[0], 90, y); c.textAlign = 'right'; c.fillText(it[1] + (it[1] === '?' ? '' : ' €'), w - 90, y); c.textAlign = 'left';
          c.fillStyle = 'rgba(244,241,230,0.35)'; for (var d = 520; d < w - 220; d += 18) c.fillRect(d, y - 8, 5, 4);
        });
        c.fillStyle = '#ff9e9e'; c.font = font(30, HAND); c.textAlign = 'center';
        c.fillText('Kartenzahlung erst ab 20 €  ·  Kein WLAN – redet miteinander!', w / 2, h - 40);
      });
      picture(g, 1.7, 1.1, board, { z: 0.012, rough: 0.95 });
      var fm = FRAMES.wood;
      box(g, 1.84, 0.07, 0.05, fm, 0, 0.585, 0.02); box(g, 1.84, 0.07, 0.05, fm, 0, -0.585, 0.02);
      box(g, 0.07, 1.1, 0.05, fm, -0.885, 0, 0.02); box(g, 0.07, 1.1, 0.05, fm, 0.885, 0, 0.02);
      box(g, 1.7, 0.02, 0.07, fm, 0, -0.63, 0.05);
      box(g, 0.07, 0.015, 0.015, std({ color: C('#f2f0e8'), roughness: 1 }), 0.5, -0.612, 0.06, 0, 0.3, 0);
    })();
    // Wanduhr (zeigt die echte Uhrzeit)
    (function(){
      var g = onWall('back', 10 - 6.6, 3.0, 0.03); g.rotation.z = 0.04;
      picture(g, 0.5, 0.5, canvas(256, 256, function(c, w, h){
        c.fillStyle = '#f3ecd8'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#222'; c.font = font(26, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
        for (var i = 1; i <= 12; i++){ var a = i / 12 * Math.PI * 2; c.fillText(String(i), 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
        for (i = 0; i < 60; i++){ a = i / 60 * Math.PI * 2; c.fillRect(128 + Math.sin(a) * 114 - 1, 128 - Math.cos(a) * 114 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4); }
        c.font = font(14, 'Arial'); c.fillText('QUARZ', 128, 170);
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
    // heller Fleck, wo früher ein Bild hing (mit Nagel)
    (function(){
      var g = onWall('back', 1.5, 2.55, 0.004);
      var m = wpMat.clone(); m.vertexColors = false; m.color = new T.Color(1.08, 1.06, 1.04);
      var geo = new T.PlaneGeometry(0.55, 0.72), uv = geo.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, (1.5 - 0.275 + uv.getX(i) * 0.55) / WP_TILE, (2.55 - 0.36 + uv.getY(i) * 0.72) / WP_TILE);
      mesh(g, geo, m);
      cyl(g, 0.004, 0.004, 0.03, 6, std({ color: C('#777'), metalness: 0.8, roughness: 0.4 }), 0, 0.3, 0.015, Math.PI / 2, 0, 0);
    })();
    // Regal mit Krimskrams
    (function(){
      var g = onWall('back', 10 + 0.3, 2.45, 0.13);
      var wood = std({ color: C('#7a5232'), roughness: 0.6 });
      box(g, 1.6, 0.04, 0.26, wood, 0, 0, 0);
      [-0.6, 0.6].forEach(function(x){ box(g, 0.03, 0.2, 0.03, std({ color: C('#2a2a2a'), metalness: 0.6, roughness: 0.4 }), x, -0.11, -0.11); box(g, 0.03, 0.03, 0.22, std({ color: C('#2a2a2a'), metalness: 0.6, roughness: 0.4 }), x, -0.04, -0.01, 0.6, 0, 0); });
      var gold = std({ color: C('#d4a640'), metalness: 0.9, roughness: 0.25 });
      [[-0.65, 0.3], [-0.48, 0.22]].forEach(function(t){
        var pts = [[0, 0], [0.05, 0], [0.05, 0.02], [0.015, 0.03], [0.012, 0.08], [0.06, t[1] * 0.55], [0.07, t[1] * 0.8], [0.065, t[1]], [0.0, t[1] * 0.6]].map(function(p){ return new T.Vector2(p[0], p[1]); });
        var cup = mesh(g, new T.LatheGeometry(pts, 20), gold, t[0], 0.02, 0); cup.castShadow = true;
        box(g, 0.11, 0.05, 0.11, std({ color: C('#2a1d14'), roughness: 0.5 }), t[0], 0.045, 0);
        cup.position.y = 0.07;
      });
      // Schneekugel
      cyl(g, 0.05, 0.06, 0.04, 16, std({ color: C('#3a2414'), roughness: 0.5 }), -0.22, 0.04, 0.02);
      mesh(g, new T.SphereGeometry(0.06, 16, 12), std({ color: C('#dfe8ee'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 }), -0.22, 0.12, 0.02);
      box(g, 0.035, 0.03, 0.03, std({ color: C('#c84a3a') }), -0.22, 0.09, 0.02);
      // Brettspiele gestapelt
      [['#2c5aa0', 0.05], ['#c8a020', 0.04], ['#8a2a2a', 0.05]].forEach(function(b, i){
        box(g, 0.34 - i * 0.02, b[1], 0.24, std({ color: C(b[0]), roughness: 0.7 }), 0.1, 0.02 + b[1] / 2 + i * 0.048, 0, 0, 0.08 * (i - 1), 0);
      });
      // Porzellanhund
      var por = std({ color: C('#f1ede4'), roughness: 0.25 });
      var dog = new T.Group(); dog.position.set(0.48, 0.02, 0); dog.rotation.y = -0.5; g.add(dog);
      mesh(dog, new T.SphereGeometry(0.05, 12, 8), por, 0, 0.06, 0).scale.set(1, 0.9, 1.4);
      mesh(dog, new T.SphereGeometry(0.035, 12, 8), por, 0, 0.12, 0.06);
      mesh(dog, new T.SphereGeometry(0.015, 8, 6), std({ color: C('#6a4a2a') }), 0.03, 0.135, 0.06).scale.set(0.6, 1.5, 0.6);
      mesh(dog, new T.SphereGeometry(0.015, 8, 6), std({ color: C('#6a4a2a') }), -0.03, 0.135, 0.06).scale.set(0.6, 1.5, 0.6);
      // Bücher, angelehnt
      [['#5a3a2a', 0.2], ['#2f4a3a', 0.18], ['#7a6a4a', 0.22]].forEach(function(b, i){
        box(g, 0.035, b[1], 0.15, std({ color: C(b[0]), roughness: 0.8 }), 0.66 + i * 0.04, 0.02 + b[1] / 2, -0.03, 0, 0, i === 2 ? 0.3 : 0);
      });
    })();
    // Spielautomat
    (function(){
      var g = new T.Group(); g.position.set(-0.85, 0, -9.68); root.add(g);
      var cab = std({ color: C('#4a1414'), roughness: 0.4, metalness: 0.3 });
      var chrome = std({ color: C('#d8d8d8'), roughness: 0.15, metalness: 1 });
      box(g, 0.66, 1.72, 0.5, cab, 0, 0.86, 0); box(g, 0.68, 0.04, 0.52, chrome, 0, 1.0, 0); box(g, 0.68, 0.04, 0.52, chrome, 0, 1.72, 0);
      var reels = canvas(300, 120, function(){}), rg = reels.getContext('2d'), rt = ctex(reels);
      var SYM = ['7', 'cherry', 'BAR', 'bell', 'lemon'];
      function sym(kind, x, y){
        if (kind === '7'){ rg.fillStyle = '#d02020'; rg.font = font(64, 'Arial Black, Arial', 'bold'); rg.fillText('7', x - 18, y + 24); }
        else if (kind === 'BAR'){ rg.fillStyle = '#111'; rg.fillRect(x - 36, y - 16, 72, 32); rg.fillStyle = '#fff'; rg.font = font(24, 'Arial', 'bold'); rg.fillText('BAR', x - 26, y + 9); }
        else if (kind === 'cherry'){ rg.strokeStyle = '#2a6a1a'; rg.lineWidth = 3; rg.beginPath(); rg.moveTo(x - 10, y + 6); rg.quadraticCurveTo(x, y - 30, x + 12, y - 26); rg.moveTo(x + 12, y + 8); rg.lineTo(x + 12, y - 26); rg.stroke();
          rg.fillStyle = '#c01020'; rg.beginPath(); rg.arc(x - 10, y + 12, 12, 0, Math.PI * 2); rg.arc(x + 12, y + 14, 12, 0, Math.PI * 2); rg.fill(); }
        else if (kind === 'bell'){ rg.fillStyle = '#e8b820'; rg.beginPath(); rg.moveTo(x - 24, y + 20); rg.quadraticCurveTo(x - 20, y - 26, x, y - 26); rg.quadraticCurveTo(x + 20, y - 26, x + 24, y + 20); rg.fill(); }
        else { rg.fillStyle = '#f0e040'; rg.beginPath(); rg.ellipse(x, y, 26, 18, 0.3, 0, Math.PI * 2); rg.fill(); }
      }
      var cur = ['7', 'cherry', 'BAR'];
      function drawReels(){
        rg.fillStyle = '#f4f1e8'; rg.fillRect(0, 0, 300, 120);
        for (var i = 0; i < 3; i++){ sym(cur[i], 50 + i * 100, 60); rg.fillStyle = '#333'; if (i) rg.fillRect(i * 100 - 2, 0, 4, 120); }
        rg.fillStyle = 'rgba(0,0,0,0.15)'; rg.fillRect(0, 0, 300, 20); rg.fillRect(0, 100, 300, 20);
        rt.needsUpdate = true;
      }
      drawReels();
      mesh(g, new T.PlaneGeometry(0.5, 0.2), basic({ map: rt }), 0, 1.3, 0.252);
      var hdrMat = basic({ map: ctex(canvas(320, 100, function(c, w, h){
        c.fillStyle = '#1a0a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd030'; c.font = font(54, 'Arial Black, Arial', 'bold'); c.textAlign = 'center'; c.fillText('JACKPOT', w / 2, 70);
        for (var i = 0; i < 16; i++){ c.fillStyle = i % 2 ? '#ff4040' : '#40c0ff'; c.beginPath(); c.arc(10 + i * 20, 8, 5, 0, Math.PI * 2); c.arc(10 + i * 20, h - 8, 5, 0, Math.PI * 2); c.fill(); }
      })), toneMapped: false });
      mesh(g, new T.PlaneGeometry(0.6, 0.19), hdrMat, 0, 1.6, 0.252);
      box(g, 0.5, 0.08, 0.12, chrome, 0, 0.62, 0.28); box(g, 0.08, 0.04, 0.02, std({ color: C('#111') }), 0.15, 1.05, 0.26);
      cyl(g, 0.012, 0.012, 0.3, 8, chrome, 0.36, 1.25, 0.1, 0, 0, -0.2); mesh(g, new T.SphereGeometry(0.035, 12, 8), std({ color: C('#d01818'), roughness: 0.3 }), 0.39, 1.4, 0.1);
      shadow(g); addBox(-0.85, -9.68, 0.7, 0.55, 1.72);
      var spin = 0, next = 6, acc = 0, blink = 0;
      updaters.push(function(dt){
        next -= dt; blink += dt;
        hdrMat.color.setScalar(Math.sin(blink * 6) > 0 ? 1 : 0.75);
        if (next < 0){ spin = 1.6; next = rnd(8, 16); }
        if (spin > 0){ spin -= dt; acc += dt; if (acc > 0.07){ acc = 0; for (var i = 0; i < 3; i++) if (spin > i * 0.3) cur[i] = pick(SYM); drawReels(); } }
      });
    })();
    // Getränkekühlschrank
    (function(){
      var g = new T.Group(); g.position.set(1.65, 0, -9.62); root.add(g);
      var white = std({ color: C('#ece9e2'), roughness: 0.4, metalness: 0.1 });
      box(g, 0.8, 1.95, 0.66, white, 0, 0.975, 0);
      var inside = canvas(256, 512, function(c, w, h){
        c.fillStyle = '#d8ecf2'; c.fillRect(0, 0, w, h);
        var bc = ['#2a6a2a', '#8a4a1a', '#c8c020', '#d03020', '#2050a0', '#e0e0d8'];
        for (var row = 0; row < 5; row++){
          var y = 40 + row * 96; c.fillStyle = '#9aa4a8'; c.fillRect(0, y + 70, w, 6);
          for (var x = 14; x < w - 20; x += 30){
            if (R() < 0.12) continue;   // Lücken: ziemlich leergekauft
            c.fillStyle = bc[(row * 3 + Math.floor(x / 30)) % bc.length];
            c.fillRect(x, y + 14, 20, 56); c.fillRect(x + 6, y, 8, 16);
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 3, y + 20, 4, 44);
          }
        }
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, h);
      });
      mesh(g, new T.PlaneGeometry(0.62, 1.5), basic({ map: ctex(inside), color: new T.Color(0.9, 0.95, 1) }), 0, 1.0, 0.332);
      var hdr = basic({ map: ctex(canvas(320, 64, function(c, w, h){
        c.fillStyle = '#b01818'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = font(34, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('Kalte Getränke', w / 2, 44);
      })) });
      mesh(g, new T.PlaneGeometry(0.72, 0.14), hdr, 0, 1.86, 0.332);
      box(g, 0.03, 0.4, 0.04, std({ color: C('#bbb'), metalness: 0.9, roughness: 0.3 }), 0.34, 1.05, 0.35);
      shadow(g); addBox(1.65, -9.62, 0.82, 0.68, 1.95);
    })();
    // Gummibaum (ein paar Blätter schon braun)
    (function(){
      var g = new T.Group(); g.position.set(-5.3, 0, -9.45); root.add(g);
      cyl(g, 0.24, 0.18, 0.42, 20, std({ color: C('#a7542f'), roughness: 0.85 }), 0, 0.21, 0);
      cyl(g, 0.22, 0.22, 0.02, 20, std({ color: C('#3a2a1a'), roughness: 1 }), 0, 0.4, 0);
      cyl(g, 0.02, 0.025, 1.4, 8, std({ color: C('#5a4a2a'), roughness: 0.8 }), 0, 1.1, 0);
      var leafC = canvas(128, 256, function(c, w, h){
        c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.45, h * 0.48, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w / 2, h - 10); c.stroke();
      });
      var lt = ctex(leafC);
      var green = std({ map: lt, color: C('#2f5a28'), roughness: 0.35, alphaTest: 0.5, side: T.DoubleSide });
      var brown = std({ map: lt, color: C('#7a5a2a'), roughness: 0.8, alphaTest: 0.5, side: T.DoubleSide });
      for (var i = 0; i < 16; i++){
        var y = 0.6 + i * 0.065, a = i * 2.4;
        var piv = new T.Group(); piv.position.set(0, y, 0); piv.rotation.y = a; g.add(piv);
        var lf = mesh(piv, new T.PlaneGeometry(0.16, 0.32), i === 2 || i === 9 ? brown : green, 0, 0, 0.17, -1.0 - rnd(0, 0.4), 0, 0);
        lf.castShadow = true;
      }
      addBox(-5.3, -9.45, 0.48, 0.48, 0.42);
    })();
    // Garderobe mit vergessener Jacke, Hut und Schirm
    (function(){
      var g = new T.Group(); g.position.set(-9.45, 0, -9.45); root.add(g);
      var wood = std({ color: C('#3d2416'), roughness: 0.5 });
      cyl(g, 0.025, 0.03, 1.85, 10, wood, 0, 0.925, 0);
      for (var i = 0; i < 4; i++) box(g, 0.04, 0.03, 0.36, wood, Math.sin(i * Math.PI / 2) * 0.16, 0.03, Math.cos(i * Math.PI / 2) * 0.16, 0, i * Math.PI / 2, 0);
      for (i = 0; i < 4; i++) cyl(g, 0.01, 0.012, 0.16, 6, wood, Math.sin(i * 1.57 + 0.78) * 0.07, 1.74, Math.cos(i * 1.57 + 0.78) * 0.07, Math.cos(i * 1.57 + 0.78) * 0.7, 0, -Math.sin(i * 1.57 + 0.78) * 0.7);
      mesh(g, new T.SphereGeometry(0.04, 10, 8), wood, 0, 1.87, 0);
      var jacket = std({ color: C('#5b5b3a'), roughness: 0.9 });
      var jk = box(g, 0.42, 0.75, 0.14, jacket, 0.13, 1.33, 0.13, 0.08, 0.78, 0.04); jk.castShadow = true;
      box(g, 0.12, 0.6, 0.1, jacket, 0.29, 1.32, 0.0, 0, 0.78, 0.1); box(g, 0.12, 0.6, 0.1, jacket, -0.02, 1.32, 0.27, 0, 0.78, -0.1);
      var hat = std({ color: C('#2a2a2e'), roughness: 0.8 });
      cyl(g, 0.17, 0.17, 0.012, 20, hat, -0.06, 1.8, -0.06, 0.2, 0, 0.1); cyl(g, 0.1, 0.11, 0.12, 20, hat, -0.06, 1.86, -0.06, 0.2, 0, 0.1);
      var um = std({ color: C('#20302a'), roughness: 0.6 });
      mesh(g, new T.ConeGeometry(0.06, 0.85, 8), um, -0.2, 0.45, 0.12, 0, 0, 0.18);
      addBox(-9.45, -9.45, 0.45, 0.45, 1.85);
    })();

    // ---------- Trennwand (Gastseite): Dartscheibe, Plakate, Schilder --------
    (function(){
      // Dartscheibe
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
      var board = cyl(g, 0.23, 0.23, 0.04, 40, [std({ color: C('#222') }), std({ map: ctex(dart), roughness: 0.9 }), std({ color: C('#222') })], 0, 0, 0, Math.PI / 2, 0, 0);
      board.rotation.y = Math.PI / 2; board.rotation.set(Math.PI / 2, 0, 0);
      var dm = std({ color: C('#c0c0c0'), metalness: 0.9, roughness: 0.3 }), fl = std({ color: C('#e0402a'), side: T.DoubleSide });
      [[0.05, 0.08], [-0.1, -0.03], [0.02, -0.12]].forEach(function(p){
        var d = new T.Group(); d.position.set(p[0], p[1], 0.02); d.rotation.set(rnd(-0.2, 0.2), rnd(-0.2, 0.2), 0); g.add(d);
        cyl(d, 0.006, 0.003, 0.12, 6, dm, 0, 0, 0.06, Math.PI / 2, 0, 0);
        mesh(d, new T.PlaneGeometry(0.04, 0.05), fl, 0, 0, 0.14, Math.PI / 2, 0, 0); mesh(d, new T.PlaneGeometry(0.04, 0.05), fl, 0, 0, 0.14, Math.PI / 2, Math.PI / 2, 0);
      });
      // Kreidetafel mit Spielstand
      picture(onWall('part', 10 + 9.2, 1.7, 0.02), 0.36, 0.5, canvas(200, 280, function(c, w, h){
        c.fillStyle = '#1f2a25'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2f0e6'; c.font = font(26, HAND, 'bold'); c.textAlign = 'center';
        c.fillText('BERND', 52, 40); c.fillText('KLAUS', 150, 40); c.fillRect(w / 2 - 1, 15, 2, h - 30); c.fillRect(10, 52, w - 20, 2);
        c.font = font(24, HAND); ['501', '377', '212'].forEach(function(s, i){ c.fillText(s, 52, 90 + i * 40); });
        ['501', '41'].forEach(function(s, i){ c.fillText(s, 150, 90 + i * 40); });
      }), { rough: 0.95 });
      // Plakat vom Schützenfest 2009 (verblichen)
      picture(onWall('part', 10 + 6.5, 2.7, 0.012), 0.55, 0.78, canvas(330, 470, function(c, w, h){
        c.fillStyle = '#e9e0c4'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#2a6aa8'; c.fillRect(0, 0, w, 120);
        c.fillStyle = '#f6f0dc'; c.font = font(44, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('Schützenfest', w / 2, 60); c.font = font(34, 'Georgia, serif'); c.fillText('2009', w / 2, 102);
        c.fillStyle = '#8a2a20'; c.font = font(24, 'Arial', 'bold'); ['Festzelt am Sportplatz', 'Sa 18. Juli ab 14 Uhr', 'Live: Die Dorfrocker', 'Eintritt frei!'].forEach(function(s, i){ c.fillText(s, w / 2, 190 + i * 52); });
        c.fillStyle = 'rgba(240,230,200,0.45)'; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(220,210,150,0.8)'; c.fillRect(0, 0, 50, 20); c.fillRect(w - 50, 0, 50, 20);
      }), { rz: 0.02, rough: 0.9 });
      // Zettel: Katze vermisst, mit Abreißstreifen
      picture(onWall('part', 10 + 6.6, 1.6, 0.012), 0.3, 0.42, canvas(240, 336, function(c, w, h){
        c.fillStyle = '#fafaf4'; c.fillRect(0, 0, w, h); c.fillStyle = '#c01010'; c.font = font(34, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('VERMISST!', w / 2, 44);
        c.fillStyle = '#777'; c.fillRect(50, 60, 140, 100); c.fillStyle = '#e8a040'; c.beginPath(); c.ellipse(120, 120, 40, 30, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(90, 100); c.lineTo(96, 76); c.lineTo(108, 96); c.moveTo(132, 96); c.lineTo(144, 76); c.lineTo(150, 100); c.fill();
        c.fillStyle = '#222'; c.font = font(19, 'Arial'); ['Kater "Mausi"', 'hört auf nichts.', 'Bitte melden!'].forEach(function(s, i){ c.fillText(s, w / 2, 190 + i * 24); });
        for (var i = 0; i < 8; i++){ if (i === 2 || i === 5) continue; c.save(); c.translate(15 + i * 30, h - 4); c.rotate(-Math.PI / 2); c.font = font(11, 'Arial'); c.fillText('0172 55 ...', 30, 4); c.restore();
          c.fillStyle = '#ccc'; c.fillRect(i * 30, h - 70, 1, 70); c.fillStyle = '#222'; }
      }), { rz: -0.04, rough: 0.9 });
      // Kalender von 2019 neben der Küchentür
      picture(onWall('part', 0.6, 2.2, 0.012), 0.36, 0.56, canvas(240, 372, function(c, w, h){
        c.fillStyle = '#f8f6ee'; c.fillRect(0, 0, w, h);
        var sky = c.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, '#6aa0d8'); sky.addColorStop(1, '#d8e8f0'); c.fillStyle = sky; c.fillRect(10, 10, w - 20, 150);
        c.fillStyle = '#4a7a3a'; c.beginPath(); c.moveTo(10, 160); c.lineTo(80, 80); c.lineTo(140, 130); c.lineTo(190, 70); c.lineTo(w - 10, 120); c.lineTo(w - 10, 160); c.fill();
        c.fillStyle = '#222'; c.font = font(24, 'Georgia, serif', 'bold'); c.textAlign = 'center'; c.fillText('Juli 2019', w / 2, 192);
        c.font = font(14, 'Arial');
        for (var d = 0; d < 31; d++){ var col = (d + 0) % 7, row = Math.floor(d / 7); c.fillStyle = col === 6 ? '#c02020' : '#333'; c.fillText(String(d + 1), 25 + col * 32, 225 + row * 30); }
        c.strokeStyle = '#c02020'; c.lineWidth = 2; c.beginPath(); c.arc(25 + 3 * 32, 225 + 2 * 30 - 5, 13, 0, Math.PI * 2); c.stroke();
      }), { rough: 0.9 });
      // Rauchverbot-Schild (Emaille)
      picture(onWall('part', 0.6, 3.1, 0.012), 0.3, 0.2, canvas(240, 160, function(c, w, h){
        c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c01818'; c.lineWidth = 10; c.beginPath(); c.arc(60, 80, 46, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#333'; c.fillRect(30, 72, 60, 14); c.beginPath(); c.moveTo(28, 48); c.lineTo(94, 112); c.stroke();
        c.fillStyle = '#222'; c.font = font(22, 'Arial', 'bold'); c.textAlign = 'left'; c.fillText('Bitte nicht', 116, 72); c.fillText('rauchen', 116, 102);
      }), { rough: 0.3 });
      // WC-Schild (durch die Küche ...)
      picture(onWall('part', 10 - 6.55, 2.7, 0.012), 0.46, 0.2, canvas(368, 160, function(c, w, h){
        c.fillStyle = '#1f6a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = font(64, 'Arial', 'bold'); c.textAlign = 'left'; c.fillText('WC', 24, 82);
        c.beginPath(); c.moveTo(150, 60); c.lineTo(230, 60); c.lineTo(230, 40); c.lineTo(270, 70); c.lineTo(230, 100); c.lineTo(230, 80); c.lineTo(150, 80); c.fill();
        c.font = font(20, 'Arial'); c.fillText('durch die Küche, dann links', 24, 136);
      }), { rough: 0.4 });
    })();

    // ---------- Boden: Rutschgefahr-Schild, Leergutkisten ---------------------
    (function(){
      var g = new T.Group(); g.position.set(1.05, 0, 7.6); g.rotation.y = 0.5; root.add(g);
      var sign = canvas(256, 400, function(c, w, h){
        c.fillStyle = '#f5c800'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.textAlign = 'center';
        c.beginPath(); c.moveTo(w / 2, 40); c.lineTo(w - 40, 170); c.lineTo(40, 170); c.closePath(); c.lineWidth = 10; c.strokeStyle = '#111'; c.stroke();
        c.beginPath(); c.arc(w / 2 + 8, 92, 9, 0, Math.PI * 2); c.fill(); c.lineWidth = 7;
        c.beginPath(); c.moveTo(w / 2 + 4, 104); c.lineTo(w / 2 - 12, 140); c.lineTo(w / 2 - 30, 150); c.moveTo(w / 2 - 6, 124); c.lineTo(w / 2 + 22, 146); c.stroke();
        c.font = font(40, 'Arial', 'bold'); c.fillText('VORSICHT', w / 2, 240); c.font = font(30, 'Arial', 'bold'); c.fillText('Rutschgefahr', w / 2, 290);
      });
      var mat = std({ map: ctex(sign), roughness: 0.4, side: T.DoubleSide });
      [-1, 1].forEach(function(s){ var p = mesh(g, new T.PlaneGeometry(0.3, 0.62), mat, 0, 0.3, s * 0.08, s * 0.25, s < 0 ? Math.PI : 0, 0); p.castShadow = true; });
      addBox(1.05, 7.6, 0.35, 0.3, 0.62);
      // Leergutkisten in der Ecke
      var crate = std({ map: ctex(canvas(256, 192, function(c, w, h){
        c.fillStyle = '#2d5a2d'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d3d1d'; c.fillRect(20, 20, w - 40, 40);
        c.fillStyle = '#e8e2c8'; c.font = font(36, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('LEERGUT', w / 2, 130);
        noise(c, w, h, 800, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.1)');
      })), roughness: 0.6 });
      for (var i = 0; i < 3; i++){
        var cr = box(null, 0.3, 0.29, 0.4, crate, 3.15 + (i === 2 ? 0.02 : 0), 0.145 + i * 0.29, 9.45, 0, i === 1 ? 0.08 : (i === 2 ? -0.1 : 0), 0);
        cr.castShadow = true;
        for (var b = 0; b < 6; b++) cyl(null, 0.03, 0.03, 0.06, 8, std({ color: C('#3a2a10'), roughness: 0.2 }), 3.08 + (b % 2) * 0.14, 0.29 * (i + 1) + 0.03, 9.3 + Math.floor(b / 2) * 0.14, 0, 0, 0, false).visible = i === 2;
      }
      addBox(3.15, 9.45, 0.32, 0.42, 0.87);
    })();

    // ---------- abgelaufener, fleckiger Boden im Gastraum ---------------------
    (function(){
      var W = X1 + 10, c = canvas(1024, 1480, function(g, w, h){
        g.clearRect(0, 0, w, h);
        var sx = w / W, sz = h / 20;   // Pixel pro Meter
        function blot(x, z, r, a, col){
          var gr = g.createRadialGradient((x + 10) * sx, (z + 10) * sz, 0, (x + 10) * sx, (z + 10) * sz, r * sx);
          gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = gr; g.beginPath(); g.arc((x + 10) * sx, (z + 10) * sz, r * sx, 0, Math.PI * 2); g.fill();
        }
        // Laufwege: Eingang -> Theke, Eingang -> Tische, vor der Theke
        for (var t = 0; t <= 1; t += 0.04){ blot(-1.3 + (2.0 - -1.3) * t, 9 - 9 * t, 1.1, 0.13, '70,50,30'); blot(-1.3 - 4.2 * t, 9 - 9 * t, 1.0, 0.12, '70,50,30'); }
        for (var z = -5.5; z <= 5.5; z += 0.5) blot(2.3, z, 0.9, 0.12, '60,45,25');
        // unter den Tischen und vor den Automaten
        [-7, -2.33, 2.33, 7].forEach(function(tz){ blot(-7.5, tz, 1.6, 0.15, '60,45,25'); });
        blot(-0.85, -9.1, 0.7, 0.1, '50,35,20'); blot(1.65, -9.0, 0.6, 0.08, '50,35,20');
        // einzelne Flecken (Bier, Kaffee ...)
        for (var i = 0; i < 26; i++) blot(rnd(-9.5, X1 - 0.5), rnd(-9.5, 9.5), rnd(0.08, 0.3), rnd(0.12, 0.25), pick(['90,60,25', '60,40,20', '110,80,40']));
        noise(g, w, h, 20000, 'rgba(40,30,20,0.05)', 'rgba(40,30,20,0.03)');
      });
      mesh(null, new T.PlaneGeometry(W, 20), std({ map: ctex(c), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
           (X1 - 10) / 2, 0.003, 0, -Math.PI / 2, 0, 0);
    })();

    // ---------- Plastik-Gartenmöbel in der Mitte (keiner weiß, warum) ---------
    var plastic = std({ color: C('#ece8dc'), roughness: 0.45, metalness: 0 });
    function monobloc(parent, x, z, ry, tilt){
      var g = new T.Group(); g.position.set(x, 0, z); g.rotation.set(0, ry, tilt || 0); parent.add(g);
      var seat = 0.58;
      box(g, 0.5, 0.035, 0.46, plastic, 0, seat, 0);
      [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]].forEach(function(p){
        var leg = cyl(g, 0.022, 0.03, seat, 8, plastic, p[0] * 1.08, seat / 2, p[1] * 1.08); leg.rotation.set(-p[1] * 0.25, 0, p[0] * 0.25);
      });
      var back = new T.Group(); back.position.set(0, seat, -0.22); back.rotation.x = -0.18; g.add(back);
      box(back, 0.48, 0.06, 0.03, plastic, 0, 0.46, 0);
      for (var i = 0; i < 5; i++) box(back, 0.05, 0.42, 0.025, plastic, -0.18 + i * 0.09, 0.22, 0);
      box(g, 0.04, 0.03, 0.4, plastic, -0.25, seat + 0.2, -0.02); box(g, 0.04, 0.03, 0.4, plastic, 0.25, seat + 0.2, -0.02);
      box(g, 0.03, 0.2, 0.03, plastic, -0.25, seat + 0.1, 0.17); box(g, 0.03, 0.2, 0.03, plastic, 0.25, seat + 0.1, 0.17);
      shadow(g);
      return g;
    }
    function patioSet(x, z, chairs, umbrella){
      var g = new T.Group(); g.position.set(x, 0, z); root.add(g);
      var top = 0.72;
      cyl(g, 0.45, 0.45, 0.03, 32, plastic, 0, top, 0);
      for (var i = 0; i < 4; i++){ var a = i * Math.PI / 2 + 0.78; var leg = cyl(g, 0.025, 0.03, top, 8, plastic, Math.cos(a) * 0.3, top / 2, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
      chairs.forEach(function(ch){ monobloc(g, Math.cos(ch[0]) * 0.72, Math.sin(ch[0]) * 0.72, -ch[0] - Math.PI / 2 + (ch[1] || 0), ch[2]); });
      if (umbrella){
        cyl(g, 0.018, 0.018, 2.3, 8, std({ color: C('#d8d8d8'), metalness: 0.7, roughness: 0.3 }), 0, 1.15, 0);
        var cloth = std({ color: C('#2f6a8a'), roughness: 0.8 });
        for (var k = 0; k < 8; k++) box(g, 0.05, 1.05, 0.015, cloth, Math.cos(k * 0.785) * 0.06, 1.75, Math.sin(k * 0.785) * 0.06, Math.sin(k * 0.785) * 0.06, -k * 0.785, Math.cos(k * 0.785) * 0.06);
        mesh(g, new T.ConeGeometry(0.03, 0.08, 8), std({ color: C('#888') }), 0, 2.33, 0);
        picture(g, 0.18, 0.04, canvas(256, 60, function(c, w, h){ c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#c01818'; c.font = font(36, 'Arial', 'bold'); c.textAlign = 'center'; c.fillText('Eis am Stiel', w / 2, 44); }), { y: 1.6, z: 0.07, rough: 0.6 });
      }
      // Aschenbecher und Bierdeckel
      cyl(g, 0.06, 0.05, 0.03, 16, std({ color: C('#b8c0c4'), metalness: 0.8, roughness: 0.3 }), 0.1, top + 0.03, -0.05);
      cyl(g, 0.05, 0.05, 0.004, 20, std({ color: C('#f2ecd8'), roughness: 0.9 }), -0.15, top + 0.017, 0.12);
      g.traverse(function(m){ if (m.isMesh) m.castShadow = true; });
      addBox(x, z, 0.9, 0.9, top);
      chairs.forEach(function(ch){ addBox(x + Math.cos(ch[0]) * 0.72, z + Math.sin(ch[0]) * 0.72, 0.5, 0.5, 0.58); });
    }
    patioSet(-3.2, -5.6, [[0.3], [2.4, 0.4], [4.1, -0.2]], false);
    patioSet(-2.6, 5.0, [[1.2], [3.6, 0.2, 0]], true);
    // ein umgekippter Stuhl daneben
    var fallen = monobloc(root, -1.3, 3.4, 0.6, 0);
    fallen.rotation.set(Math.PI / 2 - 0.1, 0.6, 0, 'YXZ'); fallen.position.y = 0.24;
    addBox(-1.3, 3.4, 0.7, 0.7, 0.5);

    // ---------- Decke: Lampen über den Tischen, Ventilator, Neonröhren, Flecken ---
    var lampSpots = [[-7.5, -7], [-7.5, -2.33], [-7.5, 2.33], [-7.5, 7]];
    var cordMat = std({ color: C('#151515'), roughness: 0.6 });
    var bulbMat = basic({ color: new T.Color(1, 0.86, 0.6).multiplyScalar(2.2), toneMapped: false });
    lampSpots.forEach(function(p, i){
      var drop = [1.35, 1.5, 1.4, 1.3][i], y = H - drop;
      var g = new T.Group(); g.position.set(p[0], y, p[1]); root.add(g);
      cyl(g, 0.006, 0.006, drop, 4, cordMat, 0, drop / 2, 0);
      cyl(null, 0.06, 0.06, 0.03, 12, cordMat, p[0], H - 0.015, p[1]);
      mesh(g, new T.SphereGeometry(0.045, 12, 8), bulbMat, 0, -0.1, 0);
      if (i === 0){        // grüne Emaillelampe
        mesh(g, new T.SphereGeometry(0.24, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: C('#2f5e3e'), roughness: 0.3, metalness: 0.2, side: T.DoubleSide }), 0, -0.2, 0);
        cyl(g, 0.04, 0.04, 0.1, 12, std({ color: C('#2f5e3e'), roughness: 0.3 }), 0, 0.02, 0);
      } else if (i === 1){ // bunter Glasschirm, ziemlich kitschig
        var mosaic = ctex(canvas(512, 128, function(c, w, h){
          var cols = ['#c8402a', '#e8b030', '#3a8a5a', '#2a5aa8', '#e8d8b0', '#8a3a7a'];
          for (var x = 0; x < w; x += 24) for (var yy = 0; yy < h; yy += 20){ c.fillStyle = cols[Math.floor(R() * cols.length)]; c.fillRect(x + 1, yy + 1, 22, 18); }
          c.fillStyle = '#2a2014'; for (x = 0; x < w; x += 24) c.fillRect(x, 0, 2, h); for (yy = 0; yy < h; yy += 20) c.fillRect(0, yy, w, 2);
        }));
        cyl(g, 0.08, 0.3, 0.24, 24, std({ map: mosaic, emissive: new T.Color(1, 1, 1), emissiveMap: mosaic, emissiveIntensity: 0.55, roughness: 0.3, side: T.DoubleSide }), 0, -0.12, 0, 0, 0, 0, true);
      } else if (i === 2){ // Stoffschirm
        cyl(g, 0.24, 0.27, 0.26, 24, std({ color: C('#e9dcc0'), emissive: C('#ffcf8a'), emissiveIntensity: 0.45, roughness: 1, side: T.DoubleSide }), 0, -0.12, 0, 0, 0, 0, true);
      } else {             // Milchglaskugel
        mesh(g, new T.SphereGeometry(0.17, 20, 14), std({ color: C('#f4eee2'), emissive: C('#ffdcaa'), emissiveIntensity: 0.9, roughness: 0.4 }), 0, -0.14, 0);
      }
      var light = new T.PointLight(0xffc98a, 0.95, 6.5, 2);
      light.position.set(p[0], y - 0.15, p[1]); root.add(light);
    });
    // Deckenventilator (eiert leicht, ein Flügel hängt)
    (function(){
      var g = new T.Group(); g.position.set(-3.2, H, 0.2); root.add(g);
      var bronze = std({ color: C('#6a4a2a'), roughness: 0.35, metalness: 0.7 });
      cyl(g, 0.012, 0.012, 0.45, 8, bronze, 0, -0.225, 0);
      var rotor = new T.Group(); rotor.position.y = -0.5; g.add(rotor);
      cyl(rotor, 0.15, 0.17, 0.16, 20, bronze, 0, 0, 0);
      mesh(rotor, new T.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: C('#f2e8cf'), emissive: C('#ffd7a0'), emissiveIntensity: 0.6, roughness: 0.4 }), 0, -0.08, 0);
      var bladeMat = std({ color: C('#7a4e2c'), roughness: 0.5 });
      for (var i = 0; i < 5; i++){
        var arm = new T.Group(); arm.rotation.y = i / 5 * Math.PI * 2; rotor.add(arm);
        box(arm, 0.06, 0.015, 0.03, bronze, 0.2, 0, 0);
        var bl = box(arm, 0.7, 0.012, 0.16, bladeMat, 0.58, -0.005, 0, 0.12, 0, i === 3 ? -0.07 : 0);
        bl.castShadow = false;
      }
      updaters.push(function(dt, time){ rotor.rotation.y += dt * 2.6; g.rotation.x = Math.sin(time * 2.6) * 0.012; g.rotation.z = Math.cos(time * 2.6) * 0.012; });
    })();
    // Neonröhren über der Theke: eine flackert, eine ist kaputt
    (function(){
      var housing = std({ color: C('#e9e9e4'), roughness: 0.5, metalness: 0.3 });
      var onMat = basic({ color: new T.Color(0.92, 0.97, 1).multiplyScalar(1.6), toneMapped: false });
      var offMat = std({ color: C('#8a8f90'), roughness: 0.4 });
      [[-2.2, true], [2.2, false]].forEach(function(f){
        var g = new T.Group(); g.position.set(2.3, H - 0.05, f[0]); root.add(g);
        box(g, 0.16, 0.06, 1.55, housing, 0, 0, 0);
        var tube = cyl(g, 0.018, 0.018, 1.45, 10, f[1] ? onMat : offMat, 0, -0.05, 0, Math.PI / 2, 0, 0);
        if (f[1]){
          var light = new T.PointLight(0xe8f2ff, 0.55, 6, 2); light.position.set(2.3, H - 0.3, f[0]); root.add(light);
          var t = 0;
          updaters.push(function(dt){
            t -= dt;
            if (t < 0){
              var off = R() < 0.25 && onMat.color.r > 1;
              onMat.color.setScalar(off ? 0.25 : 1).multiply(new T.Color(0.92, 0.97, 1)).multiplyScalar(off ? 1 : 1.6);
              light.intensity = off ? 0.1 : 0.55;
              t = off ? rnd(0.03, 0.09) : rnd(0.5, 5);
            }
          });
        }
      });
    })();
    // fehlende Deckenplatte mit raushängendem Kabel
    (function(){
      mesh(null, new T.PlaneGeometry(1.25, 1.25), basic({ color: C('#16120e') }), -0.625, H - 0.004, 5.625, Math.PI / 2, 0, 0);
      var curve = new T.CatmullRomCurve3([new T.Vector3(-0.4, H + 0.05, 5.4), new T.Vector3(-0.35, H - 0.25, 5.5), new T.Vector3(-0.25, H - 0.5, 5.65), new T.Vector3(-0.15, H - 0.35, 5.8)]);
      mesh(null, new T.TubeGeometry(curve, 20, 0.008, 6, false), std({ color: C('#d8d2c0'), roughness: 0.6 }));
      // Wasserflecken an der Decke
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

    // ---------- Theke: Kasse, Trinkgeldglas, Erdnüsse, Klingel (sobald sie geladen ist) ---
    var barDone = false;
    function dressBar(){
      var bar = scene.getObjectByName('bar');
      if (!bar) return;
      barDone = true;
      bar.updateMatrixWorld(true);
      // Oberkante aus der Begrenzungsbox (Raycasting rechnet die komprimierten
      // Vertex-Daten der Modelle in three.js r128 nicht richtig zurück)
      var barTop = new T.Box3().setFromObject(bar).max.y;
      if (!(barTop > 0.5 && barTop < 3)) barTop = 1.47;
      function topAt(){ return barTop; }
      var x = PART.x - 0.3;
      // Registrierkasse
      var reg = new T.Group(); reg.position.set(x, topAt(x, -3.9), -3.9); reg.rotation.y = -Math.PI / 2 - 0.25; root.add(reg);
      var beige = std({ color: C('#cfc5ad'), roughness: 0.5 });
      box(reg, 0.42, 0.1, 0.4, beige, 0, 0.05, 0); box(reg, 0.42, 0.12, 0.2, beige, 0, 0.16, -0.08, -0.5, 0, 0);
      picture(reg, 0.38, 0.14, canvas(256, 96, function(c, w, h){
        c.fillStyle = '#3a3a3a'; c.fillRect(0, 0, w, h);
        for (var r = 0; r < 3; r++) for (var k = 0; k < 8; k++){ c.fillStyle = k > 5 ? '#c84030' : '#eee'; c.fillRect(8 + k * 31, 8 + r * 29, 24, 22); }
      }), { y: 0.106, z: 0.07, rx: -Math.PI / 2 + 0.25, rough: 0.5 });
      box(reg, 0.2, 0.09, 0.04, std({ color: C('#222') }), 0, 0.3, -0.14, -0.2, 0, 0);
      picture(reg, 0.16, 0.05, canvas(160, 50, function(c, w, h){ c.fillStyle = '#103010'; c.fillRect(0, 0, w, h); c.fillStyle = '#5aff6a'; c.font = font(30, 'Courier New', 'bold'); c.fillText('0,00', 40, 36); }), { glow: true, y: 0.3, z: -0.118, rx: -0.2 });
      reg.traverse(function(m){ if (m.isMesh) m.castShadow = true; });
      // Trinkgeldglas
      var jar = new T.Group(); jar.position.set(x + 0.05, topAt(x + 0.05, -3.1), -3.1); root.add(jar);
      cyl(jar, 0.07, 0.065, 0.16, 20, std({ color: C('#e6eef0'), roughness: 0.05, transparent: true, opacity: 0.35 }), 0, 0.08, 0, 0, 0, 0, true);
      var coin = std({ color: C('#b88a3a'), metalness: 0.9, roughness: 0.3 });
      for (var i = 0; i < 9; i++) cyl(jar, 0.012, 0.012, 0.003, 10, coin, rnd(-0.04, 0.04), 0.004 + i * 0.004, rnd(-0.04, 0.04), rnd(0, 0.5), 0, rnd(0, 0.5));
      picture(jar, 0.11, 0.045, canvas(220, 90, function(c, w, h){ c.fillStyle = '#fffbe8'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = font(30, HAND, 'bold'); c.textAlign = 'center'; c.fillText('Trinkgeld', w / 2, 40); c.font = font(20, HAND); c.fillText('danke :)', w / 2, 74); }), { y: 0.1, z: 0.071, rough: 0.8 }).rotation.y = 0;
      jar.rotation.y = -Math.PI / 2;
      // Schale mit Erdnüssen
      var bowl = new T.Group(); bowl.position.set(x, topAt(x, 1.4), 1.4); root.add(bowl);
      mesh(bowl, new T.SphereGeometry(0.1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: C('#8a2a20'), roughness: 0.3, side: T.DoubleSide }), 0, 0.1, 0);
      var nut = std({ color: C('#c08a4a'), roughness: 0.8 });
      for (i = 0; i < 18; i++){ var a = R() * 6.28, r = R() * 0.07; mesh(bowl, new T.SphereGeometry(0.014, 6, 4), nut, Math.cos(a) * r, 0.04 + R() * 0.03, Math.sin(a) * r).scale.set(1, 0.8, 1.5); }
      // Tischklingel
      var bell = new T.Group(); bell.position.set(x - 0.05, topAt(x - 0.05, 4.3), 4.3); root.add(bell);
      cyl(bell, 0.045, 0.05, 0.015, 16, std({ color: C('#222') }), 0, 0.008, 0);
      mesh(bell, new T.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: C('#d8d8d8'), metalness: 1, roughness: 0.15 }), 0, 0.015, 0);
      // Speisekarten im Ständer
      var menus = new T.Group(); menus.position.set(x, topAt(x, 2.6), 2.6); menus.rotation.y = -Math.PI / 2 + 0.2; root.add(menus);
      box(menus, 0.12, 0.05, 0.08, std({ color: C('#3a2a1a') }), 0, 0.025, 0);
      [['#7a1e1e', 0], ['#7a1e1e', 0.02], ['#1e3a6a', 0.04]].forEach(function(m){ box(menus, 0.2, 0.28, 0.006, std({ color: C(m[0]), roughness: 0.4 }), 0, 0.15, -0.02 + m[1], -0.06); });
    }

    // ---------- Tische: Tischdecken und Kram -------------------------------
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
      tex.repeat.set(w / 0.75, d / 0.75);   // Karos ca. 9 cm groß
      var mat = std({ map: tex, roughness: 0.9, side: T.DoubleSide });
      var g = new T.Group(); g.position.set(spot[0], top + 0.004, spot[1]); root.add(g);
      mesh(g, new T.PlaneGeometry(w, d), mat, 0, 0, 0, -Math.PI / 2, 0, 0);
      [[0, -d / 2, 0, w], [0, d / 2, 0, w], [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d]].forEach(function(s){
        var sg = new T.PlaneGeometry(s[3], hang), suv = sg.attributes.uv, full = s[3] === w ? w : d;
        for (var k = 0; k < suv.count; k++) suv.setXY(k, suv.getX(k) * s[3] / full, suv.getY(k) * hang / d);
        mesh(g, sg, mat, s[0], -hang / 2, s[1], 0, s[2], 0);
      });
      if (cl[1]){   // Kaffeefleck
        mesh(g, new T.PlaneGeometry(0.16, 0.16), std({ map: ctex(canvas(128, 128, function(c, ww, hh){
          c.clearRect(0, 0, ww, hh); c.strokeStyle = 'rgba(110,70,30,0.55)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 46, 0.3, 5.9); c.stroke();
          c.fillStyle = 'rgba(130,90,40,0.18)'; c.beginPath(); c.arc(64, 64, 46, 0, 6.3); c.fill();
        })), transparent: true, depthWrite: false, roughness: 1 }), 0.32, 0.002, 0.12, -Math.PI / 2, 0, 0);
      }
      var p = new T.Group(); p.position.set(spot[0], top + 0.006, spot[1]); root.add(p);
      // Serviettenspender
      var steel = std({ color: C('#c8cacc'), metalness: 0.9, roughness: 0.3 });
      box(p, 0.14, 0.012, 0.08, steel, -0.2, 0.006, 0); box(p, 0.14, 0.1, 0.006, steel, -0.2, 0.06, -0.035); box(p, 0.14, 0.1, 0.006, steel, -0.2, 0.06, 0.035);
      box(p, 0.12, 0.09, 0.06, std({ color: C('#fbfaf6'), roughness: 1 }), -0.2, 0.055, 0);
      // Salz und Pfeffer
      [['#f6f6f2', -0.04], ['#3a3a3a', 0.04]].forEach(function(sp){
        cyl(p, 0.018, 0.02, 0.07, 12, std({ color: C('#e8eef0'), roughness: 0.05, transparent: true, opacity: 0.6 }), -0.04, 0.035, sp[1]);
        cyl(p, 0.015, 0.015, 0.05, 10, std({ color: C(sp[0]), roughness: 0.9 }), -0.04, 0.026, sp[1]);
        mesh(p, new T.SphereGeometry(0.02, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, -0.04, 0.07, sp[1]);
      });
      // Ketchup und Senf
      [['#c41a12', 0.07, 0.03], ['#e2b818', 0.13, -0.03]].forEach(function(b){
        cyl(p, 0.028, 0.028, 0.16, 12, std({ color: C(b[0]), roughness: 0.35 }), b[1], 0.08, b[2]);
        mesh(p, new T.ConeGeometry(0.02, 0.05, 10), std({ color: C(b[0]), roughness: 0.35 }), b[1], 0.185, b[2]);
      });
      if (i === 0 || i === 2){   // Kerze in der Weinflasche, Wachs läuft runter
        var bottle = std({ color: C('#1f4a2a'), roughness: 0.1, metalness: 0.1 });
        var bp = [[0, 0], [0.04, 0], [0.04, 0.17], [0.03, 0.21], [0.015, 0.24], [0.015, 0.29], [0, 0.29]].map(function(q){ return new T.Vector2(q[0], q[1]); });
        mesh(p, new T.LatheGeometry(bp, 16), bottle, 0.28, 0, 0.01);
        var wax = std({ color: C('#f1e6c8'), roughness: 0.6 });
        cyl(p, 0.012, 0.012, 0.12, 10, wax, 0.28, 0.35, 0.01);
        for (var k = 0; k < 5; k++) cyl(p, 0.006, 0.004, rnd(0.04, 0.12), 6, wax, 0.28 + Math.cos(k * 1.3) * 0.02, 0.26, 0.01 + Math.sin(k * 1.3) * 0.02);
        var flame = mesh(p, new T.ConeGeometry(0.008, 0.03, 8), basic({ color: new T.Color(1, 0.7, 0.3).multiplyScalar(2), toneMapped: false }), 0.28, 0.43, 0.01);
        updaters.push(function(dt, time){ var s = 1 + Math.sin(time * 13 + i) * 0.12 + Math.sin(time * 31 + i) * 0.08; flame.scale.set(1, s, 1); flame.rotation.z = Math.sin(time * 7 + i) * 0.1; });
      }
      if (i === 1){   // Plastikblume in der Vase
        cyl(p, 0.025, 0.03, 0.12, 12, std({ color: C('#e8e8e2'), roughness: 0.2 }), 0.25, 0.06, -0.02);
        cyl(p, 0.003, 0.003, 0.2, 4, std({ color: C('#3a7a2a') }), 0.25, 0.2, -0.02, 0, 0, 0.12);
        mesh(p, new T.SphereGeometry(0.035, 10, 6), std({ color: C('#e83a6a'), roughness: 0.6 }), 0.237, 0.3, -0.02).scale.set(1, 0.5, 1);
      }
      if (i === 3){   // Reserviert (aber keiner kommt)
        var card = canvas(256, 100, function(c, ww, hh){ c.fillStyle = '#fbf7ea'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#222'; c.font = font(40, 'Georgia, serif', 'italic'); c.textAlign = 'center'; c.fillText('Reserviert', ww / 2, 64); });
        var cm = std({ map: ctex(card), roughness: 0.8, side: T.DoubleSide });
        mesh(p, new T.PlaneGeometry(0.16, 0.065), cm, 0.25, 0.03, 0.013, -0.35, 0, 0); mesh(p, new T.PlaneGeometry(0.16, 0.065), cm, 0.25, 0.03, -0.013, 0.35, Math.PI, 0);
      }
      if (i === 0){   // liegengelassene Zeitung
        mesh(p, new T.PlaneGeometry(0.28, 0.38), std({ map: ctex(canvas(280, 380, function(c, ww, hh){
          c.fillStyle = '#e9e5da'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#111'; c.font = font(34, 'Georgia, serif', 'bold'); c.fillText('Tageblatt', 14, 40);
          c.font = font(18, 'Georgia, serif', 'bold'); c.fillText('Kreisel am Marktplatz', 14, 80); c.fillText('wird wieder aufgerissen', 14, 102);
          for (var r = 0; r < 20; r++){ c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(14 + (r % 2) * 130, 120 + Math.floor(r / 2) * 22, 120, 6); }
          c.fillStyle = '#8a8a80'; c.fillRect(14, 350, 250, 20);
        })), roughness: 0.95 }), -0.48, 0.001, 0.15, -Math.PI / 2, 0, 0.3);
      }
    }

    // ein paar Stühle passen nicht zum Rest
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
