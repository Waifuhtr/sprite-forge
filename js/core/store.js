// store.js — Vanilla JS Proxy-based reactive store.
//
// Any read/write goes through `store.state`, which is a nested Proxy over a
// plain object. Mutating anything under a top-level key (e.g.
// `store.state.characterLayers.body.hue = 10`) triggers listeners registered
// for that top-level key via `store.subscribe('characterLayers', fn)`.
// This keeps every module decoupled: nobody imports another module's DOM,
// they just read/write shared state and react to notifications.

function wrapDeep(value, notify, topKey) {
  if (value === null || typeof value !== "object") return value;
  return new Proxy(value, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (val && typeof val === "object" && typeof prop !== "symbol") {
        return wrapDeep(val, notify, topKey);
      }
      return val;
    },
    set(target, prop, val) {
      const ok = Reflect.set(target, prop, val);
      notify(topKey);
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      notify(topKey);
      return ok;
    },
  });
}

function wrapRoot(rawState, notify) {
  return new Proxy(rawState, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (val && typeof val === "object" && typeof prop !== "symbol") {
        return wrapDeep(val, notify, prop);
      }
      return val;
    },
    set(target, prop, val) {
      const ok = Reflect.set(target, prop, val);
      notify(prop);
      return ok;
    },
    deleteProperty(target, prop) {
      const ok = Reflect.deleteProperty(target, prop);
      notify(prop);
      return ok;
    },
  });
}

const initialState = () => ({
  ui: { activeTab: "character", statusMessage: "", statusTone: "info" },
  project: { id: null, name: "Untitled Farmer", updatedAt: null },
  characterLayers: {},
  animation: {},
  portrait: { layers: {}, emotion: "neutral", lighting: { angle: 45, intensity: 40 }, syncHairHat: true },
  object: { tileSize: 16, objects: {}, activeObjectId: null },
  assets: {},
});

class Store {
  constructor() {
    this._listeners = new Map();
    this._globalListeners = new Set();
    this._raw = initialState();
    this._notify = (topKey) => {
      (this._listeners.get(topKey) || new Set()).forEach((fn) => fn(this._raw[topKey]));
      this._globalListeners.forEach((fn) => fn(topKey, this._raw[topKey]));
    };
    this.state = wrapRoot(this._raw, this._notify);
  }

  subscribe(topKey, fn) {
    if (!this._listeners.has(topKey)) this._listeners.set(topKey, new Set());
    this._listeners.get(topKey).add(fn);
    return () => this._listeners.get(topKey).delete(fn);
  }

  subscribeAny(fn) {
    this._globalListeners.add(fn);
    return () => this._globalListeners.delete(fn);
  }

  /** Replace the whole tree (used when loading a saved project) and notify
   *  everyone. `assets` is intentionally preserved across this call — the
   *  asset library is a persistent, cross-project resource (see db.js), not
   *  part of any single project's saved data. */
  replaceState(partial) {
    const preservedAssets = this._raw.assets;
    this._raw = { ...initialState(), ...partial, assets: preservedAssets };
    this.state = wrapRoot(this._raw, this._notify);
    Object.keys(this._raw).forEach((key) => this._notify(key));
  }

  /** Plain-object snapshot safe to JSON.stringify / persist to IndexedDB as a
   *  named "project". Excludes `assets` on purpose — the sliced/edited asset
   *  library already persists independently in its own IndexedDB table, so
   *  baking a full copy into every project save would just duplicate data
   *  and let loading an old project roll back the whole shared library. */
  snapshot() {
    const { assets, ...rest } = this._raw;
    return JSON.parse(JSON.stringify(rest));
  }

  setStatus(message, tone = "info") {
    this.state.ui.statusMessage = message;
    this.state.ui.statusTone = tone;
  }
}

export const store = new Store();
