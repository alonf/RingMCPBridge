# Ring Alarm, Smart Lighting, and Other Device Control/State via Community (Unofficial) APIs

## 1. Ring Alarm (Gen1/Gen2, Alarm Pro): arming/disarming, bypass, delays, siren, panic, PIN, monitoring, and alarm-state exposure

### Takeaway
Alarm control goes through a "security-panel" pseudo-device on the location websocket. One command, `security-panel.switch-mode`, carries `mode` = `none` (disarmed), `some` (home) or `all` (away), plus an optional `bypass` array of sensor zids. **No PIN or code is sent or checked at the API level.** The siren uses `security-panel.sound-siren`/`silence-siren`. "Panic" is a separate REST call to Ring's monitoring endpoint, and it dispatches professional-monitoring response. State comes from the panel's `mode`, `transitionDelayEndTimestamp` (exit delay) and `alarmInfo.state` (entry delay or triggered type). No API setter was found for exit/entry delay durations.

### Cited Findings
**Code snapshot verified.** All four repos were cloned and inspected:
- ring-client-api 14.3.0 (dgreif/ring @ `925a3aa`, 2026-10-22).
- ring-mqtt 5.9.3 (tsightler/ring-mqtt @ `0a34496`, 2026-10-22).
- python-ring-doorbell 0.9.14, released 2026-02-27 (@ `486193a`).
- Home Assistant core `ring` integration @ `4ac1e52` (2026-10-23), pinned to `ring-doorbell==0.9.14`.

Sources: [ring package.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json), [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md), [python-ring-doorbell CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md), [HA manifest.json](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/manifest.json)

**Arming and disarming**
- The alarm mode type is `export type AlarmMode = 'all' | 'some' | 'none'`. — [ring-types.ts L156](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L156)
- `location.setAlarmMode(alarmMode, bypassSensorZids?)` sends `security-panel.switch-mode` with `{ mode, bypass }`.
  - It then awaits the security panel's next `onData` emission (`skip(1)`), with no timeout.
  - If the new `mode` doesn't match, it throws: `Failed to set alarm mode ... Sensors may require bypass, which can only be done in the Ring app.`
  - **That error text is stale or misleading.** The same call sends the `bypass` list, and ring-mqtt and homebridge-ring both use it.
  - — [location.ts L360-L376](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L360-L376)
- The convenience wrappers are `disarm()` → `setAlarmMode('none')`, `armHome(bypass?)` → `'some'` and `armAway(bypass?)` → `'all'`. `getAlarmMode()` returns `securityPanel.data.mode`. — [location.ts L378-L381, L457-L467](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L457-L467)

**Siren**
- `soundSiren()` sends `security-panel.sound-siren` and `silenceSiren()` sends `security-panel.silence-siren`. — [location.ts L383-L389](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L383-L389)

**How commands are sent**
- Every hub-device command is a `DeviceInfoSet` message (`datatype: 'DeviceInfoSetType'`, `dst: assetId`, `body: [{ zid, ... }]`) on the location websocket.
- `sendCommand(commandType, data)` wraps it as `{ command: { v1: [{ commandType, data }] } }`.
- It is **fire-and-forget**: `.catch(logError)`, with no acknowledgement returned to the caller.
- — [ring-device.ts L81-L106](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-device.ts#L81-L106)
- The security panel is found as the device with `deviceType === 'security-panel'`. If none exists, the call throws `Could not find a security panel for location`. — [location.ts L438-L455](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L438-L455)

**Panic / dispatch**
- `triggerBurglarAlarm()` and `triggerFireAlarm()` both POST to `rs/monitoring/accounts/{locationId}/assets/{baseStationUuid}/userAlarm`.
  - Body: `{ alarmSessionUuid, currentTsMs, eventOccurredTime, signalType }`.
  - `signalType` is `user-verified-burglar-xa` or `user-verified-fire-xa`.
  - The base-station asset lookup is hard-coded to `kind === 'base_station_v1'`. Otherwise it throws `Cannot dispatch panic events without an alarm base station`.
  - — [location.ts L495-L528](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L495-L528); [ring-types.ts L1215-L1218](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1215-L1218)
- The ring-mqtt FAQ says the API cannot put the alarm into pending or triggered state ("When Ring Alarm is armed it triggers pending/alarm state based on the connected sensors, not based on some call to the API").
  - The only exception is the panic sliders: "toggling these switches is considered a panic and will trigger immediate alarm and police/fire response and thus should be used with extreme care. As far as I know these switches require a Ring monitoring subscription to function."
  - — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- homebridge-ring describes its panic buttons this way: "If either switch is turned on, you will receive a call from Ring monitoring to verify the emergency, and then authorities will be dispatched". — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)

**State fields**
- Panel and device state fields in `RingDeviceData`:
  - `mode` (AlarmMode or ThermostatMode).
  - `transitionDelayEndTimestamp`.
  - `alarmInfo { state, faultedDevices?: string[], timestamp?, uuid? }`.
  - `siren { state: 'on'|'off' }`.
  - — [ring-types.ts L214-L240](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L214-L240)
- `AlarmState` values (comments from the source):

  | Value | Meaning |
  | --- | --- |
  | `burglar-alarm` | Ring is Alarming |
  | `entry-delay` | Alarm will sound in N seconds |
  | `fire-alarm` | Smoke |
  | `co-alarm` | CO |
  | `panic` | Panic triggered |
  | `user-verified-burglar-alarm` | User-verified police |
  | `user-verified-co-or-fire-alarm` | User-verified smoke or CO |
  | `burglar-accelerated-alarm` | Police response requested |
  | `fire-accelerated-alarm` | Fire department response requested |

  — [ring-types.ts L191-L212](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L191-L212)

**How ring-mqtt derives alarm state**
- `arming` = mode is `some` or `all` and `transitionDelayEndTimestamp` is in the future.
- `pending` = `alarmInfo.state === 'entry-delay'`.
- `triggered` = any other `AlarmState`. — [security-panel.js L86-L91](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L86-L91)
- The police panic state is ON when `alarmInfo.state` matches `/burglar|panic/`. Fire is ON when it matches `/co|fire/`. — [security-panel.js L208-L219](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L208-L219)
- ring-mqtt panel attributes:
  - Published: `entrySecondsLeft`, `exitSecondsLeft`, `lastArmedBy`/`lastArmedTime`, `lastDisarmedBy`/`lastDisarmedTime`, `alarmClearedBy`, `targetState`.
  - Mode and actor info come from websocket "impulse" messages: `security-panel.mode-switched.*`, `security-panel.exit-delay` and `security-panel.alarm-cleared`.
  - Countdowns come from `PassthruType` messages of type `security-panel.countdown`, with `transition: 'exit'|'entry'` and `timeLeft`.
  - — [security-panel.js L15-L25, L58-L80, L178-L190](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L58-L80)
- The ring-mqtt alarm panel's discovery component is `alarm_control_panel`; the siren and panic switches are `switch`. — [security-panel.js L29-L52](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L29-L52)
- ring-mqtt exposes a security panel only if `supportedAlarmTypes` includes `burglar-alarm`; otherwise it returns `'ignore'`. — [lib/ring.js L342-L353](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L342-L353)
  - Version 5.9.3 fixed a crash from an "unexpected security panel when users only have a Sidewalk based Ring device such as Kiddie Smoke/CO detector". — [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)

**PIN and delays (official Ring documentation)**
- PIN: "Your PIN is not required when you use the app to change modes". Keypad arming starts with "Enter your Keypad code". — [Ring support: Arming and disarming Ring Alarm](https://ring.com/support/articles/8fscc/Arming-and-disarming-Ring-Alarm)
- Exit Delay and Entry Delay can each be set from 0 to 180 seconds. "During Exit Delay, you cannot turn on the siren." — same source
- "When arming the Alarm system by a schedule, all faulted sensors will be automatically bypassed". Mode schedules can be created only by account owners. — same source
- homebridge-ring: "Entry delays and bypassed sensors (ex. for Home mode) are all controlled in the Ring app." — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)

