import Link from "next/link";
import { buttonClass } from "@/components/kit/button";

export default function NotFound() {
  return (
    <div className="wrap flex flex-col items-center py-28 text-center md:py-36">
      <p className="type-callout text-ink-2">Page not found</p>
      <h1 className="type-large mt-2 max-w-xl">This page is not here.</h1>
      <p className="type-body mt-3 max-w-md text-ink-2">The link may be old or the table may have been removed from this computer.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/new" className={buttonClass("primary")}>
          Start a table
        </Link>
        <Link href="/run" className={buttonClass("plain")}>
          Your tables
        </Link>
      </div>
    </div>
  );
}
