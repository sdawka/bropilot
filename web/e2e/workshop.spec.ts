import { test as base, expect, type Page } from '@playwright/test';
import { freshPage, waitForGraphSettle, BASE_URL } from './helpers';
import type { Graph } from '../src/lib/schema';

// Fail any test that lets an uncaught error reach the page — the workshop's
// exercises are the least-tested surface in the app (hand-rolled drag, a
// hand-rolled JSON parser, a detached-scope autosave), so a silent runtime
// exception must not slide by as a green test.
const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', (err) => errors.push(err));
      await use();
      expect(errors, errors.map((e) => e.message).join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});

// Navigate straight to a given hash with a specific graph already in
// localStorage (bypassing the SAMPLE_GRAPH seed) — used where a test needs a
// small, fully-controlled graph so lint/suggestion counts are exact, rather
// than depending on the shape of the (evolving) rich sample data.
// Sticky drag must pointerdown on the sticky CONTAINER, never the title/note
// <input> (they @pointerdown.stop by design — see EventStorm.vue). The
// container has 8px (p-2) padding before the title input begins, so a
// previous offset of exactly 8px landed right on that boundary — safe today,
// but one CSS tweak away from silently missing the container. 3px sits
// comfortably inside the padding, nowhere near the input.
const STICKY_CONTAINER_EDGE_Y = 3;

async function seededPage(page: Page, hash: string, graph: Graph): Promise<void> {
  await page.addInitScript((g) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('bropilot:graph:v1', JSON.stringify(g));
    } catch {
      /* ignore */
    }
  }, graph);
  await page.goto(`${BASE_URL}/${hash}`);
  await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
}

test.describe('workshop hub', () => {
  test('renders four exercise cards', async ({ page }) => {
    await freshPage(page, '#/workshop');
    const hub = page.locator('.workshop-view');
    for (const id of ['storm', 'interview', 'extract', 'gap']) {
      await expect(hub.locator(`.workshop-card[data-exercise="${id}"]`)).toBeVisible();
    }
  });
});

test.describe('event storming', () => {
  test('add stickies → pair → convert → review → apply → node in graph', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="storm"]').click();
    const storm = page.locator('.event-storm');

    await storm.getByTestId('storm-add-actor').click();
    await storm.getByTestId('storm-add-command').click();
    const actor = storm.locator('[data-col-id="actor"] [data-sticky-id]').first();
    const command = storm.locator('[data-col-id="command"] [data-sticky-id]').first();
    await actor.locator('input').first().fill('Field agent');
    await command.locator('input').first().fill('Submit report');

    // drag the actor onto the command → legal pair (persona uses behaviour)
    const from = await actor.boundingBox();
    const to = await command.boundingBox();
    if (!from || !to) throw new Error('sticky boxes missing');
    await page.mouse.move(from.x + from.width / 2, from.y + STICKY_CONTAINER_EDGE_Y);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + STICKY_CONTAINER_EDGE_Y, { steps: 8 });
    await page.mouse.up();
    await expect(actor.getByText('link', { exact: false })).toBeVisible();

    await storm.getByTestId('storm-convert').click();
    const review = page.locator('.merge-review');
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: /Apply \d+ change/ }).click();

    await page.goto(`${BASE_URL}/#/graph`);
    await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await waitForGraphSettle(page);

    // Search rather than clickSvgNode: against the 129-node rich sample, this
    // new node's Fit()-derived position reproducibly lands under a fixed
    // corner overlay (the documented "Fit() vs. HTML overlay" gotcha in
    // CLAUDE.md) — confirmed with a 3x repeat, same coordinates every time.
    // The search palette proves the node exists and is selectable without
    // depending on where the force layout happened to settle it.
    await page.keyboard.press('/');
    const searchInput = page.getByPlaceholder('Search nodes by title, description or kind…');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Field agent');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/graph\/persona-field-agent$/);
  });

  // Carried from the W6 review: the ontology reverses this specific pairing
  // (the aggregate *has* the command as an aspect, not the other way round)
  // even though the command is the sticky you physically drag. Regressed
  // once — pin the exact rendered ordering, not just "an edge exists".
  test('command dragged onto aggregate produces a "has" edge with the aggregate as source', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="storm"]').click();
    const storm = page.locator('.event-storm');

    await storm.getByTestId('storm-add-aggregate').click();
    await storm.getByTestId('storm-add-command').click();
    const aggregate = storm.locator('[data-col-id="aggregate"] [data-sticky-id]').first();
    const command = storm.locator('[data-col-id="command"] [data-sticky-id]').first();
    await aggregate.locator('input').first().fill('Order');
    await command.locator('input').first().fill('Place order');

    // drag the command (src) onto the aggregate (dst) — the link count lands
    // on the dragged sticky, i.e. the command.
    const from = await command.boundingBox();
    const to = await aggregate.boundingBox();
    if (!from || !to) throw new Error('sticky boxes missing');
    await page.mouse.move(from.x + from.width / 2, from.y + STICKY_CONTAINER_EDGE_Y);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + STICKY_CONTAINER_EDGE_Y, { steps: 8 });
    await page.mouse.up();
    await expect(command.getByText('link', { exact: false })).toBeVisible();

    await storm.getByTestId('storm-convert').click();
    const review = page.locator('.merge-review');
    await expect(review).toBeVisible();
    await expect(review.getByText('Order · has → Place order')).toBeVisible();
  });
});

