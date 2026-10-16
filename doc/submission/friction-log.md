# Friction log

Build, Ship, Shape — Fire TV track. Everything below happened while building
[Today](https://github.com/haodaz/today), in the order we hit it.

---

## 1. iOS Safari silently disables the microphone over plain HTTP

**Task.** Test the phone companion against the LAN dev server from an iPhone.

**Steps.** Open `http://<laptop-lan-ip>:8910` in iOS Safari, press the mic button.

**Expected.** A permission prompt.

**Actual.** Nothing. `getUserMedia` is unavailable outside a secure context, and
nothing is surfaced to the user — the button simply does nothing.

**Severity.** Medium — about an hour lost looking in the wrong place, because the
failure looks like a bug in your own code.

**Workaround.** A Cloudflare Tunnel in front of the dev server, for an HTTPS
origin.

**Suggestion.** Any Fire TV documentation that describes a phone-as-input pattern
should say up front that the phone side needs HTTPS, and point at a tunnel. This
is going to bite every team that uses a phone as the input device for a TV app,
and it bites them at the worst moment — the first time they test on real
hardware.

---

## 2. Focus moves before the key handler runs (react-native-tvos)

**Task.** "Press right on the focused item to open its detail."

**Steps.** D-pad right on a focused row.

**Expected.** The focused row opens.

**Actual.** Focus had already advanced to the next row by the time
`useTVEventHandler` ran, so the *next* item opened.

**Severity.** High. It is invisible in a browser and on a phone, and appears only
on a remote, so it survives a lot of testing. It also reads as a data bug rather
than a focus bug, which sends you looking in the wrong file.

**Workaround.** Pin `nextFocusRight` to the element's own node handle
(`findNodeHandle` on itself), so "right" has nowhere to move to and the handler
runs against the item you meant.

**Suggestion.** Document this explicitly in the TV focus guide. "Use a D-pad
direction as an action rather than as navigation" is a common television pattern
— it is how you get a second layer without a second screen — and the default
behaviour quietly breaks it.

---

## 3. No story for a TV app finding a companion on the local network

**Task.** The Fire TV app needs to reach a server running on a laptop on the same
Wi-Fi, with no account and no pairing step.

**Expected.** A documented pattern for this.

**Actual.** Nothing found, so we wrote discovery by hand: try the address the app
was built with, then scan the /24, then common private ranges, then re-discover
after four consecutive poll failures.

**Severity.** Medium.

**Workaround.** The above, in
[`src/api.ts`](https://github.com/haodaz/today/blob/main/Today/src/api.ts). It
works, including when the laptop's address changes mid-session — we verified that
by compiling a deliberately wrong address and watching it recover.

**Suggestion.** A small sanctioned library, or a documented mDNS path, for
phone/laptop ↔ Fire TV on the same network. Every team building a
companion-device pattern is currently writing this same subnet scan.

---

## 4. `adb connect` to a Fire TV goes quiet when the TV sleeps

**Task.** Screenshot the app on a real Fire TV over adb.

**Steps.** `adb connect <ip>:5555`, then `adb exec-out screencap -p`.

**Expected.** Either a screenshot, or a clear error.

**Actual.** The device still reports as `device`, `screencap` returns a black PNG,
and `dumpsys window` reports `mCurrentFocus=null` with nothing explaining why.

**Severity.** Low, but confusing the first time — it reads as an app crash, and
we went looking at the app.

**Workaround.** `adb shell input keyevent KEYCODE_WAKEUP` first, or just turn the
television on.

**Suggestion.** Have adb surface display state, or make `screencap` fail loudly
when there is nothing to capture.

---

## 5. Emulator density does not match a panel three metres away

**Task.** Size type for a screen that is read from across a room.

**Actual.** The `android-tv` AVD at 1920×1080 / density 320 leaves about 540dp of
usable width. Everything that looked correct in the emulator window on a laptop
had to be re-checked on a real television — where a glance is about two seconds
long, and roughly a third of what we had written was unreadable at that distance.

**Severity.** Medium. This one shapes the whole design rather than one screen: it
is the difference between a to-do list rendered large and something built for the
glance.

**Workaround.** None, except testing on the real panel, early.

**Suggestion.** A "read it from three metres" checklist, or an emulator mode that
previews at a realistic viewing distance. Either would have changed our first
draft, and the cost of finding out late is a redesign rather than a tweak.

---

## 6. `screenrecord` on a real Fire TV: three surprises

**Task.** Record the demo video from the television's own output on a real Fire TV
(Fire OS 8), so the room is never in frame — the rules require real hardware or
the Fire TV/Vega simulator, and our generic Android TV emulator boots to a Google
TV launcher, so it would not qualify.

**Steps.** `adb shell screenrecord --bit-rate 16000000 /sdcard/take.mp4`, drive the
app with `adb shell input keyevent`, pull the file.

**Expected.** A constant-frame-rate video of whatever is on screen.

**Actual.**
1. **No frames while the screen is still.** A 6-second recording of a static
   screen was 82 KB with a single frame. Fine for file size, but it means the
   timestamp of the first frame after a pause is the only clock you have.
2. **If the recording is ended by the adb connection closing, the file has no
   duration** (`Duration: N/A`) and most tools can't seek in it. Sending SIGINT
   on the device (`pkill -INT screenrecord`) finalises it properly.
3. **Each `adb shell input keyevent` takes over a second**, and the key actually
   lands near the end of that second — so logging the time you *sent* the key is
   wrong by about a second when you try to line the TV recording up with anything
   else.

**Severity.** Medium. None of it is documented next to `screenrecord`, and the
demo video depends on all three.

**Workaround.** Start each take with one D-pad press: the screen is still before
it and changes after it, so the first frame after the gap marks that press, and
the press is timed by when the adb command *returned*. That aligns the TV
recording with a phone recording (Chrome DevTools screencast, which timestamps
every frame) to a fraction of a second — so the seconds between *she sends it*
and *the TV changes on its own* in our video are the real seconds, with no cut.

**Suggestion.** A recording option that emits constant frame rate, and a one-line
note in the Fire TV docs that `screenrecord` works over `adb connect` on Fire OS 8
— it's the cleanest way to make a Fire TV demo video, and most teams will reach for
a camera pointed at the TV instead.
