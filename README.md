# DR HOME Maintenance Backend

Minimal Dockerized backend for the DR HOME maintenance customer portal.

The current frontend is a static prototype. This API replaces the demo `localStorage` logic with MariaDB-backed authentication, customer data, properties, maintenance plans, appointments, service requests, documents, notifications and support messages.

## Quick start

```powershell
cd C:\path\to\drhome-maintenance-backend
Copy-Item .env.example .env
.\scripts\start-local.ps1 -Build -Logs
```

API health check:

```text
GET http://localhost:3000/api/health
```

Seeded demo login:

```text
login@login.de / 123456
```

## GitHub push

```powershell
.\scripts\push-to-github.ps1 -RepoUrl "https://github.com/Manemm2103/maintenencev2.git"
```

The script initializes git if needed, sets `origin`, commits pending changes and pushes to `main` by default.

## Frontend auth flow

Login:

```http
POST /api/auth/login
Content-Type: application/json

{
  "emailOrCustomerId": "login@login.de",
  "password": "123456"
}
```

Use the returned token on all protected calls:

```http
Authorization: Bearer <token>
```

Registration:

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Daniel Ritter",
  "email": "daniel@example.com",
  "phone": "+971 50 000 0000",
  "password": "123456",
  "property": {
    "name": "Opal Tower - Marina",
    "propertyType": "Apartment",
    "area": "Dubai Marina",
    "city": "Dubai"
  }
}
```

## Main endpoints

- `GET /api/dashboard`
- `GET /api/me`
- `PATCH /api/me`
- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/properties`
- `POST /api/properties`
- `PATCH /api/properties/:id`
- `POST /api/properties/:id/primary`
- `GET /api/service-types`
- `GET /api/maintenance`
- `GET /api/maintenance/:id`
- `GET /api/appointments`
- `POST /api/appointments`
- `POST /api/appointments/request`
- `GET /api/service-requests`
- `POST /api/service-requests`
- `PATCH /api/service-requests/:id/status`
- `GET /api/documents`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `POST /api/notifications/push-subscriptions`
- `POST /api/notifications/test`
- `GET /api/contact`
- `GET /api/support`
- `POST /api/support/messages`
- `POST /api/auth/forgot-password`

See [FRONTEND_MAP.md](FRONTEND_MAP.md) for the mapping from the current HTML prototype pages to these API endpoints.

## Containers

- `api`: Node.js/Express backend on port `3000`
- `mariadb`: MariaDB 11.4 on port `3306`, persisted in the `mariadb_data` volume

For production, change all passwords and `JWT_SECRET` in `.env`, restrict `CORS_ORIGIN`, and put the API behind TLS.
