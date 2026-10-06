# Demo video — script and shot list

Three minutes, English, Fire TV track.
*(Check the submission form for the exact length and format rules before you cut.)*

Everything below has been dry-run end to end. Where a beat was fragile, it was
rebuilt until it held — the notes say which, and why.

---

## The one rule this script is built on

**Lean on what the code decides, not on what the model says.**

Sampling is tuned (temperature 0.4, top_p 0.88 for anything she reads), but that
only narrows the odds — it never guarantees a sentence. So every beat is anchored
on something deterministic: one step a day, the safety note sorted first, the
key:value table, two households diverging on the same search results. The agent's
prose is the garnish. If a take gives a weak line, retake that line; the beat
itself still stands.

---

## Setup

```bash
cd Today
rm -rf .data.demo .data.demo2
TODAY_DATA=.data.demo node scripts/demo-seed.mjs
ls -l .data.demo/*.json          # four files. If any is missing, stop and fix it.
./start.sh                        # server + HTTPS tunnel, prints the URL
curl -s -X POST http://127.0.0.1:8910/place \
  -H 'Content-Type: application/json' -d '{"name":"Brooklyn"}'
```

Emulator, in another terminal:

```bash
~/Library/Android/sdk/emulator/emulator -avd HearthTV -no-boot-anim -no-audio &
ADB=~/Library/Android/sdk/platform-tools/adb
$ADB install -r Today/android/app/build/outputs/apk/release/app-release.apk
$ADB shell am start -n com.today.tv/.MainActivity
```

**Capture.** Emulator window for the television, browser at phone width for the
phone. `adb exec-out screencap -p` for stills, `adb shell screenrecord` for motion
— both read the framebuffer, so your room is never in frame.

**Never on camera:** your home, your real `.data`, your family. Everything here
runs on the fictional household in `scripts/demo-seed.mjs`:

| | |
|---|---|
| 👩 Elodie | the one it talks to |
| 👨 Claude | travels Tuesday to Thursday most weeks |
| 👶 Coco | eight months |
| 🧒 Stelle | fifteen, tenth grade |
| 🐶 Nana | five |

One household, Brooklyn. The fifteen-year gap is the point: Coco came late, and an
eight-month-old alongside a tenth-grader is a very specific kind of busy. It also
makes the two-household comparison in beat 6 land harder than two children the
same age would.

Set the location to **Brooklyn** before you record — the lookups and the weather
both read from it, and a demo set in the wrong country reads as not written for
the person watching.

---

## Shot list

### 1 · The premise — 0:00–0:20

| | |
|---|---|
| **Screen** | TV at rest. Clock, date, weather line, the tiger, one sentence, two tasks. Hold it. Nothing moves. |
| **Say** | "Most of the day, this screen is off. Turn it on and it sells you something, or hands you a feed with no end." |
| | "Today makes it something else. It stays on, in the room you already live in, and it holds the shape of your day." |

Stillness is the shot. It is a screen you glance at, not one you operate.

### 2 · Three glances — 0:20–0:38

| | |
|---|---|
| **Screen** | Slow push down the left column: weather, then the one step, then "Not today". |
| **Say** | "A screen you have to open is one you open when you remember to. And remembering is the thing she's short of." |
| | "So it's built for the glance. Coming in the door. Cooking. On the way out." |
| | "Closer to the board in a hotel lobby than to an app." |

### 3 · Phone to television — 0:38–1:00

| | |
|---|---|
| **Type** | *Coco barely slept and Stelle needs her conference form signed for Thursday* |
| **Screen** | Split: phone left, TV right. Let the TV catch up by itself. Don't cut — the five-second poll **is** the shot. |
| **Say** | "She says it into her phone, however it comes out. By the time she's put her coat down, the television already shows today." |
| | "She never stands in front of a TV to plan her day. That was never the TV's job." |

### 4 · It takes things off her — 1:00–1:50

The centre of the video. **Use a thing the seed doesn't already hold**, so the
question and the breakdown happen on camera.

| | |
|---|---|
| **Type** | *I keep putting off sorting out Coco's passport* |
| **Screen** | Its reply. |
| **Dry run gave** | *"I'm holding that one for you — it sits with insurance and the dentist, not on today. Is this a first passport for Coco, or a renewal?"* |
| **Say** | "Remembering is the easy half. The hard half is the things that never move — not because she doesn't want to, but because every time she thinks of one she has to work out where to start again." |
| | "So it asks one question. One — because two is a form, and a form is how a thing gets put off another month." |

