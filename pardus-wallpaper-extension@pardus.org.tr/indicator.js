/* indicator.js
 *
 * Panel Indicator - Top panel icon with popup menu for wallpaper controls
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { WallpaperInfoDialog } from './infoDialog.js';

export const WallpaperIndicator = GObject.registerClass(
    class WallpaperIndicator extends PanelMenu.Button {
        _init(settings, wallpaperManager, extensionPath) {
            super._init(0.0, 'Pardus Live Wallpaper');

            this._settings = settings;
            this._wallpaperManager = wallpaperManager;
            this._extensionPath = extensionPath;
            this._signalIds = [];
            this._isDownloading = false;
            this._downloadStates = {}; // Track per-source download status
            this._sourceRows = {}; // Store source row widgets

            // Create panel icon
            this._icon = new St.Icon({
                icon_name: 'preferences-desktop-wallpaper-symbolic',
                style_class: 'system-status-icon',
            });
            this.add_child(this._icon);

            // Build popup menu
            this._buildPopupMenu();

            // Connect to settings changes
            this._connectSettings();
        }

        /**
         * Set downloading state (show/hide spinner)
         * @param {boolean} isDownloading - True if downloading
         */
        setDownloadingState(isDownloading) {
            this._isDownloading = isDownloading;

            if (isDownloading) {
                this._icon.icon_name = 'content-loading-symbolic';
            } else {
                this._icon.icon_name = 'preferences-desktop-wallpaper-symbolic';
            }
        }

        /**
         * Update source download status
         * @param {string} sourceId - Source identifier
         * @param {string} status - Status: 'pending', 'downloading', 'success', 'error'
         */
        updateSourceStatus(sourceId, status) {
            this._downloadStates[sourceId] = status;

            // Update UI if source row exists
            if (this._sourceRows[sourceId]) {
                this._updateSourceRowStatus(sourceId, status);
            }
        }

        _buildPopupMenu() {
            // Enable/Disable toggle
            this._enableToggle = new PopupMenu.PopupSwitchMenuItem(
                'Live Wallpapers',
                this._settings.isEnabled()
            );
            this._enableToggle.connect('toggled', (item) => {
                this._settings.setEnabled(item.state);
            });
            this.menu.addMenuItem(this._enableToggle);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Sources section
            this._sourcesSection = new PopupMenu.PopupMenuSection();
            const sourcesLabel = new PopupMenu.PopupMenuItem('Wallpaper Sources', {
                reactive: false,
                can_focus: false,
            });
            sourcesLabel.label.style = 'font-weight: bold;';
            this._sourcesSection.addMenuItem(sourcesLabel);

            // Load sources
            this._loadSources();

            this.menu.addMenuItem(this._sourcesSection);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Cycle interval
            const intervalLabel = new PopupMenu.PopupMenuItem('Update Frequency', {
                reactive: false,
                can_focus: false,
            });
            intervalLabel.label.style = 'font-weight: bold;';
            this.menu.addMenuItem(intervalLabel);

            const intervalItem = new PopupMenu.PopupMenuItem(
                `Cycle Interval: ${this._settings.getShuffleInterval()} minutes`,
                { reactive: false }
            );
            this.menu.addMenuItem(intervalItem);
            this._intervalItem = intervalItem;
        }

        _loadSources() {
            try {
                const config = this._wallpaperManager.loadSourcesConfig();
                if (!config) {
                    return;
                }

                const selectedSources = this._settings.getSelectedSources();

                for (const [sourceId, sourceInfo] of Object.entries(config)) {
                    const isSelected = selectedSources.includes(sourceId);

                    if (isSelected) {
                        const sourceRow = this._buildSourceRow(sourceId, sourceInfo);
                        this._sourcesSection.addMenuItem(sourceRow);
                        this._sourceRows[sourceId] = sourceRow;
                    }
                }
            } catch (e) {
                console.error('Failed to load wallpaper sources:', e);
            }
        }

        /**
         * Build a source row with thumbnail, name, status, and action buttons
         * @param {string} sourceId - Source identifier
         * @param {Object} sourceInfo - Source configuration
         * @returns {PopupMenu.PopupBaseMenuItem} Source row widget
         */
        _buildSourceRow(sourceId, sourceInfo) {
            const item = new PopupMenu.PopupBaseMenuItem({
                reactive: true,
                can_focus: true,
            });

            // Container box
            const box = new St.BoxLayout({
                vertical: false,
                style_class: 'wallpaper-source-row',
                x_expand: true,
            });

            // Thumbnail (placeholder for now)
            const thumbnail = new St.Icon({
                icon_name: 'image-x-generic-symbolic',
                icon_size: 48,
                style_class: 'wallpaper-source-thumbnail',
            });
            box.add_child(thumbnail);

            // Name label
            const nameLabel = new St.Label({
                text: sourceInfo.name || sourceId,
                y_align: St.Align.MIDDLE,
                x_expand: true,
                style_class: 'wallpaper-source-name',
            });
            box.add_child(nameLabel);

            // Status indicator
            const statusIcon = new St.Icon({
                icon_name: 'emblem-ok-symbolic',
                icon_size: 16,
                style_class: 'wallpaper-source-status',
            });
            box.add_child(statusIcon);

            // Info button (magnifying glass)
            const infoButton = new St.Button({
                style_class: 'wallpaper-source-button',
                child: new St.Icon({
                    icon_name: 'zoom-in-symbolic',
                    icon_size: 16,
                }),
            });
            infoButton.connect('clicked', () => {
                this._onInfoClicked(sourceId);
            });
            box.add_child(infoButton);

            // Play button (set wallpaper)
            const playButton = new St.Button({
                style_class: 'wallpaper-source-button',
                child: new St.Icon({
                    icon_name: 'media-playback-start-symbolic',
                    icon_size: 16,
                }),
            });
            playButton.connect('clicked', () => {
                this._onPlayClicked(sourceId);
            });
            box.add_child(playButton);

            // Retry button (hidden by default, shown on error)
            const retryButton = new St.Button({
                style_class: 'wallpaper-source-button',
                child: new St.Icon({
                    icon_name: 'view-refresh-symbolic',
                    icon_size: 16,
                }),
                visible: false,
            });
            retryButton.connect('clicked', () => {
                this._onRetryClicked(sourceId);
            });
            box.add_child(retryButton);

            item.add_child(box);

            // Store references for status updates
            item._statusIcon = statusIcon;
            item._retryButton = retryButton;
            item._sourceId = sourceId;

            return item;
        }

        /**
         * Update source row status indicator
         * @param {string} sourceId - Source identifier
         * @param {string} status - Status: 'downloading', 'success', 'error'
         */
        _updateSourceRowStatus(sourceId, status) {
            const row = this._sourceRows[sourceId];
            if (!row || !row._statusIcon) {
                return;
            }

            const statusIcon = row._statusIcon;

            switch (status) {
                case 'downloading':
                    statusIcon.icon_name = 'content-loading-symbolic';
                    // Hide retry button if exists
                    if (row._retryButton) {
                        row._retryButton.visible = false;
                    }
                    break;
                case 'success':
                    statusIcon.icon_name = 'emblem-ok-symbolic';
                    // Hide retry button if exists
                    if (row._retryButton) {
                        row._retryButton.visible = false;
                    }
                    break;
                case 'error':
                    statusIcon.icon_name = 'dialog-error-symbolic';
                    // Show retry button
                    if (row._retryButton) {
                        row._retryButton.visible = true;
                    }
                    break;
                default:
                    statusIcon.icon_name = 'emblem-ok-symbolic';
            }
        }

        /**
         * Set worker reference for retry functionality
         * @param {BackgroundWorker} worker - Background worker instance
         */
        setWorker(worker) {
            this._worker = worker;
        }

        _connectSettings() {
            const enabledId = this._settings.connectChanged('enabled', () => {
                this._enableToggle.setToggleState(this._settings.isEnabled());
            });
            this._signalIds.push(enabledId);

            const intervalId = this._settings.connectChanged('shuffle-interval', () => {
                this._intervalItem.label.text =
                    `Shuffle: ${this._settings.getShuffleInterval()} minutes`;
            });
            this._signalIds.push(intervalId);
        }

        /**
         * Handle info button click
         * @param {string} sourceId - Source identifier
         */
        _onInfoClicked(sourceId) {
            try {
                console.log(`Opening info dialog for ${sourceId}`);

                // Create and open info dialog
                const dialog = new WallpaperInfoDialog(sourceId, this._wallpaperManager);
                dialog.open();
            } catch (e) {
                console.error(`Failed to open info dialog for ${sourceId}:`, e);
            }
        }

        /**
         * Handle play button click (set wallpaper)
         * @param {string} sourceId - Source identifier
         */
        _onPlayClicked(sourceId) {
            try {
                const today = this._getTodayString();
                const cacheDir = this._wallpaperManager.getDailyCacheDir(today);
                const metadata = this._wallpaperManager.loadMetadata(cacheDir, sourceId);

                if (metadata) {
                    const imagePath = GLib.build_filenamev([cacheDir, metadata.filename]);
                    const imageFile = Gio.File.new_for_path(imagePath);

                    if (imageFile.query_exists(null)) {
                        this._wallpaperManager.setWallpaper(imagePath);
                        console.log(`Set wallpaper from ${sourceId}`);
                    } else {
                        console.warn(`Image file not found for ${sourceId}`);
                    }
                } else {
                    console.warn(`No metadata found for ${sourceId}`);
                }
            } catch (e) {
                console.error(`Failed to set wallpaper from ${sourceId}:`, e);
            }
        }

        /**
         * Handle retry button click
         * @param {string} sourceId - Source identifier
         */
        _onRetryClicked(sourceId) {
            if (this._worker) {
                console.log(`Retry clicked for ${sourceId}`);
                this._worker.retryDownload(sourceId);
            } else {
                console.warn('Worker not available for retry');
            }
        }

        /**
         * Get today's date string in DD.MM.YYYY format
         * @returns {string} Date string
         */
        _getTodayString() {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            return `${day}.${month}.${year}`;
        }

        destroy() {
            // Disconnect all signals
            this._signalIds.forEach(id => this._settings.disconnect(id));
            this._signalIds = [];

            super.destroy();
        }
    });
