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
import Graphene from 'gi://Graphene';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { WallpaperInfoDialog } from './infoDialog.js';


const SourceMenuItem = GObject.registerClass(
class SourceMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(sourceId, sourceData, indicator) {
        super._init({ activate: false }); // Don't close menu on click automatically
        
        this._sourceId = sourceId;
        this._sourceData = sourceData;
        this._indicator = indicator;

        // Main layout
        this._box = new St.BoxLayout({ 
            style_class: 'wallpaper-source-row',
            x_expand: true,
            y_expand: true,
            vertical: false
        });
        this.add_child(this._box);

        // Source Name
        this._label = new St.Label({
            text: sourceData.name || sourceId,
            style_class: 'wallpaper-source-name',
            y_align: Clutter.ActorAlign.CENTER
        });
        this._box.add_child(this._label);

        // Spacer
        this._box.add_child(new St.Bin({ style_class: 'popup-menu-item-spacer', x_expand: true }));

        // Status Icon (Spinner or Error)
        this._statusIcon = new St.Icon({
            style_class: 'popup-menu-icon wallpaper-source-status',
            icon_name: '', // hidden initially
            y_align: Clutter.ActorAlign.CENTER,
            icon_size: 16,
        });
        try {
            this._statusIcon.set_pivot_point(new Graphene.Point({ x: 0.5, y: 0.5 }));
        } catch (e) {
            // Fallback or ignore if Graphene fails (shouldn't on GNOME 48)
        }
        this._box.add_child(this._statusIcon);

        // Buttons Box
        this._buttonsBox = new St.BoxLayout({ 
            style_class: 'wallpaper-source-buttons'
        });
        this._box.add_child(this._buttonsBox);

        // Info Button
        this._infoBtn = this._createButton('dialog-information-symbolic', () => {
            this._indicator.showInfoDialog(this._sourceId);
        });
        this._buttonsBox.add_child(this._infoBtn);

        // Set/Download Button
        this._actionBtn = this._createButton('media-playback-start-symbolic', () => {
            this._indicator.emit('set-wallpaper-for-source', this._sourceId);
        });
        this._buttonsBox.add_child(this._actionBtn);
        
        this.updateStatus('pending');
    }

    _createButton(iconName, callback) {
        const btn = new St.Button({
            style_class: 'wallpaper-source-button button',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                icon_name: iconName,
                style_class: 'popup-menu-icon',
                icon_size: 16,
            })
        });

        btn.connect('clicked', () => {
            callback();
        });

        return btn;
    }

    updateStatus(status) {
        let iconName = '';
        let styleClass = 'popup-menu-icon wallpaper-source-status';
        let showAction = true;
        let showInfo = false;

        switch (status) {
            case 'downloading':
                iconName = 'process-working-symbolic';
                styleClass += ' spinning';
                showAction = false; // Hide action button while downloading
                break;
            case 'cached':
                showInfo = true;
                break;
            case 'error':
                iconName = 'dialog-error-symbolic';
                styleClass += ' error-label';
                break;
            case 'pending':
            default:
                // When pending or default, we might want to show a "not yet downloaded" icon or keep it empty.
                // The user complained about not seeing icons for pending/downloading/error.
                if (status === 'pending') {
                    // Maybe show a cloud icon to indicate it needs download? 
                    // Or keep empty if that's the design. User said "pending ... icon yok".
                    // Let's try showing something for pending too if desired, or ensure 'downloading' works.
                }
                break;
        }

        // Assign icon name. If empty, St.Icon might hide or show nothing.
        // Ensure the icon is visible if we have a name.
        this._statusIcon.icon_name = iconName;
        this._statusIcon.style_class = styleClass;
        this._statusIcon.visible = (iconName !== ''); // Explicitly control visibility based on icon presence

        // Toggle visibility based on state
        this._infoBtn.visible = showInfo;
        this._actionBtn.visible = showAction;
        
        if (status === 'cached') {
             // If cached, action button means "Set" (Play icon)
             this._actionBtn.child.icon_name = 'media-playback-start-symbolic';
        } else {
             // If not cached, action button means "Download & Set" (Download icon)
             this._actionBtn.child.icon_name = 'cloud-download-symbolic';
        }
    }
});


export const Indicator = GObject.registerClass({
    Signals: {
        'set-wallpaper-for-source': { param_types: [GObject.TYPE_STRING] },
    },
}, class Indicator extends PanelMenu.Button {
    _init(settings, wallpaperManager) {
        super._init(0.0, _('Pardus Daily Wallpaper'));
        this._settings = settings;
        this._wallpaperManager = wallpaperManager;
        this.path = Extension.lookupByURL(import.meta.url).path;

        this._sourceRows = {};

        this._icon = new St.Icon({
            icon_name: 'preferences-desktop-wallpaper-symbolic', // Use a standard system icon
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

        if (selectedSources.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(_('No sources selected')));
        } else {
            for (const sourceId of selectedSources) {
                const sourceData = sources[sourceId];
                if(sourceData) {
                    this._buildSourceRow(sourceId, sourceData);
                }
            }
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._buildGeneralSection();
    }

    _buildSourceRow(sourceId, sourceData) {
        const menuItem = new SourceMenuItem(sourceId, sourceData, this);
        this.menu.addMenuItem(menuItem);
        this._sourceRows[sourceId] = menuItem;

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
            console.error(`[Indicator] Failed to check cache for ${sourceId}:`, e);
            return false;
        }
    }

    updateSourceStatus(sourceId, status) {
        const sourceRow = this._sourceRows[sourceId];
        if (sourceRow) {
            sourceRow.updateStatus(status);
        }
    }

    showInfoDialog(sourceId) {
        // Close the menu first
        this.menu.close();
        
        const dialog = new WallpaperInfoDialog(sourceId, this._wallpaperManager);
        dialog.open();
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
