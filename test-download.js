
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Force Soup 3.0
import system from 'system';
// imports is global in gjs usually, but with modules it might be tricky.
// Let's try to use 'gi://Soup?version=3.0' if supported or standard imports
import Soup from 'gi://Soup?version=3.0';

// Initialize Soup
const httpSession = new Soup.Session();

const sourcesConfig = {
    "nasa": {
      "name": "NASA APOD",
      "api_url": "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY",
      "response_mapping": {
        "title_keys": ["title"],
        "description_keys": ["explanation"],
        "image_url_keys": ["hdurl", "url"]
      }
    },
    "wikipedia": {
      "name": "Wikipedia POTD",
      "api_url": "https://en.wikipedia.org/api/rest_v1/feed/featured/{year}/{month:02d}/{day:02d}",
      "response_mapping": {
        "data_path": "image",
        "title_keys": ["title"],
        "description_keys": ["description.text"],
        "image_url_keys": ["image.source"],
        "title_transform": { "type": "remove_prefix", "prefix": "File:" }
      }
    }
};

function resolvePath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
}

function findValueInKeys(obj, keys) {
    if (!Array.isArray(keys)) return null;
    for (const keyPath of keys) {
        const value = resolvePath(obj, keyPath);
        if (value !== null) return String(value);
    }
    return null;
}

function fetchFromAPI(url) {
    console.log(`Fetching URL: ${url}`);
    const message = Soup.Message.new('GET', url);
    
    // Synchronous call for testing simplicity
    const bytes = httpSession.send_and_read(message, null);
    
    if (message.get_status() !== 200) {
        throw new Error(`HTTP Error ${message.get_status()}`);
    }
    const decoder = new TextDecoder('utf-8');
    const responseText = decoder.decode(bytes.get_data());
    return JSON.parse(responseText);
}

async function testSource(sourceId) {
    console.log(`\nTesting Source: ${sourceId}`);
    try {
        const config = sourcesConfig[sourceId];
        let apiUrl = config.api_url;
        const now = GLib.DateTime.new_now_local();
        
        apiUrl = apiUrl.replace('{year}', now.get_year())
                       .replace('{month:02d}', String(now.get_month()).padStart(2, '0'))
                       .replace('{day:02d}', String(now.get_day_of_month()).padStart(2, '0'));
        
        // Use sync fetch
        const apiResponse = fetchFromAPI(apiUrl);
        console.log(`API Response received.`);

        let dataObject = apiResponse;
        if (config.response_mapping?.data_path) {
            dataObject = resolvePath(apiResponse, config.response_mapping.data_path);
            if (!dataObject) throw new Error(`data_path '${config.response_mapping.data_path}' resolved to null.`);
        }

        let imageUrl = findValueInKeys(dataObject, config.response_mapping?.image_url_keys);
        console.log(`Extracted Image URL: ${imageUrl}`);
        
        if (!imageUrl) {
             console.error("FAIL: Could not extract image URL.");
             console.log("Keys tried:", config.response_mapping?.image_url_keys);
             console.log("Data object:", JSON.stringify(dataObject, null, 2));
        } else {
             console.log("SUCCESS: Logic seems correct.");
        }

    } catch (e) {
        console.error(`ERROR: ${e.message}`);
        console.error(e);
    }
}

async function main() {
    // await testSource('nasa');
    await testSource('wikipedia');
}

main().catch(err => console.error(err));
