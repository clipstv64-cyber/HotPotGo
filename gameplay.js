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
    reach: 3.2                // how far away you can sweep (from the chef)
  };
  var SWEEP_TIME = 1.3;       // seconds per sweep
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
    // the broom in hand hangs from the camera: the grip at the lower right of the view,
    // the bristles reaching forward and down to the floor in front of you
    var inHand = new T.Group(); inHand.visible = false; camera.add(inHand);
    var handPos = new T.Vector3(0.3, -0.3, -0.45);
    var handQ = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0.18, 0.5, 0.85).normalize());
    var rollAxis = new T.Vector3(0, 0, 1), tmpQ = new T.Quaternion();
    function poseHand(roll, dx, dy){
      inHand.quaternion.copy(tmpQ.setFromAxisAngle(rollAxis, roll)).multiply(handQ);
      inHand.position.set(handPos.x + (dx || 0), handPos.y + (dy || 0), handPos.z);
    }
    poseHand(0);
    loadBroom(function(src){
      var a = fit(src.clone(true), 1.45); a.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
      standing.add(a);
      var b = fit(src.clone(true), 1.3);
      b.position.y -= 1.05;   // hold it near the top of the handle
      b.traverse(function(m){ if (m.isMesh){ m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
      inHand.add(b);
    });
    var holding = false;

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
    var sweep = null;   // { stain, t }
    function trySweep(){
      if (!holding || sweep) return;
      var s = aimedStain();
      if (!s) return;
      sweep = { stain: s, t: 0 };
      s.fade = 0;
    }
    window.addEventListener('mousedown', function(e){
      if (e.button === 0 && document.pointerLockElement === canvas) trySweep();
    });

    // ---------- things you can use with E ---------------------------------------------
    function interactables(){
      var list = [{
        pos: broomSpot, reach: USE_REACH,
        label: holding ? 'Put the broom back' : 'Pick up broom',
        use: function(){ holding = !holding; inHand.visible = holding; standing.visible = !holding; }
      }];
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
      if (sweep) return;
      var it = findFocus();
      if (it) it.use();
    }

    // ---------- every frame ---------------------------------------------------------------
    function update(dt, time){
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
      // broom animation while sweeping
      if (sweep){
        sweep.t += dt;
        var p = Math.min(1, sweep.t / SWEEP_TIME), osc = Math.sin(p * Math.PI * 5), env = Math.sin(p * Math.PI);
        poseHand(osc * 0.38 * env, -0.12 * env + osc * 0.1 * env, -0.06 * env);   // swings left and right
        sweep.stain.fade = Math.min(1, p * 1.1);
        if (p >= 1){ sweep = null; poseHand(0); }
      } else if (holding){
        poseHand(Math.sin(time * 1.6) * 0.015);   // a gentle sway while walking around with it
      }
      // hint and aim dot
      var aimed = sweep ? null : aimedStain();
      focused = sweep ? null : findFocus();
      var locked = document.pointerLockElement === canvas;
      dot.classList.toggle('on', holding && locked);
      dot.classList.toggle('hit', !!(holding && aimed));
      if (focused) setHint(keyHint('E', focused.label));
      else if (aimed && holding) setHint(MOUSE_SVG + '<span>Sweep</span>');
      else if (aimed) setHint('<span>Get a broom from the cleaning closet</span>', true);
      else setHint('');
    }

    return {
      interact: interact, update: update,
      isHolding: function(){ return holding; }, stainCount: function(){ return stains.length; },
      // for tests: a stain right here, and sweeping without the mouse
      debugStainAt: function(x, z){ var A = STAIN.area; STAIN.area = { x0: x, x1: x, z0: z, z1: z }; spawnStain(); STAIN.area = A; },
      debugSweep: function(){
        var chef = ctx.getChef(), s = null, best = 1e9;
        stains.forEach(function(st){ var d = Math.hypot(st.x - chef.position.x, st.z - chef.position.z); if (st.fade < 0 && d < best){ best = d; s = st; } });
        if (!holding || !s) return false; sweep = { stain: s, t: 0 }; s.fade = 0; return true;
      }
    };
  }

  window.HotPotGameplay = { build: build };
})();
