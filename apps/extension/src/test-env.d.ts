// ponytail: tiny node:test/assert declares so tests typecheck with zero deps
// (no @types/node). If a real runner (vitest) lands later, delete this file.
declare module 'node:test' {
  export function test(name: string, fn: (t: unknown) => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };
  export default assert;
}
