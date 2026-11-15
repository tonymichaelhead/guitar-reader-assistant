import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPositions } from '../src/music/positions.js';
import { mulberry32 } from '../src/music/rng.js';
import { seeds } from './helpers.js';

test('rotation off: one enabled position for the whole piece', () => {
  for (const seed of seeds(50)) {
    const plan = planPositions({ positions: [2, 5, 9], rotatePositions: false }, 16, mulberry32(seed));
    assert.equal(plan.length, 16);
    assert.ok([2, 5, 9].includes(plan[0]));
    assert.ok(plan.every(p => p === plan[0]));
  }
});

test('rotation off with several positions enabled uses each of them across exercises', () => {
  const used = new Set(seeds(100).map(seed =>
    planPositions({ positions: [2, 5, 9], rotatePositions: false }, 16, mulberry32(seed))[0]));
  assert.deepEqual([...used].sort((a, b) => a - b), [2, 5, 9]);
});

test('rotation on: no position repeats until all have appeared', () => {
  const positions = [1, 4, 5, 7, 12];
  for (const seed of seeds(50)) {
    const plan = planPositions({ positions, rotatePositions: true }, 16, mulberry32(seed));
    const firstCycle = plan.slice(0, positions.length);
    assert.deepEqual([...firstCycle].sort((a, b) => a - b), positions);
  }
});

test('rotation on: the first order repeats, and stops wherever the piece ends', () => {
  const positions = [1, 4, 5, 7, 12];
  for (const seed of seeds(50)) {
    const plan = planPositions({ positions, rotatePositions: true }, 16, mulberry32(seed));
    assert.equal(plan.length, 16); // 3 full cycles and one measure of a fourth
    plan.forEach((p, i) => assert.equal(p, plan[i % positions.length]));
  }
});

test('rotation on: neighbouring measures always differ when two or more are enabled', () => {
  for (const seed of seeds(50)) {
    const plan = planPositions({ positions: [3, 8], rotatePositions: true }, 16, mulberry32(seed));
    for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i], plan[i - 1]);
  }
});

test('rotation on: the order is shuffled, not fixed', () => {
  const orders = new Set(seeds(50).map(seed =>
    planPositions({ positions: [1, 5, 7, 12], rotatePositions: true }, 4, mulberry32(seed)).join(',')));
  assert.ok(orders.size > 5);
});

test('rotation on with more positions than measures uses each at most once', () => {
  const positions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const plan = planPositions({ positions, rotatePositions: true }, 8, mulberry32(3));
  assert.equal(new Set(plan).size, 8);
});

test('rotation on with a single position stays there', () => {
  const plan = planPositions({ positions: [7], rotatePositions: true }, 16, mulberry32(1));
  assert.ok(plan.every(p => p === 7));
});
