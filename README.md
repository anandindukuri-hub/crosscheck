# CrossCheck

**An AI that phones restaurants about your table's food allergies. Only a kitchen that clears every check can be booked.**

For people with severe food allergies, celiac disease or a no beef diet who call restaurants before they eat out. It runs on your own computer. Add any US restaurant by its phone number. Before a real call you must tick that the restaurant agreed to a short AI call. You ask them yourself first.

The fries have no shrimp in them. They can still fry in the same oil as the shrimp. People with severe allergies or celiac disease call ahead to ask, one restaurant at a time. Often a host guesses "should be fine." CrossCheck makes those calls for your whole table and asks the chef.

- **Fo** (Wajo's AI caller, used through its MCP server) phones each restaurant. Its first sentence says it is an AI assistant calling for you. Then it asks the chef about hidden ingredients, the fryer and shared pans for every guest.
- **Claude** reads every answer and quotes the kitchen's words as Fo wrote them in its report. **Jev** (TypeSafe AI's confidence model) turns each answer into a typed choice and says how sure it is, from 0 to 1.
- **Plain code decides.** A check passes only when Jev picks a passing answer at 0.9 confidence or higher, Claude agrees, the chef or manager said it first hand, nothing was hedged and the kitchen confirmed Fo's read back.
- **You approve every call and the booking.** Fo books only a kitchen that cleared every check. It sends the kitchen a written allergy note with the answers its staff gave. You get a table pass to show your server.

Built by Anand Indukuri for the Wajo x Anthropic Get Sh\*t Done hackathon, October 2026.

## How it decides

Models never decide. Claude and Jev return typed answers and `src/lib/rules.ts` applies one rule. For each allergy or diet, Fo asks about up to three things: hidden ingredients, the fryer and shared pans.

**A check passes only when all five hold:**

1. Jev picks a passing answer at 0.9 confidence or higher.
2. Claude reads the answer the same way.
3. The chef or manager said it first hand. An answer passed on from other staff goes to the chef.
4. Nothing is hedged. Jev's separate "is this answer hedged?" score is under 0.20 and the words have no hedge such as "I think" or "usually".
5. The kitchen confirmed Fo's read back.

**A kitchen matches only when** every check passes for every guest, the chef or manager clearly answered the call, the kitchen said it can accommodate the table and it named dishes for each guest.

**Ruling out and asking the chef:**

- Ruling a kitchen out is the cautious direction, so it needs less proof: Jev at 0.9 on its own or 0.75 when Claude reads it the same way.
- When Jev scores an answer 0.30 or more as a possible allergy myth (like "frying kills it"), Fo asks the chef. At 0.95 or more the kitchen is ruled out.
- Anything else that is unclear means Needs the chef. With your OK, Fo calls back once and asks only those questions. Nothing is booked on a guess.

**Two more locks:**

- First, a practice call to your own phone checks that Fo's report keeps words like "I think" or "we share the fryer". CrossCheck never hears the call itself. Claude and Jev read Fo's written report. Until the practice call passes, no kitchen matches on its own. It stops at Ready for your review and you tick each quote before you book.
- If Jev is missing or cannot be reached, the rule runs on Claude's reading alone and every match stops at Ready for your review.

The cutoffs were set on live Jev output before the first real call. Clean answers scored 0.03 to 0.08 on the hedge score. A real "I think" scored 0.98.

Each kitchen ends as Matched, Ready for your review, Needs the chef, Did not match, No answer yet or Declined.

## Run it yourself

You need:

