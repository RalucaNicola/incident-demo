const { steps, scenarios, snapshot, queryFor, graphFor } = IncidentDemo;
const element = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let currentStep = 0;
let scenarioKey = 'normal';
let currentView = 'district';
let detailView = 'query';
let selectedRecord = 'incident';
let timer = null;
let graph = null;
let state = snapshot(0);

const datasets = {
  calls: ['Call identifiers, receipt time, caller reference, and incident linkage.', 'PostgreSQL', 'Call-taking service'],
  incidents: ['Operational incident identity and lifecycle. Does not turn reported content into verified facts.', 'PostgreSQL', 'Incident service'],
  people: ['Separate pseudonymous caller and patient records. Caller 3 is not Patient 7.', 'PostgreSQL', 'Call-taking service'],
  recordings: ['Audio would be stored as a secured object. Only a reference is shown; no audio exists in this demo.', 'Object storage', 'Recording service'],
  observations: ['Phone observation 81, source, timestamp, and 35 m accuracy metadata.', 'PostGIS', 'Mobile location service'],
  buildings: ['Two fictional building footprints in a common projected CRS. The visual map is not georeferenced.', 'PostGIS', 'Building registry'],
  candidate_assessments: ['Incident-specific spatial matches for Buildings A and B, with links to the source observation.', 'PostgreSQL', 'Spatial analysis service'],
  caller_statements: ['The room statement and read-back confirmation; a later correction is stored separately.', 'PostgreSQL', 'Call taker'],
  places: ['Stable building, floor, room, and entrance identifiers. Room labels are scoped to their floor and building.', 'PostGIS', 'Building registry'],
  location_assertions: ['Who claims Patient 7 is in a room, when, and on what evidence. Earlier claims remain in history.', 'PostgreSQL', 'Evidence service'],
  road_network: ['Vehicle road connectivity and a stopping point outside the north entrance.', 'PostGIS', 'Road network provider'],
  indoor_network: ['Entrance, lobby, vertical connectors, corridor, doors, and rooms. Separate from containment.', 'PostGIS', 'Building management'],
  access_restrictions: ['Elevator availability at 14:05 and crew access constraints. Missing status is not permission.', 'PostgreSQL', 'Building management'],
  access_assessments: ['Evaluated entrance and indoor path, destination, profile, restrictions, and estimated duration.', 'PostgreSQL', 'Routing service'],
  response_requirements: ['Illustrative AdvancedLifeSupport requirement already assessed under an approved protocol.', 'PostgreSQL', 'Authorized triage workflow'],
  unit_capabilities: ['Unit 12 and Unit 07 provide AdvancedLifeSupport. Unit 18 provides PatientTransport.', 'PostgreSQL', 'Resource service'],
  unit_status: ['Availability snapshot: Unit 12 available, Unit 18 available, Unit 07 assigned.', 'PostgreSQL', 'Resource service'],
  route_assessments: ['Per-unit road and indoor time estimates evaluated for Incident 55.', 'PostgreSQL', 'Routing service'],
  units: ['Authoritative resource availability. Reservation uses a locked operational transaction.', 'PostgreSQL', 'Dispatch service'],
  dispatch_decisions: ['Dispatcher 4 authorization. Recommendations cannot authorize themselves.', 'PostgreSQL', 'Authorized dispatcher'],
  assignments: ['Assignment 10 with immutable destination versions, unit, decision, and evidence references.', 'PostgreSQL', 'Dispatch service'],
  outbox: ['Events committed with the operational write, then forwarded with retry and deduplication.', 'PostgreSQL', 'Outbox worker'],
  acknowledgements: ['Crew acknowledgement of a particular assignment version, not a generic incident receipt.', 'PostgreSQL', 'Crew messaging service'],
  incident_graph: ['Optional RDF projection linking assignment, room, assertion, source, and authorizing agent.', 'RDF store', 'Event projection worker']
};

function icons() {
  if (globalThis.lucide) lucide.createIcons();
  else document.querySelectorAll('button [data-lucide]').forEach(icon => {
    const glyphs = { 'rotate-ccw': '\u21ba', 'chevron-left': '\u2039', 'chevron-right': '\u203a', play: '\u25b6', pause: '\u2161', copy: '\u2398', maximize: '\u26f6', check: '\u2713' };
    icon.textContent = glyphs[icon.dataset.lucide] || '+';
  });
}

