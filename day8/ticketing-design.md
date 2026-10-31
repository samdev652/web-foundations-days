# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs. It also explains how the design prevents two people from buying the same seat.

## 1. Requirements

### Functional requirements

- Users can register, log in and view their profile.
- Users can browse and search events by name, date and city.
- Users can view an event's seat map with the price and availability of each seat.
- Users can hold (reserve) up to 4 seats for 5 minutes while they pay.
- Users can pay for held seats and receive tickets with a unique code.
- Users can view their orders and tickets.
- A seat that is not paid for within the hold time is released automatically.

### Non-functional requirements

- **Correctness (most important):** a seat is never sold twice, a user is never charged without getting a ticket, and a user is never charged twice for the same order.
- **Speed:** browsing pages respond in under 300 ms, and a seat hold responds in under 500 ms, even during a big sale.
- **Availability:** the site stays up during a big sale. If it is overloaded, it slows down gracefully (a waiting room) instead of crashing.
- **Fairness:** people are served in a fair order, so fast connections and bots do not beat everyone else.
- **Durability:** a paid order is never lost, which means backups and replication.
- **Security:** HTTPS everywhere, hashed passwords, and card details handled only by the payment provider (TicketHub never stores card numbers).
- **Scalability:** capacity can be increased before a big sale by adding servers.

## 2. Estimates

### Assumptions

- 2,000,000 registered users
- Normal day: 50,000 visitors, each viewing 10 pages, and 5,000 tickets sold
- Orders contain 2 tickets on average, so about 2,500 orders on a normal day
- Big sale: 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds)
- During the sale, each person makes about 10 requests (seat map views, hold attempts, payment) and each person makes about 3 hold attempts
- Peak is 5 times the average on a normal day, and 3 times the average during the first minutes of a sale
- A day has 86,400 seconds

### Normal traffic

- Page views: 50,000 x 10 = 500,000 per day, which is 500,000 / 86,400 = about **6 requests/s** on average and about **30 requests/s** at peak
- Tickets sold: 5,000 per day = about **0.06 tickets/s** (one every 17 seconds), and about **0.3 tickets/s** at peak
- Storage: 5,000 tickets x 365 = about 1.8 million tickets per year. At about 500 bytes per ticket and order, that is under **1 GB per year**. Seat rows for events add only a few GB (a 20,000-seat event is about 2 MB).

### Big sale (one popular concert)

- Requests: 200,000 users x 10 requests = 2,000,000 requests in 600 s = about **3,300 requests/s** on average, and about **10,000 requests/s** at the start
- Hold attempts: 200,000 x 3 = 600,000 in 600 s = about **1,000 hold attempts/s**, of which only about **33 can succeed per second** (20,000 seats / 600 s), because there are only 20,000 seats
- Payments: about **33 orders-worth of seats/s**, which is about 17 orders/s with 2 seats each
- Competition: 200,000 people for 20,000 seats means **10 people for every seat**, so 90% of users will not get a ticket

### Comparison

| Measure                       | Normal day | Big sale | Difference                   |
| ----------------------------- | ---------- | -------- | ---------------------------- |
| Requests per second (average) | 6          | 3,300    | about 550 times more         |
| Requests per second (peak)    | 30         | 10,000   | about 330 times more         |
| Tickets sold per second       | 0.06       | 33       | about 550 times more         |
| Hold attempts per second      | negligible | 1,000    | contention on the same seats |

The system is **read-heavy** on a normal day, but the big sale is a short, extreme spike of **contended writes**: thousands of people fighting for the same 20,000 seats. A design that is fine on a normal day (a single server and a database) would fail in the first seconds of a sale. So the design is built for the big sale, and the normal day is easy by comparison.

## 3. API

Base URL: `https://api.tickethub.example/v1`. JSON is used for all requests and responses. Endpoints other than browsing need `Authorization: Bearer <token>`.

| Method | Path                               | Description                                                             | Success status |
| ------ | ---------------------------------- | ----------------------------------------------------------------------- | -------------- |
| POST   | `/auth/login`                      | Log in and receive a token                                              | 200 OK         |
| GET    | `/events?city=&q=&page=`           | Browse and search events                                                | 200 OK         |
| GET    | `/events/{eventId}`                | Get one event's details                                                 | 200 OK         |
| GET    | `/events/{eventId}/seats?section=` | View seats with their status and price                                  | 200 OK         |
| POST   | `/events/{eventId}/holds`          | Hold up to 4 seats for 5 minutes                                        | 201 Created    |
| DELETE | `/holds/{holdId}`                  | Release a hold early                                                    | 204 No Content |
| POST   | `/orders`                          | Pay for a hold and create the order (needs an `Idempotency-Key` header) | 201 Created    |
| GET    | `/orders/{orderId}`                | View one order and its payment status                                   | 200 OK         |
| GET    | `/me/tickets`                      | View my tickets                                                         | 200 OK         |

