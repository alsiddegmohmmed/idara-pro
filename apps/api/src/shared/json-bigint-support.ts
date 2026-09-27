// BigInt has no native JSON representation — JSON.stringify throws "Do not
// know how to serialize a BigInt" on any bigint value (money fields,
// AGENTS.md §3 rule 3). JSON.stringify calls .toJSON() when present, so this
// fixes every call site (HTTP responses, toAuditSnapshot) at once. Imported
// for its side effect at the top of app.module.ts so it runs before any
// serialization, on every entry point (main.ts and every *.e2e.test.ts that
// bootstraps AppModule directly).
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (this: bigint): string {
  return this.toString();
};

export {};
