import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { engineText, smart } from "@/components/kit/typo";
import { aliasReplay } from "@/components/run/alias";
import { bySeverity, guestNeeds, passTime, sortNeeds, type Need } from "@/components/run/plain";
import { tableCard } from "./lanes";
import { DISCLAIMER } from "./note";
import type { Lane, Run } from "./types";

// The table pass as a PNG to keep in Photos and show the server: the same white Wallet style pass as the app, drawn at
// 3x a 390pt phone so it is sharp full screen. Only for a pass the app would show, under the same rules

const W = 1170;
const PAD = 48; // around the pass
const IN = 66; // inside the pass
const INK = "#1d1d1f";
const INK2 = "#6e6e73";
const LINE = "rgba(0,0,0,0.08)";
const GREEN = "#248a3d";
const SEV: Record<string, string> = { "Life threatening": "#d70015", Severe: "#b25000", Mild: INK2 };

type Guest = { name: string; needs: Need[]; dish: string | null };
export type PassData = { state: string; restaurant: string; time: string; party: string; sample: boolean; guests: Guest[] };

// "Who is Guest 2?" as typed on the pass page, the same way the page shows it: "Maya, window seat" is "Maya · window seat".
// Only an unnamed guest can be renamed, and the name is used for this one image, never stored
function shownName(label: string, who: Record<string, string>): string {
  const typed = /^guest\s*\d+$/i.test(label.trim()) ? who[label]?.trim().slice(0, 40) : "";
  return typed ? typed.replace(/\s*,\s*/g, " · ") : label;
}

// the same pass the card page draws, else why there is none
export function passData(run: Run, lane: Lane, who: Record<string, string> = {}): { ok: true; pass: PassData } | { ok: false; why: string } {
  const shown = aliasReplay(run.mode, { run, lane });
  const r = shown.lane.result;
  const card = tableCard(shown.lane);
  const name = shown.lane.restaurant.name;
  if (card.kind === "blocked") return { ok: false, why: `Do not use this pass. ${name} did not give the same answers when Fo called to reconfirm.` };
  if (card.kind === "none" || !r) return { ok: false, why: `No table pass for ${name} yet. ${card.kind === "none" ? card.why : "It has no answers yet."}` };
  const booked = shown.lane.booking?.status === "done";
  const state = shown.lane.reconfirm?.status === "reconfirmed" ? "Booked and reconfirmed" : booked ? "Booked" : r.state === "matched" ? "Matched" : "Reviewed";
  return {
    ok: true,
    pass: {
      state,
      restaurant: name,
      time: passTime(shown.run.when, shown.run.createdAt),
      party: `Table for ${shown.run.partySize}`,
      sample: run.mode === "replay",
      // the guests' own labels, or the name typed for an unnamed guest on the pass page
      guests: bySeverity(shown.run.diners).map((d) => ({
        name: shownName(d.label, who),
        needs: sortNeeds(guestNeeds(d)),
        dish: smart((r.dishes.find((x) => x.diner === d.label)?.dishes ?? []).map(engineText).join(", ")) || null,
      })),
    },
  };
}

export const passFileName = (restaurant: string) =>
  `crosscheck-pass-${restaurant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table"}.png`;

const ONLY = "Matched for these dishes only. Nothing else on the menu was checked.";
const NO_DISH = "No dish named yet. Ask your server.";

function Dot({ color, size }: { color: string; size: number }) {
  return <div style={{ width: size, height: size, borderRadius: size / 2, background: color, flexShrink: 0 }} />;
}

function Label({ children }: { children: string }) {
  return <div style={{ fontSize: 36, lineHeight: 1.33, color: INK2 }}>{children}</div>;
}

const isLife = (g: Guest) => g.needs.some((n) => !n.diet && n.severity === "Life threatening");

// as on the app's pass: the life threatening guest is a tinted band with no hairlines around it
function GuestRow({ g, first, afterLife }: { g: Guest; first: boolean; afterLife: boolean }) {
  const allergies = g.needs.filter((n) => !n.diet);
  const diets = g.needs.filter((n) => n.diet);
  const life = allergies.some((n) => n.severity === "Life threatening");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: `48px ${IN}px`,
        background: life ? "#fdecec" : "#ffffff",
        borderTop: life || first || afterLife ? "none" : `3px solid ${LINE}`,
        margin: life ? `${first ? 48 : 24}px 0 24px` : 0,
      }}
    >
      <Label>{g.name}</Label>
      {allergies.map((n) => (
        <div key={n.text} style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          {n.severity && (
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 39, fontWeight: 700, color: SEV[n.severity] ?? INK2 }}>
              <Dot color={SEV[n.severity] ?? INK2} size={21} />
              {n.severity}
            </div>
          )}
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.2, letterSpacing: -1.4, color: INK }}>{n.text}</div>
        </div>
      ))}
      {diets.map((n) => (
        <div key={n.text} style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 39, fontWeight: 700, color: INK2 }}>
            <Dot color="#86868b" size={21} />
            {n.diet!.label}
          </div>
          <div style={{ fontSize: 57, fontWeight: 700, lineHeight: 1.3, letterSpacing: -0.6, color: INK }}>{n.diet!.line}</div>
        </div>
      ))}
      {g.dish ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
          <div style={{ fontSize: 36, lineHeight: 1.33, color: INK2 }}>Will order only</div>
          <div style={{ marginTop: 6, fontSize: 51, fontWeight: 700, lineHeight: 1.3, letterSpacing: -0.5, color: INK }}>{g.dish.charAt(0).toUpperCase() + g.dish.slice(1)}</div>
        </div>
      ) : (
        <div style={{ marginTop: 30, fontSize: 45, lineHeight: 1.4, color: INK2 }}>{NO_DISH}</div>
      )}
    </div>
  );
}

