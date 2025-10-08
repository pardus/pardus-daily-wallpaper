#!/bin/bash
# Script to uninstall the Pardus Wallpaper Extension

set -e

EXTENSION_UUID="pardus-wallpaper-extension@pardus.org.tr"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "==> Uninstalling Pardus Wallpaper Extension..."
echo ""

# Disable extension first
echo "==> Disabling extension..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || echo "Extension already disabled or not found"

# Remove installation
if [ -d "$INSTALL_DIR" ]; then
    echo "==> Removing extension files..."
    rm -rf "$INSTALL_DIR"
    echo "✓ Extension files removed"
else
    echo "⚠ Extension not found at: $INSTALL_DIR"
fi

echo ""
echo "✓ Extension uninstalled successfully!"
echo ""
echo "Note: Cache files are preserved at ~/.cache/pardus-gnome-greeter/"
echo "To remove cache:"
echo "  rm -rf ~/.cache/pardus-gnome-greeter/"
echo ""
echo "To restart GNOME Shell:"
echo "  - X11: Press Alt+F2, type 'r', and press Enter"
echo "  - Wayland: Log out and log back in"
