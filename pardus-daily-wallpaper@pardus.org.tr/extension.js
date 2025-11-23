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
import GLib from 'gi://GLib';

import { SettingsManager } from './settings.js';
import { WallpaperManager } from './wallpaperManager.js';
import { BackgroundWorker } from './worker.js';
import { Indicator } from './indicator.js';

export default class PardusWallpaperExtension extends Extension {
    enable() {
        GLib.set_application_name('Pardus Daily Wallpaper');
        try {
            this._settingsManager = new SettingsManager(this);
            const settings = this._settingsManager.getSettings();

            this._wallpaperManager = new WallpaperManager(this._settingsManager);
            
            this._indicator = new Indicator(settings);
            Main.panel.addToStatusArea(this.uuid, this._indicator);

            this._worker = new BackgroundWorker(this._settingsManager.getSettings(), this._wallpaperManager, this._indicator);
            this._worker.start();
            
            this._indicator.connect('set-wallpaper-for-source', (indicator, sourceId) => {
                if (this._worker) {
                    this._worker.setWallpaperForSource(sourceId);
                }
            });

            if (this._indicator) {
                this._indicator.refresh();
            }

        } catch (e) {
            logError(e, 'Failed to enable Pardus Wallpaper Extension');
        }
    }

    disable() {
        console.log('Disabling Pardus Wallpaper Extension');

        if (this._indicator) {
            if (this._indicator.get_parent()) {
                this._indicator.get_parent().remove_child(this._indicator);
            }
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._worker) {
            this._worker.stop();
            this._worker = null;
        }

        this._wallpaperManager = null;
        this._settingsManager = null;
    }
    
}
