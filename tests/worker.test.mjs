import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const origin = 'http://127.0.0.1:8792';
let server;
let logs;
before(async () => {
  mkdirSync('.test-artifacts', { recursive: true });
  logs = createWriteStream('.test-artifacts/worker.log');
  server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'apps/worker/wrangler.jsonc', '--ip', '127.0.0.1', '--port', '8792', '--local'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  server.stdout.pipe(logs); server.stderr.pipe(logs);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Worker exited (${server.exitCode}); see .test-artifacts/worker.log`);
    try { await fetch(`${origin}/api/v1/examples`); return; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error('Worker startup timeout; see .test-artifacts/worker.log');
});
after(async () => {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  logs?.end();
});

function normalizedPublicInput(input) {
  let body; try { body=JSON.parse(input); } catch { return input; }
  const query=body?.query,snapshot=body?.snapshot;
  if(!query||!snapshot||!['changeImpact','applyImpactPatch'].includes(query.kind))return input;
  const hash=createHash('sha256').update(JSON.stringify(query.kind==='applyImpactPatch'?{snapshot,patch:query.patch}:snapshot)).digest('hex');
  let id=`draft:untrusted:${hash}`;const baseline=query.kind==='changeImpact'?query.baseline:snapshot;
  if(baseline?.revisionId===id)id=`draft:untrusted-target:${hash}`;
  if(query.kind==='applyImpactPatch')query.draftRevisionId=id;
  else {snapshot.revisionId=id;if(query.context){query.context.origin='hypothetical';if(Array.isArray(query.context.evidenceBindings))query.context.evidenceBindings=query.context.evidenceBindings.map(binding=>({...binding,provenance:'unverified'}));}}
  return JSON.stringify(body);
}
function native(input) {
  const result=JSON.parse(execFileSync('target/debug/bropilot-query', { input:normalizedPublicInput(input), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  if(result.status==='ok'&&result.result.kind==='changeImpact')result.result.report.diagnostics.push({code:'client_supplied_inputs',message:'Both compared models and evidence bindings were supplied by the client; revision labels and completeness declarations are not server-verified.',side:'both',objectIds:[]});
  return result;
}

async function query(input) {
  const response = await fetch(`${origin}/api/v1/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input });
  return { response, data: await response.json() };
}

test('catalog preserves four foundation examples and adds seven impact revisions', async () => {
  const response = await fetch(`${origin}/api/v1/examples`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.length, 11);
  assert.deepEqual(catalog.slice(0,4).map(item => item.revisionId), ['assistant-valid','assistant-missing','assistant-conflict','assistant-unknown']);
  assert.ok(catalog.every(item => item.worldId && item.revisionId && item.scenario));
});

test('deployable configuration exposes no local mutation authority', async () => {
  const session = await fetch(`${origin}/api/v1/local/session`);
  assert.deepEqual(await session.json(), { enabled: false });
  assert.equal(session.headers.get('set-cookie'), null);
  const response = await fetch(`${origin}/api/v1/worlds`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worldId: 'remote', title: 'Unavailable', requestId: 'default-disabled' }),
  });
  assert.equal(response.status, 404);
});

test('unknown pinned revisions stay unavailable', async () => {
  const response = await fetch(`${origin}/api/v1/worlds/assistant/revisions/not-a-revision`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).status, 'error');
});

test('query endpoint rejects unsupported methods', async () => {
  const response = await fetch(`${origin}/api/v1/query`);
  assert.equal(response.status, 405);
});

test('actual workerd Wasm agrees with native Rust for all fixtures and query modes', async () => {
  const catalog = JSON.parse(readFileSync('packages/contracts/fixtures/catalog.json', 'utf8')).fixtures;
  for (const item of catalog) {
    const snapshot = JSON.parse(readFileSync(`packages/contracts/fixtures/${item.id}.json`, 'utf8'));
    for (const requestQuery of [{ kind: 'workspace' }, { kind: 'readiness' }, { kind: 'children', parentId: snapshot.worldId }]) {
      const input = JSON.stringify({ apiVersion: 1, snapshot, query: requestQuery });
      const { response, data } = await query(input);
      assert.equal(response.status, 200);
      assert.deepEqual(data, native(input), `${item.id}:${requestQuery.kind}`);
    }
    const response = await fetch(`${origin}/api/v1/worlds/${snapshot.worldId}/revisions/${snapshot.revisionId}`);
    assert.deepEqual(await response.json(), native(JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'workspace' } })));
  }
});

test('malformed and version errors retain native Rust semantics', async () => {
  for (const input of ['{', '{}', JSON.stringify({ apiVersion: 9 })]) {
    const { response, data } = await query(input);
    assert.equal(response.status, 400);
    assert.deepEqual(data, native(input));
  }
});

test('oversize HTTP bodies are bounded before entering Wasm', async () => {
  const { response, data } = await query(' '.repeat(1024 * 1024 + 1));
  assert.equal(response.status, 413);
  assert.equal(data.status, 'error');
});

