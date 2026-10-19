export const ALLERGEN_KEYS = [
  "crustacean",
  "mollusk",
  "peanut",
  "tree_nut",
  "fish",
  "milk",
  "egg",
  "soy",
  "sesame",
  "gluten",
] as const;

export const CUISINES = [
  "thai",
  "chinese",
  "indian",
  "mexican",
  "burgers",
  "pizza",
  "italian",
  "japanese",
  "american",
  "mediterranean",
  "cafe",
  "other",
] as const;

// the name Fo gives on calls, the booking and the allergy note. Letters plus the marks real names use
export const BOOKING_NAME_MAX = 40;
export const BOOKING_NAME_BAD = "Use only letters, spaces, apostrophes, periods and hyphens in the booking name, up to 40 characters.";
export const BOOKING_NAME_EMPTY = "Add the name for the booking.";

// built with RegExp so the unicode letter class works with the ES2017 target
const NAME_CHARS = new RegExp("^[\\p{L}\\p{M} '’.-]+$", "u");
const HAS_LETTER = new RegExp("\\p{L}", "u");

export function bookingNameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return BOOKING_NAME_EMPTY;
  if (name.length > BOOKING_NAME_MAX || !NAME_CHARS.test(name) || !HAS_LETTER.test(name)) return BOOKING_NAME_BAD;
  return null;
}