function Pass({ p }: { p: PassData }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", background: "#f5f5f7", padding: PAD, fontFamily: "Pass" }}>
      <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 72, overflow: "hidden", boxShadow: "0 3px 6px rgba(0,0,0,0.04), 0 24px 84px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 36, padding: `48px ${IN}px`, borderBottom: `3px solid ${LINE}` }}>
          <div style={{ display: "flex", flexShrink: 0, alignItems: "baseline", gap: 18 }}>
            <div style={{ fontSize: 51, fontWeight: 700, letterSpacing: -0.5, color: INK }}>CrossCheck</div>
            {p.sample && <div style={{ fontSize: 36, color: INK2 }}>Sample</div>}
          </div>
          {/* the state hugs the right edge: a long one breaks after "and", its dot on the first line */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 45, fontWeight: 700, lineHeight: 1.2, color: GREEN }}>
            {p.state.split(/(?<= and) /).map((line, i) => (
              <div key={line} style={{ display: "flex", alignItems: "center", gap: 21 }}>
                {i === 0 && <Dot color={GREEN} size={24} />}
                {line}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: `60px ${IN}px` }}>
          <Label>Restaurant</Label>
          <div style={{ marginTop: 9, fontSize: 57, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.6, color: INK }}>{p.restaurant}</div>
          <div style={{ display: "flex", marginTop: 42, gap: 72 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <Label>Time</Label>
              <div style={{ marginTop: 9, fontSize: 51, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5, color: INK }}>{p.time}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <Label>Party</Label>
              <div style={{ marginTop: 9, fontSize: 51, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5, color: INK }}>{p.party}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", margin: `54px -${IN}px 0`, borderTop: p.guests[0] && isLife(p.guests[0]) ? "none" : `3px solid ${LINE}`, borderBottom: `3px solid ${LINE}` }}>
            {p.guests.map((g, i) => (
              <GuestRow key={g.name} g={g} first={i === 0} afterLife={i > 0 && isLife(p.guests[i - 1])} />
            ))}
          </div>
          {p.guests.some((g) => g.dish) && <div style={{ marginTop: 36, fontSize: 39, lineHeight: 1.38, color: INK2 }}>{ONLY}</div>}
          <div style={{ marginTop: 48, fontSize: 39, lineHeight: 1.38, color: INK2 }}>Show this to your server.</div>
          <div style={{ marginTop: 48, paddingTop: 48, borderTop: `3px solid ${LINE}`, fontSize: 39, lineHeight: 1.38, color: INK2 }}>{smart(DISCLAIMER)}</div>
        </div>
      </div>
    </div>
  );
}

// Satori spaces words by their unkerned letter widths but draws them kerned, which left a wide gap after words like
// "Tell" and "Table". Hiding the kern tables makes the two agree
function unkerned(b: Buffer): ArrayBuffer {
  const out = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const v = new DataView(out);
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
    if (tag === "kern" || tag === "GPOS") v.setUint8(at, 0x78);
  }
  return out;
}

// the system's Arial when there is one, so titles get a real bold; otherwise the font that ships with Next
let fontCache: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | undefined> | null = null;
function fonts() {
  fontCache ??= (async () => {
    const dir = "/System/Library/Fonts/Supplemental";
    try {
      const [regular, bold] = await Promise.all([readFile(`${dir}/Arial.ttf`), readFile(`${dir}/Arial Bold.ttf`)]);
      return [
        { name: "Pass", data: unkerned(regular), weight: 400 as const, style: "normal" as const },
        { name: "Pass", data: unkerned(bold), weight: 700 as const, style: "normal" as const },
      ];
    } catch {
      return undefined;
    }
  })();
  return fontCache;
}

// a PNG for a pass the app allows, else a 404 that says why there is none
export async function passResponse(run: Run, lane: Lane, opts: { download?: boolean; who?: Record<string, string> } = {}): Promise<Response> {
  const found = passData(run, lane, opts.who);
  if (!found.ok) return new Response(found.why, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const name = passFileName(found.pass.restaurant);
  // no height: the image is as tall as the pass, measured from its own layout
  return new ImageResponse(<Pass p={found.pass} />, {
    width: W,
    height: undefined,
    fonts: await fonts(),
    headers: { "Cache-Control": "no-store", "Content-Disposition": `${opts.download ? "attachment" : "inline"}; filename="${name}"` },
  });
}