function recordFields(fields) {
  return `<dl class="record-grid">${Object.entries(fields).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

function districtSvg() {
  const located = state.stepIndex >= 1;
  const resolved = state.stepIndex >= 2;
  const routed = state.stepIndex >= 4;
  const assigned = state.stepIndex >= 5;
  return `<svg viewBox="0 0 760 390" role="img" aria-label="Fictional district with Buildings A and B, phone search area, and response unit route">
    <defs><pattern id="map-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#dbe3d6" stroke-width=".5"/></pattern><pattern id="park-lines" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#c0d7b8" stroke-width="2"/></pattern></defs>
    <rect width="760" height="390" fill="#eef2e9"/><rect width="760" height="390" fill="url(#map-grid)"/>
    <path d="M648 0C610 100 700 145 658 240S633 350 678 390H760V0Z" fill="#c5dee0"/>
    <path d="M633 0C595 100 685 145 643 240S618 350 663 390" fill="none" stroke="#f9fcf8" stroke-width="9"/>
    <rect x="15" y="80" width="110" height="100" rx="6" fill="url(#park-lines)"/>
    <rect x="474" y="278" width="136" height="66" rx="6" fill="url(#park-lines)"/>
    <path d="M0 213H636M155 0V390M470 0V258M0 325H630" stroke="#d6ddd3" stroke-width="32" fill="none"/>
    <path d="M0 213H636M155 0V390M470 0V258M0 325H630" stroke="#fffefa" stroke-width="27" fill="none"/>
    <path d="M0 213H628M155 0V390M470 0V255M0 325H630" stroke="#d4d9cf" stroke-width="1" stroke-dasharray="7 6" fill="none"/>
    <g fill="#d8dfd3" stroke="#c2cdbd"><rect x="200" y="70" width="90" height="54" rx="3"/><rect x="312" y="64" width="97" height="61" rx="3"/><rect x="210" y="145" width="198" height="34" rx="3"/><rect x="30" y="245" width="90" height="50" rx="3"/><rect x="193" y="343" width="116" height="35" rx="3"/><rect x="346" y="345" width="74" height="33" rx="3"/><rect x="510" y="50" width="75" height="64" rx="3"/><rect x="509" y="143" width="94" height="37" rx="3"/></g>
    <text x="320" y="204" font-size="10" fill="#85907f">NORTH STREET</text><text x="304" y="319" font-size="9" fill="#85907f">COURTYARD LANE</text><text x="146" y="143" transform="rotate(-90 146 143)" font-size="10" fill="#85907f">RIVERSIDE AVENUE</text><text x="690" y="179" transform="rotate(80 690 179)" font-size="12" fill="#789ba0">RIVER</text>
    <g class="svg-click" data-record="building-a" role="button" tabindex="0" aria-label="Inspect Building A"><rect x="215" y="248" width="97" height="48" rx="3" fill="${located && !resolved ? '#f6e4b9' : '#dde3d7'}" stroke="${located && !resolved ? '#c49a43' : '#bdc8b8'}" stroke-width="2"/><text x="263" y="268" text-anchor="middle" font-size="13" font-weight="600" fill="#53664f">Building A</text><text x="263" y="285" text-anchor="middle" font-size="9" fill="#798570">${located ? 'Candidate' : 'Registry footprint'}</text></g>
    <g class="svg-click" data-record="building-b" role="button" tabindex="0" aria-label="Inspect Building B"><rect x="350" y="242" width="111" height="59" rx="3" fill="${resolved ? '#d0e8dd' : located ? '#f6e4b9' : '#dde3d7'}" stroke="${resolved ? '#137b70' : located ? '#c49a43' : '#bdc8b8'}" stroke-width="2"/><text x="406" y="264" text-anchor="middle" font-size="14" font-weight="600" fill="#2c6654">Building B</text><text x="406" y="284" text-anchor="middle" font-size="10" fill="#557265">${resolved ? `Room ${state.room} / floor 2` : located ? 'Candidate' : 'Registry footprint'}</text></g>
    ${located && !resolved ? '<circle cx="331" cy="260" r="65" fill="#e2b35d" fill-opacity=".12" stroke="#bd8b2c" stroke-dasharray="5 4"/><circle cx="331" cy="260" r="6" fill="#c49130" stroke="white" stroke-width="3"/><rect x="289" y="170" width="86" height="24" rx="4" fill="#fffaf0" stroke="#dfc797"/><text x="332" y="186" text-anchor="middle" font-size="10" fill="#9d6c1c">35 m search area</text>' : ''}
    ${resolved ? '<rect x="397" y="237" width="18" height="7" fill="#137b70"/><path d="M406 235V226" stroke="#137b70" stroke-width="2"/><text x="486" y="246" font-size="10" fill="#337665">North entrance</text>' : ''}
    ${routed ? `<path d="M155 93V213H406V234" fill="none" stroke="white" stroke-width="8"/><path d="M155 93V213H406V234" fill="none" stroke="#137b70" stroke-width="4" stroke-linecap="round" ${assigned ? '' : 'stroke-dasharray="7 5"'}/><rect x="187" y="222" width="129" height="21" rx="3" fill="white" stroke="#bed5c8"/><text x="251" y="236" text-anchor="middle" font-size="10" fill="#137b70">6 min road / stopping point</text>` : ''}
    <g class="svg-click" data-record="${routed ? 'unit' : 'call'}" role="button" tabindex="0" aria-label="${routed ? 'Inspect Unit 12' : 'Inspect Call 44'}"><rect x="128" y="74" width="54" height="31" rx="5" fill="${routed ? '#137b70' : '#fff'}" stroke="${routed ? '#137b70' : '#c4d1c0'}"/><text x="155" y="94" text-anchor="middle" font-size="12" font-weight="600" fill="${routed ? 'white' : '#53664f'}">${routed ? 'U12' : '44'}</text></g>
    <text x="155" y="62" text-anchor="middle" font-size="10" fill="#52684f">${routed ? assigned ? 'UNIT ASSIGNED' : 'UNIT AVAILABLE' : 'CALL RECEIVED'}</text>
    <g transform="translate(715 35)" fill="#71867a"><path d="M0 0L-5 15L0 12L5 15Z"/><text x="0" y="-7" text-anchor="middle" font-size="10">N</text></g>
    ${!located ? '<rect x="243" y="345" width="290" height="25" rx="3" fill="white" fill-opacity=".95"/><text x="388" y="362" text-anchor="middle" font-size="11" fill="#6b796b">Patient destination not yet established</text>' : ''}
  </svg>`;
}

function floorSvg() {
  const resolved = state.stepIndex >= 2;
  const routed = state.stepIndex >= 3;
  const destinationX = state.room === '2.16' ? 629 : 481;
  const connectorX = state.scenario.elevator ? 126 : 254;
  const rooms = [
    { label: '2.10', x: 49, y: 115, width: 144 }, { label: '2.12', x: 201, y: 115, width: 144 },
    { label: '2.14', x: 353, y: 115, width: 204 }, { label: '2.16', x: 565, y: 115, width: 145 },
    { label: '2.11', x: 350, y: 267, width: 164 }, { label: '2.13', x: 522, y: 267, width: 188 }
  ];
  return `<svg viewBox="0 0 760 390" role="img" aria-label="Building B floor 2 showing rooms, corridor, elevator and stair access to Room ${state.room}">
    <defs><pattern id="floor-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#e4e9df" stroke-width=".5"/></pattern></defs><rect width="760" height="390" fill="#f7f8f3"/><rect width="760" height="390" fill="url(#floor-grid)"/>
    <rect x="40" y="105" width="679" height="230" fill="#fff" stroke="#84968a" stroke-width="4"/><rect x="44" y="224" width="671" height="34" fill="#edf1e9"/>
    ${rooms.map(room => { const active = resolved && room.label === state.room; return `<g class="svg-click" data-room="${room.label}" role="button" tabindex="0" aria-label="Inspect Room ${room.label}"><rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.y < 200 ? 103 : 59}" fill="${active ? '#d4e9df' : '#eef1e8'}" stroke="${active ? '#137b70' : '#b8c4b4'}" stroke-width="${active ? 2.5 : 1.5}"/><text x="${room.x + room.width / 2}" y="${room.y + (room.y < 200 ? 43 : 25)}" text-anchor="middle" font-size="${active ? 21 : 17}" font-weight="${active ? 600 : 400}" fill="${active ? '#137b70' : '#7e8d7d'}">${room.label}</text>${active ? `<text x="${room.x + room.width / 2}" y="${room.y + 65}" text-anchor="middle" font-size="10" fill="#377362">REPORTED PATIENT LOCATION</text>` : ''}</g>`; }).join('')}
    <text x="536" y="247" text-anchor="middle" font-size="9" fill="#9ba596">FLOOR 2 CORRIDOR</text>
    <rect x="49" y="267" width="145" height="59" fill="${!state.scenario.elevator && routed ? '#fae6df' : '#e8eee9'}" stroke="${!state.scenario.elevator && routed ? '#b76553' : '#a9bcaf'}" stroke-width="1.5"/><text x="122" y="289" text-anchor="middle" font-size="12" fill="#526e5f">ELEVATOR E1</text><text x="122" y="309" text-anchor="middle" font-size="10" fill="${!state.scenario.elevator && routed ? '#ac4f39' : '#859488'}">${!state.scenario.elevator && routed ? 'UNAVAILABLE' : 'Lobby connection'}</text>
    <rect x="202" y="267" width="137" height="59" fill="#e8eee9" stroke="#a9bcaf" stroke-width="1.5"/><path d="M210 317H238V310H245V303H252V296H259V289H266" stroke="#99aa9a" fill="none" stroke-width="2"/><text x="280" y="293" text-anchor="middle" font-size="11" fill="#526e5f">STAIR S1</text><text x="280" y="311" text-anchor="middle" font-size="9" fill="#859488">Lobby connection</text>
    ${resolved ? `<path d="M${destinationX - 12} 220H${destinationX + 12}" stroke="#f7f8f3" stroke-width="7"/><path d="M${destinationX - 12} 218V200Q${destinationX + 10} 201 ${destinationX + 12} 218" fill="none" stroke="#558c73" stroke-width="1.5"/>` : ''}
    ${routed ? `<path d="M${connectorX} 278V241H${destinationX}V197" stroke="white" stroke-width="8" fill="none"/><path d="M${connectorX} 278V241H${destinationX}V197" stroke="#137b70" stroke-width="3" stroke-dasharray="6 4" fill="none"/><circle cx="${connectorX}" cy="278" r="5" fill="#137b70" stroke="white" stroke-width="2"/><circle cx="${destinationX}" cy="191" r="7" fill="#137b70" stroke="white" stroke-width="3"/><text x="380" y="87" text-anchor="middle" font-size="11" fill="#337362">North entrance / lobby / ${state.scenario.elevator ? 'elevator' : 'stairs'} / corridor / Room ${state.room}</text>` : '<text x="380" y="87" text-anchor="middle" font-size="11" fill="#899487">Building registry / access not yet assessed</text>'}
  </svg>`;
}

function inspectRecord(recordId) {
  selectedRecord = recordId;
  const options = Array.from(element('record-select').options);
  if (options.some(option => option.value === recordId)) element('record-select').value = recordId;
  const records = {
    incident: { ID: 'incident-55', Status: 'Open', Patient: 'patient-7', Source: 'call-44' },
    call: { ID: 'call-44', Caller: 'caller-3', Received: '14:03:00', Recording: 'Secured reference only' },
    caller: { ID: 'caller-3', Role: 'Caller', 'Same as patient': 'No', Source: 'Call intake' },
    patient: { ID: 'patient-7', Role: 'Person needing assistance', Location: state.stepIndex >= 2 ? `Reported: Room ${state.room}` : 'Unknown', 'Independently verified': 'No' },
    observation: { ID: 'observation-81', Time: '14:03:12', Accuracy: '35 m (reported measure)', Subject: 'Caller phone, not patient' },
    'building-a': { ID: 'building-a', Dataset: 'Building registry', Match: state.stepIndex >= 1 ? 'Intersects search area' : 'Not assessed', 'Selected destination': 'No' },
    'building-b': { ID: 'building-b', Dataset: 'Building registry', Match: state.stepIndex >= 1 ? 'Intersects search area' : 'Not assessed', 'Reported floor': state.stepIndex >= 2 ? '2' : 'Unknown' },
    floor: { ID: 'floor-b-2', 'Part of': 'building-b', 'Local floor label': '2', Source: 'Building registry' },
    room: { ID: state.roomId, Label: state.room, 'Part of': 'floor-b-2', Evidence: 'Caller-confirmed statement' },
    assertion: { ID: state.corrected ? 'assertion-102' : 'assertion-101', Subject: 'patient-7', Predicate: 'locatedIn', Object: state.roomId, Status: 'Caller-confirmed', Source: state.corrected ? 'statement-3' : 'statement-2' },
    statement: { ID: state.corrected ? 'statement-3' : 'statement-2', 'Made by': 'caller-3', 'Recorded by': 'call-taker-2', 'Read back': 'Confirmed by caller' },
    access: { ID: state.corrected ? 'access-6' : 'access-5', Destination: state.roomId, Connector: state.scenario.elevator ? 'Elevator E1' : 'Stair S1', 'Indoor estimate': `${state.indoorMinutes} min`, 'Evaluated at': state.corrected ? '14:05:35' : '14:05:00', 'Evacuation assessed': 'No' },
    entrance: { ID: 'north-entrance', 'Part of': 'building-b', 'Vehicle destination': 'North stopping point', 'Indoor connection': 'Lobby' },
    unit: { ID: 'unit-12', Capability: 'AdvancedLifeSupport', Status: state.assignment ? 'Assigned' : 'Available', 'Road estimate': '6 min' },
    suitability: { ID: 'suitability-8', Unit: 'Unit 12', Requirement: 'AdvancedLifeSupport', Result: 'Eligible in fixture' },
    assignment: { ID: 'assignment-10', Version: state.version, Destination: state.roomId, Status: state.assignment?.status || 'Not issued', 'Authorized by': 'dispatcher-4', 'Evidence source': state.corrected ? 'assertion-102' : 'assertion-101' },
    dispatcher: { ID: 'dispatcher-4', Role: 'Authorized dispatcher', Decision: state.corrected ? 'decision-10' : 'decision-9', 'Automatic dispatch': 'No' },
    ack: { ID: 'ack-11', Assignment: 'assignment-10', Version: state.version, Received: '14:05:38', 'Confirms arrival': 'No' }
  };
  element('record-detail').innerHTML = recordFields(records[recordId] || records.incident);
  if (graph) { graph.elements().removeClass('highlighted'); graph.getElementById(recordId).addClass('highlighted'); }
}

function renderGraph() {
  element('graph-source').textContent = state.projection === 'Synced' ? 'Simulated RDF projection / synced' : state.projection === 'Pending' ? 'Operational UI preview / RDF update pending' : 'UI projection / not an RDF database';
  if (!globalThis.cytoscape) { element('graph-fallback').hidden = false; return; }
  const data = graphFor(state);
  if (!graph) {
    graph = cytoscape({
      container: element('graph-canvas'), elements: [], minZoom: .3, maxZoom: 2.5,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': '#dde8df', color: '#3e594a', 'font-family': 'Barlow, sans-serif', 'font-size': 13, 'text-wrap': 'wrap', 'text-max-width': 110, 'text-valign': 'bottom', 'text-margin-y': 7, width: 26, height: 26, 'border-width': 2, 'border-color': '#ffffff' } },
        { selector: 'node[category = "incident"]', style: { 'background-color': '#b44848', width: 40, height: 40, 'font-weight': 700 } },
        { selector: 'node[category = "evidence"]', style: { 'background-color': '#dfb45c', shape: 'diamond' } },
        { selector: 'node[category = "place"]', style: { 'background-color': '#7fb399', shape: 'round-rectangle' } },
        { selector: 'node[category = "unit"]', style: { 'background-color': '#137b70', shape: 'round-rectangle', width: 34 } },
        { selector: 'node[category = "operation"]', style: { 'background-color': '#ba6262', shape: 'hexagon', width: 32, height: 32 } },
        { selector: 'node[category = "assessment"]', style: { 'background-color': '#7c9bac', shape: 'diamond' } },
        { selector: 'edge', style: { label: 'data(label)', width: 1, 'line-color': '#bdcbbf', 'target-arrow-color': '#9dae9e', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'font-size': 9, color: '#647761', 'text-rotation': 'autorotate', 'text-background-color': '#f9fbf8', 'text-background-opacity': .9, 'text-background-padding': 2 } },
        { selector: 'edge[label = "locatedIn claim"], edge[label = "candidate"]', style: { 'line-style': 'dashed', 'line-color': '#c4a34f', 'target-arrow-color': '#c4a34f' } },
        { selector: 'edge[source = "suitability"][target = "incident"], edge[source = "ack"][target = "assignment"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 85, 'control-point-weights': .5 } },
        { selector: 'node.highlighted', style: { 'border-color': '#244e3e', 'border-width': 3, 'overlay-opacity': .1, 'overlay-color': '#137b70', 'overlay-padding': 5 } }
      ]
    });
    graph.on('tap', 'node', event => inspectRecord(event.target.id()));
  }
  graph.elements().remove();
  graph.add([...data.nodes, ...data.edges]);
  if (currentView === 'graph') layoutGraph();
}

function layoutGraph() {
  if (!graph) return;
  const positions = {
    observation: { x: 0, y: 0 }, call: { x: 145, y: 0 }, caller: { x: 290, y: 0 }, statement: { x: 435, y: 0 },
    'building-a': { x: 0, y: 105 }, incident: { x: 145, y: 105 }, patient: { x: 290, y: 105 }, assertion: { x: 435, y: 105 },
    'building-b': { x: 0, y: 210 }, floor: { x: 145, y: 210 }, room: { x: 290, y: 210 }, assignment: { x: 435, y: 210 },
    entrance: { x: 0, y: 315 }, access: { x: 145, y: 315 }, unit: { x: 290, y: 315 }, dispatcher: { x: 435, y: 315 },
    suitability: { x: 145, y: 420 }, ack: { x: 435, y: 420 }
  };
  graph.resize();
  graph.layout({ name: 'preset', positions, padding: 22, fit: true }).run();
}

function renderEvidence() {
  const claims = state.assertions.length ? state.assertions.map(assertion => `<div class="evidence-block"><h3>${escapeHtml(assertion.id)} / Room ${assertion.room}</h3>${recordFields({ Subject: 'Patient 7', Source: assertion.source, Status: assertion.status, 'Valid from': assertion.validFrom, 'Valid until': assertion.validTo || 'Open / must be rechecked' })}</div>`).join('') : '<div class="evidence-block"><h3>No room assertion yet</h3><p>The call reports a need for assistance. A phone observation locates a device; it is not evidence of a particular patient room.</p></div>';
  element('evidence-detail').innerHTML = `${claims}<div class="evidence-block"><h3>What is known vs. claimed</h3><p>Room-to-floor containment is registry information. Patient-to-room location is a caller claim. The dispatch destination is an authorized decision based on that claim, not a new verification of it.</p></div>${state.assignment ? `<div class="evidence-block"><h3>Assignment history</h3>${state.assignmentHistory.map(assignment => recordFields({ Version: assignment.version, Room: assignment.room, Status: assignment.status })).join('')}</div>` : ''}<div class="evidence-block"><h3>Two clocks</h3><p>Recorded time is when the system learned something. Valid time is when the claim applies. Both matter when reconstructing what the dispatcher knew.</p></div>`;
}

function renderEvents() {
  const labels = ['Call 44 opened Incident 55; Patient 7 linked.', 'Phone observation 81 returned two candidate buildings.', 'Caller-confirmed assertion 101: Building B / Room 2.14.', `Access 5 evaluated via ${state.scenario.elevator ? 'Elevator E1' : 'Stair S1'}; ${state.indoorMinutes} min indoors.`, 'Unit 12 eligible; Unit 18 and Unit 07 excluded.', 'Dispatcher 4 authorized v1; Unit 12 reserved; outbox pending.', `Crew acknowledged assignment v${state.version}; graph projection synced.`];
  const history = steps.slice(0, currentStep + 1).map((step, index) => ({ time: step.time, label: labels[index] }));
  if (state.corrected) history.splice(history.length - 1, 0,
    { time: '14:05:34', label: 'Caller correction: Room 2.16. Assertion 101 superseded, not deleted.' },
    { time: '14:05:35', label: 'Access 6 re-evaluated to Room 2.16; illustrative estimate unchanged.' },
    { time: '14:05:36', label: 'Dispatcher 4 authorized assignment v2; v1 retained in history.' });
  element('events').innerHTML = history.reverse().map(event => `<li><time>${event.time}</time><span>${event.label}</span></li>`).join('');
  element('event-count').textContent = `${history.length} events`;
}

function render() {
  state = snapshot(currentStep, scenarioKey);
  const query = queryFor(state);
  const statuses = ['Call received', 'Location uncertain', 'Room reported', 'Access assessed', 'Unit eligible', 'Dispatch sent', 'Crew acknowledged'];
  element('steps').innerHTML = steps.map((step, index) => `<button class="step-button ${index === currentStep ? 'current' : index < currentStep ? 'complete' : ''}" data-step="${index}" ${index === currentStep ? 'aria-current="step"' : ''} aria-label="Step ${index + 1}: ${step.title}"><span class="step-number">${index < currentStep ? '&#10003;' : `0${index + 1}`}</span><span>${step.short}</span></button>`).join('');
  element('previous').disabled = currentStep === 0;
  element('next').disabled = currentStep === steps.length - 1;
  element('stage-status').textContent = statuses[currentStep];
  element('clock').textContent = state.step.time;
  element('step-number').textContent = `0${currentStep + 1} / 07`;
  element('step-title').textContent = state.step.title;
  element('step-description').textContent = state.step.description;
  element('engine').textContent = state.step.storage;
  element('operation').textContent = state.step.action;
  element('destination').textContent = currentStep >= 2 ? `B / Floor 2 / ${state.room}` : 'Unresolved';
  element('certainty').textContent = currentStep >= 2 ? 'Caller-confirmed' : currentStep === 1 ? 'Phone observation' : 'Not yet collected';
  element('assignment').textContent = state.assignment ? `Unit 12 / v${state.version} / ${state.assignment.status}` : 'Not assigned';
  element('district-art').innerHTML = districtSvg();
  element('floor-art').innerHTML = floorSvg();
  element('floor-note').textContent = currentStep >= 3 ? state.accessCaveat : 'Room containment does not prove access. No indoor route has been evaluated yet.';
  element('scenario-note').hidden = scenarioKey === 'normal';
  element('scenario-note').textContent = scenarioKey === 'correction' ? state.corrected ? 'Room changed to 2.16 after dispatch. New evidence and authorization produce v2; the crew acknowledges v2 only.' : 'At the final step, the caller corrects the room after v1 is sent. Watch the assertion and assignment versions change.' : 'Elevator E1 is unavailable at the access step. The assessed crew path uses Stair S1; patient evacuation remains unresolved.';
  element('query-language').textContent = query.language;
  element('query-title').textContent = query.title;
  element('query-code').textContent = query.code;
  element('query-note').textContent = query.note;
  element('row-count').textContent = `${query.rows.length} ${query.rows.length === 1 ? 'row' : 'rows'}`;
  const columns = Object.keys(query.rows[0] || {});
  element('query-result').innerHTML = `<table><thead><tr>${columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${query.rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  element('dataset-count').textContent = state.step.datasets.length;
  element('dataset-list').innerHTML = state.step.datasets.map(name => { const [description, storage, owner] = datasets[name]; return `<article class="dataset-row"><h3>${name}</h3><p>${description}</p><div class="dataset-meta"><span>${storage}</span><span>${owner}</span></div></article>`; }).join('');
  const graphData = graphFor(state);
  if (!graphData.nodes.some(node => node.data.id === selectedRecord)) selectedRecord = 'incident';
  element('record-select').innerHTML = graphData.nodes.map(node => `<option value="${node.data.id}">${escapeHtml(node.data.label.replace('\n', ' / '))}</option>`).join('');
  renderGraph();
  inspectRecord(selectedRecord);
  element('storage-flow').innerHTML = `<div class="store active"><i data-lucide="database"></i><div><strong>PostgreSQL</strong><small>${state.assignment ? `Assignment v${state.version} committed` : 'Authoritative records'}</small></div></div><span class="flow-arrow">&#8594;</span><div class="store ${state.outbox?.status === 'Pending' ? 'pending' : state.outbox ? 'active' : ''}"><i data-lucide="send"></i><div><strong>Outbox</strong><small>${state.outbox ? `${state.outbox.events} event${state.outbox.events > 1 ? 's' : ''} / ${state.outbox.status}` : 'No dispatch events'}</small></div></div><span class="flow-arrow">&#8594;</span><div class="store ${state.projection === 'Synced' ? 'active' : state.projection === 'Pending' ? 'pending' : ''}"><i data-lucide="network"></i><div><strong>Knowledge graph</strong><small>${state.projection}</small></div></div>`;
  renderEvidence();
  renderEvents();
  setView(currentView, false);
  setDetail(detailView);
  icons();
  element('announcement').textContent = `Step ${currentStep + 1}: ${state.step.title}. ${statuses[currentStep]}.`;
}

function setView(view, relayout = true) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => { button.setAttribute('aria-selected', String(button.dataset.view === view)); button.tabIndex = button.dataset.view === view ? 0 : -1; });
  ['district', 'floor', 'graph'].forEach(name => { element(`${name}-view`).hidden = name !== view; });
  if (view === 'graph' && relayout) requestAnimationFrame(layoutGraph);
}

