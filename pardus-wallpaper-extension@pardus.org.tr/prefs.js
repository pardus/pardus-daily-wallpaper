/* prefs.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PardusWallpaperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        // General page
        const generalPage = this._createGeneralPage(settings);
        window.add(generalPage);
        
        // Sources page
        const sourcesPage = this._createSourcesPage(settings, window);
        window.add(sourcesPage);
    }
    
    _createGeneralPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        
        // Live Wallpapers group
        const group = new Adw.PreferencesGroup({
            title: 'Live Wallpapers',
            description: 'Automatically download and shuffle wallpapers',
        });
        
        // Enable switch
        const enableRow = new Adw.SwitchRow({
            title: 'Enable Live Wallpapers',
            subtitle: 'Download and shuffle wallpapers automatically',
        });
        settings.bind('enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(enableRow);
        
        // Auto download daily
        const autoDownloadRow = new Adw.SwitchRow({
            title: 'Auto Download Daily',
            subtitle: 'Automatically download new wallpapers each day',
        });
        settings.bind('auto-download-daily', autoDownloadRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(autoDownloadRow);
        
        // Keep cache
        const keepCacheRow = new Adw.SwitchRow({
            title: 'Keep Downloaded Images in Cache',
            subtitle: 'If disabled, only today\'s images are kept',
        });
        settings.bind('keep-cache', keepCacheRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(keepCacheRow);
        
        // Shuffle interval - Hours
        const shuffleHoursRow = new Adw.SpinRow({
            title: 'Shuffle Interval - Hours',
            subtitle: 'Hours between wallpaper changes',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 23,
                step_increment: 1,
                page_increment: 1,
                value: 0,
            }),
        });
        
        // Shuffle interval - Minutes
        const shuffleMinutesRow = new Adw.SpinRow({
            title: 'Shuffle Interval - Minutes',
            subtitle: 'Minutes between wallpaper changes',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 59,
                step_increment: 1,
                page_increment: 5,
                value: 30,
            }),
        });
        
        // Load current interval and split into hours and minutes
        const currentInterval = settings.get_int('shuffle-interval');
        const hours = Math.floor(currentInterval / 60);
        const minutes = currentInterval % 60;
        shuffleHoursRow.value = hours;
        shuffleMinutesRow.value = minutes || 1;
        
        // Update settings when hours change
        shuffleHoursRow.connect('notify::value', (widget) => {
            const totalMinutes = (widget.value * 60) + shuffleMinutesRow.value;
            settings.set_int('shuffle-interval', Math.max(1, totalMinutes));
        });
        
        // Update settings when minutes change
        shuffleMinutesRow.connect('notify::value', (widget) => {
            const totalMinutes = (shuffleHoursRow.value * 60) + widget.value;
            settings.set_int('shuffle-interval', Math.max(1, totalMinutes));
        });
        
        // Function to update sensitivity based on selected sources
        const updateShuffleSensitivity = () => {
            const selectedSources = settings.get_strv('selected-sources');
            const enabled = selectedSources.length > 1;
            shuffleHoursRow.sensitive = enabled;
            shuffleMinutesRow.sensitive = enabled;
            
            if (!enabled) {
                shuffleHoursRow.subtitle = 'Select multiple sources to enable shuffle';
                shuffleMinutesRow.subtitle = 'Select multiple sources to enable shuffle';
            } else {
                shuffleHoursRow.subtitle = 'Hours between wallpaper changes';
                shuffleMinutesRow.subtitle = 'Minutes between wallpaper changes';
            }
        };
        
        // Initial sensitivity check
        updateShuffleSensitivity();
        
        // Listen for changes to selected sources
        settings.connect('changed::selected-sources', updateShuffleSensitivity);
        
        group.add(shuffleHoursRow);
        group.add(shuffleMinutesRow);
        
        page.add(group);
        
        return page;
    }
    
    _createSourcesPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: 'Sources',
            icon_name: 'folder-download-symbolic',
        });
        
        // Sources group
        const sourcesGroup = new Adw.PreferencesGroup({
            title: 'Wallpaper Sources',
            description: 'Select which sources to download from',
        });
        
        // Download All button row
        const downloadAllRow = new Adw.ActionRow({
            title: 'Download All Sources',
            subtitle: 'Download wallpapers from all selected sources',
        });
        
        const downloadAllButton = new Gtk.Button({
            icon_name: 'emblem-downloads-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        downloadAllButton.connect('clicked', () => {
            this._showDownloadDialog(window, settings, null);
        });
        downloadAllRow.add_suffix(downloadAllButton);
        downloadAllRow.activatable_widget = downloadAllButton;
        sourcesGroup.add(downloadAllRow);
        
        // Load wallpaper sources
        const sources = this._loadWallpaperSources();
        const selectedSources = settings.get_strv('selected-sources');
        
        // Create a row for each source
        for (const [sourceId, sourceData] of Object.entries(sources)) {
            const sourceRow = new Adw.ActionRow({
                title: sourceData.name,
                subtitle: sourceData.description,
            });
            
            // Checkbox for enable/disable
            const checkButton = new Gtk.CheckButton({
                valign: Gtk.Align.CENTER,
            });
            checkButton.active = selectedSources.includes(sourceId);
            checkButton.connect('toggled', (widget) => {
                const currentSources = settings.get_strv('selected-sources');
                if (widget.active) {
                    if (!currentSources.includes(sourceId)) {
                        currentSources.push(sourceId);
                        settings.set_strv('selected-sources', currentSources);
                    }
                } else {
                    const filtered = currentSources.filter(s => s !== sourceId);
                    settings.set_strv('selected-sources', filtered);
                }
            });
            sourceRow.add_prefix(checkButton);
            
            // Info button
            const infoButton = new Gtk.Button({
                icon_name: 'dialog-information-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            infoButton.connect('clicked', () => {
                this._showSourceInfo(window, sourceId, sourceData);
            });
            sourceRow.add_suffix(infoButton);
            
            // Download button
            const downloadButton = new Gtk.Button({
                icon_name: 'document-save-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            downloadButton.connect('clicked', () => {
                this._showDownloadDialog(window, settings, sourceId);
            });
            sourceRow.add_suffix(downloadButton);
            
            sourcesGroup.add(sourceRow);
        }
        
        page.add(sourcesGroup);
        
        return page;
    }
    
    _loadWallpaperSources() {
        try {
            const sourcesPath = GLib.build_filenamev([this.path, 'data', 'wallpaper_sources.json']);
            const file = Gio.File.new_for_path(sourcesPath);
            
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const contentsString = decoder.decode(contents);
                    const data = JSON.parse(contentsString);
                    // Return sources object from the JSON
                    return data.sources || data || {};
                }
            }
        } catch (e) {
            console.error('Failed to load wallpaper sources:', e);
        }
        
        return {};
    }
    
    _showSourceInfo(window, sourceId, sourceData) {
        const dialog = new Adw.MessageDialog({
            transient_for: window,
            heading: sourceData.name,
            body: `${sourceData.description}\n\nAPI: ${sourceData.api_url}`,
        });
        dialog.add_response('ok', 'OK');
        dialog.present();
    }
    
    _showDownloadDialog(window, settings, sourceId) {
        const dialog = new Gtk.Dialog({
            title: 'Downloading Wallpapers',
            transient_for: window,
            modal: true,
            default_width: 400,
            default_height: 300,
        });
        
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        
        const statusLabel = new Gtk.Label({
            label: 'Preparing to download...',
            wrap: true,
        });
        contentBox.append(statusLabel);
        
        const progressBar = new Gtk.ProgressBar({
            show_text: true,
        });
        contentBox.append(progressBar);
        
        const detailsLabel = new Gtk.Label({
            label: '',
            wrap: true,
            xalign: 0,
        });
        contentBox.append(detailsLabel);
        
        dialog.get_content_area().append(contentBox);
        
        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
        const closeButton = dialog.add_button('Close', Gtk.ResponseType.CLOSE);
        closeButton.sensitive = false;
        
        dialog.connect('response', (dialog, response) => {
            dialog.close();
        });
        
        dialog.present();
        
        // TODO: Implement actual download logic
        // For now, just simulate progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += 0.1;
            if (progress >= 1.0) {
                progress = 1.0;
                clearInterval(interval);
                statusLabel.label = 'Download complete!';
                closeButton.sensitive = true;
            }
            progressBar.fraction = progress;
            progressBar.text = `${Math.round(progress * 100)}%`;
            detailsLabel.label = sourceId ? `Downloading ${sourceId}...` : `Downloading all sources...`;
        }, 500);
    }
}
