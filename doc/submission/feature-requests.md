# Feature requests

Build, Ship, Shape — Fire TV track, from building
[Today](https://github.com/haodaz/today).

---

## 1. Launch on boot for Fire TV apps — **Critical**

Today is an ambient screen. Its whole premise is that it is already on when you
walk into the room, the way the board in a hotel lobby is already there: you
glance at it carrying shopping, or on the way out of the door, and you never
operate it.

Right now someone has to pick up the remote and open it. That is precisely the
"a screen you have to open" problem the project exists to solve — and a screen
you have to remember to open is one you open when you remember to, which is the
thing the person running a household has least of.

We could not find a way to have an app running when the television comes on
without a launcher integration.

**Why it matters to us:** it is the difference between an app that happens to run
on a television and a surface that belongs in the room. Without it, every claim we
make about the glance depends on the user doing something first.

---

## 2. A sanctioned way to find a companion device on the local network — **Important**

A Fire TV app that pairs with a phone or a laptop on the same Wi-Fi currently has
no documented path to find it. We wrote subnet discovery by hand (try the
compiled address, scan the /24, then common private ranges, re-discover on
repeated failure).

It works, but every team building a companion-device pattern is writing the same
code, and most of them will write a worse version of it under time pressure —
including, probably, one that hard-codes a LAN address and breaks the moment the
router hands out a different one.

**Why it matters to us:** the product promise is "no account, no pairing, no
cloud". Discovery is what makes that possible, and it was the single largest piece
of infrastructure we had to build that had nothing to do with our idea.

---

## 3. A realistic viewing-distance preview in the emulator — **Nice-to-have**

The emulator shows a television screen at desk distance. A television is read
from three metres away in about two seconds. Those are different design problems,
and the emulator quietly lets you solve the wrong one.

A preview mode — or even a documented checklist — would have saved us a redesign.
