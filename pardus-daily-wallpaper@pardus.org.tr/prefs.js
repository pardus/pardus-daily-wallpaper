/* prefs.js
 *
 * Preferences window for the Pardus Daily Wallpaper extension.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { WallpaperManager } from './wallpaperManager.js';


const WALLPAPER_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-daily-wallpaper']);


const WallpaperInfoDialog = GObject.registerClass(
class WallpaperInfoDialog extends Adw.Window {
    _init(wallpaperFile, metadata, parent) {
        super._init({
            transient_for: parent,
            modal: true,
            resizable: false,
            title: metadata.title || _('Wallpaper Information'),
        });

        this.set_default_size(500, -1); // Set width to 500px, height proportional

        this._wallpaperFile = wallpaperFile;
        this._metadata = metadata;

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            css_classes: ['dialog-vbox'],
        });
        this.set_content(mainBox);

        // HeaderBar
        const header = new Adw.HeaderBar({
            css_classes: ['flat'],
        });
        mainBox.append(header);

        const setWallpaperBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            tooltip_text: _('Set as Wallpaper'),
        });
        setWallpaperBtn.connect('clicked', () => {
            this._setAsWallpaper();
            this.close();
        });
        header.pack_start(setWallpaperBtn);

        const openFolderBtn = new Gtk.Button({
            icon_name: 'folder-open-symbolic',
            tooltip_text: _('Open Containing Folder'),
        });
        openFolderBtn.connect('clicked', () => {
            this._openContainingFolder();
            this.close();
        });
        header.pack_start(openFolderBtn);
        
        // --- Content ---

        // Wallpaper Image
        const picture = new Gtk.Picture({
            file: this._wallpaperFile,
            can_shrink: true,
            valign: Gtk.Align.START,
        });
        mainBox.append(picture);

        // Info Box
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 18,
            margin_bottom: 18,
            margin_start: 18,
            margin_end: 18,
        });
        mainBox.append(infoBox);

        const titleLabel = new Gtk.Label({
            label: `<b>${this._metadata.title || 'Untitled'}</b>`,
            use_markup: true,
            xalign: 0,
            css_classes: ['title-1'],
        });
        infoBox.append(titleLabel);

        if (this._metadata.description) {
            const descriptionLabel = new Gtk.Label({
                label: this._metadata.description,
                xalign: 0,
                wrap: true,
                css_classes: ['body'],
                margin_bottom: 12,
            });
            infoBox.append(descriptionLabel);
        }

        const detailsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 24,
            halign: Gtk.Align.START,
            css_classes: ['dim-label'],
        });
        infoBox.append(detailsBox);

        const sourceBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        sourceBox.append(new Gtk.Image({ icon_name: 'avatar-default-symbolic', pixel_size: 16 }));
        sourceBox.append(new Gtk.Label({ label: this._metadata.source || 'Unknown Source' }));
        detailsBox.append(sourceBox);
        
        const dateBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        const dateStr = this._wallpaperFile.get_parent().get_basename();
        const [day, month, year] = dateStr.split('.').map(s => parseInt(s, 10));
        let formattedDate = dateStr;

        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            try {
                const dateTime = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
                formattedDate = dateTime.format('%d %B %Y');
            } catch (e) {
                logError(e, 'Failed to format date string for info dialog');
            }
        }
        
        dateBox.append(new Gtk.Image({ icon_name: 'view-calendar-symbolic', pixel_size: 16 }));
        dateBox.append(new Gtk.Label({ label: formattedDate }));
        detailsBox.append(dateBox);

        // Copyright (New)
        if (this._metadata.copyright) {
            const copyrightLabel = new Gtk.Label({
                label: `© ${this._metadata.copyright}`,
                xalign: 0,
                wrap: true,
                css_classes: ['caption', 'dim-label'],
                margin_top: 6,
            });
            infoBox.append(copyrightLabel);
        }
    }
    
    _openContainingFolder() {
        try {
            const parentDir = this._wallpaperFile.get_parent();
            if (parentDir) {
                const uri = parentDir.get_uri();
                Gio.AppInfo.launch_default_for_uri_async(uri, null, null, null);
            }
        } catch (e) {
            logError(e, 'Failed to open wallpaper folder');
        }
    }

    _setAsWallpaper() {
        const fileUri = this._wallpaperFile.get_uri();
        const bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
        bgSettings.set_string('picture-uri', fileUri);
        bgSettings.set_string('picture-uri-dark', fileUri);
    }
});


class WallpaperRow extends Adw.ActionRow {
    _init(wallpaperFile, prefs) {
        this._wallpaperFile = wallpaperFile; // Gio.File for the image
        this._prefs = prefs;
        this._metadata = this._loadMetadata();

        const sourceName = this._metadata?.source || 'Unknown Source';
        const title = this._metadata?.title || this._wallpaperFile.get_basename();

        super._init({
            title: sourceName,
            subtitle: title,
        });

        this._preview = new Gtk.Image({
            pixel_size: 64,
            margin_end: 12,
        });
        this.add_prefix(this._preview);
        this._preview.set_from_file(this._wallpaperFile.get_path());

        const buttonBox = new Gtk.Box({ spacing: 6, valign: Gtk.Align.CENTER });
        this.add_suffix(buttonBox);

        const infoButton = new Gtk.Button({ icon_name: 'dialog-information-symbolic', tooltip_text: _('Information') });
        const setButton = new Gtk.Button({ icon_name: 'media-playback-start-symbolic', tooltip_text: _('Set as Wallpaper') });
        
        buttonBox.append(infoButton);
        buttonBox.append(setButton);

        infoButton.connect('clicked', () => this._showInfoDialog());
        setButton.connect('clicked', () => this._setAsWallpaper());
    }

    _loadMetadata() {
        const basename = this._wallpaperFile.get_basename();
        const sourceId = basename.substring(0, basename.lastIndexOf('.'));
        const jsonFile = this._wallpaperFile.get_parent().resolve_relative_path(`${sourceId}.json`);

        if (!jsonFile.query_exists(null)) return null;

        try {
            const [ok, contents] = jsonFile.load_contents(null);
            if (ok) return JSON.parse(new TextDecoder().decode(contents));
        } catch (e) {
            logError(e, `[Prefs] Error loading metadata for ${sourceId}`);
        }
        return null;
    }

    _showInfoDialog() {
        if (!this._metadata) return;

        const dialog = new WallpaperInfoDialog(this._wallpaperFile, this._metadata, this.get_root());
        dialog.present();
    }

    _setAsWallpaper() {
        const fileUri = this._wallpaperFile.get_uri();
        const bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
        bgSettings.set_string('picture-uri', fileUri);
        bgSettings.set_string('picture-uri-dark', fileUri);
    }
}

GObject.registerClass(WallpaperRow);


const DownloadProgressDialog = GObject.registerClass({
    Signals: {
        'downloads-finished': {},
    },
},
class DownloadProgressDialog extends Adw.Window {
    _init(missingSources, parent) {
        super._init({
            transient_for: parent,
            modal: true,
            title: _('Downloading Wallpapers...'),
        });

        this._missingSources = missingSources;
        this._wallpaperManager = new WallpaperManager(null); // Settings not needed for download
        this._progressRows = {};
        this._completed = 0;
        this._total = missingSources.length;
        
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 18,
            margin_bottom: 18,
            margin_start: 18,
            margin_end: 18,
            width_request: 500,
        });
        this.set_content(mainBox);

        // Overall progress
        const overallLabel = new Gtk.Label({ label: `<b>${_('Overall Progress')}</b>`, use_markup: true, xalign: 0 });
        mainBox.append(overallLabel);
        this._overallProgressBar = new Gtk.ProgressBar({ hexpand: true, valign: Gtk.Align.CENTER });
        mainBox.append(this._overallProgressBar);
        
        mainBox.append(new Gtk.Separator({ margin_top: 6, margin_bottom: 6 }));

        // Individual progress
        const sources = this._wallpaperManager.loadSourcesConfig();
        for (const sourceId of missingSources) {
            const sourceData = sources[sourceId] || { name: sourceId };
            
            const title = new Gtk.Label({
                label: sourceData.name,
                hexpand: true,
                xalign: 0,
            });

            const progressBar = new Gtk.ProgressBar({
                valign: Gtk.Align.CENTER,
                width_request: 200,
                margin_end: 6,
            });

            const statusIcon = new Gtk.Image({
                icon_name: 'document-open-recent-symbolic',
                valign: Gtk.Align.CENTER,
            });
            
            const mainLine = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
            });
            mainLine.append(title);
            mainLine.append(progressBar);
            mainLine.append(statusIcon);

            const errorLabel = new Gtk.Label({
                wrap: true,
                xalign: 0,
                halign: Gtk.Align.START,
                css_classes: ['error-label', 'dim-label'],
                visible: false,
                margin_top: 3,
            });

            const progressRowBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                margin_bottom: 12,
            });
            progressRowBox.append(mainLine);
            progressRowBox.append(errorLabel);
            mainBox.append(progressRowBox);

            this._progressRows[sourceId] = { progressBar, statusIcon, errorLabel };
        }

        this._startDownloads();
    }

    async _startDownloads() {
        for (const sourceId of this._missingSources) {
            this.updateSourceStatus(sourceId, 'downloading');
            try {
                const progressCallback = (fraction) => {
                    this._progressRows[sourceId].progressBar.set_fraction(fraction);
                };
                await this._wallpaperManager.downloadFromSource(sourceId, progressCallback);
                this.updateSourceStatus(sourceId, 'success');
            } catch (e) {
                console.error(`Failed to download ${sourceId} in dialog`, e);
                this.updateSourceStatus(sourceId, 'error', e.message);
            }
            this._completed++;
            this._overallProgressBar.set_fraction(this._completed / this._total);
        }
        
        if (this._completed === this._total) {
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                this.emit('downloads-finished');
                this.close();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    updateSourceStatus(sourceId, status, errorMessage = null) {
        const row = this._progressRows[sourceId];
        if (!row) return;

        let iconName = 'document-open-recent-symbolic';
        row.progressBar.fraction = 0;
        row.errorLabel.set_visible(false);

        switch (status) {
            case 'downloading':
                iconName = 'cloud-download-symbolic';
                break;
            case 'success':
                iconName = 'emblem-ok-symbolic';
                row.progressBar.fraction = 1.0;
                break;
            case 'error':
                iconName = 'dialog-error-symbolic';
                if (errorMessage) {
                    let friendlyMessage = errorMessage;
                    if (errorMessage.includes('429')) {
                        friendlyMessage = _('Too many requests. Please try again later.');
                    }
                    row.errorLabel.set_label(friendlyMessage);
                    row.errorLabel.set_visible(true);
                }
                break;
        }
        row.statusIcon.icon_name = iconName;
    }
});


export default class PardusWallpaperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._window = window;
        this._httpSession = new Soup.Session();
        const settings = this.getSettings();
        
        this._sourcesPage = this._createSourcesPage(settings, window);
        this._window.add(this._sourcesPage);
        
        this._myWallpapersPage = this._createMyWallpapersPage();
        this._window.add(this._myWallpapersPage);
    }
    
    _createSourcesPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: 'Sources',
            icon_name: 'folder-download-symbolic',
        });
        
        const sourcesGroup = new Adw.PreferencesGroup({
            title: 'Wallpaper Sources',
            description: 'Select which sources to download from',
        });
        
        const sources = this._loadWallpaperSources();
        const selectedSources = settings.get_strv('selected-sources');
        
        for (const [sourceId, sourceData] of Object.entries(sources)) {
            const switchRow = new Adw.SwitchRow({
                title: sourceData.name,
                subtitle: sourceData.description,
            });
            switchRow.set_active(selectedSources.includes(sourceId));

            switchRow.connect('notify::active', (widget) => {
                const currentSources = settings.get_strv('selected-sources');
                const isActive = widget.get_active();
                const isPresent = currentSources.includes(sourceId);

                if (isActive && !isPresent) {
                    currentSources.push(sourceId);
                    settings.set_strv('selected-sources', currentSources);
                } else if (!isActive && isPresent) {
                    const newSources = currentSources.filter(s => s !== sourceId);
                    settings.set_strv('selected-sources', newSources);
                }
            });
            sourcesGroup.add(switchRow);
        }
        
        page.add(sourcesGroup);
        return page;
    }


    _createMyWallpapersPage() {
        const page = new Adw.PreferencesPage({
            title: _('My Wallpapers'),
            icon_name: 'folder-pictures-symbolic',
        });

        this._buildMyWallpapersContent(page);
        return page;
    }

    _buildMyWallpapersContent(page) {
        // Since we are recreating the page on refresh, we don't need to clear content manually here.
        // This avoids any issues with removing internal children of AdwPreferencesPage.

        const mainDir = Gio.File.new_for_path(WALLPAPER_DIR);
        if (!mainDir.query_exists(null)) {
            const group = new Adw.PreferencesGroup();
            page.add(group);
            group.add(new Adw.ActionRow({ title: _('No wallpapers downloaded yet.') }));
            return;
        }

        try {
            const dateDirs = this._getDateDirectories(mainDir);

            if (dateDirs.length === 0) {
                 const group = new Adw.PreferencesGroup();
                 page.add(group);
                 group.add(new Adw.ActionRow({ title: _('No wallpapers found in cache.') }));
                 return;
            }

            const todayStr = GLib.DateTime.new_now_local().format('%d.%m.%Y');
            const settings = this.getSettings();
            const selectedSources = settings.get_strv('selected-sources');

            for (const dateDir of dateDirs) {
                const dateName = dateDir.get_basename();

                let formattedDate = dateName;
                try {
                    const [day, month, year] = dateName.split('.').map(Number);
                    const dateTime = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
                    formattedDate = dateTime.format('%d %B %Y');
                } catch (e) {
                    // ignore
                }

                const title = dateName === todayStr
                    ? `${formattedDate} (${_('Today')})`
                    : formattedDate;

                const group = new Adw.PreferencesGroup({ title: title });
                page.add(group);
                
                const wallpapers = this._getWallpapersInDirectory(dateDir);

                if (dateName === todayStr) {
                    const downloadedSourceIds = wallpapers.map(file => {
                        const basename = file.get_basename();
                        return basename.substring(0, basename.lastIndexOf('.'));
                    });
                    
                    const missingSources = selectedSources.filter(id => !downloadedSourceIds.includes(id));

                    if (missingSources.length > 0) {
                        const retryButton = new Gtk.Button({
                            icon_name: 'view-refresh-symbolic',
                            valign: Gtk.Align.CENTER,
                            tooltip_text: _('Retry Missing Downloads (%d)').format(missingSources.length),
                            css_classes: ['flat'],
                        });
                        retryButton.connect('clicked', () => {
                            this._showDownloadProgressDialog(missingSources);
                        });
                        group.set_header_suffix(retryButton);
                    }
                }

                const listBox = new Gtk.ListBox({
                    selection_mode: Gtk.SelectionMode.NONE,
                    css_classes: ['boxed-list'],
                });
                group.add(listBox);

                for (const wallpaperFile of wallpapers) {
                    listBox.append(new WallpaperRow(wallpaperFile, this));
                }
            }
        } catch (e) {
            logError(e, '[Prefs] Error reading wallpaper cache');
            const group = new Adw.PreferencesGroup();
            page.add(group);
            group.add(new Adw.ActionRow({ 
                title: _('Error reading cache'),
                subtitle: e.message
            }));
        }
    }
    
    _showDownloadProgressDialog(missingSources) {
        const dialog = new DownloadProgressDialog(missingSources, this._window);
        dialog.connect('downloads-finished', () => this._refreshMyWallpapersPage());
        dialog.present();
    }

    _refreshMyWallpapersPage() {
        if (this._myWallpapersPage) {
            this._window.remove(this._myWallpapersPage);
        }

        this._myWallpapersPage = this._createMyWallpapersPage();
        this._window.add(this._myWallpapersPage);
    }

    _getDateDirectories(mainDir) {
        const enumerator = mainDir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const dirs = [];
        let fileInfo;
        while ((fileInfo = enumerator.next_file(null))) {
            if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                // Basic check for DD.MM.YYYY format
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(fileInfo.get_name())) {
                    dirs.push(enumerator.get_child(fileInfo));
                }
            }
        }
        // Sort by date, newest first
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
                logError(e, `Failed to parse or compare dates: ${nameA}, ${nameB}`);
                return 0;
            }
        });
        return dirs;
    }

    _getWallpapersInDirectory(dateDir) {
        const enumerator = dateDir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        const wallpapers = [];
        let fileInfo;
        while ((fileInfo = enumerator.next_file(null))) {
            const name = fileInfo.get_name();
            if (name.endsWith('.jpg') || name.endsWith('.png')) {
                wallpapers.push(enumerator.get_child(fileInfo));
            }
        }
        return wallpapers;
    }

    // SELF-CONTAINED UTILITY FUNCTIONS
    
    _getTodayString() {
        return GLib.DateTime.new_now_local().format('%d.%m.%Y');
    }

    _getDailyCacheDir() {
        return GLib.build_filenamev([WALLPAPER_DIR, this._getTodayString()]);
    }

    _ensureCacheDir(dirPath) {
        const dir = Gio.File.new_for_path(dirPath);
        if (!dir.query_exists(null)) {
            dir.make_directory_with_parents(null);
        }
    }

    _loadMetadata(cacheDir, sourceId) {
        const jsonPath = GLib.build_filenamev([cacheDir.get_path(), `${sourceId}.json`]);
        const file = Gio.File.new_for_path(jsonPath);
        if (!file.query_exists(null)) return null;

        try {
            const [ok, contents] = file.load_contents(null);
            if (ok) return JSON.parse(new TextDecoder().decode(contents));
        } catch (e) {
            console.error(`[Prefs] Error loading metadata for ${sourceId}: ${e}`);
        }
        return null;
    }
    
    async _downloadFromSource(sourceId, sourceConfig) {
        let apiUrl = sourceConfig.api_url;
        if (!apiUrl) throw new Error('No API URL in config');

        // Replace date placeholders
        const now = GLib.DateTime.new_now_local();
        apiUrl = apiUrl.replace('{year}', now.get_year())
                       .replace('{month:02d}', String(now.get_month()).padStart(2, '0'))
                       .replace('{day:02d}', String(now.get_day_of_month()).padStart(2, '0'));

        const apiResponse = await this._fetchFromAPI(apiUrl, sourceConfig.headers || {});
        
        let imageUrl = this._extractField(apiResponse, sourceConfig.response_mapping?.image_url_keys);
        if (!imageUrl) throw new Error('No image URL found in API response');
        
        if (sourceConfig.response_mapping?.image_url_prefix) {
            imageUrl = sourceConfig.response_mapping.image_url_prefix + imageUrl;
        }

        const cacheDir = this._getDailyCacheDir();
        this._ensureCacheDir(cacheDir.get_path());

        const extension = imageUrl.split('.').pop().split('?')[0] || 'jpg';
        const filename = `${sourceId}.${extension}`;
        const imagePath = GLib.build_filenamev([cacheDir.get_path(), filename]);

        await this._downloadImage(imageUrl, imagePath, sourceConfig.headers || {});

        const metadata = {
            source: sourceConfig.name || sourceId,
            title: this._extractField(apiResponse, sourceConfig.response_mapping?.title_keys) || 'Untitled',
            description: this._extractField(apiResponse, sourceConfig.response_mapping?.description_keys) || '',
            filename: filename,
        };
        const jsonPath = GLib.build_filenamev([cacheDir.get_path(), `${sourceId}.json`]);
        const metadataString = JSON.stringify(metadata, null, 2);
        const metadataBytes = new GLib.Bytes(new TextEncoder().encode(metadataString));
        
        const file = Gio.File.new_for_path(jsonPath);
        await file.replace_contents_bytes_async(metadataBytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    async _fetchFromAPI(url, headers) {
        const message = Soup.Message.new('GET', url);
        for (const [key, value] of Object.entries(headers)) {
            message.get_request_headers().append(key, value);
        }
        
        const bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        
        if (message.get_status() !== 200) {
            const responseBody = new TextDecoder().decode(bytes.get_data());
            throw new Error(`HTTP Error ${message.get_status()}: ${responseBody}`);
        }
        
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    _extractField(obj, keys) {
        if (!obj || !Array.isArray(keys)) return null;
        for (const keyPath of keys) {
            let value = keyPath.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
            if (value !== null) return String(value);
        }
        return null;
    }

    async _downloadImage(url, filepath, headers) {
        const message = Soup.Message.new('GET', url);
         for (const [key, value] of Object.entries(headers)) {
            message.get_request_headers().append(key, value);
        }
        
        const bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        
        if (message.get_status() !== 200) {
            throw new Error(`HTTP Error ${message.get_status()} while downloading image`);
        }
        
        const file = Gio.File.new_for_path(filepath);
        const [success] = await file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

        if (!success) {
            throw new Error('Failed to save image file');
        }
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
             console.error(`[Prefs] Error loading wallpaper sources: ${e}`);
        }
        return {};
    }
}

