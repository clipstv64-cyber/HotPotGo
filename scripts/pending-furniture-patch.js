// two more pieces of furniture for the shop: an old upright piano and a cast-iron wood stove
const fs = require('fs');
let r = fs.readFileSync('restaurant.js', 'utf8');
function rep(a, b){ if (r.split(a).length !== 2) throw new Error(a.slice(0, 100)); r = r.replace(a, () => b); }
rep(`    { key: 'jukebox',  name: 'Jukebox',       price: 190, mood: 0.08, text: 'An old jukebox with warm lights. The room comes alive.' },`,
`    { key: 'jukebox',  name: 'Jukebox',       price: 190, mood: 0.08, text: 'An old jukebox with warm lights. The room comes alive.' },
    { key: 'piano',    name: 'Old piano',     price: 230, mood: 0.09, text: 'An old upright piano, a little out of tune. It makes the room feel like a real tavern.' },
    { key: 'woodstove', name: 'Wood stove',    price: 170, mood: 0.07, text: 'A cast-iron wood stove. The room looks warm and cosy.' },`);
rep(`    jukebox:  { file: 'models/d_jukebox.glb', height: 1.75 },`, `    jukebox:  { file: 'models/d_jukebox.glb', height: 1.75 },
    piano:    { file: 'models/d_piano.glb', width: 1.55 },
    woodstove: { file: 'models/d_woodstove.glb', height: 1.5 },`);
fs.writeFileSync('restaurant.js', r); console.log('ok');
