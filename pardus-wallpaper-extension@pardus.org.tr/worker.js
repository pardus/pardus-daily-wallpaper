/* worker.js
 *
 * Background Worker - Handles wallpaper downloads, caching, and scheduling
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class BackgroundWorker {
    constructor(settings, wallpaperManager, indicator) {
        this._settings = settings;
        this._wallpaperManager = wallpaperManager;
        this._indicator = indicator;
        this._dailyCheckTimer = null;
    }

    /**
     * Start background worker
     */
    start() {
        console.log('Starting background worker');
        
        this._checkDailyWallpapers().catch(err => {
            console.error('Error during initial wallpaper check:', err);
        });
        
        // Start daily check timer (check every hour)
        this._startDailyCheckTimer();
    }

    /**
     * Stop background worker
     */
    stop() {
        console.log('Stopping background worker');
        
        if (this._dailyCheckTimer) {
            GLib.source_remove(this._dailyCheckTimer);
            this._dailyCheckTimer = null;
        }
    }

    /**
     * Check if today's wallpapers need to be downloaded
     */
    async _checkDailyWallpapers() {
        const today = this._getTodayString();
        console.log(`Checking cache for ${today}`);
        const dailyCacheDir = this._getDailyCacheDir();

        let allCached = true;
        const sourcesToDownload = [];
        const selectedSources = this._settings.get_strv('selected-sources');

        if (selectedSources.length === 0) {
            console.log('No sources selected, nothing to download.');
            return;
        }

        for (const sourceId of selectedSources) {
            const metadataFile = Gio.File.new_for_path(GLib.build_filenamev([dailyCacheDir.get_path(), `${sourceId}.json`]));
            if (!metadataFile.query_exists(null)) {
                allCached = false;
                sourcesToDownload.push(sourceId);
            }
        }

        if (allCached) {
            console.log('All selected sources are cached for today.');
            this._scheduleNextCheck();
        } else {
            console.log(`Missing cache for sources: ${sourcesToDownload.join(', ')}. Starting download.`);
            await this._downloadSources(sourcesToDownload);
        }
    }

    async _downloadSources(sources) {
        console.log(`Starting download from sources: ${sources.join(', ')}`);
        if (this._indicator) this._indicator.setDownloadingState(true);
        try {
            const dailyCacheDir = this._getDailyCacheDir();
            this._ensureCacheDir(dailyCacheDir);

            for (const sourceId of sources) {
                try {
                    console.log(`Starting download from source: ${sourceId}`);
                    if (this._indicator) this._indicator.updateSourceStatus(sourceId, 'downloading');
                    
                    await this._wallpaperManager.downloadFromSource(sourceId, dailyCacheDir);
                    
                    if (this._indicator) this._indicator.updateSourceStatus(sourceId, 'success');
                } catch (e) {
                    console.error(`Failed to download from ${sourceId}: ${e}`);
                    if (this._indicator) this._indicator.updateSourceStatus(sourceId, 'error');
                }
            }
        } catch (e) {
            console.error(`An error occurred during wallpaper download: ${e}`);
        } finally {
            if (this._indicator) {
                this._indicator.setDownloadingState(false);
                this._indicator.refresh();
            }
            console.log('Download process completed.');
        }
    }

    /**
     * Set a wallpaper for a specific source for today
     * @param {string} sourceId The ID of the source
     */
    async setWallpaperForSource(sourceId) {
        try {
            const today = this._getTodayString();
            const todayDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-wallpaper-extension', today]);
            const dir = Gio.File.new_for_path(todayDir);
            
            if (!dir.query_exists(null)) {
                console.log(`Today's cache directory does not exist. Cannot set wallpaper for ${sourceId}`);
                return;
            }
            
            const wallpapers = [];
            this._findImagesIn(dir, wallpapers);

            const wallpaperPath = wallpapers.find(p => {
                const fileName = p.split('/').pop();
                return fileName.startsWith(sourceId + '.');
            });

            if (wallpaperPath) {
                await this._setBackground(wallpaperPath);
                console.log(`Set wallpaper for source ${sourceId} to ${wallpaperPath}`);
            } else {
                console.log(`No wallpaper found for source ${sourceId} for today.`);
            }
        } catch (e) {
            console.error(`Failed to set wallpaper for source ${sourceId}:`, e);
        }
    }

    // UTILITY FUNCTIONS (Copied from prefs.js for self-sufficiency)

    _getTodayString() {
        return GLib.DateTime.new_now_local().format('%d.%m.%Y');
    }

    _getDailyCacheDir() {
        return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-wallpaper-extension', this._getTodayString()]));
    }

    _ensureCacheDir(dir) {
        if (!dir.query_exists(null)) {
            dir.make_directory_with_parents(null);
        }
    }

    /**
     * Check if a source is cached and valid
     * @param {string} cacheDir - Cache directory path
     * @param {string} sourceId - Source identifier
     * @returns {boolean} True if source is cached
     */
    _isSourceCached(cacheDir, sourceId) {
        try {
            // Check if JSON metadata exists
            const jsonPath = GLib.build_filenamev([cacheDir, `${sourceId}.json`]);
            const jsonFile = Gio.File.new_for_path(jsonPath);
            
            if (!jsonFile.query_exists(null)) {
                return false;
            }
            
            // Validate JSON is not corrupted
            try {
                const [success, contents] = jsonFile.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const jsonString = decoder.decode(contents);
                    const metadata = JSON.parse(jsonString);
                    
                    // Check if image file exists
                    const imagePath = GLib.build_filenamev([cacheDir, metadata.filename]);
                    const imageFile = Gio.File.new_for_path(imagePath);
                    
                    return imageFile.query_exists(null);
                }
            } catch (e) {
                console.error(`Corrupted JSON for ${sourceId}:`, e);
                return false;
            }
            
            return false;
        } catch (e) {
            console.error(`Error checking cache for ${sourceId}:`, e);
            return false;
        }
    }

    /**
     * Retry download for a specific source
     * @param {string} sourceId - Source identifier
     */
    async retryDownload(sourceId) {
        try {
            console.log(`Retrying download for ${sourceId}`);
            
            if (this._indicator) {
                this._indicator.updateSourceStatus(sourceId, 'downloading');
            }
            
            await this._wallpaperManager.downloadFromSource(sourceId);
            
            if (this._indicator) {
                this._indicator.updateSourceStatus(sourceId, 'success');
            }
            
            this._showNotification(
                'Download Successful',
                `Successfully downloaded wallpaper from ${sourceId}.`
            );
        } catch (e) {
            console.error(`Retry failed for ${sourceId}:`, e);
            
            if (this._indicator) {
                this._indicator.updateSourceStatus(sourceId, 'error');
            }
            
            this._showNotification(
                'Retry Failed',
                `Failed to download from ${sourceId}. Please check your connection.`
            );
        }
    }

    /**
     * Show notification to user
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     */
    _showNotification(title, message) {
        try {
            Main.notify(title, message);
        } catch (e) {
            console.error('Failed to show notification:', e);
        }
    }

    /**
     * Start daily check timer
     */
    _startDailyCheckTimer() {
        // Check every 6 hours (21600 seconds)
        this._dailyCheckTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            21600,
            async () => {
                try {
                    await this._checkDailyWallpapers();
                } catch (err) {
                    console.error('Error during daily wallpaper check:', err);
                }
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _setBackground(filePath) {
        try {
            const fileUri = Gio.File.new_for_path(filePath).get_uri();
            const bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
            bgSettings.set_string('picture-uri', fileUri);
            bgSettings.set_string('picture-uri-dark', fileUri);
        } catch (e) {
            console.error(`Failed to set background to ${filePath}:`, e);
        }
    }
}
