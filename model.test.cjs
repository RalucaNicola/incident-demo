const { test } = require('node:test');
const assert = require('node:assert/strict');
const { steps, scenarios, snapshot, queryFor, graphFor } = require('./model.js');

test('every scenario and stage produces a complete, connected-reference graph and query', () => {
  for (const scenario of Object.keys(scenarios)) {
    steps.forEach((step, index) => {
      const state = snapshot(index, scenario);
      assert.equal(state.step, step);
      assert.ok(queryFor(state).code);
      const graph = graphFor(state);
      const ids = new Set(graph.nodes.map(node => node.data.id));
      assert.equal(ids.size, graph.nodes.length);
      graph.edges.forEach(edge => {
        assert.ok(ids.has(edge.data.source));
        assert.ok(ids.has(edge.data.target));
      });
    });
  }
});

test('phone candidates never become a direct patient location fact', () => {
  const state = snapshot(1);
  assert.deepEqual(state.candidates, ['Building A', 'Building B']);
  assert.equal(state.assertions.length, 0);
  assert.equal(state.assignment, null);
  assert.ok(!graphFor(snapshot(6)).edges.some(edge => edge.data.source === 'patient' && edge.data.target === 'room'));
});

test('only a capable available unit is eligible', () => {
  assert.deepEqual(snapshot(4).units.filter(unit => unit.eligible).map(unit => unit.id), ['Unit 12']);
});

test('dispatch precedes graph delivery and acknowledgement', () => {
  const sent = snapshot(5);
  assert.equal(sent.assignment.status, 'Sent');
  assert.equal(sent.projection, 'Pending');
  assert.equal(sent.acknowledgement, null);
  const acknowledged = snapshot(6);
  assert.equal(acknowledged.assignment.status, 'Acknowledged');
  assert.equal(acknowledged.projection, 'Synced');
  assert.equal(acknowledged.acknowledgement.version, acknowledged.assignment.version);
});

test('room correction preserves v1 and acknowledges only the reauthorized v2', () => {
  assert.equal(snapshot(5, 'correction').room, '2.14');
  const state = snapshot(6, 'correction');
  assert.equal(state.assignment.roomId, 'room-b-216');
  assert.equal(state.acknowledgement.version, 2);
  assert.equal(state.assignmentHistory.length, 2);
  assert.equal(state.assertions[0].status, 'Superseded');
  assert.equal(state.assertions[1].source, 'statement-3');
  assert.equal(state.accessPath.at(-1), 'Room 2.16');
  assert.match(queryFor(state).code, /assignment-10-v2/);
});

test('elevator outage changes access and estimates, not the destination', () => {
  const state = snapshot(4, 'outage');
  assert.ok(state.accessPath.includes('Stair S1'));
  assert.ok(!state.accessPath.includes('Elevator E1'));
  assert.equal(state.room, '2.14');
  assert.equal(state.units[0].totalMinutes, 10);
});

test('rewind is deterministic and invalid inputs are rejected', () => {
  snapshot(6, 'correction');
  assert.deepEqual(snapshot(0, 'correction').assertions, []);
  assert.equal(snapshot(0).assignment, null);
  assert.throws(() => snapshot(8), RangeError);
  assert.throws(() => snapshot(0, 'invalid'), RangeError);
});