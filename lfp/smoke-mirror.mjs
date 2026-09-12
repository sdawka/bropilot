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
await mirror.goto('http://localhost:5199/#mirror'); await mirror.waitForTimeout(600);
r.mirror = { hasTopBar: await mirror.locator('.top').count(), text: (await mirror.locator('body').innerText()).slice(0, 200) };
// tour: Walk the Map, started from the mirror
await mirror.getByText('Walk the Map').first().click(); await mirror.waitForTimeout(500);
r.afterStart = { mainHash: await main.evaluate(() => location.hash), mainHasMap: await main.getByText('Planned changes').count() > 0, mirrorSays: (await mirror.locator('body').innerText()).includes('This is the Map') };
await mirror.getByRole('button', { name: /next/i }).first().click(); await mirror.waitForTimeout(600);
r.afterNext = { mainHash: await main.evaluate(() => location.hash), lit: await main.locator('.card.lit, .card.selected').count(), mirrorPointing: (await mirror.locator('body').innerText()).match(/pointing at:[^\n]*/)?.[0] ?? null };
await mirror.getByRole('button', { name: /next/i }).first().click(); await mirror.waitForTimeout(600);
r.afterNext2 = { lit: await main.locator('.card.lit').count(), lines: await main.locator('.links line').count() };
await main.screenshot({ path: `${out}/mirror-main.png` }); await mirror.screenshot({ path: `${out}/mirror-phone.png` });
await mirror.getByRole('button', { name: /stop/i }).first().click(); await mirror.waitForTimeout(300);
// add a glossary term via ask → answer → answer
await mirror.getByText('Add a glossary term').first().click(); await mirror.waitForTimeout(400);
r.ask1 = (await mirror.locator('body').innerText()).includes('What term');
await mirror.locator('input[type=text], input:not([type]), textarea').last().fill('Magic mirror'); await mirror.getByRole('button', { name: /send/i }).click(); await mirror.waitForTimeout(400);
r.ask2 = (await mirror.locator('body').innerText()).includes('define');
await mirror.locator('input[type=text], input:not([type]), textarea').last().fill('The one-thing-at-a-time companion screen.'); await mirror.getByRole('button', { name: /send/i }).click(); await mirror.waitForTimeout(500);
r.termAdded = await main.evaluate(() => JSON.parse(localStorage.getItem('bropilot:lfp:v1')).graph.nodes.some((n) => n.kind === 'term' && n.title === 'Magic mirror'));
// unrealised → staged → approve from the mirror
await mirror.getByText("What's not realised").first().click(); await mirror.waitForTimeout(600);
r.unrealised = { mainHash: await main.evaluate(() => location.hash), staged: (await mirror.locator('body').innerText()).match(/\d+ change/)?.[0] ?? null, mainStaged: await main.locator('.top', { hasText: 'changeset staged' }).count() };
await mirror.getByRole('button', { name: /approve/i }).first().click(); await mirror.waitForTimeout(500);
r.approved = { epics: await main.evaluate(() => JSON.parse(localStorage.getItem('bropilot:lfp:v1')).graph.nodes.filter((n) => n.kind === 'epic').length), commits: await main.evaluate(() => JSON.parse(localStorage.getItem('bropilot:lfp:v1')).commits.length), mirrorSays: (await mirror.locator('body').innerText()).includes('Committed') };
// free talk about a node
await mirror.locator('input[type=text], input:not([type]), textarea').last().fill('Effect preview and commit gate'); await mirror.getByRole('button', { name: /send/i }).click(); await mirror.waitForTimeout(600);
r.freeTalk = { mainHash: await main.evaluate(() => location.hash), says: (await mirror.locator('body').innerText()).includes('Capability: Effect preview'), lit: await main.locator('.card.lit').count() };
// one utterance at a time: exactly one utterance card on the mirror
r.utteranceCards = await mirror.locator('[class*=utter], [class*=say], .card').count();
await mirror.screenshot({ path: `${out}/mirror-phone-2.png` });
// sidebar on main shows the same state
r.sidebar = { present: await main.locator('[class*=agent]').count() > 0, hasTranscript: (await main.locator('body').innerText()).includes('Effect preview and commit gate') };
r.errors = errors; console.log(JSON.stringify(r, null, 1)); await b.close();
