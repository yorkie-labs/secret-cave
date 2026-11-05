// W0's test world (`?world=test`, tasks/20261102-world-redesign-todo.md):
// about 200 × 200 m, to prove the height engine before the real regions.
// An upper plateau (−10 m) in the south-east whose north-west tip is a
// waterfall cliff over a lower basin (−30 m) with a lake; one long ramp down
// the plateau's west cliff; a deep chasm along the plateau's north side with
// Polyfork's stone viaduct over it to a third plateau (−12 m) that nothing
// else reaches; big landmarks; two wolves in the basin.
//
// The camera looks down toward −x −z, so the high ground is put on the
// camera's side: from the plateau the hero looks out over the drop.
export const TEST_WORLD = {
  id: 'test',
  name: '시험 동굴',
  bounds: [-100, -100, 100, 100],
  base: { level: -30, material: 'moss' },
  wall: {
    outline: [[-90, -86], [-40, -92], [20, -90], [88, -88], [92, -30], [90, 30], [92, 88], [30, 92], [-30, 90], [-90, 88], [-92, 30], [-92, -30]],
    wobble: 5, seed: 11, band: 7,
    top: 14, // the far walls rise 44 m over the basin into the dark
    low: -5, // the camera-side rim: a few metres over the plateau
  },
  terraces: [
    {
      id: 'upper', level: -10, cliff: 5, wobble: 2.5, seed: 3, material: 'moss',
      // its west side straight for the ramp, a tip toward the lake (the falls)
      outline: [[-15, 100], [-15, 30], [-16, 12], [-21, 2], [-25, -7], [-17, -13], [-6, -9], [12, -7], [100, -7], [100, 100]],
    },
    {
      id: 'far', level: -12, cliff: 5, wobble: 3, seed: 7, material: 'mushroom',
      outline: [[16, -100], [16, -62], [9, -44], [13, -24], [100, -24], [100, -100]],
    },
    {
      // the chasm along the plateau's north side: a deep dark slot
      id: 'chasm', level: -70, cliff: 6, wobble: 1.2, seed: 5, walkable: false, material: 'rock',
      outline: [[9, -27], [100, -27], [100, -5], [9, -5]],
    },
    {
      // the lake bed: a gentle shore down under the water
      id: 'lakebed', level: -34, cliff: 7, smooth: true, wobble: 3, seed: 9, material: 'sand',
      outline: [[-58, -40], [-46, -50], [-28, -48], [-17, -36], [-19, -20], [-30, -12], [-48, -14], [-60, -26]],
    },
  ],
  ramps: [
    // down the plateau's west cliff: a turn off the plateau, then north
    // along the foot of the cliff to the basin floor (20 m over ~56 m)
    { id: 'westRamp', width: 8, pts: [[-3, 64], [-15.5, 64], [-15.5, 18]] },
  ],
  bridges: [
    { id: 'viaduct', a: [50, 1], b: [50, -31], width: 4.4, model: 'viaduct', region: 'chasm' },
  ],
  water: [
    { id: 'lake', level: -30.6, wobble: 2, seed: 9, outline: [[-56, -38], [-45, -47], [-29, -45], [-20, -35], [-22, -21], [-31, -15], [-47, -17], [-57, -27]] },
  ],
  regions: {
    base: { name: '아래 분지', level: -30 },
    upper: { name: '폭포 단구', level: -10 },
    far: { name: '먼 단구', level: -12 },
    chasm: { name: '깊은 골짜기', level: -70 },
    lakebed: { name: '호수', level: -34 },
  },
  // where the hero starts, the falls and the big things
  spawn: [22, 40],
  waterfalls: [{ x: -21, z: -6, toward: [-1, -1], width: 7 }],
  landmarks: [
    { model: 'seaStack', x: -4, z: -46, s: 7, ry: 0.4, radius: 5, tint: '#9aa6a8' },
    { model: 'seaStack', x: -66, z: 30, s: 5, ry: 2.1, radius: 3.6 },
    { model: 'seaStack', x: 70, z: -14, s: 9, ry: 1.2, radius: 0 }, // rising out of the chasm
    { model: 'bonnet', x: 52, z: -62, s: 1.6, ry: 0.3, radius: 1.2, glow: '#b88cff' },
    { model: 'bonnet', x: 62, z: -50, s: 1.1, ry: 1.9, radius: 0.8, glow: '#ffb46b' },
    { model: 'bonnet', x: 40, z: -70, s: 1.3, ry: 4.0, radius: 1, glow: '#b88cff' },
    { model: 'mesa', x: -70, z: -84, s: 1.6, ry: Math.PI / 4, radius: 0, tint: '#6f8296' },
  ],
  enemies: [
    { kind: 'wolf', x: -30, z: 34 },
    { kind: 'wolf', x: -38, z: 8 },
  ],
};
