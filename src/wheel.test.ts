import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, landingRotation, randomChoice, segmentAngle } from './wheel.ts';

test('wheel presents the three raffle prizes at equal odds', () => {
  assert.deepEqual(choices, [
    'Sour Patch',
    'Swedish Fish',
    'Arduino kit, Keyboard, and Headphones',
  ]);
  assert.equal(segmentAngle, 120);
});

test('all three raffle choices land under the pointer over repeated spins', () => {
  let current = 0;
  for (let round = 0; round < 3; round++) {
    for (let index = 0; index < choices.length; index++) {
      const rotation = landingRotation(current, index);
      assert.ok(rotation - current >= 1800);
      const centre = (rotation + index * segmentAngle) % 360;
      assert.ok(Math.min(centre, 360 - centre) < 0.000001);
      current = rotation % 360;
    }
  }
});

test('random selection reaches each raffle prize and rejects biased tail values', () => {
  for (let index = 0; index < 3; index++) assert.equal(randomChoice(() => index), index);
  const values = [2 ** 32 - 1, 3];
  assert.equal(randomChoice(() => values.shift()!), 0);
});
