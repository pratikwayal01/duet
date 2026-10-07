// Minimal chrome.* surface used by the skeleton. Grows as needed; no @types/chrome dep.
// ponytail: hand-declared instead of @types/chrome (fewer deps, smaller install).
declare namespace chrome {
  namespace runtime {
    interface InstalledDetails {
      reason: string;
    }
    const onInstalled: { addListener(cb: (details: InstalledDetails) => void): void };
    const onMessage: {
      addListener(
        cb: (msg: unknown, sender: unknown, reply: (res?: unknown) => void) => boolean | void,
      ): void;
    };
    function sendMessage(msg: unknown): Promise<unknown>;
    function getManifest(): { version: string };
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
  }
  namespace storage {
    interface StorageArea {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const session: StorageArea;
    const local: StorageArea;
  }
  namespace sidePanel {
    function open(options: { windowId?: number }): Promise<void>;
  }
  namespace permissions {
    function request(perms: { origins?: string[] }): Promise<boolean>;
  }
  namespace action {
    function setIcon(details: { path: Record<number, string> }): Promise<void>;
  }
  namespace tabs {
    interface Tab {
      id?: number;
      title?: string;
      url?: string;
    }
    function create(options: { url: string }): Promise<unknown>;
    function sendMessage(tabId: number, msg: unknown): Promise<unknown>;
    function query(q: object): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
  }
  namespace scripting {
    function executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown[]>;
  }
  namespace management {
    function uninstallSelf(options?: { showConfirmDialog?: boolean }): Promise<void>;
  }
}