test('requests do not contaminate subsequent snapshot results', async () => {
  const catalog = JSON.parse(readFileSync('packages/contracts/fixtures/catalog.json', 'utf8')).fixtures;
  const snapshot = JSON.parse(readFileSync(`packages/contracts/fixtures/${catalog[0].id}.json`, 'utf8'));
  const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const first = (await query(input)).data;
  await query('{');
  assert.deepEqual((await query(input)).data, first);
});


test('untrusted template rule counts are rejected before inference in native and workerd', async () => {
  const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
  const rule = snapshot.template.forbiddenCycles[0];
  snapshot.template.forbiddenCycles = Array.from({ length: 33 }, (_, index) => ({ ...rule, ruleId: `excess-rule-${index}` }));
  const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const expected = native(input);
  assert.equal(expected.status, 'error');
  assert.equal(expected.code, 'resource_limit');
  const { response, data } = await query(input);
  assert.equal(response.status, 413);
  assert.deepEqual(data, expected);
});

test('query media types and unknown API paths stay explicit', async () => {
  const media = await fetch(`${origin}/api/v1/query`, { method: 'POST', body: '{}' });
  assert.equal(media.status, 415);
  assert.equal((await media.json()).code, 'unsupported_media_type');
  const missing = await fetch(`${origin}/api/v1/not-an-endpoint`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'route_not_found');
});


test('input digests distinguish facts under the same revision label', async () => {
  const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
  const base = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  snapshot.objects[0].title += ' revised';
  const changed = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const first = (await query(base)).data;
  const second = (await query(changed)).data;
  assert.equal(first.status, 'ok'); assert.equal(second.status, 'ok');
  assert.notEqual(first.result.evaluation.snapshotHash, second.result.evaluation.snapshotHash);
  assert.equal(first.result.evaluation.templateHash, second.result.evaluation.templateHash);
  assert.deepEqual(second, native(changed));
});

test('unsupported pack pins and wrong typed references cannot become ready', async () => {
  for (const edit of [
    snapshot => { snapshot.rulePacks = [{ id: 'does-not-exist', version: '999' }]; },
    snapshot => { snapshot.purpose.beneficiaryIds = ['outcome-1']; },
  ]) {
    const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
    edit(snapshot);
    const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
    const { data } = await query(input);
    assert.equal(data.status, 'ok');
    assert.notEqual(data.result.evaluation.status, 'ready');
    assert.deepEqual(data, native(input));
  }
});