- Node 24 and npm
- A Claude API key from [platform.claude.com](https://platform.claude.com)
- A Jev key from TypeSafe AI at [console.typesafe.ai](https://console.typesafe.ai)
- A Wajo account on the OG Fo plan, which includes Fo's MCP server
- Your own phone for the practice call

Steps:

1. Get the code and install it:
   ```bash
   git clone https://github.com/anandindukuri-hub/crosscheck.git
   cd crosscheck
   npm ci
   ```
2. Copy the example settings, then add your keys to `.env.local` (see the table below):
   ```bash
   cp .env.example .env.local
   ```
3. Sign in to Fo once:
   ```bash
   npm run fo:login
   ```
   It opens Wajo's sign in page (or prints a link to paste), waits for the sign in on 127.0.0.1:8787 and saves Fo's tokens to `.data/fo-auth.json`.
4. Start the app:
   ```bash
   npm run build
   npm start
   ```
   Use `npm run dev` instead while you change code. Both serve http://localhost:3000 on this computer only.
5. Open http://localhost:3000/setup. When Your phone, Fo and Answer checks are ready, tap **Start the practice call**. On the run page tap **Send to Fo**, then **Yes, go ahead** when Fo asks. Your phone rings. You play the chef and read each line on the **Your lines** card. The result shows Verified or Not verified with each signal. Once it passes, Setup says **CrossCheck is ready**. The practice call uses a fixed sample table (Anand and Guest 2) so the lines always match Fo's questions. Below it, **Ready for a real run** checks Fo, the answer checks, the practice call, that no other real run is going and that you are on the production build.
6. Tap **Start a table**. Type the **Name for the booking**, then add each guest's allergies and how serious each one is. Pick any of the 9 major food allergens or type another under **Other allergens** (up to 3 per guest). Shellfish comes as two choices, crustaceans and mollusks. Wheat is covered by the Celiac (gluten) choice. Pick **When**, then **Next: Kitchens**.
7. Under **Who answers** pick **Real calls**. Search the Madison quick picks or tap **Add a restaurant** and enter any US restaurant's name, phone number and cuisine. Pick up to 5, then **Review calls**.
8. Ask each restaurant once whether a short AI call about allergies is OK, by phone or in person. Fo asks every allergy question after that. On **Review the calls** tick each one that said yes. Tap **Send to Fo**, then **Start calls**.
9. Each kitchen shows its result with the kitchen's own words. Tap **Book** on the Best match card, open the table pass and download the run trace from the bottom of the run page. **Stop all calls** ends a run at any time. **How this run used Fo** shows every Fo tool used for each kitchen.

| Variable | Needed for | What it is |
|---|---|---|
| `ANTHROPIC_API_KEY` | Any call | Claude API key from platform.claude.com |
| `TYPESAFE_API_KEY` | Real calls | Jev key from console.typesafe.ai |
| `FO_TEST_PHONE` | Setup and the practice call | Your own phone number. Fo calls it and you play the kitchen |
| `FO_REPORT_FIDELITY` | Nothing | Leave it empty. `force_unverified` holds every match for your review even after a practice call passed |
| `JEV_MODEL`, `CLAUDE_MODEL` | Nothing | Defaults are `jev-1.13.0` and `claude-opus-5-5` |

With no keys at all the app still starts and Sample tables work.

### Without a Jev key

- **Sample** needs no keys. Four made up kitchens answer from a script. Nothing is called or sent.
- With a Claude key, Fo signed in and `FO_TEST_PHONE` set, turn on **Show developer modes** at /setup/developer and pick **Test calls** under Who answers. Fo calls your own phone and you play each kitchen. Only Claude reads the answers. A kitchen that clears its checks stops at **Ready for your review** and you tick each quote before booking.
- **Real calls** stay off until a Jev key is added.

### Who answers

| Choice | Who picks up | Use it for |
|---|---|---|
| Real calls | The real restaurants, after each one said yes to an AI call | Real checks and real bookings |
| Test calls | Your own phone. You play each kitchen. The booking note goes to your own inbox. Turn on **Show developer modes** at /setup/developer to see it. | Trying the full loop without calling a restaurant |
| Sample | Four made up kitchens from a script. Nothing is called or sent. | Seeing how it works |

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on http://localhost:3000 |
| `npm run build` then `npm start` | Production server on http://localhost:3000 |
| `npm run fo:login` | Signs in to Fo once |
| `npm run typecheck`, `npm run lint` | Type check and lint |
| `curl localhost:3000/api/dev/eval` | Dev server only. Runs 29 scripted kitchens through the parser and the rules, 278 unit checks and a check that every cuisine's script asks every required question |

Port 3000 taken? Run `npx next dev -H 127.0.0.1 -p 3001`. Any port on localhost works.

## Privacy and your data

- **Nothing is hosted.** There is no CrossCheck server or account. Everything the app keeps is in the `.data` folder of your copy, which git ignores: runs, run traces, kitchen answers, restaurants you added, kitchens that asked not to be called, settings, run counts and your Fo sign in.
- **Only this computer.** The app binds to 127.0.0.1. It refuses requests addressed to any other host, posts from another site and API reads from another site.
- **What leaves your computer.** The table's allergies and diets, the booking name and each restaurant go to Fo through your Wajo account to make the calls. Fo's report goes to Claude (Anthropic API) and Jev (TypeSafe AI) to read the answers. The kitchens you approve hear the questions and get the allergy note. Fo keeps its own conversations in your Wajo account.
- **Guest names.** Friends you leave unnamed stay "Guest 2" on every call, note, pass and export.
- **Run trace.** "Download the run trace" saves every Fo, Claude and Jev call in a run. It removes what it can find of phone numbers, emails, sign in values, staff names and the names of places you did not book. Read it before you share it.

## Trust by design

- **You approve every outward action.** Calls, the chef callback and the booking each need a tap. Fo's own questions to you show up on that restaurant's card in the app, in Fo's exact words.
- **Kitchens can say no more calls.** Fo ends its first call to each kitchen by asking: "Is it OK if we call you again, to book this table or for other guests with allergies?" A no puts the kitchen on a do not call list. CrossCheck then makes no call to it at all (no chef callback, booking call or reconfirm) until you take it off. The allergy note asks the kitchen to tell us if anything in it is wrong.
- **See how a run used Fo.** Each run page lists every Fo tool per kitchen and why. "Check Fo's conversations" sorts Fo's conversations since the run began into this run's kitchens and your own other chats. It shows counts only and never reads your other chats.
- **Stop all calls.** One tap stops a run: kitchens Fo has not called yet are not called and Fo is told to stop the rest. A stop goes out at once, never behind queued calls. Only one real run goes at a time. A new run cannot include a kitchen CrossCheck called in the last 12 hours. The chef callback, the booking and the reconfirm are the only follow up calls and each needs your tap.
- **Fair to the people called.** Fo says it is an AI and who it is calling for in its first sentence, asks before taking notes, is told to keep calls under 5 minutes, accepts "we can't accommodate" without pushing and calls the chef back at most once, only after you tap. Fo is told to make one call only: no redials, no callbacks it sets itself and no voicemail messages. If Fo says it will call a kitchen again anyway, the app warns you and one tap tells Fo to cancel. Real calls need a tick that each restaurant said yes. By default, once one kitchen matches, the rest are not called.
- **No model decides to book.** Models return typed answers. `src/lib/rules.ts` decides.
- **Quotes are checked.** A quote Claude cites must appear word for word in Fo's report or it is dropped.
- **No "safe" in the app.** Cards say who said what and when. The run page, every kitchen card and the table pass carry: "CrossCheck relays what staff said. Not a guarantee." The allergy note tells the kitchen the same. It is not medical advice.

## What you get

- **A table, not a person.** Up to 4 guests with allergies or diets. One call per kitchen covers everyone. Fo asks about the ingredients, the fryer and the cooking gear once each for the whole table, then files a named answer per allergen. A call holds up to 12 checks.
- **Any allergen.** The 9 major food allergens are choices, each with how serious it is (Life threatening, Severe or Mild). Type up to 3 others per guest, such as mustard. A typed allergen gets the same three questions and the same strict rule. A name a choice already covers, such as shrimp, points you to that choice. A No beef diet can also rule out shared grills and fryers.
- **Any US restaurant.** Add a restaurant by name and phone number. It shows under Added by you and you can remove it. Madison, WI quick picks are built in.
- **Your name on the calls.** The Name for the booking is the name Fo gives on every call, the chef callback, the booking, the reconfirm and the allergy note.
- **Most likely match first.** Fo calls one kitchen at a time: a kitchen that already matched for this table, then the one whose cuisine overlaps least with your table's allergies, then your order. With "Stop calling once a kitchen matches" on (the default), every kitchen after a true match shows Not called and nothing is sent for it. "Call anyway" calls one after all.
- **No verdict before the rule.** While Claude and Jev read the report, the kitchen shows Checking the answers. Nothing can be booked until both finish.
- **Practice call before trust.** A call to your own phone checks that Fo's report keeps unsure words like "I think", answers passed on by other staff and a shared fryer. Until it passes, CrossCheck never matches a kitchen on its own. You read and tick each quote instead.
- **Kitchen answers.** Every answer is a dated record on the Kitchen answers page. Answers about life threatening and severe allergies expire after 7 days and mild ones after 30. If a kitchen already answered these exact questions for this exact table recently, CrossCheck skips the call. A later unclear or failing answer from that kitchen blocks reuse.
- **Booking with a cap.** Fo books under your name. It pays a deposit only up to the cap you pick (Ask me first or up to $25, $50 or $100). It emails the kitchen the allergy note. When a kitchen has no email, Fo reads the note to them. If Fo's reply is unclear, a "Did Fo book it?" card lets you say.
- **Day of reconfirm.** "Reconfirm now" has Fo call back on the day, check the allergy note is on the booking and ask the key questions again. Any changed answer shows Not reconfirmed.
- **Table pass.** A Wallet style pass with each guest's needs, the dishes the chef named and the kitchen's own words, to show your server. "Save as image" keeps it in your photos.
- **Talk to Fo.** Open a live voice call with Fo from any kitchen and read each call's Fo conversation.
- **Cuisine hints.** Once you pick kitchens, a note says what those cuisines often cook with for your table, for example "Thai kitchens often cook with peanut and shellfish." The same hints set the call order. They never decide.
- **Alerts.** The tab title and a notification tell you when Fo needs your answer, since calls take minutes.
- **A record of every real run.** Developer setup lists each real run with what every kitchen gave back, booked or not and whether you stopped it.

## Why

- Nearly half of reported fatal food allergy reactions over 13 years were caused by food from a restaurant or other food service place (Radke et al., CDC MMWR, 2017).
- In a CDC survey of restaurant managers in the same report, 10.3% of those whose restaurant had a fryer kept a special fryer for allergen free food. Only 7.6% had a separate area to prepare it.
- 53.9% of restaurant reactions in the FARE patient registry happened even after staff were told about the allergy (Oriel et al., J Allergy Clin Immunol Pract, 2021).
- 35% of restaurant staff surveyed believed fryer heat destroys allergens (Ahuja and Sicherer, Annals of Allergy, Asthma and Immunology, 2007).

## Roadmap

- **A hosted version.** Accounts, a database in place of the `.data` folder and a Fo sign in for each user. Then anyone can use it without running code.
- **Restaurants near you.** Quick picks cover Madison, WI today. Next is a lookup by city so nobody types phone numbers.
- **Ask only what is missing.** Reuse fresh answers question by question and ask a kitchen only what it has not answered for this table. Today answers are reused only for the exact same table.
- **Partial matches.** Show which guests a kitchen can serve when it cannot serve everyone.
- **Calls in parallel** for bigger searches, still with one call per kitchen. Today Fo calls one kitchen at a time.
- **A practice call with your own table and name.** Today it uses a fixed sample table.
- **Recalibration.** Tune the cutoffs again as more real calls come in.
- **Beyond the US.** Phone numbers and call scripts for other countries and languages.

## What is in the repo

| Path | What it does |
|---|---|
| `src/lib/checks.ts` | What Fo asks for each allergen, diet and cuisine, plus which answers pass |
| `src/lib/allergens.ts` | Other allergens a guest types in: the name checks and the pointer to a built in choice |
| `src/lib/script.ts` | The exact messages Fo gets for the call, the chef callback, the booking and the reconfirm |
| `src/lib/report.ts` | Reads Fo's report, maps who said what, finds hedge words and sorts Fo's replies |
| `src/lib/jev.ts`, `src/lib/claude.ts` | The two readers |
| `src/lib/rules.ts` | The 0.9 rule, the calibrated cutoffs and every kitchen result |
| `src/lib/calibration.ts` | The practice call lines and the check on Fo's report |
| `src/lib/engine.ts` | Runs each restaurant through Fo one call at a time, stops a run, keeps one real run at a time and picks up again after a restart |
| `src/lib/donotcall.ts` | Kitchens that asked not to be called again and how Fo's answer is read |
| `src/lib/usage.ts` | How a run used Fo plus the record of every real run |
| `src/instrumentation.ts` | After a restart: lanes left mid call wait for Resume and a saved stop goes out once |
| `src/lib/restaurants.ts` | The quick picks and the restaurants you add |
| `src/lib/risk.ts` | Cuisine hints and the call order |
| `src/lib/reconfirm.ts`, `src/lib/ledger.ts` | Day of reconfirm and kitchen answers |
| `src/lib/note.ts`, `src/lib/passImage.tsx` | The allergy note and the table pass as an image |
| `src/lib/trace.ts` | The run trace, its redaction and the run counts |
| `src/lib/fo/` | MCP client for Fo with OAuth (dynamic client registration and PKCE) |
| `src/proxy.ts`, `src/lib/guard.ts` | Only this computer may use the app |
| `scripts/fo-login.ts` | The one time Fo sign in |
| `data/madison-restaurants.json` | 129 Madison restaurants with a phone number |

## Data and credit

- Madison quick picks © OpenStreetMap contributors, available under the [Open Database License (ODbL 1.0)](https://www.openstreetmap.org/copyright). Fetched Oct 18, 2026 through the Overpass API.
- The questions Fo asks are based on public guidance from FARE, the Celiac Disease Foundation, Beyond Celiac and the FDA Food Code.
- The numbers under Why come from [Radke et al., CDC MMWR, 2017](https://www.cdc.gov/mmwr/volumes/66/wr/mm6615a2.htm), Oriel et al., J Allergy Clin Immunol Pract, 2021 and Ahuja and Sicherer, Annals of Allergy, Asthma and Immunology, 2007.

## License

MIT. See [LICENSE](LICENSE).
