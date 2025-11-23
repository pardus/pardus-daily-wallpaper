project('pardus-daily-wallpaper',
  version: '1.0',
  license: 'GPL-3.0-or-later'
)

gnome = import('gnome')
i18n = import('i18n')

# Constants
uuid = 'pardus-daily-wallpaper@pardus.org.tr'
prefix = get_option('prefix')
datadir = join_paths(prefix, get_option('datadir'))
extension_dir = join_paths(datadir, 'gnome-shell', 'extensions', uuid)
schema_dir = join_paths(datadir, 'glib-2.0', 'schemas')
locale_dir = join_paths(datadir, 'locale')

# Subdirectories
subdir('pardus-daily-wallpaper@pardus.org.tr/po')
subdir('pardus-daily-wallpaper@pardus.org.tr/schemas')

# Install extension files
install_subdir(uuid,
  install_dir: join_paths(datadir, 'gnome-shell', 'extensions'),
  strip_directory: false,
  exclude_directories: ['po', 'schemas']
)

# Post-install script to compile schemas
gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: false,
  update_desktop_database: false
)
