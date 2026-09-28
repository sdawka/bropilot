// Smoke test for the lfp. Usage: BIN=<chromium binary> OUT=<dir> node smoke.mjs   (dev server on :5199)
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.env.OUT ?? '/tmp';

// Test harness: wrap each test in t(testId, fn) to record pass/fail
const results = {};
async function t(testId, fn) {
  try {
    await fn();
    results[testId] = { status: 'pass', at: new Date().toISOString() };
  } catch (e) {
    results[testId] = { status: 'fail', at: new Date().toISOString(), value: String(e.message).slice(0, 200) };
    throw e;
  }
}

// Exit handler: write results to REALITY_OUT if set, merge with existing
if (process.env.REALITY_OUT) {
  process.on('exit', () => {
    try {
      const existing = JSON.parse(readFileSync(process.env.REALITY_OUT, 'utf8'));
      existing.results = { ...existing.results, ...results };
      writeFileSync(process.env.REALITY_OUT, JSON.stringify(existing, null, 2));
    } catch {
      writeFileSync(process.env.REALITY_OUT, JSON.stringify({ results }, null, 2));
    }
  });
}

const b = await chromium.launch({ executablePath: process.env.BIN }); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const r = {};

await t('test-page-loads', async () => {
  await p.goto('http://localhost:5199/#overview'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.card');
  r.overview = { cards: await p.locator('.card').count(), cols: await p.locator('.col').count(), dogfood: await p.locator('.dogfood').innerText(), basicsHidden: (await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count()) === 0 };
  await p.locator('button', { hasText: /basics/i }).first().click(); r.overview.basicsShownAfterToggle = await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count();
  await p.locator('.card > .title', { hasText: 'Guided articulation path' }).first().click(); await p.waitForSelector('.inspector'); await p.waitForTimeout(200);
  r.overview.linesDrawn = await p.locator('.links line').count(); r.overview.litCards = await p.locator('.card.lit').count(); r.overview.chips = await p.locator('.chip').count();
  r.provFull = { quotes: await p.locator('.inspector .quote').count(), ctx: await p.locator('.inspector .ctx').count() };
  await p.locator('.inspector .more').first().click(); r.provFull.fullBrief = await p.locator('.inspector .full-brief').count();
  await p.locator('.prov.said').first().hover(); await p.waitForTimeout(150); r.hoverPop = await p.locator('.pop').count();
  await p.screenshot({ path: `${out}/overview.png` });
});

await t('test-store-answer-stages', async () => {
  // definition — read mode: no editors in the side pane or the glossary drawer; answering/approving/undoing goes through the Talk panel
  await p.goto('http://localhost:5199/#definition'); await p.waitForSelector('.q, [class*=tree]');
  await p.waitForSelector('[data-testid=talk-panel]');
  r.definition = {
    roots: await p.getByText('template', { exact: true }).count(),
    sideTextareas: await p.locator('.answer.side textarea').count(),
    sideButtons: await p.locator('.answer.side button').count(),
  };
  await p.locator('.glossary-btn').click(); await p.waitForTimeout(200);
  r.definition.glossaryTextareas = await p.locator('.glossary textarea').count();
  r.definition.glossaryEditButtons = await p.locator('.glossary button:not(.close)').count();
  await p.locator('.glossary .close').click(); await p.waitForTimeout(150);

  // drive the protocol directly (ScriptedDirector's freeTalk keyword matcher doesn't stage a plain answer).
  // NOTE: with the seed graph, ctx.next is always null — every kernel question's produced kind already
  // has committed nodes (committedAnswerFor's seed-counts-as-answered fallback), so there is no "next
  // root question" to answer. Exercise the same answer→stage→approve→undo path via a follow-up instead.
  r.definition.nextQuestionWhenSeeded = await p.evaluate(() => window.__lfp.nextQuestion.value);
  const qid = await p.evaluate(() => {
    window.__lfp.applyCue({ t: 'followup', parentId: 'q-audience', prompt: 'smoke: which of them pays?', kind: 'sub' });
    return window.__lfp.state.followups.at(-1).id;
  });
  r.definition.followupId = qid;
  const nodesBefore = await p.evaluate(() => window.__lfp.state.graph.nodes.length);
  await p.evaluate((id) => window.__lfp.applyCue({ t: 'answer', questionId: id, content: 'Small teams with a budget' }), qid);
  await p.waitForSelector('[data-testid=talk-now] [data-testid=talk-approve]');
  r.definition.stagedEffects = await p.locator('[data-testid=talk-now] .effects li').count();
  r.definition.stagedShown = (await p.locator('[data-testid=talk-now]').innerText()).includes('staged');
  await p.locator('[data-testid=talk-approve]').click(); await p.waitForTimeout(250);
  const nodesAfterApprove = await p.evaluate(() => window.__lfp.state.graph.nodes.length);
  r.definition.nodesAddedByApprove = nodesAfterApprove - nodesBefore;
  await p.locator('[data-testid=talk-undo]').click(); await p.waitForTimeout(250);
  const nodesAfterUndo = await p.evaluate(() => window.__lfp.state.graph.nodes.length);
  r.definition.nodesRestoredByUndo = nodesAfterUndo === nodesBefore;
  await p.screenshot({ path: `${out}/definition.png` });
});

await t('test-one-utterance', async () => {
  // AI functions: "what next" through the Talk panel composer → an ask/say utterance, tracked as an
  // AICall, rated via the feedback buttons, and the rating persists across a reload (S128–S131).
  await p.locator('[data-testid=talk-input]').fill('what next'); await p.locator('[data-testid=talk-send]').click();
  await p.waitForSelector('[data-testid=talk-feedback]');
  r.aiFeedback = { utteranceShown: await p.locator('[data-testid=talk-utterance]').count(), trackingText: await p.locator('[data-testid=talk-tracking]').first().innerText() };
  await p.locator('[data-testid=talk-feedback-makes-sense]').first().click(); await p.waitForTimeout(150);
  r.aiFeedback.ratedInStore = await p.evaluate(() => window.__lfp.state.aiCalls[0]?.rating?.value);
  await p.reload(); await p.waitForSelector('[data-testid=talk-panel]');
  r.aiFeedback.ratedAfterReload = await p.evaluate(() => window.__lfp.state.aiCalls[0]?.rating?.value);
});

await t('test-mirror-exists', async () => {
  // Reference (#kernel): AI-functions table, calls table, efficacy summary
  await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('table');
  r.anchors = (await p.locator('body').innerText()).includes('every statement anchors');
  r.kernel = {
    aiFunctionRows: await p.locator('[data-testid=ref-ai-functions] tbody tr').count(),
    aiCallRows: await p.locator('[data-testid=ref-ai-calls] tbody tr').count(),
    aiEfficacyRows: await p.locator('[data-testid=ref-ai-efficacy] tbody tr').count(),
  };

  // dogfood: every registry AI function has a matching ai-function graph node
  r.dogfood = await p.evaluate(() => {
    const ids = window.__lfp.aiFunctionIds.slice().sort();
    const nodeIds = window.__lfp.state.graph.nodes.filter((n) => n.kind === 'ai-function').map((n) => n.id.replace(/^ai-function-/, '')).sort();
    return { registryIds: ids, graphIds: nodeIds, match: JSON.stringify(ids) === JSON.stringify(nodeIds) };
  });
});

await t('test-point-highlights', async () => {
  // domain — Map | Deployment | Modules | Cell
  await p.goto('http://localhost:5199/#domain'); await p.waitForTimeout(300);
  r.domain = { l0: (await p.locator('body').innerText()).includes('Planned changes') };
  await p.screenshot({ path: `${out}/domain-l0.png` });

  await p.locator('.level-tab').nth(1).click(); await p.waitForSelector('[data-testid=arch-deployment]'); await p.waitForTimeout(200);
  r.domain.deploymentRoles = await p.locator('[data-testid=arch-deployment] [data-role]').count();
  await p.screenshot({ path: `${out}/domain-l1.png` });

  await p.locator('.level-tab').nth(2).click(); await p.waitForTimeout(150);
  r.domain.modules = await p.getByText('Representation', { exact: true }).count();
  r.domain.screenItemsAreModules = await p.evaluate(() => window.__lfp.state.screen.items.some((i) => i.id.startsWith('module-')));
  await p.screenshot({ path: `${out}/domain-l2.png` });

  await p.locator('.level-tab').nth(3).click(); await p.waitForSelector('[data-testid=arch-cell]'); await p.waitForTimeout(300);
  r.domain.cellHandles = await p.locator('[data-testid=arch-cell] .vue-flow__handle').count();
  r.domain.cellCircuits = await p.locator('[data-testid=arch-cell] [data-circuit]').count();
  await p.screenshot({ path: `${out}/domain-l3.png` });
});

await t('test-stage-reviewable', async () => {
  // flows — a flow's `uses` edges spotlight its touched nodes everywhere: Flows itself, Overview cards, Cell nodes
  await p.goto('http://localhost:5199/#flows'); await p.waitForSelector('.flow'); await p.waitForTimeout(150);
  const flowId = 'flow-talk-to-tests';
  await p.locator(`.flow[data-node-id="${flowId}"]`).click(); await p.waitForTimeout(150);
  r.flows = { flowId, lit: await p.locator(`.flow[data-node-id="${flowId}"].lit`).count() };
  await p.screenshot({ path: `${out}/flows.png` });

  await p.goto('http://localhost:5199/#overview'); await p.waitForSelector('.card'); await p.waitForTimeout(150);
  r.flows.overviewDim = await p.locator('.card.dim').count();

  await p.goto('http://localhost:5199/#domain'); await p.waitForTimeout(200);
  await p.locator('.level-tab').nth(3).click(); await p.waitForSelector('[data-testid=arch-cell]'); await p.waitForTimeout(300);
  r.flows.cellDim = await p.locator('[data-testid=arch-cell] .dim').count();

  // glossary read
  await p.locator('.glossary-btn').click(); await p.waitForTimeout(200);
  r.glossary = { terms: await p.getByText('Representation layer').count() };
  await p.screenshot({ path: `${out}/glossary.png` });
});

// v4.1 (Stage 2): Reference — violations, open items, edge shapes. No matching test node in
// graph.json yet (these are new Reference tables, not kernel rules), so this is a plain check.
{
  await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('[data-testid=ref-violations]');
  r.v41Reference = {
    violationRows: await p.locator('[data-testid=ref-violations] tbody tr').count(),
    openRows: await p.locator('[data-testid=ref-open] tbody tr').count(),
    edgeShapeRows: await p.locator('[data-testid=ref-edge-shapes] tbody tr').count(),
  };
  if (r.v41Reference.violationRows < 1) throw new Error(`ref-violations: expected >=1 row on the seed, got ${r.v41Reference.violationRows}`);
  if (r.v41Reference.openRows < 1) throw new Error(`ref-open: expected >=1 row on the seed, got ${r.v41Reference.openRows}`);
  if (r.v41Reference.edgeShapeRows < 20) throw new Error(`ref-edge-shapes: expected >=20 rows (one per EDGE_TYPES entry), got ${r.v41Reference.edgeShapeRows}`);
}

// v4.1: Talk panel's Now strip shows ctx.next with a tier badge (S145+). Plain check.
{
  await p.goto('http://localhost:5199/#overview'); await p.waitForSelector('.card');
  // defensive: test-stage-reviewable opens the glossary drawer for a screenshot and never closes it;
  // shut it before clicking composer controls that would otherwise sit behind it.
  if (await p.locator('.glossary').count()) { await p.locator('.glossary .close').click(); await p.waitForTimeout(150); }
  const rankedNext = await p.evaluate(() => window.__lfp.rankOpen()[0] ?? null);
  if (!rankedNext) throw new Error('rankOpen()[0] is null on the seed — expected at least one open item');
  await p.waitForSelector('[data-testid=talk-next]', { timeout: 5000 });
  const tierText = await p.locator('[data-testid=talk-next-tier]').innerText();
  const validTiers = ['Blocking', 'Next question', 'Gap', 'Open thread'];
  if (!validTiers.includes(tierText.trim())) throw new Error(`talk-next-tier text "${tierText}" is not one of ${validTiers.join(', ')}`);
  r.v41TalkNext = { rankedNextId: rankedNext.id, tierText: tierText.trim() };
}

// v4.1: "what next" → an ask utterance tiered by rankOpen(); rate it → AICall.rating recorded.
// (Builds on the existing test-one-utterance flow above, which already exercises feedback+reload.)
{
  await p.locator('[data-testid=talk-input]').fill('what next'); await p.locator('[data-testid=talk-send]').click();
  await p.waitForSelector('[data-testid=talk-utterance]');
  const utteranceText = await p.locator('[data-testid=talk-utterance] p').first().innerText();
  const tierWords = ['Blocking', 'Next question', 'Gap', 'Open thread'];
  const startsWithTier = tierWords.some((w) => utteranceText.trim().toLowerCase().startsWith(w.toLowerCase()) || utteranceText.includes(w));
  r.v41WhatNext = { utteranceText, startsWithTier };
  await p.waitForSelector('[data-testid=talk-feedback-makes-sense]');
  await p.locator('[data-testid=talk-feedback-makes-sense]').first().click(); await p.waitForTimeout(150);
  const lastCallRating = await p.evaluate(() => window.__lfp.state.aiCalls.at(-1)?.rating?.value);
  if (!lastCallRating) throw new Error('expected state.aiCalls last call to carry a rating after clicking talk-feedback-makes-sense');
  r.v41WhatNext.lastCallRating = lastCallRating;
}

// v4.1: edit-staleness — editing a committed rule with a verifies edge marks its edges suspect;
// talk-suspect shows; revalidating an unchanged node clears them (early cutoff). Plain check.
{
  const before = await p.evaluate(() => {
    const g = window.__lfp.state.graph;
    const rule = g.nodes.find((n) => n.id === 'rule-unlock');
    return { v: rule?.v ?? 0, title: rule?.title }; // seed nodes carry no v until first edit (baseline 0)
  });
  if (before.title === undefined) throw new Error('rule-unlock not found in the seed graph');

  await p.evaluate(() => {
    const g = window.__lfp.state.graph;
    const rule = g.nodes.find((n) => n.id === 'rule-unlock');
    window.__lfp.state.staged = {
      effects: [{ id: 'ef-x', op: 'update-node', nodeId: rule.id, patch: { title: rule.title + ' (reworded)' }, answerId: 'smoke' }],
      warnings: [],
    };
    window.__lfp.applyCue({ t: 'commit' });
  });
  await p.waitForTimeout(150);

  const after = await p.evaluate(() => {
    const g = window.__lfp.state.graph;
    const rule = g.nodes.find((n) => n.id === 'rule-unlock');
    const touchingEdges = g.edges.filter((e) => e.src === rule.id || e.dst === rule.id);
    return { v: rule.v ?? 0, title: rule.title, suspectCount: touchingEdges.filter((e) => e.trace === 'suspect').length, totalTouching: touchingEdges.length };
  });
  if (!(after.v > before.v)) throw new Error(`expected rule-unlock's v to increment past ${before.v}, got ${after.v}`);
  if (after.suspectCount < 1) throw new Error('expected at least one edge touching rule-unlock to be suspect after the edit');

  await p.reload(); await p.waitForSelector('[data-testid=talk-panel]');
  await p.waitForSelector('[data-testid=talk-suspect]', { timeout: 5000 });
  await p.locator('[data-testid=talk-revalidate]').first().click({ force: true }); await p.waitForTimeout(200);

  const revalidated = await p.evaluate(() => {
    const g = window.__lfp.state.graph;
    const rule = g.nodes.find((n) => n.id === 'rule-unlock');
    const touchingEdges = g.edges.filter((e) => e.src === rule.id || e.dst === rule.id);
    return { suspectCount: touchingEdges.filter((e) => e.trace === 'suspect').length };
  });
  if (revalidated.suspectCount !== 0) throw new Error(`expected revalidate() on unchanged rule-unlock to clear its suspect edges, got ${revalidated.suspectCount} still suspect`);
  const suspectStripGone = (await p.locator('[data-testid=talk-suspect]').count()) === 0;
  r.v41Staleness = { beforeV: before.v, afterV: after.v, suspectAfterEdit: after.suspectCount, suspectAfterRevalidate: revalidated.suspectCount, suspectStripGone };
  if (!suspectStripGone) throw new Error('expected talk-suspect strip to disappear after revalidating the only suspect node');
}

// v4.1: outcome tracking — approve records outcome.state 'approved'; discard records 'discarded',
// on the AICall that actually staged the changeset. Plain answer/commit doesn't call an AI function
// (see test-store-answer-stages' note above), so this drives the "edit bet: …" AI-backed reword path
// (src/ai/functions/explain-node.ts, op reword-start/reword-apply) instead, which does.
{
  // "edit bet: …" points at (and so selects) the bet, opening the Overview inspector — a fixed side
  // panel that can visually overlap the Talk panel's own fixed position and make its Send *button*
  // flaky to click; drive the composer via Enter instead, which doesn't have that problem.
  await p.locator('[data-testid=talk-input]').fill('edit bet: H1'); await p.locator('[data-testid=talk-input]').press('Enter');
  await p.waitForSelector('[data-testid=talk-utterance]');
  await p.locator('[data-testid=talk-input]').fill('H1, reworded by smoke (approve path)'); await p.locator('[data-testid=talk-input]').press('Enter');
  await p.waitForSelector('[data-testid=talk-approve]');
  const stagingCallId = await p.evaluate(() => window.__lfp.state.aiCalls.at(-1)?.id);
  // the reword's `point` cue opened the Overview inspector (fixed panel) on top of the Talk panel's
  // Approve button, which a real browser click would hit instead of the button underneath; `clear`
  // closes the inspector without touching the staged changeset.
  await p.evaluate(() => window.__lfp.applyCue({ t: 'clear' })); await p.waitForTimeout(100);
  await p.locator('[data-testid=talk-approve]').click(); await p.waitForTimeout(200);
  const approvedOutcome = await p.evaluate((id) => window.__lfp.state.aiCalls.find((c) => c.id === id)?.outcome?.state, stagingCallId);
  if (approvedOutcome !== 'approved') throw new Error(`expected the staging AICall's outcome.state to be 'approved', got ${approvedOutcome}`);

  await p.locator('[data-testid=talk-input]').fill('edit bet: H2'); await p.locator('[data-testid=talk-input]').press('Enter');
  await p.waitForSelector('[data-testid=talk-utterance]');
  await p.locator('[data-testid=talk-input]').fill('H2, reworded by smoke (discard path)'); await p.locator('[data-testid=talk-input]').press('Enter');
  await p.waitForSelector('[data-testid=talk-discard]');
  const stagingCallId2 = await p.evaluate(() => window.__lfp.state.aiCalls.at(-1)?.id);
  await p.evaluate(() => window.__lfp.applyCue({ t: 'clear' })); await p.waitForTimeout(100);
  await p.locator('[data-testid=talk-discard]').click(); await p.waitForTimeout(200);
  const discardedOutcome = await p.evaluate((id) => window.__lfp.state.aiCalls.find((c) => c.id === id)?.outcome?.state, stagingCallId2);
  if (discardedOutcome !== 'discarded') throw new Error(`expected the staging AICall's outcome.state to be 'discarded', got ${discardedOutcome}`);

  r.v41Outcomes = { approvedOutcome, discardedOutcome };
}

// v4.1: Definition shows raised follow-ups with a source badge (def-raised) on the seed.
{
  await p.goto('http://localhost:5199/#definition'); await p.waitForSelector('.q, [class*=tree]');
  const raisedCount = await p.locator('[data-testid=def-raised]').count();
  r.v41DefRaised = { raisedCount };
  if (raisedCount < 1) throw new Error(`def-raised: expected >=1 raised follow-up visible on the seed, got ${raisedCount}`);
}

// v4.1: dogfood — every agent in src/agents.ts appears in kernelDigest() (checked via a plain Node
// import, not the browser, since __lfp doesn't expose kernelDigest/agentById).
{
  const { AGENTS } = await import('./src/agents.ts');
  const { kernelDigest } = await import('./src/kernel.ts');
  const digest = kernelDigest();
  const missing = AGENTS.map((a) => a.id).filter((id) => !digest.includes(id));
  r.v41AgentDogfood = { agentIds: AGENTS.map((a) => a.id), missingFromDigest: missing };
  if (missing.length) throw new Error(`kernelDigest() is missing agent ids: ${missing.join(', ')}`);
}

await t('test-commit-gate', async () => {
  // docs drift gate: `npm run docs` must be a no-op once docs/ and agent/prompt.md are committed
  try {
    execSync('npm run docs', { cwd: process.cwd(), stdio: 'pipe' });
    execSync('git diff --quiet -- docs agent/prompt.md', { cwd: process.cwd(), stdio: 'pipe' });
    r.docsDrift = 'clean';
  } catch (e) {
    r.docsDrift = `DIRTY: ${e.message.split('\n')[0]}`;
  }
});

// test-undo-whole: verify undo restored the exact state
await t('test-undo-whole', async () => {
  if (!r.definition?.nodesRestoredByUndo) throw new Error('Undo did not restore nodes');
});

// test-unlock: question unlock logic is tested via answer/stage flow
await t('test-unlock', async () => {
  if (r.definition?.followupId === undefined) throw new Error('Follow-up question not created');
});

// v4.1 (Stage 3 seam): the browser can run any AI function against a real Flue backend instead of
// the deterministic stub (src/ai/backend.ts::BusBackend, AGENT-RUNTIME.md §7). FAKE_AI=1 exercises
// the ai-request/ai-response wire with canned output and no model key — what CI/smoke uses.
{
  const { spawn } = await import('node:child_process');
  const { WebSocket: NodeWebSocket } = await import('ws');
  let child = null;
  let skip = null;
  let agentLog = '';
  try {
    child = spawn('node', ['agent/server.mjs'], { cwd: process.cwd(), env: { ...process.env, FAKE_AI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (b) => (agentLog += b.toString()));
    child.stderr.on('data', (b) => (agentLog += b.toString()));
    let exited = false;
    child.once('exit', () => { exited = true; });
    // the server's startup log line prints before the port bind actually settles, so don't trust it
    // alone — dial the socket directly and only call it ready once a real connection opens.
    const ready = await new Promise((resolve) => {
      const deadline = Date.now() + 4000;
      const tryConnect = () => {
        if (exited || /EADDRINUSE/i.test(agentLog)) { resolve('busy'); return; }
        if (Date.now() > deadline) { resolve('timeout'); return; }
        const ws = new NodeWebSocket(`ws://localhost:5200`);
        ws.once('open', () => { ws.close(); resolve('ready'); });
        ws.once('error', () => { setTimeout(tryConnect, 250); });
      };
      tryConnect();
    });
    // The relay accepting connections is not enough: the fake service joins the bus as a client a
    // moment later, and an ai-request published before that is rebroadcast to nobody. Wait for its log line.
    if (ready === 'ready') {
      const deadline2 = Date.now() + 6000;
      while (!/fake-AI service connected/.test(agentLog) && Date.now() < deadline2) await new Promise((res) => setTimeout(res, 100));
      if (!/fake-AI service connected/.test(agentLog)) skip = 'FAKE_AI service never joined the bus within 6s — skipped the flue-seam check';
      else await new Promise((res) => setTimeout(res, 500));
    }
    if (ready === 'busy') skip = 'port 5200 already in use — skipped the flue-seam check';
    else if (ready === 'timeout') skip = 'FAKE_AI agent server did not accept a connection within 4s — skipped the flue-seam check';
  } catch (e) {
    skip = `failed to spawn agent/server.mjs: ${e.message} — skipped the flue-seam check`;
  }

  if (skip) {
    r.v41FlueSeam = { skipped: skip };
    child?.kill();
  } else {
    try {
      // A hash-only navigation does not reload the page, and the bus picks its transport once at load:
      // reload so `?relay=localhost` (remembered in localStorage) actually switches it to the WebSocket relay.
      await p.goto('http://localhost:5199/#overview?relay=localhost'); await p.reload(); await p.waitForSelector('.card');
      await p.waitForTimeout(1500); // let the page's relay socket open and say hello before publishing
      await p.evaluate(() => { window.__lfp.state.aiRuntime = 'flue'; });
      await p.evaluate(async () => {
        const mod = await import('/src/ai/runtime.ts');
        const idx = await import('/src/ai/index.ts');
        const dir = await import('/src/director.ts');
        mod.runAI(idx.aiFunction('describe-screen'), { text: '' }, dir.currentContext([], 'smoke'));
      });
      await p.waitForTimeout(5000);
      const call = await p.evaluate(() => window.__lfp.state.aiCalls.at(-1));
      const relay = await p.evaluate(async () => (await import('/src/bus.ts')).relayHost());
      r.v41FlueSeamRelay = relay;
      const sayText = await p.evaluate(() => window.__lfp.state.say?.text ?? '');
      r.v41FlueSeam = { runtime: call?.runtime, status: call?.status, sayText };
      if (call?.runtime !== 'flue') throw new Error(`flue seam: expected last AICall.runtime === 'flue', got ${call?.runtime}`);
      if (call?.status !== 'ok') throw new Error(`flue seam: expected last AICall.status === 'ok', got ${call?.status}; call=${JSON.stringify(call).slice(0, 300)}; agent log: ${agentLog.slice(-500)}`);
      if (!sayText.includes('FAKE_AI=1')) throw new Error(`flue seam: expected state.say.text to mention FAKE_AI=1, got: ${sayText}`);

      // fallback path: stop the fake agent, ask again on the same (still `flue`) runtime — with
      // nothing to answer, the BusBackend's 15s timeout should fail the call and fall back to the
      // stub's own cues rather than hang or throw. Kept in the same page load/context as the success
      // check above so the ~16s wait isn't paid twice.
      child.kill(); child = null;
      await p.waitForTimeout(300); // let the browser's relay socket notice the server is gone
      const fallbackCallId = await p.evaluate(async () => {
        const mod = await import('/src/ai/runtime.ts');
        const idx = await import('/src/ai/index.ts');
        const dir = await import('/src/director.ts');
        mod.runAI(idx.aiFunction('describe-screen'), { text: '' }, dir.currentContext([], 'smoke'));
        return window.__lfp.state.aiCalls.at(-1).id;
      });
      await p.waitForTimeout(16000);
      const fallback = await p.evaluate((id) => window.__lfp.state.aiCalls.find((c) => c.id === id), fallbackCallId);
      r.v41FlueSeam.fallbackStatus = fallback?.status;
      if (fallback?.status !== 'failed') throw new Error(`flue seam fallback: expected AICall.status === 'failed' once the agent is gone, got ${fallback?.status}`);
      if (errors.length) throw new Error(`flue seam fallback: expected zero page errors, got: ${errors.join('; ')}`);
    } finally {
      child?.kill();
    }
  }
}

// v4.1: `npm run observe` (wraps this smoke via REALITY_OUT) writes src/reality.json with >=1
// result; `npm run dispatch -- <taskId>` prints a work order containing "Acceptance". Skipped when
// this run IS the one being driven by `observe` (REALITY_OUT set) to avoid recursion.
if (!process.env.REALITY_OUT) {
  try {
    execSync('npm run dispatch -- task-unlock-test', { cwd: process.cwd(), stdio: 'pipe' }).toString();
    const wo = readFileSync(`${process.cwd()}/scratch/workorders/task-unlock-test.md`, 'utf8');
    r.v41Dispatch = { hasAcceptance: wo.includes('Acceptance') };
    if (!r.v41Dispatch.hasAcceptance) throw new Error('dispatch work order for task-unlock-test is missing an "Acceptance" section');
  } catch (e) {
    r.v41Dispatch = { error: String(e.message).slice(0, 300) };
    throw e;
  }
  r.v41Observe = { note: 'npm run observe wraps this smoke.mjs; run it separately (see package.json) to populate src/reality.json — not invoked here to avoid recursive smoke runs.' };
}

// v4.2: consolidation — a node carrying >=2 violations yields ONE tier-3 parent (covers >= 2) with
// hidden children; `consolidate-questions` refines the parent's prompt; answering the parent answers
// every child. Then `find-contradictions` says "No contradictions found." on the seed graph and raises
// a contradiction-sourced follow-up once a duplicate-titled node exists. Then the task lifecycle
// gate: a task marked done with no verdict is a violation; Reference renders the verdicts table.
{
  // The seam block above may have left the runtime on 'flue' with the agent gone: back to stub on a clean page.
  await p.evaluate(() => localStorage.removeItem('bropilot:relay')); // the seam block remembered ?relay=localhost
  await p.goto('http://localhost:5199/#overview'); await p.reload(); await p.waitForSelector('.card');
  await p.evaluate(() => { window.__lfp.state.aiRuntime = 'stub'; });
  const seeded = await p.evaluate(() => {
    const lfp = window.__lfp;
    lfp.state.staged = { effects: [{ id: 'ef-c1', op: 'add-node', node: { id: 'task-smoke-lonely', kind: 'task', title: 'Smoke lonely task', status: 'draft', props: { status: 'done' } }, answerId: 'smoke' }], warnings: [] };
    lfp.applyCue({ t: 'commit' });
    const items = lfp.rankOpen();
    const parent = items.find((i) => i.source === 'violation' && i.subjects.includes('task-smoke-lonely'));
    const children = lfp.state.followups.filter((f) => f.parentId === parent?.id);
    const childShown = parent ? items.some((i) => children.some((c) => c.id === i.id)) : null;
    return { parentId: parent?.id ?? null, covers: parent?.covers ?? 0, children: children.length, childShown, prompt: parent?.prompt ?? '' };
  });
  r.v42Consolidate = seeded;
  if (!seeded.parentId) throw new Error('consolidation: expected a violation-raised item about task-smoke-lonely');
  if (seeded.covers < 2) throw new Error(`consolidation: expected the parent to cover >= 2 violations, got ${seeded.covers}`);
  if (seeded.children !== seeded.covers) throw new Error(`consolidation: expected ${seeded.covers} child follow-ups, got ${seeded.children}`);
  if (seeded.childShown) throw new Error('consolidation: children must be hidden from rankOpen while the parent is open');
  if (!/task-done-without-verdict/.test(JSON.stringify(await p.evaluate(() => window.__lfp.state.followups.map((f) => f.raisedBy?.ref))))) throw new Error('lifecycle gate: expected a task-done-without-verdict violation for the done task with no verdict');

  const refined = await p.evaluate(async (parentId) => {
    const mod = await import('/src/ai/runtime.ts'); const idx = await import('/src/ai/index.ts'); const dir = await import('/src/director.ts');
    const ctx = dir.currentContext([], 'smoke'); ctx.next = window.__lfp.rankOpen().find((i) => i.id === parentId);
    const before = window.__lfp.state.followups.find((f) => f.id === parentId).prompt;
    const cues = mod.runAI(idx.aiFunction('consolidate-questions'), { followupId: parentId }, ctx); cues.forEach((c) => window.__lfp.applyCue(c));
    const after = window.__lfp.state.followups.find((f) => f.id === parentId).prompt;
    return { cueTypes: cues.map((c) => c.t), changed: before !== after, after: after.slice(0, 120) };
  }, seeded.parentId);
  r.v42Consolidate.refined = refined;
  if (!refined.cueTypes.includes('refine') || !refined.changed) throw new Error(`consolidate-questions: expected a refine cue that rewrites the parent prompt, got ${JSON.stringify(refined)}`);

  const answered = await p.evaluate((parentId) => {
    window.__lfp.applyCue({ t: 'answer', questionId: parentId, content: 'smoke: it is meant to stand alone' });
    const kids = window.__lfp.state.followups.filter((f) => f.parentId === parentId);
    return { kidsAnswered: kids.filter((f) => f.answerIds.length > 0).length, kids: kids.length, stillOpen: window.__lfp.rankOpen().some((i) => i.id === parentId) };
  }, seeded.parentId);
  r.v42Consolidate.answered = answered;
  if (answered.kidsAnswered !== answered.kids || answered.stillOpen) throw new Error(`consolidation: answering the parent must answer all ${answered.kids} children and close it, got ${JSON.stringify(answered)}`);

  await p.locator('[data-testid=talk-input]').fill('contradictions'); await p.locator('[data-testid=talk-input]').press('Enter'); await p.waitForTimeout(300);
  const noContra = await p.evaluate(() => window.__lfp.state.transcript.at(-1)?.text ?? '');
  const raisedContra = await p.evaluate(async () => {
    const mod = await import('/src/ai/runtime.ts'); const idx = await import('/src/ai/index.ts'); const dir = await import('/src/director.ts');
    window.__lfp.state.staged = { effects: [{ id: 'ef-c2', op: 'add-node', node: { id: 'task-smoke-lonely-dup', kind: 'task', title: 'Smoke lonely task', status: 'draft' }, answerId: 'smoke' }], warnings: [] };
    window.__lfp.applyCue({ t: 'commit' });
    mod.runAI(idx.aiFunction('find-contradictions'), undefined, dir.currentContext([], 'smoke')).forEach((c) => window.__lfp.applyCue(c));
    return window.__lfp.state.followups.filter((f) => f.raisedBy?.kind === 'contradiction').length;
  });
  r.v42Contradictions = { seedReply: noContra.slice(0, 80), raisedAfterDuplicate: raisedContra };
  if (!/contradiction/i.test(noContra)) throw new Error(`find-contradictions: expected a reply mentioning contradictions, got "${noContra}"`);
  if (raisedContra < 1) throw new Error('find-contradictions: expected a contradiction-sourced follow-up after adding a duplicate-titled task');

  await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('[data-testid=ref-verdicts]', { timeout: 5000 });
  r.v42Verdicts = { table: await p.locator('[data-testid=ref-verdicts]').count() };
  await p.goto('http://localhost:5199/#overview'); await p.waitForSelector('.card');
}

// v4.3: System One (AGENT-RUNTIME.md §9). FAKE_S1=1 starts the System One service alone (no agent
// hello, so the ScriptedDirector keeps routing) and answers every typed question from a canned
// table steered by `#s1no` / `#s1low` / `#s1pick:<key>` tokens in the state. Checks: the ready flag
// lands; a Jev-decided describe-screen says exactly what the stub says; a near-miss title raises a
// contradiction the exact-match stub misses and a low-confidence answer falls back (call stays ok);
// only fall-through Talk text is routed, exact commands never ask; review-change decides on system1.
{
  const { WebSocket: NodeWebSocket } = await import('ws');
  let child = null; let skip = null; let agentLog = '';
  try {
    child = spawn('node', ['agent/server.mjs'], { cwd: process.cwd(), env: { ...process.env, FAKE_S1: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (b) => (agentLog += b.toString())); child.stderr.on('data', (b) => (agentLog += b.toString()));
    let exited = false; child.once('exit', () => { exited = true; });
    const ready = await new Promise((resolve) => {
      const deadline = Date.now() + 4000;
      const tryConnect = () => {
        if (exited || /EADDRINUSE/i.test(agentLog)) { resolve('busy'); return; }
        if (Date.now() > deadline) { resolve('timeout'); return; }
        const ws = new NodeWebSocket('ws://localhost:5200');
        ws.once('open', () => { ws.close(); resolve('ready'); }); ws.once('error', () => setTimeout(tryConnect, 250));
      };
      tryConnect();
    });
    if (ready === 'ready') {
      const deadline2 = Date.now() + 6000;
      while (!/System One service connected/.test(agentLog) && Date.now() < deadline2) await new Promise((res) => setTimeout(res, 100));
      if (!/System One service connected/.test(agentLog)) skip = 'FAKE_S1 service never joined the bus within 6s — skipped the System One check';
    } else skip = ready === 'busy' ? 'port 5200 already in use — skipped the System One check' : 'FAKE_S1 agent server did not accept a connection within 4s — skipped the System One check';
  } catch (e) { skip = `failed to spawn agent/server.mjs: ${e.message} — skipped the System One check`; }
  if (!/system1: fake/.test(agentLog) && !skip) skip = `agent server did not print "system1: fake": ${agentLog.slice(0, 200)}`;

  if (skip) { r.v43System1 = { skipped: skip }; child?.kill(); }
  else {
    try {
      await p.goto('http://localhost:5199/#overview?relay=localhost'); await p.reload(); await p.waitForSelector('.card');
      await p.waitForTimeout(1500);
      const flags = await p.evaluate(() => ({ ready: window.__lfp.state.system1Ready, mode: window.__lfp.state.system1Mode, on: window.__lfp.state.system1, runtime: window.__lfp.state.aiRuntime }));
      r.v43System1 = { flags };
      if (!flags.ready || flags.mode !== 'fake') throw new Error(`system1: expected system1Ready=true mode=fake after the server's hello, got ${JSON.stringify(flags)}; agent log: ${agentLog.slice(-300)}`);
      if (!flags.on) throw new Error('system1: expected state.system1 to default to on');

      // helper: run a function, wait for the decision to settle, return the call + the last utterance
      const run = async (fn, input, wait = 1500) => p.evaluate(async ({ fn, input, wait }) => {
        const mod = await import('/src/ai/runtime.ts'); const idx = await import('/src/ai/index.ts'); const dir = await import('/src/director.ts');
        const cues = mod.runAI(idx.aiFunction(fn), input, dir.currentContext([], 'smoke')); cues.forEach((c) => window.__lfp.applyCue(c));
        const id = window.__lfp.state.aiCalls.at(-1).id;
        await new Promise((res) => setTimeout(res, wait));
        const call = window.__lfp.state.aiCalls.find((c) => c.id === id);
        return { call, say: window.__lfp.state.say?.text ?? '' };
      }, { fn, input, wait });

      // C2 — the same node the substring path resolves, byte-identical utterance, decided by Jev.
      await p.evaluate(() => { window.__lfp.state.system1 = false; });
      const stubHit = await run('describe-screen', { text: 'Guided articulation path' }, 100);
      await p.evaluate(() => { window.__lfp.state.system1 = true; });
      const s1Hit = await run('describe-screen', { text: 'Guided articulation path' });
      r.v43System1.describe = { stubRuntime: stubHit.call.runtime, s1Runtime: s1Hit.call.runtime, confidence: s1Hit.call.confidence, model: s1Hit.call.model, same: stubHit.call.output === s1Hit.call.output };
      if (stubHit.call.runtime !== 'stub' || stubHit.call.fallback) throw new Error(`system1 off: expected a plain stub call, got ${JSON.stringify(stubHit.call).slice(0, 200)}`);
      if (s1Hit.call.runtime !== 'system1' || s1Hit.call.status !== 'ok') throw new Error(`describe-screen via Jev: expected runtime system1 + ok, got ${JSON.stringify(s1Hit.call).slice(0, 300)}; log: ${agentLog.slice(-300)}`);
      if (!/jev/.test(s1Hit.call.model ?? '') || !(s1Hit.call.confidence >= 0.65)) throw new Error(`describe-screen via Jev: expected a jev model and confidence >= .65, got ${s1Hit.call.model} ${s1Hit.call.confidence}`);
      if (stubHit.call.output !== s1Hit.call.output) throw new Error(`describe-screen via Jev: expected the same output as the stub for the same node, got\n  stub: ${stubHit.call.output}\n  s1:   ${s1Hit.call.output}`);

      // C5 — a near-miss title (shares words, not equal) raises a contradiction the exact-match stub cannot.
      const contra = await p.evaluate(async () => {
        window.__lfp.state.staged = { effects: [{ id: 'ef-s1a', op: 'add-node', node: { id: 'task-smoke-lonely-near', kind: 'task', title: 'Smoke lonely task again', status: 'draft' }, answerId: 'smoke' }], warnings: [] };
        window.__lfp.applyCue({ t: 'commit' });
        return window.__lfp.state.followups.filter((f) => f.raisedBy?.kind === 'contradiction').length;
      });
      const s1Contra = await run('find-contradictions', undefined, 2000);
      const contraAfter = await p.evaluate(() => window.__lfp.state.followups.filter((f) => f.raisedBy?.kind === 'contradiction').map((f) => f.prompt));
      r.v43System1.contradictions = { before: contra, after: contraAfter.length, runtime: s1Contra.call.runtime, confidence: s1Contra.call.confidence };
      if (s1Contra.call.runtime !== 'system1') throw new Error(`find-contradictions via Jev: expected runtime system1, got ${JSON.stringify(s1Contra.call).slice(0, 300)}`);
      if (!contraAfter.some((t) => /again/.test(t))) throw new Error(`find-contradictions via Jev: expected a raised question about the near-miss title "Smoke lonely task again", got ${JSON.stringify(contraAfter)}`);
      // …and a low-confidence batch falls back to the stub: call ok, runtime stub, fallback tagged, no near-miss raise.
      await p.evaluate(() => {
        window.__lfp.state.staged = { effects: [{ id: 'ef-s1b', op: 'add-node', node: { id: 'task-smoke-lonely-low', kind: 'task', title: 'Smoke lonely task #s1low', status: 'draft' }, answerId: 'smoke' }], warnings: [] };
        window.__lfp.applyCue({ t: 'commit' });
      });
      const lowContra = await run('find-contradictions', undefined, 2000);
      r.v43System1.contradictions.low = { runtime: lowContra.call.runtime, fallback: lowContra.call.fallback, status: lowContra.call.status, confidence: lowContra.call.confidence };
      if (lowContra.call.status !== 'ok' || lowContra.call.runtime !== 'stub' || lowContra.call.fallback !== 'low-confidence') throw new Error(`low-confidence fallback: expected status ok, runtime stub, fallback low-confidence, got ${JSON.stringify(lowContra.call).slice(0, 300)}`);

      // C1 — routing: exact commands never ask; fall-through text is classified; low confidence → describe-screen.
      const talk = async (text, wait = 1500) => {
        const before = await p.evaluate(() => window.__lfp.state.aiCalls.length);
        await p.locator('[data-testid=talk-input]').fill(text); await p.locator('[data-testid=talk-input]').press('Enter'); await p.waitForTimeout(wait);
        return p.evaluate((before) => window.__lfp.state.aiCalls.slice(before).map((c) => ({ fn: c.fn, runtime: c.runtime, status: c.status, fallback: c.fallback ?? null, output: (c.output ?? '').slice(0, 60) })), before);
      };
      const exact = await talk('gaps', 400);
      const routed = await talk('what is still missing here #s1pick:find-gaps');
      const lowRouted = await talk('tell me about the whole thing #s1low');
      r.v43System1.router = { exact, routed, lowRouted };
      if (exact.some((c) => c.fn === 'route-utterance')) throw new Error(`router: the exact command "gaps" must not ask Jev, got ${JSON.stringify(exact)}`);
      const routeCall = routed.find((c) => c.fn === 'route-utterance');
      if (!routeCall || routeCall.runtime !== 'system1' || !routed.some((c) => c.fn === 'find-gaps')) throw new Error(`router: expected a system1 route-utterance call followed by find-gaps, got ${JSON.stringify(routed)}`);
      const lowCall = lowRouted.find((c) => c.fn === 'route-utterance');
      if (!lowCall || lowCall.fallback !== 'low-confidence' || !lowRouted.some((c) => c.fn === 'describe-screen')) throw new Error(`router: expected a low-confidence fallback to describe-screen, got ${JSON.stringify(lowRouted)}`);

      // C6 — the review verdict is a 3-way choice; the fake picks the first key (serves-intent).
      const review = await run('review-change', { taskId: 'task-unlock-test' });
      r.v43System1.review = { runtime: review.call.runtime, output: review.call.output.slice(0, 80), confidence: review.call.confidence };
      if (review.call.runtime !== 'system1' || !/serves/.test(review.call.output)) throw new Error(`review-change via Jev: expected runtime system1 and a serves-intent verdict, got ${JSON.stringify(review.call).slice(0, 300)}`);

      // Reference shows the confidence column and the system1 toggle.
      await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('[data-testid=ref-system1]', { timeout: 5000 });
      r.v43System1.reference = { toggle: await p.locator('[data-testid=ref-system1]').count(), decisions: await p.locator('[data-testid=ref-decisions]').count() };
      if (!r.v43System1.reference.decisions) throw new Error('reference: expected the ref-decisions table');
      if (errors.length) throw new Error(`system1: expected zero page errors, got: ${errors.join('; ')}`);
    } finally {
      child?.kill();
      await p.evaluate(() => localStorage.removeItem('bropilot:relay'));
    }
  }
}

// v4.3 server-side gates and the observe-time cache, all under FAKE_S1=1 and on throwaway copies of
// graph.json / reality.json under scratch/ (gitignored) so nothing observed by hand leaks into src/.
if (!process.env.REALITY_OUT) {
  const { mkdirSync, existsSync, rmSync } = await import('node:fs');
  const dir = `${process.cwd()}/scratch/s1`; mkdirSync(dir, { recursive: true });
  const seedGraph = JSON.parse(readFileSync(`${process.cwd()}/src/graph.json`, 'utf8'));
  const env = { ...process.env, FAKE_S1: '1' };
  const sh = (cmd, extra = {}) => execSync(cmd, { cwd: process.cwd(), stdio: 'pipe', env: { ...env, ...extra } }).toString();

  // ask-or-act: a confident "yes" proceeds exactly as today (work order printed, nothing blocked)…
  writeFileSync(`${dir}/graph-yes.json`, JSON.stringify(seedGraph));
  writeFileSync(`${dir}/reality-yes.json`, JSON.stringify({ results: {}, metrics: {} }));
  const yes = sh(`node scripts/dispatch.mjs task-unlock-test --dry-run --graph ${dir}/graph-yes.json --reality ${dir}/reality-yes.json`);
  // …and a confident "no" (the task's test lines carry #s1no) raises a question and blocks the task instead.
  const noGraph = JSON.parse(JSON.stringify(seedGraph));
  const task = noGraph.nodes.find((n) => n.id === 'task-unlock-test'); task.title += ' #s1no';
  writeFileSync(`${dir}/graph-no.json`, JSON.stringify(noGraph));
  writeFileSync(`${dir}/reality-no.json`, JSON.stringify({ results: {}, metrics: {} }));
  const no = sh(`node scripts/dispatch.mjs task-unlock-test --graph ${dir}/graph-no.json --reality ${dir}/reality-no.json`);
  const blockedGraph = JSON.parse(readFileSync(`${dir}/graph-no.json`, 'utf8'));
  const blockedReality = JSON.parse(readFileSync(`${dir}/reality-no.json`, 'utf8'));
  const status = blockedGraph.nodes.find((n) => n.id === 'task-unlock-test').props?.status;
  r.v43Dispatch = { yesHasAcceptance: yes.includes('Acceptance'), noHasAcceptance: no.includes('Acceptance'), status, raised: blockedReality.raised?.['task-unlock-test']?.prompt?.slice(0, 80) ?? null };
  if (!r.v43Dispatch.yesHasAcceptance) throw new Error(`ask-or-act yes: expected the work order as today, got: ${yes.slice(-300)}`);
  if (r.v43Dispatch.noHasAcceptance || status !== 'blocked' || !r.v43Dispatch.raised) throw new Error(`ask-or-act no: expected no work order, task blocked and a raised question, got ${JSON.stringify(r.v43Dispatch)}; out: ${no.slice(-300)}`);

  // observe-time cache: the System One pass fills reality.matches; a cached match >= threshold makes
  // checkInvariants(graph, { matches }) drop a rule-condition-has-test violation the bare call still raises.
  const relReality = 'scratch/s1/reality-observe.json';
  writeFileSync(`${process.cwd()}/${relReality}`, JSON.stringify({ results: {}, metrics: {} }));
  const obs = sh('node scripts/observe.mjs', { S1_ONLY: '1', LFP_REALITY_PATH: relReality });
  const observed = JSON.parse(readFileSync(`${process.cwd()}/${relReality}`, 'utf8'));
  const check = JSON.parse(sh(`node --input-type=module -e "
    import { checkInvariants, conditionPairs } from './src/checks.ts';
    const graph = JSON.parse((await import('node:fs')).readFileSync('src/graph.json', 'utf8'));
    const reality = JSON.parse((await import('node:fs')).readFileSync('${relReality}', 'utf8'));
    const pairs = conditionPairs(graph);
    const before = checkInvariants(graph).filter((v) => v.invariant === 'rule-condition-has-test').length;
    const after = checkInvariants(graph, { matches: reality.matches }).filter((v) => v.invariant === 'rule-condition-has-test').length;
    console.log(JSON.stringify({ pairs: pairs.length, matches: Object.keys(reality.matches ?? {}).length, decisions: Object.keys(reality.decisions ?? {}), before, after }));
  "`));
  r.v43Observe = check;
  if (!check.pairs || check.matches < 1) throw new Error(`observe S1 pass: expected cached matches for ${check.pairs} pairs, got ${JSON.stringify(check)}; out: ${obs.slice(-300)}`);
  if (!(check.after < check.before)) throw new Error(`observe S1 pass: expected cached matches to drop rule-condition-has-test violations (${check.before} → ${check.after})`);
  if (!check.decisions.includes('consolidate-pair') || !check.decisions.includes('raise-parent')) throw new Error(`observe S1 pass: expected consolidate-pair and raise-parent cross-checks, got ${check.decisions}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
