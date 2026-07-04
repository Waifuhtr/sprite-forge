// locales.js — All user-facing strings for Stardew Sprite Forge.
// Two supported languages: Turkish (tr, default) and English (en).
// Keep keys identical across both objects; i18n.js will fall back to the
// key path itself if a translation is ever missing.

export const LOCALES = {
  tr: {
    app: {
      title: "Stardew Sprite Forge",
      tagline: "Stardew Valley modları için piksel sanatı atölyesi",
      disclaimer: "Resmi olmayan bir hayran aracıdır; ConcernedApe / Chucklefish ile bağlantılı değildir.",
    },
    nav: {
      character: "Karakter",
      animation: "Animasyon",
      portrait: "Portre",
      object: "Obje & Tile",
      assets: "Varlıklar",
    },
    common: {
      save: "Kaydet", saveProject: "Projeyi Kaydet", loadProject: "Projeyi Yükle",
      newProject: "Yeni Proje", export: "Dışa Aktar", exportZip: "ZIP olarak indir",
      exportPng: "PNG indir", import: "İçe Aktar", reset: "Sıfırla", delete: "Sil",
      rename: "Yeniden Adlandır", cancel: "Vazgeç", confirm: "Onayla", close: "Kapat",
      upload: "Yükle", apply: "Uygula", add: "Ekle", remove: "Kaldır", duplicate: "Çoğalt",
      none: "Yok", loading: "Yükleniyor…", visible: "Görünür", hidden: "Gizli",
      category: "Kategori", name: "İsim", select: "Seç", back: "Geri", ok: "Tamam",
    },
    layers: {
      panelTitle: "Katmanlar", body: "Vücut", shirt: "Gömlek", pants: "Pantolon",
      shoes: "Ayakkabı", hair: "Saç", hat: "Şapka", accessory: "Aksesuar",
      facialHair: "Sakal / Bıyık", glasses: "Gözlük", special: "Özel",
      assignAsset: "Varlık ata…", noAssetAssigned: "Varlık atanmadı",
      opacity: "Opaklık", blendMode: "Karışım Modu", hue: "Ton", saturation: "Doygunluk",
      brightness: "Parlaklık", contrast: "Kontrast", paletteLock: "Palet Kilidi",
      moveUp: "Yukarı Taşı", moveDown: "Aşağı Taşı", dragToReorder: "Sıralamak için sürükle",
      zIndexLabel: "Sıra",
    },
    blend: { normal: "Normal", multiply: "Çarpma", overlay: "Kaplama", screen: "Ekran" },
    anim: {
      panelTitle: "Animasyon", direction: "Yön", down: "Aşağı", up: "Yukarı",
      left: "Sol", right: "Sağ", frames: "Kareler", addFrame: "Kare Ekle",
      duplicateFrame: "Kareyi Çoğalt", removeFrame: "Kareyi Sil", play: "Oynat",
      pause: "Duraklat", fps: "FPS", onionSkin: "Soğan Katmanı (Onion Skin)",
      interpolate: "Ara Kare Oluştur (Tween)", exportSheet: "Sprite Sheet Dışa Aktar",
      emptyFrame: "Bu yönde henüz kare yok.", frameOf: "kare",
    },
    portrait: {
      panelTitle: "Portre Stüdyosu", layers: "Portre Katmanları", background: "Arka Plan",
      skin: "Cilt", faceShape: "Yüz Şekli", eyes: "Gözler", eyebrows: "Kaşlar",
      nose: "Burun", mouth: "Ağız", hairL: "Saç", blush: "Allık", accessories: "Aksesuarlar",
      emotion: "Duygu", neutral: "Nötr", happy: "Mutlu", sad: "Üzgün", angry: "Kızgın",
      surprised: "Şaşkın", blushEmotion: "Kızarmış", sick: "Hasta", lighting: "Işıklandırma",
      lightAngle: "Işık Açısı", lightIntensity: "Işık Yoğunluğu",
      syncToCharacter: "Karakter Editörü ile Eşitle",
      syncHint: "Saç ve şapka seçimleri iki editör arasında paylaşılır.",
    },
    object: {
      panelTitle: "Obje & Tile Editörü", tileSize: "Tile Boyutu", states: "Durumlar",
      addState: "Durum Ekle", stateName: "Durum Adı", transitions: "Geçişler",
      season: "Mevsim", spring: "İlkbahar", summer: "Yaz", fall: "Sonbahar", winter: "Kış",
      autoTile: "Otomatik Tile", autoTileHint: "Komşu tile'lara göre kenarları otomatik hizalar (basit 4 yönlü maske).",
      recolor: "Yeniden Renklendir", createVariant: "Varyant Oluştur",
      placePreview: "Yerleşim Önizlemesi", gridDemo: "Demo Izgara",
      toggleTile: "Izgaradaki hücrelere tıklayarak obje yerleştirin.",
    },
    assets: {
      panelTitle: "Varlık Yönetimi", uploadAtlas: "Atlas Yükle",
      uploadHint: "hats.png, shirts.png gibi büyük atlas dosyalarını buraya sürükleyin ya da seçin.",
      batchImport: "Toplu İçe Aktarım", gridDetection: "Izgara Tespiti",
      detectedGrid: "Tespit edilen ızgara", manualGrid: "Manuel Izgara Girişi",
      cellWidth: "Hücre Genişliği", cellHeight: "Hücre Yüksekliği", autoSlice: "Otomatik Kırp",
      manualRegion: "Manuel Bölge Seç", manualRegionHint: "Atlas üzerinde bir alan seçip sadece o bölgeyi kırpın.",
      gallery: "Galeri", emptyGallery: "Henüz kırpılmış varlık yok. Bir atlas yükleyin.",
      editAsset: "Varlığı Düzenle", resetOriginal: "Orijinale Sıfırla", brush: "Fırça",
      eraser: "Silgi", fill: "Doldur", flipX: "Yatay Çevir", flipY: "Dikey Çevir",
      rotate: "90° Döndür", brushSize: "Fırça Boyutu", color: "Renk", metadata: "Meta Veri",
      anchor: "Bağlantı Noktası", compatibleWith: "Uyumlu Olduğu", zIndex: "Z-Index",
      editHistory: "Düzenleme Geçmişi", edited: "Düzenlendi", original: "Orijinal",
      assignToLayer: "Katmana Ata", category: "Kategori", allCategories: "Tüm Kategoriler",
      atlasSource: "Kaynak Atlas", gridPos: "Izgara Konumu",
      categoryObject: "Obje", categoryTile: "Tile", categoryOther: "Diğer",
      groupCharacter: "Karakter Katmanları", groupPortrait: "Portre Katmanları", groupOther: "Obje / Diğer",
      pickerTitle: "Varlık Seç", noMatches: "Bu kategoride varlık yok.", setAnchor: "Bağlantı Noktası Belirle",
      setAnchorHint: "Aktifken tuval üzerine tıklayın.", chooseFiles: "Dosya Seç",
      atlasQueue: "Atlas Kuyruğu", processAll: "Tümünü Kırp", detectFailed: "Otomatik tespit edilemedi, 16×16 varsayılan kullanıldı.",
    },
    exportPanel: {
      zip: "Tüm Projeyi ZIP indir", currentPng: "Geçerli Görünümü PNG indir",
      includesJson: "ZIP; PNG'leri, sprite sheet'leri ve JSON meta verilerini içerir.",
    },
    messages: {
      projectSaved: "Proje kaydedildi.", projectLoaded: "Proje yüklendi.",
      noSavedProject: "Kayıtlı proje bulunamadı.", exportReady: "Dışa aktarma hazır, indiriliyor…",
      gridDetected: "Izgara tespit edildi", gridNotDetected: "Izgara otomatik tespit edilemedi, lütfen manuel girin.",
      confirmDeleteAsset: "Bu varlığı silmek istediğinize emin misiniz?",
      confirmResetAsset: "Tüm düzenlemeler silinip orijinale dönülsün mü?",
      slicedCount: "parça kırpıldı", selectAtlasFirst: "Önce bir atlas dosyası yükleyin.",
      selectAssetFirst: "Önce galeriden bir varlık seçin.",
      confirmNewProject: "Yeni bir projeye başlamak istediğinize emin misiniz? Kaydedilmemiş değişiklikler kaybolacak.",
      confirmDeleteProject: "Bu kayıtlı projeyi silmek istediğinize emin misiniz?",
      projectDeleted: "Proje silindi.",
    },
  },

  en: {
    app: {
      title: "Stardew Sprite Forge",
      tagline: "A pixel-art workshop for Stardew Valley mods",
      disclaimer: "An unofficial fan tool, not affiliated with ConcernedApe or Chucklefish.",
    },
    nav: {
      character: "Character",
      animation: "Animation",
      portrait: "Portrait",
      object: "Object & Tile",
      assets: "Assets",
    },
    common: {
      save: "Save", saveProject: "Save Project", loadProject: "Load Project",
      newProject: "New Project", export: "Export", exportZip: "Download as ZIP",
      exportPng: "Download PNG", import: "Import", reset: "Reset", delete: "Delete",
      rename: "Rename", cancel: "Cancel", confirm: "Confirm", close: "Close",
      upload: "Upload", apply: "Apply", add: "Add", remove: "Remove", duplicate: "Duplicate",
      none: "None", loading: "Loading…", visible: "Visible", hidden: "Hidden",
      category: "Category", name: "Name", select: "Select", back: "Back", ok: "OK",
    },
    layers: {
      panelTitle: "Layers", body: "Body", shirt: "Shirt", pants: "Pants",
      shoes: "Shoes", hair: "Hair", hat: "Hat", accessory: "Accessory",
      facialHair: "Facial Hair", glasses: "Glasses", special: "Special",
      assignAsset: "Assign asset…", noAssetAssigned: "No asset assigned",
      opacity: "Opacity", blendMode: "Blend Mode", hue: "Hue", saturation: "Saturation",
      brightness: "Brightness", contrast: "Contrast", paletteLock: "Palette Lock",
      moveUp: "Move Up", moveDown: "Move Down", dragToReorder: "Drag to reorder",
      zIndexLabel: "Order",
    },
    blend: { normal: "Normal", multiply: "Multiply", overlay: "Overlay", screen: "Screen" },
    anim: {
      panelTitle: "Animation", direction: "Direction", down: "Down", up: "Up",
      left: "Left", right: "Right", frames: "Frames", addFrame: "Add Frame",
      duplicateFrame: "Duplicate Frame", removeFrame: "Remove Frame", play: "Play",
      pause: "Pause", fps: "FPS", onionSkin: "Onion Skinning",
      interpolate: "Interpolate (Tween)", exportSheet: "Export Sprite Sheet",
      emptyFrame: "No frames on this direction yet.", frameOf: "frame",
    },
    portrait: {
      panelTitle: "Portrait Studio", layers: "Portrait Layers", background: "Background",
      skin: "Skin", faceShape: "Face Shape", eyes: "Eyes", eyebrows: "Eyebrows",
      nose: "Nose", mouth: "Mouth", hairL: "Hair", blush: "Blush", accessories: "Accessories",
      emotion: "Emotion", neutral: "Neutral", happy: "Happy", sad: "Sad", angry: "Angry",
      surprised: "Surprised", blushEmotion: "Blushing", sick: "Sick", lighting: "Lighting",
      lightAngle: "Light Angle", lightIntensity: "Light Intensity",
      syncToCharacter: "Sync with Character Editor",
      syncHint: "Hair and hat choices are shared between both editors.",
    },
    object: {
      panelTitle: "Object & Tile Editor", tileSize: "Tile Size", states: "States",
      addState: "Add State", stateName: "State Name", transitions: "Transitions",
      season: "Season", spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter",
      autoTile: "Auto-Tile", autoTileHint: "Automatically matches edges based on neighboring tiles (simple 4-direction mask).",
      recolor: "Recolor", createVariant: "Create Variant",
      placePreview: "Placement Preview", gridDemo: "Demo Grid",
      toggleTile: "Click cells on the grid to place the object.",
    },
    assets: {
      panelTitle: "Asset Management", uploadAtlas: "Upload Atlas",
      uploadHint: "Drop or select large atlas files like hats.png or shirts.png here.",
      batchImport: "Batch Import", gridDetection: "Grid Detection",
      detectedGrid: "Detected grid", manualGrid: "Manual Grid Entry",
      cellWidth: "Cell Width", cellHeight: "Cell Height", autoSlice: "Auto-Slice",
      manualRegion: "Manual Region Select", manualRegionHint: "Select an area on the atlas to crop just that region.",
      gallery: "Gallery", emptyGallery: "No sliced assets yet. Upload an atlas.",
      editAsset: "Edit Asset", resetOriginal: "Reset to Original", brush: "Brush",
      eraser: "Eraser", fill: "Fill", flipX: "Flip X", flipY: "Flip Y",
      rotate: "Rotate 90°", brushSize: "Brush Size", color: "Color", metadata: "Metadata",
      anchor: "Anchor Point", compatibleWith: "Compatible With", zIndex: "Z-Index",
      editHistory: "Edit History", edited: "Edited", original: "Original",
      assignToLayer: "Assign to Layer", category: "Category", allCategories: "All Categories",
      atlasSource: "Source Atlas", gridPos: "Grid Position",
      categoryObject: "Object", categoryTile: "Tile", categoryOther: "Other",
      groupCharacter: "Character Layers", groupPortrait: "Portrait Layers", groupOther: "Object / Other",
      pickerTitle: "Choose Asset", noMatches: "No assets in this category yet.", setAnchor: "Set Anchor Point",
      setAnchorHint: "Click on the canvas while active.", chooseFiles: "Choose Files",
      atlasQueue: "Atlas Queue", processAll: "Slice All", detectFailed: "Auto-detect failed, defaulted to 16×16.",
    },
    exportPanel: {
      zip: "Download Full Project as ZIP", currentPng: "Download Current View as PNG",
      includesJson: "The ZIP includes PNGs, sprite sheets, and JSON metadata.",
    },
    messages: {
      projectSaved: "Project saved.", projectLoaded: "Project loaded.",
      noSavedProject: "No saved project found.", exportReady: "Export ready, downloading…",
      gridDetected: "Grid detected", gridNotDetected: "Could not auto-detect grid, please enter manually.",
      confirmDeleteAsset: "Are you sure you want to delete this asset?",
      confirmResetAsset: "Discard all edits and revert to the original?",
      slicedCount: "pieces sliced", selectAtlasFirst: "Upload an atlas file first.",
      selectAssetFirst: "Select an asset from the gallery first.",
      confirmNewProject: "Start a new project? Unsaved changes will be lost.",
      confirmDeleteProject: "Delete this saved project?",
      projectDeleted: "Project deleted.",
    },
  },
};

export const CHARACTER_LAYER_KEYS = [
  "body", "pants", "shoes", "shirt", "hair", "facialHair", "glasses", "accessory", "hat", "special",
];

export const PORTRAIT_LAYER_KEYS = [
  "background", "skin", "faceShape", "blush", "eyes", "eyebrows", "nose", "mouth", "hairL", "accessories",
];

export const CHARACTER_LAYER_Z_DEFAULTS = {
  body: 10, pants: 20, shoes: 30, shirt: 40, hair: 50,
  facialHair: 60, glasses: 70, accessory: 80, hat: 90, special: 100,
};

export const PORTRAIT_LAYER_Z_DEFAULTS = {
  background: 10, skin: 20, faceShape: 30, blush: 40, eyes: 50,
  eyebrows: 60, nose: 70, mouth: 80, hairL: 90, accessories: 100,
};

export const DIRECTIONS = ["down", "up", "left", "right"];
export const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised", "blushEmotion", "sick"];
export const SEASONS = ["spring", "summer", "fall", "winter"];
export const BLEND_MODES = ["normal", "multiply", "overlay", "screen"];
