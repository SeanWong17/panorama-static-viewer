# Panorama Static Viewer

[中文说明](./README.zh-CN.md)

Panorama Static Viewer packages local cubemap assets into a static panorama site
with scene switching, floor plan navigation, and built-in `en` / `zh-CN` UI
switching.

## Features

- Static panorama viewer based on Three.js
- Local packaging script with manifest validation
- Scene list, hotspots, and floor plan navigation
- Built-in UI language switch for `en` and `zh-CN`
- GitHub Pages workflow for online preview
- Anonymized sample dataset for local testing

## Project Layout

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

## Local Preview

Build the sample package:

```bash
python3 scripts/build_package.py \
  --source-dir examples/sample-apartment \
  --output-dir dist/sample-apartment \
  --clean
```

Start a local static server:

```bash
cd dist/sample-apartment
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/` in your browser.

The viewer loads `manifest.json` with `fetch`, so `index.html` should be served
over HTTP instead of opened directly from the file system.

## GitHub Pages

The repository includes [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml).
The workflow builds the sample package from `examples/sample-apartment` and
publishes the generated static site to the `gh-pages` branch on pushes to `main`.

Repository settings:

1. Open `Settings`.
2. Open `Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select branch `gh-pages` and folder `/ (root)`.
5. Push to `main` or run the workflow manually.

Published URL format:

```text
https://<github-user>.github.io/<repository-name>/
```

## I18n

The viewer supports built-in UI switching between `en` and `zh-CN`.

Add this block to `manifest.json` when language configuration is needed:

```json
{
  "i18n": {
    "defaultLanguage": "zh-CN",
    "supportedLanguages": ["zh-CN", "en"]
  }
}
```

Language resolution order:

1. URL query parameter `?lang=...`
2. Last language stored in `localStorage`
3. `i18n.defaultLanguage`
4. Browser language
5. Fallback language

Localized content fields:

- `designNameI18n`
- `scene.titleI18n`
- `scene.metaLabelI18n`
- `scene.hotspots[].targetTitleI18n`
- `plan.spots[].labelI18n`

The language button shows the target language. For example, it displays `EN`
when the current UI language is `zh-CN`.

## Source Format

The source directory must contain:

- `manifest.json`
- All referenced image assets, using relative paths

Example:

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

Optional fields such as `plan`, `roomIndex`, `obsPicId`, `metaLabel`, and
localized content are preserved in the packaged output.

## Build Process

`scripts/build_package.py` performs these steps:

1. Load and validate `manifest.json`
2. Verify that referenced assets exist inside the source directory
3. Copy the referenced assets into the output directory
4. Copy the viewer template and bundled `three.min.js`
5. Write the normalized `manifest.json` to the output package

## Notes

- Use relative asset paths only.
- Paths outside the source directory are rejected.
- `dist/` and `_site/` are build outputs and are not committed.
- The output can be hosted by any static file server.

## License

[MIT](./LICENSE)
