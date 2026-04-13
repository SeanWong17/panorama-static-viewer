const FACE_ORDER = ['right', 'left', 'up', 'down', 'front', 'back'];
const LANGUAGE_STORAGE_KEY = 'open-panorama-language';
const HOTSPOT_LABEL_VISIBILITY_STORAGE_KEY = 'open-panorama-hotspot-label-visible';
const TV_SIZE_PRESETS = {
  55: { width: 121.8, height: 68.5, diagonal: 139.7 },
  65: { width: 143.9, height: 80.9, diagonal: 165.1 },
  75: { width: 166.0, height: 93.4, diagonal: 190.5 },
  85: { width: 188.2, height: 105.8, diagonal: 215.9 },
  98: { width: 216.9, height: 122.0, diagonal: 248.9 },
  100: { width: 221.4, height: 124.5, diagonal: 254.0 },
};
const TV_CANVAS_SIZE = { width: 1280, height: 720 };
const TV_PLACEHOLDER_TEXT = {
  en: 'Load a video to preview playback on the TV wall.',
  'zh-CN': '加载视频后即可预览电视在墙面的播放效果。',
};
const BUILTIN_UI_MESSAGES = {
  en: {
    pageTitle: '{name} | Open Panorama Viewer',
    brand: 'Open Panorama',
    sectionScenes: 'Scenes',
    sectionUsage: 'Usage',
    usageDrag: 'Drag: rotate view',
    usageWheel: 'Wheel: zoom',
    usageReset: 'Double click: reset',
    usageIdle: 'Idle: slow auto-rotate',
    scenesButton: 'Scenes',
    planButton: 'Plan',
    hidePlanButton: 'Hide Plan',
    hideHudButton: 'Hide View',
    showHudButton: 'Show View',
    planTitle: 'Floor Plan',
    expand: 'Expand',
    collapse: 'Collapse',
    singleView: 'Single view',
    viewIndex: 'View {index}',
    groupedView: '{title} / View {index}',
    roomGroupSingle: '1 view',
    roomGroupMultiple: '{count} views',
    sceneMeta: 'Scene {index}/{total} | {label}',
    sceneCount: '{count} scenes',
    summaryOffline: 'offline package',
    summaryPlan: 'plan cached',
    tvOverlayTitle: 'TV Overlay',
    tvOverlayCaption: 'Scene 3 wall-mapped preview',
    tvVideoFileLabel: 'Local video',
    tvAdjustLabel: 'Position adjust',
    tvAdjustReset: 'Reset',
    tvSizeLabel: '{size}"',
    tvMetaIdle: 'Screen center ({x}, {y}) | offset ({offsetX}, {offsetY}) px | {width} x {height} cm',
    tvMetaPlaying: '{size}" | {width} x {height} cm | center ({x}, {y}) | offset ({offsetX}, {offsetY}) px',
  },
  'zh-CN': {
    pageTitle: '{name} | Open Panorama Viewer',
    brand: 'Open Panorama',
    sectionScenes: '场景',
    sectionUsage: '使用方式',
    usageDrag: '拖动：旋转视角',
    usageWheel: '滚轮：缩放',
    usageReset: '双击：重置视角',
    usageIdle: '静止：缓慢自动旋转',
    scenesButton: '场景',
    planButton: '户型图',
    hidePlanButton: '隐藏户型图',
    hideHudButton: '隐藏视角',
    showHudButton: '显示视角',
    planTitle: '户型导航',
    expand: '展开',
    collapse: '收起',
    singleView: '单视角',
    viewIndex: '视角 {index}',
    groupedView: '{title} / 视角 {index}',
    roomGroupSingle: '1 个视角',
    roomGroupMultiple: '{count} 个视角',
    sceneMeta: '场景 {index}/{total} | {label}',
    sceneCount: '{count} 个场景',
    summaryOffline: '离线包',
    summaryPlan: '已缓存户型图',
    tvOverlayTitle: '电视映射',
    tvOverlayCaption: '场景 3 电视墙尺寸预览',
    tvVideoFileLabel: '本地视频',
    tvAdjustLabel: '位置微调',
    tvAdjustReset: '重置',
    tvSizeLabel: '{size} 英寸',
    tvMetaIdle: '屏幕中心 ({x}, {y}) | 偏移 ({offsetX}, {offsetY}) px | {width} x {height} cm',
    tvMetaPlaying: '{size} 英寸 | {width} x {height} cm | 屏幕中心 ({x}, {y}) | 偏移 ({offsetX}, {offsetY}) px',
  },
};
const LANGUAGE_LABELS = {
  en: 'EN',
  'zh-CN': '中文',
};

function normalizeYaw(value) {
  let yaw = Number(value) || 0;
  while (yaw <= -180) yaw += 360;
  while (yaw > 180) yaw -= 360;
  return yaw;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLanguage(language) {
  if (!language) {
    return '';
  }
  const value = String(language).trim();
  if (!value) {
    return '';
  }

  const lowered = value.toLowerCase();
  if (lowered === 'zh' || lowered === 'zh-cn') {
    return 'zh-CN';
  }
  if (lowered === 'en' || lowered === 'en-us' || lowered === 'en-gb') {
    return 'en';
  }
  return value;
}

function formatMessage(template, variables = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(variables[key] ?? ''));
}

function parseViewVector(yawDeg, pitchDeg) {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = Math.cos(pitch) * Math.cos(yaw);
  return new THREE.Vector3(x, y, z);
}

function getTvPresetSize(size) {
  return TV_SIZE_PRESETS[String(size)] || TV_SIZE_PRESETS[size] || null;
}

function buildTvSizeList(sceneConfig) {
  const configured = Array.isArray(sceneConfig?.sizes) && sceneConfig.sizes.length
    ? sceneConfig.sizes
    : Object.keys(TV_SIZE_PRESETS).map((value) => Number(value));

  return configured
    .map((value) => Number(value))
    .filter((value, index, list) => Number.isFinite(value) && list.indexOf(value) === index && getTvPresetSize(value));
}

function formatTvDimension(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '');
}

function facePixelToLocalPosition(face, x, y, imageWidth, imageHeight, radius) {
  const u = (x / imageWidth) * 2 - 1;
  const v = 1 - (y / imageHeight) * 2;

  switch (face) {
    case 'front':
      return new THREE.Vector3(-u * radius, v * radius, radius);
    case 'back':
      return new THREE.Vector3(u * radius, v * radius, -radius);
    case 'right':
      return new THREE.Vector3(radius, v * radius, u * radius);
    case 'left':
      return new THREE.Vector3(-radius, v * radius, -u * radius);
    case 'up':
      return new THREE.Vector3(-u * radius, radius, -v * radius);
    case 'down':
      return new THREE.Vector3(-u * radius, -radius, v * radius);
    default:
      return new THREE.Vector3(-u * radius, v * radius, radius);
  }
}

