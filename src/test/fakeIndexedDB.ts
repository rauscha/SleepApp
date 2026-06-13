// Minimal in-memory IndexedDB mock for the small surface src/storage/assets.ts
// touches. jsdom ships no IndexedDB, and rather than pull in the (heavy)
// fake-indexeddb package we model exactly what the storage layer uses — and,
// crucially, the one behaviour the H2 fix turns on: a request whose
// onsuccess fires before the transaction commits, with the commit then
// aborting (the QuotaExceededError shape).
//
// Install with installFakeIndexedDB(); each instance is independent so a
// test can start from an empty database.

type Handler = ((ev?: unknown) => void) | null;

interface Row {
  id: string;
  [k: string]: unknown;
}

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
}

class FakeTransaction {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  error: DOMException | null = null;
  aborted = false;
  private completed = false;
  private pending = 0;

  constructor(public db: FakeDB) {}

  objectStore(name: string): FakeObjectStore {
    const store = this.db.stores.get(name);
    if (!store) throw new DOMException(`No object store "${name}"`, 'NotFoundError');
    return new FakeObjectStore(store, this, name);
  }

  registerRequest(): void {
    this.pending++;
  }

  settleRequest(): void {
    this.pending--;
    // A real transaction commits once it has no outstanding requests and
    // control returns to the event loop. Defer a microtask so any request
    // callback that enqueues another request keeps the tx open.
    queueMicrotask(() => {
      if (this.aborted || this.completed) return;
      if (this.pending === 0) {
        this.completed = true;
        this.oncomplete?.();
      }
    });
  }

  abort(error: DOMException): void {
    if (this.aborted || this.completed) return;
    this.aborted = true;
    this.error = error;
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeObjectStore {
  constructor(
    private readonly data: Map<string, Row>,
    private readonly tx: FakeTransaction,
    private readonly name: string
  ) {}

  put(value: Row): FakeRequest<IDBValidKey> {
    const req = new FakeRequest<IDBValidKey>();
    this.tx.registerRequest();
    queueMicrotask(() => {
      if (this.tx.aborted) return;
      if (this.tx.db.abortWritesFor.has(this.name)) {
        // The request itself "succeeds" — its onsuccess fires — but the
        // transaction then aborts (e.g. QuotaExceededError on commit). This
        // is exactly the window the old code resolved into, losing the write
        // while reporting success (bug H2).
        req.result = value.id;
        req.onsuccess?.();
        this.tx.abort(
          new DOMException('Simulated quota abort', 'QuotaExceededError')
        );
        return;
      }
      this.data.set(value.id, value);
      req.result = value.id;
      req.onsuccess?.();
      this.tx.settleRequest();
    });
    return req;
  }

  get(id: string): FakeRequest<Row | undefined> {
    const req = new FakeRequest<Row | undefined>();
    this.tx.registerRequest();
    queueMicrotask(() => {
      if (this.tx.aborted) return;
      req.result = this.data.get(id);
      req.onsuccess?.();
      this.tx.settleRequest();
    });
    return req;
  }

  getAll(): FakeRequest<Row[]> {
    const req = new FakeRequest<Row[]>();
    this.tx.registerRequest();
    queueMicrotask(() => {
      if (this.tx.aborted) return;
      req.result = Array.from(this.data.values());
      req.onsuccess?.();
      this.tx.settleRequest();
    });
    return req;
  }

  delete(id: string): FakeRequest<undefined> {
    const req = new FakeRequest<undefined>();
    this.tx.registerRequest();
    queueMicrotask(() => {
      if (this.tx.aborted) return;
      this.data.delete(id);
      req.result = undefined;
      req.onsuccess?.();
      this.tx.settleRequest();
    });
    return req;
  }
}

class FakeDB {
  readonly stores = new Map<string, Map<string, Row>>();
  /** Store names whose next write should succeed-then-abort the tx. */
  readonly abortWritesFor = new Set<string>();
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string): unknown {
    this.stores.set(name, new Map());
    return {};
  }

  transaction(_names: string | string[], _mode?: string): FakeTransaction {
    return new FakeTransaction(this);
  }

  close(): void {
    /* noop */
  }
}

export interface FakeIndexedDBHandle {
  db: FakeDB;
  /** Make the next write to `storeName` commit-abort after onsuccess. */
  abortWritesFor: (storeName: string) => void;
  restore: () => void;
}

/**
 * Install a fresh in-memory IndexedDB on globalThis. Returns a handle whose
 * `db` is the backing store (inspectable in assertions) plus a `restore()`.
 */
export function installFakeIndexedDB(): FakeIndexedDBHandle {
  const db = new FakeDB();
  const g = globalThis as unknown as { indexedDB?: unknown };
  const prior = g.indexedDB;

  const factory = {
    open(_name: string, _version?: number): FakeRequest<FakeDB> {
      const req = new FakeRequest<FakeDB>();
      req.result = db;
      queueMicrotask(() => {
        // Fire upgrade once so the store-creation path in openDb runs, then
        // success. (The same db instance persists across opens, so a second
        // open with the stores already present is a no-op upgrade.)
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };

  g.indexedDB = factory;
  return {
    db,
    abortWritesFor: (storeName: string) => db.abortWritesFor.add(storeName),
    restore: () => {
      g.indexedDB = prior;
    },
  };
}
