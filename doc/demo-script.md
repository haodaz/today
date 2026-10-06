# Demo video — script and shot list

Under three minutes, English, Fire TV track.
*(Check the submission form for the exact length and format rules before you cut.)*

**This version is written from the take, not from a plan.** Every line quoted below
is what actually appeared on screen on 6 October. Where the product behaved
differently from the earlier dry run, the script follows the product.

---

## The one rule this script is built on

**Lean on what the code decides, not on what the model says.**

Sampling is tuned (temperature 0.4, top_p 0.88 for anything she reads), but that
only narrows the odds — it never guarantees a sentence. So every beat is anchored
on something deterministic: one step a day, her own things sorted first, the
key:value table, the five-second poll. The agent's prose is the garnish. If a take
gives a weak line, retake that line; the beat itself still stands.

---

## Setup

```bash
cd Today
rm -rf .data.demo
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
$ADB shell am force-stop com.today.tv && $ADB shell am start -n com.today.tv/.MainActivity
```

### The layout — one screen, not two takes

Both surfaces are screen content, so they can share one frame. Put them side by
side and **record once**:

| | |
|---|---|
| Left | Chrome at a 500×910 viewport, on `http://127.0.0.1:8910/` |
| Right | the emulator window, about 1700 wide |
| Capture | QuickTime → record selected portion |

Frame the selection **below Chrome's address bar** and **left of the emulator's
side control strip**. That keeps the URL, the tab strip, the emulator title bar
and the desktop behind them all out of frame — check the four edges on a test
take before the real one.

This matters for one beat in particular. In beat 3 the television catches up on
its own, five seconds after she presses send. **That shot must not contain a
cut** — the poll arriving by itself is the proof. Shoot it separately and splice
it and a sceptical viewer can read it as editing.

**Never on camera:** your home, your real `.data`, your family. Everything here
runs on the fictional household in `scripts/demo-seed.mjs`:

| | |
|---|---|
| 👩 Elodie | the one it talks to |
| 👨 Claude | travels Tuesday to Thursday most weeks |
| 👶 Coco | eight months |
| 🧒 Stelle | fifteen, tenth grade |
| 🐶 Nana | five |

One household, Brooklyn. The fifteen-year gap is the point: Coco came late, and
an eight-month-old alongside a tenth-grader is a very specific kind of busy.

Set the location to **Brooklyn** before you record — the lookups and the weather
both read from it, and a demo set in the wrong country reads as not written for
the person watching.

---

## Shot list

### 1 · The premise — 0:00–0:20

| | |
|---|---|
| **Screen** | TV at rest. Clock, date, *Clear · 7°–17°*, the tiger, **"Today isn't sorted yet."**, two things still going, the QR. Hold it. Nothing moves. |
| **Say** | "Most of the day, this screen is off. Turn it on and it sells you something, or hands you a feed with no end." |
| | "Today makes it something else. It stays on, in the room you already live in, and it holds the shape of your day." |

Stillness is the shot. It is a screen you glance at, not one you operate.

### 2 · Three glances — 0:20–0:38

| | |
|---|---|
| **Screen** | Slow push down the left column: weather, then **TODAY'S ONE STEP — THIS ONE IS YOURS**, then "Not today". |
| **Say** | "A screen you have to open is one you open when you remember to. And remembering is the thing she's short of." |
| | "So it's built for the glance. Coming in the door. Cooking. On the way out." |
| | "Closer to the board in a hotel lobby than to an app." |

The warm rule down the left of *Call the dentist and take the first morning
they've got* is the one thing on this screen that is only for her. It is worth
letting the camera rest on it before anything moves.

### 3 · Phone to television — 0:38–1:05

| | |
|---|---|
| **Do** | Phone: **Open Today** → sign in as *Elodie*. |
| **Screen** | It opens already knowing her: *"Elodie, I'm still holding that dentist call for you — want me to nudge it forward now?"* |
| **Say** | "It opens by bringing up the thing she's been letting slide. Not to chase her — to say it hasn't forgotten." |

| | |
|---|---|
| **Type** | *Coco barely slept and Stelle needs her conference form signed for Thursday* |
| **Screen** | Reply: *"I'm holding the form for today, and the insurance is still where it was."* Then **do not touch anything.** Five seconds later the television changes by itself: the sentence, the task card, and a new line under *I also remember* — *"Coco had a rough night — sleep is off today."* |
| **Say** | "She says it into her phone, however it comes out. By the time she's put her coat down, the television already shows today." |
| | "She never stands in front of a TV to plan her day. That was never the TV's job." |

**Don't cut here.** One continuous shot, both windows in frame.

### 4 · It takes things off her — 1:05–1:55

Use a thing the seed doesn't hold, so the whole thing happens on camera.

| | |
|---|---|
| **Type** | *I keep putting off sorting out Coco's passport* |
| **Screen** | *"I've kept that for you — and I've put a first move on it for today."* A task appears: **Find out whether Coco's birth certificate has arrived** · *while she naps* |
| **Say** | "Remembering is the easy half. The hard half is the things that never move — not because she doesn't want to, but because every time she thinks of one she has to work out where to start again." |
| | "So it doesn't hand the whole thing back. It puts one move on today." |

