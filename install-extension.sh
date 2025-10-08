#!/bin/bash
# Script to install and enable the Pardus Wallpaper Extension

set -e

EXTENSION_UUID="pardus-wallpaper-extension@pardus.org.tr"
EXTENSION_DIR="$EXTENSION_UUID"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "==> Installing Pardus Wallpaper Extension..."
echo ""

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

# Try to enable the extension
echo "==> Enabling extension..."
gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null && echo "✓ Extension enabled!" || echo "⚠ Extension will be available after GNOME Shell restart"

echo ""
echo "✓ Extension installed successfully!"
echo ""
echo "Installation path: $INSTALL_DIR"
echo ""
echo "Installed files:"
echo "  - extension.js, indicator.js, worker.js"
echo "  - wallpaperManager.js, settings.js, infoDialog.js"
echo "  - prefs.js, stylesheet.css"
echo "  - data/wallpaper_sources.json"
echo "  - schemas/org.gnome.shell.extensions.pardus-wallpaper.gschema.xml"
echo ""
echo "To restart GNOME Shell:"
echo "  - X11: Press Alt+F2, type 'r', and press Enter"
echo "  - Wayland: Log out and log back in"
echo ""
echo "To view extension preferences:"
echo "  gnome-extensions prefs $EXTENSION_UUID"
echo ""
echo "To view logs:"
echo "  journalctl -f -o cat /usr/bin/gnome-shell | grep -i pardus"
