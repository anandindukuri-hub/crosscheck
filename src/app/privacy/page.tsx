import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

// where allergy details go, in plain words: the one page people read before they type a health detail
const SECTIONS = [
  {
    id: "privacy",
    title: "Your allergy details",
    body: [
      "Allergies and diets you enter go to Fo (Wajo’s AI caller) to make the calls, to Claude and Jev (the two AI models that check each answer) and to the kitchens you approve, on the call and in the allergy note.",
      "CrossCheck never sells them or uses them for ads.",
      "Each kitchen’s answers are kept with who said them and when. You can read the exact words later. Answers about life threatening and severe allergies expire after 7 days. Answers about mild allergies and diets expire after 30.",
    ],
  },
  {
    id: "terms",
    title: "Terms",
    body: [
      "CrossCheck relays what staff said. It is not a guarantee and not medical advice.",
      "Tell your server again at the table and follow your allergist’s plan.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: ["Questions about your details go to the person who set up this CrossCheck. They can remove a table and its answers at any time."],
  },
];

export default function Privacy() {
  return (
    <div className="wrap pt-10 pb-20 md:pt-14">
      <div className="mx-auto max-w-[680px]">
        <h1 className="type-large">Privacy</h1>
        <p className="type-body mt-2 text-ink-2">Where your allergy details go and where they never go.</p>
        <div className="mt-10 space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="card scroll-mt-[76px] px-5 py-5 md:px-6">
              <h2 id={`${s.id}-h`} className="text-[21px] leading-[1.2] font-semibold tracking-[-0.01em]">
                {s.title}
              </h2>
              <div className="type-body mt-2 space-y-2 text-ink-2">
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
