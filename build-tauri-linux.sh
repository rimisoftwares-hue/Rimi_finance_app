#!/usr/bin/env bash
# build-tauri-linux.sh
# Run from the ROOT of your project.
# Builds a Linux .AppImage and .deb using Docker — no local Rust/Cargo needed.

set -euo pipefail

IMAGE_NAME="rimi-tauri-builder"
CONTAINER_NAME="rimi-tauri-build-run"
OUTPUT_DIR="$(pwd)/tauri-dist"

echo "──────────────────────────────────────────"
echo "  Rimi Finance — Docker Tauri Build"
echo "──────────────────────────────────────────"

# 1. Build the Docker image (uses Dockerfile.tauri-build)
echo "[1/3] Building Docker image..."
docker build \
  -f src-tauri/Dockerfile.tauri-build \
  -t "$IMAGE_NAME" \
  .

# 2. Run a temporary container and copy out the built bundles
echo "[2/3] Extracting build artifacts..."
mkdir -p "$OUTPUT_DIR"

docker run --rm \
  --name "$CONTAINER_NAME" \
  -v "$OUTPUT_DIR":/output \
  "$IMAGE_NAME" \
  bash -c "
    cp src-tauri/target/release/bundle/**/*.AppImage /output/ 2>/dev/null || true
    cp src-tauri/target/release/bundle/**/*.deb      /output/ 2>/dev/null || true
    echo 'Artifacts copied.'
  "

# 3. List results
echo "[3/3] Build complete. Output files:"
ls -lh "$OUTPUT_DIR"

echo ""
echo "✅  Done! Find your installer in: $OUTPUT_DIR"
echo ""
echo "NOTE: This produces a LINUX binary (.AppImage / .deb)."
echo "      To build a Windows .exe, see the README section on cross-compilation."
