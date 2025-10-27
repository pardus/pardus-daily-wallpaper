/* wallpaperManager.js
 *
 * Wallpaper Manager - Handles wallpaper downloads, cache, and metadata
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

imports.gi.versions.Soup = '3.0';

// Promisify Gio file operations to use async/await
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
Gio._promisify(Gio.File.prototype, 'replace_async', 'replace_finish');


export class WallpaperManager {
    constructor(settings) {
        this._settings = settings;
        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'pardus-wallpaper-extension']);
        this._sourcesConfig = null;
        this._httpSession = new Soup.Session();
    }

    /**
     * Get cache directory for a specific date
     * @param {string} dateString - Date in DD.MM.YYYY format
     * @returns {string} Full path to cache directory
     */
    getDailyCacheDir(dateString) {
        return GLib.build_filenamev([this._cacheDir, dateString]);
    }

    /**
     * Ensure cache directory exists
     * @param {string} dirPath - Directory path to create
     * @returns {boolean} True if directory exists or was created
     */
    _ensureCacheDir(dirPath) {
        try {
            const dir = Gio.File.new_for_path(dirPath);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
                console.log(`Created cache directory: ${dirPath}`);
            }
            return true;
        } catch (e) {
            console.error(`Failed to create cache directory ${dirPath}:`, e);
            return false;
        }
    }

    /**
     * Load wallpaper sources configuration
     * @returns {Object|null} Sources configuration object
     */
    loadSourcesConfig() {
        if (this._sourcesConfig) {
            return this._sourcesConfig;
        }

        try {
            // Try to load from extension data directory
            const configPath = GLib.build_filenamev([
                GLib.get_user_data_dir(),
                'gnome-shell',
                'extensions',
                'pardus-wallpaper-extension@pardus.org.tr',
                'data',
                'wallpaper_sources.json'
            ]);

            const file = Gio.File.new_for_path(configPath);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const jsonString = decoder.decode(contents);
                    const data = JSON.parse(jsonString);
                    // Extract sources object from the JSON
                    this._sourcesConfig = data.sources || data;
                    console.log('Loaded wallpaper sources configuration');
                    return this._sourcesConfig;
                }
            }

            console.warn('Wallpaper sources config not found, using empty config');
            this._sourcesConfig = {};
            return this._sourcesConfig;
        } catch (e) {
            console.error('Failed to load sources config:', e);
            this._sourcesConfig = {};
            return this._sourcesConfig;
        }
    }

    /**
     * Save metadata to JSON file
     * @param {string} cacheDir - Cache directory path
     * @param {string} sourceId - Source identifier
     * @param {Object} metadata - Metadata object
     * @returns {boolean} True if saved successfully
     */
    _saveMetadata(cacheDir, sourceId, metadata) {
        try {
            if (!this._ensureCacheDir(cacheDir)) {
                return false;
            }

            const jsonPath = GLib.build_filenamev([cacheDir, `${sourceId}.json`]);
            const jsonContent = JSON.stringify(metadata, null, 2);
            
            const file = Gio.File.new_for_path(jsonPath);
            const [success] = file.replace_contents(
                jsonContent,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            if (success) {
                console.log(`Saved metadata for ${sourceId}`);
                return true;
            }
            return false;
        } catch (e) {
            console.error(`Failed to save metadata for ${sourceId}:`, e);
            return false;
        }
    }

    /**
     * Load metadata from JSON file
     * @param {string} cacheDir - Cache directory path
     * @param {string} sourceId - Source identifier
     * @returns {Object|null} Metadata object or null if not found
     */
    loadMetadata(cacheDir, sourceId) {
        try {
            const jsonPath = GLib.build_filenamev([cacheDir, `${sourceId}.json`]);
            const file = Gio.File.new_for_path(jsonPath);

            if (!file.query_exists(null)) {
                return null;
            }

            const [success, contents] = file.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const jsonString = decoder.decode(contents);
                return JSON.parse(jsonString);
            }
            return null;
        } catch (e) {
            console.error(`Failed to load metadata for ${sourceId}:`, e);
            return null;
        }
    }

    /**
     * Transform API response to standardized metadata format
     * @param {string} sourceId - Source identifier
     * @param {Object} apiResponse - Raw API response
     * @param {Object} config - Source configuration
     * @param {string} imageUrl - Image URL
     * @param {string} filename - Local filename
     * @returns {Object} Standardized metadata
     */
    _transformToStandardMetadata(sourceId, apiResponse, config, imageUrl, filename) {
        try {
            const metadata = {
                source: config.name || sourceId,
                sourceId: sourceId,
                title: this._extractField(apiResponse, config.response_mapping?.title_keys) || 'Untitled',
                description: this._extractField(apiResponse, config.response_mapping?.description_keys) || '',
                date: new Date().toISOString().split('T')[0],
                copyright: this._extractField(apiResponse, config.response_mapping?.copyright_keys) || '',
                url: imageUrl,
                filename: filename,
                downloadedAt: new Date().toISOString()
            };

            return metadata;
        } catch (e) {
            console.error('Failed to transform metadata:', e);
            return {
                source: sourceId,
                sourceId: sourceId,
                title: 'Untitled',
                description: '',
                date: new Date().toISOString().split('T')[0],
                copyright: '',
                url: imageUrl,
                filename: filename,
                downloadedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Extract field from API response using key path
     * @param {Object} obj - Object to extract from
     * @param {Array<string>} keys - Array of possible key paths
     * @returns {string|null} Extracted value or null
     */
    _extractField(obj, keys, findFirstValidConfig = null) {
        if (!obj) return null;

        if (findFirstValidConfig && findFirstValidConfig.enabled) {
            const array = this._resolvePath(obj, findFirstValidConfig.array_path);
            if (!Array.isArray(array)) return null;

            for (const item of array) {
                const itemData = findFirstValidConfig.item_path ? this._resolvePath(item, findFirstValidConfig.item_path) : item;
                if (!itemData) continue;
                
                // Perform validation if specified
                const validation = this._sourcesConfig[findFirstValidConfig.sourceId]?.validation?.item_validation;
                if (validation) {
                    let isValid = true;
                    if (validation.reject_if_true) {
                        for (const key of validation.reject_if_true) {
                            if (this._resolvePath(itemData, key) === true) {
                                isValid = false;
                                break;
                            }
                        }
                    }
                    if (!isValid) continue;
                }

                const value = this._findValueInKeys(itemData, keys);
                if (value) return value;
            }
            return null;
        }

        return this._findValueInKeys(obj, keys);
    }

    _resolvePath(obj, path) {
        if (!path) return obj;
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
    }
    
    _findValueInKeys(obj, keys) {
        if (!Array.isArray(keys)) return null;
        for (const keyPath of keys) {
            const value = this._resolvePath(obj, keyPath);
            if (value !== null) return String(value);
        }
        return null;
    }

    /**
     * Get today's wallpapers from cache
     * @returns {Array<Object>} Array of wallpaper objects with metadata
     */
    getTodaysWallpapers() {
        try {
            const today = this._getTodayString();
            const cacheDir = this.getDailyCacheDir(today);
            const dir = Gio.File.new_for_path(cacheDir);

            if (!dir.query_exists(null)) {
                return [];
            }

            const wallpapers = [];
            const selectedSources = this._settings.get_strv('selected-sources');

            for (const sourceId of selectedSources) {
                const metadata = this.loadMetadata(cacheDir, sourceId);
                if (metadata) {
                    const imagePath = GLib.build_filenamev([cacheDir, metadata.filename]);
                    const imageFile = Gio.File.new_for_path(imagePath);
                    
                    if (imageFile.query_exists(null)) {
                        wallpapers.push({
                            ...metadata,
                            filepath: imagePath
                        });
                    }
                }
            }

            return wallpapers;
        } catch (e) {
            console.error('Failed to get todays wallpapers:', e);
            return [];
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

    /**
     * Download wallpaper from a specific source
     * @param {string} sourceId - Source identifier
     * @returns {Promise<Object>} Result object with success status and metadata
     */
    async downloadFromSource(sourceId, progressCallback = null) {
        try {
            console.log(`Starting download from source: ${sourceId}`);
            
            const config = this.loadSourcesConfig();
            if (!config || !config[sourceId]) {
                throw new Error(`Source ${sourceId} not found in configuration`);
            }

            const sourceConfig = config[sourceId];
            
            let apiUrl = sourceConfig.api_url;
            const now = GLib.DateTime.new_now_local();
            apiUrl = apiUrl.replace('{year}', now.get_year())
                           .replace('{month:02d}', String(now.get_month()).padStart(2, '0'))
                           .replace('{day:02d}', String(now.get_day_of_month()).padStart(2, '0'));

            const apiResponse = await this._fetchFromAPI(apiUrl, sourceConfig.headers || {});
            
            // --- REVISED LOGIC FOR EXTRACTING DATA ---
            let dataObject = apiResponse;
            const findFirstConfig = sourceConfig.response_mapping?.find_first_valid;

            if (findFirstConfig && findFirstConfig.enabled) {
                const array = this._resolvePath(apiResponse, findFirstConfig.array_path);
                if (!Array.isArray(array)) throw new Error('find_first_valid path did not resolve to an array.');

                let foundValid = false;
                for (const item of array) {
                    const itemData = findFirstConfig.item_path ? this._resolvePath(item, findFirstConfig.item_path) : item;
                    if (!itemData) continue;

                    const validation = sourceConfig.validation?.item_validation;
                    if (validation) {
                        if (validation.reject_if_true?.some(key => this._resolvePath(itemData, key) === true)) {
                            continue; // Skip this item
                        }
                    }
                    dataObject = itemData; // Use the first valid item's data
                    foundValid = true;
                    break;
                }
                if (!foundValid) throw new Error('No valid items found in the array after filtering.');
            } else if (sourceConfig.response_mapping?.data_path) {
                dataObject = this._resolvePath(apiResponse, sourceConfig.response_mapping.data_path);
                if (!dataObject) throw new Error(`data_path '${sourceConfig.response_mapping.data_path}' resolved to null.`);
            }
            // --- END OF REVISED LOGIC ---

            let imageUrl = this._findValueInKeys(dataObject, sourceConfig.response_mapping?.image_url_keys);

            if (!imageUrl) {
                throw new Error(`No image URL found in API response for ${sourceId}`);
            }
            
            if (sourceConfig.response_mapping?.image_url_prefix) {
                imageUrl = sourceConfig.response_mapping.image_url_prefix + imageUrl;
            }

            const today = this._getTodayString();
            const cacheDir = this.getDailyCacheDir(today);
            this._ensureCacheDir(cacheDir);

            const extension = this._getImageExtension(imageUrl);
            const filename = `${sourceId}.${extension}`;
            const imagePath = GLib.build_filenamev([cacheDir, filename]);

            await this.downloadImage(imageUrl, imagePath, sourceConfig.headers || {}, progressCallback);

            // Use the correct data object for metadata extraction
            const metadata = this._transformToStandardMetadata(
                sourceId,
                dataObject, // Use the (potentially modified) dataObject
                sourceConfig,
                imageUrl,
                filename
            );

            if (!this._saveMetadata(cacheDir, sourceId, metadata)) {
                throw new Error(`Failed to save metadata for ${sourceId}`);
            }

            console.log(`Successfully downloaded wallpaper from ${sourceId}`);
            return { success: true, metadata };
        } catch (e) {
            console.error(`Failed to download from ${sourceId}: ${e.message}`);
            throw e;
        }
    }

    async _fetchFromAPI(url, headers) {
        const message = Soup.Message.new('GET', url);
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                message.get_request_headers().append(key, value);
            }
        }
        
        const bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        
        if (message.get_status() !== 200) {
            const responseBody = new TextDecoder().decode(bytes.get_data());
            throw new Error(`HTTP Error ${message.get_status()}: ${responseBody}`);
        }
        
        const responseText = new TextDecoder().decode(bytes.get_data());
        if (!responseText) {
            throw new Error('API response was empty.');
        }

        try {
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error(`Failed to parse API response: ${e.message}`);
        }
    }

    async downloadImage(url, filepath, headers = {}, progressCallback = null) {
        const message = Soup.Message.new('GET', url);
        for (const [key, value] of Object.entries(headers)) {
            message.get_request_headers().append(key, value);
        }
        
        const bytes = await this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        
        if (message.get_status() !== 200) {
            throw new Error(`HTTP Error ${message.get_status()} while downloading image`);
        }
        
        const file = Gio.File.new_for_path(filepath);
        await file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

        console.log(`Image saved to: ${filepath}`);
    }

    /**
     * Get image file extension from URL
     * @param {string} url - Image URL
     * @returns {string} File extension (default: 'jpg')
     */
    _getImageExtension(url) {
        try {
            const urlLower = url.toLowerCase();
            if (urlLower.includes('.jpeg') || urlLower.includes('.jpg')) {
                return 'jpg';
            } else if (urlLower.includes('.png')) {
                return 'png';
            } else if (urlLower.includes('.webp')) {
                return 'webp';
            }
            return 'jpg'; // Default
        } catch (e) {
            return 'jpg';
        }
    }

    /**
     * Sanitize filename for safe file system usage
     * @param {string} filename - Original filename
     * @returns {string} Sanitized filename
     */
    _sanitizeFilename(filename) {
        return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    /**
     * Set wallpaper for both light and dark themes
     * @param {string} filepath - Absolute path to wallpaper image
     * @returns {boolean} True if wallpaper was set successfully
     */
    setWallpaper(filepath) {
        try {
            // Validate file exists
            const file = Gio.File.new_for_path(filepath);
            if (!file.query_exists(null)) {
                console.error(`Wallpaper file does not exist: ${filepath}`);
                return false;
            }

            // Get background settings
            const backgroundSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.background'
            });

            // Convert to file:// URI
            const fileUri = file.get_uri();

            // Set for both light and dark themes
            backgroundSettings.set_string('picture-uri', fileUri);
            backgroundSettings.set_string('picture-uri-dark', fileUri);
            console.log(`Wallpaper set successfully: ${filepath}`);
            return true;
        } catch (e) {
            console.error('Failed to set wallpaper:', e);
            return false;
        }
    }
}
