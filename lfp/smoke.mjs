// Smoke test for the lfp. Usage: BIN=<chromium binary> OUT=<dir> node smoke.mjs   (dev server on :5199)
import { chromium } from 'playwright';
const out = process.env.OUT ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.BIN }); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const r = {};
await p.goto('http://localhost:5199/#overview'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.card');
r.overview = { cards: await p.locator('.card').count(), cols: await p.locator('.col').count(), dogfood: await p.locator('.dogfood').innerText(), basicsHidden: (await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count()) === 0 };
await p.locator('button', { hasText: /basics/i }).first().click(); r.overview.basicsShownAfterToggle = await p.locator('.card', { hasText: 'Bropilot turns a hazy idea' }).count();
await p.locator('.card > .title', { hasText: 'Guided articulation path' }).first().click(); await p.waitForSelector('.inspector'); await p.waitForTimeout(200);
r.overview.linesDrawn = await p.locator('.links line').count(); r.overview.litCards = await p.locator('.card.lit').count(); r.overview.chips = await p.locator('.chip').count();
r.provFull = { quotes: await p.locator('.inspector .quote').count(), ctx: await p.locator('.inspector .ctx').count() };
await p.locator('.inspector .more').first().click(); r.provFull.fullBrief = await p.locator('.inspector .full-brief').count();
await p.locator('.prov.said').first().hover(); await p.waitForTimeout(150); r.hoverPop = await p.locator('.pop').count();
await p.screenshot({ path: `${out}/overview.png` });

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

// domain
await p.goto('http://localhost:5199/#domain'); await p.waitForTimeout(300);
r.domain = { l0: (await p.locator('body').innerText()).includes('Planned changes') };
await p.screenshot({ path: `${out}/domain-l0.png` });
await p.getByText('1. Context').first().click(); await p.waitForTimeout(150);
r.domain.l1Text = (await p.locator('body').innerText()).includes('GitHub');
await p.screenshot({ path: `${out}/domain-l1.png` });
await p.getByText('2. Modules').first().click(); await p.waitForTimeout(150); await p.screenshot({ path: `${out}/domain-l2.png` });
r.domain.modules = await p.getByText('Representation', { exact: true }).count();
r.domain.screenItemsAreModules = await p.evaluate(() => window.__lfp.state.screen.items.some((i) => i.id.startsWith('module-')));
await p.getByText('Inside a module').first().click(); await p.waitForTimeout(150);
r.domain.things = await p.locator('.item-card').count();
await p.locator('.item-card .title', { hasText: /^🔷 Node$/ }).first().click(); await p.waitForTimeout(150);
r.domain.dimmedRulesAfterSelectingNode = await p.locator('.item-card.dim').count();
r.domain.codeLinks = await p.locator('a[href*="github.com"]').count();
await p.getByText('Orchestration', { exact: true }).first().click(); await p.waitForTimeout(150);
r.domain.testChips = await p.locator('.test-chip').count(); r.domain.testsPassed = await p.locator('.test-chip.pass').count();
await p.screenshot({ path: `${out}/domain-l3.png` });

// flows — a `point` cue lights up the flow card
await p.goto('http://localhost:5199/#flows'); await p.waitForSelector('.flow'); await p.waitForTimeout(150);
const flowId = await p.evaluate(() => document.querySelector('.flow')?.getAttribute('data-node-id'));
await p.evaluate((id) => window.__lfp.applyCue({ t: 'point', nodes: [id], focus: id }), flowId);
await p.waitForTimeout(150);
r.flows = { flowId, lit: await p.locator(`.flow[data-node-id="${flowId}"].lit`).count() };
await p.screenshot({ path: `${out}/flows.png` });

// glossary read
await p.locator('.glossary-btn').click(); await p.waitForTimeout(200);
r.glossary = { terms: await p.getByText('Representation layer').count() };
await p.screenshot({ path: `${out}/glossary.png` });

// reference anchors
await p.goto('http://localhost:5199/#kernel'); await p.waitForSelector('table'); r.anchors = (await p.locator('body').innerText()).includes('every statement anchors');

r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
