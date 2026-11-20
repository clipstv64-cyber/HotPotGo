// Gameplay: stains appear on the restaurant floor from time to time; the broom
// lives in the cleaning closet (E takes it / puts it back, E anywhere else drops it
// where you stand); with the broom in hand, aim at a stain and left-click to sweep it
// away. A small, unobtrusive hint at the bottom of the screen shows which key does what
// when something can be used.
//
// Used from index.html:
//   gameplay = HotPotGameplay.build({ scene, camera, canvas, getChef, getChefLift, obstacles, bounds, BACKROOMS, getDoor })
//   gameplay.interact()             // on E
//   gameplay.update(delta, time)    // every frame
//   gameplay.afterAnimation(delta)  // every frame, after the character animation
(function(){
  'use strict';
  var T = THREE;

  var STAIN = {
    first: 3,                 // seconds until the first stains appear
    every: [18, 40],          // seconds between new stains
    max: 6,                   // at most this many at once
    size: [0.7, 1.15],        // metres across
    area: { x0: -9.2, x1: 2.2, z0: -9.2, z1: 9.2 },   // guest room floor
    near: 0.9, far: 2.2       // how close / far away (from the chef) a stain can be swept
  };
  var SWEEP = {
    over: 0.3,                // seconds for the bristles to move onto the stain
    strokes: 3, stroke: 0.62, // back-and-forth strokes, and seconds for each
    back: 0.35,               // seconds to come back to rest
    width: 0.36               // how far each stroke goes to either side
  };
  var USE_REACH = 1.6;        // how close you need to be to pick up / put back the broom
  var FLOOR_REACH = 2.0;      // ... and to pick it up from the floor (to its nearest part)
  var TAKE_TIME = 0.5;        // seconds for the broom to come into the hands / go back to its place

  var TEST = new URLSearchParams(location.search);   // test settings (self-test only)

  function clamp(v, a, b){ return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
  function smooth(x){ x = clamp(x); return x * x * (3 - 2 * x); }
  function angle(a){ return Math.atan2(Math.sin(a), Math.cos(a)); }   // -PI .. PI

  function build(ctx){
    var scene = ctx.scene, camera = ctx.camera, canvas = ctx.canvas;
    var root = new T.Group(); root.name = 'gameplay'; scene.add(root);
    if (!camera.parent) scene.add(camera);

    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };
    var UP = V(0, 1, 0), IDENT = new T.Quaternion();
    function wpos(o){ var v = V(); o.getWorldPosition(v); return v; }
    function wquat(o){ var q = new T.Quaternion(); o.getWorldQuaternion(q); return q; }
    function setWorldQuat(o, q){ o.quaternion.copy(wquat(o.parent).invert().multiply(q)); o.updateMatrixWorld(true); }
    // turns a bone around a world axis
    function turn(o, axis, a){ setWorldQuat(o, new T.Quaternion().setFromAxisAngle(axis, a).multiply(wquat(o))); }
    function chefLift(){ return ctx.getChefLift ? ctx.getChefLift() : 0; }

    // ---------- hint at the bottom of the screen ------------------------------
    var css = document.createElement('style');
    css.textContent =
      '.hp-hint{position:fixed;left:50%;bottom:9%;transform:translateX(-50%) translateY(6px);display:flex;align-items:center;gap:8px;' +
      'padding:6px 12px;border-radius:999px;background:rgba(15,12,10,.38);color:rgba(255,255,255,.88);font:500 14px/1.2 system-ui,"Segoe UI",sans-serif;' +
      'letter-spacing:.2px;opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none;user-select:none;backdrop-filter:blur(2px)}' +
      '.hp-hint.on{opacity:1;transform:translateX(-50%) translateY(0)}' +
      '.hp-hint.dim{color:rgba(255,255,255,.6)}' +
      '.hp-key{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:5px;' +
      'border:1px solid rgba(255,255,255,.55);font:600 12px/1 system-ui,"Segoe UI",sans-serif;box-sizing:border-box}' +
      '.hp-mouse{width:14px;height:20px;display:inline-block}' +
      '.hp-dot{position:fixed;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:rgba(255,255,255,.55);' +
      'box-shadow:0 0 2px rgba(0,0,0,.6);opacity:0;transition:opacity .15s;pointer-events:none}' +
      '.hp-dot.on{opacity:1}.hp-dot.hit{background:rgba(255,255,255,.9);width:6px;height:6px;margin:-3px 0 0 -3px}';
    document.head.appendChild(css);
    var hint = document.createElement('div'); hint.className = 'hp-hint'; document.body.appendChild(hint);
    var dot = document.createElement('div'); dot.className = 'hp-dot'; document.body.appendChild(dot);
    var MOUSE_SVG = '<svg class="hp-mouse" viewBox="0 0 14 20" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.3">' +
      '<rect x="1" y="1" width="12" height="18" rx="6"/><line x1="7" y1="1" x2="7" y2="8"/>' +
      '<path d="M7 1.6 A5.4 5.4 0 0 0 1.6 7 L1.6 8 L7 8 Z" fill="rgba(255,255,255,.75)" stroke="none"/></svg>';
    var shownHint = '';
    function setHint(html, dim){
      var key = (html || '') + (dim ? '|d' : '');
      if (key === shownHint) return;
      shownHint = key;
      if (!html){ hint.classList.remove('on'); return; }
      hint.innerHTML = html;
      hint.classList.toggle('dim', !!dim);
      hint.classList.add('on');
    }
    function keyHint(k, label){ return '<span class="hp-key">' + k + '</span><span>' + label + '</span>'; }

    // ---------- Meshy broom ---------------------------------------------------
    var gltf = new T.GLTFLoader();
    if (window.MeshoptDecoder) gltf.setMeshoptDecoder(MeshoptDecoder);
    function loadBroom(done){
      fetch('models/d_broom_single.glb')
        .then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(buf){ gltf.parse(buf, '', function(g){ done(g.scene); }, function(e){ console.error('Could not load the broom:', e); }); })
        .catch(function(e){ console.error('Could not load the broom:', e); });
    }
    // reads vertex i of a mesh; packed (quantized) models store whole numbers that stand
    // for fractions, which three.js r128 does not convert by itself
    function vertexOf(pos, i, v){
      v.fromBufferAttribute(pos, i);
      if (pos.normalized){
        var a = pos.array;
        v.multiplyScalar(1 / (a instanceof Int16Array ? 32767 : a instanceof Uint16Array ? 65535 : a instanceof Int8Array ? 127 : a instanceof Uint8Array ? 255 : 1));
      }
      return v;
    }
    // scales a model to a height and stands it on its own origin
    function fit(obj, height){
      var bb = new T.Box3().setFromObject(obj), s = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3());
      var k = height / s.y; obj.scale.setScalar(k);
      obj.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      return obj;
    }
    // The underside of the bristle head: a slightly uneven disc just inside the shell's
    // lower edge, painted with cut straw ends in the model's own colours.
    var PLUG_AT = [0.03, 0.09], PLUG_Y = 0.045;   // the slice of the head it is fitted to, and its height
    function strawEnds(model){
      // how wide the shell is down there (its inner bristles, not the stray ones)
      var rs = [], v = V(), cx = 0, cz = 0, n = 0, map = null;
      held.updateMatrixWorld(true);
      var inv = new T.Matrix4().copy(held.matrixWorld).invert();
      model.traverse(function(m){
        if (!m.isMesh) return;
        map = map || m.material.map;
        var pos = m.geometry.attributes.position, mat = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        for (var i = 0; i < pos.count; i++){
          vertexOf(pos, i, v).applyMatrix4(mat);
          if (v.y > PLUG_AT[0] && v.y < PLUG_AT[1]){ rs.push([v.x, v.z]); cx += v.x; cz += v.z; n++; }
        }
      });
      if (n < 12) return null;
      cx /= n; cz /= n;
      var radii = rs.map(function(p){ return Math.hypot(p[0] - cx, p[1] - cz); }).sort(function(a, b){ return a - b; });
      var R = radii[Math.floor(radii.length * 0.35)];
      // the model's average colour, for straw that matches
      var col = [196, 158, 84];
      try {
        var c0 = document.createElement('canvas'); c0.width = c0.height = 16;
        var g0 = c0.getContext('2d'); g0.drawImage(map.image, 0, 0, 16, 16);
        var px = g0.getImageData(0, 0, 16, 16).data, sum = [0, 0, 0];
        for (var i = 0; i < px.length; i += 4){ sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; }
        col = sum.map(function(x){ return x / (px.length / 4); });
      } catch (e) { /* keep the default straw colour */ }
      function shade(k){ return 'rgb(' + col.map(function(x){ return Math.round(clamp(x * k, 0, 255)); }).join(',') + ')'; }
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var g = cv.getContext('2d');
      g.fillStyle = shade(0.58); g.fillRect(0, 0, 256, 256);
      for (var d = 0; d < 1500; d++){   // each straw's cut end: a small light dot with a dark middle
        var x = Math.random() * 256, y = Math.random() * 256, rr = 2.2 + Math.random() * 2.6;
        g.fillStyle = shade(0.78 + Math.random() * 0.3);
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
        g.fillStyle = shade(0.62);
        g.beginPath(); g.arc(x, y, rr * 0.35, 0, Math.PI * 2); g.fill();
      }
      var tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
      var geo = new T.CircleGeometry(1, 28), pos = geo.attributes.position;
      geo.rotateX(-Math.PI / 2);
      for (var j = 1; j < pos.count; j++) pos.setY(j, Math.random() * 0.02);   // the rim a little ragged
      geo.computeVertexNormals();
      var disc = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, side: T.DoubleSide }));
      disc.scale.set(R * 0.97, 1, R * 0.97); disc.position.set(cx, PLUG_Y, cz);
      disc.castShadow = false; disc.receiveShadow = true; disc.frustumCulled = false;
      disc.name = 'straw ends';
      return disc;
    }
    var B = ctx.BACKROOMS;
    var BROOM_LEN = 1.8;                    // game units (the chef with his hat is 2.4)
    var GRIP_TOP = 0.09, GRIP_GAP = 0.24;   // upper hand below the handle's top end; lower hand below the upper one
    var PALM = 0.07;                        // the middle of the palm, past the wrist bone
    var HANDLE_R = 0.022;                   // handle radius (game units)
    var THUMB_FOLLOW = 0.5;                 // how much the thumb goes along with the first finger segment
    var KNUCKLE_AT = 0.6;                   // knuckles as a share of the hand length (from the wrist)
    var JOINT_BLEND = 0.35;                 // skin blend at each finger joint (share of the finger length)
    var FOREARM_TWIST = 0.7;                // share of the wrist twist taken by the forearm
    // How the chef holds it. His arms are short, so the upper body helps: it leans forward
    // and turns the right shoulder to the front. All in his own frame [right, up, front].
    var POSE = {
      lean: 0.24, twist: 0.2,               // upper body: forward lean, turn to the left (radians)
      clavL: 0.3, clavR: 0.4,               // shoulders pushed forward (radians)
      hand: [0.03, 0.34],                   // upper (left) hand, from the middle between the shoulders [right, front]
      handY: [-0.2, 0.06],                  // ... and how far below / above the shoulders it may go
      tip: [0.4, 1.68],                     // bristles on the floor, from the chef [right, front]
      press: 0.4,                           // resting on the floor, the bristles are pressed in by this share of their overhang
      carry: 0.14                           // lifted this much while walking or turning
    };
    // the broom in its place: leaning in the corner of the cleaning closet
    var broomSpot = new T.Vector3(B.x1 - 0.32, 0, B.z1 + 0.42);
    var standing = new T.Group(); standing.position.copy(broomSpot); standing.rotation.set(0.12, 0.6, -0.16); root.add(standing);
    // the broom anywhere else (in the hands, on its way, falling, lying on the floor);
    // its origin is the lower end of the bristles, its Y axis runs up the handle
    var held = new T.Group(); held.visible = false; root.add(held);
    loadBroom(function(src){
      var a = fit(src.clone(true), BROOM_LEN); a.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
      standing.add(a);
      var b = fit(src.clone(true), BROOM_LEN); b.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
      held.add(b);
      measureBroom();
      // the model's bristle head is only a hollow shell: close it with the cut straw ends
      var plug = strawEnds(b);
      if (plug){ held.add(plug); standing.add(plug.clone()); }
    });
    // where the broom is: 'closet', 'taking' (on its way into the hands), 'hand',
    // 'storing' (on its way back to the closet), 'falling' or 'floor'
    var broomAt = 'closet', holding = false;
    var move = null;   // taking / storing: { t: 0..1, pos, quat (the place it comes from / goes to), bow }
    function setBroom(where){
      broomAt = where; holding = where === 'hand';
      standing.visible = where === 'closet'; held.visible = where !== 'closet';
    }
    function takeBroom(){   // from the closet or from the floor
      if (broomAt === 'closet'){ held.position.copy(standing.position); held.quaternion.copy(standing.quaternion); }
      move = { t: 0, pos: held.position.clone(), quat: held.quaternion.clone(), bow: broomAt === 'floor' ? 1 : 0.2 };
      setBroom('taking');
    }
    function storeBroom(){
      move = { t: 0, pos: standing.position.clone(), quat: standing.quaternion.clone(), bow: 0.2 };
      setBroom('storing');
    }
    // is something standing there (furniture, a wall)?
    function blocked(x, z){
      var W = ctx.bounds;
      if (W && (x < W.x0 + 0.1 || x > W.x1 - 0.1 || z < W.z0 + 0.1 || z > W.z1 - 0.1)) return true;
      for (var i = 0; i < ctx.obstacles.length; i++){
        var o = ctx.obstacles[i];
        if (o.top !== undefined && o.top < 0.12) continue;
        if (x > o.minX - 0.06 && x < o.maxX + 0.06 && z > o.minZ - 0.06 && z < o.maxZ + 0.06) return true;
      }
      return false;
    }

    // how much of the line from (ax, az) to (bx, bz) is blocked: 0 = free .. 1 = all of it
    function blockedLine(ax, az, bx, bz){
      var n = 0, N = 8;
      for (var i = 1; i <= N; i++) if (blocked(ax + (bx - ax) * i / N, az + (bz - az) * i / N)) n++;
      return n / N;
    }

    // ---------- dropping it ---------------------------------------------------------
    // Let go, it first drops to the floor (if it was lifted) and tips over around its
    // bristles: from the way it was leaning it swings round to a free side, so it does
    // not land on the chef, and stays lying where it fell.
    var fall = null;   // { tip, sink, vy, a, a0, w, az0, dAz, roll, bounces }
    var A_END = Math.PI / 2 + 0.1;   // how far it tips: lying on its bristle head and the end of the handle (measured below)
    var basisM = new T.Matrix4();
    // The broom's outline: for each slice of its length, how far it reaches to either side
    // along its own X and Z. From it: how high its origin has to be, in any position, so
    // that no part of it is under the floor.
    var outline = null, SLICES = 36;
    function measureBroom(){
      var ax = new Array(SLICES).fill(0), az = new Array(SLICES).fill(0), v = V();
      held.updateMatrixWorld(true);
      var inv = new T.Matrix4().copy(held.matrixWorld).invert();
      held.traverse(function(m){
        if (!m.isMesh) return;
        var pos = m.geometry.attributes.position, mat = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        for (var i = 0; i < pos.count; i++){
          vertexOf(pos, i, v).applyMatrix4(mat);
          var k = clamp(Math.floor(v.y / BROOM_LEN * SLICES), 0, SLICES - 1);
          ax[k] = Math.max(ax[k], Math.abs(v.x)); az[k] = Math.max(az[k], Math.abs(v.z));
        }
      });
      // the plain handle has hardly any vertices: slices without one are as thick as the handle
      for (var k = 0; k < SLICES; k++){ ax[k] = Math.max(ax[k], HANDLE_R); az[k] = Math.max(az[k], HANDLE_R); }
      outline = { ax: ax, az: az };
      // lying down: it tips until the end of the handle touches the floor too
      for (var a = Math.PI / 2; a < Math.PI / 2 + 0.6; a += 0.002){
        groundLift(fallQuat(a, 0));
        if (groundLift.slice >= SLICES - 2){ A_END = a; break; }
      }
    }
    var gX = V(), gY = V(), gZ = V();
    function groundLift(q){
      if (!outline) return 0.05;
      gX.set(1, 0, 0).applyQuaternion(q); gY.set(0, 1, 0).applyQuaternion(q); gZ.set(0, 0, 1).applyQuaternion(q);
      var best = -1e9, step = BROOM_LEN / SLICES;
      for (var k = 0; k < SLICES; k++){
        var h = Math.hypot(outline.ax[k] * gX.y, outline.az[k] * gZ.y) - Math.min(k * step * gY.y, (k + 1) * step * gY.y);
        if (h > best){ best = h; groundLift.slice = k; }
      }
      return best;
    }
    function fallQuat(a, az){
      var h = V(Math.sin(az), 0, Math.cos(az));
      var y = UP.clone().multiplyScalar(Math.cos(a)).addScaledVector(h, Math.sin(a));
      var x = V().crossVectors(UP, h).normalize(), z = V().crossVectors(x, y);
      return new T.Quaternion().setFromRotationMatrix(basisM.makeBasis(x, y, z));
    }
    function dropBroom(){
      var chef = ctx.getChef(), th = chef ? chef.rotation.y : 0;
      var f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
      var u = V(0, 1, 0).applyQuaternion(held.quaternion), tip = held.position.clone();
      var a0 = Math.min(Math.acos(clamp(u.y, -1, 1)), 1.3);
      var h0 = V(u.x, 0, u.z); if (h0.lengthSq() < 1e-6) h0.copy(r); h0.normalize();
      // to his right if there is room, else the side with the most room
      var sides = [[1, -0.25], [-1, -0.25], [0.8, 0.6], [-0.8, 0.6], [0, 1], [0.7, -0.7], [-0.7, -0.7]], h1 = null, least = 2;
      for (var i = 0; i < sides.length && least > 0; i++){
        var h = r.clone().multiplyScalar(sides[i][0]).addScaledVector(f, sides[i][1]).normalize();
        var bl = blockedLine(tip.x, tip.z, tip.x + h.x * BROOM_LEN, tip.z + h.z * BROOM_LEN);
        if (bl < least){ least = bl; h1 = h; }
      }
      var az0 = Math.atan2(h0.x, h0.z);
      // tip.y: how high its lowest point is above the floor; sink: how deep the bristles
      // were pressed into the floor while holding it (they come out as it falls)
      var low = tip.y - groundLift(held.quaternion);
      tip.y = Math.max(0, low);
      fall = { tip: tip, sink: Math.min(0, low), vy: 0, a: a0, a0: a0, w: 0.5, az0: az0, dAz: angle(Math.atan2(h1.x, h1.z) - az0), bounces: 0 };
      fall.roll = fallQuat(a0, az0).invert().multiply(held.quaternion);   // keeps it from jumping at the start
      setBroom('falling');
    }
    function stepFall(dt){
      var f = fall;
      if (f.tip.y > 0){ f.vy -= 20 * dt; f.tip.y = Math.max(0, f.tip.y + f.vy * dt); }
      f.w += 7.5 * Math.sin(Math.max(0.05, f.a)) * dt;   // falls faster the further it leans
      f.a += f.w * dt;
      if (f.a >= A_END){
        f.a = A_END;
        if (f.bounces < 2 && f.w > 0.6){ f.w = -f.w * 0.28; f.bounces++; }   // a little bounce
        else if (f.tip.y <= 0){ f.w = 0; setBroom('floor'); }
      }
      var p = smooth((f.a - f.a0) / (A_END - f.a0));
      held.quaternion.copy(fallQuat(f.a, f.az0 + f.dAz * p)).multiply(f.roll.clone().slerp(IDENT, p));
      held.position.copy(f.tip); held.position.y += groundLift(held.quaternion) + f.sink * (1 - p);
    }

    // ---------- holding pose: two-bone IK for both arms ------------------------------
    // turns a bone so the direction from it to its child points along `to` (world)
    function aim(bone, child, to){
      var from = wpos(child).sub(wpos(bone)).normalize();
      var q = new T.Quaternion().setFromUnitVectors(from, to.clone().normalize());
      setWorldQuat(bone, q.multiply(wquat(bone)));
    }
    // upper arm -> forearm -> hand: the wrist (or a point `extra` past it) reaching
    // `target`, the elbow bending towards `pole`
    function reach(upper, lower, hand, target, pole, extra){
      var s = wpos(upper), L1 = s.distanceTo(wpos(lower)), L2 = wpos(lower).distanceTo(wpos(hand)) + (extra || 0);
      var toT = target.clone().sub(s), d = Math.max(0.05, Math.min(toT.length(), (L1 + L2) * 0.999)), dir = toT.normalize();
      var a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      var p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      aim(upper, lower, dir.clone().multiplyScalar(Math.cos(a)).add(p.multiplyScalar(Math.sin(a))));
      aim(lower, hand, target.clone().sub(wpos(lower)));
    }
    var bones = null;
    function findBones(chef){
      if (bones && bones.root === chef) return bones;
      var g = function(n){ return chef.getObjectByName(n); };
      var b = { root: chef, spine02: g('Spine02'), spine01: g('Spine01'), spine: g('Spine'), neck: g('neck'),
                lS: g('LeftShoulder'), rS: g('RightShoulder'),
                rA: g('RightArm'), rF: g('RightForeArm'), rH: g('RightHand'),
                lA: g('LeftArm'), lF: g('LeftForeArm'), lH: g('LeftHand') };
      if (!b.rA || !b.rF || !b.rH || !b.lA || !b.lF || !b.lH || !b.spine) return null;
      b.lGrip = makeGrip(chef, 'Left'); b.rGrip = makeGrip(chef, 'Right');
      // the bones the holding pose changes, parents first; `anim` is what the animation
      // gave them this frame, `set` what the pose made of it
      b.rig = [b.spine02, b.spine01, b.spine, b.neck, b.lS, b.rS, b.lA, b.lF, b.lH, b.rA, b.rF, b.rH].filter(Boolean)
        .map(function(bone){ return { bone: bone, anim: new T.Quaternion(), set: new T.Quaternion(), own: false }; });
      bones = b;
      return b;
    }

    // The chef's rig has no finger bones (the fingers are part of the hand), so for
    // gripping each hand gets an extra "finger" bone at the knuckles: the finger
    // vertices are moved over to it, and turning it closes the fingers around the handle.
    // Returns the hand's frame in its own bone space: finger direction, palm direction,
    // the knuckle line, and the point in the middle of the closed fist.
    var AX = ['getX', 'getY', 'getZ', 'getW'], SX = ['setX', 'setY', 'setZ', 'setW'];
    function gc(a, i, k){ return a[AX[k]](i); }
    function sc(a, i, k, v){ a[SX[k]](i, v); }
    function makeGrip(chef, side){
      var mesh = null;
      chef.traverse(function(o){ if (!mesh && o.isSkinnedMesh) mesh = o; });
      if (!mesh) return null;
      var sk = mesh.skeleton, hi = sk.bones.findIndex(function(b){ return b.name === side + 'Hand'; });
      if (hi < 0) return null;
      var hand = sk.bones[hi], geo = mesh.geometry, pos = geo.attributes.position;
      var si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      var toLocal = new T.Matrix4().multiplyMatrices(sk.boneInverses[hi], mesh.bindMatrix);
      var v = V(), idx = [], local = [];
      for (var i = 0; i < si.count; i++){
        var w = 0;
        for (var k = 0; k < 4; k++) if (gc(si, i, k) === hi) w += gc(sw, i, k);
        if (w > 0.5){ idx.push(i); local.push(v.fromBufferAttribute(pos, i).applyMatrix4(toLocal).clone()); }
      }
      if (!idx.length) return null;
      // finger direction: from the wrist toward the centre of the hand
      var c = V(); local.forEach(function(p){ c.add(p); });
      var finger = c.divideScalar(local.length).normalize();
      var maxT = 0; local.forEach(function(p){ maxT = Math.max(maxT, p.dot(finger)); });
      // palm direction: the side the fingers are already bent toward (the fingertips
      // lie off the finger axis on the palm side)
      var tipC = V(), n = 0;
      local.forEach(function(p){ if (p.dot(finger) > maxT * 0.8){ tipC.add(p); n++; } });
      tipC.divideScalar(Math.max(1, n));
      var palm = tipC.sub(finger.clone().multiplyScalar(tipC.dot(finger)));
      // the thumb side is the other way: if the bend is too small to tell, use the
      // direction of least thickness
      palm.normalize();
      var knuckles = V().crossVectors(finger, palm).normalize();
      palm = V().crossVectors(knuckles, finger).normalize();
      var t0 = maxT * (+TEST.get('t0') || KNUCKLE_AT);   // where the knuckles are along the hand
      // palm surface: how far the hand reaches toward the palm around the knuckles
      var surf = 0;
      local.forEach(function(p){ var t = p.dot(finger); if (t > t0 * 0.6 && t < t0 * 1.1) surf = Math.max(surf, p.dot(palm)); });
      // three finger segments (knuckle, middle and end joints), chained like real finger bones
      var L = maxT - t0, joints = [t0, t0 + L * 0.38, t0 + L * 0.68];
      var segs = [], parent = hand, prevPivot = V();
      joints.forEach(function(tj, n){
        var fb = new T.Bone(); fb.name = side + 'GripFinger' + n;
        var pv = finger.clone().multiplyScalar(tj);
        fb.position.copy(pv).sub(prevPivot); parent.add(fb);
        sk.bones.push(fb);
        sk.boneInverses.push(new T.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z).multiply(sk.boneInverses[hi]));
        segs.push({ bone: fb, index: sk.bones.length - 1, t: tj });
        parent = fb; prevPivot = pv;
      });
      sk.boneMatrices = new Float32Array(sk.bones.length * 16);
      if (sk.boneTexture){ sk.boneTexture.dispose(); sk.boneTexture = null; }
      var pivot = finger.clone().multiplyScalar(t0);
      // each finger vertex moves to the segment it lies in; around each joint it is
      // blended with the segment before it, so the skin bends smoothly
      // the thumb stays with the hand: it lies beside the four fingers along the knuckle
      // line, and turning it around the fingers' knuckles would tear the skin
      var kMin = 1e9, kMax = -1e9;
      local.forEach(function(p){ if (p.dot(finger) > maxT * 0.85){ var k = p.dot(knuckles); kMin = Math.min(kMin, k); kMax = Math.max(kMax, k); } });
      var kPad = (kMax - kMin) * 0.08;
      var isThumb = local.map(function(p){ var k = p.dot(knuckles); return k < kMin - kPad || k > kMax + kPad; });
      var ramp = L * (+TEST.get('ramp') || JOINT_BLEND);
      idx.forEach(function(i, j){
        var t = local[j].dot(finger);
        if (t <= t0) return;
        if (isThumb[j]){   // the thumb follows the first finger segment part of the way
          var tf = +TEST.get('thumb') || THUMB_FOLLOW;
          if (tf <= 0) return;
          var sl = [0, 1, 2, 3], hk0 = sl.find(function(k){ return gc(si, i, k) === hi; }), fr = sl.find(function(k){ return gc(sw, i, k) === 0; });
          if (fr === undefined) return;
          var hw0 = gc(sw, i, hk0); sc(sw, i, hk0, hw0 * (1 - tf)); sc(si, i, fr, segs[0].index); sc(sw, i, fr, hw0 * tf);
          return;
        }
        var n = 0; while (n < 2 && t > joints[n + 1]) n++;
        var s = Math.min(1, (t - joints[n]) / ramp);
        var prev = n === 0 ? hi : segs[n - 1].index, cur = segs[n].index;
        var slots = [0, 1, 2, 3], hk = slots.find(function(k){ return gc(si, i, k) === hi; });
        var hw = gc(sw, i, hk);
        if (s >= 1){ sc(si, i, hk, cur); return; }
        var free = slots.find(function(k){ return gc(sw, i, k) === 0; });
        if (free === undefined){ sc(si, i, hk, s > 0.5 ? cur : prev); return; }
        sc(si, i, hk, prev); sc(sw, i, hk, hw * (1 - s));
        sc(si, i, free, cur); sc(sw, i, free, hw * s);
      });
      si.needsUpdate = true; sw.needsUpdate = true;
      // Where the handle lies in the fist and how far the fingers close: the handle runs
      // along the knuckle line, so looking along it everything is 2D (finger / palm
      // directions). For several curl amounts the closed hand is worked out, and the handle
      // circle is put where the hand surrounds it best without any vertex inside it.
      var scale = V(); hand.getWorldScale(scale);
      var r = HANDLE_R / scale.x;
      var pts = idx.map(function(i, j){
        var t = local[j].dot(finger), n = -1;
        if (t > t0 && !isThumb[j]){ n = 0; while (n < 2 && t > joints[n + 1]) n++; }
        return { u: t, w: local[j].dot(palm), k: local[j].dot(knuckles), n: n };
      });
      var kMid = 0, kn = 0; pts.forEach(function(p){ if (p.n >= 0){ kMid += p.k; kn++; } }); kMid /= Math.max(1, kn);
      function curled(curl, split){
        return pts.map(function(p){
          var u = p.u, w = p.w;
          for (var m = p.n; m >= 0; m--){   // innermost joint first, then the ones before it
            var a = curl * split[m], cu = joints[m], du = u - cu, cs = Math.cos(a), sn = Math.sin(a);
            u = cu + du * cs - w * sn; w = du * sn + w * cs;   // finger -> palm is the positive turn
          }
          return [u, w];
        });
      }
      var best = null, reachOut = r * 2.4, rHit = r * 0.92;   // the handle is a little thinner on its flat sides
      var SPLITS = [[0.4, 0.33, 0.27], [0.34, 0.36, 0.3], [0.45, 0.35, 0.2], [0.3, 0.4, 0.3]];
      SPLITS.forEach(function(split){ [1.8, 2.2, 2.6, 3.0, 3.4, 3.8].forEach(function(curl){
        var P = curled(curl, split);
        for (var cu = t0 * 0.2; cu <= maxT; cu += (maxT - t0 * 0.2) / 40){
          for (var cw = 0; cw <= surf + r * 5; cw += (surf + r * 5) / 40){
            var minD = 1e9, sect = 0, hits = 0;
            for (var q = 0; q < P.length; q++){
              var du = P[q][0] - cu, dw = P[q][1] - cw, d = Math.sqrt(du * du + dw * dw);
              if (d < minD) minD = d;
              if (d < rHit) break;
              if (d < reachOut){ sect |= 1 << (Math.floor((Math.atan2(dw, du) + Math.PI) / (2 * Math.PI) * 16) % 16); hits++; }
            }
            if (minD < rHit) continue;
            var cov = 0; for (var bit = 0; bit < 16; bit++) if (sect & (1 << bit)) cov++;
            var score = cov * 10 - (minD - r) / r * 3 + Math.min(hits, 200) * 0.01;
            if (!best || score > best.score) best = { score: score, curl: curl, split: split, cu: cu, cw: cw, cov: cov, gap: (minD - r) * scale.x };
          }
        }
      }); });
      // the hand's rotation in the forearm's frame in the pose the skin was made for
      var fi = sk.bones.indexOf(hand.parent), bindInv = new T.Quaternion();
      if (fi >= 0){
        var bl = new T.Matrix4().multiplyMatrices(sk.boneInverses[fi], new T.Matrix4().copy(sk.boneInverses[hi]).invert());
        bl.decompose(V(), bindInv, V()); bindInv.invert();
      }
      var center = finger.clone().multiplyScalar(best.cu).addScaledVector(palm, best.cw).addScaledVector(knuckles, kMid);
      return { pivot: pivot, surf: surf, rLocal: r, hand: hand, segs: segs, finger: finger, palm: palm, knuckles: knuckles,
               center: center, curl: 0, bindInv: bindInv, way: 0, twist: 0, curlTotal: best.curl, split: best.split, thumbs: isThumb.filter(Boolean).length, fit: best, mesh: mesh, idx: idx };
    }

    // how far the hand is turned around the forearm's own axis, compared with the pose
    // the skin was made for (g.bind); `local` is the hand's rotation in the forearm's frame
    function wristTwist(g, local){
      var d = local.clone().multiply(g.bindInv), ax = g.hand.position.clone().normalize();
      var sgn = d.w < 0 ? -1 : 1, along = (d.x * ax.x + d.y * ax.y + d.z * ax.z) * sgn;
      var tw = new T.Quaternion(ax.x * along, ax.y * along, ax.z * along, d.w * sgn);
      if (tw.lengthSq() < 1e-8) return { q: new T.Quaternion(), angle: Math.PI };
      tw.normalize();
      return { q: tw, angle: 2 * Math.atan2(Math.abs(along), d.w * sgn) };
    }
    // turns the hand so its knuckle line runs along the handle (direction D) and its
    // fingers stay in line with the forearm as well as possible. There are two ways round
    // (palm up or palm down): it takes the one that twists the wrist less, and then stays
    // with it so the hand never flips over.
    var basisA = new T.Matrix4(), basisB = new T.Matrix4();
    function orientHand(g, fore, D){
      var hand = g.hand, fw = wpos(hand).sub(wpos(fore)).normalize(), best = null;
      var foreInv = wquat(fore).invert();
      [1, -1].forEach(function(s){
        var k = D.clone().multiplyScalar(s);
        var f = fw.clone().addScaledVector(k, -fw.dot(k));
        if (f.lengthSq() < 1e-6) return;   // the forearm runs along the handle
        f.normalize();
        var p = V().crossVectors(k, f);    // palm = knuckles x finger
        basisA.makeBasis(f, p, k);                              // world
        basisB.makeBasis(g.finger, g.palm, g.knuckles);         // hand space
        var q = new T.Quaternion().setFromRotationMatrix(basisA.multiply(basisB.transpose()));
        var score = -wristTwist(g, foreInv.clone().multiply(q)).angle + (g.way === s ? 0.5 : 0);
        if (!best || score > best.score) best = { score: score, q: q, s: s };
      });
      if (!best) return;
      g.way = best.s;
      setWorldQuat(hand, best.q);
    }
    // most of the hand's twist around the forearm goes into the forearm itself (like a
    // real forearm turns), so the wrist does not get wrung like a sweet wrapper
    function twistForearm(fore, g){
      var hand = g.hand, q = wquat(hand), tw = wristTwist(g, hand.quaternion);
      g.twist = tw.angle;
      fore.quaternion.multiply(new T.Quaternion().slerp(tw.q, FOREARM_TWIST)); fore.updateMatrixWorld(true);
      setWorldQuat(hand, q);
    }
    function gripPoint(g){ return g.hand.localToWorld(g.center.clone()); }
    function closeFingers(g, amount, dt){
      if (!g) return;
      g.curl += (amount - g.curl) * (1 - Math.exp(-22 * (dt || 0)));
      g.segs.forEach(function(sg, n){ sg.bone.quaternion.setFromAxisAngle(g.knuckles, g.curl * g.curlTotal * g.split[n]); });
      g.hand.updateMatrixWorld(true);
    }
    // the arm reaches so that the middle of the fist (not the wrist) lies on `target` on
    // the handle; returns how far off it still is (the target can be out of reach)
    function gripAt(upper, lower, g, hand, target, D, pole){
      reach(upper, lower, hand, target, pole, PALM);
      if (!g) return 0;
      orientHand(g, lower, D);
      for (var it = 0; it < 5; it++){
        var e = target.clone().sub(gripPoint(g));
        if (e.length() < 0.003) break;
        reach(upper, lower, hand, wpos(hand).add(e), pole, 0);
        orientHand(g, lower, D);
      }
      return target.distanceTo(gripPoint(g));
    }

    // k: 0 = the broom is at its place, 1 = in the hands; arms: how much the arms and the
    // upper body are in the holding pose; yaw: the broom follows his turns a little late
    // headShift: how far the pose moves the head away from where the animation has it
    var hold = { k: 0, arms: 0, yaw: 0, prev: null, prevYaw: 0, speed: 0, turn: 0, carry: 0, az: 0, sweepW: 0, err: 0, trim: 0, rest: 0.1, headShift: V() };
    var anim = { stroke: 0, lift: 0, twist: 0 };   // sweeping strokes (set in update)
    function broomQuat(dir, side){
      var x = side.clone().addScaledVector(dir, -side.dot(dir)).normalize(), z = V().crossVectors(x, dir);
      return new T.Quaternion().setFromRotationMatrix(basisM.makeBasis(x, dir, z));
    }
    // Every frame after the character animation: upper body and arms into the holding
    // pose, the broom where it belongs (bristles on the floor in front of him, lifted
    // while he walks, over the stain while sweeping, on its way while taking / storing).
    function posePlayer(dt){
      var chef = ctx.getChef(), b = chef && findBones(chef);
      held.visible = broomAt !== 'closet';
      if (!b) return;
      // start from the animation's pose (also for bones the animation leaves alone)
      b.rig.forEach(function(e){
        if (e.own && e.bone.quaternion.equals(e.set)) e.bone.quaternion.copy(e.anim);
        e.anim.copy(e.bone.quaternion); e.own = false;
      });
      var inHands = broomAt === 'hand' || broomAt === 'taking' || broomAt === 'storing';
      var k = broomAt === 'hand' ? 1 : broomAt === 'taking' ? smooth(move.t) : broomAt === 'storing' ? 1 - smooth(move.t) : 0;
      hold.k = k;
      var want = broomAt === 'hand' || broomAt === 'taking' || (broomAt === 'storing' && move.t < 0.6);
      hold.arms = clamp(hold.arms + (want ? 5 : -3.5) * dt);
      var closed = broomAt === 'hand' || (inHands && k > 0.8) ? 1 : carry && !inHands ? 0.25 : 0;
      closeFingers(b.lGrip, closed, dt); closeFingers(b.rGrip, closed, dt);
      var th = chef.rotation.y;
      hold.headShift.set(0, 0, 0);
      if (hold.arms <= 0 && !inHands){
        hold.prev = null; hold.yaw = th; hold.err = 0; if (b.lGrip) b.lGrip.way = 0; if (b.rGrip) b.rGrip.way = 0;
        poseCarry(b, chef, dt, th);   // no broom: maybe something else in both hands
        return;
      }
      chef.updateMatrixWorld(true);

      // how he is moving: lifted while walking, turning or jumping
      var base = chef.position, floorY = base.y - chefLift();
      if (!hold.prev){ hold.prev = base.clone(); hold.prevYaw = th; hold.yaw = th; hold.speed = hold.turn = hold.carry = hold.az = 0; }
      if (dt > 1e-5){
        var e10 = 1 - Math.exp(-10 * dt);
        hold.speed += (Math.min(4, base.distanceTo(hold.prev) / dt) - hold.speed) * e10;
        hold.turn += (Math.min(6, Math.abs(angle(th - hold.prevYaw)) / dt) - hold.turn) * e10;
        hold.prev.copy(base); hold.prevYaw = th;
        hold.yaw = th - clamp(angle(th - hold.yaw) * Math.exp(-14 * dt), -0.3, 0.3);
        hold.carry += (Math.min(1, Math.max(hold.speed, hold.turn / 2.5)) - hold.carry) * (1 - Math.exp(-9 * dt));
      }
      var f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
      var fl = V(Math.sin(hold.yaw), 0, Math.cos(hold.yaw)), rl = V(-Math.cos(hold.yaw), 0, Math.sin(hold.yaw));
      var sw = hold.sweepW, bow = move ? Math.sin(Math.PI * clamp(move.t)) * move.bow : 0;

      // upper body: leaning forward (more while sweeping, a bow when picking it up), the
      // right shoulder turned to the front, both shoulders pushed forward; the head stays level
      var headQ = b.neck ? wquat(b.neck) : null, head0 = b.neck ? wpos(b.neck) : null;
      var lean = POSE.lean + 0.26 * sw + 0.5 * bow, twist = POSE.twist + 0.12 * sw - anim.twist;
      [[b.spine02, 0.5, 0.33], [b.spine01, 0.5, 0.33], [b.spine, 0, 0.34]].forEach(function(s){
        if (!s[0]) return;
        turn(s[0], r, -lean * s[1]); turn(s[0], UP, twist * s[2]);
      });
      if (b.lS) turn(b.lS, UP, -POSE.clavL);
      if (b.rS) turn(b.rS, UP, POSE.clavR);
      if (headQ) setWorldQuat(b.neck, headQ);

      // the upper hand stays in front of the chest; the bristles go to their spot on the
      // floor, swung aside if something stands there
      var M = wpos(b.lA).add(wpos(b.rA)).multiplyScalar(0.5);
      var U = M.clone().addScaledVector(r, POSE.hand[0]).addScaledVector(f, POSE.hand[1]);
      var Lu = BROOM_LEN - GRIP_TOP;
      var P0 = base.clone().addScaledVector(fl, POSE.tip[1]).addScaledVector(rl, POSE.tip[0]);
      function tipAt(a){ return V(P0.x - U.x, 0, P0.z - U.z).applyAxisAngle(UP, a).add(U); }
      if (!sweep && dt > 1e-5){
        var turns = [0, -0.5, 0.5, -1.0, 1.0, -1.4, 1.4], goal = 0;
        for (var i = 0; i < turns.length; i++){
          var c = tipAt(turns[i]);
          if (!blockedLine(U.x, U.z, c.x, c.z)){ goal = turns[i]; break; }
        }
        hold.az += (goal - hold.az) * (1 - Math.exp(-8 * dt));
      }
      var P = tipAt(hold.az * (1 - sw)), lift = hold.carry * POSE.carry * (1 - sw);
      if (sweep){   // over the stain, stroke by stroke
        var S = V(sweep.stain.x, 0, sweep.stain.z);
        S.addScaledVector(rl, anim.stroke * sweep.width).addScaledVector(fl, -anim.stroke * sweep.width * 0.3);
        P.lerp(S, sw); lift += anim.lift;
      }
      P.y = floorY + hold.rest + lift;
      // The handle has a fixed length, so the upper hand's height follows from how far
      // out the bristles are. They only go as far as the hand's height allows and as both
      // arms can reach (the further out, the lower the hands).
      var hv = V(P.x - U.x, 0, P.z - U.z), h = hv.length();
      if (h < 1e-4){ hv.copy(f); h = 1; }
      hv.multiplyScalar(1 / h);
      var yLo = M.y + POSE.handY[0] - P.y, yHi = M.y + POSE.handY[1] - P.y;
      var hMin = Math.sqrt(Math.max(0, Lu * Lu - yHi * yHi)), hMax = Math.sqrt(Math.max(0, Lu * Lu - yLo * yLo));
      var sL = wpos(b.lA), sR = wpos(b.rA), armMax = (sL.distanceTo(wpos(b.lF)) + wpos(b.lF).distanceTo(wpos(b.lH))) * 0.98 + 0.075;
      var dir = V(), lower = V();
      function setTip(hh){   // returns how far the further hand is from its shoulder
        P.x = U.x + hv.x * hh; P.z = U.z + hv.z * hh;
        U.y = P.y + Math.sqrt(Math.max(0, Lu * Lu - hh * hh));
        dir.copy(U).sub(P).normalize(); lower.copy(U).addScaledVector(dir, -GRIP_GAP);
        return Math.max(sL.distanceTo(U), sR.distanceTo(lower));
      }
      function fitTip(){
        var hc = clamp(h, hMin, hMax), far = armMax - hold.trim;
        if (setTip(hc) <= far) return;
        var lo = hMin, hi = hc;
        for (var n = 0; n < 7; n++){ var mid = (lo + hi) / 2; if (setTip(mid) > far) hi = mid; else lo = mid; }
        setTip(lo);
      }
      hold.trim = Math.max(0, hold.trim - 0.02 * dt);
      fitTip();
      var tip = P, q = broomQuat(dir, rl);
      if (inHands && k < 1){   // on its way between its place and the hands
        tip = move.pos.clone().lerp(P, k); tip.y += 0.22 * Math.sin(Math.PI * k);
        q = move.quat.clone().slerp(q, k);
        dir = V(0, 1, 0).applyQuaternion(q);
        // the hands go for the part of the handle nearest to the chest, and end up at
        // its top as it arrives
        var chest = M.clone().addScaledVector(r, POSE.hand[0]).addScaledVector(f, POSE.hand[1]);
        var near = clamp(chest.sub(tip).dot(dir), GRIP_GAP + 0.25, Lu);
        U = tip.clone().addScaledVector(dir, near + (Lu - near) * k * k * k);
        lower = U.clone().addScaledVector(dir, -GRIP_GAP);
      }

      // both arms reach for the handle, the hands turn so it runs across the palms
      // (if a fist does not get there after all, the bristles come in a little: `trim`
      // remembers by how much the reach was overestimated)
      var poleL = r.clone().multiplyScalar(-0.8).addScaledVector(UP, -0.6), poleR = r.clone().multiplyScalar(0.8).addScaledVector(UP, -0.6);
      for (var attempt = 0; ; attempt++){
        hold.err = Math.max(gripAt(b.lA, b.lF, b.lGrip, b.lH, U, dir, poleL), gripAt(b.rA, b.rF, b.rGrip, b.rH, lower, dir, poleR));
        if (hold.err <= 0.012 || attempt >= 4 || broomAt !== 'hand') break;
        hold.trim = Math.min(0.15, hold.trim + 0.015);
        fitTip(); q = broomQuat(dir, rl);
      }
      if (broomAt === 'hand' && hold.err > 0.012 && b.lGrip && b.rGrip){
        // out of reach after all: then the broom goes where the fists are
        var up = gripPoint(b.lGrip), d = up.clone().sub(gripPoint(b.rGrip));
        if (d.length() > 0.08){
          dir = d.normalize(); tip = up.clone().addScaledVector(dir, GRIP_TOP - BROOM_LEN); q = broomQuat(dir, rl);
          orientHand(b.lGrip, b.lF, dir); orientHand(b.rGrip, b.rF, dir);
        }
      }
      if (b.lGrip) twistForearm(b.lF, b.lGrip);
      if (b.rGrip) twistForearm(b.rF, b.rGrip);
      if (inHands){ held.position.copy(tip); held.quaternion.copy(q); }
      // how high its lower end is when the bristles rest on the floor (for the next frame)
      if (broomAt === 'hand') hold.rest = groundLift(q) * (1 - POSE.press);
      // fade between the animation's pose and the holding pose
      var w = smooth(hold.arms);
      b.rig.forEach(function(e){
        if (w < 1) e.bone.quaternion.copy(e.anim.clone().slerp(e.bone.quaternion, w));
        e.set.copy(e.bone.quaternion); e.own = true;
      });
      chef.updateMatrixWorld(true);
      if (head0) hold.headShift.copy(wpos(b.neck)).sub(head0);
    }

    // ---------- carrying something with both hands (a bowl, a basket) ------------------
    // Other parts of the game hand over an object with setCarry(); it is held in front of
    // the chest, a hand on either side. opts: half (half its width, where the hands are),
    // fwd / drop (its place from the middle between the shoulders), grip (hands' height
    // above its origin), back (hands this far behind its middle).
    var carry = null, carryW = 0, carryOpts = { half: 0.17, fwd: 0.42, drop: -0.16, grip: 0.04, back: 0 };
    function setCarry(obj, opts){
      if (carry) root.remove(carry.obj);
      carry = obj ? { obj: obj } : null;
      if (obj){ carryOpts = opts || carryOpts; obj.visible = false; root.add(obj); }
    }
    function handsFree(){ return !carry && hold.arms <= 0 && (broomAt === 'closet' || broomAt === 'floor'); }
    function poseCarry(b, chef, dt, th){
      carryW = clamp(carryW + (carry ? 5 : -4) * dt);
      if (carryW <= 0) return;
      chef.updateMatrixWorld(true);
      var o = carryOpts, f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
      // a little forward lean and the shoulders pushed forward, so the short arms get there
      var headQ = b.neck ? wquat(b.neck) : null, head0 = b.neck ? wpos(b.neck) : null;
      [b.spine02, b.spine01].forEach(function(sp){ if (sp) turn(sp, r, -0.07); });
      if (b.lS) turn(b.lS, UP, -0.3);
      if (b.rS) turn(b.rS, UP, 0.3);
      if (headQ) setWorldQuat(b.neck, headQ);
      var M = wpos(b.lA).add(wpos(b.rA)).multiplyScalar(0.5);
      var c = M.clone().addScaledVector(f, o.fwd).addScaledVector(UP, o.drop);
      [[b.lA, b.lF, b.lH, b.lGrip, -1], [b.rA, b.rF, b.rH, b.rGrip, 1]].forEach(function(a){
        var side = a[4], g = a[3];
        var palm = c.clone().addScaledVector(r, side * o.half).addScaledVector(UP, o.grip || 0).addScaledVector(f, -(o.back || 0));
        var fingers = f.clone().addScaledVector(r, -side * 0.3).normalize();   // pointing forward and a little inward
        reach(a[0], a[1], a[2], palm.clone().addScaledVector(fingers, -0.09), r.clone().multiplyScalar(side * 0.8).addScaledVector(UP, -0.6), 0);
        if (!g) return;
        // palms toward the thing and a little upward, as if cradling it
        var p = r.clone().multiplyScalar(-side).addScaledVector(UP, 0.45);
        p.addScaledVector(fingers, -p.dot(fingers)).normalize();
        basisA.makeBasis(fingers, p, V().crossVectors(fingers, p));
        basisB.makeBasis(g.finger, g.palm, g.knuckles);
        setWorldQuat(a[2], new T.Quaternion().setFromRotationMatrix(basisA.multiply(basisB.transpose())));
        twistForearm(a[1], g);
      });
      if (carry){ carry.obj.visible = true; carry.obj.position.copy(c); carry.obj.rotation.set(0, th + (o.yaw || 0), 0); }
      var w = smooth(carryW);
      b.rig.forEach(function(e){
        if (w < 1) e.bone.quaternion.copy(e.anim.clone().slerp(e.bone.quaternion, w));
        e.set.copy(e.bone.quaternion); e.own = true;
      });
      chef.updateMatrixWorld(true);
      if (head0) hold.headShift.copy(wpos(b.neck)).sub(head0);
    }

    // ---------- stains -----------------------------------------------------------
    var stainTex = new T.TextureLoader().load('textures/stains.png');
    stainTex.encoding = T.sRGBEncoding;
    var stains = [], spawnIn = STAIN.first, layer = 0;
    function rnd(a, b){ return a + (b - a) * Math.random(); }
    function freeSpot(x, z, r){
      for (var i = 0; i < ctx.obstacles.length; i++){
        var o = ctx.obstacles[i];
        if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return false;
      }
      for (i = 0; i < stains.length; i++) if (Math.hypot(stains[i].x - x, stains[i].z - z) < 1.1) return false;
      var chef = ctx.getChef();
      if (chef && Math.hypot(chef.position.x - x, chef.position.z - z) < 1.5) return false;
      return true;
    }
    function spawnStain(){
      var A = STAIN.area, size = rnd(STAIN.size[0], STAIN.size[1]);
      for (var tries = 0; tries < 30; tries++){
        var x = rnd(A.x0, A.x1), z = rnd(A.z0, A.z1);
        if (!freeSpot(x, z, size * 0.2)) continue;
        var kind = Math.floor(Math.random() * 4), u0 = (kind % 2) * 0.5, v0 = kind < 2 ? 0.5 : 0;
        var geo = new T.PlaneGeometry(1, 1), uv = geo.attributes.uv;
        for (var i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
        var mat = new T.MeshStandardMaterial({ map: stainTex, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0,
                                               polygonOffset: true, polygonOffsetFactor: -2 });
        var m = new T.Mesh(geo, mat);
        m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        layer = (layer + 1) % 20;
        m.position.set(x, 0.006 + layer * 0.0004, z);
        m.scale.setScalar(0.01); m.receiveShadow = true;
        root.add(m);
        // clean: 0 = fresh .. 1 = swept away; busy: being swept right now
        stains.push({ mesh: m, x: x, z: z, size: size, grow: 0, clean: 0, busy: false });
        return;
      }
    }
    function stainDist(s){ var chef = ctx.getChef(); return chef ? Math.hypot(s.x - chef.position.x, s.z - chef.position.z) : 0; }
    // the stain the camera is pointing at (not further away than the broom reaches)
    var ray = new T.Vector3(), camPos = new T.Vector3();
    function aimedStain(){
      camera.getWorldPosition(camPos); camera.getWorldDirection(ray);
      if (ray.y > -0.05) return null;
      var t = -(camPos.y - 0.01) / ray.y, hx = camPos.x + ray.x * t, hz = camPos.z + ray.z * t;
      var best = null, bestD = 1e9;
      stains.forEach(function(s){
        if (s.busy || s.clean >= 1) return;
        var d = Math.hypot(s.x - hx, s.z - hz);
        if (d > s.size * 0.5 + 0.15 || d >= bestD) return;
        if (stainDist(s) > STAIN.far) return;
        best = s; bestD = d;
      });
      return best;
    }

    // ---------- sweeping ------------------------------------------------------------
    var sweep = null;   // { stain, t, width, done }
    function startSweep(s){
      s.busy = true;
      sweep = { stain: s, t: 0, width: SWEEP.width * Math.min(1, s.size / 0.9), done: false };
    }
    function trySweep(){
      if (!holding || sweep) return;
      var s = aimedStain();
      if (s && stainDist(s) >= STAIN.near) startSweep(s);
    }
    window.addEventListener('mousedown', function(e){
      if (e.button === 0 && document.pointerLockElement === canvas) trySweep();
    });
    // The bristles move onto the stain, go back and forth over it (pressed down one
    // way, a little lifted on the way back), the upper body turning along; the stain
    // gets fainter stroke by stroke. Then the broom comes back to rest.
    function stepSweep(dt){
      var s = sweep.stain, chef = ctx.getChef();
      var tS = SWEEP.over, tE = tS + SWEEP.strokes * SWEEP.stroke;
      sweep.t += dt;
      if (!sweep.done){
        // walked or turned away from it: stop, the stain keeps what is left of it
        var dx = s.x - chef.position.x, dz = s.z - chef.position.z, d = Math.hypot(dx, dz) || 1;
        var front = (dx * Math.sin(chef.rotation.y) + dz * Math.cos(chef.rotation.y)) / d;
        if (!holding || d > STAIN.far + 0.6 || front < 0.3){ sweep.done = true; s.busy = false; sweep.t = Math.max(sweep.t, tE); }
      }
      var u = clamp((sweep.t - tS) / (tE - tS)), phase = u * Math.PI * 2 * SWEEP.strokes;
      var env = sweep.done && s.clean < 1 ? 0 : Math.min(1, u / 0.08, (1 - u) / 0.08);
      hold.sweepW = smooth(sweep.t / tS) * (1 - smooth((sweep.t - tE) / SWEEP.back));
      anim.stroke = Math.sin(phase) * env;
      anim.lift = Math.max(0, -Math.cos(phase)) * 0.05 * env;
      anim.twist = Math.sin(phase) * 0.12 * env;
      if (!sweep.done){
        s.clean = Math.max(s.clean, u);
        if (u >= 1) sweep.done = true;
      }
      if (sweep.t >= tE + SWEEP.back){ sweep = null; hold.sweepW = 0; anim.stroke = anim.lift = anim.twist = 0; }
    }

    // ---------- things you can use with E ---------------------------------------------
    // An entry: { pos, reach, label, use }. Without `use` it is only a note shown in passing
    // (like "Hands full"). Other parts of the game add their own with addInteractables(fn);
    // fn gets { handsFree } and returns such entries.
    var moreInteractables = [];
    function interactables(){
      var list = [], full = { reach: USE_REACH, label: 'Hands full' };
      if (broomAt === 'closet') list.push(carry ? { pos: broomSpot, reach: full.reach, label: full.label } : { pos: broomSpot, reach: USE_REACH, label: 'Pick up broom', use: takeBroom });
      if (broomAt === 'hand') list.push({ pos: broomSpot, reach: USE_REACH, label: 'Put the broom back', use: storeBroom });
      if (broomAt === 'floor'){   // any part of it within reach will do
        var chef = ctx.getChef(), a = held.position, d = V(0, 1, 0).applyQuaternion(held.quaternion);
        var t = clamp((chef.position.x - a.x) * d.x + (chef.position.z - a.z) * d.z, 0, BROOM_LEN);
        var at = V(a.x + d.x * t, 0, a.z + d.z * t);
        list.push(carry ? { pos: at, reach: FLOOR_REACH, label: full.label } : { pos: at, reach: FLOOR_REACH, label: 'Pick up broom', use: takeBroom });
      }
      var door = ctx.getDoor && ctx.getDoor();
      if (door && door.center){
        list.push({ pos: door.center, reach: 2.2, label: door.target > 0.5 ? 'Close door' : 'Open door',
                    use: function(){ door.target = door.target > 0.5 ? 0 : 1; } });
      }
      var info = { handsFree: handsFree() };
      moreInteractables.forEach(function(fn){ (fn(info) || []).forEach(function(it){ list.push(it); }); });
      return list;
    }
    var focused = null;
    function findFocus(){
      var chef = ctx.getChef();
      if (!chef) return null;
      var fx = Math.sin(chef.rotation.y), fz = Math.cos(chef.rotation.y);   // he faces where you look
      var best = null, bestD = 1e9;
      interactables().forEach(function(it){
        var dx = it.pos.x - chef.position.x, dz = it.pos.z - chef.position.z, d = Math.hypot(dx, dz);
        if (d > it.reach) return;
        var facing = d < 0.8 || (dx * fx + dz * fz) / d > 0.35;
        if (!facing) return;
        var rank = d + (it.use ? 0 : 100);   // something to do comes before a mere note
        if (rank < bestD){ best = it; bestD = rank; }
      });
      return best;
    }
    function interact(){
      if (sweep || move || broomAt === 'falling') return;
      var it = findFocus();
      if (it){ if (it.use) it.use(); }
      else if (holding) dropBroom();   // drop it right here
    }

    // ---------- every frame ---------------------------------------------------------------
    function update(dt, time){
      if (move){   // the broom on its way into the hands / back to its place
        move.t += dt / TAKE_TIME;
        if (move.t >= 1){ setBroom(broomAt === 'taking' ? 'hand' : 'closet'); move = null; }
      }
      if (broomAt === 'falling') stepFall(Math.min(dt, 0.05));
      // new stains now and then
      spawnIn -= dt;
      if (spawnIn <= 0){
        if (stains.length < STAIN.max) spawnStain();
        if (stains.length < 2) spawnStain();
        spawnIn = rnd(STAIN.every[0], STAIN.every[1]);
      }
      if (sweep) stepSweep(dt);
      // stains grow in, swept ones get fainter and go
      for (var i = stains.length - 1; i >= 0; i--){
        var st = stains[i];
        if (st.grow < 1) st.grow = Math.min(1, st.grow + dt * 2.5);
        if (st.clean >= 1){ root.remove(st.mesh); st.mesh.geometry.dispose(); st.mesh.material.dispose(); stains.splice(i, 1); continue; }
        st.mesh.material.opacity = 1 - st.clean;
        st.mesh.scale.setScalar(Math.max(0.01, st.size * (1 - Math.pow(1 - st.grow, 3)) * (1 - 0.2 * st.clean)));
      }
      // hint and aim dot
      var aimed = sweep ? null : aimedStain();
      var tooClose = !!aimed && stainDist(aimed) < STAIN.near;
      focused = sweep || move ? null : findFocus();
      var locked = document.pointerLockElement === canvas;
      dot.classList.toggle('on', holding && locked);
      dot.classList.toggle('hit', !!(holding && aimed && !tooClose));
      if (focused && focused.use) setHint(keyHint('E', focused.label));
      else if (focused) setHint('<span>' + focused.label + '</span>', true);
      else if (aimed && holding && tooClose) setHint('<span>Step back a little</span>', true);
      else if (aimed && holding) setHint(MOUSE_SVG + '<span>Sweep</span>');
      else if (aimed && !move) setHint('<span>Get ' + (broomAt === 'closet' ? 'a broom from the cleaning closet' : 'the broom') + '</span>', true);
      else if (holding && !sweep) setHint(keyHint('E', 'Drop broom'), true);
      else setHint('');
    }

    // after the character animation: the holding pose and the broom
    function afterAnimation(dt){ posePlayer(dt); }

    return {
      interact: interact, update: update, afterAnimation: afterAnimation,
      isHolding: function(){ return holding; },
      // for the other parts of the game (restaurant.js)
      addInteractables: function(fn){ moreInteractables.push(fn); },
      setCarry: setCarry, handsFree: handsFree,
      headShift: function(){ return hold.headShift; },   // world vector, for the camera stainCount: function(){ return stains.length; },
      // ---- for tests only ----
      // the broom straight into the hands / dropped / taken / put back from anywhere
      debugHold: function(){
        setBroom('hand'); move = null; hold.arms = 1;
        if (bones){ [bones.lGrip, bones.rGrip].forEach(function(g){ if (g) g.curl = 1; }); }
      },
      debugDrop: function(){ if (holding) dropBroom(); },
      debugClick: function(){ trySweep(); return !!sweep; },   // a left click without the mouse
      debugHint: function(){ return hint.classList.contains('on') ? hint.textContent : ''; },
      debugTake: function(){ if (broomAt === 'closet' || broomAt === 'floor') takeBroom(); },
      debugStore: function(){ if (holding) storeBroom(); },
      debugPose: function(o){ Object.keys(o).forEach(function(key){ POSE[key] = o[key]; }); },
      debugChef: function(){ return ctx.getChef(); }, debugLift: chefLift,
      debugStainAt: function(x, z, size){
        var A = STAIN.area, S = STAIN.size, n = stains.length;
        STAIN.area = { x0: x, x1: x, z0: z, z1: z }; if (size) STAIN.size = [size, size];
        spawnStain(); STAIN.area = A; STAIN.size = S;
        return stains.length > n;
      },
      // sweeps the newest stain without the mouse
      debugSweep: function(){
        var s = null;
        stains.forEach(function(st){ if (!st.busy && st.clean < 1) s = st; });
        if (!holding || sweep || !s) return false;
        startSweep(s); return true;
      },
      // measurements in the chef's own frame [right, up (above the floor), front]
      debugRig: function(){
        var chef = ctx.getChef(), b = findBones(chef);
        var th = chef.rotation.y, f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
        var floorY = chef.position.y - chefLift();
        function loc(p){ var d = p.clone().sub(chef.position); return [+d.dot(r).toFixed(2), +(p.y - floorY).toFixed(2), +d.dot(f).toFixed(2)]; }
        var y = V(0, 1, 0).applyQuaternion(held.quaternion);
        var top = held.position.clone().addScaledVector(y, BROOM_LEN);
        // how far each fist's middle is from the handle's axis
        function off(g){ var p = gripPoint(g).sub(held.position); return +p.sub(y.clone().multiplyScalar(p.dot(y))).length().toFixed(3); }
        return { at: broomAt, k: +hold.k.toFixed(2), arms: +hold.arms.toFixed(2), err: +hold.err.toFixed(3), carry: +hold.carry.toFixed(2),
                 az: +hold.az.toFixed(2), sweepW: +hold.sweepW.toFixed(2), stroke: +anim.stroke.toFixed(2),
                 lOff: off(b.lGrip), rOff: off(b.rGrip), lTwist: Math.round(b.lGrip.twist * 57.3) * b.lGrip.way, rTwist: Math.round(b.rGrip.twist * 57.3) * b.rGrip.way,
                 lReach: +wpos(b.lA).distanceTo(wpos(b.lH)).toFixed(2), rReach: +wpos(b.rA).distanceTo(wpos(b.rH)).toFixed(2),
                 lShoulder: loc(wpos(b.lA)), rShoulder: loc(wpos(b.rA)), lHand: loc(wpos(b.lH)), rHand: loc(wpos(b.rH)),
                 lGrip: loc(gripPoint(b.lGrip)), rGrip: loc(gripPoint(b.rGrip)),
                 tip: loc(held.position), top: loc(top), head: loc(wpos(chef.getObjectByName('Head'))), cam: loc(camera.position),
                 stains: stains.map(function(st){ return +st.clean.toFixed(2); }) };
      },
      // the body's outline in the chef's frame: per height band the front-most point near the
      // middle, the front-most at the sides (|x| 0.25-0.45) and the widest point
      debugBody: function(){
        var chef = ctx.getChef(), mesh = null; chef.traverse(function(o){ if (!mesh && o.isSkinnedMesh) mesh = o; });
        var th = chef.rotation.y, f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
        var floorY = chef.position.y - (ctx.getChefLift ? ctx.getChefLift() : 0);
        var pos = mesh.geometry.attributes.position, v = V(), bands = {};
        mesh.skeleton.update();
        for (var i = 0; i < pos.count; i++){
          mesh.boneTransform(i, v); v.applyMatrix4(mesh.matrixWorld);
          var d = v.clone().sub(chef.position), x = d.dot(r), z = d.dot(f), y = v.y - floorY;
          var k = (Math.floor(y * 10) / 10).toFixed(1), bd = bands[k] || (bands[k] = { mid: -9, side: -9, wide: 0, back: 9 });
          if (Math.abs(x) < 0.2) bd.mid = Math.max(bd.mid, z);
          if (Math.abs(x) > 0.25 && Math.abs(x) < 0.45) bd.side = Math.max(bd.side, z);
          bd.wide = Math.max(bd.wide, Math.abs(x)); bd.back = Math.min(bd.back, z);
        }
        return Object.keys(bands).sort().map(function(k){ var bd = bands[k]; return k + ': mid ' + bd.mid.toFixed(2) + ' side ' + bd.side.toFixed(2) + ' wide ' + bd.wide.toFixed(2); }).join(' | ');
      },
      // how well each hand encloses the handle: the hand's vertices near the grip point
      // (within 5 cm along and around the handle) binned by their angle around the handle
      // axis into 12 sectors, and the closest one to the axis (below the handle radius =
      // a finger cuts into the handle); fit = what the grip solver found
      debugGrip: function(){
        var b = bones; if (!b || !b.lGrip) return null;
        var y = V(0, 1, 0).applyQuaternion(held.quaternion), base = held.position;
        var ref = V(1, 0, 0).applyQuaternion(held.quaternion), ref2 = V().crossVectors(y, ref);
        function stat(g){
          var gp = gripPoint(g), along0 = gp.clone().sub(base).dot(y), v = V(), sectors = new Array(12).fill(0), minD = 9, near = 0;
          g.idx.forEach(function(i){
            g.mesh.boneTransform(i, v); v.applyMatrix4(g.mesh.matrixWorld);
            var rel = v.clone().sub(base), a = rel.dot(y);
            if (Math.abs(a - along0) > 0.05) return;
            var radial = rel.sub(y.clone().multiplyScalar(a)), d = radial.length();
            if (d > 0.05) return;
            near++; minD = Math.min(minD, d);
            sectors[Math.floor(((Math.atan2(radial.dot(ref2), radial.dot(ref)) + Math.PI) / (2 * Math.PI)) * 12) % 12]++;
          });
          return { covered: sectors.filter(function(s){ return s > 0; }).length + '/12', near: near, minDist: +minD.toFixed(3) };
        }
        return { left: stat(b.lGrip), right: stat(b.rGrip), fitL: b.lGrip.fit, fitR: b.rGrip.fit, handleR: HANDLE_R };
      },
      // camera close to a hand: mode 'along' looks down the handle, 'side' looks across it
      // from the palm side (front), 'back' from the back of the hand
      debugLookAtHand: function(side, mode, dist){
        var g = side === 'L' ? bones.lGrip : bones.rGrip, c = gripPoint(g);
        var D = V(0, 1, 0).applyQuaternion(held.quaternion);
        var q = wquat(g.hand), palmW = g.palm.clone().applyQuaternion(q).normalize();
        var dir = mode === 'along' ? D.clone() : mode === 'back' ? palmW.clone() : palmW.clone().negate();
        if (mode === 'side') dir = V().crossVectors(D, palmW).normalize();
        var from = c.clone().addScaledVector(dir, dist || 0.35);
        window.__hotpotCamOverride = { from: from.toArray(), to: c.toArray() };
      },
      // triangles of a hand that get stretched by the grip (edge length now vs in the bind pose)
      debugStretch: function(side){
        var g = side === 'L' ? bones.lGrip : bones.rGrip, m = g.mesh, geo = m.geometry, ix = geo.index, pos = geo.attributes.position;
        var si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
        var inHand = {}; g.idx.forEach(function(i){ inHand[i] = 1; });
        m.skeleton.update();
        var cache = {}, a = V(), bnd = V(), bnd2 = V();
        function sk(i){ if (!cache[i]){ cache[i] = V(); m.boneTransform(i, cache[i]); } return cache[i]; }
        var bad = [], seen = {};
        for (var f = 0; f < ix.count; f += 3){
          var tri = [ix.getX(f), ix.getX(f + 1), ix.getX(f + 2)];
          if (!tri.some(function(i){ return inHand[i]; })) continue;
          for (var e = 0; e < 3; e++){
            var p = tri[e], q = tri[(e + 1) % 3];
            var l0 = bnd.fromBufferAttribute(pos, p).distanceTo(bnd2.fromBufferAttribute(pos, q)), l1 = sk(p).distanceTo(sk(q));
            if (l0 > 1e-6 && l1 / l0 > 2.5){
              [p, q].forEach(function(i){ if (seen[i]) return; seen[i] = 1;
                bad.push({ i: i, inHand: !!inHand[i], ratio: +(l1 / l0).toFixed(1), si: [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], sw: [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)].map(function(x){ return +x.toFixed(2); }) }); });
            }
          }
        }
        return { count: bad.length, sample: bad.slice(0, 12), handIdx: m.skeleton.bones.indexOf(g.hand), segs: g.segs.map(function(s){ return s.index; }) };
      },
      debugTrim: function(){ return hold.trim; },
      // the broom model: its meshes, materials and outline (largest radius per slice of its length)
      debugBroom: function(){
        var out = { meshes: [], profile: [], aEnd: +A_END.toFixed(3), rest: +hold.rest.toFixed(3) }, N = 36, bins = new Array(N).fill(0);
        held.updateMatrixWorld(true);
        var inv = new T.Matrix4().copy(held.matrixWorld).invert();
        held.traverse(function(m){
          if (!m.isMesh) return;
          var pos = m.geometry.attributes.position, mat = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld), v = V();
          out.meshes.push({ name: m.name, verts: pos.count, tris: (m.geometry.index ? m.geometry.index.count : pos.count) / 3, side: m.material.side,
                            transparent: m.material.transparent, alphaTest: m.material.alphaTest, normalized: !!pos.normalized, type: pos.array.constructor.name });
          for (var i = 0; i < pos.count; i++){
            vertexOf(pos, i, v).applyMatrix4(mat);
            var k = clamp(Math.floor(v.y / BROOM_LEN * N), 0, N - 1);
            bins[k] = Math.max(bins[k], Math.hypot(v.x, v.z));
          }
        });
        out.profile = bins.map(function(r){ return +r.toFixed(3); });
        return out;
      }
    };
  }

  window.HotPotGameplay = { build: build };
})();