| | |
|---|---|
| **Do** | TV: down to **Coco's passport** under "Not today", press **right**. |
| **Screen** | *Today's step* — the birth certificate — then **How this breaks down**: form DS-11, *her first passport — she has to apply in person with Coco*; book the agency appointment and gather the photos. |
| **Say** | "Underneath, it's broken down — and every step carries the moment it actually fits into." |
| | "But she only ever gets one. Tomorrow's arrives on its own. No progress bars, no two-of-four." |

> **What changed from the dry run.** Earlier takes had it ask one question first
> ("first passport or a renewal?") before breaking anything down. It still does
> that when it needs to. But it had also learned to *wait* — "I'll break it down
> once the birth certificate arrives" — which is the exact thing this product
> exists to stop, so the prompt now says the missing piece **is** step one. On
> the take it skipped the question entirely and went straight to a first move.
> **So don't narrate "it asks you one question."** Narrate what the screen does.

### 5 · Not a thin checklist — 1:55–2:40

The centre of the video.

| | |
|---|---|
| **Type** | *somewhere warm and indoors I could take Coco on Saturday, she's eight months* |
| **Screen** | The phone's reply in full. Scroll to the top of it and let it be read. |
| **It gave** | *"Three that fit. The Play Lab in Greenpoint takes from nine months — soft play, slides, room to crawl… Private Picassos in Clinton Hill does drop-in art on Saturdays from ten to five, no time limit, so you can stay as long as she's happy and feed her when you need to. Brooklyn Botanic Garden has the warm greenhouse rooms and a place to sit with a coffee while she looks at things — quieter than a playground, and you get out of the house without it being a production. The Play Lab is the most baby-proofed of the three; the garden is the most restful for you. Check hours before you go."* |
| **Say** | "Ask it something it doesn't know, and it looks it up. But it doesn't hand back a search page." |
| | "It reads the results against this family. An eight-month-old who isn't walking. And one line that isn't about the baby at all — which of the three is the most restful **for her**." |

| | |
|---|---|
| **Do** | TV: up to **Saturday morning out with Coco**, press **right**. |
| **Screen** | *This one is yours* in the corner. *Today's step — Pick one of the three and check Saturday hours · Friday evening.* Then three options with 📍 Where · 🧒 Suits · 🏷️ Cost · Saturday, a line of why under each, and at the foot: *Looked up — check times and prices again before you set out.* |
| **Say** | "It writes what it found into the thing itself. Where, what it suits, what it costs — the parts you actually use, where you can scan them." |
| | "It won't choose for her. It tells her what each one costs her, and hands the choice back." |
| | "That's the whole product. It isn't *a* today. It's **her** today. Her family's today." |

> The Play Lab line reads *Suits 9 months and up* while Coco is eight months —
> the table is quoting the venue, not fudging it. If the narration mentions that
> venue at all, mention it as the agent putting the threshold on screen so she
> can judge, not as a recommendation. Easier: let the camera rest on the garden.

### 6 · What it refuses — 2:40–3:00

| | |
|---|---|
| **Screen** | Plain type on the aurora background, a line at a time. |
| **Say** | "No shopping. No feed. No progress bars — the moment you can see *two of four*, it's started keeping score." |
| | "And it never nags. Not one word. She's already doing that to herself." |
| **End** | The tiger. *A small tiger who keeps today for you.* |

---

## Cut for time

Two things that work and are **deliberately not in the video**, because three
minutes with this much on screen is already full:

- **Two households, one set of search results.** `node scripts/two-homes.mjs`
  runs the same question against `.data.demo` and `.data.demo2` over an
  identical set of Tavily results, and they diverge — the eight-month-old
  household is told which venue lets her sit down, the ten-and-twelve household
  is told which ones to skip. It is the cleanest proof that the answer is shaped
  by the family and not by the search. It needs two phone panels side by side,
  which is a different layout and about thirty seconds. **Keep it for the written
  submission**, not the video; the same claim is carried in beat 5's narration.
- **Language.** The whole thing runs in Chinese too, switched from the phone with
  the television following. Nothing in the English cut needs it.

---

## When a take goes wrong

Seen across the dry runs and the real take:

| What you see | What it is | What to do |
|---|---|---|
| A stub: *"a few worth knowing"* and nothing listed | Low-frequency model variance. Roughly one in six on lookup turns. | Retake the same line. |
| *"I can't look that up"* with the location set | The search came back with junk (it happens — archery clubs, taxi pages). | Retake. Search depth is already on `advanced`. |
| It asks a question instead of breaking down | Fine — it is allowed to, and does when it needs a fact. | Answer it on camera and carry on; just don't promise the question in narration. |
| A value cut with `…` | The model wrote a sentence where a value belongs. | Retake. |
| A long first step clipped on the TV | Expected — the glance layer truncates; the detail layer shows it whole. | Leave it. Press right and it reads in full. |
| Weather line gone | The fetch failed; it backs off for two minutes and keeps the last good reading. | Wait, reload. |
| TV blank at launch | It is scanning the subnet for the server. | Give it a few seconds. It finds it. |
| The tunnel URL 502s | `cloudflared` died. Restart it **and** restart the server with the new `PUBLIC_URL`, or the QR on the TV points at a dead link. | `./start.sh` does both. |

---

## What to leave out

- Your home, your real `.data`, your family's names.
- Bedrock. It is wired but unverified — don't claim it on camera.
- Any promise about what it will do next. Show what it does.
