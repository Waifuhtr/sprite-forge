// db.js — IndexedDB persistence via Dexie.js.
// Dexie is loaded globally from a CDN <script> tag in index.html (before this
// module runs), so we can reference the `Dexie` global directly here.
//
// Two tables:
//   projects — named snapshots of the whole reactive store (for Save/Load)
//   assets   — every sliced/edited sprite piece, independent of any project,
//              so a user's cropped atlas library persists across projects.

class Database {
  constructor() {
    if (typeof Dexie === "undefined") {
      console.error("Dexie.js failed to load from CDN — persistence is disabled. Check your internet connection.");
      this.db = null;
      return;
    }
    this.db = new Dexie("StardewSpriteForgeDB");
    this.db.version(1).stores({
      projects: "++id, name, updatedAt",
      assets: "id, category, sourceAtlas, name",
    });
  }

  get ready() {
    return !!this.db;
  }

  async saveProject(name, dataSnapshot, existingId = null) {
    if (!this.ready) return null;
    const record = { name, updatedAt: Date.now(), data: dataSnapshot };
    if (existingId) {
      await this.db.projects.update(existingId, record);
      return existingId;
    }
    return this.db.projects.add(record);
  }

  async loadProject(id) {
    if (!this.ready) return null;
    return this.db.projects.get(id);
  }

  async latestProject() {
    if (!this.ready) return null;
    return this.db.projects.orderBy("updatedAt").last();
  }

  async listProjects() {
    if (!this.ready) return [];
    return this.db.projects.orderBy("updatedAt").reverse().toArray();
  }

  async deleteProject(id) {
    if (!this.ready) return;
    return this.db.projects.delete(id);
  }

  async saveAsset(asset) {
    if (!this.ready) return null;
    return this.db.assets.put(asset);
  }

  async saveAssets(assets) {
    if (!this.ready || !assets.length) return null;
    return this.db.assets.bulkPut(assets);
  }

  async getAsset(id) {
    if (!this.ready) return null;
    return this.db.assets.get(id);
  }

  async getAssetsByCategory(category) {
    if (!this.ready) return [];
    return this.db.assets.where("category").equals(category).toArray();
  }

  async listAssets() {
    if (!this.ready) return [];
    return this.db.assets.toArray();
  }

  async deleteAsset(id) {
    if (!this.ready) return;
    return this.db.assets.delete(id);
  }

  async clearAll() {
    if (!this.ready) return;
    await this.db.projects.clear();
    await this.db.assets.clear();
  }
}

export const database = new Database();
