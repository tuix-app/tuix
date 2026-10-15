#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, readConfig } from "./client.mjs";
import { createServer } from "./server.mjs";

try {
  if (process.argv.length !== 2) throw new Error("Configuration is environment-only.");
  const server = createServer(createClient(readConfig()));
  await server.connect(new StdioServerTransport());
} catch {
  // Never print exceptions: SDK/fetch errors can contain request or report data.
  process.stderr.write("Tuix MCP could not start. Check TUIX_API_URL and TUIX_MCP_TOKEN; configuration is environment-only.\n");
  process.exitCode = 1;
}
