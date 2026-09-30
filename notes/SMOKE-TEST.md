# SOUND / FIELD Manual Smoke Test

Run this after the quality gates pass to compare browser behavior before and
after refactoring. Check every item using the latest Chromium-based browser
with `npm run dev` running. For items involving audio, prepare one short,
playable audio file.

| Page | Check | Expected result |
| --- | --- | --- |
| `index.html` | Three cards, their links, and the language selector | Each ANALYZE, NOISE, and MODULATE page opens. Changing the language updates the heading and description. |
| `spectrum-field.html` | File selection, drag and drop, play/pause, and seeking | The source name and basic information appear; the waveform and spectrum move. The playback position can be changed by clicking or using the keyboard. |
| `spectrum-field.html` | FFT size, SMOOTHING, FLOOR, and VOLUME | Each control updates its displayed value and the spectrum or playback volume. |
| `noise-field.html` | Play/stop, noise type, and output level | Playback state and the live spectrum switch correctly, and volume adjustments take effect. |
| `noise-field.html` | CURVE/10 BAND, faders, SMOOTH, FLATTEN, and RESET | Edits are consistently reflected in the curve, band values, and JSON output. |
| `noise-field.html` | Source analysis | After selecting an audio source, results can be applied to the CUSTOM curve with either MEAN or MEDIAN. |
| `modulate-field.html` | On-screen keyboard, two PC keyboard rows, glissando, octave, and PANIC | Notes start and stop, overlapping inputs release correctly, and no note remains after PANIC or window blur. Shift+1 through Shift+4 toggle operators without playing a note. |
| `modulate-field.html` | Four operators, key scaling, LFO, and eight routing options | Controls update the sound and diagrams; a custom routing imported through JSON is displayed. The live envelope and active voice count follow playback. |
| `modulate-field.html` | PATCH menu and component libraries | Built-in and saved patches appear in one menu. Built-in patches cannot be deleted or overwritten; saved patches can. Component settings can be saved, loaded, and deleted. |
| `modulate-field.html` | JSON file import/export, JSON editor, and reload | A `modulate-field-patch` version 2 file round-trips including the name and custom routing. The current patch survives reload. Invalid routing reports an error. |
| `modulate-field.html` | Native/BH spectrum toggle and production build | Both modes render; the AudioWorklet loads from the built page under a relative base path. |

When recording results, add the browser name and version, tested audio format,
result (pass/fail), and reproduction steps for any failure to the pull request
or issue.
