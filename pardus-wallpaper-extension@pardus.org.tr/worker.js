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
        this._shuffleTimer = null;
        this._dailyCheckTimer = null;
    }

    /**
     * Start background worker
     */
    start() {
        console.log('Starting background worker');
        
        // Check and download today's wallpapers if needed
        this._checkDailyWallpapers();
        
        // Start daily check timer (check every hour)
        this._startDailyCheckTimer();
        
        // Start shuffle timer if enabled
        if (this._settings.isEnabled()) {
            this._startShuffleTimer();
        }
    }

    /**
     * Stop background worker
     */
    stop() {
        console.log('Stopping background worker');
        
        if (this._shuffleTimer) {
            GLib.source_remove(this._shuffleTimer);
            this._shuffleTimer = null;
        }
        
        if (this._dailyCheckTimer) {
            GLib.source_remove(this._dailyCheckTimer);
            this._dailyCheckTimer = null;
        }
    }

    /**
     * Check if today's wallpapers need to be downloaded
     */
    async _checkDailyWallpapers() {
        try {
            const today = this._getTodayString();
            const cacheDir = this._wallpaperManager.getDailyCacheDir(today);
            
            console.log(`Checking cache for ${today}`);
            
            // Check if cache directory exists
            const dir = Gio.File.new_for_path(cacheDir);
            if (!dir.query_exists(null)) {
                console.log('Cache directory does not exist, downloading wallpapers');
                await this._downloadAllSources();
                return;
            }
            
            // Check if all selected sources have valid cache
            const selectedSources = this._settings.getSelectedSources();
            for (const sourceId of selectedSources) {
                if (!this._isSourceCached(cacheDir, sourceId)) {
                    console.log(`Source ${sourceId} not cached, downloading all wallpapers`);
                    await this._downloadAllSources();
                    return;
                }
            }
            
            // Cache is valid, no download needed
            console.log('Using cached wallpapers from today');
        } catch (e) {
            console.error('Error checking daily wallpapers:', e);
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
     * Download wallpapers from all selected sources
     */
    async _downloadAllSources() {
        try {
            console.log('Starting download from all sources');
            
            // Show spinner in panel indicator
            if (this._indicator) {
                this._indicator.setDownloadingState(true);
            }
            
            const selectedSources = this._settings.getSelectedSources();
            let successCount = 0;
            let errorCount = 0;
            
            for (const sourceId of selectedSources) {
                try {
                    // Update status to downloading
                    if (this._indicator) {
                        this._indicator.updateSourceStatus(sourceId, 'downloading');
                    }
                    
                    // Download from source
                    await this._wallpaperManager.downloadFromSource(sourceId);
                    
                    // Update status to success
                    if (this._indicator) {
                        this._indicator.updateSourceStatus(sourceId, 'success');
                    }
                    successCount++;
                } catch (e) {
                    console.error(`Failed to download from ${sourceId}:`, e);
                    
                    // Update status to error
                    if (this._indicator) {
                        this._indicator.updateSourceStatus(sourceId, 'error');
                    }
                    errorCount++;
                    
                    // Show notification for error
                    this._showNotification(
                        'Wallpaper Download Failed',
                        `Failed to download from ${sourceId}. Click to retry.`
                    );
                }
            }
            
            // Hide spinner
            if (this._indicator) {
                this._indicator.setDownloadingState(false);
            }
            
            // Update last check date only if at least one succeeded
            if (successCount > 0) {
                this._settings.setLastCheckDate(this._getTodayString());
            }
            
            // Clean old cache
            this._cleanOldCache();
            
            // Show summary notification if there were errors
            if (errorCount > 0 && successCount > 0) {
                this._showNotification(
                    'Wallpaper Download Completed',
                    `Downloaded ${successCount} wallpapers, ${errorCount} failed.`
                );
            } else if (errorCount === 0 && successCount > 0) {
                console.log(`Successfully downloaded ${successCount} wallpapers`);
            }
            
            console.log('Download from all sources completed');
        } catch (e) {
            console.error('Error downloading from all sources:', e);
            
            if (this._indicator) {
                this._indicator.setDownloadingState(false);
            }
            
            this._showNotification(
                'Wallpaper Download Error',
                'An unexpected error occurred while downloading wallpapers.'
            );
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
        // Check every hour (3600 seconds)
        this._dailyCheckTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            3600,
            () => {
                this._checkDailyWallpapers();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    /**
     * Start shuffle timer
     */
    _startShuffleTimer() {
        // Stop existing timer if any
        this._stopShuffleTimer();
        
        const selectedSources = this._settings.getSelectedSources();
        
        // Don't shuffle if only one source or no sources
        if (selectedSources.length <= 1) {
            console.log('Shuffle disabled: need at least 2 sources');
            return;
        }
        
        // Get interval in minutes, convert to seconds
        const intervalMinutes = this._settings.getShuffleInterval();
        const intervalSeconds = intervalMinutes * 60;
        
        console.log(`Starting shuffle timer with ${intervalMinutes} minute interval`);
        
        this._shuffleTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            intervalSeconds,
            () => {
                return this._onShuffleTimer();
            }
        );
    }

    /**
     * Stop shuffle timer
     */
    _stopShuffleTimer() {
        if (this._shuffleTimer) {
            GLib.source_remove(this._shuffleTimer);
            this._shuffleTimer = null;
            console.log('Shuffle timer stopped');
        }
    }

    /**
     * Shuffle timer callback
     * @returns {boolean} GLib.SOURCE_CONTINUE to keep timer running
     */
    _onShuffleTimer() {
        try {
            console.log('Shuffle timer triggered');
            
            const selectedSources = this._settings.getSelectedSources();
            if (selectedSources.length === 0) {
                return GLib.SOURCE_CONTINUE;
            }
            
            // Get current source index
            let currentIndex = this._settings.getCurrentSourceIndex();
            
            // Increment and wrap around
            currentIndex = (currentIndex + 1) % selectedSources.length;
            
            // Update index in settings
            this._settings.setCurrentSourceIndex(currentIndex);
            
            // Get the source ID
            const sourceId = selectedSources[currentIndex];
            
            // Load wallpaper from cache
            const today = this._getTodayString();
            const cacheDir = this._wallpaperManager.getDailyCacheDir(today);
            const metadata = this._wallpaperManager.loadMetadata(cacheDir, sourceId);
            
            if (metadata) {
                const imagePath = GLib.build_filenamev([cacheDir, metadata.filename]);
                const imageFile = Gio.File.new_for_path(imagePath);
                
                if (imageFile.query_exists(null)) {
                    // Set wallpaper
                    this._wallpaperManager.setWallpaper(imagePath);
                    console.log(`Shuffled to wallpaper from ${sourceId}`);
                } else {
                    console.warn(`Image file not found for ${sourceId}`);
                }
            } else {
                console.warn(`No metadata found for ${sourceId}`);
            }
            
            return GLib.SOURCE_CONTINUE;
        } catch (e) {
            console.error('Error in shuffle timer:', e);
            return GLib.SOURCE_CONTINUE;
        }
    }

    /**
     * Restart shuffle timer (called when settings change)
     */
    restartShuffleTimer() {
        if (this._settings.isEnabled()) {
            this._startShuffleTimer();
        } else {
            this._stopShuffleTimer();
        }
    }

    /**
     * Clean old cache directories
     */
    _cleanOldCache() {
        try {
            console.log('Cleaning old cache directories');
            
            const baseCacheDir = this._wallpaperManager._cacheDir;
            const dir = Gio.File.new_for_path(baseCacheDir);
            
            if (!dir.query_exists(null)) {
                return;
            }
            
            // Get retention days from settings
            const retentionDays = this._settings.getCacheRetentionDays();
            const now = new Date();
            const cutoffDate = new Date(now.getTime() - (retentionDays * 24 * 60 * 60 * 1000));
            
            // List all directories
            const enumerator = dir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            
            let fileInfo;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                const name = fileInfo.get_name();
                const fileType = fileInfo.get_file_type();
                
                // Only process directories
                if (fileType !== Gio.FileType.DIRECTORY) {
                    continue;
                }
                
                // Parse directory name (DD.MM.YYYY format)
                const dateMatch = name.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                if (!dateMatch) {
                    continue;
                }
                
                const day = parseInt(dateMatch[1], 10);
                const month = parseInt(dateMatch[2], 10);
                const year = parseInt(dateMatch[3], 10);
                
                // Create date object
                const dirDate = new Date(year, month - 1, day);
                
                // Check if older than cutoff
                if (dirDate < cutoffDate) {
                    const dirPath = GLib.build_filenamev([baseCacheDir, name]);
                    console.log(`Deleting old cache directory: ${name}`);
                    
                    try {
                        this._deleteDirectory(dirPath);
                    } catch (e) {
                        console.error(`Failed to delete directory ${name}:`, e);
                    }
                }
            }
            
            enumerator.close(null);
            console.log('Cache cleanup completed');
        } catch (e) {
            console.error('Error cleaning old cache:', e);
        }
    }

    /**
     * Recursively delete a directory
     * @param {string} dirPath - Directory path to delete
     */
    _deleteDirectory(dirPath) {
        try {
            const dir = Gio.File.new_for_path(dirPath);
            
            if (!dir.query_exists(null)) {
                return;
            }
            
            // List all files in directory
            const enumerator = dir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            
            let fileInfo;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                const name = fileInfo.get_name();
                const childPath = GLib.build_filenamev([dirPath, name]);
                const child = Gio.File.new_for_path(childPath);
                
                // Delete file
                child.delete(null);
            }
            
            enumerator.close(null);
            
            // Delete the directory itself
            dir.delete(null);
        } catch (e) {
            console.error(`Error deleting directory ${dirPath}:`, e);
            throw e;
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
}
