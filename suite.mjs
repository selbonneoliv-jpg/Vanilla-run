import { installStubs, mkEl, last2DContext } from './stubs.mjs';
installStubs();
const { Game } = await import('../src/game/Game.js').catch(async () => {
  // when run directly via esbuild
  return await import('./game_bundle.mjs');
});
const SH = await import('../src/game/share.js').catch(async () => {
  return await import('./share_bundle.mjs');
});

let fail = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ok  ' : '  FAIL') + ' ' + m); if (!c) fail++; };

const newGame = () => {
  const g = new Game(mkEl('div'));
  g.renderer.render = () => {};
  g.getDelta = () => 1 / 60;
  ['onToast', 'onPopup', 'onStatsUpdate', 'onPowerUpUpdate', 'onDashUpdate', 'onBossUpdate', 'onEnvironmentChange', 'onStateChange', 'onRunComplete', 'onSaveUpdate', 'onFlash'].forEach(k => g[k] = () => {});
  return g;
};

console.log('[1. Game initialization and world structures]');
const g = newGame();
ok(!!g.player, 'player initialized');
ok(!!g.sky, 'gradient sky dome created');
ok(!!g.ambient, 'mote field active');
ok(g.dashMarks.length === 20, '20 speed dash marks created');
ok(g.groundSegments.length === 7, '7 ground segments initialized');

console.log('\n[2. Dynamic obstacles and creature spawning]');
g.startGame();
const obsRolling = g.spawnObstacle(0, 30, 'rollingstone');
ok(obsRolling.userData.subtype === 'rollingstone', 'rolling stone obstacle created');
const obsChasm = g.spawnObstacle(1, 35, 'chasm');
ok(obsChasm.userData.subtype === 'chasm', 'chasm hole obstacle created');
const obsBranch = g.spawnObstacle(2, 40, 'falling_branch');
ok(obsBranch.userData.subtype === 'falling_branch', 'falling branch obstacle created');
const obsRiver = g.spawnObstacle(1, 45, 'river');
ok(obsRiver.userData.subtype === 'river', 'river crossing created');

const moth = g.spawnEnemy(0, 30, 'giant_moth');
ok(moth.userData.subtype === 'giant_moth', 'Madagascar Comet Moth created');
const ibis = g.spawnEnemy(2, 35, 'crested_ibis');
ok(ibis.userData.subtype === 'crested_ibis', 'Madagascar Crested Ibis created');

console.log('\n[3. Boss Models]');
g.bossesBeaten = 0;
g.spawnBoss();
ok(g.boss && g.boss.def.id === 'forest', 'Boss 1: Gardien de la Forêt spawned');
g.clearBoss();

g.bossesBeaten = 1;
g.spawnBoss();
ok(g.boss && g.boss.def.id === 'baobab', 'Boss 2: Colosse Baobab spawned');
g.clearBoss();

g.bossesBeaten = 2;
g.spawnBoss();
ok(g.boss && g.boss.def.id === 'fossa', 'Boss 3: Fossa Dorée spawned');
g.clearBoss();

console.log('\n[3b. Biome scenery: no empty props, all new pieces present]');
const propKinds = new Set();
let empties = 0, totalProps = 0;
for (let env = 0; env < 6; env++) {
  for (let roll = 0; roll < 120; roll++) {
    g.currentEnv = env;
    const prop = g.createEnvProp({ accent: 0x4a6b2a });
    totalProps++;
    if (prop.children.length === 0) empties++;
    prop.children.forEach(c => propKinds.add(c.type));
  }
}
ok(empties === 0, `every prop spawns geometry (empty groups: ${empties}/${totalProps})`);

