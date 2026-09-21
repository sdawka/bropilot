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

r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
