# AQMeshNetwork
Front end for an air quality mesh network, using Adafruit IO libraries and sensors that detect air quality.

## Phone layout testing in Chrome

To simulate a phone layout in Chrome for web development, use Chrome DevTools Device Mode.

### Steps

1. Open your webpage in Chrome.
2. Open DevTools.
   Press `Cmd + Option + I` (Mac), or right-click and choose `Inspect`.
3. Toggle Device Mode.
   Press `Cmd + Shift + M`, or click the phone/tablet icon in the DevTools toolbar (top left).
4. Choose a device.
   In the top bar, select presets like `iPhone 12`, `Pixel 7`, or `Galaxy S20`.
5. Adjust viewport.
   Change width, height, zoom, and orientation (portrait/landscape).


## Why

Tracking Air Quality, in the form of particulates is incredibly useful for determining if you are at risk for inhaling these particles and causing lung irraitation and other issues.

While sites like Purple Air, do a good job of tracking crowd-sourced air quality, what it does not do is to set up a local network that can inform your lifestyle decisions.

For example, is inside your house better than outside your house. What about cooking in the kitchen, soldering electronics and more? Do your air purifiers really work?

This aims to be a project that is *useful* and paired along with air quality sensors that push live data to the web. 

## Adafruit IO

This is a useful service that had libraries that can push data to your Adafruit account. The basic service is free, and the extended package is reasonably-priced.

Although some of the documentaiton needs to be filled in, I've found the service to be stable.

## Electronics

I use the Plantower 5003 air quality sensors, along with an ESP32 chip and an OLED display. This is a low-cost electronics solution, and easy to use for pushing data onto the web.

The electronics and code for these are in a separate repositoty.

## What it does


This is a p5.js sketch that will read an series of Adafruit IO feeds that show particlate matter data and then display the live data a web-browser.

You can create your own feeds to do this, following the same format that I use.
 
## Adafruit IO API

The feed API looks like this: 
https://io.adafruit.com/api/v2/skildall/feeds/id-1061.pm10

This is a public feed.

The expected format is:

https://io.adafruit.com/api/v2/<username>/feeds/id-<chipID>.<dataKey>


username: yours on Adafruit

chipID: an integer representing the physical chip itself (I use a hash for this)

dataKey: either "pm10", "pm25" or "pm100".

For example, these are all valid feeds:
https://io.adafruit.com/api/v2/skildall/feeds/id-1061.pm10
https://io.adafruit.com/api/v2/skildall/feeds/id-1061.pm25
https://io.adafruit.com/api/v2/skildall/feeds/id-1061.pm100s


## Reading the config file

The filename: **sensorInfo.json** will be read in the preload() function for p5.js and will several global arrays of values.

The json file will look someting like this


`{
  "adafruitUsername" : "skildall",
  "sensors": {
    "sensorIDs": [1455, 1061, 632, 1475, 954, 1117, 893, 1068],
    "rooms": ["Balcony", "Garden", "Studio", "Bathroom", "Front Room", "Kitchen", "Living Room","Garden"]
  }
}`

**adafruitUsername:** this is the name of your adafruit user account. all of the feeds we will be accessing are public feeds. If you want to add private feeds, you will want to come up with a way to hide your credentials.


**sensors:** an array of sensors. each sensor has a unique chipID (integer) and a location name (string). 

## Why p5.js?

It's not the best persistent or interactive platform, however it is an great way to teach and intregrate the code. It also works for a simple portrait display.

## Display

This is what it should look like, more or less, though p5.js will do its own drawing.

Each sensor shows row of data with the example being two rows.

**The time** is the most recent record in Adafruit IO.

**AQI** currently an average of the PM1.0, PM2.5 and PM10 data. This will be improved in later versions.

**The color** green is more healthy, red is less healthy.

![](screenshot.png)

## CORS errors

If you call the Adafruit IO too often, you will get a CORS error. Since my sensors push data up only every minute, I have a timer which will also look for data every minute.

## Audio playback (v0.29)

The current build adds a Tone.js `PolySynth` mode that can play AQ history over time.

### Playback model

- AQ readings are stored per sensor as `{ ts, value }`.
- Playback uses a per-sensor playhead and cycles through stored values.
- Playback uses a fixed 24-hour history window in memory (not a user-set window size).
- Sensor selection is biased toward AQI streams that are changing fastest.
- Layering is now compositional (automatic): it starts sparse and adds voices over playback time, with extra density when AQI is changing rapidly.

### Controls (testing UI)

- `Play / Stop`: starts and stops Tone transport.
- `Time Scrub`: sets playback playhead jump size in minutes (`1`, `2`, `4`, `8`, `12` min).
- `Accrued Duration`: live summary of how much timeline data has been collected so far.

### On-canvas playback feedback

Each sensor row shows a right-side change dot while audio is playing:

- Dot lights on the specific row that just changed/played.
- Dot fades out quickly (no global top-row indicator).

### AQI instrument bands

Different AQI ranges route to different synth timbres:

- Lower AQI band: `Tone.Synth` (softer base drone).
- Mid AQI band: `Tone.AMSynth` (richer modulation).
- Higher AQI band: `Tone.FMSynth` (brighter/tenser tone).

### Polling model and rate-limit protection

Polling is split into two lanes:

- Active lane: sensors with data in the 2-hour freshness window.
  - One active sensor is polled per tick in round-robin order.
  - Tick interval is dynamic: `60000 / activeSensorCount` ms.
  - Example: `10` active sensors -> `6000` ms tick.
- Inactive lane: sensors outside the 2-hour freshness window.
  - Polled on a fixed `60000` ms cadence to detect reactivation.

Hard guard:

- Every sensor has a minimum `60` second gap between poll attempts, regardless of lane.

## ISP cache notes

Some ISP hosting layers aggressively cache HTML/JS, so new uploads can appear stale on phones. I clear the ISP cache after each upload.

### .htaccess (subdir only)

Add a `.htaccess` file in the same folder as `index.html` to prevent the HTML from being cached while leaving the rest of the site untouched:

```apache
<IfModule mod_headers.c>
  <Files "index.html">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </Files>
</IfModule>
```

### Updating files (cache-safe)

- Replace the versioned assets (for example `app.0.22.js` and `styles.0.22.css`) **and** `index.html`.
- Flush the Dynamic Cache.

### Versioning + cache flush workflow

- Each release gets versioned asset filenames (`app.0.xx.js`, `styles.0.xx.css`) and `index.html` is updated to reference that pair.
- `sensorInfo.json` is fetched with a timestamp query (`?v=<Date.now()>`) so config changes bypass cache.
- After deploy, flush host/ISP dynamic cache so `index.html` updates propagate immediately.
- `.htaccess` in this directory forces `index.html` no-cache while keeping the rest of the site unchanged.

### Version notes

- 0.1: Re-do of orginal AQI sensor project
- 0.11: show version number on long-press; AQI Nodes title; tighter layout, smaller AQI square; per-sensor update/ID under location on long-press
- 0.27: web deployment build (no sound playback)
- 0.28: first build with sound playback enabled
- 0.29: phone interaction fixes for `Play` and `Time Scrub`; build version moved beside title; larger phone AQI squares with safer 3-digit number spacing