// Require each newly added set piece to actually build geometry
const THREE = await import('three');
const builders = [
  ['waterfall', (o) => g.addWaterfall(o), 4],        // cliff + ledge + sheet + foam
  ['fern cluster', (o) => g.addFernCluster(o), 8],   // 7 fronds + centre
  ['village hut', (o) => g.addVillageHut(o), 6],     // walls, roof, apex, door, lintel, firewood
  ['rope tower', (o) => g.addRopeTower(o), 10],
  ['pirogue', (o) => g.addPirogue(o), 6],
  ['beach shells', (o) => g.addBeachShells(o), 5],
  ['pine cluster', (o) => g.addPineCluster(o), 3],
];
g.currentEnv = 0;
for (const [label, build, minChildren] of builders) {
  const grp = new THREE.Group();
  build(grp);
  ok(grp.children.length >= minChildren, `${label} builds ${grp.children.length} meshes (need ≥${minChildren})`);
}
ok(Array.isArray(g.animatedProps), 'animated prop registry present (waterfalls flow)');

console.log("\n[4. 60s gameplay simulation]");
g.startGame();
g.takeDamage = () => {}; // perfect run
for (let i = 0; i < 3600; i++) g.loop();
ok(g.stats.distance > 800, `distance covered: ${Math.floor(g.stats.distance)} m`);
ok(g.collectibles.length < 350, `collectibles pool bounded: ${g.collectibles.length}`);
ok(g.obstacles.length < 150, `obstacles pool bounded: ${g.obstacles.length}`);

console.log('\n[5. Save migration — old files must survive new schema]');
const raw = await import('three').then(() => null); // keep import order stable
localStorage.clear();
// A "pre-tutorial, pre-rivals" save: what an existing player's file actually looks like
localStorage.setItem('vaniskara_save_v3', JSON.stringify({
  bestScore: 42000, coins: 900, totalRuns: 12, totalVanilla: 3100,
  scores: [{ score: 42000, vanilla: 300, golden: 12, distance: 2100, date: 1700000000000 }],
  achievements: ['first_harvest'], outfits: ['classic'],
  upgrades: { magnet: 1 },
  settings: { sfx: false, quality: 'low' },
}));
const migrated = await import('../src/game/save.js').catch(async () => await import('./save_bundle.mjs'));
const loaded = migrated.loadSave();
ok(loaded.bestScore === 42000 && loaded.coins === 900, 'legacy score + coins preserved');
ok(loaded.totalRuns === 12 && loaded.totalVanilla === 3100, 'legacy stats preserved');
ok(loaded.scores.length === 1 && loaded.scores[0].score === 42000, 'legacy leaderboard preserved');
ok(loaded.achievements.includes('first_harvest'), 'legacy achievements preserved');
ok(loaded.upgrades.magnet === 1 && loaded.upgrades.headStart === 0, 'legacy upgrades kept, new ones defaulted');
ok(loaded.settings.sfx === false && loaded.settings.quality === 'low', 'legacy settings kept');
ok(loaded.settings.reducedMotion === false && loaded.settings.largeText === false, 'new accessibility settings defaulted off');
ok(loaded.seenTutorial === false, 'tutorial flag defaulted → coach shown once');
ok(Array.isArray(loaded.rivals) && loaded.rivals.length === 0, 'rivals defaulted empty');
ok(loaded.outfits.length === 1, 'no phantom outfits injected');

console.log('\n[6. Coach + haptics settings]');
const g5 = newGame();
ok(g5.save.seenTutorial === false, 'fresh save has not seen the tutorial');
g5.save.seenTutorial = true;
g5.persist();
ok(g5.save.seenTutorial === true, 'tutorial completion persists');
g5.setSetting('haptics', false);
let vibrated = false;
globalThis.navigator.vibrate = () => { vibrated = true; };
g5.haptic(20);
ok(!vibrated, 'haptics suppressed when setting is off');
g5.setSetting('haptics', true);
g5.haptic(20);
ok(vibrated, 'haptics fire when setting is on');

console.log(fail ? `\n${fail}/${n} FAILED` : `\nALL ${n} PASS`);
process.exit(fail ? 1 : 0);
