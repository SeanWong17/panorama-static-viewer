const FACE_ORDER = ['right', 'left', 'up', 'down', 'front', 'back'];
const LANGUAGE_STORAGE_KEY = 'open-panorama-language';
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
    this.toggleLanguage = document.getElementById('toggle-language');
    this.togglePlanPanel = document.getElementById('toggle-plan-panel');
    this.planPanel = document.getElementById('plan-panel');
    this.planTitle = document.getElementById('plan-title');
    this.planCaption = document.getElementById('plan-caption');
    this.planStage = document.getElementById('plan-stage');
    this.planImage = document.getElementById('plan-image');
    this.planSpotsLayer = document.getElementById('plan-spots');

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
    this.plan = this.normalizePlan(manifest.plan);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height);
    this.viewerEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, this.width / this.height, 1, 11000);

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
    this.toggleLanguage.addEventListener('click', () => {
      this.markInteraction();
      this.setLanguage(this.getNextLanguage());
    });
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
      this.scene.background = texture;
      this.requestRender();
    });

    this.refreshCurrentSceneText();
    this.rebuildHotspots();
    this.refreshSceneListState();
    this.refreshPlanState();
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
      button.textContent = hotspot.targetDisplayTitle;
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
