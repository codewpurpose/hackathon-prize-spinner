export const choices = Array.from({ length: 11 }, (_, index) => `Choice ${String.fromCharCode(65 + index)}`);
export const segmentAngle = 360 / choices.length;

// Rejection sampling avoids favouring choices when dividing the uint32 range.
export function randomChoice(readRandom: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): number {
  const limit = Math.floor(2 ** 32 / choices.length) * choices.length;
  let value: number;
  do { value = readRandom(); } while (value >= limit);
  return value % choices.length;
}

// Segment centres start at twelve o'clock. Positive CSS rotation is clockwise.
export function landingRotation(current: number, index: number): number {
  const target = (360 - index * segmentAngle) % 360;
  const offset = (target - current % 360 + 360) % 360;
  return current + 360 * 5 + offset;
}
