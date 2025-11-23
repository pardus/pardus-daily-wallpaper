#!/bin/bash

EXTENSION_UUID="pardus-daily-wallpaper@pardus.org.tr"
PO_DIR="$EXTENSION_UUID/po"
POT_FILE="$PO_DIR/pardus-daily-wallpaper.pot"

# Read languages from LINGUAS
if [ -f "$PO_DIR/LINGUAS" ]; then
    langs=$(grep -v "^#" "$PO_DIR/LINGUAS" | tr '\n' ' ')
else
    echo "LINGUAS file not found."
    exit 1
fi

if ! command -v xgettext &> /dev/null
then
	echo "xgettext could not be found."
	echo "you can install the package with 'apt install gettext' command on debian."
	exit
fi

echo "Updating pot file..."

# Prepare temporary directory
mkdir -p "$PO_DIR/tmp"

# Read POTFILES and prepend extension directory
# Filter empty lines
FILES=$(grep -v "^#" "$PO_DIR/POTFILES" | grep -v "^$" | sed "s|^|$EXTENSION_UUID/|")

# Separate Javascript and Schema files
JS_FILES=$(echo "$FILES" | grep '\.js$' | tr '\n' ' ')
SCHEMA_FILES=$(echo "$FILES" | grep 'gschema.xml$' | tr '\n' ' ')

# Extract from Javascript files
if [ -n "$JS_FILES" ]; then
    xgettext --from-code=UTF-8 \
             --language=JavaScript \
             --keyword=_ \
             --keyword=N_ \
             --add-comments \
             --output="$PO_DIR/tmp/js.pot" \
             $JS_FILES
fi

# Extract from Schema files (if any and supported)
# Note: GSettings schemas usually require gettext 0.19.7+ with its rules or standard handling.
# For now we simply attempt to extract if tools allow, otherwise we skip to avoid breaking the script.
# We will skip schema extraction in this simple script to avoid complex dependencies like itstool 
# unless the user specifically requested schema translation support which usually is handled by meson.
# If we need to merge schema translations, we would need a schema.pot.
# For now, let's just use the JS pot as the main one.

# Merge pot files (currently just JS, but structure allows adding more)
if [ -f "$PO_DIR/tmp/js.pot" ]; then
    mv "$PO_DIR/tmp/js.pot" "$POT_FILE"
fi

# Clean up
rm -rf "$PO_DIR/tmp"

for lang in $langs; do
    # Trim whitespace
    lang=$(echo "$lang" | xargs)
    if [ -z "$lang" ]; then continue; fi

	if [[ -f "$PO_DIR/$lang.po" ]]; then
		echo "Updating $lang.po"
		msgmerge --update --backup=none "$PO_DIR/$lang.po" "$POT_FILE"
	else
		echo "Creating $lang.po"
        # msginit creates a new po file with headers
		msginit --input="$POT_FILE" --output="$PO_DIR/$lang.po" --locale="$lang" --no-translator
	fi
done

echo "Translations updated."

