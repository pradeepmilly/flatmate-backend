# FlatMate India — Backend API

Node.js + Express + PostgreSQL REST API for the FlatMate India app.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [PostgreSQL](https://www.postgresql.org/download/) v14+

---

## Setup (Step by Step)

### 1. Install PostgreSQL

Download and install from https://www.postgresql.org/download/windows/
During install, set a password for the `postgres` user — remember it.

### 2. Create the database

Open **pgAdmin** (installed with PostgreSQL) or run in terminal:

```bash
psql -U postgres
```

Then type:
```sql
CREATE DATABASE flatmate_india;
\q
```

### 3. Run the schema

```bash
psql -U postgres -d flatmate_india -f db/schema.sql
```

This creates all tables and indexes.

### 4. Configure environment

Copy the example env file:
```bash
copy .env.example .env
```

Edit `.env` and set your PostgreSQL password:
```
DB_PASSWORD=your_postgres_password_here
JWT_SECRET=any_long_random_string_here
```

### 5. Install dependencies

```bash
npm install
```

### 6. Start the server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The API runs at **http://localhost:4000**

---

## API Reference

All protected routes require header:
```
Authorization: Bearer <token>
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP (demo: always 1234) |
| POST | `/api/auth/verify-otp` | Verify OTP → returns JWT + user |
| GET  | `/api/auth/me` | Get current user profile |

**send-otp body:**
```json
{ "phone": "9876543210", "aadhaar": "1234 5678 9012", "role": "owner" }
```

**verify-otp body:**
```json
{ "phone": "9876543210", "otp": "1234", "aadhaar": "1234 5678 9012", "role": "owner", "name": "Rajesh Kumar" }
```

---

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id` | Public profile with reviews/reports |
| GET | `/api/users/lookup/phone/:phone` | Lookup by phone |
| GET | `/api/users/lookup/aadhaar/:last4` | Lookup by Aadhaar last 4 digits |
| PATCH | `/api/users/me` | Update own profile |

---

### Properties

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/properties` | Search (`?locality=HSR&max_rent=25000&bedrooms=2`) |
| GET | `/api/properties/mine` | Owner's own listings |
| GET | `/api/properties/:id` | Property detail + owner info |
| POST | `/api/properties` | Create listing (owner only) |
| PATCH | `/api/properties/:id` | Edit listing (owner only) |
| DELETE | `/api/properties/:id` | Remove listing (owner only) |

**Create property body:**
```json
{
  "title": "2BHK near Metro",
  "locality": "Koramangala",
  "address": "5th Block, Koramangala, Bengaluru - 560095",
  "rent": 22000,
  "deposit": 66000,
  "bedrooms": 2,
  "bathrooms": 2,
  "area": 950,
  "available_from": "15 Jul 2026",
  "amenities": ["wifi", "parking", "water"],
  "description": "Well-maintained flat near Forum Mall."
}
```

---

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/applications` | Tenant applies (`property_id`, `message`) |
| GET | `/api/applications/mine` | Tenant: my applications |
| GET | `/api/applications/received` | Owner: received applications |
| PATCH | `/api/applications/:id/status` | Owner: accept/reject (`{ "status": "accepted" }`) |

---

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages/threads` | All conversation threads |
| GET | `/api/messages/:userId` | Messages with a specific user |
| POST | `/api/messages/:userId` | Send message (`{ "text": "..." }`) |
| PATCH | `/api/messages/:userId/read` | Mark messages as read |

---

### Reviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reviews/tenant-reports` | Owner writes tenant conduct report |
| GET | `/api/reviews/tenant-reports/:userId` | Get reports about a tenant |
| POST | `/api/reviews/owner-reviews` | Tenant writes owner review |
| GET | `/api/reviews/owner-reviews/:userId` | Get reviews about an owner |

**Tenant report body:**
```json
{
  "tenant_id": "uuid",
  "property_id": "uuid",
  "payment_timeliness": 5,
  "nature": 4,
  "cleanliness": 4,
  "cooperation": 5,
  "overall": 5,
  "comment": "Excellent tenant, always paid on time."
}
```

---

### Active Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/active-tenants` | Owner: list current tenants |
| POST | `/api/active-tenants` | Record move-in |
| PATCH | `/api/active-tenants/:id` | Update rent / last payment |
| PATCH | `/api/active-tenants/:id/moveout` | Record move-out |

**Move-in body:**
```json
{
  "tenant_phone": "9123456780",
  "property_id": "uuid",
  "move_in_date": "2026-06-15",
  "monthly_rent": 22000
}
```

---

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | My notifications |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| PATCH | `/api/notifications/:id/read` | Mark one as read |

---

## Connecting the Frontend

In your `FlatMateIndia.jsx`, replace mock data calls with:

```js
const API = "http://localhost:4000/api";

// Login
const res = await fetch(`${API}/auth/verify-otp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone, otp, aadhaar, role, name })
});
const { token, user } = await res.json();
localStorage.setItem("token", token);

// Authenticated request
const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${localStorage.getItem("token")}`
};
const properties = await fetch(`${API}/properties?locality=Koramangala`, { headers }).then(r => r.json());
```

---

## Project Structure

```
flatmate-backend/
├── server.js              — Express app entry point
├── package.json
├── .env.example           — Copy to .env and fill in values
├── db/
│   ├── connection.js      — PostgreSQL pool
│   └── schema.sql         — All tables and indexes
├── middleware/
│   ├── auth.js            — JWT verification
│   └── errorHandler.js    — Central error handling
└── routes/
    ├── auth.js            — OTP login + JWT
    ├── users.js           — Profiles + lookup
    ├── properties.js      — Listings CRUD
    ├── applications.js    — Apply + accept/reject
    ├── messages.js        — In-app chat
    ├── reviews.js         — Tenant reports + owner reviews
    ├── activeTenants.js   — Move-in/out tracking
    └── notifications.js   — Activity feed
```
