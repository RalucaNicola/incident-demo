(function (root) {
  const steps = [
    { title: 'Take the call', time: '14:03:00', short: 'Intake', description: 'Call 44 creates Incident 55. The caller and patient are different people. The recording stays in secured object storage; operational records keep only its reference.', datasets: ['calls', 'incidents', 'people', 'recordings'], storage: 'PostgreSQL + object storage', action: 'INSERT', view: 'district' },
    { title: 'Locate the phone', time: '14:03:12', short: 'Locate', description: 'A phone observation overlaps two building footprints. Spatial intersection creates candidates, not a confirmed patient location. The reported 35 m accuracy measure is treated as a search radius for this example, not a guaranteed boundary.', datasets: ['observations', 'buildings', 'candidate_assessments'], storage: 'PostGIS', action: 'SELECT', view: 'district' },
    { title: 'Resolve the room', time: '14:04:10', short: 'Resolve', description: 'The caller identifies Building B, floor label 2, Room 2.14. Read-back confirmation creates a sourced location assertion about the patient. It does not prove the patient is there or assign a certainty of 1.0.', datasets: ['caller_statements', 'places', 'location_assertions'], storage: 'PostgreSQL + PostGIS', action: 'INSERT', view: 'floor' },
    { title: 'Assess access', time: '14:05:00', short: 'Access', description: 'Road routing ends at a vehicle stopping point. A separate indoor assessment connects the entrance to the room. The route service uses connectivity, current restrictions, and equipment requirements; containment alone cannot establish access.', datasets: ['road_network', 'indoor_network', 'access_restrictions', 'access_assessments'], storage: 'Routing service + PostGIS', action: 'POST', view: 'floor' },
    { title: 'Compare units', time: '14:05:15', short: 'Resources', description: 'An illustrative, pre-approved response requirement is matched to current unit capabilities and status. Travel estimates come from the route service. This demo does not perform medical triage or a production dispatch optimization.', datasets: ['response_requirements', 'unit_capabilities', 'unit_status', 'route_assessments'], storage: 'PostgreSQL + routing service', action: 'SELECT', view: 'district' },
    { title: 'Authorize dispatch', time: '14:05:30', short: 'Dispatch', description: 'For this fictional walkthrough, Dispatcher 4 authorizes the assignment. One operational transaction checks and reserves Unit 12, writes the decision and assignment version, and queues an outbox event. The graph projection has not caught up yet.', datasets: ['units', 'dispatch_decisions', 'assignments', 'outbox'], storage: 'PostgreSQL transaction', action: 'COMMIT', view: 'district' },
    { title: 'Receive acknowledgement', time: '14:05:38', short: 'Confirm', description: 'The crew acknowledges the exact assignment version. The outbox consumer also applies committed events to the optional knowledge graph. Acknowledgement is not arrival: the patient location remains caller-reported until new evidence verifies it.', datasets: ['acknowledgements', 'assignments', 'outbox', 'incident_graph'], storage: 'PostgreSQL + RDF projection', action: 'ACK', view: 'graph' }
  ];

  const scenarios = {
    normal: { label: 'Standard response', room: '2.14', version: 1, elevator: true },
    correction: { label: 'Room corrected', room: '2.16', version: 2, elevator: true },
    outage: { label: 'Elevator unavailable', room: '2.14', version: 1, elevator: false }
  };

  const units = [
    { id: 'Unit 12', capability: 'AdvancedLifeSupport', status: 'Available', roadMinutes: 6 },
    { id: 'Unit 18', capability: 'PatientTransport', status: 'Available', roadMinutes: 4 },
    { id: 'Unit 07', capability: 'AdvancedLifeSupport', status: 'Assigned', roadMinutes: 3 }
  ];

  function snapshot(stepIndex, scenarioKey = 'normal') {
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) throw new RangeError('Unknown step');
    if (!Object.hasOwn(scenarios, scenarioKey)) throw new RangeError('Unknown scenario');
    const scenario = scenarios[scenarioKey];
    const corrected = scenarioKey === 'correction' && stepIndex >= 6;
    const room = corrected ? '2.16' : '2.14';
    const version = corrected ? 2 : 1;
    const roomId = `room-b-${room.replace('.', '')}`;
    const indoorMinutes = scenario.elevator ? 2 : 4;
    const assertions = stepIndex < 2 ? [] : [
      { id: 'assertion-101', room: '2.14', source: 'statement-2', status: corrected ? 'Superseded' : 'Caller-confirmed', recordedAt: '14:04:10', validFrom: '14:04:10', validTo: corrected ? '14:05:34' : null },
      ...(corrected ? [{ id: 'assertion-102', room: '2.16', source: 'statement-3', status: 'Caller-confirmed', recordedAt: '14:05:34', validFrom: '14:05:34', validTo: null }] : [])
    ];
    return {
      stepIndex, scenarioKey, scenario, step: steps[stepIndex], room, roomId, version, corrected, assertions,
      candidates: stepIndex >= 1 ? ['Building A', 'Building B'] : [],
      indoorMinutes,
      accessPath: stepIndex >= 3 ? ['North entrance', 'Lobby', scenario.elevator ? 'Elevator E1' : 'Stair S1', 'Floor 2 corridor', `Door ${room}`, `Room ${room}`] : [],
      accessCaveat: scenario.elevator ? 'Elevator availability checked at 14:05. Recheck on arrival.' : 'Stair access reviewed for the responding crew in this fictional case. Patient evacuation is not assessed.',
      units: stepIndex < 4 ? [] : units.map(unit => ({ ...unit, eligible: unit.capability === 'AdvancedLifeSupport' && unit.status === 'Available', reason: unit.capability !== 'AdvancedLifeSupport' ? 'Capability mismatch' : unit.status !== 'Available' ? 'Already assigned' : 'Capability + availability match', totalMinutes: unit.roadMinutes + indoorMinutes })),
      assignment: stepIndex >= 5 ? { id: 'assignment-10', unit: 'Unit 12', roomId, version, status: stepIndex === 6 ? 'Acknowledged' : 'Sent', authorizedBy: 'dispatcher-4' } : null,
      assignmentHistory: stepIndex < 5 ? [] : [{ version: 1, room: '2.14', status: corrected ? 'Superseded' : stepIndex === 6 ? 'Acknowledged' : 'Sent' }, ...(corrected ? [{ version: 2, room: '2.16', status: 'Acknowledged' }] : [])],
      acknowledgement: stepIndex === 6 ? { assignmentId: 'assignment-10', version, time: '14:05:38' } : null,
      projection: stepIndex === 5 ? 'Pending' : stepIndex === 6 ? 'Synced' : 'Not published',
      outbox: stepIndex >= 5 ? { status: stepIndex === 6 ? 'Delivered' : 'Pending', events: corrected ? 3 : stepIndex === 6 ? 2 : 1 } : null
    };
  }

  function queryFor(state) {
    const room = state.room;
    const roomId = state.roomId;
    const assertionId = state.corrected ? 'assertion-102' : 'assertion-101';
    const queries = [
      { language: 'SQL', title: 'Create the operational incident', code: `BEGIN;\nINSERT INTO incidents (id, status)\nVALUES ('incident-55', 'Open');\n\nINSERT INTO calls\n  (id, incident_id, caller_id, recording_ref)\nVALUES ('call-44', 'incident-55',\n  'caller-3', 'secure://recordings/call-44');\nCOMMIT;`, rows: [{ incident: 'incident-55', call: 'call-44', patient: 'patient-7', recording: 'Reference only' }], note: 'Illustrative SQL over a proposed schema. People are seeded fixtures; no recording is created.' },
      { language: 'SQL / PostGIS', title: 'Intersect the phone search area', code: `SELECT id, name\nFROM buildings\nWHERE ST_Intersects(\n  geom,\n  ST_Buffer(\n    ST_SetSRID(ST_Point(:x, :y), 32633),\n    :search_radius_m\n  )\n);\n\n-- :search_radius_m = 35\n-- Geometries share a projected, metre-based CRS.`, rows: state.candidates.map((name, index) => ({ id: `building-${index === 0 ? 'a' : 'b'}`, name, relation: 'Intersects search area', evidence: 'observation-81' })), note: 'The diagram is schematic, not georeferenced. Intersection results are fixtures, not a live PostGIS calculation.' },
      { language: 'SQL', title: 'Resolve a room and retain the claim', code: `SELECT room.id\nFROM places room\nJOIN places floor ON floor.id = room.parent_id\nWHERE floor.parent_id = 'building-b'\n  AND floor.floor_label = '2'\n  AND room.room_label = '2.14';\n\nINSERT INTO location_assertions\n  (id, subject_id, place_id, source_id, status)\nVALUES ('assertion-101', 'patient-7',\n  'room-b-214', 'statement-2', 'CallerConfirmed');`, rows: state.assertions.map(assertion => ({ assertion: assertion.id, patient: 'patient-7', room: assertion.room, source: assertion.source, status: assertion.status })), note: 'The caller statement and read-back confirmation are evidence. Room containment comes from the fictional building registry.' },
      { language: 'HTTP / JSON', title: 'Evaluate road and indoor access', code: `POST /access-assessments\n{\n  "incidentId": "incident-55",\n  "vehicleDestination": "north-stopping-point",\n  "indoorOrigin": "north-entrance",\n  "destination": "${roomId}",\n  "crewProfile": "ambulatory-response-crew",\n  "restrictionSnapshot": "restrictions-140500",\n  "exclude": ${JSON.stringify(state.scenario.elevator ? [] : ['elevator-e1'])}\n}`, rows: [{ entrance: 'North', connector: state.scenario.elevator ? 'Elevator E1' : 'Stair S1', destination: `Room ${room}`, indoorEstimate: `${state.indoorMinutes} min` }], note: `Precomputed routing fixture. ${state.accessCaveat}` },
      { language: 'SQL', title: 'Match requirements, then compare estimates', code: `SELECT unit.id, route.road_minutes,\n       route.indoor_minutes\nFROM units unit\nJOIN unit_capabilities capability\n  ON capability.unit_id = unit.id\nJOIN route_assessments route\n  ON route.unit_id = unit.id\nWHERE capability.name = 'AdvancedLifeSupport'\n  AND unit.status = 'Available'\n  AND route.incident_id = 'incident-55'\nORDER BY route.road_minutes + route.indoor_minutes;`, rows: state.units.filter(unit => unit.eligible).map(unit => ({ unit: unit.id, road: `${unit.roadMinutes} min`, indoor: `${state.indoorMinutes} min`, totalEstimate: `${unit.totalMinutes} min` })), note: 'Unit 18 is faster by road but lacks the required capability. Unit 07 is already assigned. Estimates and requirements are fictional.' },
      { language: 'SQL', title: 'Reserve once; publish after commit', code: `BEGIN;\nSELECT id FROM units\nWHERE id = 'unit-12' AND status = 'Available'\nFOR UPDATE;\n-- Application aborts if no row is returned.\nUPDATE units SET status = 'Assigned'\nWHERE id = 'unit-12';\nINSERT INTO dispatch_decisions\n  (id, authorized_by) VALUES ('decision-9', 'dispatcher-4');\nINSERT INTO assignments\n  (id, version, unit_id, destination, decision_id)\nVALUES ('assignment-10', 1, 'unit-12',\n  'room-b-214', 'decision-9');\nINSERT INTO outbox (event_key, event_type)\nVALUES ('assignment-10:v1', 'AssignmentSent');\nCOMMIT;`, rows: [{ assignment: 'assignment-10', version: 1, unit: 'Unit 12', room: '2.14', operationalState: 'Sent', graphProjection: 'Pending' }], note: 'Transaction outline only: production also needs constraints, idempotency, full event payloads, authorization, and failure handling. No real unit is reserved.' },
      { language: 'SPARQL', title: 'Explain the acknowledged destination', code: `PREFIX ex: <https://example.org/emergency/>\nSELECT ?room ?source ?dispatcher\nWHERE {\n  ex:assignment-10-v${state.version}\n    ex:destination ?room ;\n    ex:basedOn ex:${assertionId} ;\n    ex:authorizedBy ?dispatcher .\n  ex:${assertionId} ex:derivedFrom ?source .\n  ?ack ex:acknowledges ex:assignment-10-v${state.version} .\n}`, rows: [{ room: roomId, source: state.corrected ? 'statement-3' : 'statement-2', dispatcher: 'dispatcher-4', acknowledgedVersion: state.version }], note: state.corrected ? 'At 14:05:34 the caller corrects the room. A new assertion, refreshed access assessment, and reauthorized assignment v2 are issued; only v2 is acknowledged. Version 1 is retained.' : 'The acknowledgement is first recorded operationally. This illustrative graph query becomes available after event delivery; it must not be used to check live unit availability.' }
    ];
    return queries[state.stepIndex];
  }

  function graphFor(state) {
    const nodes = [
      ['incident', 'Incident 55', 'incident'], ['call', 'Call 44', 'evidence'], ['caller', 'Caller 3', 'person'], ['patient', 'Patient 7', 'person']
    ];
    const edges = [['call', 'incident', 'reports'], ['call', 'caller', 'made by'], ['incident', 'patient', 'concerns']];
    if (state.stepIndex >= 1) {
      nodes.push(['observation', 'Phone observation\n35 m search radius', 'evidence'], ['building-a', 'Building A', 'place'], ['building-b', 'Building B', 'place']);
      edges.push(['call', 'observation', 'provides'], ['incident', 'building-a', 'candidate'], ['incident', 'building-b', 'candidate']);
    }
    if (state.stepIndex >= 2) {
      nodes.push(['floor', 'Floor 2', 'place'], ['room', `Room ${state.room}`, 'place'], ['assertion', `${state.corrected ? 'Assertion 102' : 'Assertion 101'}\nCaller-confirmed`, 'evidence'], ['statement', state.corrected ? 'Statement 3' : 'Statement 2', 'evidence']);
      edges.push(['floor', 'building-b', 'part of'], ['room', 'floor', 'part of'], ['assertion', 'patient', 'subject'], ['assertion', 'room', 'locatedIn claim'], ['assertion', 'statement', 'derived from'], ['statement', 'caller', 'made by']);
    }
    if (state.stepIndex >= 3) {
      nodes.push(['access', `Access assessment\n${state.scenario.elevator ? 'Elevator E1' : 'Stair S1'}`, 'assessment'], ['entrance', 'North entrance', 'place']);
      edges.push(['access', 'room', 'destination'], ['access', 'entrance', 'uses entrance']);
    }
    if (state.stepIndex >= 4) {
      nodes.push(['unit', 'Unit 12', 'unit'], ['suitability', 'Suitability assessment', 'assessment']);
      edges.push(['suitability', 'unit', 'assesses'], ['suitability', 'incident', 'for incident']);
    }
    if (state.stepIndex >= 5) {
      nodes.push(['assignment', `Assignment 10 / v${state.version}`, 'operation'], ['dispatcher', 'Dispatcher 4', 'person']);
      edges.push(['assignment', 'unit', 'assigned unit'], ['assignment', 'room', 'destination'], ['assignment', 'assertion', 'based on'], ['assignment', 'dispatcher', 'authorized by']);
    }
    if (state.acknowledgement) {
      nodes.push(['ack', `Acknowledgement\nv${state.version}`, 'operation']);
      edges.push(['ack', 'assignment', 'acknowledges']);
    }
    return { nodes: nodes.map(([id, label, category]) => ({ data: { id, label, category } })), edges: edges.map(([source, target, label], index) => ({ data: { id: `edge-${index}`, source, target, label } })) };
  }

  const api = { steps, scenarios, snapshot, queryFor, graphFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IncidentDemo = api;
})(globalThis);