function getFaceInwardNormal(face) {
  const normals = {
    front: new THREE.Vector3(0, 0, -1),
    back: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(-1, 0, 0),
    left: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, -1, 0),
    down: new THREE.Vector3(0, 1, 0),
  };
  return (normals[face] || normals.front).clone();
}

function getFaceInwardQuaternion(face) {
  const eulerMap = {
    front: new THREE.Euler(0, Math.PI, 0),
    back: new THREE.Euler(0, 0, 0),
    right: new THREE.Euler(0, -Math.PI / 2, 0),
    left: new THREE.Euler(0, Math.PI / 2, 0),
    up: new THREE.Euler(Math.PI / 2, 0, 0),
    down: new THREE.Euler(-Math.PI / 2, 0, 0),
  };
  return new THREE.Quaternion().setFromEuler(eulerMap[face] || eulerMap.front);
}

function getRoomKey(scene) {
  return `${scene.roomIndex || scene.title || scene.id}`;
}

function buildRoomGroups(scenes) {
  const groups = [];
  const groupMap = new Map();
  for (const scene of scenes) {
    const key = getRoomKey(scene);
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        roomIndex: scene.roomIndex || null,
        scenes: [],
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.scenes.push(scene);
  }
  return groups;
}

async function loadManifest() {
  const response = await fetch('manifest.json');
  if (!response.ok) {
    throw new Error(`manifest.json load failed: ${response.status}`);
  }
  return response.json();
}

function pickLocalizedText(value, language, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const normalizedLanguage = normalizeLanguage(language);
  const candidates = [
    normalizedLanguage,
    normalizedLanguage.split('-')[0],
    normalizedLanguage === 'zh-CN' ? 'zh' : '',
    normalizedLanguage === 'en' ? 'en-US' : '',
    'en',
    'zh-CN',
    'zh',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof value[candidate] === 'string' && value[candidate]) {
      return value[candidate];
    }
  }

  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return fallback;
}

function getSceneMetaLabel(scene, language) {
  return pickLocalizedText(scene.metaLabelI18n, language, scene.metaLabel || scene.obsPicId || scene.id);
}

function getSupportedLanguages(manifest) {
  const configured = manifest.i18n?.supportedLanguages || manifest.i18n?.languages;
  const values = Array.isArray(configured) && configured.length ? configured : ['en'];
  const normalized = [];

  for (const value of values) {
    const language = normalizeLanguage(value);
    if (language && !normalized.includes(language)) {
      normalized.push(language);
    }
  }

  return normalized.length ? normalized : ['en'];
}

function resolveInitialLanguage(manifest, supportedLanguages) {
  const queryLanguage = new URLSearchParams(window.location.search).get('lang');
  const storageLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const configuredDefault = manifest.i18n?.defaultLanguage;
  const browserLanguages = Array.isArray(window.navigator.languages)
    ? window.navigator.languages
    : [window.navigator.language];
  const candidates = [
    queryLanguage,
    storageLanguage,
    configuredDefault,
    ...browserLanguages,
    'en',
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (supportedLanguages.includes(normalized)) {
      return normalized;
    }
  }

  return supportedLanguages[0];
}

class OfflineViewer {
  constructor(manifest) {
    this.manifest = manifest;
    this.sceneMap = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
    this.roomGroups = buildRoomGroups(manifest.scenes);
    this.roomLookup = new Map();
    this.sceneOrder = new Map(manifest.scenes.map((scene, index) => [scene.id, index + 1]));
    for (const group of this.roomGroups) {
      for (const scene of group.scenes) {
        this.roomLookup.set(scene.id, group);
      }
    }

    this.supportedLanguages = getSupportedLanguages(manifest);
    this.language = resolveInitialLanguage(manifest, this.supportedLanguages);
    this.sceneLabels = new Map();
    this.sceneViewMeta = new Map();

    this.brand = document.getElementById('brand');
    this.sceneTitle = document.getElementById('scene-title');
    this.sceneMeta = document.getElementById('scene-meta');
    this.summary = document.getElementById('summary');
    this.sceneList = document.getElementById('scene-list');
    this.sceneListTitle = document.getElementById('scene-list-title');
    this.usageTitle = document.getElementById('usage-title');
    this.usageDrag = document.getElementById('usage-drag');
    this.usageWheel = document.getElementById('usage-wheel');
    this.usageReset = document.getElementById('usage-reset');
    this.usageIdle = document.getElementById('usage-idle');
    this.hotspotsLayer = document.getElementById('hotspots');
    this.viewerEl = document.getElementById('viewer');
    this.sidebar = document.getElementById('sidebar');
    this.toggleSidebar = document.getElementById('toggle-sidebar');
    this.togglePlan = document.getElementById('toggle-plan');
    this.toggleHud = document.getElementById('toggle-hud');
    this.toggleLanguage = document.getElementById('toggle-language');
    this.togglePlanPanel = document.getElementById('toggle-plan-panel');
    this.planPanel = document.getElementById('plan-panel');
    this.planTitle = document.getElementById('plan-title');
    this.planCaption = document.getElementById('plan-caption');
    this.planStage = document.getElementById('plan-stage');
    this.planImage = document.getElementById('plan-image');
    this.planSpotsLayer = document.getElementById('plan-spots');
    this.tvOverlayPanel = document.getElementById('tv-overlay-panel');
    this.tvOverlayTitle = document.getElementById('tv-overlay-title');
    this.tvOverlayCaption = document.getElementById('tv-overlay-caption');
    this.tvSizeToolbar = document.getElementById('tv-size-toolbar');
    this.tvVideoFileLabel = document.getElementById('tv-video-file-label');
    this.tvVideoFileInput = document.getElementById('tv-video-file');
    this.tvAdjustLabel = document.getElementById('tv-adjust-label');
    this.tvAdjustUpButton = document.getElementById('tv-adjust-up');
    this.tvAdjustLeftButton = document.getElementById('tv-adjust-left');
    this.tvAdjustResetButton = document.getElementById('tv-adjust-reset');
    this.tvAdjustRightButton = document.getElementById('tv-adjust-right');
    this.tvAdjustDownButton = document.getElementById('tv-adjust-down');
    this.tvOverlayMeta = document.getElementById('tv-overlay-meta');

    this.width = this.viewerEl.clientWidth || 1;
    this.height = this.viewerEl.clientHeight || 1;
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 75;
    this.dragging = false;
    this.pointerStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
    this.hotspotButtons = [];
    this.planButtons = [];
    this.currentScene = null;
    this.hotspotVectors = [];
    this.currentTextureKey = null;
    this.needsRender = true;
    this.lastFrameTime = 0;
    this.lastInteractionAt = performance.now();
    this.idleRotateDelay = 4500;
    this.idleRotateSpeed = 2.4;
    this.hotspotLabelVisible = window.localStorage.getItem(HOTSPOT_LABEL_VISIBILITY_STORAGE_KEY) !== '0';
    this.plan = this.normalizePlan(manifest.plan);
    this.tvOverlayConfig = this.normalizeTvOverlayConfig(manifest.tvOverlay);
    this.tvSizeButtons = [];
    this.tvOverlayState = {
      sceneConfig: null,
      selectedSize: null,
      frameMesh: null,
      screenMesh: null,
      frameMaterial: null,
      screenMaterial: null,
      texture: null,
      videoTexture: null,
      canvas: null,
      context: null,
      video: null,
      rafId: 0,
      videoFrameRequestId: 0,
      objectUrl: null,
      offsetPx: { x: 0, y: 0 },
    };

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.viewerEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, this.width / this.height, 1, 11000);

