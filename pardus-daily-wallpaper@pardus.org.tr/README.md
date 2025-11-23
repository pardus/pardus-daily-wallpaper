# Pardus Daily Wallpaper Extension

GNOME Shell extension for automatically downloading and shuffling wallpapers from various sources.

## Features

- 🖼️ **Smart Caching**: Downloads wallpapers once per day, reuses cache on multiple reboots
- 🔄 **Auto Shuffle**: Automatically cycles through wallpapers at configurable intervals
- 📊 **Multiple Sources**: Supports Bing Daily, Reddit, NASA APOD, Wallhaven, Wikipedia POTD
- 📱 **Panel Indicator**: Quick access from top panel with status indicators
- 🔍 **Preview Dialog**: View wallpaper details before setting
- ⚠️ **Error Handling**: Retry failed downloads with one click
- 🗑️ **Auto Cleanup**: Automatically removes old cached wallpapers

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/pardus/pardus-live-wallpaper.git
cd pardus-live-wallpaper

# Run install script
./install-extension.sh
```

### Manual Installation

```bash
# Copy extension to GNOME extensions directory
cp -r pardus-daily-wallpaper@pardus.org.tr ~/.local/share/gnome-shell/extensions/

# Compile schemas
glib-compile-schemas ~/.local/share/gnome-shell/extensions/pardus-daily-wallpaper@pardus.org.tr/schemas/

# Enable extension
gnome-extensions enable pardus-daily-wallpaper@pardus.org.tr

# Restart GNOME Shell
# X11: Alt+F2, type 'r', press Enter
# Wayland: Log out and log back in
```

## Configuration

### Via Extension Preferences

```bash
gnome-extensions prefs pardus-daily-wallpaper@pardus.org.tr
```

### Via Panel Indicator

Click the wallpaper icon in the top panel to:
- Enable/disable daily wallpapers
- View wallpaper sources with status indicators
- Set wallpapers immediately
- View wallpaper information
- Adjust cycle interval

## File Structure

```
pardus-daily-wallpaper@pardus.org.tr/
├── extension.js           # Main extension module
├── indicator.js           # Panel indicator UI
├── worker.js             # Background worker (downloads, shuffle, cleanup)
├── wallpaperManager.js   # Wallpaper download and cache management
├── settings.js           # GSettings wrapper
├── infoDialog.js         # Wallpaper preview dialog
├── prefs.js              # Preferences UI
├── stylesheet.css        # Custom styles
├── metadata.json         # Extension metadata
├── data/
│   └── wallpaper_sources.json  # Wallpaper sources configuration
└── schemas/
    └── org.gnome.shell.extensions.pardus-daily-wallpaper.gschema.xml
```

## Cache Structure

Wallpapers are cached in `~/.cache/pardus-daily-wallpaper/` with the following structure:

```
~/.cache/pardus-daily-wallpaper/
├── 08.10.2025/
│   ├── bing.json         # Standardized metadata
│   ├── bing.jpeg         # Downloaded image
│   ├── reddit.json
│   ├── reddit.jpg
│   └── ...
├── 07.10.2025/
└── 06.10.2025/
```

## Wallpaper Sources

The extension supports multiple wallpaper sources configured in `data/wallpaper_sources.json`:

- **Bing Daily**: Microsoft Bing daily wallpapers
- **Reddit Wallpapers**: Top wallpapers from r/wallpaper
- **NASA APOD**: NASA Astronomy Picture of the Day
- **Wallhaven**: Top community wallpapers
- **Wikipedia POTD**: Wikipedia Picture of the Day

## Development

### Requirements

- GNOME Shell 45+
- GJS 1.76+
- GLib 2.0
- Soup 3.0

### Testing

```bash
# View extension logs
journalctl -f -o cat /usr/bin/gnome-shell | grep -i pardus

# Reload extension
gnome-extensions disable pardus-daily-wallpaper@pardus.org.tr
gnome-extensions enable pardus-daily-wallpaper@pardus.org.tr
```

## License

GPL-3.0-or-later

## Credits

Developed for Pardus Linux by the Pardus Team.
