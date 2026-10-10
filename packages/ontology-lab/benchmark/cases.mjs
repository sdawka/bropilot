/**
 * Hand-authored evaluation conversations for the ontology lab.  These are
 * measurement fixtures, not a source of truth for a user's World.  A pattern
 * is a deliberately narrow, lightweight signal over serialized output; a
 * match is useful evidence, never semantic proof.
 */

const checkpoint = (id, messageIds, expectedFactIds, forbiddenFactIds = [], questionTopics = []) => ({
  id,
  messageIds,
  expectedFactIds,
  forbiddenFactIds,
  questionTopics,
});

export const BENCHMARK_CASES = [
  {
    id: "todo-private-list",
    title: "Private todo list with a deliberate omission",
    category: "todo app",
    messages: [
      { id: "todo-1", role: "user", text: "I want a tiny private todo app for myself. I can add a task, mark it done, and see only today's unfinished tasks. It should work offline in the browser. Do not add sharing, reminders, accounts, or a calendar." },
    ],
    expectedFacts: [
      { id: "private-beneficiary", description: "The app is for one private user.", patterns: ["private|personal", "user|self"] },
      { id: "task-lifecycle", description: "Tasks can be added and marked done.", patterns: ["task", "complete|done|mark"] },
      { id: "today-filter", description: "The requested view is today's unfinished tasks.", patterns: ["today", "unfinished|incomplete|open"] },
      { id: "offline-browser", description: "Offline browser use is a stated constraint.", patterns: ["offline", "browser"] },
    ],
    forbiddenFacts: [
      { id: "no-sharing", description: "Do not invent collaboration or sharing.", patterns: ["sharing", "collaborat"] },
      { id: "no-reminders", description: "Do not invent reminders.", patterns: ["reminder"] },
      { id: "no-accounts", description: "Do not invent accounts or sign-in.", patterns: ["account", "sign.?in"] },
    ],
    questionRubric: { usefulTopics: ["how a task becomes due today", "what counts as unfinished"], alreadyAnsweredTopics: ["sharing", "reminders", "accounts", "calendar"], notes: "A good question narrows the meaning of today's list rather than reopening excluded features." },
    checkpoints: [
      checkpoint("core-list-flow", ["todo-1"], ["private-beneficiary", "task-lifecycle", "today-filter", "offline-browser"]),
      checkpoint("scope-restraint", ["todo-1"], ["private-beneficiary", "offline-browser"], ["no-sharing", "no-reminders", "no-accounts"]),
    ],
    notes: "Tests explicit exclusions without demanding a particular object layout.",
  },
  {
    id: "expense-split-correction",
    title: "Expense tracker corrected from shared to personal",
    category: "expense tracker",
    messages: [
      { id: "expense-1", role: "user", text: "Make an expense tracker for my household. I want to enter a purchase, category, amount, and date, then see monthly totals by category. I thought maybe it should split bills with roommates." },
      { id: "expense-q1", role: "assistant", text: "Should the first version calculate what each roommate owes, or only help you understand household spending?" },
      { id: "expense-2", role: "user", text: "Only help me understand spending. Do not track roommates, reimbursements, bank accounts, or import transactions. I review the totals on the first Sunday of each month." },
    ],
    expectedFacts: [
      { id: "purchase-fields", description: "A purchase has category, amount, and date.", patterns: ["category", "amount", "date"] },
      { id: "monthly-category-totals", description: "Monthly category totals are the intended result.", patterns: ["month", "categor", "total|summary"] },
      { id: "monthly-review", description: "Review happens on the first Sunday of each month.", patterns: ["first\\s+Sunday|monthly review"] },
      { id: "personal-spending", description: "The correction keeps this as personal spending understanding.", patterns: ["spending|expense", "understand|overview|track"] },
    ],
    forbiddenFacts: [
      { id: "no-roommates", description: "The corrected scope excludes roommate tracking and splitting.", patterns: ["roommate", "split bill", "reimbursement"] },
      { id: "no-bank-import", description: "The corrected scope excludes banking connections and imports.", patterns: ["bank account", "import transaction"] },
    ],
    questionRubric: { usefulTopics: ["whether categories are fixed or user-created", "what currency to show"], alreadyAnsweredTopics: ["roommates", "reimbursements", "bank accounts", "transaction import", "review timing"], notes: "The second user turn supersedes the speculative roommate idea." },
    checkpoints: [
      checkpoint("before-correction", ["expense-1"], ["purchase-fields", "monthly-category-totals"]),
      checkpoint("after-correction", ["expense-1", "expense-q1", "expense-2"], ["purchase-fields", "monthly-category-totals", "monthly-review", "personal-spending"], ["no-roommates", "no-bank-import"]),
    ],
    notes: "Tests a clear scope correction after an assistant question.",
  },
  {
    id: "studio-booking",
    title: "Small studio booking with approval boundary",
    category: "booking system",
    messages: [
      { id: "booking-1", role: "user", text: "I run a pottery studio with one wheel room. Members should request a two-hour slot from the available times. I approve each request before it becomes a booking. Never double-book the room. Cancellations are allowed until 24 hours before the slot." },
    ],
    expectedFacts: [
      { id: "single-room", description: "There is one wheel room.", patterns: ["wheel room|pottery room", "one|single"] },
      { id: "two-hour-request", description: "Members request two-hour slots.", patterns: ["two.?hour|2.?hour", "request|slot"] },
      { id: "approval-before-booking", description: "A request needs approval before becoming a booking.", patterns: ["approv", "booking|request"] },
      { id: "no-overlap", description: "Overlapping room bookings are forbidden.", patterns: ["double.book", "overlap"] },
      { id: "cancellation-window", description: "Cancellation cutoff is 24 hours before the slot.", patterns: ["24.?hour", "cancel"] },
    ],
    forbiddenFacts: [
      { id: "no-payment", description: "Do not invent payment or deposits.", patterns: ["payment", "deposit"] },
      { id: "no-multi-room", description: "Do not invent several rooms or resources.", patterns: ["multiple rooms", "other room"] },
    ],
    questionRubric: { usefulTopics: ["which available times members may request", "how approval is communicated"], alreadyAnsweredTopics: ["slot length", "approval requirement", "double booking", "cancellation cutoff"], notes: "Strong extraction should produce an authorization rule and an acceptance criterion with an assay candidate." },
    checkpoints: [
      checkpoint("booking-flow", ["booking-1"], ["single-room", "two-hour-request"]),
      checkpoint("policy-boundary", ["booking-1"], ["approval-before-booking", "no-overlap", "cancellation-window"], ["no-payment", "no-multi-room"]),
    ],
    notes: "Tests operational policy, timing, and a deterministic conflict rule.",
  },
  {
    id: "habit-streak-followup",
    title: "Habit tracker with a contextual short reply",
    category: "habit tracker",
    messages: [
      { id: "habit-1", role: "user", text: "I want a simple habit tracker for drinking water and taking a walk. I want to tap once when I do each habit and see a weekly streak. It is just for me and should not send notifications." },
      { id: "habit-q1", role: "assistant", text: "What should happen to a streak when you intentionally take a rest day?" },
      { id: "habit-2", role: "user", text: "A planned rest day should not break it, but skipping without planning should." },
    ],
    expectedFacts: [
      { id: "two-habits", description: "Water and walking are the named habits.", patterns: ["water", "walk"] },
      { id: "single-tap-log", description: "Completion is recorded with one tap.", patterns: ["tap|complete|log"] },
      { id: "weekly-streak", description: "The result includes a weekly streak.", patterns: ["weekly", "streak"] },
      { id: "rest-day-rule", description: "Planned rest days preserve a streak; unplanned skips do not.", patterns: ["planned.*rest|rest.*planned", "streak|break"] },
    ],
    forbiddenFacts: [
      { id: "no-notifications", description: "Do not invent notifications.", patterns: ["notification", "push"] },
      { id: "no-social", description: "Do not invent social comparison or sharing.", patterns: ["friend", "leaderboard", "share"] },
    ],
    questionRubric: { usefulTopics: ["how a rest day is planned", "whether a habit can be edited"], alreadyAnsweredTopics: ["notification preference", "rest-day effect", "who uses it"], notes: "The model must interpret the final short reply through the assistant question, while keeping assistant text out of evidence." },
    checkpoints: [
      checkpoint("initial", ["habit-1"], ["two-habits", "single-tap-log", "weekly-streak"], ["no-notifications", "no-social"]),
      checkpoint("after-rest-day-answer", ["habit-1", "habit-q1", "habit-2"], ["two-habits", "single-tap-log", "weekly-streak", "rest-day-rule"], ["no-notifications", "no-social"]),
    ],
    notes: "Tests contextual follow-up handling and evidence discipline.",
  },
  {
    id: "shared-grocery-conflict",
    title: "Shared grocery list with a conflicting ownership statement",
    category: "shared grocery list",
    messages: [
      { id: "grocery-1", role: "user", text: "Make a shared grocery list for me and Sam. Either of us can add items and check them off. I want a separate list for each store, and I do not want recipe planning." },
      { id: "grocery-2", role: "user", text: "Actually, Sam should only be able to check off items, not add them. I add items and choose the store list." },
    ],
    expectedFacts: [
      { id: "two-people", description: "The shared list involves the user and Sam.", patterns: ["Sam", "shared|user"] },
      { id: "store-lists", description: "Lists are separated by store.", patterns: ["store"] },
      { id: "sam-checkoff-only", description: "The correction limits Sam to checking items off.", patterns: ["Sam", "check|complete"] },
      { id: "user-adds-items", description: "The user adds items and chooses a store list.", patterns: ["add", "store"] },
    ],
    forbiddenFacts: [
      { id: "no-recipe-planning", description: "Do not invent recipe planning.", patterns: ["recipe"] },
      { id: "no-sam-add", description: "Do not preserve the superseded permission for Sam to add items.", patterns: ["Sam.{0,80}add"] },
    ],
    questionRubric: { usefulTopics: ["how completed items are retained or cleared", "whether stores can be added"], alreadyAnsweredTopics: ["Sam adding items", "recipe planning", "who chooses store lists"], notes: "The later user statement overrides an earlier conflicting permission." },
    checkpoints: [
      checkpoint("before-correction", ["grocery-1"], ["two-people", "store-lists"], ["no-recipe-planning"]),
      checkpoint("after-correction", ["grocery-1", "grocery-2"], ["two-people", "store-lists", "sam-checkoff-only", "user-adds-items"], ["no-recipe-planning", "no-sam-add"]),
    ],
    notes: "Tests source contradiction and explicit per-person authorization.",
  },
  {
    id: "private-journal",
    title: "Private journal with searchable tags",
    category: "journal",
    messages: [
      { id: "journal-1", role: "user", text: "I need a private journal where I can write an entry, tag it, and later search my own entries by tag or words. Keep everything on this device. It should never analyze my mood or suggest therapy." },
    ],
    expectedFacts: [
      { id: "journal-entry", description: "The user writes journal entries.", patterns: ["journal", "entry"] },
      { id: "tag-and-search", description: "Entries support tags and word search.", patterns: ["tag", "search"] },
      { id: "device-local", description: "Data remains on the device.", patterns: ["device|local"] },
    ],
    forbiddenFacts: [
      { id: "no-mood-analysis", description: "Do not invent mood analysis.", patterns: ["mood"] },
      { id: "no-therapy", description: "Do not invent therapy suggestions.", patterns: ["therapy", "therapist"] },
      { id: "no-cloud-sync", description: "Do not infer cloud sync from a private journal.", patterns: ["cloud", "sync"] },
    ],
    questionRubric: { usefulTopics: ["whether entries can be edited or deleted", "how the device is protected"], alreadyAnsweredTopics: ["mood analysis", "therapy suggestions", "remote storage"], notes: "Useful questions respect the stated privacy boundary." },
    checkpoints: [
      checkpoint("entries-and-search", ["journal-1"], ["journal-entry", "tag-and-search"]),
      checkpoint("privacy-boundary", ["journal-1"], ["device-local"], ["no-mood-analysis", "no-therapy", "no-cloud-sync"]),
    ],
    notes: "Tests explicit safety-sensitive exclusions without entering a medical workflow.",
  },
  {
    id: "goal-calendar-assistant",
    title: "Goal-to-calendar assistant with approval and assay",
    category: "personal assistant",
    messages: [
      { id: "calendar-1", role: "user", text: "I want an assistant that turns my goal of finishing a portfolio into small weekly tasks. It can suggest calendar blocks but must ask me before placing anything on my Google Calendar. Every Friday I want to review what was finished and move unfinished work to next week. A useful first version must return a health check at /health." },
    ],
    expectedFacts: [
      { id: "portfolio-goal", description: "The goal is to finish a portfolio.", patterns: ["portfolio"] },
      { id: "weekly-small-tasks", description: "The assistant breaks the goal into small weekly tasks.", patterns: ["weekly", "task"] },
      { id: "suggest-not-place", description: "Calendar blocks are suggestions until approval.", patterns: ["suggest", "approv|ask", "calendar"] },
      { id: "friday-review", description: "Friday review includes moving unfinished work.", patterns: ["Friday", "unfinished|next week|review"] },
      { id: "health-assay", description: "A /health endpoint is a concrete acceptance criterion and test target.", patterns: ["/health|health check"] },
    ],
    forbiddenFacts: [
      { id: "no-auto-calendar-write", description: "Do not authorize automatic calendar placement.", patterns: ["automatically place", "auto.?add"] },
      { id: "no-google-read-scope", description: "Do not infer reading calendar data; only write approval is described.", patterns: ["read.*Google Calendar", "Google Calendar.*read"] },
    ],
    questionRubric: { usefulTopics: ["how many hours may be scheduled each week", "what calendar conflicts should block a suggestion"], alreadyAnsweredTopics: ["Friday review", "approval before calendar placement", "health endpoint"], notes: "Expected to exercise goal, calendar, authorization, criterion, and assay concepts." },
    checkpoints: [checkpoint("initial", ["calendar-1"], ["portfolio-goal", "weekly-small-tasks", "suggest-not-place", "friday-review", "health-assay"], ["no-auto-calendar-write", "no-google-read-scope"])],
    notes: "Directly measures the intended personal-assistant workflow and a deterministic deployment-style check.",
  },
  {
    id: "underspecified-library",
    title: "Underspecified local library app",
    category: "underspecified app",
    messages: [
      { id: "library-1", role: "user", text: "I want something to keep track of books I own. Make it pleasant and simple." },
    ],
    expectedFacts: [
      { id: "owned-books", description: "The only grounded purpose is keeping track of owned books.", patterns: ["book", "own|catalog|track"] },
    ],
    forbiddenFacts: [
      { id: "no-invented-scanner", description: "Do not invent barcode scanning.", patterns: ["barcode", "scan"] },
      { id: "no-invented-social", description: "Do not invent sharing, lending, or recommendations.", patterns: ["share", "lend", "recommend"] },
      { id: "no-invented-integration", description: "Do not invent external catalog integrations.", patterns: ["Goodreads", "Open Library", "API"] },
    ],
    questionRubric: { usefulTopics: ["what information to record for each book", "whether lending or reading status matters"], alreadyAnsweredTopics: [], notes: "The central score is restraint: ask one consequential question instead of filling in a familiar product template." },
    checkpoints: [checkpoint("initial", ["library-1"], ["owned-books"], ["no-invented-scanner", "no-invented-social", "no-invented-integration"], ["what information", "lending", "reading status"])],
    notes: "Tests whether the pipeline can stay useful under intentional ambiguity.",
  },
];

export const BENCHMARK_CHECKPOINT_COUNT = BENCHMARK_CASES
  .reduce((count, benchmark) => count + benchmark.checkpoints.length, 0);
