# FlamingPalmKrakenV2 — Web API Reference

This document describes every HTTP endpoint exposed by the Express server
(`modules/WebApi.ts`) and every Prisma data model in `prisma/schema.prisma`.
It is intended as a complete reference for frontend developers building the
companion website.

---

## Base URL

The API server listens on **port 3000** internally and is exposed on port 80
via the CapRover / Docker setup. All paths below are relative to that base.

---

## Authentication

### Overview

Authentication uses **Discord OAuth2** to identify users and **JWT** (JSON Web
Token) to secure subsequent requests.

**Flow:**

1. Redirect the user to `GET /auth` — initiates the Discord OAuth2 consent
   screen (scope: `identify`, `guilds`).
2. Discord redirects back to `CALLBACK_URL`; the server validates guild
   membership and issues a JWT.
3. Store the JWT and include it in every protected request via the
   `Authorization` header:

```
Authorization: Bearer <token>
```

JWT payload:

```json
{
  "id": "<discord-user-id>",
  "username": "<discord-username>",
  "avatar": "<avatar-hash>"
}
```

Only users who are members of the configured Discord guild (`GUILD_ID`) can
log in. Non-members receive a `null` profile and are denied a token.

### Admin Access

Admin endpoints require the authenticated user's Discord ID to appear in the
`ADMIN_IDS` environment variable (a comma-separated list of Discord snowflake
IDs). Requests that pass JWT validation but fail the admin check receive
`403 Forbidden`.

---

## Endpoint Reference

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth` | None | Redirect to Discord OAuth2 consent screen |
| `GET` | `/login` | OAuth callback | Exchange Discord OAuth code for a JWT; returns `"<jwt-string>"` |

---

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | None | Health check — returns `{ uptime: <seconds> }` |

---

### Members

Base prefix: `/members/`

#### `POST /members/profile`

Returns the authenticated user's JWT payload (their basic Discord identity).

- **Auth:** Required
- **Body:** _(none)_
- **Response:** `User` object encoded in JWT

```json
{
  "id": "534686392589221898",
  "username": "Kraken",
  "avatar": "cb24eca24fbf24e075d2eca04102e070"
}
```

---

#### `GET /members/dashboard`

Returns the authenticated user's dashboard aggregate — their current points,
recent point history, and upcoming raids they can join.

- **Auth:** Required
- **Response:** `DashBoardModel`

```json
{
  "dashboardPoints": 1200,
  "raids": [
    {
      "ID": 42,
      "Title": "Saturday Night Raid",
      "MinPlayers": 4,
      "CreationTime": "2026-03-07T18:00:00.000Z",
      "Status": 1,
      "Attending": 3
    }
  ],
  "pointHistory": [
    {
      "ID": 1,
      "userid": "534686392589221898",
      "TimeStamp": "2026-03-05T14:23:00.000Z",
      "points": 50,
      "comment": "Raid attendance"
    }
  ]
}
```

Raids are filtered to `Status = 1` (active), limited to the 5 most recent.
Point history is the 5 most recent entries for the current user.

---

#### `GET /members/referrals`

Returns the list of members that the authenticated user has referred, along
with their reward status.

- **Auth:** Required
- **Response:** `ReferralItem[]`

```json
[
  {
    "userId": "123456789012345678",
    "displayName": "SomePlayer",
    "avatar": "abc123",
    "createdTimestamp": "2026-01-10T12:00:00.000Z",
    "isValid": "2026-01-12T08:30:00.000Z",
    "regularRewarded": "2026-01-15T09:00:00.000Z",
    "memberRewarded": null
  }
]
```

Fields:
- `userId` — Discord snowflake ID of the referred member. Use with `avatar` to build the CDN URL: `https://cdn.discordapp.com/avatars/{userId}/{avatar}.png`.
- `displayName` — Discord display name of the referred member.
- `avatar` — Discord avatar hash of the referred member (may be `null`).
- `createdTimestamp` — When the referral record was created.
- `isValid` — Timestamp when the referral was validated, or `null` if not yet valid.
- `regularRewarded` — Timestamp when the referrer received their regular reward points, or `null` if not yet rewarded.
- `memberRewarded` — Timestamp when the referrer received their member-tier reward points, or `null` if not yet rewarded.

Results are ordered by `createdTimestamp` descending (newest first).

---

#### `GET /members/library`

