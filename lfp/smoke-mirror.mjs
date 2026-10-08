// Two-page smoke: main screen + mirror in one browser context (shared BroadcastChannel).
// Usage: BIN=<chromium> OUT=<dir> node smoke-mirror.mjs   (dev server on :5199)
import { chromium } from 'playwright';
const out = process.env.OUT ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.BIN });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const main = await ctx.newPage(); const mirror = await ctx.newPage(); await mirror.setViewportSize({ width: 420, height: 800 });
const errors = []; for (const p of [main, mirror]) { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); }
const r = {};
process.on('uncaughtException', (e) => { r.errors = errors; r.failedAt = String(e.message).split('\n')[0]; console.log(JSON.stringify(r, null, 1)); process.exit(1); });
await main.goto('http://localhost:5199/#overview'); await main.evaluate(() => localStorage.clear()); await main.reload(); await main.waitForSelector('.card');
// v4.1: force a suspect edge on the main screen (same staged-update-then-commit trick as smoke.mjs's
// edit-staleness check) so the mirror's "talk-revalidate absent" assertion below is meaningful — not
// just vacuously true because there happens to be nothing to revalidate yet.
await main.evaluate(() => {
  const g = window.__lfp.state.graph;
  const rule = g.nodes.find((n) => n.id === 'rule-unlock');
  window.__lfp.state.staged = { effects: [{ id: 'ef-x', op: 'update-node', nodeId: rule.id, patch: { title: rule.title + ' (mirror smoke)' }, answerId: 'smoke' }], warnings: [] };
  window.__lfp.applyCue({ t: 'commit' });
});
await main.waitForTimeout(150);
await mirror.goto('http://localhost:5199/#mirror'); await mirror.waitForTimeout(600);
r.mirror = { hasTopBar: await mirror.locator('.top').count(), talkPanel: await mirror.locator('[data-testid=talk-panel]').count(), text: (await mirror.locator('body').innerText()).slice(0, 200) };
// v4.1: the mirror shows the same Now-strip "next" item as the main screen (bare, same testid) but
// never the local-only Answer-it/Skip/Revalidate actions — those are main-screen-only (S128-131,
// extended for suspect/revalidate in v4.1).
r.v41Mirror = { talkNextVisible: await mirror.locator('[data-testid=talk-next]').count() > 0, talkRevalidateAbsent: (await mirror.locator('[data-testid=talk-revalidate]').count()) === 0 };
if (!r.v41Mirror.talkNextVisible) throw new Error('expected [data-testid=talk-next] to be visible on the mirror on load (seed graph always has an open item)');
if (!r.v41Mirror.talkRevalidateAbsent) throw new Error('expected [data-testid=talk-revalidate] to be absent on the bare mirror even when suspect edges exist');
// tour: Walk the Map, started from the mirror via a topic chip
await mirror.getByText('Walk the Map').first().click(); await mirror.waitForTimeout(500);
r.afterStart = { mainHash: await main.evaluate(() => location.hash), mainHasMap: await main.getByText('Planned changes').count() > 0, mirrorSays: (await mirror.locator('body').innerText()).includes('This is the Map') };
await mirror.getByRole('button', { name: /next/i }).first().click(); await mirror.waitForTimeout(600);
r.afterNext = { mainHash: await main.evaluate(() => location.hash), lit: await main.locator('.card.lit, .card.selected').count(), mirrorPointing: (await mirror.locator('body').innerText()).match(/pointing at:[^\n]*/)?.[0] ?? null };
await mirror.getByRole('button', { name: /next/i }).first().click(); await mirror.waitForTimeout(600);
r.afterNext2 = { lit: await main.locator('.card.lit').count(), lines: await main.locator('.links line').count() };
await main.screenshot({ path: `${out}/mirror-main.png` }); await mirror.screenshot({ path: `${out}/mirror-phone.png` });
await mirror.getByRole('button', { name: /stop/i }).first().click(); await mirror.waitForTimeout(300);
// add a glossary term via the mirror composer: ask → answer → answer
await mirror.getByText('Add a glossary term').first().click(); await mirror.waitForTimeout(400);
r.ask1 = (await mirror.locator('body').innerText()).includes('What term');
await mirror.locator('[data-testid=talk-input]').fill('Magic mirror'); await mirror.locator('[data-testid=talk-send]').click(); await mirror.waitForTimeout(400);
r.ask2 = (await mirror.locator('body').innerText()).includes('define');
await mirror.locator('[data-testid=talk-input]').fill('The one-thing-at-a-time companion screen.'); await mirror.locator('[data-testid=talk-send]').click(); await mirror.waitForTimeout(500);
r.termAdded = await main.evaluate(() => JSON.parse(localStorage.getItem('bropilot:lfp:v1')).graph.nodes.some((n) => n.kind === 'term' && n.title === 'Magic mirror'));
// stage something on the main screen directly (via the dev __lfp hook), then approve from the mirror — proves the mirror's Approve commits on the main screen.
// NOTE: with the seed graph, ctx.next is always null (every kernel question's produced kind already has
// committed nodes), so there is no "next root question" — answer a fresh follow-up instead.
const nodesBefore = await main.evaluate(() => window.__lfp.state.graph.nodes.length);
const qid = await main.evaluate(() => {
  window.__lfp.applyCue({ t: 'followup', parentId: 'q-audience', prompt: 'smoke-mirror: which of them pays?', kind: 'sub' });
  return window.__lfp.state.followups.at(-1).id;
});
await main.evaluate((id) => window.__lfp.applyCue({ t: 'answer', questionId: id, content: 'Small teams with a budget' }), qid);
await mirror.waitForTimeout(400);
r.staged = { qid, mirrorShowsStaged: (await mirror.locator('[data-testid=talk-now]').innerText()).match(/\d+ change/)?.[0] ?? null, mainStaged: await main.locator('.top', { hasText: 'changeset staged' }).count() };
await mirror.locator('[data-testid=talk-approve]').first().click(); await mirror.waitForTimeout(500);
const nodesAfter = await main.evaluate(() => window.__lfp.state.graph.nodes.length);
r.approved = { nodesAdded: nodesAfter - nodesBefore, commits: await main.evaluate(() => JSON.parse(localStorage.getItem('bropilot:lfp:v1')).commits.length) };
// free talk about a node
await mirror.locator('[data-testid=talk-input]').fill('Effect preview and commit gate'); await mirror.locator('[data-testid=talk-send]').click(); await mirror.waitForTimeout(600);
r.freeTalk = { mainHash: await main.evaluate(() => location.hash), says: (await mirror.locator('body').innerText()).includes('Capability: Effect preview'), lit: await main.locator('.card.lit').count() };
// one utterance at a time: exactly one utterance card on the mirror
r.utteranceCards = await mirror.locator('[data-testid=talk-utterance]').count();
// the mirror is `bare`: it shows the utterance but never the feedback buttons (main-screen-only, S128-S131)
r.mirrorFeedback = { hidden: await mirror.locator('[data-testid=talk-feedback]').count(), mainHasFeedback: await main.locator('[data-testid=talk-feedback]').count() > 0 };
await mirror.screenshot({ path: `${out}/mirror-phone-2.png` });
// Talk panel on main shows the same transcript
r.mainPanel = { present: await main.locator('[data-testid=talk-panel]').count() > 0, hasTranscript: (await main.locator('body').innerText()).includes('Effect preview and commit gate') };
r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