    this.buildTvOverlayPanel();

    this.bindEvents();
    this.setLanguage(this.language, { persist: false });
    this.loadScene(manifest.startScene || manifest.scenes[0].id);
    this.animate();
  }

  t(key, variables = {}) {
    const bundle = BUILTIN_UI_MESSAGES[this.language] || BUILTIN_UI_MESSAGES.en;
    const template = bundle[key] || BUILTIN_UI_MESSAGES.en[key] || key;
    return formatMessage(template, variables);
  }

  getLanguageLabel(language) {
    return LANGUAGE_LABELS[language] || String(language).toUpperCase();
  }

  updateHudToggleLabel() {
    if (!this.toggleHud) {
      return;
    }
    this.toggleHud.textContent = this.hotspotLabelVisible ? this.t('hideHudButton') : this.t('showHudButton');
  }

  setHudVisible(visible, { persist = true } = {}) {
    this.hotspotLabelVisible = Boolean(visible);
    if (persist) {
      window.localStorage.setItem(HOTSPOT_LABEL_VISIBILITY_STORAGE_KEY, this.hotspotLabelVisible ? '1' : '0');
    }
    if (this.hotspotsLayer) {
      this.hotspotsLayer.classList.toggle('labels-hidden', !this.hotspotLabelVisible);
    }
    for (const entry of this.hotspotButtons) {
      if (this.hotspotLabelVisible) {
        entry.element.title = entry.hotspot.targetDisplayTitle;
      } else {
        entry.element.removeAttribute('title');
      }
    }
    this.updateHudToggleLabel();
    this.rebuildHotspots();
  }

  getNextLanguage() {
    const currentIndex = this.supportedLanguages.indexOf(this.language);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % this.supportedLanguages.length : 0;
    return this.supportedLanguages[nextIndex];
  }

  getDesignName() {
    return pickLocalizedText(
      this.manifest.designNameI18n,
      this.language,
      this.manifest.designName || 'Open Panorama',
    );
  }

  getSceneTitle(scene) {
    return pickLocalizedText(scene.titleI18n, this.language, scene.title || scene.id);
  }

  getGroupTitle(group) {
    return this.getSceneTitle(group.scenes[0]);
  }

  getPlanSpotLabel(spot) {
    const targetScene = this.sceneMap.get(spot.sceneId);
    return pickLocalizedText(
      spot.labelI18n,
      this.language,
      targetScene ? this.getSceneTitle(targetScene) : spot.label || spot.sceneId,
    );
  }

  rebuildLanguageCaches() {
    this.sceneLabels = new Map();
    this.sceneViewMeta = new Map();

    for (const group of this.roomGroups) {
      const groupTitle = this.getGroupTitle(group);
      group.scenes.forEach((scene, index) => {
        const sceneLabel = group.scenes.length > 1
          ? this.t('groupedView', { title: groupTitle, index: index + 1 })
          : groupTitle;
        const sceneViewMeta = group.scenes.length > 1
          ? this.t('viewIndex', { index: index + 1 })
          : this.t('singleView');

        this.sceneLabels.set(scene.id, sceneLabel);
        this.sceneViewMeta.set(scene.id, sceneViewMeta);
      });
    }
  }

  setLanguage(language, { persist = true } = {}) {
    const normalized = normalizeLanguage(language);
    const resolved = this.supportedLanguages.includes(normalized)
      ? normalized
      : this.supportedLanguages[0];

    this.language = resolved;
    this.rebuildLanguageCaches();

    if (persist) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
    }

    document.documentElement.lang = resolved;
    document.title = this.t('pageTitle', { name: this.getDesignName() });

    this.brand.textContent = this.t('brand');
    this.sceneListTitle.textContent = this.t('sectionScenes');
    this.usageTitle.textContent = this.t('sectionUsage');
    this.usageDrag.textContent = this.t('usageDrag');
    this.usageWheel.textContent = this.t('usageWheel');
    this.usageReset.textContent = this.t('usageReset');
    this.usageIdle.textContent = this.t('usageIdle');
    this.toggleSidebar.textContent = this.t('scenesButton');
    this.planTitle.textContent = this.t('planTitle');
    this.planImage.alt = this.t('planTitle');
    this.updateHudToggleLabel();
    const nextLanguage = this.getNextLanguage();
    this.toggleLanguage.textContent = this.getLanguageLabel(nextLanguage);
    this.toggleLanguage.title = `Switch language (${this.getLanguageLabel(nextLanguage)})`;
    this.toggleLanguage.style.display = this.supportedLanguages.length > 1 ? 'inline-flex' : 'none';

    this.updateSummary();
    this.buildSceneList();
    this.buildPlan();
    this.refreshCurrentSceneText();
    this.refreshSceneListState();
    this.refreshPlanState();
    this.rebuildHotspots();
    this.updateTvOverlayUi();
    this.drawTvFrame();
    this.setHudVisible(this.hotspotLabelVisible, { persist: false });
    this.requestRender();
  }

  updateSummary() {
    const summaryBits = [
      this.getDesignName(),
      this.t('sceneCount', { count: this.manifest.scenes.length }),
      this.t('summaryOffline'),
    ];
    if (this.plan) {
      summaryBits.push(this.t('summaryPlan'));
    }
    this.summary.textContent = summaryBits.join(' | ');
  }

  normalizePlan(plan) {
    if (!plan || !plan.image || !Array.isArray(plan.spots) || !plan.spots.length) {
      return null;
    }

    const width = Math.max(1, Number(plan.canvas?.width) || 180);
    const height = Math.max(1, Number(plan.canvas?.height) || 180);
    const imageRect = {
      x: Number(plan.imageRect?.x ?? 10),
      y: Number(plan.imageRect?.y ?? 10),
      width: Number(plan.imageRect?.width ?? width - 20),
      height: Number(plan.imageRect?.height ?? height - 20),
    };

    return {
      image: plan.image,
      canvas: { width, height },
      imageRect,
      spots: plan.spots.filter((spot) => this.sceneMap.has(spot.sceneId)),
    };
  }

  normalizeTvOverlayConfig(config) {
    if (!config || !config.scenes || typeof config.scenes !== 'object') {
      return null;
    }

    const normalizedScenes = {};
    for (const [sceneId, sceneConfig] of Object.entries(config.scenes)) {
      if (!this.sceneMap.has(sceneId) || !sceneConfig) {
        continue;
      }

      const face = String(sceneConfig.face || 'front');
      const imageWidth = Math.max(1, Number(sceneConfig.imageSize?.width) || 1500);
      const imageHeight = Math.max(1, Number(sceneConfig.imageSize?.height) || 1500);
      const centerX = Number(sceneConfig.center?.x);
      const centerY = Number(sceneConfig.center?.y);
      const mmPerPixelX = Number(sceneConfig.mmPerPixel?.x);
      const mmPerPixelY = Number(sceneConfig.mmPerPixel?.y);
      const sizes = buildTvSizeList(sceneConfig);

      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(mmPerPixelX) || !Number.isFinite(mmPerPixelY) || !sizes.length) {
        continue;
      }

      normalizedScenes[sceneId] = {
        face,
        imageWidth,
        imageHeight,
        center: { x: centerX, y: centerY },
        bounds: {
          left: Number(sceneConfig.bounds?.left),
          right: Number(sceneConfig.bounds?.right),
          top: Number(sceneConfig.bounds?.top),
          bottom: Number(sceneConfig.bounds?.bottom),
        },
        mmPerPixel: { x: mmPerPixelX, y: mmPerPixelY },
        borderPx: Math.max(0, Number(sceneConfig.borderPx) || 0),
        defaultSize: sizes.includes(Number(sceneConfig.defaultSize)) ? Number(sceneConfig.defaultSize) : sizes[0],
        sizes,
        defaultVideo: typeof sceneConfig.defaultVideo === 'string' ? sceneConfig.defaultVideo : '',
      };
    }

    return Object.keys(normalizedScenes).length ? { scenes: normalizedScenes } : null;
  }

  buildTvOverlayPanel() {
    if (!this.tvOverlayPanel) {
      return;
    }
    this.tvOverlayPanel.classList.toggle('hidden', !this.tvOverlayConfig);
    if (!this.tvOverlayConfig) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = TV_CANVAS_SIZE.width;
    canvas.height = TV_CANVAS_SIZE.height;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.encoding = THREE.sRGBEncoding;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    this.tvOverlayState.canvas = canvas;
    this.tvOverlayState.context = context;
    this.tvOverlayState.texture = texture;
    this.tvOverlayState.videoTexture = videoTexture;
    this.tvOverlayState.video = video;

    video.addEventListener('play', () => {
      this.startTvVideoLoop();
      this.rebuildTvOverlayMesh();
      this.requestRender();
      this.updateTvOverlayMeta();
    });
    video.addEventListener('pause', () => {
      this.stopTvVideoLoop();
      this.updateTvOverlayMeta();
      this.requestRender();
    });
    video.addEventListener('ended', () => {
      this.restartTvVideo();
    });
    video.addEventListener('stalled', () => {
      this.restartTvVideo();
    });
    video.addEventListener('waiting', () => {
      this.requestRender();
    });
    video.addEventListener('error', () => {
      this.stopTvVideoLoop();
      this.drawTvPlaceholder();
      this.updateTvOverlayMeta();
      this.requestRender();
    });
    video.addEventListener('loadeddata', () => {
      this.rebuildTvOverlayMesh();
      this.requestRender();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          this.rebuildTvOverlayMesh();
          this.requestRender();
        });
      }
      this.updateTvOverlayMeta();
    });

    this.drawTvPlaceholder();
  }

  buildTvSizeButtons(sceneConfig) {
    if (!this.tvSizeToolbar) {
      return;
    }
    this.tvSizeToolbar.innerHTML = '';
    this.tvSizeButtons = sceneConfig.sizes.map((size) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tv-size-button';
      button.dataset.size = String(size);
      button.textContent = this.t('tvSizeLabel', { size });
      button.addEventListener('click', () => {
        this.markInteraction();
        this.setTvOverlaySize(size);
      });
      this.tvSizeToolbar.appendChild(button);
      return button;
    });
    this.refreshTvSizeButtons();
  }

  updateTvOverlayUi() {
    if (!this.tvOverlayPanel) {
      return;
    }
    const sceneConfig = this.getCurrentTvOverlayConfig();
    const visible = Boolean(sceneConfig);
    this.tvOverlayPanel.classList.toggle('hidden', !visible);
    if (!visible) {
      return;
    }

    this.tvOverlayTitle.textContent = this.t('tvOverlayTitle');
    this.tvOverlayCaption.textContent = this.t('tvOverlayCaption');
    this.tvVideoFileLabel.textContent = this.t('tvVideoFileLabel');
    this.tvAdjustLabel.textContent = this.t('tvAdjustLabel');
    this.tvAdjustResetButton.textContent = this.t('tvAdjustReset');
    this.buildTvSizeButtons(sceneConfig);
    this.refreshTvSizeButtons();
    this.updateTvOverlayMeta();
  }

  refreshTvSizeButtons() {
    const selectedSize = this.tvOverlayState.selectedSize;
    for (const button of this.tvSizeButtons) {
      button.classList.toggle('active', Number(button.dataset.size) === selectedSize);
    }
  }

  getCurrentTvOverlayConfig() {
    if (!this.tvOverlayConfig || !this.currentScene) {
      return null;
    }
    return this.tvOverlayConfig.scenes[this.currentScene.id] || null;
  }

  getTvScreenMetrics(sceneConfig, selectedSize) {
    const tvSize = getTvPresetSize(selectedSize);
    if (!sceneConfig || !tvSize) {
      return null;
    }

    const borderWidthMm = sceneConfig.borderPx * sceneConfig.mmPerPixel.x;
    const borderHeightMm = sceneConfig.borderPx * sceneConfig.mmPerPixel.y;
    const totalWidthPx = (tvSize.width * 10 + borderWidthMm * 2) / sceneConfig.mmPerPixel.x;
    const totalHeightPx = (tvSize.height * 10 + borderHeightMm * 2) / sceneConfig.mmPerPixel.y;

    return {
      tvSize,
      totalWidthPx,
      totalHeightPx,
    };
  }

  clampTvOffset(sceneConfig, selectedSize, offset) {
    const metrics = this.getTvScreenMetrics(sceneConfig, selectedSize);
    if (!metrics) {
      return { x: 0, y: 0 };
    }

    const bounds = sceneConfig.bounds || {};
    const hasBounds = ['left', 'right', 'top', 'bottom'].every((key) => Number.isFinite(bounds[key]));
    if (!hasBounds) {
      return { x: Number(offset?.x) || 0, y: Number(offset?.y) || 0 };
    }

    const halfWidth = metrics.totalWidthPx / 2;
    const halfHeight = metrics.totalHeightPx / 2;
    const minX = bounds.left + halfWidth - sceneConfig.center.x;
    const maxX = bounds.right - halfWidth - sceneConfig.center.x;
    const minY = bounds.top + halfHeight - sceneConfig.center.y;
    const maxY = bounds.bottom - halfHeight - sceneConfig.center.y;

    return {
      x: clamp(Number(offset?.x) || 0, minX, maxX),
      y: clamp(Number(offset?.y) || 0, minY, maxY),
    };
  }

  nudgeTvOffset(deltaX, deltaY) {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig) {
      return;
    }
    const selectedSize = this.tvOverlayState.selectedSize || sceneConfig.defaultSize;
    this.tvOverlayState.offsetPx = this.clampTvOffset(sceneConfig, selectedSize, {
      x: this.tvOverlayState.offsetPx.x + deltaX,
      y: this.tvOverlayState.offsetPx.y + deltaY,
    });
    this.rebuildTvOverlayMesh();
    this.updateTvOverlayMeta();
    this.requestRender();
  }

  resetTvOffset() {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig) {
      return;
    }
    const selectedSize = this.tvOverlayState.selectedSize || sceneConfig.defaultSize;
    this.tvOverlayState.offsetPx = this.clampTvOffset(sceneConfig, selectedSize, { x: 0, y: 0 });
    this.rebuildTvOverlayMesh();
    this.updateTvOverlayMeta();
    this.requestRender();
  }

  setTvOverlaySize(size) {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig || !sceneConfig.sizes.includes(size)) {
      return;
    }
    this.tvOverlayState.selectedSize = size;
    this.tvOverlayState.offsetPx = this.clampTvOffset(sceneConfig, size, this.tvOverlayState.offsetPx);
    this.refreshTvSizeButtons();
    this.rebuildTvOverlayMesh();
    this.updateTvOverlayMeta();
    this.requestRender();
  }

  updateTvOverlayScene() {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig) {
      if (this.tvOverlayState.video) {
        this.tvOverlayState.video.pause();
      }
      this.clearTvOverlayMesh();
      this.stopTvVideoLoop();
      if (this.tvOverlayPanel) {
        this.tvOverlayPanel.classList.add('hidden');
      }
      return;
    }

    this.tvOverlayState.sceneConfig = sceneConfig;
    if (!sceneConfig.sizes.includes(this.tvOverlayState.selectedSize)) {
      this.tvOverlayState.selectedSize = sceneConfig.defaultSize;
    }
    this.tvOverlayState.offsetPx = this.clampTvOffset(
      sceneConfig,
      this.tvOverlayState.selectedSize,
      this.tvOverlayState.offsetPx,
    );
    if (!this.tvOverlayState.video?.src && sceneConfig.defaultVideo) {
      this.loadTvVideoFromUrl(sceneConfig.defaultVideo);
    }
    this.updateTvOverlayUi();
    this.rebuildTvOverlayMesh();
    this.drawTvFrame();
  }

  clearTvOverlayMesh() {
    const { frameMesh, screenMesh, frameMaterial, screenMaterial } = this.tvOverlayState;
    if (frameMesh) {
      this.scene.remove(frameMesh);
      frameMesh.geometry.dispose();
      this.tvOverlayState.frameMesh = null;
    }
    if (screenMesh) {
      this.scene.remove(screenMesh);
      screenMesh.geometry.dispose();
      this.tvOverlayState.screenMesh = null;
    }
    if (frameMaterial) {
      frameMaterial.dispose();
      this.tvOverlayState.frameMaterial = null;
    }
    if (screenMaterial) {
      screenMaterial.dispose();
      this.tvOverlayState.screenMaterial = null;
    }
  }

  rebuildTvOverlayMesh() {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig || !this.tvOverlayState.texture) {
      this.clearTvOverlayMesh();
      return;
    }

    const selectedSize = this.tvOverlayState.selectedSize || sceneConfig.defaultSize;
    const tvSize = getTvPresetSize(selectedSize);
    if (!tvSize) {
      return;
    }

    this.clearTvOverlayMesh();

    const metrics = this.getTvScreenMetrics(sceneConfig, selectedSize);
    const totalWidthPx = metrics.totalWidthPx;
    const totalHeightPx = metrics.totalHeightPx;
    const screenWidthPx = (tvSize.width * 10) / sceneConfig.mmPerPixel.x;
    const screenHeightPx = (tvSize.height * 10) / sceneConfig.mmPerPixel.y;
    const radius = 5000;
    const frameWidth = (totalWidthPx / sceneConfig.imageWidth) * radius * 2;
    const frameHeight = (totalHeightPx / sceneConfig.imageHeight) * radius * 2;
    const screenWidth = (screenWidthPx / sceneConfig.imageWidth) * radius * 2;
    const screenHeight = (screenHeightPx / sceneConfig.imageHeight) * radius * 2;
    const frameGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
    const screenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false,
      side: THREE.FrontSide,
    });
    const screenMap = this.tvOverlayState.video && this.tvOverlayState.video.readyState >= 2
      ? this.tvOverlayState.videoTexture
      : this.tvOverlayState.texture;
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenMap,
      toneMapped: false,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    screenMaterial.polygonOffset = true;
    screenMaterial.polygonOffsetFactor = -2;
    screenMaterial.polygonOffsetUnits = -2;
    const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
    const screenMesh = new THREE.Mesh(screenGeometry, screenMaterial);
    const center = facePixelToLocalPosition(
      sceneConfig.face,
      sceneConfig.center.x + this.tvOverlayState.offsetPx.x,
      sceneConfig.center.y + this.tvOverlayState.offsetPx.y,
      sceneConfig.imageWidth,
      sceneConfig.imageHeight,
      radius,
    );
    const inwardQuat = getFaceInwardQuaternion(sceneConfig.face);
    const inwardNormal = getFaceInwardNormal(sceneConfig.face);
    const frameOffset = inwardNormal.clone().multiplyScalar(6);
    const screenOffset = inwardNormal.clone().multiplyScalar(6.2);
    frameMesh.position.copy(center).add(frameOffset);
    screenMesh.position.copy(center).add(screenOffset);
    frameMesh.quaternion.copy(inwardQuat);
    screenMesh.quaternion.copy(inwardQuat);
    this.scene.add(frameMesh);
    this.scene.add(screenMesh);

    this.tvOverlayState.frameMesh = frameMesh;
    this.tvOverlayState.screenMesh = screenMesh;
    this.tvOverlayState.frameMaterial = frameMaterial;
    this.tvOverlayState.screenMaterial = screenMaterial;
  }

  drawTvPlaceholder() {
    const { context, canvas } = this.tvOverlayState;
    if (!context || !canvas) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#151515';
    context.fillRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = '#f5f5f5';
    context.font = '36px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(TV_PLACEHOLDER_TEXT[this.language] || TV_PLACEHOLDER_TEXT.en, canvas.width / 2, canvas.height / 2);
    this.tvOverlayState.texture.needsUpdate = true;
  }

  drawTvFrame() {
    const { context, canvas, video, texture } = this.tvOverlayState;
    if (!context || !canvas || !texture) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const innerX = 3;
    const innerY = 3;
    const innerWidth = canvas.width - 6;
    const innerHeight = canvas.height - 6;

    if (video && video.readyState >= 2 && !video.paused && !video.ended) {
      const videoAspect = video.videoWidth / video.videoHeight;
      const screenAspect = innerWidth / innerHeight;
      let drawWidth = innerWidth;
      let drawHeight = innerHeight;
      let drawX = innerX;
      let drawY = innerY;

      if (videoAspect > screenAspect) {
        drawHeight = innerWidth / videoAspect;
        drawY = innerY + (innerHeight - drawHeight) / 2;
      } else {
        drawWidth = innerHeight * videoAspect;
        drawX = innerX + (innerWidth - drawWidth) / 2;
      }

      context.drawImage(video, drawX, drawY, drawWidth, drawHeight);
    } else {
      context.fillStyle = '#151515';
      context.fillRect(innerX, innerY, innerWidth, innerHeight);
      context.fillStyle = '#f5f5f5';
      context.font = '36px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(TV_PLACEHOLDER_TEXT[this.language] || TV_PLACEHOLDER_TEXT.en, canvas.width / 2, canvas.height / 2);
    }

    texture.needsUpdate = true;
  }

  stopTvVideoLoop() {
    const { video } = this.tvOverlayState;
    if (video && typeof video.cancelVideoFrameCallback === 'function' && this.tvOverlayState.videoFrameRequestId) {
      video.cancelVideoFrameCallback(this.tvOverlayState.videoFrameRequestId);
      this.tvOverlayState.videoFrameRequestId = 0;
    }
    if (this.tvOverlayState.rafId) {
      window.cancelAnimationFrame(this.tvOverlayState.rafId);
      this.tvOverlayState.rafId = 0;
    }
  }

  startTvVideoLoop() {
    const { video } = this.tvOverlayState;
    if (!video) {
      return;
    }

    this.stopTvVideoLoop();

    if (typeof video.requestVideoFrameCallback === 'function') {
      const tick = () => {
        this.tvOverlayState.videoFrameRequestId = 0;
        if (!video || video.paused || video.ended) {
          return;
        }
        this.requestRender();
        this.tvOverlayState.videoFrameRequestId = video.requestVideoFrameCallback(tick);
      };
      this.tvOverlayState.videoFrameRequestId = video.requestVideoFrameCallback(tick);
      return;
    }

    const tick = () => {
      this.tvOverlayState.rafId = 0;
      if (!video || video.paused || video.ended) {
        return;
      }
      this.requestRender();
      this.tvOverlayState.rafId = window.requestAnimationFrame(tick);
    };
    this.tvOverlayState.rafId = window.requestAnimationFrame(tick);
  }

  restartTvVideo() {
    const { video } = this.tvOverlayState;
    if (!video || !video.src) {
      return;
    }

    const resume = () => {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    };

    if (video.ended || video.currentTime >= Math.max(0, (video.duration || 0) - 0.05)) {
      try {
        video.currentTime = 0;
      } catch (_) {
      }
      resume();
      return;
    }

    resume();
  }

  updateTvOverlayMeta() {
    const sceneConfig = this.getCurrentTvOverlayConfig();
    if (!sceneConfig || !this.tvOverlayMeta) {
      return;
    }
    const size = getTvPresetSize(this.tvOverlayState.selectedSize || sceneConfig.defaultSize);
    if (!size) {
      return;
    }
    const video = this.tvOverlayState.video;
    const isPlaying = Boolean(video && video.readyState >= 2 && !video.paused && !video.ended);
    this.tvOverlayMeta.textContent = isPlaying
      ? this.t('tvMetaPlaying', {
        size: this.tvOverlayState.selectedSize,
        width: formatTvDimension(size.width),
        height: formatTvDimension(size.height),
        x: sceneConfig.center.x + this.tvOverlayState.offsetPx.x,
        y: sceneConfig.center.y + this.tvOverlayState.offsetPx.y,
        offsetX: this.tvOverlayState.offsetPx.x,
        offsetY: this.tvOverlayState.offsetPx.y,
      })
      : this.t('tvMetaIdle', {
        x: sceneConfig.center.x + this.tvOverlayState.offsetPx.x,
        y: sceneConfig.center.y + this.tvOverlayState.offsetPx.y,
        width: formatTvDimension(size.width),
        height: formatTvDimension(size.height),
        offsetX: this.tvOverlayState.offsetPx.x,
        offsetY: this.tvOverlayState.offsetPx.y,
      });
  }

  loadTvVideoFromFile(file) {
    if (!file) {
      return;
    }
    const { video } = this.tvOverlayState;
    if (!video) {
      return;
    }
    video.pause();
    if (this.tvOverlayState.objectUrl) {
      URL.revokeObjectURL(this.tvOverlayState.objectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    this.tvOverlayState.objectUrl = objectUrl;
    video.src = objectUrl;
    video.load();
    this.restartTvVideo();
    this.updateTvOverlayMeta();
  }

  loadTvVideoFromUrl(url) {
    const { video } = this.tvOverlayState;
    if (!video) {
      return;
    }

    const resolvedUrl = String(url || '').trim();
    if (!resolvedUrl) {
      return;
    }

    video.pause();
    if (this.tvOverlayState.objectUrl) {
      URL.revokeObjectURL(this.tvOverlayState.objectUrl);
      this.tvOverlayState.objectUrl = null;
    }
    video.src = resolvedUrl;
    video.load();
    this.restartTvVideo();
    this.updateTvOverlayMeta();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.handleResize());
    this.viewerEl.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    window.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    window.addEventListener('pointerup', () => this.handlePointerUp());
    this.viewerEl.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.viewerEl.addEventListener('dblclick', () => this.resetView());
    this.toggleSidebar.addEventListener('click', () => {
      this.markInteraction();
      this.sidebar.classList.toggle('open');
    });
    this.togglePlan.addEventListener('click', () => {
      this.markInteraction();
      this.setPlanCollapsed(!this.planPanel.classList.contains('collapsed'));
    });
    this.togglePlanPanel.addEventListener('click', () => {
      this.markInteraction();
      this.setPlanCollapsed(!this.planPanel.classList.contains('collapsed'));
    });
    this.toggleHud.addEventListener('click', () => {
      this.markInteraction();
      this.setHudVisible(!this.hotspotLabelVisible);
    });
    this.toggleLanguage.addEventListener('click', () => {
      this.markInteraction();
      this.setLanguage(this.getNextLanguage());
    });
    if (this.tvVideoFileInput) {
      this.tvVideoFileInput.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        this.markInteraction();
        this.loadTvVideoFromFile(file || null);
      });
    }
    if (this.tvAdjustUpButton) {
      this.tvAdjustUpButton.addEventListener('click', () => {
        this.markInteraction();
        this.nudgeTvOffset(0, -1);
      });
    }
    if (this.tvAdjustLeftButton) {
      this.tvAdjustLeftButton.addEventListener('click', () => {
        this.markInteraction();
        this.nudgeTvOffset(-1, 0);
      });
    }
    if (this.tvAdjustRightButton) {
      this.tvAdjustRightButton.addEventListener('click', () => {
        this.markInteraction();
        this.nudgeTvOffset(1, 0);
      });
    }
    if (this.tvAdjustDownButton) {
      this.tvAdjustDownButton.addEventListener('click', () => {
        this.markInteraction();
        this.nudgeTvOffset(0, 1);
      });
    }
    if (this.tvAdjustResetButton) {
      this.tvAdjustResetButton.addEventListener('click', () => {
        this.markInteraction();
        this.resetTvOffset();
      });
    }
  }

  buildSceneList() {
    this.sceneList.innerHTML = '';
    for (const group of this.roomGroups) {
      const section = document.createElement('section');
      section.className = 'room-group';
      section.dataset.roomKey = group.key;
      section.innerHTML = `
        <div class="room-group-header">
          <div class="room-group-title">${this.getGroupTitle(group)}</div>
          <div class="room-group-meta">${
            group.scenes.length > 1
              ? this.t('roomGroupMultiple', { count: group.scenes.length })
              : this.t('roomGroupSingle')
          }</div>
        </div>
        <div class="room-group-scenes"></div>
      `;

      const cards = section.querySelector('.room-group-scenes');
      for (const scene of group.scenes) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scene-item';
        button.dataset.sceneId = scene.id;
        const thumbMarkup = scene.thumb
          ? `<div class="scene-item-thumb"><img src="${scene.thumb}" alt="${this.sceneLabels.get(scene.id)}"></div>`
          : '<div class="scene-item-thumb scene-item-thumb-fallback"></div>';
        button.innerHTML = `
          ${thumbMarkup}
          <div class="scene-item-body">
            <div class="scene-item-kicker">${this.sceneViewMeta.get(scene.id)}</div>
            <div class="scene-item-title">${this.sceneLabels.get(scene.id)}</div>
            <div class="scene-item-meta">${getSceneMetaLabel(scene, this.language)}</div>
          </div>
        `;
        button.addEventListener('click', () => {
          this.markInteraction();
          this.loadScene(scene.id);
          this.sidebar.classList.remove('open');
        });
        cards.appendChild(button);
      }

      this.sceneList.appendChild(section);
    }
  }

  buildPlan() {
    if (!this.plan) {
      this.planPanel.classList.add('hidden');
      this.togglePlan.style.display = 'none';
      return;
    }

    this.planPanel.classList.remove('hidden');
    this.togglePlan.style.display = 'inline-flex';

    const { width, height } = this.plan.canvas;
    this.planStage.style.aspectRatio = `${width} / ${height}`;
    this.planImage.src = this.plan.image;
    this.planImage.style.left = `${(this.plan.imageRect.x / width) * 100}%`;
    this.planImage.style.top = `${(this.plan.imageRect.y / height) * 100}%`;
    this.planImage.style.width = `${(this.plan.imageRect.width / width) * 100}%`;
    this.planImage.style.height = `${(this.plan.imageRect.height / height) * 100}%`;

    this.planSpotsLayer.innerHTML = '';
    this.planButtons = this.plan.spots.map((spot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plan-spot';
      button.dataset.sceneId = spot.sceneId;
      button.title = this.getPlanSpotLabel(spot);
      button.setAttribute('aria-label', this.getPlanSpotLabel(spot));
      button.style.left = `${(spot.x / width) * 100}%`;
      button.style.top = `${(spot.y / height) * 100}%`;
      button.addEventListener('click', () => {
        this.markInteraction();
        this.loadScene(spot.sceneId);
      });
      this.planSpotsLayer.appendChild(button);
      return button;
    });
    this.setPlanCollapsed(window.innerWidth <= 900);
  }

  setPlanCollapsed(collapsed) {
    if (!this.plan) {
      return;
    }
    this.planPanel.classList.toggle('collapsed', collapsed);
    this.togglePlanPanel.textContent = collapsed ? this.t('expand') : this.t('collapse');
    this.togglePlan.textContent = collapsed ? this.t('planButton') : this.t('hidePlanButton');
  }

  refreshCurrentSceneText() {
    if (!this.currentScene) {
      return;
    }

    const sceneLabel = this.sceneLabels.get(this.currentScene.id) || this.getSceneTitle(this.currentScene);
    const sceneIndex = this.sceneOrder.get(this.currentScene.id) || 1;
    this.sceneTitle.textContent = sceneLabel;
    this.sceneMeta.textContent = this.t('sceneMeta', {
      index: sceneIndex,
      total: this.manifest.scenes.length,
      label: getSceneMetaLabel(this.currentScene, this.language),
    });
    this.hotspotVectors = this.currentScene.hotspots.map((hotspot) => {
      const targetScene = this.sceneMap.get(hotspot.targetScene);
      return {
        ...hotspot,
        targetDisplayTitle: targetScene
          ? this.sceneLabels.get(targetScene.id) || this.getSceneTitle(targetScene)
          : pickLocalizedText(hotspot.targetTitleI18n, this.language, hotspot.targetTitle || hotspot.targetScene),
        vector: parseViewVector(hotspot.yaw, hotspot.pitch),
      };
    });
  }

  loadScene(sceneId) {
    const scene = this.sceneMap.get(sceneId);
    if (!scene) {
      return;
    }

    this.currentScene = scene;
    this.yaw = normalizeYaw(scene.startYaw ?? 0);
    this.pitch = scene.startPitch ?? 0;
    this.fov = 75;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    const loader = new THREE.CubeTextureLoader();
    const urls = FACE_ORDER.map((key) => scene.faces[key]);
    this.currentTextureKey = scene.id;
    loader.load(urls, (texture) => {
      if (this.currentTextureKey !== scene.id) {
        return;
      }
      texture.encoding = THREE.sRGBEncoding;
      this.scene.background = texture;
      this.requestRender();
    });

    this.refreshCurrentSceneText();
    this.rebuildHotspots();
    this.refreshSceneListState();
    this.refreshPlanState();
    this.updateTvOverlayScene();
    this.requestRender();
  }

  refreshSceneListState() {
    if (!this.currentScene) {
      return;
    }

    for (const element of this.sceneList.querySelectorAll('.scene-item')) {
      element.classList.toggle('active', element.dataset.sceneId === this.currentScene.id);
    }
    for (const element of this.sceneList.querySelectorAll('.room-group')) {
      element.classList.toggle('active', element.dataset.roomKey === this.roomLookup.get(this.currentScene.id)?.key);
    }
  }

  refreshPlanState() {
    if (!this.planButtons.length || !this.currentScene) {
      return;
    }
    for (const button of this.planButtons) {
      button.classList.toggle('active', button.dataset.sceneId === this.currentScene.id);
    }
    this.planCaption.textContent = this.sceneLabels.get(this.currentScene.id) || this.getSceneTitle(this.currentScene);
  }

  rebuildHotspots() {
    this.hotspotsLayer.innerHTML = '';
    this.hotspotButtons = this.hotspotVectors.map((hotspot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot';
      button.setAttribute('aria-label', hotspot.targetDisplayTitle);
      if (this.hotspotLabelVisible) {
        button.title = hotspot.targetDisplayTitle;
      }

      const dot = document.createElement('span');
      dot.className = 'hotspot-dot';
      dot.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'hotspot-label';
      label.textContent = hotspot.targetDisplayTitle;

      button.appendChild(dot);
      button.appendChild(label);
      button.addEventListener('click', () => {
        this.markInteraction();
        this.loadScene(hotspot.targetScene);
      });
      this.hotspotsLayer.appendChild(button);
      return { element: button, hotspot };
    });
  }

  handleResize() {
    this.width = this.viewerEl.clientWidth || 1;
    this.height = this.viewerEl.clientHeight || 1;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.requestRender();
  }

  handlePointerDown(event) {
    this.dragging = true;
    this.markInteraction();
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  handlePointerMove(event) {
    if (!this.dragging) {
      return;
    }
    this.markInteraction();
    const deltaX = event.clientX - this.pointerStart.x;
    const deltaY = event.clientY - this.pointerStart.y;
    this.yaw = normalizeYaw(this.pointerStart.yaw - deltaX * 0.12);
    this.pitch = clamp(this.pointerStart.pitch + deltaY * 0.12, -85, 85);
    this.requestRender();
  }

  handlePointerUp() {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.markInteraction();
  }

  handleWheel(event) {
    event.preventDefault();
    this.markInteraction();
    this.fov = clamp(this.fov + event.deltaY * 0.02, 40, 100);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  resetView() {
    if (!this.currentScene) {
      return;
    }
    this.markInteraction();
    this.yaw = normalizeYaw(this.currentScene.startYaw ?? 0);
    this.pitch = this.currentScene.startPitch ?? 0;
    this.fov = 75;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  markInteraction() {
    this.lastInteractionAt = performance.now();
  }

  requestRender() {
    this.needsRender = true;
  }

  updateCamera() {
    const target = parseViewVector(this.yaw, this.pitch);
    this.camera.lookAt(target);
  }

  updateHotspots() {
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);

    for (const entry of this.hotspotButtons) {
      const { element, hotspot } = entry;
      const vector = hotspot.vector.clone();
      const visible = vector.dot(cameraDirection) > 0.15;
      if (!visible) {
        element.style.display = 'none';
        continue;
      }

      vector.project(this.camera);
      const x = (vector.x * 0.5 + 0.5) * this.width;
      const y = (-vector.y * 0.5 + 0.5) * this.height;
      const withinBounds = x > -120 && x < this.width + 120 && y > -60 && y < this.height + 60;

      if (!withinBounds) {
        element.style.display = 'none';
        continue;
      }

      element.style.display = 'inline-flex';
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    }
  }

  render() {
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.updateHotspots();
  }

  animate(timestamp = performance.now()) {
    requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));

    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
      this.requestRender();
      return;
    }

    const delta = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = timestamp;

    const idleFor = timestamp - this.lastInteractionAt;
    if (!document.hidden && !this.dragging && this.currentScene && idleFor >= this.idleRotateDelay) {
      this.yaw = normalizeYaw(this.yaw + this.idleRotateSpeed * delta);
      this.requestRender();
    }

    if (!this.needsRender) {
      return;
    }

    this.needsRender = false;
    this.render();
  }
}

loadManifest()
  .then((manifest) => {
    new OfflineViewer(manifest);
  })
  .catch((error) => {
    document.body.innerHTML = `<pre style="padding:24px;color:#fff;background:#101317">${String(error)}</pre>`;
  });