### Example: hold seats

`POST /events/42/holds`

{ "seatIds": [1051, 1052] }

Response `201 Created`:

{
"holdId": "h_7f3a9",
"eventId": 42,
"seatIds": [1051, 1052],
"totalCents": 24000,
"expiresAt": "2026-11-20T10:05:00Z"
}

### Example: pay

`POST /orders` with header `Idempotency-Key: 6c1e...`

{ "holdId": "h_7f3a9", "paymentToken": "tok_abc123" }

Response `201 Created`:

{
"orderId": 9001,
"status": "PAID",
"tickets": [
{ "ticketId": 5001, "seatId": 1051, "code": "TH-8K2M-4Q" },
{ "ticketId": 5002, "seatId": 1052, "code": "TH-8K2M-4R" }
]
}

### Error codes

- **400 Bad Request:** invalid body, for example asking for 5 seats.
- **401 Unauthorized:** missing or expired token.
- **402 Payment Required:** the payment was declined.
- **404 Not Found:** unknown event, hold or order.
- **409 Conflict:** one of the requested seats was already taken by someone else. Example body: `{ "error": { "code": "SEAT_TAKEN", "message": "Seat 1052 is no longer available.", "seatIds": [1052] } }`
- **410 Gone:** the hold expired before payment.
- **429 Too Many Requests:** too many requests from this user or IP.
- **503 Service Unavailable with a queue position:** the waiting room is full and the user must wait.

## 4. Data model

### Tables

- **users:** `user_id` (PK), `email` (UNIQUE), `password_hash`, `name`, `created_at`.
- **events:** `event_id` (PK), `name`, `venue`, `city`, `starts_at`, `on_sale_at`, `total_seats`.
- **seats:** one row per seat for each event. `seat_id` (PK), `event_id` (FK), `section`, `row_label`, `seat_number`, `price_cents`, `status` (AVAILABLE, HELD or SOLD), `held_by` (FK to users), `hold_expires_at`.
- **orders:** `order_id` (PK), `user_id` (FK), `event_id` (FK), `total_cents`, `status` (PENDING, PAID, FAILED, REFUNDED), `idempotency_key` (UNIQUE), `payment_ref`, `created_at`.
- **tickets:** `ticket_id` (PK), `order_id` (FK), `seat_id` (FK), `ticket_code` (UNIQUE), `status` (VALID or VOID).

### Relationships

- **users to orders: one-to-many.** A user places many orders, and each order has one user.
- **events to seats: one-to-many.** An event has thousands of seats, and each seat belongs to one event.
- **orders to tickets: one-to-many.** An order contains one or more tickets.
- **seats to tickets: one-to-one for sellable seats.** A seat can have at most one valid ticket. This is enforced by a unique index (see section 5).
- **users to events through orders and seats: many-to-many.** Many users buy tickets for many events, and the orders, tickets and seats tables record each purchase.

### SQL

CREATE TABLE seats (
seat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
event_id BIGINT NOT NULL REFERENCES events (event_id),
section VARCHAR(20) NOT NULL,
row_label VARCHAR(5) NOT NULL,
seat_number INT NOT NULL,
price_cents INT NOT NULL CHECK (price_cents > 0),
status VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE'
CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
held_by BIGINT REFERENCES users (user_id),
hold_expires_at TIMESTAMPTZ,
UNIQUE (event_id, section, row_label, seat_number),
CHECK (status <> 'HELD' OR (held_by IS NOT NULL AND hold_expires_at IS NOT NULL))
);

CREATE TABLE orders (
order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users (user_id),
event_id BIGINT NOT NULL REFERENCES events (event_id),
total_cents INT NOT NULL,
status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
idempotency_key VARCHAR(64) NOT NULL UNIQUE,
payment_ref VARCHAR(100),
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
ticket_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
order_id BIGINT NOT NULL REFERENCES orders (order_id),
seat_id BIGINT NOT NULL REFERENCES seats (seat_id),
ticket_code VARCHAR(20) NOT NULL UNIQUE,
status VARCHAR(10) NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'VOID'))
);