| | |
|---|---|
| **Type** | *first one, she has never had a passport* |
| **Screen** | The breakdown appearing: four steps, each with a time that fits her day. |
| **Dry run gave** | photo *(while you're out anyway)* → form online *(during the morning nap)* → print, sign, gather IDs *(once Coco is down)* → post it *(on the way out)* |
| **Say** | "It breaks it down — and every step carries the moment it actually fits into." |
| | "Then it gives her one a day. Never the whole list. Tomorrow's arrives on its own." |

| | |
|---|---|
| **Screen** | TV. The warm step: **TODAY'S ONE STEP — THIS ONE IS YOURS**, *Ring the surgery…* Then press right into *Insurance for Coco*: "Waiting 40 days", one step already struck through. |
| **Say** | "And it keeps her own things from going last. The dentist, the check-up — the ones that always get bumped." |
| | "When one has waited too long, Today is the one that brings it up. Not to chase her. To say it hasn't forgotten." |

> **Why the passport and not the insurance.** The seeded insurance project is
> already broken down, so asking about it only gets sympathy — the *question*
> never happens on screen. The passport is new, so you see it ask and then
> decompose. Insurance stays in the cast as the one that shows continuity:
> "waiting 40 days" is only credible because it was already in flight.

### 5 · Not a thin checklist — 1:50–2:20

| | |
|---|---|
| **Type** | *somewhere warm and indoors I could take Coco on Saturday, she's eight months* |
| **Screen** | The phone's reply in full — five or six sentences of judgement, not a list. |
| **Say** | "Ask it something it doesn't know, and it looks it up. But it doesn't hand back a search page." |

| | |
|---|---|
| **Do** | TV: arrow to the new item, press **right**. |
| **Screen** | *When · Cost · Suits · Travel* per option, one line of why under each, and "check times and prices again before you set out". |
| **Say** | "It writes what it found into the thing itself. Times, prices, whether it suits a baby — the parts you actually use, where you can scan them." |
| | "And it never pushes the whole breakdown at her. She pressed in. That's different." |

### 6 · My today, my family's today — 2:20–2:48

The strongest thirty seconds. Two panels, one question, **the same four search
results underneath both**.

```bash
# second household — verify the files exist before you run anything
ls -l Today/.data.demo2/*.json
node /tmp/two.mjs           # or your own runner over .data.demo and .data.demo2
```

| | |
|---|---|
| **Say** | "Same question. Same search results. Two different families." |
| **Left** | Coco at eight months, Stelle at fifteen. It picks warm, quiet, and near — somewhere you can feed her and leave the minute it stops working. Skips anything that needs booking. |
| **Right** | Jonah ten, Ada twelve. Dry run: Abbey House — *"fits both their ages"*; the museum craft session *"gives Ada something to do beyond looking"*; and honestly, *"Jonah is in the sweet spot and Ada may be past it"*. Skips the trampolines — *"too loud, too much queuing"*. |
| **Say** | "For an eight-month-old it picks warm and quiet — and somewhere she can sit down, because she hasn't been out on her own since Coco was born." |
| | "For a ten and a twelve year old it reads the same list and tells her which ones to skip." |
| | "That's the whole product. It isn't *a* today. It's **her** today. Her family's today." |

### 7 · What it refuses — 2:48–3:00

| | |
|---|---|
| **Screen** | Plain type on the aurora background, a line at a time. |
| **Say** | "No shopping. No feed. No progress bars — the moment you can see *two of four*, it's started keeping score." |
| | "And it never nags. Not one word. She's already doing that to herself." |
| **End** | The tiger. *A small tiger who keeps today for you.* |

---

## When a take goes wrong

Seen in the dry run, with what it actually was:

| What you see | What it is | What to do |
|---|---|---|
| A stub: *"a few worth knowing"* and nothing listed | Low-frequency model variance. Roughly one in six on lookup turns. | Retake the same line. |
| *"I can't look that up"* with the location set | The search came back with junk (it happens — archery clubs, taxi pages). | Retake. Search depth is already on `advanced`. |
| The guide table is missing | Was common; the server now makes a second, narrow call that only produces the table. | Should not recur. If it does, retake. |
| A value cut with `…` | The model wrote a sentence where a value belongs. | Retake. |
| Weather line gone | The fetch failed; it backs off for two minutes and keeps the last good reading. | Wait, reload. |
| TV blank at launch | It is scanning the subnet for the server. | Give it a few seconds. It finds it. |
| Duplicates in "Not today" | The model paraphrases ("See the dentist" / "her dentist"). Only three show on screen, so they fall off the end. | Ignore unless two visibly overlap. |

---

## What to leave out

- Your home, your real `.data`, your family's names.
- Bedrock. It is wired but unverified — don't claim it on camera.
- Any promise about what it will do next. Show what it does.