test.describe('document extraction', () => {
  test('paste a canned reply → review shows counts → apply', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    const doc = page.locator('.doc-extract');
    const reply = JSON.stringify({
      nodes: [{ kind: 'goal', title: 'Cut onboarding time', description: 'Reps productive in a day' }],
      edges: [],
    });
    await doc.getByTestId('doc-reply').fill('```json\n' + reply + '\n```');
    await doc.getByTestId('doc-review').click();
    const review = page.locator('.merge-review');
    await expect(review).toBeVisible();
    await expect(review.getByText('Cut onboarding time')).toBeVisible();
    await review.getByRole('button', { name: /Apply 1 change/ }).click();
    await expect(review).toHaveCount(0);
  });

  test('a malformed reply renders an inline error, never a dead end', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    const doc = page.locator('.doc-extract');
    await doc.getByTestId('doc-reply').fill('this is not json');
    await doc.getByTestId('doc-review').click();
    await expect(doc.getByTestId('doc-error')).toBeVisible();
  });
});

test.describe('guided interview', () => {
  // Carried from the W6 review as a hard requirement: a followup's <select>
  // must offer BOTH existing graph nodes and earlier in-session answers, and
  // picking the earlier answer must land the edge between the two new nodes
  // (not a dangling ref) once applied.
  test('a followup can target an earlier in-session answer, and the edge survives apply', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="interview"]').click();
    const view = page.locator('.interview-deck');
    await view.locator('[data-deck="foundations"]').click();

    // q0 name, q1 purpose — skip both with no answer.
    await view.getByTestId('deck-next').click();
    await view.getByTestId('deck-next').click();

    // q2 capability (has a "serves → persona" followup) — skip it for now,
    // so the persona we need can be answered first.
    await view.getByTestId('deck-next').click();

    // q3 persona — answer it, without navigating away yet.
    await view.getByTestId('deck-answer').fill('Field ops lead');
    await view.getByTestId('deck-add').click();
    await expect(view.locator('li', { hasText: 'Field ops lead' })).toBeVisible();

    // back to q2 (capability) to use that answer as a followup target.
    await view.getByRole('button', { name: '← Back' }).click();

    const followup = view.getByTestId('deck-followup-serves');
    // both an existing graph persona and the earlier in-session answer must
    // be offered as candidates.
    await expect(followup.locator('option', { hasText: 'System architect' })).toHaveCount(1);
    await expect(followup.locator('option', { hasText: 'Field ops lead' })).toHaveCount(1);

    await view.getByTestId('deck-answer').fill('Submit expense report');
    await followup.selectOption('Field ops lead');
    await view.getByTestId('deck-add').click();

    // drive to Finish → review.
    const review = page.locator('.merge-review');
    for (let i = 0; i < 12; i++) {
      if (await review.isVisible().catch(() => false)) break;
      await view.getByTestId('deck-next').click();
    }
    await expect(review).toBeVisible();
    // "Submit expense report"/"Field ops lead" each appear twice (once as a
    // staged-node checkbox row, once inside the edge-summary row below) —
    // .first() just needs one of those to be on the page.
    await expect(review.getByText('Submit expense report').first()).toBeVisible();
    await expect(review.getByText('Field ops lead').first()).toBeVisible();
    // the edge connects the two just-answered nodes, not existing/dangling ones.
    await expect(review.getByText('Submit expense report · serves → Field ops lead')).toBeVisible();

    await review.getByRole('button', { name: /Apply \d+ change/ }).click();
    await expect(review).toHaveCount(0);

    // The modal closing only proves the UI moved on, not that the edge
    // landed correctly — read the graph straight out of localStorage and
    // assert the exact srcId/dstId/type, which is the actual point of the
    // "earlier answer as a followup target" requirement. Node ids follow
    // {kind}-{kebab-title} (see CLAUDE.md).
    const graph = await page.evaluate(() => {
      const raw = window.localStorage.getItem('bropilot:graph:v1');
      return raw ? (JSON.parse(raw) as { nodes: { id: string }[]; edges: { srcId: string; dstId: string; type: string }[] }) : null;
    });
    expect(graph).not.toBeNull();
    const capabilityId = 'capability-submit-expense-report';
    const personaId = 'persona-field-ops-lead';
    expect(graph!.nodes.some((n) => n.id === capabilityId)).toBe(true);
    expect(graph!.nodes.some((n) => n.id === personaId)).toBe(true);
    expect(
      graph!.edges.some((e) => e.srcId === capabilityId && e.dstId === personaId && e.type === 'serves'),
    ).toBe(true);
  });
});

