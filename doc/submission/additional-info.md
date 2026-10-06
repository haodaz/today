# Devpost — Additional info

## 简单字段

| 字段 | 填 |
|---|---|
| Submitter Type | **Individual** |
| Organization Name | **N/A** |
| Country of Residence | ← 你自己填（见下面的提醒） |
| Canada province | **N/A** |
| Primary Track | **Fire TV** |
| Code repository | `https://github.com/haodaz/today` |
| New or existing | **New**（仓库建于 2026-10-04，晚于 8/31） |
| Upload a File | 跳过（APK 75MB，超过 35MB 上限 — 见下面） |
| Project Testing Link | 暂时留空 |
| AWS Builder Mini Challenge | **No**（理由见下） |
| Open Source Mini Challenge | **Yes** |

---

## AWS Builder Mini Challenge — 为什么填 No

代码里确实有一条 Bedrock 的调用路径，但**从来没有真的跑通过**。
这一栏要的是 "documented integrations"，没验证过的东西写上去，
评委一测就穿帮，比不拿这个奖坏得多。

如果想拿：把 Bedrock 那条路径真的跑通并留下证据（一次成功调用的日志、
一段 README 说明），再回来把这栏改成 Yes。离截止还有时间。

---

## Open Source Mini Challenge

**Contribution URL**
```
https://github.com/haodaz/today
```

**Project Repository URL**
```
https://github.com/haodaz/today
```

**GitHub Username**
```
haodaz
```

**Description**

```
Today is a new open-source project (MIT), created and developed entirely within
the hackathon window — first commit 4 October 2026.

What it is: a Fire TV app plus a phone web app that together hold the shape of a
household's day. The person talks to their phone, however it comes out, and the
television updates on its own five seconds later. The television is a glance
layer — one sentence, one step, two tasks — and every item opens with a press of
the remote into a detail layer with what was looked up.

The repository contains everything needed to run it: the React Native for TV app
(react-native-tvos, Fire OS 8), the Node server, the agent prompts and the four
capabilities built on them, the demo seed data, and the scripts used to cut the
demo video. There is no hidden service — the whole agent is in the prompt files
and the small amount of code around them.

Three parts are written to be read and reused rather than just run:

- src/agent/search.js — a worked example of treating search results as untrusted
  material rather than instructions: fenced, truncated, control-characters
  stripped, with the prompt stating that anything inside the fence addressing the
  model is the page author writing, not the user.
- src/api.ts — a Fire TV app discovering its companion server on the local
  network with no pairing, no accounts and no cloud: try the compiled address,
  then scan the /24, then common private ranges, and re-discover after
  consecutive poll failures.
- scripts/two-homes.mjs — a runnable demonstration that the same question and the
  same search results produce different answers for different households, which
  is the central claim of the project and can be verified rather than taken on
  trust.

Why it matters: almost everything built for the person who runs a household is an
app — a screen you have to open, which you open when you remember to. Remembering
is the scarce thing. The television is already on, already at eye level, in the
room they are already standing in. Anyone can take this repository and build on
that idea without asking.
```

---

## Friction Log

> 这一栏给最多 10% 的加分，而且是整份表里最值得花时间的地方。
> 下面每条都是这个项目真撞过的，不是编的。

```
1. iOS Safari silently disables the microphone over plain HTTP
   Task: test the phone companion against the LAN dev server from an iPhone.
   Steps: open http://192.168.1.243:8910 on iOS Safari, press the mic button.
   Expected: a permission prompt. Actual: nothing — getUserMedia is unavailable
   outside a secure context, and there is no error surfaced to the user.
   Severity: Medium (cost about an hour of looking in the wrong place).
   Workaround: a Cloudflare Tunnel in front of the dev server for an HTTPS origin.
   Suggestion: any Fire TV documentation that describes a phone-as-input pattern
   should state up front that the phone side needs HTTPS, and point at a tunnel.

2. Focus moves before the key handler runs (react-native-tvos)
   Task: "press right on the focused item to open its detail".
   Steps: D-pad right on a focused row.
   Expected: the focused row opens. Actual: focus had already advanced to the
   next row by the time useTVEventHandler ran, so the *next* item opened.
   Severity: High — it is invisible in a browser and on a phone, and only appears
   on a remote, so it survives a lot of testing.
   Workaround: pin nextFocusRight to the element's own node handle
   (findNodeHandle on itself), so "right" has nowhere to move to.
   Suggestion: document this explicitly in the TV focus guide. "Use the D-pad
   direction as an action rather than as navigation" is a common TV pattern and
   the default behaviour quietly breaks it.

3. No story for a TV app finding a companion on the local network
   Task: the Fire TV app needs to reach a server running on a laptop on the same
   Wi-Fi, with no account and no pairing step.
   Expected: a documented pattern. Actual: nothing found, so we wrote discovery
   by hand — try the compiled address, then scan the /24, then common private
   ranges, and re-discover after four consecutive poll failures.
   Severity: Medium.
   Workaround: the above (src/api.ts). It works, including when the laptop's
   address changes mid-session, which we verified by compiling a deliberately
   wrong address and watching it recover.
   Suggestion: a small sanctioned library or a documented mDNS path for
   phone/laptop ↔ Fire TV on the same network would save every team this work.

4. adb connect to a Fire TV goes quiet when the TV sleeps
   Task: screenshot the app on a real Fire TV over adb.
   Steps: adb connect <ip>:5555, then adb exec-out screencap.
   Expected: either a screenshot or a clear error. Actual: the device still
   reports as "device", screencap returns a black PNG, and dumpsys reports
   mCurrentFocus=null with nothing explaining why.
   Severity: Low, but confusing the first time — it reads as an app crash.
   Workaround: KEYCODE_WAKEUP first, or just turn the TV on.
   Suggestion: have adb surface display state, or make screencap fail loudly.

5. Emulator density does not match a panel three metres away
   Task: size type for a screen that is read from across a room.
   Actual: the android-tv AVD at 1920×1080 / density 320 leaves about 540dp of
   usable width. Everything that looked correct in the emulator window on a
   laptop had to be re-checked on a real television, where a glance is two
   seconds long and about a third of it was unreadable.
   Severity: Medium — it shapes the whole design, not one screen.
   Workaround: none except testing on the real panel, early.
   Suggestion: a "read it from three metres" checklist, or an emulator mode that
   previews at a realistic viewing distance, would have changed our first draft.
```

