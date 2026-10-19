import { z } from "zod";
import { env } from "./env";
import { trace } from "./trace";
import type { CheckInstance, ChoiceDecision, Decisions, Diner, ParsedReport, Restaurant } from "./types";
import { describeDiner } from "./checks";

// Jev (TypeSafe AI) decision model. Docs: docs.typesafe.ai, spec api.typesafe.ai/openapi.json.
const BASE = "https://api.typesafe.ai";

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } };

const ChoiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
const NoulAnswer = z.object({ type: z.literal("noul"), noul: z.number() });
const JevResponse = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.union([ChoiceAnswer, NoulAnswer])),
});

// Global questions. The unsafe or empty option always comes first (jev-1.13 leans to the first option).
export const GLOBAL_QUESTIONS: Record<string, Question> = {
  outcome: {
    type: "choice",
    instructions: "Based on `call_outcome`, `respondents` and `answers`, what happened on this phone call?",
    criteria: {
      declined: "Staff declined to talk to an AI assistant or declined note taking",
      voicemail_or_no_answer: "Voicemail, no answer or the call did not connect",
      automated_only: "Only an automated system, phone menu or AI receptionist answered",
      busy_or_call_back: "Staff were busy and asked for a call back later",
      answered: "A staff member answered the allergy questions",
    },
  },
  respondent: {
    type: "choice",
    instructions: "Based on `respondents` and the speakers in `answers`, who answered the allergy questions?",
    criteria: {
      automated_system: "An automated system or AI receptionist",
      host_or_server: "A host, server or other front of house staff, or someone passing on what the kitchen said",
      other_staff: "A cook or other kitchen staff who is not the chef or manager",
      chef_or_manager: "The chef, sous chef, kitchen manager, general manager or owner, speaking first hand",
    },
  },
  accommodate: {
    type: "choice",
    instructions: "Based on everything in the state, can the kitchen accommodate these guests' allergies and diets?",
    criteria: {
      cannot: "The kitchen said it cannot accommodate or advised the guests not to come",
      unclear: "Not stated or unclear",
      can: "The kitchen said it can accommodate and described how",
    },
  },
  readback: {
    type: "choice",
    instructions: "Based on `readback`, did the staff confirm the read back of their answers?",
    criteria: {
      corrected_or_contradicted: "Staff corrected or contradicted part of the read back",
      not_done: "No read back happened",
      unclear: "A read back happened but the reply is unclear",
      confirmed: "Staff clearly confirmed the read back was correct",
    },
  },
  misconception: {
    type: "noul",
    instructions:
      "Did anyone on the call state a known food allergy myth, such as frying or heat destroys allergens, picking the allergen off is fine, a small amount is OK, or rinsing is enough?",
    criteria: { true: "At least one allergy myth was stated", false: "No allergy myth was stated" },
  },
};

export function buildJevState(r: Restaurant, diners: Diner[], checks: CheckInstance[], p: ParsedReport, rawReport: string) {
  const answers: Record<string, { topic: string; words: string | null; speaker: string }> = {};
  for (const c of checks) {
    const a = p.answers[c.code];
    answers[c.code] = { topic: c.label, words: a?.words ?? null, speaker: a?.speakerRaw || "not stated" };
  }
  return {
    restaurant: r.name,
    guests: diners.map(describeDiner),
    call_outcome: p.outcomeRaw || (p.format === "freeform" ? rawReport.slice(0, 2000) : "not stated"),
    respondents: p.respondentsRaw || "not stated",
    dishes: p.dishes || "not stated",
    answers,
    readback: p.readback || "not stated",
    other: p.misc || "",
  };
}

