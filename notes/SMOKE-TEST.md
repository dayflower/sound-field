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
| `modulate-field.html` | On-screen keyboard, PC keyboard, and octave | Note starts and stops are reflected, and input still works after changing octaves. |
| `modulate-field.html` | Operator editing, eight routing options, and JSON import/export | Parameters and routing display remain in sync. The default JSON can be displayed, copied, and reloaded. |

When recording results, add the browser name and version, tested audio format,
result (pass/fail), and reproduction steps for any failure to the pull request
or issue.
