#!/bin/bash
# Script to install and enable the Pardus Wallpaper Extension

set -e

EXTENSION_UUID="pardus-wallpaper-extension@pardus.org.tr"
EXTENSION_DIR="$EXTENSION_UUID"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
DCONF_PATH="/org/gnome/shell/extensions/pardus-wallpaper/"

echo "==> Preparing to install Pardus Wallpaper Extension..."

# 0. Reset dconf settings to default
echo "==> Resetting dconf settings to default..."
dconf reset -f "$DCONF_PATH" || true

# 1. Disable the extension first to ensure a clean state
echo "==> Disabling extension if already enabled..."
gnome-extensions disable "$EXTENSION_UUID" || true 

echo "==> Installing..."

# Create extensions directory if it doesn't exist
mkdir -p "$HOME/.local/share/gnome-shell/extensions"

# Remove old installation if exists
if [ -d "$INSTALL_DIR" ]; then
    echo "==> Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi

# Copy extension files
echo "==> Copying extension files..."
cp -r "$EXTENSION_DIR" "$INSTALL_DIR"

# Compile schemas
if [ -d "$INSTALL_DIR/schemas" ]; then
    echo "==> Compiling GSettings schemas..."
    glib-compile-schemas "$INSTALL_DIR/schemas/"
fi

# 3. Enable the extension
echo "==> Enabling extension..."
gnome-extensions enable "$EXTENSION_UUID"

echo ""
echo "✓ Extension installed and enabled successfully!"
echo ""
echo "==> Starting nested GNOME Shell for live testing..."
echo "==> Close the nested window (or press Ctrl+C here) to stop."
echo "------------------------------------------------------------"

# 4. Start a nested session to see the logs live
dbus-run-session -- gnome-shell --nested