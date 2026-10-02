import { mergeConfig } from "vitest/config";
import base from "./vitest.config";
export default mergeConfig(base, { resolve: { alias: { "@testcontainers/postgresql": "/tmp/claude-0/-home-user-idara-pro/3ce3f887-e8d2-5b08-9bd6-392b1e0d79d4/scratchpad/pg-stub.ts" } }, test: { testTimeout: 60000, hookTimeout: 240000 } });
