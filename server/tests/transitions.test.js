const test = require('node:test');
const assert = require('node:assert');
const { canTransition, allowedNext } = require('../src/utils/transitions');

test('allows the happy path', () => {
  assert.ok(canTransition('CREATED', 'PICKED_UP'));
  assert.ok(canTransition('PICKED_UP', 'IN_TRANSIT'));
  assert.ok(canTransition('IN_TRANSIT', 'DELIVERED'));
});

test('rejects skipping states', () => {
  assert.equal(canTransition('CREATED', 'IN_TRANSIT'), false);
  assert.equal(canTransition('CREATED', 'DELIVERED'), false);
});

test('terminal states have no exits', () => {
  assert.deepEqual(allowedNext('DELIVERED'), []);
  assert.deepEqual(allowedNext('CANCELLED'), []);
});

test('cannot cancel once in transit', () => {
  assert.equal(canTransition('IN_TRANSIT', 'CANCELLED'), false);
});

test('unknown status yields no transitions', () => {
  assert.deepEqual(allowedNext('NOPE'), []);
});
