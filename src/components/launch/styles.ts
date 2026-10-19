import "./launch.css";

/**
 * Class names for launch.css. Not a CSS module because the Turbopack rule in next.config.ts turns every *.css
 * into plain global CSS, so each launch class is written as ccl-<name> and read here as styles.<name>.
 */
export const styles: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key) => (typeof key === "string" ? `ccl-${key}` : undefined),
});
