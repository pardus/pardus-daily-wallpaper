/* extension.js
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

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SettingsManager } from './settings.js';
import { WallpaperManager } from './wallpaperManager.js';
import { BackgroundWorker } from './worker.js';
import { WallpaperIndicator } from './indicator.js';

export default class PardusWallpaperExtension extends Extension {
    enable() {
        console.log('Enabling Pardus Wallpaper Extension');
        
        try {
            // Initialize settings manager
            this._settings = new SettingsManager(this);
            
            // Initialize wallpaper manager
            this._wallpaperManager = new WallpaperManager(this._settings);
            
            // Create and add indicator to panel
            this._indicator = new WallpaperIndicator(
                this._settings,
                this._wallpaperManager,
                this.path
            );
            Main.panel.addToStatusArea(this.uuid, this._indicator);
            
            // Initialize background worker
            this._worker = new BackgroundWorker(
                this._settings,
                this._wallpaperManager,
                this._indicator
            );
            
            // Set worker reference in indicator for retry functionality
            this._indicator.setWorker(this._worker);
            
            this._worker.start();
            
            // Setup settings change listeners
            this._setupSettingsListeners();
            
            console.log('Pardus Wallpaper Extension enabled successfully');
        } catch (e) {
            console.error('Failed to enable Pardus Wallpaper Extension:', e);
        }
    }

    disable() {
        console.log('Disabling Pardus Wallpaper Extension');
        
        try {
            // Disconnect settings listeners
            if (this._signalIds) {
                this._signalIds.forEach(id => {
                    if (id) {
                        this._settings.disconnect(id);
                    }
                });
                this._signalIds = [];
            }
            
            // Stop background worker
            if (this._worker) {
                this._worker.stop();
                this._worker = null;
            }
            
            // Remove indicator
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
            }
            
            // Cleanup
            this._wallpaperManager = null;
            this._settings = null;
            
            console.log('Pardus Wallpaper Extension disabled successfully');
        } catch (e) {
            console.error('Error disabling Pardus Wallpaper Extension:', e);
        }
    }

    /**
     * Setup settings change listeners for live updates
     */
    _setupSettingsListeners() {
        this._signalIds = [];
        
        // Listen for enabled state changes
        const enabledId = this._settings.connectChanged('enabled', () => {
            console.log('Enabled setting changed');
            if (this._worker) {
                this._worker.restartShuffleTimer();
            }
        });
        this._signalIds.push(enabledId);
        
        // Listen for shuffle interval changes
        const intervalId = this._settings.connectChanged('shuffle-interval', () => {
            console.log('Shuffle interval changed');
            if (this._worker) {
                this._worker.restartShuffleTimer();
            }
        });
        this._signalIds.push(intervalId);
        
        // Listen for selected sources changes
        const sourcesId = this._settings.connectChanged('selected-sources', () => {
            console.log('Selected sources changed');
            if (this._worker) {
                this._worker.restartShuffleTimer();
            }
        });
        this._signalIds.push(sourcesId);
    }
}