test.describe('gap-fix sprint', () => {
  test('fixing a finding shrinks the queue (smoke test against the real sample)', async ({ page }) => {
    await freshPage(page, '#/workshop');
    await page.locator('.workshop-card[data-exercise="gap"]').click();
    const gap = page.locator('.gap-sprint');
    await expect(gap.getByTestId('gap-card')).toBeVisible();

    const readCount = async () => {
      const txt = await gap.getByTestId('gap-progress').textContent();
      return Number((txt ?? '0 of 0').split(' of ')[1]);
    };
    const before = await readCount();

    const addBtn = gap.getByTestId('gap-add-edge').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    } else {
      await gap.getByTestId('gap-skip').click();
    }
    await expect.poll(readCount).toBeLessThan(before);
  });

  // A small, fully-controlled graph: three real nodes with no lint findings
  // (each has a throwaway edge just to avoid tripping the "orphan" finding),
  // arranged so the very first queue card is a single-candidate "purpose
  // serves persona" suggestion. Verified against lint.ts/suggest.ts directly
  // (see task notes) to produce exactly one queue card fewer after the fix —
  // the mirrored "persona ← serves ← purpose" suggestion on the other node
  // still has a second candidate left over, so it survives and only the
  // exhausted suggestion disappears.
  const GAP_GRAPH: Graph = {
    nodes: [
      { id: 'purpose-justify-existing', kind: 'purpose', title: 'Justify existing', description: '' },
      { id: 'purpose-another-reason', kind: 'purpose', title: 'Another reason', description: '' },
      { id: 'persona-solo-user', kind: 'persona', title: 'Solo user', description: '' },
      { id: 'persona-filler', kind: 'persona', title: 'Filler persona', description: '' },
      { id: 'hypothesis-filler', kind: 'hypothesis', title: 'Filler hypothesis', description: '' },
      { id: 'flow-filler', kind: 'flow', title: 'Filler flow', description: '' },
    ],
    edges: [
      { id: 'e1', srcId: 'purpose-justify-existing', dstId: 'persona-filler', type: 'serves' },
      { id: 'e2', srcId: 'purpose-another-reason', dstId: 'hypothesis-filler', type: 'depends_on' },
      { id: 'e3', srcId: 'persona-solo-user', dstId: 'flow-filler', type: 'triggers' },
    ],
  };

  test('a candidate-button fix shrinks the queue by exactly one', async ({ page }) => {
    await seededPage(page, '#/workshop', GAP_GRAPH);
    await page.locator('.workshop-card[data-exercise="gap"]').click();
    const gap = page.locator('.gap-sprint');
    await expect(gap.getByTestId('gap-card')).toBeVisible();

    const readTotal = async () => {
      const txt = await gap.getByTestId('gap-progress').textContent();
      return Number((txt ?? '0 of 0').split(' of ')[1]);
    };
    const before = await readTotal();

    const addBtns = gap.getByTestId('gap-add-edge');
    await expect(addBtns).toHaveCount(1); // the exhausted-after-one-fix suggestion
    await addBtns.first().click();

    await expect.poll(readTotal).toBe(before - 1);
  });

  test('skipping never re-shows an item already skipped', async ({ page }) => {
    await seededPage(page, '#/workshop', GAP_GRAPH);
    await page.locator('.workshop-card[data-exercise="gap"]').click();
    const gap = page.locator('.gap-sprint');
    await expect(gap.getByTestId('gap-card')).toBeVisible();

    const readTotal = async () => {
      const txt = await gap.getByTestId('gap-progress').textContent();
      return Number((txt ?? '0 of 0').split(' of ')[1]);
    };

    const seen = new Set<string>();
    let before = await readTotal();
    for (let i = 0; i < 5; i++) {
      const cardText = await gap.getByTestId('gap-card').innerText();
      expect(seen.has(cardText), `card reappeared after being skipped:\n${cardText}`).toBe(false);
      seen.add(cardText);
      await gap.getByTestId('gap-skip').click();
      const after = await readTotal();
      expect(after).toBe(before - 1);
      before = after;
    }
  });
});

