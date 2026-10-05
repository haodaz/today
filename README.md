# Today

**A small tiger who keeps today for you.**

Most of the day the television is off. Turn it on and it sells you something, or
hands you a feed with no end.

Today makes it something else: a screen that stays on in the room she lives in,
holding the shape of her day.

> A to-do list says *here is what you owe.*
> Today says *I'm keeping these for you.*
> The weight sits with the tiger, not with her.

Built for the **Fire TV** track of
[Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

*[中文版 README](README.zh.md)*

---

## Who it's for

Today is for a mother at home with a television already on.

Her days are full, but they are not chaos. She is running a household, and what
she wants from a screen is rhythm and order — not rescue. She is not in trouble.
She is holding more things at once than anyone keeps in their head, and she would
like somewhere to set them down.

She is the person we built it for. She is not the only one it fits: anyone
keeping a household running, with a screen already on in the room, is standing in
the same place.

## Why a television

A screen you have to open is a screen you open when you remember to — and
remembering is the thing she is short of.

The television is already on. It costs nothing to look at. So Today is built for
the glance, not the session, and there are three of them in a day:

- **Coming in the door** — what is still open today.
- **Cooking** — the standing notes. The things that must not be forgotten.
- **On the way out** — the one thing to take, the errand that fits the trip.

Closer to the board in a hotel lobby than to an app: always on, never asking to
be touched, readable from the other side of the room.

## How it works

She speaks into her **phone** — messy, repetitive, however it comes out. By the
time she walks in the door, the **television already shows today**.

She never has to stand in front of the TV to plan her day. That was never the
TV's job. The phone is where you say things; the television is where you glance.

![Today on a Fire TV](doc/shots/06-today-with-tiger.png)

## What it actually does for you

Remembering is the easy half. The harder half is that some things never move —
not because she doesn't want to, but because every time she thinks of one she has
to work out where to start again from scratch.

She says, one evening: *"I keep putting off the insurance thing."*

Today does not add **sort out insurance** to a list. It takes it:

**It asks one question.** Exactly one — *"Is this for him, or for you too?"* Two
questions is a form, and a form is how a thing gets put off for another month.

**It breaks it down** once she answers. Four steps, each small enough to finish
in one sitting, each with a time that fits the day: *while he naps*, *after
bedtime*.

**It gives her one step a day.** Never the whole breakdown. Tomorrow's step
arrives on its own; she never has to remember where she got to. That is what
makes "a little at a time" actually work.

**It keeps her own things from going last.** Her dentist, her check-up — the ones
that are always bumped by somebody else's. When one has been waiting too long,
Today is the one that raises it. Not to chase her. To say it hasn't forgotten.

And no progress bar. No *insurance 2/4*. The moment she can see a completion
rate, this has become one more board she has to maintain.

## No Fire TV to hand?

The big screen also runs in a browser, at `/tv` — the same layout, the same data,
driven by the same endpoint the Fire TV app polls. Arrow keys to move, Enter to
press into something, Esc to come back.

It is not a mock-up of the television screen; it is the television screen, reading
from the same server. Useful if you want to see what this looks like without
side-loading an APK, and useful to her when the one in the living room isn't the
screen she has in front of her.

```bash
cd Today && ./start.sh      # then open /tv on anything with a browser
```

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
- **No progress bars, completion rates, streaks or overdue counts.** The moment
  she can see *insurance 2/4*, this is one more board she has to maintain
- **No nagging — not one word.** *"You really ought to get that seen to"* is a
  reproach, and she is already saying it to herself. The agent says what it has
  taken on, never what she ought to do
- Never asking why something didn't happen
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

### Things go out of date at different speeds

| | | |
|---|---|---|
| the shape of a day | school run, naps, who is home when | 180 days |
| in hand | things with a deadline — a form to hand in, an appointment made | 21 days |
| hers | what she does for herself, what she cares about | never |
| kept deferring | what keeps coming up and not happening | 60 days |
| **standing instructions** | allergies, medication, what the doctor said | **never** |

Nothing is deleted when it goes out of date. It is marked *recorded a while ago —
check before relying on it*, and the agent is told to ask rather than assume.
Deleting loses what she said; using it blind says something wrong; asking is the
only safe third thing.

The last row is where this differs from every other memory design in these
repositories: **a safety note that expires is more dangerous than no note at
all.**

### Who people are is a record, not a note

"Three years old" used to be free text. True the day it was written, wrong a year
later, and nobody would ever notice.

So the family is a structured record, and it stores what doesn't move:

- **A birth month, not an age.** The age is worked out fresh every time it is
  read, so it corrects itself.
- **The English spelling she chose**, so the name stops being re-invented on
  every run — the same child came back as *Coco* and *KeKe* in a single session
  before this existed.
- **A pronoun she gave**, left empty when she hasn't. Empty means the agent uses
  *they*; a guess calls a little boy *she*.

If she only ever says "he's three", the conversion to a year happens in code, not
in the model — and it is flagged approximate, so a guess is never shown as a
fact. The model reports what she said; arithmetic is not its job.

She can edit all of it from her phone, in a form. It changes about twice a year.
It should not need a conversation.

## Build

| | |
|---|---|
| Device | Fire OS 8 (Android 11 / API 30), tested on a Toshiba 50C350NU |
| Framework | Expo SDK 57 + [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) 0.86.3 |
| TV config | [`@react-native-tvos/config-tv`](https://www.npmjs.com/package/@react-native-tvos/config-tv) — injects `LEANBACK_LAUNCHER`, `touchscreen required=false`, `software.leanback` |
| Always on | `expo-keep-awake` |
| Speech | `MediaRecorder` in the page → Whisper |
| Agent | provider-agnostic, with automatic fallback between providers |
| Language | one switch on the phone; the television follows within five seconds |
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
