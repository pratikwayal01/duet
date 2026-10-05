// WXT background entry. Real logic lives in ../background/service-worker.ts
// (event-driven, suspendable); the static import runs its listeners.
import '../background/service-worker.ts';

export default defineBackground(() => {});
