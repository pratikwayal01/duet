// WXT background entry: re-export keeps the service worker module tiny.
// Real logic lives in src/background/service-worker.ts (event-driven, suspendable).
export * from '../src/background/service-worker.ts';
