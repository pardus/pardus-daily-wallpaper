/* indicator.js
 *
 * Panel Indicator - Top panel icon with popup menu for wallpaper controls
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';


export const Indicator = GObject.registerClass({
    Signals: {
        'set-wallpaper-for-source': { param_types: [GObject.TYPE_STRING] },
    },
}, class Indicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, _('Pardus Daily Wallpaper'));
            this._settings = settings;
        this.path = Extension.lookupByURL(import.meta.url).path;

        this._sourceRows = {};

            this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(GLib.build_filenamev([this.path, 'data', 'icon.svg'])),
                style_class: 'system-status-icon',
            });
            this.add_child(this._icon);

        this._buildMenu();
            this._connectSettings();
        }

    refresh() {
        this.menu.removeAll();
        this._buildMenu();
    }

        setDownloadingState(isDownloading) {
            if (isDownloading) {
            this._icon.add_style_class_name('spinning');
            } else {
            this._icon.remove_style_class_name('spinning');
        }
    }

    _buildMenu() {
        const selectedSources = this._settings.get_strv('selected-sources');
        const sources = this._loadWallpaperSources();

        for (const sourceId of selectedSources) {
            const sourceData = sources[sourceId];
            if(sourceData) {
                this._buildSourceRow(sourceId, sourceData);
            }
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._buildGeneralSection();
    }

    _createSourcesView() {
        const box = new St.BoxLayout({ vertical: true, style_class: 'sources-view' });
        const selectedSources = this._settings.get_strv('selected-sources');
        const sources = this._loadWallpaperSources();

        for (const sourceId of selectedSources) {
            const sourceData = sources[sourceId];
            if (sourceData) {
                const menuItem = new PopupMenu.PopupMenuItem(sourceData.name || sourceId);
                box.add_child(menuItem);
                menuItem.connect('activate', () => {
                    this.emit('set-wallpaper-for-source', sourceId);
                });
            }
        }

        box.add_child(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => this._openPreferences());
        box.add_child(settingsItem);

        return box;
    }

    _createMyWallpapersView() {
        const box = new St.BoxLayout({ vertical: true, style_class: 'wallpapers-view' });
        const wallpapersDir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-daily-wallpaper'])
        );

        if (!wallpapersDir.query_exists(null)) {
            box.add_child(new St.Label({ text: _('No downloaded wallpapers found.'), style_class: 'no-wallpapers-label' }));
            return box;
        }

        const dateDirs = this._getDateDirectories(wallpapersDir);
        const todayStr = this._getTodayString();

        if (dateDirs.length === 0) {
            box.add_child(new St.Label({ text: _('No downloaded wallpapers found.'), style_class: 'no-wallpapers-label' }));
            return box;
        }

        for (const dateDir of dateDirs) {
            const dateStr = dateDir.get_basename();
            let formattedDate = dateStr;
            try {
                const [day, month, year] = dateStr.split('.').map(Number);
                const dateTime = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
                formattedDate = dateTime.format('%d %B %Y');
            } catch (e) {
                // ignore
            }

            const title = dateStr === todayStr ? `${formattedDate} (${_('Today')})` : formattedDate;
            const dateLabel = new St.Label({ text: title, style_class: 'date-header' });
            box.add_child(dateLabel);

            // In a real implementation, you would list wallpapers for this date
        }

        return box;
    }

    _getDateDirectories(mainDir) {
        const enumerator = mainDir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const dirs = [];
        let fileInfo;
        while ((fileInfo = enumerator.next_file(null))) {
            if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(fileInfo.get_name())) {
                    dirs.push(enumerator.get_child(fileInfo));
                }
            }
        }
        dirs.sort((a, b) => {
            const nameA = a.get_basename();
            const nameB = b.get_basename();
            try {
                const [dayA, monthA, yearA] = nameA.split('.').map(Number);
                const [dayB, monthB, yearB] = nameB.split('.').map(Number);
                const dateA = GLib.DateTime.new_local(yearA, monthA, dayA, 0, 0, 0);
                const dateB = GLib.DateTime.new_local(yearB, monthB, dayB, 0, 0, 0);
                return dateB.compare(dateA);
            } catch (e) {
                return 0;
            }
        });
        return dirs;
    }

    _getTodayString() {
        return GLib.DateTime.new_now_local().format('%d.%m.%Y');
    }

    _buildSourceRow(sourceId, sourceData) {
        const menuItem = new PopupMenu.PopupMenuItem(sourceData.name || sourceId);
        this.menu.addMenuItem(menuItem);

        menuItem.connect('activate', () => {
            this.emit('set-wallpaper-for-source', sourceId);
        });

        const statusIcon = new St.Icon({
            style_class: 'popup-menu-icon',
        });
        
        const spacer = new St.Bin({ style_class: 'popup-menu-item-spacer', x_expand: true });
        menuItem.add_child(spacer);
        menuItem.add_child(statusIcon);
        
        this._sourceRows[sourceId] = { row: menuItem, statusIcon: statusIcon };

        const isCached = this._isSourceCached(sourceId);
        this.updateSourceStatus(sourceId, isCached ? 'cached' : 'pending');
    }

    _isSourceCached(sourceId) {
        try {
            const today = GLib.DateTime.new_now_local().format('%d.%m.%Y');
            const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-daily-wallpaper', today]);
            const metadataFile = Gio.File.new_for_path(GLib.build_filenamev([cacheDir, `${sourceId}.json`]));
            return metadataFile.query_exists(null);
            } catch (e) {
            logError(e, `[Indicator] Failed to check cache for ${sourceId}`);
            return false;
        }
    }

    updateSourceStatus(sourceId, status) {
        const sourceRow = this._sourceRows[sourceId];
        if (!sourceRow) return;

        let iconName = '';
        let styleClass = 'popup-menu-icon'; // Base class

            switch (status) {
                case 'downloading':
                iconName = 'cloud-download-symbolic';
                styleClass += ' spinning';
                    break;
                case 'success':
            case 'cached':
                iconName = 'emblem-ok-symbolic';
                styleClass += ' success-label'; // for color
                    break;
                case 'error':
                iconName = 'dialog-error-symbolic';
                styleClass += ' error-label'; // for color
                    break;
            case 'pending':
                default:
                iconName = 'document-open-recent-symbolic';
                break;
        }

        sourceRow.statusIcon.icon_name = iconName;
        sourceRow.statusIcon.style_class = styleClass;
    }

    _buildGeneralSection() {
        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => this._openPreferences());
        this.menu.addMenuItem(settingsItem);
    }

    _openPreferences() {
        Extension.lookupByURL(import.meta.url).openPreferences();
    }
    
    _loadWallpaperSources() {
        try {
            const sourcesPath = GLib.build_filenamev([this.path, 'data', 'wallpaper_sources.json']);
            const file = Gio.File.new_for_path(sourcesPath);
            const [ok, contents] = file.load_contents(null);

            if (ok) {
                const data = JSON.parse(new TextDecoder().decode(contents));
                return data.sources || {};
            }
        } catch(e) {
             console.error(`[Indicator] Error loading wallpaper sources: ${e}`);
        }
        return {};
    }

    _connectSettings() {
        this._settingsChangedId = this._settings.connect('changed::selected-sources', () => this.refresh());
        }

        destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
        }
    });
