/* settings.js
 *
 * Settings Manager - GSettings wrapper for extension configuration
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export class SettingsManager {
    constructor(extensionObject) {
        try {
            this._settings = extensionObject.getSettings();
        } catch (e) {
            console.error('Failed to load settings:', e);
            throw new Error('Settings initialization failed');
        }
    }
    
    // Enable/Disable
    isEnabled() {
        try {
            return this._settings.get_boolean('enabled');
        } catch (e) {
            console.error('Failed to get enabled setting:', e);
            return false;
        }
    }
    
    setEnabled(value) {
        try {
            if (typeof value !== 'boolean') {
                console.warn('Invalid value for enabled setting, expected boolean');
                return;
            }
            this._settings.set_boolean('enabled', value);
        } catch (e) {
            console.error('Failed to set enabled setting:', e);
        }
    }
    
    // Selected sources
    getSelectedSources() {
        try {
            const sources = this._settings.get_strv('selected-sources');
            return Array.isArray(sources) ? sources : [];
        } catch (e) {
            console.error('Failed to get selected sources:', e);
            return [];
        }
    }
    
    setSelectedSources(sources) {
        try {
            if (!Array.isArray(sources)) {
                console.warn('Invalid value for selected sources, expected array');
                return;
            }
            this._settings.set_strv('selected-sources', sources);
        } catch (e) {
            console.error('Failed to set selected sources:', e);
        }
    }
    
    // Shuffle interval
    getShuffleInterval() {
        try {
            const interval = this._settings.get_int('shuffle-interval');
            // Validate interval is positive
            return interval > 0 ? interval : 5;
        } catch (e) {
            console.error('Failed to get shuffle interval:', e);
            return 5; // Default 5 minutes
        }
    }
    
    setShuffleInterval(minutes) {
        try {
            if (typeof minutes !== 'number' || minutes <= 0) {
                console.warn('Invalid shuffle interval, must be positive number');
                return;
            }
            this._settings.set_int('shuffle-interval', minutes);
        } catch (e) {
            console.error('Failed to set shuffle interval:', e);
        }
    }
    
    // Current source index
    getCurrentSourceIndex() {
        try {
            const index = this._settings.get_int('current-source-index');
            return index >= 0 ? index : 0;
        } catch (e) {
            console.error('Failed to get current source index:', e);
            return 0;
        }
    }
    
    setCurrentSourceIndex(index) {
        try {
            if (typeof index !== 'number' || index < 0) {
                console.warn('Invalid source index, must be non-negative number');
                return;
            }
            this._settings.set_int('current-source-index', index);
        } catch (e) {
            console.error('Failed to set current source index:', e);
        }
    }
    
    // Last check date
    getLastCheckDate() {
        try {
            return this._settings.get_string('last-check-date') || '';
        } catch (e) {
            console.error('Failed to get last check date:', e);
            return '';
        }
    }
    
    setLastCheckDate(dateString) {
        try {
            if (typeof dateString !== 'string') {
                console.warn('Invalid date string');
                return;
            }
            this._settings.set_string('last-check-date', dateString);
        } catch (e) {
            console.error('Failed to set last check date:', e);
        }
    }
    
    // Cache retention days
    getCacheRetentionDays() {
        try {
            const days = this._settings.get_int('cache-retention-days');
            return days > 0 ? days : 7;
        } catch (e) {
            console.error('Failed to get cache retention days:', e);
            return 7; // Default 7 days
        }
    }
    
    // Connect to settings changes
    connectChanged(key, callback) {
        try {
            if (typeof callback !== 'function') {
                console.warn('Callback must be a function');
                return null;
            }
            return this._settings.connect(`changed::${key}`, callback);
        } catch (e) {
            console.error(`Failed to connect to setting ${key}:`, e);
            return null;
        }
    }
    
    disconnect(signalId) {
        try {
            if (signalId !== null && signalId !== undefined) {
                this._settings.disconnect(signalId);
            }
        } catch (e) {
            console.error('Failed to disconnect signal:', e);
        }
    }
    
    // Get raw settings object
    getSettings() {
        return this._settings;
    }
}