Returns the list of shop items the authenticated user has previously redeemed.

- **Auth:** Required
- **Response:** `LibraryItem[]`

```json
[
  {
    "orderId": 7,
    "game": "Elden Ring",
    "redemptionText": "XXXX-YYYY-ZZZZ",
    "timestamp": "2026-02-14T10:00:00.000Z"
  }
]
```

---

#### `POST /members/raids/:id/join`

Joins the authenticated user to the specified raid.

- **Auth:** Required
- **URL param:** `id` — numeric raid ID
- **Response:** `200 OK` with plain text `"Joined raid successfully"`
- **Errors:**
  - `404` — raid not found or not open (Status ≠ 1)
  - `409` — user has already joined this raid
  - `500` — unexpected server error

---

### Shop / Points

Base prefix: `/members/`

#### `GET /members/points`

Returns the authenticated user's current point balance.

- **Auth:** Required
- **Response:** `number` — returns `0` if the user is blocked.

```json
1200
```

---

#### `GET /members/pointHistory`

Returns the full point history for the authenticated user, most recent first.

- **Auth:** Required
- **Response:** `PointHistoryItem[]`

```json
[
  {
    "points": 50,
    "timestamp": "2026-03-05T14:23:00.000Z",
    "comment": "Raid attendance"
  }
]
```

---

#### `GET /members/shopItems`

Returns all visible shop items and their current stock levels.

- **Auth:** Required
- **Response:** `ShopItem[]`

```json
[
  {
    "id": 3,
    "title": "Elden Ring",
    "description": "Soulslike game key",
    "price": 1000,
    "image": "https://example.com/elden-ring.jpg",
    "stock": 2,
    "nonSalePrice": null
  }
]
```

`stock` is the number of unredeemed keys remaining. `nonSalePrice` is `null`
when the item is not on sale, or the original price when a sale is active.

---

#### `POST /members/redeemItem`

Redeems one unit of a shop item for the authenticated user. Deducts the item's
price from the user's point balance. Also sends a purchase notification to a
Discord channel.

- **Auth:** Required
- **Body:**

```json
{ "rewardId": 3 }
```

- **Response (success):** The redeemed `RewardItem` record (includes
  `RedemptionText` — e.g. a game key).

```json
{
  "RewardItemID": 12,
  "RewardID": 3,
  "CreationTimeStamp": "2026-01-01T00:00:00.000Z",
  "RedemptionTimeStamp": "2026-03-08T09:00:00.000Z",
  "RedemptionText": "XXXX-YYYY-ZZZZ",
  "RedeemedBy": "534686392589221898"
}
```

- **Error responses:**
  - `400 No rewardId` — missing body field
  - `400 No items left` — out of stock
  - `400 You are blocked from redeeming items` — user is blocked
  - `400 Not enough points` — insufficient balance

---

### Profile / Customisation

Base prefix: `/members/`

#### `GET /members/profileImage`

Returns the authenticated user's generated profile card as a **PNG image**.

- **Auth:** Required
- **Response:** `image/png` binary

---

#### `POST /members/setProfileImage`

Updates the full profile customisation record for the authenticated user in one
call.

- **Auth:** Required
- **Body:**

```json
{
  "profile": {
    "StatusColor": "#FF0000",
    "BackgroundImage": "forest",
    "ProgressBarColor": "#00FF00",
    "Achievement1": "badge-slug-1",
    "Achievement2": "badge-slug-2",
    "Achievement3": null,
    "Achievement4": null,
    "Achievement5": null
  }
}
```

All fields are optional strings/null. `BackgroundImage` is a filename stem
(without extension) of an asset in `assets/`. Badge fields are filename stems
under `assets/badges/`. Set to `null` to clear a slot.

- **Response:** `"ok"` (plain text)

---

#### `POST /members/setBackground`

Updates only the background image for the authenticated user's profile.

- **Auth:** Required
- **Body:**

```json
{ "fileName": "forest" }
```

- **Response:** `true`

---

#### `POST /members/setBadge`

Updates a single badge slot on the authenticated user's profile.

- **Auth:** Required
- **Body:**

```json
{ "slot": 1, "fileName": "achievement-slug" }
```

Valid `slot` values: `1` – `5`. Send `"fileName": ""` to clear the slot.

- **Response:** `true`

---

#### `GET /members/getLevel`

