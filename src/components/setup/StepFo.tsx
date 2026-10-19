"use client";

import { Disclosure } from "../kit/Disclosure";
import type { AppStatus } from "../useStatus";
import { Command } from "./Command";
import { Rows, StatusRow } from "./StepKeys";

export function StepFo({ fo }: { fo: AppStatus["fo"] }) {
  return (
    <>
      <Rows>
        <StatusRow
          name="Fo"
          line={fo.signedIn ? `${fo.tools.length} tools ready` : "Sign in once with your Wajo account."}
          ok={fo.signedIn}
          okWord="Connected"
          missingWord="Not connected"
        />
      </Rows>
      {!fo.signedIn && (
        <Disclosure summary="Show technical details" className="border-t border-hairline">
          <Command text="npm run fo:login" />
          <p className="type-callout mt-3 text-ink-2">Run it in the crosscheck folder, then sign in with your Wajo account in the window it opens. This step turns green by itself.</p>
          {fo.error && !/not signed in/i.test(fo.error) && <p className="type-footnote mt-2 text-nomatch">Last error from Fo: {fo.error}</p>}
        </Disclosure>
      )}
    </>
  );
}
