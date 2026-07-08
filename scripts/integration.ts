#!/usr/bin/env bun
// @ts-nocheck — src/generated/ is emitted by `bun run ki:generate:client`, which
// needs a registered mcporter instance for mcp-gsuite; none exists yet.
/**
 * Integration script for mcp-gsuite via the mcporter typed client.
 * Calls through the mcporter daemon (must be running).
 *
 * Record a session:  bun run test:record
 * Replay in CI:      bun run test:replay
 */

import { createKitMcpGsuiteClient } from "../src/generated/client.ts";

const client = await createKitMcpGsuiteClient();

try {
  const result = await client.gsuite_about({});
  console.log("gsuite_about:", JSON.stringify(result, null, 2));
  console.log("✓ integration passed");
} finally {
  await client.close();
}
