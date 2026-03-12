# Raid System — Member Guide

This document explains how the FlamingPalm raid system works and how to use it as a community member.

---

## What Is a Raid?

A **raid** is a community gaming event that needs a minimum number of players before it can be scheduled. Any member can create one or join an existing one. The bot handles the entire lifecycle automatically: collecting sign-ups, finding a time that works for everyone, and notifying all participants.

---

## Raid Lifecycle

A raid moves through four states:

```
Open (1) → Scheduling (2) → Scheduled (3)
                         ↘ Cancelled (4)
```

| Status | Meaning |
|--------|---------|
| **Open** | Accepting sign-ups. Join before the minimum player count is reached. |
| **Scheduling** | Enough players signed up. The bot is collecting time-slot votes via DM. |
| **Scheduled** | A time with full consensus was found. The raid is confirmed. |
| **Cancelled** | No time worked for everyone before the deadline. The raid is over. |

---

## Commands

### `/raids`
Browse all currently open raids. Replies with an embed listing every open raid and a dropdown to sign up for one.

### `/create-raid`
Create a new raid and add it to the list.

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `title` | Yes | Name of the game or event (up to 100 characters). |
| `minplayers` | Yes | Minimum number of players required to trigger scheduling. Default suggested: 4. |

**Example:** `/create-raid title:Minecraft Hardcore minplayers:5`

After creating a raid, tell others to join it with `/raids`.

### `/raid-votes`
Check the current vote tally for a raid that is in the Scheduling phase.

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `raid` | Yes | The numeric raid ID (visible in the scheduling DM). |

---

## Joining a Raid

1. Type `/raids` — a private embed appears listing all open raids.
2. Use the **dropdown menu** to select the raid you want to join.
3. The bot confirms your sign-up. A message also posts in the LFG channel announcing that you joined.

If you try to join a raid you are already signed up for, the bot lets you **unsubscribe** instead via an "Unsubscribe" button in the reply.

> Raids only accept new members while they are in **Open** status. Once scheduling has started, new sign-ups are not accepted.

---

## Unsubscribing from a Raid

1. Type `/raids` and select the raid you already joined.
2. The bot tells you that you're already enlisted and shows an **Unsubscribe** button.
3. Click the button to remove yourself.

---

## The Scheduling Phase

When the number of sign-ups reaches `minplayers`, the raid automatically moves to **Scheduling**:

1. **Everyone who signed up receives a DM** from the bot with a scheduling embed.
2. The embed lists **9 time slots** across the coming Tuesday, Wednesday, and Thursday:
   - 🇦 Tuesday 17:00 · 🇧 Tuesday 19:00 · 🇨 Tuesday 21:00
   - 🇩 Wednesday 17:00 · 🇪 Wednesday 19:00 · 🇫 Wednesday 21:00
   - 🇬 Thursday 17:00 · 🇭 Thursday 19:00 · 🇮 Thursday 21:00
3. **React with every emoji that represents a time you are available.** You can pick more than one — vote for all slots that work for you.
4. The DM also has a **"View Participants' Chosen Times"** button so you can see what everyone else has voted for so far.

> The bot picks the **nearest upcoming Tuesday** as the start of the scheduling window. If that Tuesday is less than 3 days away it skips to the following week to give everyone enough time to vote.

### Scheduling deadline

Voting closes at midnight (00:00) on the day before the first time slot (i.e. the Monday before the Tuesday options). Make sure you cast your votes before then.

---

## When a Time Is Confirmed

The bot continuously checks whether any slot has been voted for by **all** participants. As soon as one is found:

- The slot is locked in.
- Everyone receives a **confirmation DM** with the final time and the full participant list.
- A confirmation embed is posted in the LFG channel.
- The raid moves to **Scheduled** status.

If multiple slots reach full consensus the bot picks the earliest one that does not conflict with an already-scheduled raid.

---

## When a Raid Is Cancelled

If the scheduling deadline passes without any slot reaching full consensus, the raid is **cancelled**:

- Everyone receives a cancellation DM explaining that no suitable time was found.
- The raid moves to **Cancelled** status and disappears from the `/raids` list.
- To try again, someone needs to create a new raid with `/create-raid`.

---

## Tips

- **Vote for every slot you can make**, not just your favourite. The bot needs a slot where _everyone_ is available, so casting more votes makes scheduling more likely to succeed.
- **Keep your DMs open** to the bot. If your DMs are closed, the bot cannot send you the scheduling message and your participation will be skipped.
- If you didn't receive the scheduling DM (e.g. your DMs were closed at the time), ask an admin to resend it using `/raid-resend`.

---

## Admin Commands

These commands require Administrator permissions in the Discord server.

### `/raid-resend`
Resend the scheduling DM to a specific user for a raid that is currently in the Scheduling phase.

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `raid` | Yes | The numeric raid ID. |
| `user` | Yes | The Discord user to resend the message to. |
