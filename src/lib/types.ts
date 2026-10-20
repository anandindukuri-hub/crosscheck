import { z } from "zod";
import { customListProblem, normalizeCustomName } from "./allergens";
import { ALLERGEN_KEYS, bookingNameProblem, CUISINES } from "./constants";

// zod free lists live in constants.ts so client pages can use them without shipping zod
export { ALLERGEN_KEYS, CUISINES };

export type AllergenKey = (typeof ALLERGEN_KEYS)[number];

// beef is a diet, not an allergy, but it flows through the same checks.
// shellfish = crustacean + mollusk merged when a diner avoids both. custom_<slug> = an allergen the guest typed in
export type TargetKey = AllergenKey | "shellfish" | "beef" | `custom_${string}`;

export const Severity = z.enum(["anaphylaxis", "severe", "intolerance"]);
export type Severity = z.infer<typeof Severity>;

export const BeefStrictness = z.enum(["ingredient", "contact", "vegetarian"]);

export const Restriction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allergy"), allergen: z.enum(ALLERGEN_KEYS), severity: Severity }),
  z.object({ kind: z.literal("diet"), diet: z.literal("no_beef"), strictness: BeefStrictness }),
  // an allergen the guest typed in. NewRunInput checks the name with allergens.ts and stores it normalized
  z.object({ kind: z.literal("custom"), name: z.string().max(60), severity: Severity }),
]);
export type Restriction = z.infer<typeof Restriction>;

export const Diner = z.object({
  id: z.string().min(1).max(20),
  label: z.string().min(1).max(40), // what Fo and the kitchen hear, e.g. "Anand" or "Guest 2"
  restrictions: z.array(Restriction).min(1),
});
export type Diner = z.infer<typeof Diner>;

export type Cuisine = (typeof CUISINES)[number];

export const Restaurant = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  cuisine: z.enum(CUISINES),
  cuisineRaw: z.string().optional(),
  address: z.string().optional(),
  hours: z.string().optional(),
  website: z.string().optional(),
  source: z.enum(["osm", "test", "custom"]),
});
export type Restaurant = z.infer<typeof Restaurant>;

export type Outcome = "pass" | "escalate" | "fail";

export type ChoiceOption = { key: string; desc: string; outcome: Outcome };

export type Station = "hidden" | "fryer" | "surfaces";

export type CheckInstance = {
  key: string; // e.g. "fryer:crustacean"
  code: string; // C1, C2... used in Fo's report
  templateId: Station;
  target: TargetKey;
  label: string; // short, for cards: "Fryer oil: shellfish"
  spoken: string; // what Fo asks
  instructions: string; // what Jev is asked (points at answers.<code>)
  options: ChoiceOption[]; // unsafe first (Jev leans to the first option)
  dinerIds: string[];
  strictSpeaker: boolean; // needs first person chef or manager
  ttlDays: number;
};

export type Speaker = "chef_or_manager" | "other_staff" | "relayed" | "automated" | "unknown";

export type ParsedAnswer = { code: string; words: string | null; speaker: Speaker; speakerRaw: string; line?: string }; // line: the whole answer as Fo wrote it, for the hedge word scan

export type ParsedReport = {
  format: "structured" | "freeform";
  outcomeRaw: string;
  respondentsRaw: string;
  answers: Record<string, ParsedAnswer>;
  readback: string;
  dishes: string;
  noteOnBooking: string | null; // reconfirm only: did the allergy note reach the kitchen
  noteOnBookingLine?: string | null; // the whole line with the speaker note, for the hedge word scan
  cookTonight: string | null; // reconfirm only
  email: string | null;
  optOut?: string; // first call, MORE CALLS OK: a "no" means the kitchen asked not to be called again
  personCall?: string; // first call, PERSON MAY CALL: after a no to an AI call, may a person call and when
  misc: string;
  duration: string;
};

