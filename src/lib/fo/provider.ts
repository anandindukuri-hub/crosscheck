// OAuth for Wajo's Fo MCP server. Only relative and node imports here, so `npm run fo:login`
// (plain Node with type stripping) and the Next app share this file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export const FO_URL = new URL("https://mcp.api.wajo.ai/fo");
export const CALLBACK_PORT = 8787;
export const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

type Store = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
  discovery?: OAuthDiscoveryState;
  state?: string;
};

const file = () => path.join(process.cwd(), ".data", "fo-auth.json");

export function loadStore(): Store {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Store) : {};
  } catch {
    return {};
  }
}

function update(fn: (s: Store) => void) {
  const s = loadStore();
  fn(s);
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(s), { mode: 0o600 });
}

export const hasTokens = () => !!loadStore().tokens?.access_token;

export class FileFoProvider implements OAuthClientProvider {
  interactive: boolean;
  onRedirect: ((url: URL) => void) | undefined;

  constructor(opts: { interactive: boolean; onRedirect?: (url: URL) => void }) {
    this.interactive = opts.interactive;
    this.onRedirect = opts.onRedirect;
  }

  get redirectUrl() {
    return CALLBACK_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "CrossCheck (local)",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    };
  }

  state() {
    const v = crypto.randomUUID();
    update((s) => {
      s.state = v;
    });
    return v;
  }

  clientInformation() {
    return loadStore().client;
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    update((s) => {
      s.client = info;
    });
  }

  tokens() {
    return loadStore().tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    update((s) => {
      s.tokens = tokens;
    });
  }

  saveCodeVerifier(v: string) {
    update((s) => {
      s.verifier = v;
    });
  }

  codeVerifier() {
    const v = loadStore().verifier;
    if (!v) throw new Error("No PKCE verifier saved. Run npm run fo:login again.");
    return v;
  }

  saveDiscoveryState(d: OAuthDiscoveryState) {
    update((s) => {
      s.discovery = d;
    });
  }

  discoveryState() {
    return loadStore().discovery;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    update((s) => {
      if (scope === "all" || scope === "tokens") delete s.tokens;
      if (scope === "all" || scope === "client") delete s.client;
      if (scope === "all" || scope === "verifier") delete s.verifier;
      if (scope === "all" || scope === "discovery") delete s.discovery;
    });
  }

  redirectToAuthorization(url: URL) {
    // the app never opens a browser from a background job; only the login script does
    if (!this.interactive) throw new Error("Fo needs a sign in. Run npm run fo:login in the crosscheck folder.");
    this.onRedirect?.(url);
  }
}
