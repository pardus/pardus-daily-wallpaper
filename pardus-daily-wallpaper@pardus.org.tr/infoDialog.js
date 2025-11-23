/* infoDialog.js
 *
 * Wallpaper Info Dialog - Shows wallpaper preview and metadata
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

export const WallpaperInfoDialog = GObject.registerClass(
    class WallpaperInfoDialog extends ModalDialog.ModalDialog {
        _init(sourceId, wallpaperManager) {
            super._init({ styleClass: 'wallpaper-info-dialog' });

            this._sourceId = sourceId;
            this._wallpaperManager = wallpaperManager;

            this._buildDialog();
        }

        _buildDialog() {
            // Load metadata from cache
            const today = this._getTodayString();
            const cacheDir = this._wallpaperManager.getDailyCacheDir(today);
            const metadata = this._wallpaperManager.loadMetadata(cacheDir, this._sourceId);

            if (!metadata) {
                this._showNoDataMessage();
                return;
            }

            // Main content box
            const contentBox = new St.BoxLayout({
                vertical: true,
                style_class: 'wallpaper-info-content',
            });

            // Preview image
            const imagePath = GLib.build_filenamev([cacheDir, metadata.filename]);
            const imageFile = Gio.File.new_for_path(imagePath);

            if (imageFile.query_exists(null)) {
                const imageTexture = St.TextureCache.get_default().load_file_async(
                    imageFile,
                    -1,
                    400,
                    1,
                    1
                );

                const imageBox = new St.Bin({
                    style_class: 'wallpaper-preview-large',
                    child: imageTexture,
                    x_align: Clutter.ActorAlign.CENTER,
                });
                contentBox.add_child(imageBox);
            }

            // Metadata section
            const metadataBox = new St.BoxLayout({
                vertical: true,
                style_class: 'wallpaper-metadata',
            });

            // Title
            const titleLabel = new St.Label({
                text: metadata.title || 'Untitled',
                style_class: 'wallpaper-title',
            });
            metadataBox.add_child(titleLabel);

            // Description
            if (metadata.description) {
                const descLabel = new St.Label({
                    text: metadata.description,
                    style_class: 'wallpaper-description',
                });
                descLabel.clutter_text.line_wrap = true;
                descLabel.clutter_text.ellipsize = 0;
                metadataBox.add_child(descLabel);
            }

            // Details Box (Source and Date)
            const detailsBox = new St.BoxLayout({
                vertical: false,
                style_class: 'wallpaper-details-box',
                x_align: Clutter.ActorAlign.START
            });
            
            // Source
            const sourceBox = new St.BoxLayout({ style_class: 'wallpaper-detail-item' });
            sourceBox.add_child(new St.Icon({ icon_name: 'avatar-default-symbolic', style_class: 'wallpaper-detail-icon' }));
            sourceBox.add_child(new St.Label({ text: metadata.source || 'Unknown', style_class: 'wallpaper-detail-text' }));
            detailsBox.add_child(sourceBox);

            // Date
            const dateBox = new St.BoxLayout({ style_class: 'wallpaper-detail-item' });
            dateBox.add_child(new St.Icon({ icon_name: 'view-calendar-symbolic', style_class: 'wallpaper-detail-icon' }));
            dateBox.add_child(new St.Label({ text: metadata.date || '', style_class: 'wallpaper-detail-text' }));
            detailsBox.add_child(dateBox);

            metadataBox.add_child(detailsBox);

            // Copyright
            if (metadata.copyright) {
                const copyrightLabel = new St.Label({
                    text: `© ${metadata.copyright}`,
                    style_class: 'wallpaper-copyright',
                });
                copyrightLabel.clutter_text.line_wrap = true;
                metadataBox.add_child(copyrightLabel);
            }

            contentBox.add_child(metadataBox);
            this.contentLayout.add_child(contentBox);

            // Buttons
            this.addButton({
                label: _('Set as Wallpaper'),
                action: () => this._setWallpaper(imagePath),
                key: Clutter.KEY_Return,
            });

            this.addButton({
                label: _('Open Folder'),
                action: () => this._openContainingFolder(cacheDir),
            });

            this.addButton({
                label: _('Close'),
                action: () => this.close(),
                key: Clutter.KEY_Escape,
            });
        }

        _showNoDataMessage() {
            const messageLabel = new St.Label({
                text: 'No information available',
                style_class: 'wallpaper-no-data',
            });

            this.contentLayout.add_child(messageLabel);

            this.addButton({
                label: 'Close',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
            });
        }

        _setWallpaper(imagePath) {
            try {
                this._wallpaperManager.setWallpaper(imagePath);
                console.log(`Wallpaper set from info dialog: ${imagePath}`);
                this.close();
            } catch (e) {
                console.error('Failed to set wallpaper from dialog:', e);
            }
        }

        _openContainingFolder(dirPath) {
            try {
                const file = Gio.File.new_for_path(dirPath);
                const uri = file.get_uri();
                Gio.AppInfo.launch_default_for_uri_async(uri, null, null, null);
                this.close();
            } catch (e) {
                console.error('Failed to open folder:', e);
            }
        }

        _getTodayString() {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            return `${day}.${month}.${year}`;
        }
    });