// one typed decision about one question, from Jev or from Claude
export type ChoiceDecision = {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type Decisions = {
  decider: "jev" | "claude_only" | "rule"; // rule: a call that clearly ended with no answers, decided at once
  model: string;
  checks: Record<string, ChoiceDecision>; // by check key
  hedge: Record<string, number>; // P(hedged) by check key
  outcome: ChoiceDecision; // answered, declined, busy, voicemail, automated_only
  respondent: ChoiceDecision;
  accommodate: ChoiceDecision;
  readback: ChoiceDecision;
  misconception: number; // P(yes)
};

export type ClaudeJudgement = {
  checks: Record<string, { option: string; quote: string | null; speaker: Speaker; reason: string }>;
  dishes: { diner: string; dishes: string[] }[];
  misconception: string | null;
  summary: string;
};

export type CheckVerdict = {
  key: string;
  code: string;
  label: string;
  outcome: Outcome;
  reasons: string[];
  quote: string | null;
  speaker: Speaker;
  jev?: { choice: string; confidence: number };
  claude?: { choice: string };
  dinerIds: string[];
};

export type LaneResultState =
  | "matched"
  | "not_matched"
  | "needs_chef"
  | "needs_review"
  | "no_answer"
  | "declined";

export type LaneResult = {
  state: LaneResultState;
  headline: string;
  reasons: string[];
  checks: CheckVerdict[];
  dishes: { diner: string; dishes: string[] }[];
  decider: Decisions["decider"];
  decidedAt: string;
  misconception?: number; // highest P(myth) heard on any call to this kitchen
};

export type LaneStatus =
  | "queued"
  | "calling"
  | "needs_you"
  | "waiting_report"
  | "deciding"
  | "done"
  | "fo_still_working"
  | "error";

export type LaneEvent = { at: string; kind: string; text: string };

// what the verdict would be if Claude reads every answer the way Jev did. Shown while Claude confirms, never bookable
export type LanePreview = { state: LaneResultState; headline: string; at: string };

export type Reconfirm = {
  status: "requested" | "reconfirmed" | "not_reconfirmed" | "needs_review" | "failed";
  at: string;
  reasons: string[];
  result?: LaneResult; // the fresh decision on today's answers; lane.result is never overwritten
  reviewedAt?: string; // needs_review only: when Anand ticked every quote from today
};

export type Lane = {
  id: string;
  runId: string;
  restaurant: Restaurant;
  phase: "call" | "callback" | "booking" | "reconfirm";
  agreed: boolean; // live mode: Anand pre asked this restaurant and it said yes to an AI call
  replayCase: string | null;
  kitchenEmail: string | null;
  pending: { message: string; conversationId: string | null; newConversation: boolean; uncertain?: boolean } | null; // queued, not sent yet. uncertain: ask_fo threw, so Fo may already have it
  status: LaneStatus;
  progress: string;
  conversationId: string | null;
  foQuestion: string | null; // Fo is waiting on the user
  reports: { kind: "call" | "callback" | "reconfirm"; text: string; at: string }[];
  result: LaneResult | null;
  callbacks: number;
  booking: { status: "requested" | "needs_you" | "done" | "failed"; text: string; at: string; note?: string } | null; // note: what Anand said or must do
  waitingOn?: string | null; // the Fo reply a wait started from, so a Resume that reads it again never waits twice
  fromMemory?: { runId: string; decidedAt: string } | null; // matched from kitchen memory, no call made
  reconfirm?: Reconfirm | null;
  reconfirmHistory?: Reconfirm[]; // earlier reconfirms in this lane, never dropped
  skipped?: { reason: string; at: string } | null; // stop at first match: never called because another kitchen matched
  calledAnyway?: string | null; // when Call anyway was tapped, so a later match never skips this lane again
  goAhead?: string | null; // when Fo first took your answer or began on its own. A call may be live, so a match never skips this lane
  reportAsked?: string | null; // when CrossCheck asked Fo once for the full report after a summary with none
  stopPending?: { conversationId: string; text: string; at: string } | null; // a stop saved before ask_fo, sent again once after a restart
  foCallback?: { text: string; at: string; cancelled?: string | null } | null; // Fo said it would call them again on its own
  stoppedAt?: string | null; // Stop all calls reached this lane, so nothing queued for it goes out
  handoff?: { text: string; at: string } | null; // they said no to an AI call but a person may call: their words and time
  preview?: LanePreview | null; // Jev's answer while Claude still weighs in. Cleared when the real result lands
  events: LaneEvent[];
  startedAt: string | null;
  updatedAt: string;
  error: string | null;
};

export type RunMode = "test" | "live" | "replay";

export type Run = {
  id: string;
  createdAt: string;
  mode: RunMode;
  when: string;
  partySize: number;
  diners: Diner[];
  laneIds: string[];
  approvedAt: string | null;
  countedAt: string | null; // when this run was added to the run count
  bookingName?: string; // who Fo calls for and books under. Older runs fall back to the first guest
  stopAtFirstMatch?: boolean; // stop calling new kitchens once one matches. Older runs call everyone
  stoppedAt?: string | null; // when Stop all calls was tapped
  purpose?: "calibration";
  calibratedAt?: string | null; // calibration only: when this run's report was judged
  checks: Record<string, CheckInstance[]>; // by lane id (cuisine specific)
};

export const DUPLICATE_DINER = (label: string) => `Two guests are called "${label}". Give each guest a different name so Fo and the kitchen can tell them apart.`;

export const VEGETARIAN_OFF = "Vegetarian is not supported yet. CrossCheck only asks about beef, not other meat. Pick \"No beef ingredients\" or \"No beef, no contact\" instead.";

// vegetarian stays in the type so old runs still load, but no new run can ask for it until a real meat target exists
export const NewRunInput = z
  .object({
    mode: z.enum(["test", "live", "replay"]),
    when: z.string().min(1).max(80),
    partySize: z.number().int().min(1).max(20),
    diners: z.array(Diner).min(1).max(8),
    restaurantIds: z.array(z.string()).min(1).max(5),
    // the "Name for the booking" field. Left out, the first guest's name is used
    bookingName: z.string().optional(),
    stopAtFirstMatch: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.diners.forEach((d, i) => {
      if (d.restrictions.some((r) => r.kind === "diet" && r.strictness === "vegetarian")) ctx.addIssue({ code: "custom", message: VEGETARIAN_OFF, path: ["diners", i] });
      // dishes, quotes and the note are matched by label, so two guests can never share one
      const key = d.label.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: DUPLICATE_DINER(d.label.trim()), path: ["diners", i, "label"] });
      seen.add(key);
      const custom = customListProblem(d.restrictions);
      if (custom) ctx.addIssue({ code: "custom", message: custom, path: ["diners", i, "restrictions"] });
    });
    const name = bookingNameProblem(v.bookingName ?? v.diners[0]?.label ?? "");
    if (name) ctx.addIssue({ code: "custom", message: name, path: ["bookingName"] });
  })
  .transform((v) => ({
    ...v,
    bookingName: (v.bookingName ?? v.diners[0]?.label ?? "").trim(),
    diners: v.diners.map((d) => ({ ...d, restrictions: d.restrictions.map((r) => (r.kind === "custom" ? { ...r, name: normalizeCustomName(r.name) } : r)) })),
  }));
export type NewRunInput = z.infer<typeof NewRunInput>;
