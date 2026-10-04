# Today

**A small tiger who keeps today for you.**

The television in the living room is dark for most of the day. Turn it on and it
either sells you something or hands you a feed that never ends.

Today makes it something else: a quiet screen that stays on, keeping a
stay-at-home mother company through the day.

> A to-do list says *here is what you owe.*
> Today says *I'm keeping these for you.*
> The weight sits with the tiger, not with her.

Built for the **Fire TV** track of
[Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

*[中文版 README](README.zh.md)*

---

## How it works

She speaks into her **phone** — messy, repetitive, tired, however it comes out.
By the time she walks in the door, the **television already shows today**.

She never has to stand in front of the TV to plan her day. That was never the
TV's job. The phone is where you say things; the television is where you glance.

![Today on a Fire TV](doc/shots/06-today-with-tiger.png)

## Why not just talk to the remote

Because you can't. We checked, and the answer is final:

| | |
|---|---|
| Third-party app reading the remote mic | **Not possible.** The mic button is wired to Alexa and is never exposed to apps |
| `android.speech.SpeechRecognizer` | **Unavailable.** Fire OS ships without Google Play Services |
| `RECORD_AUDIO` with a USB / Bluetooth mic | Known to fail on Fire TV 3rd gen and later |
| Video Skills Kit · Media Session API | Predefined commands only — play, pause, rewind, channel |

Amazon's own documentation is explicit: apps **cannot capture arbitrary
free-form speech or dictation**.

And typing on a remote means walking a D-pad across a grid of letters. A single
sentence takes two minutes.

So the recording happens **in the phone page itself** — not through the
keyboard's dictation key, because many phones don't have one (we tested; it is a
system setting most people never turn on, and no product should rest on that).
`MediaRecorder` captures the audio, the server transcribes it, and speech and
typing join the same path from there.

That costs one thing: `getUserMedia` needs a secure context, and iOS Safari only
grants microphone access over HTTPS. Which is why the server is fronted by a
tunnel rather than served over the LAN.

Full notes: [doc/input-architecture.md](doc/input-architecture.md).

## What it refuses to do

This matters as much as what it does, and it is written down so that anyone
tempted to add a feature later can read it first:

- No content recommendations
- No shopping
- No badges, streaks, overdue counts, or anything else that manufactures anxiety
- No full-brightness white panel at night

## Three rules the agent lives by

They live in [`Today/src/agent/prompt.js`](Today/src/agent/prompt.js), and most
of them are prohibitions:

**1. Pick three. Say out loud what is not happening today.**
What reassures someone is not an empty list — it is knowing what they are allowed
to put down.

**2. One of the three is hers, and it must stand on its own.**
Not a reward, not "once everything else is done". And never attached to a chore:
*"take a walk while you're out shopping"* does not count. Remove the chore and
the item must survive.

This rule was added after watching it fail. The first run produced *"buy milk and
detergent — walk ten extra minutes on the way back"*. That isn't the model making
a mistake; in the real world, a mother's own needs really are attached to errands
like that. So it had to be written down.

**3. Never describe your own work.**
No item counts, no mention of "later", no explaining the reasoning. An early
English run opened with *"today stays to three things and the rest goes to
later"* — the agent narrating its own algorithm, in the largest type on the
screen. You wouldn't tell a friend "I've narrowed your list down to three".

## Memory

*"I'm keeping these for you"* cannot be a lie. Something that claims to remember
today and forgets by tomorrow is worse than something that never claimed it. So
memory is the premise of the character, not a feature of the app.

Five kinds, in `.data/memory.json`:

| | | |
|---|---|---|
| `people` | who is who in her life | *Bits — her child* |
| `rhythms` | what recurs | *school forms are due Wednesdays* |
| `carrying` | what she keeps deferring | **not to hold against her** — so the agent knows what is safe to put down |
| `hers` | what she does for herself | so there is room kept for it next time |
| `notes` | anything else worth holding | |

Each kind is capped and newest-first. Memory that grows without limit both blows
the context window and fills up with things that stopped being true.

It is observable: memory is a card on screen. She can see what Today remembers,
which is the only basis on which trust — or correction — is possible.

**It works.** Told *"Bits has a vaccination tomorrow, and I always forget the
Wednesday school form,"* it filed *Bits — her child* and recognised *school forms
are due Wednesdays* as a **rhythm**, not a one-off. Later, told only *"I'm so
tired today,"* it answered *"I know today has been heavy — let's keep it light"*
and planned **two** items instead of three.

## Build

| | |
|---|---|
| Device | Fire OS 8 (Android 11 / API 30), tested on a Toshiba 50C350NU |
| Framework | Expo SDK 57 + [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) 0.86.3 |
| TV config | [`@react-native-tvos/config-tv`](https://www.npmjs.com/package/@react-native-tvos/config-tv) — injects `LEANBACK_LAUNCHER`, `touchscreen required=false`, `software.leanback` |
| Always on | `expo-keep-awake` |
| Speech | `MediaRecorder` in the page → Whisper |
| Agent | provider-agnostic; AWS Bedrock for submission |
| Character | generated with Tongyi Wanxiang, cut out by [**flatcut**](https://github.com/haodaz/flatcut) — extracted from this project and released separately |

### Two decisions made for a television

**The background follows the light of the day.**
This screen is on all day. One bright panel held from morning to night is both
harsh and wasteful, so the background moves through four phases: cool at dawn,
neutral through the day, warm at dusk, and settling down after dark. Not a
dark-mode toggle — the light changing.
See [`Today/src/theme.ts`](Today/src/theme.ts).

**Focus has to be visible from three metres.**
A television has no touchscreen, only a D-pad. The subtle border shift that works
on a phone is invisible from a sofa. So the focused row scales up, takes the
accent colour, and lifts on a shadow.
See [`Today/src/TaskRow.tsx`](Today/src/TaskRow.tsx).

## Running it

```bash
cd Today
npm install
cp .env.local.example .env.local   # add one model key
./start.sh                          # local server + HTTPS tunnel
./release.sh && ./install.sh        # build the APK and push it to the TV
```

Enable developer mode on the Fire TV first: **Settings → My Fire TV → About →
press the centre button seven times on the device name**, go back, and
**Developer Options** appears. Turn on **ADB Debugging**.

Iterating on the agent needs no rebuild:

```bash
PROVIDER=openai node Today/scripts/plan.mjs "whatever you want to try"
```

The bench prints the plan laid out as the TV would show it, and flags the three
things that matter: more than three items, **nothing that belongs to her**, and
labels too long for one line.

## Released alongside this

[**flatcut**](https://github.com/haodaz/flatcut) — cutting the background out of
a generated flat illustration without eating the light areas inside the subject.
Written for this project's tiger, then pulled out as its own MIT package, because
all three of the ways it can go wrong are things you only learn by hitting them.

## Licence

MIT — see [LICENSE](LICENSE).
