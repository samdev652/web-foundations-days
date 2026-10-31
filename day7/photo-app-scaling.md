# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from the people they follow.

## 1. Assumptions

- 10,000,000 registered users
- 10% are active each day
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail
- Peak traffic is 5 times the average
- There are 86,400 seconds in a day

**Daily active users (DAU):** 10,000,000 x 10% = **1,000,000 users**

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 x 1 = 1,000,000
- Average: 1,000,000 / 86,400 = about **12 uploads/s**
- Peak: 12 x 5 = about **60 uploads/s**

### Feed views per second

- Feed views per day: 1,000,000 x 50 = 50,000,000
- Average: 50,000,000 / 86,400 = about **579 views/s**
- Peak: 579 x 5 = about **2,900 views/s**

### Photo storage per year

- Per photo: 2 MB original + 50 KB thumbnail = 2.05 MB
- Per day: 1,000,000 x 2.05 MB = 2.05 TB
- Per year: 2.05 TB x 365 = about **748 TB** (roughly 0.75 PB)
  - Originals: 2 TB/day, about 730 TB/year
  - Thumbnails: 50 GB/day, about 18 TB/year

| Measure               | Average | Peak           |
| --------------------- | ------- | -------------- |
| Uploads per second    | 12      | 60             |
| Feed views per second | 579     | 2,900          |
| Storage per year      | 748 TB  | not applicable |

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. Each active user views 50 feed pages for every 1 photo they upload, so reads outnumber writes about **50 to 1** (579 / 12).

What this means for the design:

- Spend effort on making reads cheap: a CDN for photos, a cache for hot data, and a read replica for the database.
- Add more app servers behind a load balancer as read traffic grows.
- Keep uploads simple and fast, but do the slow work (thumbnails) in the background so users never wait for it.

## 4. Where photos should be stored

Photos should **not** be stored inside the database. At about 748 TB per year, they would make the database enormous, slow to back up and expensive to replicate. Database storage is also costly compared with file storage, and every photo download would use up database connections and bandwidth that are needed for queries. A database cannot hand files directly to a CDN either.

Photos go in **object storage** (for example Amazon S3 or a similar service), which is cheap, scales almost without limit and is built for large files. The database stores only the **metadata** and a **key or URL** that points to the file: photo id, owner id, caption, upload time, and the storage keys of the original and the thumbnail.

## 5. Architecture diagram

                    Users (mobile app / browser)
                       |                    |
         photo and thumbnail                | API requests
              downloads                     | (feed, upload, follow)
                       v                    v
              +----------------+   +-----------------+
              |      CDN       |   |  Load balancer  |
              +-------+--------+   +--------+--------+
                      |                     |
                 cache miss          +------+------+------+
                      |              |             |             |
                      |              v             v             v
                      |         +---------+   +---------+   +---------+
                      |         |   App   |   |   App   |   |   App   |
                      |         | server 1|   | server 2|   | server 3|
                      |         +----+----+   +----+----+   +----+----+
                      |               \            |            /
                      |                \           |           /
                      |       +---------+----------+----------+---------+
                      |       |                    |                    |
                      |       v                    v                    v
                      |  +---------+     +------------------+     +---------+
                      |  |  Cache  |     |     Database     |     |  Queue  |
                      |  | (Redis) |     | primary (writes) |     +----+----+
                      |  +---------+     |        |         |          |
                      |                  |        v         |          v
                      |                  |  read replica    |     +---------+
                      |                  |  (feed reads)    |     |Thumbnail|
                      |                  +------------------+     | worker  |
                      |                                           +----+----+
                      v                                                |
              +---------------------------------+                      |
              |         Object storage          |<---------------------+
              |  originals (2 MB) + thumbnails  |  reads original,
              |  (50 KB)                        |  writes thumbnail
              +---------------------------------+

## 6. What each component does

- **CDN:** serves photos and thumbnails from servers close to the user, which makes images load faster and keeps most of the heavy download traffic away from our own servers.
- **Load balancer:** spreads incoming requests across the app servers so no single server is overloaded, and stops sending traffic to a server that has failed.
- **App servers:** run the application logic (login, feed, upload, follow) and are kept stateless so we can add more of them when traffic grows.
- **Cache:** keeps frequently requested data, such as ready-made feeds and photo metadata, in memory so repeated reads do not hit the database.
- **Database (primary):** stores users, follows and photo metadata reliably, and handles all writes.
- **Read replica:** holds a copy of the database that serves read queries, so the heavy feed traffic does not slow down writes on the primary.
- **Object storage:** stores the photo files cheaply at huge scale, so the database never has to hold large files.
- **Queue:** holds background jobs such as "make a thumbnail for photo 123", so the upload request can finish without waiting for slow work.
- **Thumbnail worker:** takes jobs from the queue, creates the 50 KB thumbnail and saves it, so feeds load small images instead of 2 MB originals.

## 7. Upload flow

1. The user picks a photo in the app and taps Upload.
2. The request goes through the load balancer to an app server, which checks the user is logged in and validates the file type and size.
3. The app server asks object storage for a temporary signed upload link and returns it to the client.
4. The client uploads the 2 MB original directly to object storage, so the large file never passes through the app servers.
5. The client tells the app server the upload is finished. The app server saves the photo metadata (owner, caption, storage key, status "processing") in the database primary.
6. The app server puts a "create thumbnail" job on the queue and immediately replies "upload successful". The user can carry on.
7. A thumbnail worker takes the job from the queue, downloads the original from object storage and creates a 50 KB thumbnail.
8. The worker saves the thumbnail to object storage and updates the database row to status "ready" with the thumbnail key.
9. The worker clears the affected cache entries, so followers' feeds include the new photo.
10. When followers open their feed, the app reads from the cache or read replica, and the CDN delivers the thumbnail.

If the worker fails, the job returns to the queue and is retried, so no photo is lost.

## 8. Trade-offs

- **Caching speeds up reads but can show stale data.** A cached feed may not include a photo uploaded a few seconds ago. We accept this because feeds do not need to be perfectly up to date, and shorter cache lifetimes reduce staleness at the cost of more database load.
- **A read replica scales reads but is eventually consistent.** The replica can lag behind the primary, so a user might upload a photo and not see it on their own profile for a moment. We could read the user's own recent uploads from the primary to avoid this, at the cost of extra load on it.
- **Creating thumbnails in the background keeps uploads fast but the photo is not instantly ready.** The photo may show a placeholder until the worker finishes. We accept a short delay in return for a quick upload response and a system that does not stall when many users upload at once. It also adds more moving parts (a queue and workers) to run and monitor.
- **Thumbnails cost extra storage but save a lot of bandwidth.** They add about 18 TB per year (roughly 2.5% on top of the originals), but a feed page that loads 50 KB images instead of 2 MB images transfers about 40 times less data.