Returns the authenticated user's current XP level object.

- **Auth:** Required
- **Response:** Level object (shape determined by `AchievementsModule.getLevel`)

```json
{
  "level": 12,
  "currentXP": 340,
  "requiredXP": 500,
  "totalXP": 9845
}
```

_(Exact field names may vary; treat this as indicative.)_

---

#### `GET /members/getBadgeUnlocks`

Returns the list of badge filename stems the authenticated user has unlocked
through achievements.

- **Auth:** Required
- **Response:** `string[]` — badge slugs the user may equip

```json
["badge-veteran", "badge-raider", "badge-supporter"]
```

---

### Admin

Base prefix: `/admin/`

> **Admin auth vs regular auth:** Most admin endpoints use a stricter
> `authenticateAdmin` check. This requires a valid JWT **and** the
> authenticated user's Discord ID must be present in the `ADMIN_IDS`
> environment variable (comma-separated list of snowflake IDs).
> Non-admin authenticated users receive `403`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/yearOverview` | JWT | Voice-activity overview for the current year |
| `GET` | `/admin/stats` | Admin | Dashboard summary counts |
| `GET` | `/admin/shopItems` | Admin | List all shop items with stock |
| `POST` | `/admin/shopItems` | Admin | Create a new shop item |
| `PUT` | `/admin/shopItems/:id` | Admin | Update an existing shop item |
| `DELETE` | `/admin/shopItems/:id` | Admin | Delete a shop item |
| `POST` | `/admin/shopItems/:id/stock` | Admin | Add a single stock item to an existing shop item |
| `GET` | `/admin/members` | Admin | List all members with stats |
| `GET` | `/admin/referrals` | Admin | List all referrals with user info and reward status |
| `POST` | `/admin/referrals/:userId/:referrerId/validate` | Admin | Mark a referral as valid |
| `POST` | `/admin/referrals/:userId/:referrerId/reward-regular` | Admin | Award regular reward points to referrer |
| `POST` | `/admin/referrals/:userId/:referrerId/reward-member` | Admin | Award member reward points (100 pts) to the referrer |
| `GET` | `/admin/raids` | Admin | List all raids with attendee counts |
| `POST` | `/admin/raids` | Admin | Create a new raid |
| `PUT` | `/admin/raids/:id` | Admin | Update an existing raid |
| `DELETE` | `/admin/raids/:id` | Admin | Delete a raid and all its attendees/scheduling data |

---

#### `GET /admin/yearOverview`

Returns daily voice-channel activity counts for the current calendar year.
Intended for admin dashboards / activity graphs.

- **Auth:** Required (any authenticated user — no admin role check)
- **Response:** `yearOverviewItem[]`

```json
[
  { "date": "2026-01-15", "activity": 47 },
  { "date": "2026-01-16", "activity": 12 }
]
```

`activity` is the number of `VoiceConnected` log entries for that day.

---

#### `GET /admin/stats`

Returns high-level dashboard summary counts for the admin panel.

- **Auth:** Admin required
- **Response:**

```json
{
  "totalMembers": 142,
  "totalPointsAwarded": 358200,
  "activeShopItems": 8,
  "totalRedemptions": 34
}
```

| Field | Description |
|-------|-------------|
| `totalMembers` | Total `Members` rows |
| `totalPointsAwarded` | Sum of all positive `PointHistory.points` entries |
| `activeShopItems` | `Reward` rows that are visible and have at least one unredeemed item |
| `totalRedemptions` | Total `RewardItem` rows that have been redeemed |

---

#### `GET /admin/shopItems`

Returns all shop items (including hidden ones) with current stock levels. Uses
the same `ShopItem` shape as the member-facing endpoint.

- **Auth:** Admin required
- **Response:** `ShopItem[]`

```json
[
  {
    "id": 3,
    "title": "Elden Ring",
    "description": "Soulslike game key",
    "price": 1000,
    "image": "https://example.com/elden-ring.jpg",
    "stock": 2,
    "nonSalePrice": null,
    "visible": true
  }
]
```

`stock` is the count of unredeemed `RewardItem` rows for that reward. `visible` indicates whether the item is shown in the member-facing shop.

> **Frontend display note — `/admin/shop` page:** Reward images (`image` URL)
> must be rendered at a **2:1 aspect ratio** (width : height) in every context
> where they appear — both in the main shop-item grid/list and inside the
> edit-item modal. Apply `aspect-ratio: 2 / 1; object-fit: cover;` (or
> equivalent) to the `<img>` element so that all images are uniformly cropped
> to this ratio regardless of their original dimensions.

---

#### `POST /admin/shopItems`

Creates a new shop item. Optionally pre-populates it with empty stock
placeholder rows.

- **Auth:** Admin required
- **Body:**

```json
{
  "title": "Elden Ring",
  "description": "Soulslike game key",
  "price": 1000,
  "image": "https://example.com/elden-ring.jpg",
  "nonSalePrice": null,
  "stock": 5,
  "visible": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name |
| `description` | Yes | Short description |
| `price` | Yes | Cost in points |
| `image` | Yes | URL to cover image (displayed at 2:1 aspect ratio in the admin UI) |
| `nonSalePrice` | No | Original price when on sale; `null` otherwise |
| `stock` | No | Number of empty `RewardItem` placeholders to create (default `0`) |
| `visible` | No | Whether shown in the member-facing shop (default `true`) |

- **Response (201):** The created `ShopItem` (same shape as `GET /admin/shopItems`)
- **Error responses:**
  - `400 Missing required fields` — `title`, `description`, `price`, or `image` absent

---

#### `PUT /admin/shopItems/:id`

Updates one or more fields on an existing shop item. All body fields are
optional — only supplied fields are updated.

- **Auth:** Admin required
- **Path parameter:** `id` — the `RewardID` of the shop item
- **Body (all fields optional):**

```json
{
  "title": "Elden Ring GOTY",
  "description": "Updated description",
  "price": 900,
  "nonSalePrice": 1000,
  "image": "https://example.com/elden-ring-goty.jpg",
  "visible": false
}
```

- **Response:** The updated `ShopItem`
- **Error responses:**
  - `404 Shop item not found` — no `Reward` with that ID

---

#### `DELETE /admin/shopItems/:id`

Permanently deletes a shop item and all its associated `RewardItem` rows.

- **Auth:** Admin required
- **Path parameter:** `id` — the `RewardID` of the shop item to delete
- **Response (204):** No content
- **Error responses:**
  - `404 Shop item not found` — no `Reward` with that ID

---

#### `POST /admin/shopItems/:id/stock`

Adds a single redeemable stock item (a `RewardItem`) to an existing shop item. Only `redemptionText` is required — the `rewardId` is taken from the URL path parameter.

- **Auth:** Admin required
- **Path parameter:** `id` — the `RewardID` of the shop item to stock
- **Body:**

```json
{ "redemptionText": "XXXX-YYYY-ZZZZ" }
```

| Field | Required | Description |
|-------|----------|-------------|
| `redemptionText` | Yes | The redeemable value (e.g. a game key or voucher code) |

- **Response (201):** The updated `ShopItem` with the new stock count reflected
- **Error responses:**
  - `400 Missing required field: redemptionText` — body field absent or empty
  - `404 Shop item not found` — no `Reward` with that ID

---

#### `GET /admin/members`

Returns all guild members with their current point balance, last seen
timestamp, and join date.

- **Auth:** Admin required
- **Response:**

```json
[
  {
    "userid": "534686392589221898",
    "username": "Kraken",
    "avatar": "cb24eca24fbf24e075d2eca04102e070",
    "points": 1200,
    "lastSeen": "2026-03-08T21:00:00.000Z",
    "joinDate": "2024-11-01T10:30:00.000Z"
  }
]
```

| Field | Description |
|-------|-------------|
| `userid` | Discord snowflake ID |
| `username` | Server display name (falls back to Discord ID if unset) |
| `avatar` | Discord avatar hash (empty string if not set) |
| `points` | Current `Points.TotalPoints` balance |
| `lastSeen` | Timestamp of most recent `VoiceConnected` event; `null` if never seen |
| `joinDate` | Timestamp of earliest `PointHistory` entry; `null` if no history |

---

#### `GET /admin/referrals`

Returns all referrals across the entire community, including display names and
avatars for both the referred user and the referrer.

- **Auth:** Admin required
- **Response:** `AdminReferral[]`

```json
[
  {
    "userId": "123456789012345678",
    "userDisplayName": "NewPlayer",
    "userAvatar": "abc123",
    "userLevel": 12,
    "referrerId": "534686392589221898",
    "referrerDisplayName": "Kraken",
    "referrerAvatar": "cb24eca24fbf24e075d2eca04102e070",
    "createdTimestamp": "2026-01-10T12:00:00.000Z",
    "isValid": "2026-01-12T08:30:00.000Z",
    "regularRewarded": null,
    "memberRewarded": null
  }
]
```

| Field | Description |
|-------|-------------|
| `userId` | Discord snowflake ID of the referred member |
| `userDisplayName` | Display name of the referred member (falls back to ID) |
| `userAvatar` | Discord avatar hash of the referred member (`null` if not set) |
| `userLevel` | XP level of the referred member (`Math.floor(0.2 * sqrt(xp))`); `null` if member record not found |
| `referrerId` | Discord snowflake ID of the referring member |
| `referrerDisplayName` | Display name of the referring member (falls back to ID) |
| `referrerAvatar` | Discord avatar hash of the referring member (`null` if not set) |
| `createdTimestamp` | When the referral was created |
| `isValid` | Timestamp when validated, or `null` |
| `regularRewarded` | Timestamp when regular reward was given, or `null` |
| `memberRewarded` | Timestamp when member reward was given, or `null` |

Results ordered by `createdTimestamp` descending.

---

#### `POST /admin/referrals/:userId/:referrerId/validate`

Marks a referral as valid by setting its `IsValid` timestamp to now.

- **Auth:** Admin required
- **Path parameters:** `userId` — referred member's Discord ID; `referrerId` — referrer's Discord ID
- **Body:** _(none)_
- **Response (200):** `{ "success": true }`
- **Error responses:**
  - `404 Referral not found`

---

#### `POST /admin/referrals/:userId/:referrerId/reward-regular`

Awards **50 points** to the **referrer** as their regular referral reward.
Atomically updates `Points`, creates a `PointHistory` entry, and marks
`RegularRewarded` on the referral record. Requires the referral to already
be validated.

- **Auth:** Admin required
- **Path parameters:** `userId` — referred member's Discord ID; `referrerId` — referrer's Discord ID
- **Body:** _(none)_
- **Response (200):** `{ "success": true, "pointsAwarded": 50 }`
- **Error responses:**
  - `400 Referral has not been validated yet`
  - `400 Regular reward already given`
  - `404 Referral not found`

---

#### `POST /admin/referrals/:userId/:referrerId/reward-member`

Awards **100 points** to the **referrer** as their member reward. Atomically
updates `Points` for the referrer and marks `MemberRewarded` on the referral
record. Requires the referral to already be validated.

- **Auth:** Admin required
- **Path parameters:** `userId` — referred member's Discord ID; `referrerId` — referrer's Discord ID
- **Body:** _(none)_
- **Response (200):** `{ "success": true, "pointsAwarded": 100 }`
- **Error responses:**
  - `400 Referral has not been validated yet`
  - `400 Member reward already given`
  - `404 Referral not found`

---

#### `GET /admin/raids`

Returns all raids ordered by creation time descending, including attendee count and creator display name.

- **Auth:** Admin required
- **Response:** `AdminRaid[]`

```json
[
  {
    "id": 42,
    "title": "Saturday Night Raid",
    "minPlayers": 5,
    "creationTime": "2026-03-07T18:00:00.000Z",
    "status": 1,
    "creatorId": "534686392589221898",
    "creatorName": "Kraken",
    "attending": 3
  }
]
```

| Field | Description |
|-------|-------------|
| `id` | Raid primary key |
| `title` | Raid display name |
| `minPlayers` | Minimum player target |
| `creationTime` | When the raid was created |
| `status` | `1` = active/open; `0` = inactive/closed |
| `creatorId` | Discord snowflake ID of the creator |
| `creatorName` | Display name of the creator (falls back to `creatorId` if not found) |
| `attending` | Number of signed-up attendees |

---

#### `POST /admin/raids`

Creates a new raid. The authenticated admin becomes the creator.

- **Auth:** Admin required
- **Body:**

```json
{
  "title": "Saturday Night Raid",
  "minPlayers": 5
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Raid display name |
| `minPlayers` | Yes | Minimum player target |

- **Response (201):** The created `AdminRaid` (same shape as `GET /admin/raids`)
- **Error responses:**
  - `400 Missing required fields: title, minPlayers`

---

#### `PUT /admin/raids/:id`

Updates one or more fields on an existing raid. All body fields are optional.

- **Auth:** Admin required
- **Path parameter:** `id` — the `Raids.ID`
- **Body (all fields optional):**

```json
{
  "title": "Updated Raid Title",
  "minPlayers": 8,
  "status": 0
}
```

- **Response:** The updated `AdminRaid`
- **Error responses:**
  - `404 Raid not found`

---

#### `DELETE /admin/raids/:id`

Permanently deletes a raid and cascades the delete to all related data:
`RaidAvailability` → `RaidSchedulingOption` → `RaidAttendees` → `Raids`.
All deletes happen in a single transaction.

- **Auth:** Admin required
- **Path parameter:** `id` — the `Raids.ID`
- **Response (204):** No content
- **Error responses:**
  - `404 Raid not found`

---

### Legacy / Public

#### `GET /events`

Returns Discord guild scheduled events. No authentication required.

Uses an in-memory cache (`client.cachedEvents`) populated at startup; falls
back to a live Discord API fetch if the cache is empty.

- **Auth:** None
- **Response:** Discord `GuildScheduledEvent` collection (raw Discord.js
  object, serialised to JSON)

---

### Developer / Testing

#### `GET /profileTester`

Renders a sample profile card PNG with query-parameter overrides. Not
authenticated. Intended for UI development only.

- **Auth:** None
- **Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `statusColor` | `string` | Hex colour for the status ring (default `#FF0000`) |
| `progressBarColor` | `string` | Hex colour for the XP bar (default `#FF0000`) |
| `backgroundColor` | `string` | Hex fill colour (default `#2b2f35`) |
| `backgroundImage` | `string` | Asset filename stem — uses image mode if provided |
| `achievement1`–`achievement5` | `string` | Badge filename stems |

- **Response:** `image/png` binary

---

## Data Models

All models are defined in `prisma/schema.prisma` with MySQL as the backing
database.

---

### Members

The central user record. One row per Discord guild member.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `String` PK | Discord user snowflake ID |
| `DisplayName` | `String?` | Server display name |
| `avatar` | `String?` | Discord avatar hash |
| `LastWebLogon` | `DateTime?` | Last web login timestamp |
| `XP` | `Int` | Lifetime XP (used for level calculation) |
| `AchievementNotifications` | `Boolean?` | Whether to DM achievement unlocks |
| `Blocked` | `Boolean?` | Blocked from shop/points (default `false`) |
| `NotifyLevel` | `Int?` | Notification preference level (default `0`) |

Relations: `Points`, `PointHistory[]`, `Achievement_History[]`,
`RaidAttendees[]`, `RaidAvailability[]`, `Raids[]`, `Presence[]`,
`Profile?`, `i_Island?`, `SSReceiver?`, `SSSender?`, `VoiceConnected[]`,
`Refferals[]`.

---

### Points

Current point balance per member.

| Field | Type | Notes |
|-------|------|-------|
| `userid` | `String` PK | FK → `Members.ID` |
| `TotalPoints` | `Int` | Current balance |
| `lastComment` | `String` | Description of last transaction |
| `Blocked` | `Boolean?` | Blocks shop redemption if `true` |

---

### PointHistory

Audit log of every point transaction.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `userid` | `String` | FK → `Members.ID` |
| `TimeStamp` | `DateTime` | Transaction time (default: now) |
| `points` | `Int` | Points awarded (positive) or deducted (negative) |
| `comment` | `String` | Human-readable reason |

---

### Reward

A shop item available for purchase with points.

| Field | Type | Notes |
|-------|------|-------|
| `RewardID` | `Int` PK | Auto-increment |
| `Title` | `String` | Display name |
| `Description` | `String` | Short description |
| `Price` | `Int` | Cost in points |
| `imageurl` | `String` | URL to cover image |
| `nonSalePrice` | `Int?` | Original price when on sale; `null` otherwise |
| `visible` | `Boolean` | Whether shown in shop (default `true`) |

---

### RewardItem

An individual redeemable unit (e.g. a game key) associated with a `Reward`.

| Field | Type | Notes |
|-------|------|-------|
| `RewardItemID` | `Int` PK | Auto-increment |
| `RewardID` | `Int` | FK → `Reward.RewardID` |
| `CreationTimeStamp` | `DateTime` | When the item was added |
| `RedemptionTimeStamp` | `DateTime?` | When it was redeemed; `null` if not yet |
| `RedemptionText` | `String` | The actual secret value (e.g. a game key) |
| `RedeemedBy` | `String?` | Discord user ID of redeemer; `""` = available |

Stock = number of rows where `RedeemedBy = ""`.

---

### Profile

Per-member profile card customisation settings.

| Field | Type | Notes |
|-------|------|-------|
| `userid` | `String` PK | FK → `Members.ID` |
| `StatusColor` | `String?` | Hex colour for avatar ring |
| `BackgroundImage` | `String?` | Background asset filename stem |
| `ProgressBarColor` | `String?` | Hex colour for XP progress bar |
| `Achievement1`–`Achievement5` | `String?` | Equipped badge filename stems (slots 1–5) |

---

### Achievements

Achievement definitions (the catalogue).

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `Type` | `String?` | Category (e.g. `"raid"`, `"presence"`) |
| `Name` | `String?` | Display name |
| `Description` | `String?` | Description of how to earn it |
| `Minimum` | `Int?` | Threshold value to unlock |
| `XpIncrease` | `Int?` | XP awarded on unlock (default `0`) |
| `points` | `Int?` | Points awarded on unlock (default `0`) |
| `NotifyLevel` | `Int?` | Minimum `NotifyLevel` for DM notification |

---

### Achievement_History

Record of each achievement a member has earned.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `AchievementID` | `Int` | FK → `Achievements.ID` |
| `UserID` | `String?` | FK → `Members.ID` |
| `TimeStamp` | `DateTime?` | When it was granted |
| `GrantedBy` | `String?` | Discord user ID of granting mod (if manual) |
| `Description` | `String?` | Optional context note |

---

### Raids

A community raid / event.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `Title` | `String?` | Event name |
| `MinPlayers` | `Int?` | Minimum attendance target (default `4`) |
| `Creator` | `String` | FK → `Members.ID` |
| `CreationTime` | `DateTime?` | Creation timestamp |
| `Status` | `Int?` | `1` = active / open; other values = closed/archived |

---

### RaidAttendees

Join table: which members are signed up for a raid.

| Field | Type | Notes |
|-------|------|-------|
| `RaidId` | `Int` | FK → `Raids.ID` (part of composite PK) |
| `MemberId` | `String` | FK → `Members.ID` (part of composite PK) |
| `CreationTime` | `DateTime?` | When they signed up |

---

### RaidSchedulingOption

Time-slot options presented during raid scheduling polls.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `RaidId` | `Int?` | FK → `Raids.ID` |
| `Timestamp` | `DateTime?` | The proposed date/time |
| `Option` | `String?` | Single-character label (e.g. `"A"`, `"B"`) |
| `IsSelected` | `Boolean?` | Whether this slot was chosen |

---

### RaidAvailability

Members' votes on scheduling options.

| Field | Type | Notes |
|-------|------|-------|
| `SchedulingOptionId` | `Int` | FK → `RaidSchedulingOption.ID` (part of PK) |
| `MemberId` | `String` | FK → `Members.ID` (part of PK) |

---

### Presence

Tracks game activity (Rich Presence) events per member.

| Field | Type | Notes |
|-------|------|-------|
| `Id` | `Int` unique | Auto-increment |
| `userID` | `String?` | FK → `Members.ID` |
| `TimeStamp` | `DateTime?` | When the presence was recorded |
| `applicationID` | `String?` | Discord application ID of the game |
| `name` | `String?` | Game or application name |
| `details` | `String?` | Activity detail string |
| `url` | `String?` | Stream URL (if streaming) |
| `state` | `String?` | Activity state string |
| `type` | `String?` | Activity type (e.g. `"PLAYING"`) |
| `status` | `String?` | Discord online status |

---

### VoiceConnected

Log of voice channel join/leave events (used for activity statistics).

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `String` | FK → `Members.ID` (part of composite PK) |
| `TimeStamp` | `DateTime` | Event timestamp (part of composite PK) |
| `ChannelID` | `String` | Discord channel ID (part of composite PK) |
| `ChannelName` | `String?` | Human-readable channel name |
| `deaf` | `Boolean?` | Whether the member was deafened |
| `mute` | `Boolean?` | Whether the member was muted |
| `streaming` | `Boolean?` | Whether the member was streaming |

---

### Channel

Tracked Discord channels (used for bot features like logging).

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `String` PK | Discord channel snowflake ID |
| `ChannelName` | `String` | Human-readable name |

---

### Login_History

Audit log of web logins via Discord OAuth.

| Field | Type | Notes |
|-------|------|-------|
| `Id` | `Int` PK | Auto-increment |
| `UserID` | `String?` | Discord user ID |
| `TimeStamp` | `DateTime?` | Login timestamp |
| `DiscordProfile` | `Json?` | Full Discord profile snapshot at login time |

---

### Island Game Models

These back the `islander` game mechanic module.

#### `i_Island`

A player's island state.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `String` PK | FK → `Members.ID` |
| `Wood` | `Int` | Resource count |
| `Stone` | `Int` | Resource count |
| `Currency` | `Int` | Resource count |
| `Food` | `Int` | Resource count |
| `Manpower` | `Int` | Resource count |

#### `i_Building`

Building type definitions.

| Field | Type | Notes |
|-------|------|-------|
| `ID` | `Int` PK | Auto-increment |
| `Name` | `String?` | Building name |

#### `i_BuildingLevel`

Per-level stats for each building type.

| Field | Type | Notes |
|-------|------|-------|
| `BuildingID` | `Int` | FK → `i_Building.ID` (part of PK) |
| `Level` | `Int` | Level number (part of PK) |
| `Name` | `String` | Level display name |
| `Wood` | `Int` | Wood cost to build |
| `Food` | `Int` | Food cost to build |
| `Stone` | `Int` | Stone cost to build |
| `Time` | `Int` | Build time (seconds or ticks) |
| `TClevel` | `Int?` | Town Centre level prerequisite |
| `imagename` | `String` | Asset filename |
| `imagePosX/Y` | `Int` | Image position offsets |
| `Function` | `String?` | Special function identifier |
| `FunctAttribute` | `Int?` | Numeric attribute for the function |

#### `i_Building_Island`

A building placed on a player's island.

| Field | Type | Notes |
|-------|------|-------|
| `BuildingID` | `Int` | FK → `i_Building.ID` (part of PK) |
| `IslandID` | `String` | FK → `i_Island.ID` (part of PK) |
| `level` | `Int` | Current level of this building |
| `upgrading` | `Int?` | Upgrade completion timestamp (if upgrading) |

#### `i_Unit` / `i_Unit_Island`

Unit type definitions and per-island unit counts.

`i_Unit`: `ID`, `Name`, `Type`

`i_Unit_Island` (join): `IslandID`, `UnitID`, `count`

---

### Secret Santa Models

#### `SSSender` / `SSReceiver` / `SSLink`

Manage the Secret Santa gift exchange pairing.

- `SSSender`: tracks whether a member has sent their gift (`IsSend`)
- `SSReceiver`: stores the receiver's shipping address and store wishlist links
- `SSLink`: confirmed pairing between a sender and receiver

---

### FreeKeys

Holds miscellaneous redeemable keys (not tied to the shop system).

| Field | Type | Notes |
|-------|------|-------|
| `Id` | `Int` PK | Auto-increment |
| `Redeemer` | `String?` | Discord username of redeemer |
| `Description` | `String?` | What the key is for |
| `Key` | `String?` | The key value |

---

### Refferals

Tracks member referrals.

| Field | Type | Notes |
|-------|------|-------|
| `userid` | `String` | FK → `Members.ID` (referred member; part of PK) |
| `refferer` | `String` | FK → `Members.ID` (referring member; part of PK) |
| `IsValid` | `DateTime?` | When the referral was validated |
| `RegularRewarded` | `DateTime?` | When the regular reward was granted |
| `MemberRewarded` | `DateTime?` | When the member reward was granted |
| `CreatedTimestamp` | `DateTime?` | When the referral was created |

---

## Response Format

All JSON responses are serialised with a custom replacer that converts
`BigInt` values to `Number`. Content-Type is `application/json` (via
`res.send(jsonify(...))` — Express infers the type from the stringified
content).

Profile image endpoints return `Content-Type: image/png`.

---

## Error Handling

| Status | Meaning |
|--------|---------|
| `400` | Bad request (missing fields, out of stock, insufficient points, blocked) |
| `401` | Missing `Authorization` header / no token |
| `403` | Invalid or expired JWT |
| `500` | Unhandled server error |
