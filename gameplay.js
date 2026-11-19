// Gameplay: stains appear on the restaurant floor from time to time; the broom
// lives in the cleaning closet (E picks it up / puts it back); with the broom in
// hand, aim at a stain and left-click to sweep it away. A small, unobtrusive hint
// at the bottom of the screen shows which key does what when something can be used.
//
// Used from index.html:
//   gameplay = HotPotGameplay.build({ scene, camera, canvas, getChef, obstacles, BACKROOMS, getDoor })
//   gameplay.interact()          // on E
//   gameplay.update(delta, time) // every frame
(function(){
  'use strict';
  var T = THREE;

  var STAIN = {
    first: 3,                 // seconds until the first stains appear
    every: [18, 40],          // seconds between new stains
    max: 6,                   // at most this many at once
    size: [0.7, 1.15],        // metres across
    area: { x0: -9.2, x1: 2.2, z0: -9.2, z1: 9.2 },   // guest room floor
    reach: 2.8                // how far away you can sweep (from the chef)
  };
  var SWEEP_TIME = 2.0;       // seconds per sweep
  var STROKES = 4;            // back-and-forth strokes per sweep
  var USE_REACH = 1.6;        // how close you need to be to pick up / put back the broom

  function build(ctx){
    var scene = ctx.scene, camera = ctx.camera, canvas = ctx.canvas;
    var root = new T.Group(); root.name = 'gameplay'; scene.add(root);
    if (!camera.parent) scene.add(camera);   // so things attached to the camera (the broom in hand) render

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
    // scales a model to a height and stands it on its own origin
    function fit(obj, height){
      var bb = new T.Box3().setFromObject(obj), s = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3());
      var k = height / s.y; obj.scale.setScalar(k);
      obj.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      return obj;
    }
    var B = ctx.BACKROOMS;
    var broomSpot = new T.Vector3(B.x1 - 0.32, 0, B.z1 + 0.42);   // leaning in the corner of the cleaning closet
    var standing = new T.Group(); standing.position.copy(broomSpot); standing.rotation.set(0.12, 0.6, -0.16); root.add(standing);
    // the broom in the chef's hands: placed in the world every frame (bristles on the
    // floor in front of him, handle up to his chest), and both arms reach for the handle
    var BROOM_LEN = 1.85;                 // game units (the chef is 2.4 = 1.8 m)
    var GRIP_TOP = 0.14, GRIP_LOW = 0.55; // where the hands hold the handle (distance from its top end)
    var PALM = 0.07;                      // the middle of the palm, past the wrist bone
    var held = new T.Group(); held.visible = false; root.add(held);
    loadBroom(function(src){
      var a = fit(src.clone(true), BROOM_LEN); a.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
      standing.add(a);
      var b = fit(src.clone(true), BROOM_LEN); b.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
      held.add(b);
    });
    // where the broom is: 'closet' (leaning in the corner), 'hand', 'falling' or 'floor'
    var broomAt = 'closet', holding = false;
    function setBroom(where){
      broomAt = where; holding = where === 'hand';
      standing.visible = where === 'closet'; held.visible = where !== 'closet';
    }
    // dropping it: it tips over around the bristles and stays lying where it fell
    var fall = null;   // { tip, h, a, w, bounces }
    var A_END = Math.PI / 2 + 0.014, HEAD_LIFT = 0.05;   // lying almost flat, the bristle head under it
    function dropBroom(){
      var u = V(0, 1, 0).applyQuaternion(held.quaternion), h = V(u.x, 0, u.z);
      var chef = ctx.getChef();
      if (chef){   // it tips over to his right side, not onto his feet
        var th = chef.rotation.y;
        h.normalize().multiplyScalar(0.4).add(V(-Math.cos(th), 0, Math.sin(th)));
      }
      h.normalize();
      var tip = held.position.clone();
      tip.y = chef ? chef.position.y - (ctx.getChefLift ? ctx.getChefLift() : 0) : 0;
      fall = { tip: tip, h: h, a: Math.min(Math.acos(Math.max(-1, Math.min(1, u.y))), 1.2), w: 0.4, bounces: 0 };
      setBroom('falling');
    }
    function stepFall(dt){
      var f = fall;
      f.w += 7.5 * Math.sin(Math.max(0.05, f.a)) * dt;   // falls faster the further it leans
      f.a += f.w * dt;
      if (f.a >= A_END){
        f.a = A_END;
        if (f.bounces < 2 && f.w > 0.6){ f.w = -f.w * 0.28; f.bounces++; }   // a little bounce
        else { f.w = 0; setBroom('floor'); }
      }
      var y = UP.clone().multiplyScalar(Math.cos(f.a)).addScaledVector(f.h, Math.sin(f.a));
      var x = V().crossVectors(UP, f.h).normalize(), z = V().crossVectors(x, y);
      held.quaternion.setFromRotationMatrix(basisM.makeBasis(x, y, z));
      held.position.copy(f.tip); held.position.y += HEAD_LIFT * Math.sin(f.a);
    }
    function broomCenter(){ return held.position.clone().addScaledVector(V(0, 1, 0).applyQuaternion(held.quaternion), BROOM_LEN * 0.5); }

    // ---------- holding pose: two-bone IK for both arms ------------------------------
    var V = function(x, y, z){ return new T.Vector3(x || 0, y || 0, z || 0); };
    var UP = V(0, 1, 0);
    function wpos(o){ var v = V(); o.getWorldPosition(v); return v; }
    function wquat(o){ var q = new T.Quaternion(); o.getWorldQuaternion(q); return q; }
    function setWorldQuat(o, q){ o.quaternion.copy(wquat(o.parent).invert().multiply(q)); o.updateMatrixWorld(true); }
    // turns a bone so the direction from it to its child points along `to` (world)
    function aim(bone, child, to){
      var from = wpos(child).sub(wpos(bone)).normalize();
      var q = new T.Quaternion().setFromUnitVectors(from, to.clone().normalize());
      setWorldQuat(bone, q.multiply(wquat(bone)));
    }
    // upper arm -> forearm -> hand: the palm (`extra` past the wrist) reaching `target`,
    // the elbow bending towards `pole`
    function reach(upper, lower, hand, target, pole, extra){
      var s = wpos(upper), L1 = s.distanceTo(wpos(lower)), L2 = wpos(lower).distanceTo(wpos(hand)) + (extra || 0);
      var toT = target.clone().sub(s), d = Math.max(0.05, Math.min(toT.length(), (L1 + L2) * 0.999)), dir = toT.normalize();
      var a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      var p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      aim(upper, lower, dir.clone().multiplyScalar(Math.cos(a)).add(p.multiplyScalar(Math.sin(a))));
      aim(lower, hand, target.clone().sub(wpos(lower)));
    }
    var bones = null;
    function findBones(chef){
      if (bones && bones.root === chef) return bones;
      var g = function(n){ return chef.getObjectByName(n); };
      bones = { root: chef, spine: g('Spine'), rA: g('RightArm'), rF: g('RightForeArm'), rH: g('RightHand'),
                lA: g('LeftArm'), lF: g('LeftForeArm'), lH: g('LeftHand') };
      if (!bones.rA || !bones.lA || !bones.spine) bones = null;
      return bones;
    }
    var hold = { blend: 0, sweepW: 0, target: V() };
    // where the broom is: bristles `tip` on the floor, handle `top` at chest height
    function broomPose(chef, stroke, lift, toward){
      var th = chef.rotation.y, f = V(Math.sin(th), 0, Math.cos(th)), r = V(-Math.cos(th), 0, Math.sin(th));
      var base = chef.position, floorY = base.y - (ctx.getChefLift ? ctx.getChefLift() : 0);
      var tip = base.clone().addScaledVector(f, 1.4).addScaledVector(r, 0.3);
      if (toward) tip.lerp(toward, hold.sweepW);                  // over the stain while sweeping
      tip.addScaledVector(r, 0.42 * stroke); tip.y = floorY + 0.02 + lift;
      var top = base.clone().addScaledVector(f, 0.55).addScaledVector(r, 0.14 - 0.1 * stroke);
      top.y = base.y + 1.6;
      top = tip.clone().add(top.sub(tip).normalize().multiplyScalar(BROOM_LEN));
      return { tip: tip, top: top, f: f, r: r };
    }
    var basisM = new T.Matrix4();
    function placeBroom(p){
      var y = p.top.clone().sub(p.tip).normalize();
      var x = p.r.clone().sub(y.clone().multiplyScalar(p.r.dot(y))).normalize();
      var z = V().crossVectors(x, y);
      held.quaternion.setFromRotationMatrix(basisM.makeBasis(x, y, z));
      held.position.copy(p.tip);
    }
    function posePlayer(dt, stroke, lift, twist){
      var chef = ctx.getChef(), b = chef && findBones(chef);
      held.visible = broomAt !== 'closet';
      if (!b || !holding) return;
      chef.updateMatrixWorld(true);
      // the upper body turns a little with each stroke
      if (twist) setWorldQuat(b.spine, new T.Quaternion().setFromAxisAngle(UP, twist).multiply(wquat(b.spine)));
      var p = broomPose(chef, stroke, lift, sweep ? sweep.toward : null);
      var dir = p.top.clone().sub(p.tip).normalize();
      var upperHand = p.top.clone().addScaledVector(dir, -GRIP_TOP);    // left hand near the top
      var lowerHand = p.top.clone().addScaledVector(dir, -GRIP_LOW);    // right hand further down
      // the arms reach for where the palms should be (a bit past the wrist bone)
      reach(b.lA, b.lF, b.lH, upperHand.clone().addScaledVector(dir, 0), p.r.clone().multiplyScalar(-0.8).addScaledVector(UP, -0.6), PALM);
      reach(b.rA, b.rF, b.rH, lowerHand, p.r.clone().multiplyScalar(0.8).addScaledVector(UP, -0.6), PALM);
      // then the broom goes exactly through both palms, wherever the arms ended up,
      // so it always lies in the hands
      var up = palm(b.lF, b.lH), lo = palm(b.rF, b.rH), d = up.clone().sub(lo);
      if (d.length() > 0.1){
        var axis = d.normalize();
        p.top = up.clone().addScaledVector(axis, GRIP_TOP);
        p.tip = p.top.clone().addScaledVector(axis, -BROOM_LEN);
      }
      placeBroom(p);
    }
    // the middle of the palm: a little past the wrist, along the forearm
    function palm(fore, hand){
      var w = wpos(hand), dirF = w.clone().sub(wpos(fore)).normalize();
      return w.addScaledVector(dirF, PALM);
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
        stains.push({ mesh: m, x: x, z: z, size: size, grow: 0, fade: -1 });
        return;
      }
    }
    // the stain the camera is pointing at (within reach of the chef)
    var ray = new T.Vector3(), camPos = new T.Vector3();
    function aimedStain(){
      camera.getWorldPosition(camPos); camera.getWorldDirection(ray);
      if (ray.y > -0.05) return null;
      var t = -(camPos.y - 0.01) / ray.y, hx = camPos.x + ray.x * t, hz = camPos.z + ray.z * t;
      var chef = ctx.getChef(), best = null, bestD = 1e9;
      stains.forEach(function(s){
        if (s.fade >= 0) return;
        var d = Math.hypot(s.x - hx, s.z - hz);
        if (d > s.size * 0.5 + 0.15 || d >= bestD) return;
        if (chef && Math.hypot(s.x - chef.position.x, s.z - chef.position.z) > STAIN.reach) return;
        best = s; bestD = d;
      });
      return best;
    }

    // ---------- sweeping ------------------------------------------------------------
    var sweep = null;   // { stain, t, toward }
    function startSweep(s){
      var chef = ctx.getChef(), to = V(s.x, 0, s.z);
      // the bristles go over the stain, but never further than the arms reach
      var d = V(to.x - chef.position.x, 0, to.z - chef.position.z), maxD = 1.6;
      if (d.length() > maxD) to = chef.position.clone().add(d.setLength(maxD));
      sweep = { stain: s, t: 0, toward: to };
      s.fade = 0;
    }
    function trySweep(){
      if (!holding || sweep) return;
      var s = aimedStain();
      if (s) startSweep(s);
    }
    window.addEventListener('mousedown', function(e){
      if (e.button === 0 && document.pointerLockElement === canvas) trySweep();
    });

    // ---------- things you can use with E ---------------------------------------------
    function interactables(){
      var list = [];
      if (broomAt === 'closet') list.push({ pos: broomSpot, reach: USE_REACH, label: 'Pick up broom', use: function(){ setBroom('hand'); } });
      if (broomAt === 'hand') list.push({ pos: broomSpot, reach: USE_REACH, label: 'Put the broom back', use: function(){ setBroom('closet'); } });
      if (broomAt === 'floor'){
        var c = broomCenter(); c.y = 0;
        list.push({ pos: c, reach: USE_REACH, label: 'Pick up broom', use: function(){ setBroom('hand'); } });
      }
      var door = ctx.getDoor && ctx.getDoor();
      if (door && door.center){
        list.push({ pos: door.center, reach: 2.2, label: door.target > 0.5 ? 'Close door' : 'Open door',
                    use: function(){ door.target = door.target > 0.5 ? 0 : 1; } });
      }
      return list;
    }
    var fwd = new T.Vector3(), focused = null;
    function findFocus(){
      var chef = ctx.getChef();
      if (!chef) return null;
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      var best = null, bestD = 1e9;
      interactables().forEach(function(it){
        var dx = it.pos.x - chef.position.x, dz = it.pos.z - chef.position.z, d = Math.hypot(dx, dz);
        if (d > it.reach) return;
        var facing = d < 0.8 || (dx * fwd.x + dz * fwd.z) / d > 0.35;
        if (facing && d < bestD){ best = it; bestD = d; }
      });
      return best;
    }
    function interact(){
      if (sweep || broomAt === 'falling') return;
      var it = findFocus();
      if (it) it.use();
      else if (holding) dropBroom();   // drop it right here
    }

    // ---------- every frame ---------------------------------------------------------------
    function update(dt, time){
      if (broomAt === 'falling') stepFall(Math.min(dt, 0.05));
      // new stains now and then
      spawnIn -= dt;
      if (spawnIn <= 0){
        if (stains.length < STAIN.max) spawnStain();
        if (stains.length < 2) spawnStain();
        spawnIn = rnd(STAIN.every[0], STAIN.every[1]);
      }
      // stains grow in, swept ones fade out
      for (var i = stains.length - 1; i >= 0; i--){
        var s = stains[i];
        if (s.grow < 1){ s.grow = Math.min(1, s.grow + dt * 2.5); }
        var k = s.size * (1 - Math.pow(1 - s.grow, 3));
        if (s.fade >= 0){
          s.mesh.material.opacity = 1 - s.fade;
          k *= 1 - 0.25 * s.fade;
          if (s.fade >= 1){ root.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); stains.splice(i, 1); continue; }
        }
        s.mesh.scale.setScalar(Math.max(0.01, k));
      }
      // sweeping: strokes left and right over the stain, the bristles lifted a little on
      // the way back; the stain gets fainter with every stroke
      if (sweep){
        sweep.t += dt;
        var p = Math.min(1, sweep.t / SWEEP_TIME);
        var env = Math.min(1, p / 0.12, (1 - p) / 0.12);              // move over / back
        hold.sweepW = Math.max(0, env);
        var phase = p * Math.PI * 2 * STROKES;
        anim.stroke = Math.sin(phase) * env;
        anim.lift = Math.max(0, Math.cos(phase)) * 0.07 * env;
        anim.twist = Math.sin(phase) * 0.14 * env;
        var strokesDone = Math.floor(p * STROKES * 2) / (STROKES * 2);
        sweep.stain.fade = Math.min(1, Math.max(sweep.stain.fade, strokesDone * 1.05));
        if (p >= 1){ sweep.stain.fade = 1; sweep = null; hold.sweepW = 0; }
      } else {
        anim.stroke = Math.sin(time * 1.3) * 0.04;   // a gentle sway while walking around with it
        anim.lift = 0; anim.twist = 0;
      }
      // hint and aim dot
      var aimed = sweep ? null : aimedStain();
      focused = sweep ? null : findFocus();
      var locked = document.pointerLockElement === canvas;
      dot.classList.toggle('on', holding && locked);
      dot.classList.toggle('hit', !!(holding && aimed));
      if (focused) setHint(keyHint('E', focused.label));
      else if (aimed && holding) setHint(MOUSE_SVG + '<span>Sweep</span>');
      else if (aimed) setHint('<span>Get a broom' + (broomAt === 'closet' ? ' from the cleaning closet' : '') + '</span>', true);
      else if (holding && !sweep) setHint(keyHint('E', 'Drop broom'), true);
      else setHint('');
    }

    // after the character animation: put the broom in the chef's hands
    var anim = { stroke: 0, lift: 0, twist: 0 };
    function afterAnimation(dt){ posePlayer(dt, anim.stroke, anim.lift, anim.twist); }

    return {
      interact: interact, update: update, afterAnimation: afterAnimation,
      isHolding: function(){ return holding; }, stainCount: function(){ return stains.length; },
      // for tests: hold the broom anywhere, a stain right here, and sweeping without the mouse
      debugHold: function(){ setBroom('hand'); },
      debugStainAt: function(x, z){ var A = STAIN.area; STAIN.area = { x0: x, x1: x, z0: z, z1: z }; spawnStain(); STAIN.area = A; },
      debugSweep: function(){
        var chef = ctx.getChef(), s = null, best = 1e9;
        stains.forEach(function(st){ var d = Math.hypot(st.x - chef.position.x, st.z - chef.position.z); if (st.fade < 0 && d < best){ best = d; s = st; } });
        if (!holding || !s) return false; startSweep(s); return true;
      }
    };
  }

  window.HotPotGameplay = { build: build };
})();
