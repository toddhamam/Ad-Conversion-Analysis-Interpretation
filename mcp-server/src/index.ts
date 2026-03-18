#!/usr/bin/env node

/**
 * Convertra MCP Server — DISABLED
 *
 * This MCP server has been disabled for Meta Platform Policy compliance.
 * The external-summary API endpoint it depended on now returns HTTP 410.
 *
 * Meta's App Review approved specific internal use cases (dashboard analytics,
 * ad creation within the Convertra web app). Exposing Meta Platform Data
 * through external APIs or MCP tools was not part of the approved use cases
 * and violates Platform Terms Section 3.a.
 *
 * Do NOT re-enable without first obtaining explicit Meta approval for
 * external data access use cases via a new App Review submission.
 */

console.error(
  'Convertra MCP server is disabled.\n'
  + 'Meta Platform Policy compliance: external access to Meta Platform Data\n'
  + 'was not part of the approved App Review use cases.\n'
  + 'See mcp-server/src/index.ts header comment for details.',
);
process.exit(1);