-- The last line of defence: one valid ticket per seat, ever.
CREATE UNIQUE INDEX one_valid_ticket_per_seat ON tickets (seat_id) WHERE status = 'VALID';

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);

The index `idx_seats_event_status` makes the seat map query fast, and `idx_orders_user` makes "my orders" fast.

## 5. How double-booking is prevented

The rule is simple: **the database is the only judge of who owns a seat**, and it decides with one atomic statement. There are four layers.

### Layer 1: an atomic conditional hold

When a user asks to hold seats, the app runs one `UPDATE` inside a transaction:

BEGIN;

UPDATE seats
SET status = 'HELD',
held_by = :user_id,
hold_expires_at = now() + interval '5 minutes'
WHERE event_id = :event_id
AND seat_id = ANY(:seat_ids)
AND (status = 'AVAILABLE'
OR (status = 'HELD' AND hold_expires_at < now()));

-- The app checks the number of rows changed.
-- If it equals the number of seats requested: COMMIT.
-- If it is lower, someone else got a seat first: ROLLBACK and return 409.

```

Checking and changing happen in the same statement, so there is no gap between "is it free?" and "take it" for another request to slip into. If two users send this statement for the same seat at the same moment, the database locks that row for the first one. The second one waits, then re-checks the `WHERE` condition against the committed result, sees the seat is now `HELD`, and changes zero rows. Exactly one user wins. Using one transaction for all seats means a hold is all-or-nothing, so a user never ends up holding only some of the seats they wanted. The app sorts the seat ids before updating, so two users holding overlapping seats lock them in the same order and cannot deadlock.

### Layer 2: re-check at payment time

Paying does not trust the earlier hold. In a new transaction, the app locks the seats and checks they are still held by this user and not expired:


SELECT seat_id FROM seats
WHERE seat_id = ANY(:seat_ids) AND status = 'HELD'
  AND held_by = :user_id AND hold_expires_at > now()
FOR UPDATE;


If the count is wrong, the request returns 410 Gone. If it is right, the app extends the hold by 2 minutes so it cannot expire during the payment call, and creates the order as `PENDING`. The payment provider is called **outside** the database transaction, so locks are never held while waiting on a network call. After payment succeeds, a final transaction marks the seats `SOLD`, creates the tickets and sets the order to `PAID`.

### Layer 3: the unique constraint

Even if a bug let two requests reach the final step, `one_valid_ticket_per_seat` makes the database reject the second ticket with a unique violation. The transaction rolls back, the order is marked `FAILED` and the payment is refunded automatically. The constraint guarantees that a double sale cannot be saved, whatever the application code does.

### Layer 4: idempotency and expiry

- The `Idempotency-Key` on `POST /orders` is stored in a `UNIQUE` column. If the user double-clicks Pay or the client retries after a timeout, the second request returns the first order instead of charging again.
- Expired holds are released by the `WHERE ... hold_expires_at < now()` condition in Layer 1 (so an expired hold can be taken immediately), and a worker also resets expired rows every minute to keep the seat map accurate.

### What about caching?

The cached seat map is used only for **display**. It may be 1 to 2 seconds old, so a user may click a seat that was just taken. The hold request always goes to the primary database, so the user simply gets a 409 and the seat map refreshes. A stale cache can disappoint a user, but it can never cause a double sale.

## 6. Architecture

```

                        Client (browser / mobile app)
                                     |
                                     v
                           +------------------+
                           |       DNS        |
                           +---------+--------+
                                     |
              +----------------------+----------------------+
              |                                             |

images, event pages, JS/CSS API and purchase flow
| |
v v
+-----------+ +------------------+
| CDN | | Waiting room | (virtual queue,
+-----------+ | (rate-limited) | used for big sales)
+---------+--------+
|
v
+------------------+
| Load balancer |
+---------+--------+
|
+----------------------------+----------------------------+
| | |
v v v
+-------------+ +-------------+ +-------------+
| App server 1| | App server 2| ... | App server N| (auto-scaled)
+------+------+ +------+------+ +------+------+
\ | /
\ | /
+------------------+-------------------------+-------------------------+-----------+
| | |
v v v
+-------------+ +---------------------+ +-------------+
| Cache | | Primary database | | Queue |
| (Redis) | | (holds, orders: | +------+------+
| seat-map | | all writes) | |
| snapshots, | +----------+----------+ v
| event data | | replication +-------------+
+-------------+ v | Workers |
+---------------------+ +------+------+
| Read replica | |
| (browse, search, | v
| my tickets) | +-------------------+
+---------------------+ | Payment provider, |
| email, ticket PDF |
+-------------------+

