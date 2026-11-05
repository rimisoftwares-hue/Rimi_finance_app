#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
MODULES_DIR="$FRONTEND_DIR/node_modules"
HOST_DIR="$HOME/.local/share/rimi_node_modules"

# Ensure the Linux-native node_modules mount is active (prevents exFAT symlink/EIO errors)
if ! mountpoint -q "$MODULES_DIR"; then
    mkdir -p "$HOST_DIR" "$MODULES_DIR"
    echo "Mounting Linux-native node_modules volume..."
    sudo mount --bind "$HOST_DIR" "$MODULES_DIR"
fi

cd "$PROJECT_ROOT"
cargo tauri dev "$@"
