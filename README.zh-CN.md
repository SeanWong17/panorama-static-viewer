# Panorama Static Viewer

[English README](./README.md)

Panorama Static Viewer 用于把本地立方体贴图资源打包成静态全景漫游网页，支持场景切换、户型图导航，以及内置的 `en` / `zh-CN` 界面切换。

## 功能

- 基于 Three.js 的静态全景浏览器
- 带清单校验的本地打包脚本
- 场景列表、热点跳转和户型图导航
- 内置 `en` 和 `zh-CN` 界面切换
- 用于在线预览的 GitHub Pages 工作流
- 脱敏示例数据，便于本地验证

## 目录结构

```text
panorama-static-viewer/
  .github/workflows/deploy-pages.yml
  scripts/
    build_package.py
  template/
  vendor/
  examples/
    sample-apartment/
```

## 本地预览

构建示例包：

```bash
python3 scripts/build_package.py \
  --source-dir examples/sample-apartment \
  --output-dir dist/sample-apartment \
  --clean
```

启动本地静态服务：

```bash
cd dist/sample-apartment
python3 -m http.server 8000
```

浏览器打开 `http://127.0.0.1:8000/`。

页面会通过 `fetch` 读取 `manifest.json`，因此不要直接双击 `index.html` 打开。

## GitHub Pages

仓库内置了 [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)。
工作流会使用 `examples/sample-apartment` 构建示例页面，并在推送到 `main` 时发布到 GitHub Pages。

仓库设置步骤：

1. 打开 `Settings`
2. 打开 `Pages`
3. 在 `Build and deployment` 中选择 `GitHub Actions`
4. 推送到 `main`，或者手动运行工作流

预览地址格式：

```text
https://<github-user>.github.io/<repository-name>/
```

## i18n

浏览器内置支持 `en` 和 `zh-CN` 两种界面语言切换。

需要语言配置时，可在 `manifest.json` 中加入：

```json
{
  "i18n": {
    "defaultLanguage": "zh-CN",
    "supportedLanguages": ["zh-CN", "en"]
  }
}
```

页面语言选择顺序：

1. URL 查询参数 `?lang=...`
2. `localStorage` 中上次保存的语言
3. `i18n.defaultLanguage`
4. 浏览器语言
5. 默认回退语言

可本地化字段：

- `designNameI18n`
- `scene.titleI18n`
- `scene.metaLabelI18n`
- `scene.hotspots[].targetTitleI18n`
- `plan.spots[].labelI18n`

语言切换按钮显示目标语言。例如当前界面为中文时，按钮显示 `EN`。

## 源数据格式

源目录至少需要包含：

- `manifest.json`
- 所有被引用的图片资源，并且都使用相对路径

示例：

```json
{
  "designName": "Sample Apartment",
  "startScene": "scene-1",
  "scenes": [
    {
      "id": "scene-1",
      "title": "Living Room",
      "startYaw": 90,
      "startPitch": 0,
      "thumb": "assets/thumbs/scene-1.jpg",
      "faces": {
        "front": "assets/scenes/scene-1/f.jpg",
        "back": "assets/scenes/scene-1/b.jpg",
        "left": "assets/scenes/scene-1/l.jpg",
        "right": "assets/scenes/scene-1/r.jpg",
        "up": "assets/scenes/scene-1/u.jpg",
        "down": "assets/scenes/scene-1/d.jpg"
      },
      "hotspots": [
        {
          "targetScene": "scene-2",
          "targetTitle": "Kitchen",
          "yaw": 15,
          "pitch": 0
        }
      ]
    }
  ]
}
```

`plan`、`roomIndex`、`obsPicId`、`metaLabel` 以及本地化字段都会在输出包中保留。

## 构建过程

`scripts/build_package.py` 会执行以下步骤：

1. 加载并校验 `manifest.json`
2. 校验被引用资源是否存在于源目录内
3. 将被引用资源复制到输出目录
4. 复制 viewer 模板和内置 `three.min.js`
5. 输出规范化后的 `manifest.json`

## 说明

- 只使用相对资源路径
- 越出源目录的路径会被拒绝
- `dist/` 和 `_site/` 是构建产物，不提交到仓库
- 输出结果可部署到任意静态文件服务器

## 许可证

[MIT](./LICENSE)
