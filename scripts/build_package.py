#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from copy import deepcopy
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
TEMPLATE_DIR = PROJECT_ROOT / "template"
VENDOR_THREE_JS = PROJECT_ROOT / "vendor" / "three.min.js"
REQUIRED_FACE_KEYS = ("front", "back", "left", "right", "up", "down")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a static panorama viewer package from local manifest and assets."
    )
    parser.add_argument(
        "--source-dir",
        required=True,
        help="Directory containing manifest.json and all referenced assets.",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write the packaged static site into.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete the output directory before rebuilding.",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_relative_path(root: Path, relative_path: str, label: str) -> tuple[Path, Path]:
    rel_path = Path(relative_path)
    if rel_path.is_absolute():
        raise ValueError(f"{label} must be a relative path: {relative_path}")

    absolute_path = (root / rel_path).resolve()
    root_resolved = root.resolve()
    try:
        absolute_path.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError(f"{label} escapes the source directory: {relative_path}") from exc

    if not absolute_path.is_file():
        raise FileNotFoundError(f"{label} does not exist: {relative_path}")

    return rel_path, absolute_path


def copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def validate_manifest(manifest: dict[str, Any], source_dir: Path) -> tuple[dict[str, Any], list[Path]]:
    scenes = manifest.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("manifest.json must contain a non-empty scenes array")

    normalized = deepcopy(manifest)
    normalized.setdefault("designName", source_dir.name)
    normalized["sceneCount"] = len(scenes)

    i18n_config = normalized.get("i18n")
    if i18n_config is not None:
        if not isinstance(i18n_config, dict):
            raise ValueError("i18n must be an object when provided")

        default_language = i18n_config.get("defaultLanguage")
        if default_language is not None and not isinstance(default_language, str):
            raise ValueError("i18n.defaultLanguage must be a string")

        supported_languages = i18n_config.get("supportedLanguages") or i18n_config.get("languages")
        if supported_languages is not None:
            if not isinstance(supported_languages, list) or not supported_languages:
                raise ValueError("i18n.supportedLanguages must be a non-empty string array")
            if not all(isinstance(item, str) and item for item in supported_languages):
                raise ValueError("i18n.supportedLanguages must contain only non-empty strings")

    scene_ids: list[str] = []
    scene_id_set: set[str] = set()
    asset_paths: dict[str, Path] = {}

    for index, scene in enumerate(scenes, start=1):
        scene_id = scene.get("id")
        if not isinstance(scene_id, str) or not scene_id:
            raise ValueError(f"Scene #{index} is missing a valid id")
        if scene_id in scene_id_set:
            raise ValueError(f"Duplicate scene id: {scene_id}")
        scene_id_set.add(scene_id)
        scene_ids.append(scene_id)

        faces = scene.get("faces")
        if not isinstance(faces, dict):
            raise ValueError(f"Scene {scene_id} is missing faces")

        for face_name in REQUIRED_FACE_KEYS:
            face_path = faces.get(face_name)
            if not isinstance(face_path, str) or not face_path:
                raise ValueError(f"Scene {scene_id} is missing face: {face_name}")
            rel_path, _ = ensure_relative_path(source_dir, face_path, f"{scene_id}.{face_name}")
            asset_paths[rel_path.as_posix()] = rel_path

        thumb_path = scene.get("thumb")
        if thumb_path:
            if not isinstance(thumb_path, str):
                raise ValueError(f"Scene {scene_id} thumb must be a string")
            rel_path, _ = ensure_relative_path(source_dir, thumb_path, f"{scene_id}.thumb")
            asset_paths[rel_path.as_posix()] = rel_path

        hotspots = scene.get("hotspots", [])
        if not isinstance(hotspots, list):
            raise ValueError(f"Scene {scene_id} hotspots must be a list")

    start_scene = normalized.get("startScene") or scene_ids[0]
    if start_scene not in scene_id_set:
        raise ValueError(f"startScene does not exist in scenes: {start_scene}")
    normalized["startScene"] = start_scene

    for scene in scenes:
        scene_id = scene["id"]
        for hotspot in scene.get("hotspots", []):
            target_scene = hotspot.get("targetScene")
            if not isinstance(target_scene, str) or not target_scene:
                raise ValueError(f"Scene {scene_id} has a hotspot without targetScene")
            if target_scene not in scene_id_set:
                raise ValueError(
                    f"Scene {scene_id} hotspot points to missing targetScene: {target_scene}"
                )

    plan = manifest.get("plan")
    if plan is not None:
        if not isinstance(plan, dict):
            raise ValueError("plan must be an object when provided")
        image_path = plan.get("image")
        if image_path:
            if not isinstance(image_path, str):
                raise ValueError("plan.image must be a string")
            rel_path, _ = ensure_relative_path(source_dir, image_path, "plan.image")
            asset_paths[rel_path.as_posix()] = rel_path

        spots = plan.get("spots", [])
        if spots and not isinstance(spots, list):
            raise ValueError("plan.spots must be a list")
        for spot in spots:
            scene_id = spot.get("sceneId")
            if not isinstance(scene_id, str) or scene_id not in scene_id_set:
                raise ValueError(f"plan.spots references missing sceneId: {scene_id}")

    return normalized, sorted(asset_paths.values(), key=lambda path: path.as_posix())


def copy_template_files(output_dir: Path) -> None:
    for relative_path in (
        Path("index.html"),
        Path("assets/app.css"),
        Path("assets/app.js"),
    ):
        copy_file(TEMPLATE_DIR / relative_path, output_dir / relative_path)

    copy_file(VENDOR_THREE_JS, output_dir / "assets" / "three.min.js")


def build_package(source_dir: Path, output_dir: Path, clean: bool) -> None:
    if clean and output_dir.exists():
        shutil.rmtree(output_dir)

    manifest_path = source_dir / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"manifest.json not found in {source_dir}")

    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise ValueError("manifest.json must contain a top-level object")

    normalized_manifest, asset_paths = validate_manifest(manifest, source_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    copy_template_files(output_dir)
    write_json(output_dir / "manifest.json", normalized_manifest)

    for relative_path in asset_paths:
        copy_file(source_dir / relative_path, output_dir / relative_path)


def main() -> None:
    args = parse_args()
    build_package(
        source_dir=Path(args.source_dir).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        clean=args.clean,
    )
    print(Path(args.output_dir).resolve())


if __name__ == "__main__":
    main()
