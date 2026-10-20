import type { ParsedAnswer, ParsedReport, Speaker } from "./types";

// Plain word scan that runs next to Jev's hedge question. "can't guarantee" is left out on purpose:
// it is the honest standard line when a real procedure follows.
const HEDGE =
  /\b(i think|i believe|i guess|i assume|probably|usually|normally|typically|most of the time|should be (fine|ok|okay|good|safe)|we'?re (pretty )?careful|gluten[- ]friendly|not (100% |totally |entirely )?sure|pretty sure|maybe|might|as far as i know|i'?m not certain|depends|hopefully|i would think)\b/i;

export function hedgeWords(text: string | null): string | null {
  if (!text) return null;
  return text.match(HEDGE)?.[0] ?? null;
}

// in the speaker note: any sign the answer came second hand
const RELAY_WORDS = /\b(asked the|checked with|confirmed with|after checking|via|through|on behalf|passed on|relay|for the kitchen)/i;
// in the quote itself: only explicit relay phrases ("we run it through a separate fryer" is first hand)
const RELAY_QUOTE = /\b(kitchen says|the chef says|chef said|they say|they said|he says|she says|i was told|let me (ask|check)|i asked (the|our))\b/i;
const FRONT = /\b(host|hostess|server|waiter|waitress|bartender|front of house|cashier|receptionist)\b/;

// Front of house and relay words win over "chef": "host, after checking with the chef" is relayed
export function mapSpeaker(raw: string, words: string | null): Speaker {
  const s = raw.toLowerCase();
  if (/automat|recording|\bbot\b|phone menu|ivr|ai receptionist|voicemail/.test(s)) return "automated";
  if (FRONT.test(s) || RELAY_WORDS.test(s)) return "relayed";
  if (words && RELAY_QUOTE.test(words)) return "relayed";
  if (/\b(chef|sous|kitchen manager|manager|owner|gm)\b/.test(s)) return "chef_or_manager";
  if (/\b(cook|line|staff|employee|worker)\b/.test(s)) return "other_staff";
  return "unknown";
}

const SPEAKER_RANK: Record<Speaker, number> = { chef_or_manager: 0, other_staff: 1, unknown: 2, relayed: 3, automated: 4 };
export const stricterSpeaker = (a: Speaker, b: Speaker | undefined) => (b && SPEAKER_RANK[b] > SPEAKER_RANK[a] ? b : a);

// optional list marker and bold around a field name: "- **CALL OUTCOME**: answered"
const LEAD = String.raw`^\s*(?:[-*•]|\d+[.)])?\s*\**`;

const field = (text: string, name: string) => {
  const m = text.match(new RegExp(`${LEAD}${name}\\**\\s*:\\s*(.*)$`, "im"));
  return m ? stripMarks(m[1]) : "";
};

const stripMarks = (s: string) => s.trim().replace(/^\*+\s*|\s*\*+$/g, "").trim();

const NONE = /^(not asked|no answer|n\/a|none|-|unknown|not (mentioned|discussed|given|stated))\.?$/i;

function splitAnswer(rest: string): { words: string | null; speakerRaw: string } {
  let body = stripMarks(rest);
  let speakerRaw = "";
  const tail = body.match(/\(([^()]*)\)\s*\.?$/);
  if (tail) {
    speakerRaw = tail[1].trim();
    body = body.slice(0, tail.index).trim();
  }
  // a quote pair is stripped only when it wraps the whole answer, so the apostrophes in "it's ... peanut's" never cut it down
  const quoted = body.match(/^["“]([\s\S]*)["”]\.?$/) ?? body.match(/^['‘]([\s\S]*)['’]\.?$/);
  const words = stripMarks(quoted ? quoted[1] : body);
  return { words: !words || NONE.test(words) || words.includes("<") ? null : words, speakerRaw };
}

const C_LINE = new RegExp(`${LEAD}(C\\d+)\\**\\s*(?:\\([^)\\n]*\\))?\\s*\\**\\s*:\\s*(.*)$`, "gim");