**Professional monitoring (summarized by WebFetch, not verbatim)**
- With 24/7 Professional Monitoring, "you can silence your siren during an alarming event without canceling the request for emergency service dispatch". Smoke/CO stays monitored in Disarmed mode. — [Ring support: Arming and disarming](https://ring.com/support/articles/8fscc/Arming-and-disarming-Ring-Alarm)
- Plan naming: a search summary says Ring Home plans were renamed Ring Protect plans on Jan 14, 2026, with "Home Standard + 24/7 Professional Monitoring" mapped to "Ring Pro / Ring AI Pro". **Unverified, taken from a search snippet.** — [Ring support: Introducing Ring plans](https://ring.com/support/articles/v5hc7/introducing-ring-plans)

**Alarm push events (read-only)**
- Push actions: `HANDLE_NEW_SECURITY_PANEL_MODE_NONE_NOTICE`, `..._MODE_SOME_NOTICE`, `HANDLE_NEW_USER_SOUND_SIREN` and `HANDLE_NEW_NON_ALARM_SIREN_SILENCED`. — [ring-types.ts L1042-L1045](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1042-L1045)
- python-ring-doorbell maps these push actions to event kinds `alarm_mode_none`, `alarm_mode_some`, `alarm_siren` and `alarm_silenced`. **It has no alarm control methods at all.** — [const.py L124-L127, L218-L221](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L218-L221)

**Alarm Pro**
- `BaseStationPro: 'hub.kili'` exists in the enum. — [ring-types.ts L5](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L5)
- homebridge-ring maps `BaseStationPro` like `BaseStation` and `Keypad`, to a `BrightnessOnly` accessory. — [ring-platform.ts L91-L94](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/ring-platform.ts#L91-L94)
- ring-mqtt's `getDevice` has no case for `hub.kili`, so the Pro base-station device itself falls through to `"not-supported"`. Its security panel and sensors are still mapped. — [lib/ring.js L312-L410](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L312-L410)

**Cellular backup**
- Asset sessions report `connectionStatus: 'unknown' | 'cell-backup' | 'online'`. — [ring-types.ts L184-L189](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L184-L189)
- The websocket ticket request includes `enableExtendedEmergencyCellUsage=true`. — [location.ts L232-L240](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L232-L240)

### Inferences
- **State resource.** An MCP "alarm" resource can be populated entirely from the security-panel device data and websocket messages:
  - `mode`
  - derived state (disarmed / armed_home / armed_away / arming / pending / triggered)
  - `alarmInfo.state` and `faultedDevices`
  - exit/entry seconds left
  - last armed/disarmed by and time
  - siren state
  - base-station connection (online vs cell-backup)
- **Control tools:** `arm_home(bypass_zids?)`, `arm_away(bypass_zids?)`, `disarm`, `siren_on`/`siren_off`, and the high-risk `panic_burglar`/`panic_fire`.
- **The server must implement its own authorization step.** Ring's API does not enforce a PIN for app-equivalent clients, so any PIN or confirmation is up to the MCP server.
- **Verify every command.** `sendCommand` gives no ack and `setAlarmMode` waits forever. The MCP server should add a timeout and confirm the outcome by reading back `mode`, as ring-mqtt does.
- **Gen1 vs Gen2.** I found no difference between Gen1 and Gen2 Ring Alarm in any library. Both appear as `hub.redsky` base station plus `security-panel`. This is inferred from the lack of any branching code.

### Gaps
- **No setters found for delays or schedules.** None of the four libraries exposes a way to read or set exit/entry delay durations or arming schedules.
- **Dispatch control is missing.** I found no API in any library to cancel or verify a monitoring dispatch, dismiss an entry delay, or trigger a medical panic. The `user-verified-*` and `*-accelerated-*` states are read-only.
- **Alarm Pro asset kind is unknown.** I couldn't confirm whether the Alarm Pro's websocket asset `kind` is `base_station_v1`. If it differs, `triggerAlarm()` would throw on Pro systems. No source found.
- **Subscription requirement is unconfirmed.** A WebFetch summary of the Ring support footnotes says a compatible Ring subscription is needed for "digital arming and disarming". I could not get the verbatim footnote. This could mean API arming fails for accounts without a plan.
- **Monitoring behavior per plan is untested.** There is no verified data on how the panic or `userAlarm` endpoint behaves without professional monitoring. ring-mqtt's author hedges ("As far as I know").
- **Gen1 vs Gen2 command differences** are not documented anywhere I found.

## 2. Sensor and device types: the RingDeviceType enum, reported fields, and third-party Z-Wave devices

### Takeaway
The `RingDeviceType` enum in ring-client-api is the de-facto catalog. It covers base station (Gen1/2 `hub.redsky`, Pro `hub.kili`), keypad, contact, motion, flood/freeze, freeze, water, tilt, glass-break, temperature, smoke, CO, smoke/CO listener, Kidde Smoke+CO, panic, range extender, retrofit zones, Z-Wave switches/dimmers/bulbs/fans, thermostat, water valve, Beams devices, and adapters. Locks and sirens are **not** enum members; ring-mqtt matches them by raw deviceType string. All hub devices share one generic data shape (faulted, tamper, battery, AC, comm status, and so on).

### Cited Findings
**The enum**
- Full `RingDeviceType` contents:

  | Group | Members |
  | --- | --- |
  | Hubs and panel | `hub.redsky`, `hub.kili` (Pro), `security-keypad`, `security-panel` |
  | Sensors | `sensor.contact`, `sensor.motion`, `sensor.flood-freeze`, `sensor.freeze`, `sensor.temperature`, `sensor.water`, `sensor.tilt`, `sensor.glassbreak`, `sensor.zone` (retrofit), `sensor` (generic) |
  | Network and adapters | `range-extender.zwave`, `adapter.zigbee`, `adapter.ringnet`, `adapter.zwave`, `bridge.flatline` (retrofit bridge) |
  | Access codes | `access-code.vault`, `access-code` |
  | Life safety | `alarm.smoke`, `alarm.co`, `listener.smoke-co`, `comp.bluejay.sensor_bluejay_wsc` (Kidde Smoke+CO) |
  | Z-Wave switches and climate | `switch.multilevel` (also Fan), `switch.multilevel.bulb`, `switch`, `temperature-control.thermostat`, `valve.water`, `unknown.zwave` |
  | Beams (smart lighting) | `motion-sensor.beams`, `switch.beams`, `switch.multilevel.beams`, `group.light-group.beams`, `switch.transformer.beams`, `device.beams` |
  | Other | `security-panic`, `onvif_camera`, `third_party_gdo`, `intercom_handset_audio`, `intercom_handset_video` |

  — [ring-types.ts L3-L51](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L3-L51)
- `RingDeviceCategory` IDs: Outlets 1, Lights 2, Sensors 5, Appliances 7, Locks 10, Thermostats 11, Cameras 12, Alarms 15, Fans 17, Security 22, Unknown 29, SensorsMotion 30, Controller 31, RangeExtenders 32, Keypads 33, Sirens 34, PanicButtons 35, WaterValves 37. — [ring-types.ts L55-L74](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L55-L74)

**Shared device data shape (`RingDeviceData`)**

| Group | Fields |
| --- | --- |
| Identity | `zid`, `name`, `deviceType`, `categoryId`, `manufacturerName?`, `serialNumber?`, `roomId?`, `groupId?`, `tags` (`hidden`/`sleepy`/`ota-lock`/...) |
| Power | `batteryLevel?`, `batteryStatus` (`full`/`charged`/`ok`/`low`/`none`/`charging`), `batteryBackup?` (`charged`/`charging`/`inUse`), `acStatus?` (`error`/`ok`) |
| Security | `tamperStatus` (`ok`/`tamper`), `faulted?`, `motionStatus?` (`clear`/`faulted`) |
| Locks | `locked?` (`jammed`/`locked`/`unlocked`/`unknown`) |
| Alarm and life safety | `siren`, `alarmStatus`, `co.alarmStatus`, `smoke.alarmStatus` (`active`/`inactive`), Kidde `components['alarm.co'|'alarm.smoke']`, `flood.faulted`, `freeze.faulted` |
| Switches and lights | `on?`, `level?` (0-1), `hs` hue/sat (0-1), `ct` (0-1), `brightness?` (keypad, 0-1), `motionSensorEnabled?` (Beams) |
| Retrofit zones | `status` (`enabled`/`disabled`), `parentZid`, `rootDevice`, `relToParentZid` ('1'-'8') |
| Temperature | `celsius`, `faultHigh`, `faultLow` |
| Thermostat | `setPoint`, `setPointMax`, `setPointMin` |
| Other | `volume?`, `basicValue?` (unknown.zwave: 0 off / 255 on), `componentDevices`, `valveState?` (`open`/`closed`) |

— [ring-types.ts L214-L286](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L214-L286)

- Volume can be set only on `deviceTypesWithVolume = [BaseStation, Keypad]`, range 0-1, via `setInfo({device:{v1:{volume}}})`. — [ring-types.ts L288](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L288); [ring-device.ts L60-L79](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-device.ts#L60-L79)

**How ring-mqtt maps device types**
- Matched by `instanceof` or regex: `RingCamera` → Camera, `RingChime` → Chime, `RingIntercom` → Intercom, and `/^lock($|\.)/` → Lock.
- Binary sensors: contact, retrofit zone, tilt, glassbreak, motion and generic `sensor` → BinarySensor.
- Life safety: flood-freeze → FloodFreezeSensor; `security-panel` (burglar only) → SecurityPanel; smoke → SmokeAlarm; co → CoAlarm; Kidde → SmokeCoKiddie; smoke/CO listener → SmokeCoListener.
- Lighting and switches: Beams motion/multilevel/transformer/light-group → Beam; `device.beams` → BeamOutdoorPlug; `switch.multilevel` → Fan if `categoryId === 17`, else MultiLevelSwitch; `switch` → Switch.
- Hub devices: keypad → Keypad; `hub.redsky` → BaseStation; range extender → RangeExtender; `adapter.ringnet` → Bridge, ignored if tagged hidden.
- Virtual and string-matched: `location.mode` (virtual) → ModesPanel; `siren` and `siren.outdoor-strobe` → Siren.
- Climate and water: thermostat → Thermostat; temperature → TemperatureSensor, skipped when its parent is a thermostat; `valve.water` → Valve; `security-remote` → PanicButton.
- Explicitly ignored: `switch.beams`, `access-code`, `access-code.vault`, `adapter.sidewalk`/`zigbee`/`zwave`/`shadow`, `thermostat-operating-status`.
- Everything else → `"not-supported"`, including `hub.kili`, `third_party_gdo` and `unknown.zwave`.
- — [lib/ring.js L312-L410](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L312-L410)
- **Panic button mismatch.** The enum says `PanicButton: 'security-panic'`, but ring-mqtt matches the string `'security-remote'`. Its PanicButton class publishes attributes only (battery/tamper/info), with no press event. — [panic-button.js](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/panic-button.js)

**ring-mqtt info and attribute sensor fields**
- Generic fields (base-socket-device): `acStatus`, battery fields, `chirps`, `commStatus`, `firmwareStatus` (from `firmwareUpdate.state`), `linkQuality` (Z-Wave), `serialNumber`, `tamperStatus`, and `wirelessNetwork`/`wirelessSignal` (when `networkConnection === 'wlan0'`). — [base-socket-device.js L42-L123](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/base-socket-device.js#L84-L123)
- Keypad:
  - Volume.
  - A `chirps` config switch: `setInfo({device:{v1:{chirps:'enabled'|'disabled'}}})`.
  - A proximity "motion" binary sensor from `impulseType === 'keypad.motion'`. — [keypad.js L26-L46, L113-L124](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/keypad.js)
- The wiki notes the keypad proximity sensor "requires keypad LED Settings of 'Keep Mode Button Lit' or 'Motion Turns on Lights'". — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)
- Outdoor siren (`siren.outdoor-strobe`):
  - Volume 0-4 via `setInfo`.
  - **The on/off switch sends `siren-test.start`/`siren-test.stop`. It is a test, not a real alarm siren.**
  - A plain Z-Wave `siren` uses `setInfo({device:{v1:{on}}})`.
  - — [siren.js L12-L25, L59-L83](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/siren.js#L59-L83)

**Third-party Z-Wave devices**
- ring-mqtt supports: "3rd party Z-Wave door locks (Wi-Fi based locks integrated via Amazon Key are **NOT** supported as they use a completely different API)", plus Z-Wave switches, dimmers, fans, motion/contact/tilt sensors ("basic support"), thermostats, temperature sensors, sirens, Zooz water shut-off valves, First Alert Z-Wave Smoke/CO, and Kidde Smart Smoke and Smoke/CO alarms. — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)
- Kidde support is experimental:
  - ring-client-api 14.3.0: "Add support for Kidde Ring Smoke + CO Alarm device (comp.bluejay.sensor_bluejay_wsc). Note, this has not been tested and may not be working yet." — [ring-client-api CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
  - ring-mqtt 5.9.0 calls Kidde "the first supported non-Zwave alarm device". — [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
- homebridge-ring marks the Freeze Sensor, Glassbreak Sensor and Water Valves as "**untested**". It also supports Fans, "Lights/Switches/Outlets/Unknown (some brands of blinds, etc.)" and Thermostats. — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)
- homebridge-ring maps `unknown.zwave` to `UnknownZWaveSwitchSwitch`, using `basicValue`. — [ring-platform.ts L128-L129](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/ring-platform.ts#L128-L129)

### Inferences
- **Build the device catalog from the enum, with string fallbacks.** An MCP server can use `RingDeviceType` but also needs fallback string matching for `lock*`, `siren*`, `security-remote` and `location.mode`. The enum lags what Ring actually reports.
- **One generic "hub device" resource works.** Fields: zid, type, category, name, room, faulted/motion, tamper, battery, AC, comm status, link quality, firmware.
- **Expose device-specific fields as optional extensions.**

### Gaps
- **Panic button string.** I couldn't confirm which string real Ring panic buttons report (`security-panic` vs `security-remote`). The two libraries disagree.
- **Glass break specifics.** I found no explicit glass-break fields beyond the generic `faulted`.
- **Gen2 sensor differences.** No Gen2-specific sensor fields documented.
- **Access codes.** Types `access-code` and `access-code.vault` exist, but every integration ignores them. I found no API for managing keypad or user access codes.
- **Range extender and base station.** No dedicated fields beyond the generic ones (AC, battery, battery backup, tamper). Cellular backup state appears only through the asset session status.

## 3. Ring Smart Lighting (Beams bridge): control and state

### Takeaway
1st-gen Ring Smart Lighting connects through the Beams bridge on the same location websocket as the alarm. It is fully readable and controllable:
- motion sensors (`motionStatus`)
- light on/off with duration
- brightness (multilevel)
- transformers
- light groups (via a REST "groups" endpoint)
- the Outdoor Smart Plug (two outlets)

**2nd-gen Smart Lighting, which runs on Amazon Sidewalk, is not supported by ring-mqtt.**

### Cited Findings
- Asset kinds that get a websocket include `beams_bridge*`: `isWebSocketSupportedAsset = kind.startsWith('base_station') || kind.startsWith('beams_bridge')`. — [ring-types.ts L1269-L1271](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1269-L1271)
- Light on/off (ring-mqtt Beam):
  - Individual light: `sendCommand('light-mode.set', {lightMode:'on', duration})`. Off is `{lightMode:'default'}`.
  - Group: `location.setLightGroup(groupId, on, duration)`.
  - Duration is capped at 32767.
  - Brightness: `setInfo({device:{v1:{level: level/100}}})`.
  - Motion is ON when `motionStatus === 'faulted'`.
  - — [beam.js L76-L148](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/beam.js#L108-L148)
- `setLightGroup` POSTs to `https://api.ring.com/groups/v1/locations/{locationId}/groups/{groupId}/devices` with `{lights_on:{duration_seconds, enabled}}`. The default duration is 60 s. — [location.ts L391-L403](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L391-L403)
- ring-mqtt Smart Lighting topics: `motion/state`, `light/state|command`, `light/brightness_state|command` (0-100) and `light/duration_state|command` (0-32767). — [ring-mqtt wiki: MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)
- ring-mqtt supported features:
  - "Smart Lighting (1st Gen) — **Note: Ring 2nd Gen Smart Lighting, based on Amazon Sidewalk, is not currently supported**".
  - Lighting and motion sensors.
  - "Light groups (requires using Ring primary account)".
  - "Light duration (set per-device)".
  - — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)
- Outdoor Smart Plug (`device.beams`): ring-mqtt exposes `outlet1` and `outlet2`, the child `switch.beams` devices with `relToParentZid` "1" and "2". Each is a `light` (if `categoryId === 2`) or a `switch`. — [beam-outdoor-plug.js L9-L23](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/beam-outdoor-plug.js)
- homebridge-ring:
  - Covers "Ring Smart Lights (Motion Detector, Flood/Path/Step/Spot Lights, Bulbs, Transformer, Outdoor Smart Plug, Mailbox Sensor)" with On/Off, Brightness, motion and battery.
  - Has a `beamDurationSeconds` option and a `hideLightGroups` option.
  - — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md); [config.schema.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/config.schema.json)
- python-ring-doorbell has a `RingLightGroup` class with the LIGHT capability and `async_set_lights(...)`. The HA core integration does not create Beams entities. Its `light` platform covers only "Cameras with a light, such as floodlights". — [group.py L20-L104](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/group.py); [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Beams state fields: `on`, `level` (0-1), and `motionSensorEnabled` ("switch.multilevel.beam"). Retrofit and transformer devices share the generic fields. — [ring-types.ts L254-L283](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L254-L283)

### Inferences
- **MCP lighting tools:** `light_set(on, duration_s?)`, `light_set_brightness(0-100)` and `light_group_set(on, duration_s)`.
- **State resource:** per-light on/level and per-motion-sensor motion. Updates arrive in real time over the websocket.
- **Lower risk.** These are non-security actions, so they are reasonable candidates for no-confirmation tools.

### Gaps
- **Unread settings.** No library reads or writes light schedules, motion-sensor sensitivity, or "lights on motion" linking. `motionSensorEnabled` is only a typed field with no setter.
- **2nd-gen Smart Lighting** (Sidewalk) has no community API support. I found nothing on how it is exposed.

## 4. Cameras, doorbells, chimes, intercom, location Modes, locks, and other devices: control and state

### Takeaway
Camera, chime and intercom control goes over REST to `api.ring.com`. Status comes from polling, and ding/motion events from FCM push.

| Device | Controls |
| --- | --- |
| Camera | floodlight/spotlight on/off; siren on/off (Python allows 0-120 s duration); motion detection on/off; motion warning (announcement) on/off; in-home doorbell enable; volume |
| Chime | play ding/motion sound; snooze (≤1440 min) and clear; volume 0-11; nightlight |
| Intercom | unlock door (plus Python invite/remove user access); volumes |
| Location Modes | home/away/disarmed, only for locations **without** Ring Alarm |

Motion snooze and privacy mode have typed fields, but **no library implements a setter**. Ring Car Cam and Car Alarm are not covered anywhere.

### Cited Findings
**Cameras: ring-client-api**
- `setLight(on)` → `PUT doorbots/{id}/floodlight_light_on|off`.
- `setSiren(on)` → `PUT doorbots/{id}/siren_on|off`.
- `setSettings` → `PUT doorbots/{id}` with `{doorbot:{settings}}`.
- `setDeviceSettings` → `PATCH devices/{id}/settings`. `getDeviceSettings` is the matching GET.
- `setInHomeDoorbell(enable)` → `chime_settings.enable`.
- — [ring-camera.ts L333-L407](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L333-L407)
- `startLiveCall` refuses when `settings.live_view_disabled === true` ("set by modes"). Version 14.3.0 added: "Block streaming from cameras based on location mode settings. This may prevent you from streaming in cases where you could previously stream in HomeKit but not the Ring app." — [ring-camera.ts L432-L436](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L432-L436); [CHANGELOG 14.3.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- Camera event streams are `onDoorbellPressed`, `onMotionDetected`, `onMotionStarted` and `onNewNotification`. — [ring-camera.ts L144-L169](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L144-L169)

**Cameras: ring-mqtt**
- Motion detection on/off uses `setDeviceSettings({motion_settings:{motion_detection_enabled}})`. On a 404 it logs "Shared accounts cannot change motion detection settings!" — [camera.js L1175-L1199](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1175-L1199)
- Motion warning uses `PUT doorbots/{id}/motion_announcement?motion_announcement=true|false`. — [camera.js L1202-L1211](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1202-L1211)
- Camera entities: ding, motion, motion_detection, motion_warning, light, siren, video_mode, snapshot, snapshot_mode, snapshot_interval, take_snapshot (button), stream, event_stream, event_select, motion_duration and ding_duration. — [camera.js L23-L240](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js); [MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)

**Cameras: python-ring-doorbell**
- `async_set_siren(duration)` accepts integers from 0 (`SIREN_DURATION_MIN`) to 120 (`SIREN_DURATION_MAX`) and does `PUT .../siren_on?duration=N` or `siren_off`. — [stickup_cam.py L177-L194](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/stickup_cam.py#L177-L194); [const.py L150-L151](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L150-L151)
- Other setters: `async_set_light(bool)`, `async_set_lights(str)`, `async_set_motion_detection`, `async_set_volume`, and `async_set_existing_doorbell_type` / `_enabled` / `_duration`. — [doorbot.py L199-L436](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py); [stickup_cam.py L150-L177](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/stickup_cam.py)
- Capability enum: VIDEO, MOTION_DETECTION, HISTORY, LIGHT, SIREN, VOLUME, BATTERY, OPEN, KNOCK, PRE_ROLL, DING. — [const.py L28-L41](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L28-L41)

**Home Assistant core**
- Platforms: button, camera, event, light, number, sensor, siren, switch. **There is no `alarm_control_panel`.** — [const.py L16-L24](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/const.py#L16-L24)
- Switches: `siren` (`async_set_siren(1)` on, `(0)` off), `in_home_chime` and `motion_detection`. — [switch.py L91-L115](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/switch.py#L91-L115)
- HA docs on the siren: "the siren will only turn on for 30 seconds before automatically turning off". — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Numbers: volume (doorbell/chime), `doorbell_volume`, `mic_volume` and `voice_volume` (intercom). — [number.py L55-L100](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/number.py#L55-L100)
- The button is `open_door` (intercom). Events are ding, motion and `intercom_unlock`. — [button.py L19](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/button.py#L19); [event.py L34-L49](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/event.py#L34-L49)

**Motion snooze and privacy**
- The type fields exist: `motion_snooze: null | {scheduled: boolean}`, `motion_snooze_preset_profile`, `motion_snooze_presets`, `motion_settings.motion_snooze_privacy_timeout`, and `live_view_disabled` ("set by modes"). — [ring-types.ts L479-L524](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L479-L524)
- The only code use of `live_view_disabled` is the read in `startLiveCall`. — [ring-camera.ts L432-L436](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L432-L436). See Gaps for the negative grep result on setters.

**Location Modes**
- Calls:
  - `getLocationMode()` → `GET app api mode/location/{id}`.
  - `setLocationMode('home'|'away'|'disarmed')` → POST `{mode}`.
  - `disableLocationModes()` → `DELETE .../settings`.
  - Also `enableLocationModes()`, `get`/`setLocationModeSettings`, and `get`/`setLocationModeSharing(sharedUsersEnabled)`.
  - — [location.ts L530-L616](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L530-L616)
- `LocationMode` adds `'disabled' | 'unset'`. — [ring-types.ts L1223-L1225](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1223-L1225)
- `supportsLocationModeSwitching()` returns false if the location `hasAlarmBaseStation` or has no cameras. With Ring Alarm, the alarm mode is the location mode. — [location.ts L605-L616](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L605-L616)
- ring-mqtt needs `enable_modes` set. It then creates a virtual `location.mode` "Modes Control Panel" alarm panel (disarm/arm_home/arm_away) and polls every 20 s. — [lib/ring.js L114, L241-L243](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L241-L243); [MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)
- Mode semantics (Ring blog via search summary):
  - **Disarmed:** included devices off; indoor cameras can't detect motion or offer Live View; alarm sensors disarmed.
  - **Home:** indoor cams off; motion detectors disarmed; contact sensors armed.
  - **Away:** all cams on; all sensors armed.
  - Defaults are configurable per device. — [Ring blog: Modes](https://blog.ring.com/2020/03/30/new-modes-feature-makes-it-easy-to-control-your-ring-devices-with-just-one-tap-on-the-app/)

**Chimes**
- ring-client-api calls:
  - `playSound(kind)` → `POST chimes/{id}/play_sound`.
  - `snooze(minutes)` (max 1440) → `POST do_not_disturb {time}`. `clearSnooze()` calls the same endpoint with no body.
  - `setVolume(0-11)`.
  - `updateChime()` reports whether a setting change requires a reboot.
  - `getHealth()` and `setNightlightEnabled()` (Chime Pro nightlight, added in 14.3.0).
  - — [ring-chime.ts L88-L168](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-chime.ts#L88-L168)
- ring-mqtt says chimes require "using Ring primary account" because "Access to Chimes cannot be granted to shared users". — [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details)

**Intercom**
- ring-client-api:
  - `unlock()` → `PUT commands/v1/devices/{id}/device_rpc` with a JSON-RPC `unlock_door` request, `{door_id:0, user_id:0}`. **The RPC result is not checked.**
  - Also `onDing`, `onUnlocked` and `batteryLevel`.
  - — [ring-intercom.ts L16-L17, L63-L83](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-intercom.ts#L63-L83)
- python-ring-doorbell:
  - `async_open_door(user_id=-1)` returns True only if `result.code == 0`.
  - `async_invite_access(email)` POSTs an invitation granting door access, and `async_remove_access(user_id)` deletes one. `async_get_allowed_users` lists users.
  - Volume setters: `async_set_doorbell_volume`, `async_set_mic_volume` and `async_set_voice_volume`. Also `async_set_clip_length_max` and `async_set_keep_alive_auto`.
  - — [other.py L125-L275](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/other.py#L222-L275)
- Ring Intercom Video:
  - ring-client-api 14.2.0 added "basic support ... (ding notifications, but no video/audio streaming)". python-ring-doorbell 0.9.14 also supports it. — [ring-client-api CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [python-ring-doorbell CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)
  - homebridge-ring: "Intercom support is still experimental". — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)

**Locks**
- Z-Wave locks paired to the base station: ring-mqtt and homebridge both call `device.sendCommand('lock.lock'|'lock.unlock')`. State maps `locked` → LOCKED and `unlocked` → UNLOCKED; anything else (e.g., `jammed`) → UNKNOWN. — [lock.js L15-L52](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/lock.js); [homebridge lock.ts L82](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/lock.ts#L82)
- Amazon Key Wi-Fi locks are not supported. — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)

**Other device types**
- **Garage door opener:** a `third_party_gdo` enum entry exists, but ring-mqtt has no handler for it. — [ring-types.ts L45](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L45); [lib/ring.js L410](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L410)
- **Car Cam / Car Alarm:** the only vehicle-related item found is the `moving_vehicle` computer-vision detection type in camera settings. It is not a device class. — [ring-types.ts L818](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L818)

**Current vs deprecated**
- Home Assistant core no longer lists `binary_sensor` in its Ring `PLATFORMS`. — [HA const.py L16-L24](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/const.py#L16-L24)
  - This matches the docs' instruction to migrate ding/motion/intercom automations to the event entity "by release 2025.4.0". The docs also say volume sensors are being replaced by number entities. — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- python-ring-doorbell lists the synchronous `lights` and `siren` property setters in `DEPRECATED_API_PROPERTY_SETTERS`. Use `async_set_light(s)` and `async_set_siren` instead. — [stickup_cam.py L196-L200](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/stickup_cam.py#L196-L200)
- ring-client-api 14.0.0 converted to ESM only and dropped Node 18. Enums became `as const` objects. — [ring-client-api CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

### Inferences
- **Camera tools:** `light_on`/`light_off`, `siren_on(duration?)`/`siren_off`, `set_motion_detection`, `set_motion_warning`, `set_in_home_chime`, `set_volume`.
- **Chime tools:** `play_sound(ding|motion)`, `snooze(minutes)`/`clear_snooze`, `set_volume`, `set_nightlight`.
- **Intercom tools:** `unlock_door` (high risk), plus volumes.
- **Modes tools:** `set_location_mode`, only when no alarm is present.
- **Check results yourself.** Intercom unlock should use the Python-style result-code check. The JS library returns no confirmation.
- **Smart plugs are already covered elsewhere.** The Ring Outdoor Smart Plug is reachable via the Beams bridge (section 3). Z-Wave plugs and switches are reachable via the base station (section 2). No other Ring smart-plug class was found.

### Gaps
- **Motion snooze and privacy mode:** no implemented setters. A local grep of all four repos (ring @ 925a3aa, ring-mqtt @ 0a34496, python-ring-doorbell @ 486193a, HA @ 4ac1e52) found no code that writes `motion_snooze`, privacy fields or `live_view_disabled`. The endpoint and payload are unknown from community code. `setDeviceSettings` with `motion_settings` might work but is unverified.
- **Ring Car Cam / Car Alarm:** no community API coverage found. A local grep of all four repos for car/vehicle terms matched only the `moving_vehicle` CV type.
- **Ring-branded or Wi-Fi locks** (Amazon Key / Level): unsupported, and I found no API documentation.
- **Third-party garage door openers** (`third_party_gdo`): no handler in ring-mqtt. I didn't verify whether homebridge-ring handles it.
- **Intercom permissions:** I didn't verify whether `invite_access`/`remove_access` need the owner account.

## 5. Settings changeable via API vs read-only

### Takeaway
A limited set of settings is exercised and known to work through community libraries: toggles and levels such as motion detection, motion warning, volumes, snooze, nightlight, keypad chirps, outdoor siren volume, thermostat, valve, light level and duration, and location mode/mode settings. Two generic setters (`setSettings` and `setDeviceSettings`) can PATCH arbitrary camera settings: motion zones, PIR sensitivity, advanced motion, light schedules and so on. **But no library exercises those beyond `motion_detection_enabled`, so they are effectively unverified.** Entry/exit delays, alarm schedules, bypass defaults and notification preferences have no setters in any library.

### Cited Findings
**Verified writable settings**

| Device | Setting | How | Source |
| --- | --- | --- | --- |
| Camera | Motion detection | `PATCH devices/{id}/settings` with `motion_settings.motion_detection_enabled` | [camera.js L1175-L1199](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1175-L1199) |
| Camera | Motion warning | `PUT motion_announcement` | [camera.js L1202-L1211](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1202-L1211) |
| Doorbell | In-home doorbell | `chime_settings.enable` | [ring-camera.ts L400-L407](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L400-L407) |
| Doorbell | Doorbell volume | `async_set_volume` | [doorbot.py L381](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L381) |
| Doorbell | Existing (mechanical/digital) chime type, enable, duration | `async_set_existing_doorbell_type*` | [doorbot.py L199-L280](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L199-L280) |
| Chime | Volume 0-11, snooze, nightlight | ring-client-api chime methods | [ring-chime.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-chime.ts#L96-L168) |
| Base station, keypad | Volume 0-1 | `setInfo` | [ring-device.ts L67-L79](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-device.ts#L67-L79) |
| Keypad | Chirps | `setInfo` | [keypad.js](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/keypad.js) |
| Outdoor siren | Volume 0-4 | `setInfo` | [siren.js L72-L83](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/siren.js#L72-L83) |
| Thermostat | `mode`, `setPoint`, `deadBand`, `fanMode` | `setInfo` | [thermostat.js L173-L268](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/thermostat.js) |
| Water valve | Open/close | `valve.open`/`valve.close` commands | [valve.js L48](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/valve.js#L48) |
| Switches, dimmers, fans | `on`, `level` | `setInfo` | [switch.js L39](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/switch.js#L39); [multi-level-switch.js L44-L61](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/multi-level-switch.js); [fan.js L72-L104](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/fan.js) |
| Intercom | Doorbell, mic and voice volume; max clip length | python-ring-doorbell setters | [other.py L125-L210](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/other.py#L125-L210) |
| Location | Mode, mode settings, mode sharing | ring-client-api location methods | [location.ts L543-L603](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L543-L603) |

- Thermostat ranges come from the ring-mqtt topic docs: mode off/cool/heat/auto, target temperature, auto low/high range, fan mode and aux heat. — [MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)

**Typed but unexercised camera settings**
- `CameraDeviceSettingsData` includes:
  - `advanced_motion_settings` (`active_motion_filter`, `motion_zone_overlap`)
  - `motion_settings` (`motion_detection_enabled`, `advanced_motion_detection_*`, `motion_snooze_privacy_timeout`, `advanced_motion_zones_enabled`/`_type`, `enable_recording`)
  - `video_settings`, `vod_settings`, `volume_settings`
  - `cv_settings` (detection types incl. `moving_vehicle`)
  - `general_settings` (`enable_audio_recording`, `lite_24x7_enabled`, `offline_motion_event_enabled`)
  - `pir_settings` (`sensitivity_1..3`, `zone_enable`), `snapshot_settings`
  - `client_device_settings` (`people_only_enabled`, `night_vision_enabled`, `light_schedule_enabled`, `motion_message_enabled`)
  - `concierge_settings` (`alexa_settings`, `autoreply_settings`)
  - — [ring-types.ts L757+](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L757)

**Account-role limits**
- Shared accounts get a 404 when changing motion detection. — [camera.js L1193-L1194](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1193-L1194)
- "Ring shared users do not have access to control the Base Station volume". — [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details)
- Chimes and light groups require the primary account. — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)

**Sensor bypass is local to ring-mqtt, not a Ring setting**
- ring-mqtt keeps a per-sensor `bypass_mode` (Never / Faulted / Always) in its own state file. It applies the mode at arm time by passing zids in the `bypass` array.
- "The contact, zone and tilt sensors support all three bypass modes, while motion and glassbreak sensors do not support 'Faulted' mode."
- — [Configuration Details: Sensor Bypass](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details); [security-panel.js L265-L305](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L265-L305)

**Notifications**
- A Ring community answer says notifications are not controlled by Modes; motion detection per mode is. This is a search-summarized community post that may be dated. — [Ring community](https://community.ring.com/t/when-disarmed-allow-me-to-disable-ring-notifications/185735)

### Inferences
- **Two tiers of settings tools.** Expose the verified setters as first-class tools. Gate any "raw settings PATCH" behind an advanced or expert flag, since payload semantics are unverified and wrong values could disable recording or motion detection.
- **Keep bypass policy in the MCP server.** ring-mqtt shows that bypass policy can live in the bridge, not at Ring.

### Gaps
- **No working examples for most camera settings.** I found none for setting motion zones, PIR sensitivity, light schedules, notification toggles or motion snooze via any library. Read/write semantics are unverified.
- **No alarm-configuration setters.** No API found for entry/exit delays, alarm schedules, keypad access codes or Ring Alarm "Modes settings" (which sensors are armed in Home vs Away).

## 6. ring-mqtt device-to-topic/entity catalog (ground truth of what is readable/controllable today)

### Takeaway
ring-mqtt 5.9.3 is the most complete open catalog. Topics follow `ring/<location_id>/<category>/<device_id>/<entity>/state|command`. "Category" is `alarm`, `lighting` (the overview text says `smart_lighting`; the device topics say `lighting`), `camera` or `chime`. Every device also gets `.../status` and an `info/state` JSON sensor.

### Cited Findings
- Topic format, `status` topic, and the info sensor (battery, tamper, comm state, volume, Wi-Fi signal) are described in the topic docs. — [ring-mqtt wiki: MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)
- The catalog table below is compiled from the [MQTT Device Topics wiki](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics), [wiki Home](https://github.com/tsightler/ring-mqtt/wiki), [lib/ring.js L312-L410](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L312-L410), and the per-device sources in [devices/](https://github.com/tsightler/ring-mqtt/tree/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices):

| Device (Ring deviceType) | ring-mqtt class | Readable state (entities) | Commands | HA component(s) |
|---|---|---|---|---|
| Alarm Control Panel (`security-panel`, burglar-capable only) | SecurityPanel | `alarm` disarmed / armed_home / armed_away / arming / pending / triggered; attrs alarmState, entry/exitSecondsLeft, lastArmedBy/Time, lastDisarmedBy/Time, alarmClearedBy; `siren`; `police`/`fire` (if `enable_panic`) | `alarm/command` disarm / arm_home / arm_away (auto-bypass and up to 5 retries); `siren` ON/OFF (sound/silence); `police`/`fire` ON = `triggerBurglarAlarm`/`triggerFireAlarm`, **OFF = `setAlarmMode('none')` (disarm)** | alarm_control_panel, switch |
| Base Station (`hub.redsky`; `hub.kili` not mapped) | BaseStation | acStatus, battery, tamper, info | `volume` 0-100 (primary account only, probed at startup) | number, sensor |
| Keypad (`security-keypad`) | Keypad | proximity `motion`, battery, AC/charging, `chirps` | `volume` 0-100, `chirps` ON/OFF | number, switch, binary_sensor |
| Contact sensor / Retrofit zone / Tilt / Glassbreak / Motion / generic `sensor` | BinarySensor | `contact` / `zone` / `motion` ON, tamper, battery, info | `bypass_mode` Never / Faulted / Always (local policy) | binary_sensor, select |
| Flood/Freeze (`sensor.flood-freeze`) | FloodFreezeSensor | `flood`, `freeze` | none | binary_sensor |
| Smoke (`alarm.smoke`), CO (`alarm.co`), Kidde (`comp.bluejay...`), Smoke/CO Listener (`listener.smoke-co`) | SmokeAlarm / CoAlarm / SmokeCoKiddie / SmokeCoListener | `smoke`, `co` | none | binary_sensor |
| Temperature (`sensor.temperature`, non-thermostat child) | TemperatureSensor | `temperature` °C | none | sensor |
| Water valve (`valve.water`) | Valve | open / closed / opening / closing | open / close | valve |
| Switch (`switch`) | Switch | on/off | on/off | switch |
| Dimmer (`switch.multilevel`) | MultiLevelSwitch | on/off, brightness 0-100 | on/off, brightness | light |
| Fan (`switch.multilevel`, categoryId 17) | Fan | on/off, preset low / med / high, percent 10-100 | same | fan |
| Lock (`lock*`, Z-Wave via base station) | Lock | LOCKED / UNLOCKED / UNKNOWN | LOCK / UNLOCK | lock |
| Siren (`siren`) / Outdoor Siren (`siren.outdoor-strobe`) | Siren | `siren` ON (`sirenStatus === 'active'`) | ON/OFF (outdoor = `siren-test.start`/`stop`); outdoor `volume` 0-4 | switch, number |
| Thermostat (`temperature-control.thermostat`) | Thermostat | mode, action (off / idle / cooling / heating / fan), target, low/high, current temp, fan mode, aux | mode, target temp(s), fan mode, aux | climate |
| Panic button (`security-remote`) | PanicButton | attributes only (battery/tamper/info) | none | sensor |
| Range extender (`range-extender.zwave`) | RangeExtender | info (AC, battery, comm) | none | sensor |
| Ring bridge (`adapter.ringnet`) | Bridge | info | none | sensor |
| Beams light / motion / transformer / light group | Beam | `motion`, `light` on/off, brightness, `duration` | light on/off (`light-mode.set` or group REST), brightness, duration 0-32767 | light, binary_sensor, number |
| Beams Outdoor Smart Plug (`device.beams`) | BeamOutdoorPlug | `outlet1`, `outlet2` on/off | on/off | switch or light |
| Camera / Doorbell (RingCamera; needs `enable_cameras`) | Camera | `ding`, `motion` (+ last time, person detection attrs), `motion_detection`, `motion_warning`, `light`, `siren`, `video_mode`, `snapshot` image, `stream`/`event_stream` state, `event_select`, battery, wireless signal, info | motion_detection, motion_warning, light, siren ON/OFF; video_mode; snapshot_mode / interval; take_snapshot; stream start/stop; event_select (Motion / On-demand / Ding 1-5) | binary_sensor, switch, light, camera, select, number, button, sensor |
| Chime (RingChime; primary account) | Chime | volume 0-11, snooze, snooze_minutes, play_ding_sound / play_motion_sound state, nightlight | volume, snooze ON/OFF, snooze_minutes 1-1440, play ding/motion, nightlight_enabled | number, switch, sensor |
| Intercom / Video Intercom (RingIntercom) | Intercom | `ding`, `lock` state, battery, info | `lock` UNLOCK (unlock door) | binary_sensor, lock |
| Modes Control Panel (virtual `location.mode`; `enable_modes`, no alarm) | ModesPanel | mode disarmed / armed_home / armed_away | disarm / arm_home / arm_away | alarm_control_panel |
| Ignored or unsupported | — | `switch.beams` (handled via plug), `access-code*`, `adapter.*` (ignored); `hub.kili`, `third_party_gdo`, `unknown.zwave`, other (not-supported); 2nd-gen Sidewalk lighting | — | — |

- Volume control needs the master account: "Volume control requires master account, shared accounts do not have permission to control base station volume (same as Ring app)". — [MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics)
- Cameras and chimes require `enable_cameras`. Panic switches require `enable_panic` (default false). Modes require `enable_modes` (default false). `disarm_code` is blank by default. — [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details)

### Inferences
- **The table maps directly to an MCP surface.** "Readable state" → MCP resources; "Commands" → MCP tools.
- **Security-critical commands:** the alarm commands, police/fire panic, lock UNLOCK, intercom unlock, siren ON (alarm or camera), valve close, and thermostat setpoint (a property-damage risk).

### Gaps
- **The wiki lags the code.** It omits a few entities: chime nightlight, keypad chirps, outdoor-siren volume, camera motion/ding duration and take_snapshot. Those come from source inspection only.
- **Lock `jammed` state** is collapsed to UNKNOWN in ring-mqtt. I didn't verify whether Ring reports other lock states.

## 7. Safety and abuse concerns, and how existing integrations handle them

### Takeaway
**Ring's API does no step-up authentication for arming, disarming, unlocking or panic.** Whoever holds a refresh token can do all of it. Community integrations add their own guardrails:
- an HA-UI-only disarm code (ring-mqtt)
- panic controls off by default with explicit warnings (ring-mqtt, homebridge)
- an option to hide the alarm siren switch because Siri triggers it by accident (homebridge)
- leaving alarm control out entirely (Home Assistant core)

Several code-level behaviors are dangerous enough that an MCP server must handle them explicitly.

### Cited Findings
**No PIN at the API**
- The `switch-mode` payload is only `{mode, bypass}`. — [location.ts L364-L367](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L360-L376)
- Ring's own app: "Your PIN is not required when you use the app to change modes". — [Ring support](https://ring.com/support/articles/8fscc/Arming-and-disarming-Ring-Alarm)
- A Ring community thread asked for fingerprint/PIN to disarm in the app. Per a search summary, Ring staff replied that account Two-Step Verification is sufficient authentication. **This is a search-snippet summary, not verified verbatim.** — [Ring community: Fingerprint/PIN to disarm in app](https://community.ring.com/t/fingerprint-pin-to-disarm-in-app/11351)
- For contrast, Amazon's Alexa SecurityPanelController docs (per search summary) require users to set up a PIN to disarm security panels by voice. — [Alexa.SecurityPanelController](https://developer.amazon.com/docs/alexaplus/device-apis/alexa-securitypanelcontroller)

**ring-mqtt's disarm code is enforced only by the HA UI**
- It is set in HA MQTT discovery as `code_arm_required: false`, `code_disarm_required: Boolean(disarm_code)`, `code: disarm_code`. Ring never sees the code.
- Anyone publishing directly to the MQTT command topic can disarm without it.
- — [base-ring-device.js L112-L115](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/base-ring-device.js#L112-L115); [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details) ("Used only with Home Assistant ... require entering this code to disarm the alarm")

**Panic**
- ring-mqtt panic switches are behind `enable_panic` (default false), and the FAQ warns they "will trigger immediate alarm and police/fire response". — [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details); [FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- homebridge-ring's `showPanicButtons` defaults to false: "**Use these at your own risk. I do not guarantee functionality in case of emergency, nor do I take responsibility for any false alarms**." — [config.schema.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/config.schema.json)
- **Clearing a panic disarms the system.** In ring-mqtt, turning a police or fire panic switch OFF calls `location.setAlarmMode('none')`. — [security-panel.js L355-L382](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L355-L382)

**Accidental triggers and automation guardrails**
- homebridge-ring `hideAlarmSirenSwitch`: "The siren switch can sometimes get triggered by Siri commands by accident, which is loud and annoying". The Siri phrase "Turn on Ring Alarm" sounds the siren. — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)
- Apple Home requires manual confirmation for arrive/leave automations that touch accessories that "allow access" (security system or lock). The homebridge README documents a dummy-switch workaround to bypass that confirmation. — same source
- Automatic bypass weakens arming:
  - homebridge `nightModeBypassFor` auto-bypasses open contact sensors when Night mode is selected.
  - ring-mqtt `bypass_mode: Always` bypasses a sensor "regardless of its existing state".
  - — [config.schema.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/config.schema.json); [Configuration Details](https://github.com/tsightler/ring-mqtt/wiki/Configuration-Details)

**Home Assistant core has no alarm control**
- The platform list has no `alarm_control_panel`, and the HA docs don't mention Ring Alarm. The integration is limited to doorbells, cameras, chimes and intercoms. — [HA const.py L16-L24](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/const.py#L16-L24); [HA Ring docs](https://www.home-assistant.io/integrations/ring/)

**Access-control risk on intercoms**
- python-ring-doorbell exposes `async_invite_access(email)`, `async_remove_access(user_id)` and `async_open_door`. — [other.py L222-L275](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/other.py#L222-L275)

**Side effects of discovery**
- ring-mqtt detects base-station volume permission by setting a test volume and then restoring the original. Merely starting the bridge briefly changes the device. — [base-station.js L14-L30](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/base-station.js#L14-L30)

**The outdoor siren switch is only a test**
- It sends `siren-test.start`/`stop`, so it cannot be relied on as a deterrent or alarm. — [siren.js L59-L70](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/siren.js#L59-L70)

**Live-view privacy gating**
- ring-client-api 14.3.0 blocks streaming when Modes disable live view, matching the Ring app. — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

### Inferences
- **Proposed MCP risk tiers:**

  | Tier | Actions |
  | --- | --- |
  | Read-only | All state resources |
  | Low | Light on/off and brightness; chime play/snooze; volumes |
  | Medium | Camera motion detection/warning off (reduces security); location mode change; camera siren; arm (home/away) |
  | High | Disarm; bypass; lock/intercom unlock; Z-Wave valve close; thermostat changes |
  | Critical / disabled by default | Panic burglar/fire (dispatches authorities); intercom invite/remove access |

- **Server-side PIN or human confirmation is required for High and above.** Ring won't enforce it, and ring-mqtt's disarm code shows that UI-only enforcement can be bypassed by anything with direct protocol access.
- **Never map "panic off" to disarm implicitly.** Make disarm an explicit separate action.

### Gaps
- **No official Ring guidance** on third-party automation of arming, disarming or panic was found.
- **No documented account-ban or abuse-detection behavior** was found for API-driven alarm control.
- **Audit trail:** whether Ring records API-originated arm/disarm with an identifiable actor is not documented. ring-mqtt's `lastArmedBy` suggests impulse context includes an actor name, but I didn't verify how an API client is labeled.

## 8. Latency and reliability of control commands (websocket vs REST), and behavior when the cloud is down

### Takeaway
Alarm and Beams devices use a persistent cloud websocket per location: real-time state, commands sent as `DeviceInfoSet` messages. Cameras and chimes use REST commands with polled status. **Polling is opt-in in ring-client-api**: no `cameraStatusPollingSeconds` means no polling. homebridge-ring and ring-mqtt configure 20 s, and HA polls every 60 s. Ding and motion events arrive via FCM push. **There is no local API.** If Ring's cloud or the internet is down, no community integration can read or control anything.

**I found no measured latency numbers.** The only reliability evidence is design: retries, confirmation-by-readback, and changelog entries about broken sockets or push.

### Cited Findings
**Websocket path (alarm and Beams)**
- The library requests a ticket from `clap/tickets?locationID=...&enableExtendedEmergencyCellUsage=true&requestedTransport=ws`, then connects to `wss://{host}/ws?authcode={ticket}&ack=false`.
- It auto-reconnects on error or close and exposes `onConnected`.
- It throws "No assets (alarm hubs or beam bridges) found" if the location has no hub.
- — [location.ts L218-L318](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L218-L318)
- ring-client-api 14.0.0: "Use undici for all websocket connections. This fixes ... websockets were failing to connect for alarms and light hubs." — [ring-client-api CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- ring-mqtt 5.8.1: "address a recent Ring API change which caused socket connections to fail and crash the ring-mqtt process". — [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
- ring-mqtt "monitors hub-based devices (alarm and smart lighting) via the WebSocket connection and uses automatic 20-second status polling to keep a heartbeat for polled devices (cameras and chimes)". It marks devices unreachable when the socket is down and resends state on reconnect. — [MQTT Device Topics](https://github.com/tsightler/ring-mqtt/wiki/MQTT-Device-Topics); [wiki Home](https://github.com/tsightler/ring-mqtt/wiki)

**Command confirmation and retries**
- ring-client-api `setAlarmMode` confirms by waiting for the next panel data update, with no timeout. — [location.ts L360-L376](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L360-L376)
- ring-mqtt makes up to 5 attempts, sleeping 10 s after each failure, then logs "Alarm could not enter proper arming mode after all retries...Giving up!". The wiki advertises "Arm/Disarm commands are monitored for success and retried automatically". — [security-panel.js L265-L331](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/security-panel.js#L265-L331); [wiki Home](https://github.com/tsightler/ring-mqtt/wiki)
- Generic hub `sendCommand` is fire-and-forget with no ack. — [ring-device.ts L95-L106](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-device.ts#L95-L106)

**Polling and push (cameras, chimes, modes)**
- **ring-client-api has no polling default.**
  - `listenForDeviceUpdates` returns immediately `if (!cameraStatusPollingSeconds)`, so camera, chime and intercom status is never re-polled unless the option is set. — [api.ts L150-L166](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L150-L166)
  - Location-mode polling runs only when `!hasAlarmBaseStation && locationModePollingSeconds`. — [location.ts L195-L203](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L195-L203)
  - ring-mqtt passes `locationModePollingSeconds: 20` only when `enable_modes` is set. — [lib/ring.js L114](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L114)
- homebridge-ring `cameraStatusPollingSeconds` defaults to 20: "Information like light/siren/volume/snooze status do not update in real time". `locationModePollingSeconds` also defaults to 20 and is "automatically disabled for locations equipped with a Ring Alarm". — [homebridge-ring README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)
- ring-client-api uses `@eneris/push-receiver` (FCM) for push notifications. — [api.ts L37, L252-L269](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts)
- ring-mqtt 5.9.3 fixed push decryption errors "potentially leading to missed motion/ding events". — [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
  - The fix came from an updated "ring-client-api with patched push-receiver package to address push messages failing decryption with ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY".
  - ring-mqtt now depends on a **custom fork**, `"@tsightler/ring-client-api": "^14.3.1-beta.0"`. — [ring-mqtt package.json L19](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/package.json#L19)
- Upstream ring-client-api 14.3.0 pins `"@eneris/push-receiver": "4.4.0"`, and its CHANGELOG has no ECDH/decryption fix entry. — [ring-client-api package.json L42](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json#L42); [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
  - Whether stock 14.3.0 is affected is **unverified**, but it may currently drop some ding/motion pushes.
- Home Assistant (per WebFetch summary of its docs):
  - It polls the cloud API every 60 seconds; changes made in HA update the device state immediately.
  - Realtime events need outbound TCP port 5228.
  - "too many authorized client devices can break realtime alerts".
  - The integration is `iot_class: cloud_polling`.
  - — [HA Ring docs](https://www.home-assistant.io/integrations/ring/); [manifest.json](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/manifest.json)
- Ring cameras "do not detect/send motion events while a stream/recording is active". — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

**Cloud outage**
- ring-mqtt FAQ, on local control: "Then I suggest you sell your Ring devices and buy something else ... the base Ring devices all require the cloud and ring-mqtt does not change this ... ring-mqtt connects to the Ring Cloud API just like the Ring apps do."
- The same FAQ entry says Ring Alarm sensors "are mostly just generic Z-wave sensors" usable with other Z-Wave controllers, and that Ring Alarm Pro has some local recording but is "still largely a cloud powered device".
- — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- HA docs: "all communication goes via the cloud". — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- The base station's cellular backup is visible as `connectionStatus: 'cell-backup'`. This concerns the hub's own link to Ring's cloud and is not a local path for clients. — [ring-types.ts L184-L189](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L184-L189)

### Inferences
- **Alarm and light commands** over the existing websocket should be near-real-time, with state confirmation arriving as a pushed device update.
- **Camera and chime commands** return on the REST response, but their state may look stale until the next poll. An MCP server should call `requestUpdate`/refresh after commands, as ring-client-api already does for chimes and settings.
- **MCP tool contract:** each control tool should return `{requested, confirmed_state, confirmed: bool, timed_out: bool}` and enforce its own timeout (for example 10-20 s for alarm mode). The library waits indefinitely, and ring-mqtt's retry loop shows that first attempts can fail.
- **Report cloud health as state.** The server should expose a connection/cloud-health resource (websocket connected per location, push registered, last poll time), because every control path depends on Ring's cloud.
- **Set polling explicitly.** An MCP server built directly on ring-client-api must pass `cameraStatusPollingSeconds` (and `locationModePollingSeconds` for non-alarm sites). Otherwise light, siren, motion-detection, volume, snooze and mode state go stale indefinitely after startup.
- **Choose the push dependency deliberately.** It's a choice between upstream ring-client-api, which may have the push-decryption issue, and tsightler's patched fork. This affects event reliability.
- **Possible false failures in `setAlarmMode` (inference, not tested).** It resolves on whatever the panel emits next (`onData.pipe(skip(1))`). An unrelated panel update arriving first could make it throw even though arming later succeeds. This may explain why ring-mqtt does its own readback-and-retry loop.
- **HA siren duration is inconsistent.** HA's camera siren switch calls `async_set_siren(1)`, yet its docstring and the HA docs say the siren runs 30 seconds. — [switch.py L91-L96, L184-L185](https://github.com/home-assistant/core/blob/4ac1e52596be971267c47397c38079eb97fea80d/homeassistant/components/ring/switch.py#L91-L96). python-ring-doorbell passes the integer as a `duration` query parameter (0-120). Actual duration semantics are unverified.

### Gaps
- **No measured latency.** I found no data for arm/disarm, light, siren or unlock commands in any repo, wiki or doc.
- **No Ring status or SLA data** was found, and no documentation on rate limits for control endpoints.
- **Gen2 local fallback is undocumented.** Whether a Gen2 or Pro base station keeps working locally (keypad arming) during a cloud outage is not documented in community sources reviewed. Reaching it through an API is impossible in any case.
