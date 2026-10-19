// One time sign in to Fo (Wajo). Run from the crosscheck folder: npm run fo:login
// Opens Wajo's consent page, catches the redirect on 127.0.0.1 and saves tokens to .data/fo-auth.json.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CALLBACK_PORT, CALLBACK_URL, FO_URL, FileFoProvider, loadStore } from "../src/lib/fo/provider.ts";

function waitForCallback(): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url ?? "/", CALLBACK_URL);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<p style='font-family:sans-serif'>CrossCheck is connected to Fo. You can close this tab.</p>");
      srv.close();
      resolve(u.searchParams);
    });
    srv.on("error", reject);
    srv.listen(CALLBACK_PORT, "127.0.0.1");
    setTimeout(() => {
      srv.close();
      reject(new Error("Timed out after 5 minutes waiting for the Wajo sign in"));
    }, 5 * 60_000).unref();
  });
}

async function showTools(client: Client) {
  const tools = await client.listTools();
  console.log(`Fo tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  await client.close();
}

async function main() {
  const provider = new FileFoProvider({
    interactive: true,
    onRedirect: (url) => {
      console.log("\nOpening the Wajo sign in page. If it does not open, paste this link into your browser:\n");
      console.log(url.href + "\n");
      execFile("open", [url.href]);
    },
  });
  const callback = waitForCallback();
  const client = new Client({ name: "crosscheck", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(FO_URL, { authProvider: provider });
  try {
    await client.connect(transport);
    console.log("Already signed in to Fo.");
    await showTools(client);
    process.exit(0);
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
  }
  const params = await callback;
  if (params.get("error")) throw new Error(`Wajo said: ${params.get("error")} ${params.get("error_description") ?? ""}`);
  const expected = loadStore().state;
  if (expected && params.get("state") !== expected) throw new Error("Sign in state did not match. Run npm run fo:login again.");
  const code = params.get("code");
  if (!code) throw new Error("No authorization code came back from Wajo.");
  await transport.finishAuth(code);
  const fresh = new Client({ name: "crosscheck", version: "0.1.0" });
  await fresh.connect(new StreamableHTTPClientTransport(FO_URL, { authProvider: provider }));
  console.log("Signed in to Fo. Tokens saved to .data/fo-auth.json (never commit this file).");
  await showTools(fresh);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\nFo sign in failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
