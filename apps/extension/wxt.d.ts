// ponytail: minimal 'wxt' stub so `tsc --noEmit` passes without installing WXT.
// Full WXT types apply at build time (`wxt build`).
declare module 'wxt' {
  export function defineConfig<T extends Record<string, unknown>>(config: T): T;
}

// WXT auto-imports these inside entrypoints at build time.
declare function defineBackground(main: () => void): unknown;
declare function defineContentScript(opts: { matches: string[]; main: () => void }): unknown;