const impactFixture = id => JSON.parse(readFileSync(`packages/contracts/fixtures/${id}.json`, 'utf8'));
const impactBindings = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-impact-evidence.json', 'utf8'));
function impactInput(baseline, snapshot, evidenceBindings = []) {
  return JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'changeImpact', baseline, context: { origin: 'saved', evidenceBindings } } });
}
function impactGraph(size, edgePairs) {
  const snapshot = impactFixture('assistant-impact-baseline');
  snapshot.objects = Array.from({length:size}, (_,i) => ({id:`n${String(i).padStart(3,'0')}`,kind:'task',title:`Task ${i}`,properties:{},source:{kind:'declared',reference:'test:graph'}}));
  snapshot.relations = edgePairs.map(([from,to],i)=>({id:`r${String(i).padStart(3,'0')}`,kind:'dependsOn',fromId:snapshot.objects[from].id,toId:snapshot.objects[to].id,source:{kind:'declared',reference:'test:graph'}}));
  snapshot.theory.claims=[];
  return snapshot;
}
function reachedObjects(result) { return result.result.report.affectedThings.flatMap(thing=>thing.objects.map(object=>object.objectId)).sort(); }
function bfsOracle(snapshot, seed) {
  const seen=new Set([seed]); const queue=[seed];
  while(queue.length) { const id=queue.shift(); for(const edge of snapshot.relations) if(edge.kind==='dependsOn'&&edge.toId===id&&!seen.has(edge.fromId)){ seen.add(edge.fromId);queue.push(edge.fromId); } }
  return [...seen].sort();
}
test('impact fixture reports and hypothetical patch results agree exactly in native and actual workerd', async () => {
  const baseline=impactFixture('assistant-impact-baseline');
  for(const id of ['baseline','calendar-adapter','completion','interface','removed-dependency','metric-definition','incomplete']) {
    const input=impactInput(baseline,impactFixture(`assistant-impact-${id}`),impactBindings[baseline.revisionId]);
    const expected=native(input); assert.equal(expected.status,'ok',JSON.stringify(expected));
    assert.deepEqual((await query(input)).data,expected,id);
  }
  const input=JSON.stringify({apiVersion:1,snapshot:baseline,query:{kind:'applyImpactPatch',draftRevisionId:'draft:parity',patch:{operations:[{kind:'setThingRevision',thingId:baseline.things[0].id,revisionId:'parity@2'}]}}});
  assert.deepEqual((await query(input)).data,native(input));
});
test('actual workerd follows the complete 128-hop witness and matches the differential traversal oracle', async () => {
  const chain=impactGraph(129,Array.from({length:128},(_,i)=>[i+1,i]));
  const target=structuredClone(chain);target.objects[0].title+=' edited';
  const input=impactInput(chain,target);const result=(await query(input)).data;
  assert.equal(result.status,'ok',JSON.stringify(result)); assert.deepEqual(result,native(input));
  assert.deepEqual(reachedObjects(result),bfsOracle(chain,'n000'));
  const last=result.result.report.affectedThings.flatMap(t=>t.objects).find(o=>o.objectId==='n128');
  assert.ok(last.witnesses.every(w=>w.relationIds.length===128));
  let state=271828;
  for(let sample=0;sample<12;sample++) {
    const pairs=[];
    for(let from=1;from<18;from++)for(let to=0;to<from;to++){state=(Math.imul(state,1664525)+1013904223)>>>0;if(state%5===0)pairs.push([from,to]);}
    const baseline=impactGraph(18,pairs);const proposed=structuredClone(baseline);proposed.objects[0].properties.statement='edited';
    const input=impactInput(baseline,proposed); const actual=(await query(input)).data;
    assert.equal(actual.status,'ok',JSON.stringify(actual));assert.deepEqual(actual,native(input));assert.deepEqual(reachedObjects(actual),bfsOracle(baseline,'n000'));
  }
});
test('direct-edge versus recursive impact benchmark records honest native and workerd measurements', async () => {
  const rows=[];
  for(const size of [8,32,64,129]) {
    const baseline=impactGraph(size,Array.from({length:size-1},(_,i)=>[i+1,i]));
    const target=structuredClone(baseline);target.objects[0].title+=' edited';const input=impactInput(baseline,target);
    const direct=new Set(['n000',...baseline.relations.filter(r=>r.toId==='n000').map(r=>r.fromId)]);
    const nativeTimes=[],workerdTimes=[];let actual;
    for(let repeat=0;repeat<5;repeat++) {
      let start=performance.now();const expected=native(input);nativeTimes.push(performance.now()-start);
      start=performance.now();actual=(await query(input)).data;workerdTimes.push(performance.now()-start);assert.deepEqual(actual,expected);
    }
    const recursive=reachedObjects(actual);assert.deepEqual(recursive,bfsOracle(baseline,'n000'));
    const stat=values=>{const sorted=values.toSorted((a,b)=>a-b);return {samples:values.length,p50Ms:sorted[Math.floor(sorted.length/2)],p95Ms:sorted.at(-1)}};
    rows.push({nodes:size,edges:size-1,seeds:1,directAffected:direct.size,recursiveAffected:recursive.length,additionalAffected:recursive.length-direct.size,nativeProcessAndSerialization:stat(nativeTimes),workerdHttpAndSerialization:stat(workerdTimes)});
  }
  const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync('.test-artifacts/change-impact-benchmark.json',JSON.stringify({schemaVersion:1,measuredAt:new Date().toISOString(),sourceHashes:{impact:sha('crates/world-core/src/impact.rs'),metrics:sha('crates/world-core/src/assistant_impact.rs'),wasm:sha('packages/core-wasm/bropilot_core_wasm_bg.wasm')},method:'Five serial end-to-end native CLI and actual workerd HTTP queries per single-seed chain. Direct-edge baseline is count-only, not a separately timed engine. Timings include transport/startup and are not engine speedup evidence.',rows},null,2)+'\n');
  assert.deepEqual(rows.map(r=>r.additionalAffected),[6,30,62,127]);
});


test('public raw impact queries cannot attest saved identities or server-resolved evidence', async () => {
  const baseline=impactFixture('assistant-impact-baseline'),target=impactFixture('assistant-impact-calendar-adapter');
  const bindings=structuredClone(impactBindings[baseline.revisionId]);for(const binding of bindings)binding.provenance='serverResolved';
  const input=impactInput(baseline,target,bindings);const result=(await query(input)).data;
  assert.equal(result.status,'ok',JSON.stringify(result));assert.deepEqual(result,native(input));
  assert.equal(result.result.report.origin,'hypothetical');assert.match(result.result.report.target.revisionId,/^draft:untrusted:/);
  assert.notEqual(result.result.report.target.revisionId,baseline.revisionId);
  assert.ok(result.result.report.evidence.every(evidence=>evidence.provenance==='unverified'));
  assert.ok(result.result.report.diagnostics.some(d=>d.code==='client_supplied_inputs'&&d.message.includes('Both compared models')));
  const forged=structuredClone(target);const hash=createHash('sha256').update(JSON.stringify(forged)).digest('hex');
  baseline.revisionId=`draft:untrusted:${hash}`;
  const conflict=(await query(impactInput(baseline,forged))).data;
  assert.equal(conflict.status,'ok',JSON.stringify(conflict));assert.notEqual(conflict.result.report.target.revisionId,baseline.revisionId);
});