test.describe('draft persistence', () => {
  test('a pasted document survives reload (own storage key)', async ({ page }) => {
    // NOT freshPage on reload — freshPage clears storage on every navigation.
    await page.goto(`${BASE_URL}/#/workshop`);
    await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    await page.locator('.doc-extract').getByTestId('doc-input').fill('MARKER-DOC-TEXT');

    await page.reload();
    await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    await expect(page.locator('.doc-extract').getByTestId('doc-input')).toHaveValue('MARKER-DOC-TEXT');
  });

  // Pins a real regression: the autosave watch was once tied to WorkshopView's
  // own component scope, so it died the first time the view unmounted
  // (navigating elsewhere) — any edit made *after* that first unmount looked
  // fine in the live DOM but silently stopped persisting. A reload-only test
  // that never navigates away can't catch that; this one deliberately leaves
  // and returns before making the edit that must survive.
  test('an edit made after leaving and returning to the workshop still survives reload', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/workshop`);
    await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    await page.locator('.doc-extract').getByTestId('doc-input').fill('ROUNDTRIP-BEFORE');

    // workshop → hub → another view (unmounts WorkshopView) → back to workshop
    await page.locator('.workshop-view').getByRole('button', { name: '← Back to workshop' }).click();
    await page.locator('nav').getByRole('button', { name: 'Overview' }).click();
    await page.locator('nav').getByRole('button', { name: 'Workshop' }).click();
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    await expect(page.locator('.doc-extract').getByTestId('doc-input')).toHaveValue('ROUNDTRIP-BEFORE');

    // the edit that must survive happens only after that remount.
    await page.locator('.doc-extract').getByTestId('doc-input').fill('ROUNDTRIP-AFTER');

    await page.reload();
    await page.locator('nav').getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.locator('.workshop-card[data-exercise="extract"]').click();
    await expect(page.locator('.doc-extract').getByTestId('doc-input')).toHaveValue('ROUNDTRIP-AFTER');
  });
});