---

## Feedback 1 — 用了哪些工具、做什么

```
- react-native-tvos (React Native for TV) with Expo — the Fire TV app itself:
  layout, D-pad focus, and the press-right-to-open detail layer.
- Fire OS 8 (Android 11 / API 30) — target platform. Tested on a Toshiba Fire TV
  and on an android-tv AVD at 1920×1080.
- adb over Wi-Fi — installing, launching, screenshots and screen recording on the
  real television without ever filming the room.
- Node.js (no framework, the built-in http module) — the companion server: one
  endpoint per thing, four JSON files for state.
- Nebius Token Factory (MiniMax-M3) — the agent, with an OpenAI-compatible
  fallback provider.
- Tavily Search API — looking things up when the model would otherwise have to
  invent an address.
- Open-Meteo — weather and geocoding, keyless, city level only.
- Cloudflare Tunnel — an HTTPS origin so the phone side could use the microphone.
- ffmpeg — cutting the demo video, and verifying frame by frame that nothing
  private leaked into the edges of the capture.
```

## Feedback 2 — 哪里好用

```
- react-native-tvos: D-pad focus mostly just works. Writing a TV layout felt like
  writing a web layout, which is the right amount of surprise. hasTVPreferredFocus
  and nextFocus* are the right primitives once you know they exist.
- adb over Wi-Fi on Fire OS 8: painless. Enable developer options, adb connect,
  done. exec-out screencap and shell screenrecord read the framebuffer, which
  meant every frame we showed anyone came from the device itself.
- Open-Meteo: no key, no account, no quota dance. For a weekend project that is
  the difference between shipping the feature and cutting it.
- Tavily: search_depth "advanced" is noticeably more on-topic than "basic" —
  "basic" mixed in archery clubs and taxi pages for a question about taking a
  baby somewhere indoors. Worth the extra credits.
- Nebius: credits arrived immediately and the OpenAI-compatible shape meant the
  fallback provider was about ten lines.
```

## Feedback 3 — 哪里需要改

```
- react-native-tvos: the focus-vs-key-handler ordering above. It is the single
  thing that cost us the most, and it is a one-line fix once you know.
- Fire TV: no documented path for an app to be running when the television comes
  on. For an ambient screen that is the whole product, and we could not find a
  way to do it without a launcher integration. This is our biggest feature
  request.
- Fire TV: nothing sanctioned for local discovery between a phone or laptop and
  the TV app. Every team doing a companion-device pattern will write the same
  subnet scan.
- Tooling: emulator density versus a real panel (above). Related: there is no
  easy way to preview "what this looks like from the sofa".
- Model output variance: roughly one lookup turn in six comes back weak. That is
  not a tooling bug, but it did change how we built — nothing the demo depends on
  is allowed to rest on a particular sentence.
```

## Feedback 4 — 上手体验

```
Zero to hello world on Fire TV was about twenty minutes: enable developer
options, adb connect over Wi-Fi, build a release APK, adb install, adb shell am
start. Nothing surprising, and it worked the first time on a real device.

The real onboarding cost was not getting a window on screen — it was learning
that a television is not a small desktop and not a large phone. There is no
pointer, there are five directions and a select, and the viewer is three metres
away and holding something. Everything we got wrong in week one was a
consequence of not having internalised that, and the documentation we found
described the API surface rather than the constraint.
```

## Feedback 5 — 还会不会再用

```
Yes.

The television is the only screen in a house that is already on, already at eye
level, in the room people are already standing in, and it is almost entirely
given over to selling things. That is a lot of unused surface, and Fire TV is a
reasonable place to build on it.

The remote is the reason, not the obstacle. Five directions and a select will not
carry a dense interface, so the constraint forces an honest answer to "what is
actually worth showing" — and that turned out to be the most useful design
pressure in the project. We would take the same constraint again.
```