export function parseReport(text: string): ParsedReport {
  const answers: Record<string, ParsedAnswer> = {};
  for (const m of text.matchAll(C_LINE)) {
    const code = m[1].toUpperCase();
    const { words, speakerRaw } = splitAnswer(m[2]);
    answers[code] = { code, words, speakerRaw, speaker: mapSpeaker(speakerRaw, words), line: m[2] };
  }
  const email = field(text, "EMAIL").match(/[^\s<>()"']+@[^\s<>()"']+\.[a-z]{2,}/i)?.[0] ?? null;
  return {
    format: Object.keys(answers).length ? "structured" : "freeform",
    outcomeRaw: field(text, "CALL OUTCOME"),
    respondentsRaw: field(text, "RESPONDENTS?"),
    answers,
    readback: field(text, "READBACK"),
    optOut: field(text, "MORE CALLS OK"),
    personCall: field(text, "PERSON MAY CALL"),
    dishes: field(text, "DISHES"),
    noteOnBooking: splitAnswer(field(text, "NOTE ON BOOKING")).words,
    noteOnBookingLine: field(text, "NOTE ON BOOKING") || null,
    cookTonight: splitAnswer(field(text, "COOK (?:TONIGHT|FOR OUR BOOKING)")).words,
    email,
    misc: field(text, "OTHER") || field(text, "NOTES"),
    duration: field(text, "DURATION"),
  };
}

export type FoReplyKind = "report" | "question" | "underway" | "other";

const PLACEHOLDER = /<their exact words>|<who said it>|answered \/ declined|<dishes>/i;
const QUESTION =
  /\b(should i|shall i|do you want|would you like|ok to|okay to|can you approve|need your (ok|approval|permission|confirmation|answer)|please confirm|can you confirm|confirm (that )?you want|is that (ok|okay|alright)|want me to|go ahead\?)\b/i;
export const FINISHED = /\b(booked|reserved|emailed|sent (the|you|it)|all set|done[.!]|confirmation (number|code)|reservation (is|was) confirmed)\b/i;
export const UNDERWAY =
  /\b(calling\b[^.?!\n]{0,60}\bnow|i['’]?m calling|calling (them|the)|dialing|placing the call|i['’]?ll call|i will call|on it|will report back|i['’]?ll (let you know|get back|report|update)|i will (let you know|get back|report|update)|will update you|booking (it |that |the table |a table )?now|(i['’]?m|i am|still) working on|call is (in progress|underway)|call['’]?s (underway|in progress|going out)|going out now|on the line now|currently on the (call|phone)|i['’]?ll (post|deliver|bring|send) (you |the |their )?(full )?(report|answers))\b/i;
// Fo saying it will call a kitchen again on its own (Monday's live calls: a redial, set callbacks, a human caller).
// Only Fo's own voice: a kitchen's "call back at 2" inside CALL OUTCOME is what they asked for, not a plan
export const SELF_CALLBACK =
  /\b(set (up )?a (callback|redial|retry|call)|scheduled (the|a) (call|callback|retry)|(give it|try) (another ring|again)|another ring|redial(ing)?|human caller|i['’]?ll (call|ring|try) (them |it )?(again|back|later)|call (them )?again (at|later|around|shortly))\b/i;
// "I won't redial", "I didn't set a callback" or "without redialing" is Fo following the rule, not a plan to call
const NO_PLAN = /\b(won['’]?t|will not|not|no|never|without|cancel(l?ed)?|stopped|didn['’]?t|haven['’]?t|no longer)\W+(\w+\W+)?$/i;
const SELF_CALLBACK_ALL = new RegExp(SELF_CALLBACK.source, "gi");
// Fo's own voice: a plan is Fo's ("I've set", "I'll give it") or a human caller it arranged
const FIRST_PERSON = /\b(i|i['’](ve|ll|m|d))\b|human caller/i;
// "I cancelled the callback and the redial": a cancel or stop anywhere before the words. A human caller only counts
// as cancelled right before it, so "stopped redialing and a human caller is calling" still counts
const NEG_BEFORE = /\b(won['’]?t|will not|not|never|without|cancel(l?ed|ling)?|stopped|didn['’]?t|haven['’]?t|no longer)\b/i;
// a field label (OTHER:) is dropped and quotes are the kitchen's words, never Fo's plan
const FIELD_LINE = /^\s*(?:[-*•]\s*)?\**[A-Z][A-Z0-9 ()/:,'-]{2,}\**\s*:/;

// The sentence where Fo says it will call a kitchen again on its own, or null. A negation just before the
// words ("I've stopped redialing") cancels that match only, so "stopped redialing and a human caller is calling" still counts
export function selfCallback(text: string): string | null {
  for (const line of text.split(/\n+/)) {
    const said = line.replace(FIELD_LINE, " ").replace(/["“][^"”]*["”]/g, " ");
    for (const s of said.split(/(?<=[.!?])\s+/)) {
      if (!FIRST_PERSON.test(s)) continue;
      for (const m of s.matchAll(SELF_CALLBACK_ALL)) {
        const before = s.slice(0, m.index);
        const negated = /human caller/i.test(m[0]) ? NO_PLAN.test(before.slice(-30)) : NEG_BEFORE.test(before);
        if (!negated) return s.trim().slice(0, 300);
      }
    }
  }
  return null;
}
export const CALL_ENDED =
  /\b(voicemail|no answer|nobody (picked up|answered)|no one (picked up|answered)|didn['’]?t (pick up|answer)|failed to connect|couldn['’]?t (reach|connect|get through)|line was busy|hung up|declined|not interested|automated (system|menu)|phone menu)\b/i;
// a call still going on right now, so an ending word in it is not the end ("calling now, if it goes to voicemail...")
const CALL_LIVE = /\b(calling\b[^.?!\n]{0,60}\bnow|dialing|placing the call|on the phone now)\b/i;

function isReport(t: string) {
  const outcome = field(t, "CALL OUTCOME");
  if (!outcome || outcome.includes(" / ")) return false;
  const p = parseReport(t);
  return Object.values(p.answers).some((a) => a.words) || /voicemail|declined|accommodate|busy|automated|no answer/i.test(outcome);
}

// What a finished Fo turn means for the lane. Unknown replies go to Anand, never to the checks.
export function classifyFoReply(text: string): FoReplyKind {
  const t = text.trim();
  if (!t) return "other";
  if (PLACEHOLDER.test(t)) return "question"; // Fo echoed our template back, usually to confirm
  if (isReport(t)) return "report";
  if (/\?\s*$/.test(t) || QUESTION.test(t)) return "question";
  if (FINISHED.test(t)) return "other";
  // "went to voicemail, I'll let you know if they call back" is an ending to weigh, not a wait
  if (CALL_ENDED.test(t) && !CALL_LIVE.test(t)) return "other";
  if (UNDERWAY.test(t)) return "underway";
  return "other";
}

// Quotes from Claude must exist word for word in what Fo actually wrote
export function isVerbatim(quote: string, source: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  return quote.trim().length > 3 && norm(source).includes(norm(quote));
}