export function buildJevQuestions(checks: CheckInstance[], reasked?: Set<string>) {
  const q: Record<string, Question> = { ...GLOBAL_QUESTIONS };
  for (const c of checks) {
    if (reasked && !reasked.has(c.code)) continue;
    q[`c_${c.code}`] = {
      type: "choice",
      instructions: c.instructions,
      criteria: Object.fromEntries(c.options.map((o) => [o.key, o.desc])),
    };
    q[`h_${c.code}`] = {
      type: "noul",
      instructions: `Is the answer in \`answers.${c.code}\` hedged?`,
      criteria: {
        true: 'It hedges or guesses, with words like I think, probably, usually, should be fine, we are careful, not sure, or it defers to someone not on the call',
        false: "It is a clear first hand statement of what the kitchen does. \"We can't guarantee\" followed by a specific procedure counts as clear",
      },
    };
  }
  return q;
}

export async function jevDecide(opts: {
  runId: string;
  laneId: string;
  state: unknown;
  questions: Record<string, Question>;
  checks: CheckInstance[];
}): Promise<Decisions> {
  const parsed = await systemone(opts.state, opts.questions, opts);
  return toDecisions(parsed.model, parsed.answers, opts.checks);
}

// What Fo's reply to a booking request means. Only booked_confirmed can ever finish a booking
export const BOOKING_QUESTION: Question = {
  type: "choice",
  instructions: "Fo was asked to book a table at a restaurant. Based on `fo_reply`, what does Fo say about that booking?",
  criteria: {
    not_booked: "The booking did not happen or was refused or the place is full",
    still_in_progress: "Fo is still working on it or will report later",
    asking_user: "Fo is asking the user something",
    unclear: "Not stated or unclear",
    booked_confirmed: "Fo says the table is booked now, with details such as a time or a confirmation",
  },
};

export async function classifyBookingReply(text: string, where: { runId: string; laneId: string }): Promise<ChoiceDecision> {
  const parsed = await systemone({ fo_reply: text.slice(0, 4000) }, { booking: BOOKING_QUESTION }, where);
  const x = parsed.answers.booking;
  if (x?.type !== "choice") throw new Error("Jev gave no booking decision");
  return { choice: x.choice, confidence: x.confidence, probabilities: x.probabilities };
}

async function systemone(state: unknown, questions: Record<string, Question>, where: { runId: string; laneId: string }) {
  const key = env.jevKey();
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");
  const body = { model: env.jevModel(), state, questions };
  const t0 = Date.now();
  let json: unknown = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/v1/systemone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      json = await res.json();
      break;
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
    if (![408, 429, 500, 502, 503, 504, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (!json) {
    await trace({ runId: where.runId, laneId: where.laneId, actor: "jev", action: "systemone", input: body, output: lastErr, ms: Date.now() - t0, ok: false });
    throw new Error(`Jev failed: ${lastErr}`);
  }
  const parsed = JevResponse.parse(json);
  await trace({ runId: where.runId, laneId: where.laneId, actor: "jev", action: "systemone", input: body, output: parsed, ms: Date.now() - t0, ok: true });
  return parsed;
}

type Answers = z.infer<typeof JevResponse>["answers"];

function toDecisions(model: string, a: Answers, checks: CheckInstance[]): Decisions {
  const choice = (id: string): ChoiceDecision => {
    const x = a[id];
    if (x?.type === "choice") return { choice: x.choice, confidence: x.confidence, probabilities: x.probabilities };
    return { choice: "unclear", confidence: 0, probabilities: {} };
  };
  const noul = (id: string, missing = 1) => {
    const x = a[id];
    return x?.type === "noul" ? x.noul : missing;
  };
  const d: Decisions = {
    decider: "jev",
    model,
    checks: {},
    hedge: {},
    outcome: choice("outcome"),
    respondent: choice("respondent"),
    accommodate: choice("accommodate"),
    readback: choice("readback"),
    misconception: noul("misconception"),
  };
  for (const c of checks) {
    if (!a[`c_${c.code}`]) continue;
    d.checks[c.key] = choice(`c_${c.code}`);
    d.hedge[c.key] = noul(`h_${c.code}`);
  }
  return d;
}