```

### What each component does

- **Client:** the browser or app where users browse events, pick seats and pay.
- **DNS:** turns `tickethub.example` into the addresses of the CDN and load balancer, so we can move or add servers without users noticing.
- **CDN:** serves images, event pages and static files from servers close to the user, so most of the traffic never reaches our servers and does not slow the sale down.
- **Waiting room:** lets only a limited number of people into the purchase flow at a time and puts everyone else in a fair queue, so the system is never hit by all 200,000 users at once.
- **Load balancer:** spreads requests over the app servers and stops sending traffic to a server that has failed.
- **App servers:** run the API logic (validation, holds, orders) and keep no state of their own, so many copies can run side by side and more can be added before a sale.
- **Cache (Redis):** keeps event details and a compact seat-map snapshot in memory, so thousands of people can view the seat map without touching the database.
- **Primary database:** stores users, seats, orders and tickets, and is the single source of truth that decides who owns each seat, using transactions and constraints.
- **Read replica:** serves browsing, search and "my tickets" queries, so heavy reading never slows down holds and payments on the primary, and it holds a copy of the data if the primary fails.
- **Queue:** holds background jobs such as "send confirmation email" or "release expired holds", so the user's request can finish without waiting for slow work.
- **Workers:** take jobs from the queue and run them, with retries when a job fails.
- **Payment provider (external):** takes the card payment, so TicketHub never stores card numbers.

### How the design survives the big sale

1. **Before the sale:** the team scales up the app servers in advance (the on-sale time is known), warms the cache with the event and seat map, and checks that the database is healthy.
2. **The waiting room absorbs the spike.** Of the 200,000 people who arrive, only about 5,000 are let in at a time. The rest see "You are in the queue, position N". Because everybody who arrives in the first couple of minutes gets a **random** position (and later arrivals go in order), a fast connection or a bot does not win, which meets the fairness requirement. A person who is let in has a time-limited pass and a rate limit per user, which stops one user hammering the API.
3. **The CDN and the cache carry the reads.** The seat map is a snapshot of 20,000 seats, a few KB when compressed, rebuilt every 1 to 2 seconds and shared by everyone. That turns about 1,000 seat map requests per second into one database query per refresh.
4. **The database only does the work that must be exact.** About 1,000 hold attempts per second reach it, but only about 33 per second succeed, and each is a small indexed update. That is well within what a single well-sized PostgreSQL primary can handle, which is why we avoid the complexity of sharding.
5. **Slow work is moved off the request path.** Emails, ticket PDFs and expired-hold cleanup run through the queue and workers, so the sale is not slowed by them.
6. **No single point of failure.** There are several app servers across zones, a replicated cache, a primary with a replica that can be promoted, a replicated queue with several workers, and managed DNS and CDN. If the cache fails, requests fall back to the replica, which is slower but still correct.
7. **When the sale sells out,** the seat map shows all seats as sold, the waiting room tells remaining users the event is sold out, and the load drops sharply.

## 7. Trade-offs

- **Waiting room: protection against convenience.** It keeps the system alive and fair, but 195,000 people must wait or leave, and building and tuning it adds work. We accept this because without it the site would crash for everyone and nobody could buy a ticket.
- **Cached seat map: speed against freshness.** A user may see a seat as free when it was taken a second ago and get a 409 when they click. The alternative, reading every seat map from the primary, would add thousands of queries per second to the database. We accept the occasional disappointed click, because correctness is protected by the database.
- **Single primary database: correctness against write scaling.** All writes go to one primary, which makes it easy to guarantee one owner per seat. The limit is that writes cannot scale beyond one machine. At about 33 successful holds per second this is fine, and if TicketHub grew to many simultaneous huge sales, we would shard by event, which keeps each event's seats in one place.
- **Hold duration (5 minutes): fairness to payers against fairness to others.** A long hold gives people time to find their card, but it keeps seats away from other buyers while they decide. A short hold frees seats sooner but frustrates slow payers. Five minutes with a 2-minute extension at payment is a compromise, and seats that expire go straight back on sale.
- **Locking in the database instead of in Redis.** A Redis lock would be faster, but it adds a second place that decides who owns a seat, and the two could disagree after a crash. We chose the slightly slower database approach for the guarantee that there is only one source of truth.
```