function setDetail(view) {
  detailView = view;
  document.querySelectorAll('[data-detail]').forEach(button => { button.setAttribute('aria-selected', String(button.dataset.detail === view)); button.tabIndex = button.dataset.detail === view ? 0 : -1; });
  ['query', 'data', 'evidence'].forEach(name => { element(`${name}-panel`).hidden = name !== view; });
}

function stop() {
  clearInterval(timer);
  timer = null;
  element('play').innerHTML = '<i data-lucide="play"></i>';
  element('play').setAttribute('aria-label', 'Play walkthrough');
  element('play').title = 'Play walkthrough';
  icons();
}

function goTo(step) {
  const focusedStep = document.activeElement?.dataset.step;
  currentStep = Math.max(0, Math.min(steps.length - 1, step));
  currentView = steps[currentStep].view;
  selectedRecord = ['incident', 'observation', 'assertion', 'access', 'unit', 'assignment', 'ack'][currentStep];
  render();
  if (focusedStep !== undefined) document.querySelector(`[data-step="${currentStep}"]`).focus();
  if (currentView === 'graph') requestAnimationFrame(layoutGraph);
  if (currentStep === steps.length - 1) stop();
}

element('steps').addEventListener('click', event => { const button = event.target.closest('[data-step]'); if (button) { stop(); goTo(Number(button.dataset.step)); } });
element('next').addEventListener('click', () => { stop(); goTo(currentStep + 1); });
element('previous').addEventListener('click', () => { stop(); goTo(currentStep - 1); });
element('restart').addEventListener('click', () => { stop(); goTo(0); });
element('play').addEventListener('click', () => {
  if (timer) { stop(); return; }
  if (currentStep === steps.length - 1) goTo(0);
  element('play').innerHTML = '<i data-lucide="pause"></i>';
  element('play').setAttribute('aria-label', 'Pause walkthrough');
  element('play').title = 'Pause walkthrough';
  icons();
  timer = setInterval(() => goTo(currentStep + 1), 6000);
});
element('scenario').addEventListener('change', event => { stop(); scenarioKey = event.target.value; goTo(0); });
element('record-select').addEventListener('change', event => inspectRecord(event.target.value));
element('fit-graph').addEventListener('click', () => graph?.fit(undefined, 35));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => setDetail(button.dataset.detail)));
document.querySelectorAll('[role="tablist"]').forEach(tablist => tablist.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); tabs[next].click();
}));
function handleDiagramSelection(event) {
  const target = event.target.closest('[data-record], [data-room]');
  if (!target) return;
  if (target.dataset.room) {
    const room = target.dataset.room;
    if (room === state.room && currentStep >= 2) inspectRecord('room');
    else {
      element('record-detail').innerHTML = recordFields({ ID: `room-b-${room.replace('.', '')}`, Label: room, 'Part of': 'floor-b-2', 'Patient evidence': 'No active location assertion' });
      element('record-select').value = '';
    }
  } else inspectRecord(target.dataset.record);
}
document.querySelectorAll('.diagram').forEach(diagram => {
  diagram.addEventListener('click', handleDiagramSelection);
  diagram.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleDiagramSelection(event); } });
});
element('copy-query').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(queryFor(state).code);
    element('announcement').textContent = 'Query copied.';
    element('copy-query').innerHTML = '<i data-lucide="check"></i>';
    icons();
    setTimeout(() => { element('copy-query').innerHTML = '<i data-lucide="copy"></i>'; icons(); }, 1500);
  } catch {
    const selection = globalThis.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element('query-code'));
    selection.removeAllRanges(); selection.addRange(range);
    element('announcement').textContent = 'Clipboard unavailable. Query selected for manual copying.';
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
new ResizeObserver(() => { if (currentView === 'graph' && graph) { graph.resize(); graph.fit(undefined, 22); } }).observe(document.querySelector('.scene'));
render();