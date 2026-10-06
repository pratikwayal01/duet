import { defineWorkspace } from "vitest/config";

// Explicit project dirs only: bare globs (services/*) match non-project
// files like READMEs and break the runner. Extension tests use node:test
// (see @duet/extension), not vitest.
export default defineWorkspace(["packages/protocol", "packages/room-core", "packages/sync-engine"]);
