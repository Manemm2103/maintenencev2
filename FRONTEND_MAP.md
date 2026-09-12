# Frontend Function Map

Source inspected: `C:\Users\mmueller\Documents\Codex\2026-09-12\hal\maintenance`

## Current frontend behavior

- `login.html` uses `auth.js` and `localStorage` only. Backend replacement: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`.
- `index.html` shows dashboard data: customer greeting, primary property, upcoming appointment, due maintenance and recent history. Backend replacement: `GET /api/dashboard`.
- `maintenance.html` shows one maintenance detail, service history, documents and related appointment. Backend replacement: `GET /api/maintenance`, `GET /api/maintenance/:id`.
- `service.html` captures service type and a short description, then navigates to booking. Backend replacement: `GET /api/service-types`, `POST /api/service-requests`.
- `book.html` captures preferred date, time window and notes. Backend replacement: `POST /api/appointments` or `POST /api/appointments/request`.
- `confirm.html` currently only navigates to success. Backend replacement: submit the stored booking payload to `POST /api/appointments`.
- `success.html` is display-only after request submission.
- `properties.html` lists and switches properties. Backend replacement: `GET /api/properties`, `POST /api/properties/:id/primary`.
- `documents.html` lists property files. Backend replacement: `GET /api/documents`.
- `notifications.html` lists updates. Backend replacement: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.
- `profile.html` displays account contact details. Backend replacement: `GET /api/profile`, `PATCH /api/profile`.
- `support.html` and `contact.html` display DR HOME contact channels. Backend replacement: `GET /api/support`, `GET /api/contact`, `POST /api/support/messages`.
- `push-setup.html`, `admin-push-test.html`, `push-test.js` and `sw.js` trigger local browser notifications only. Backend minimum: `POST /api/notifications/push-subscriptions` to store device subscription, `POST /api/notifications/test` to create an in-app test notification.

## Frontend wiring notes

- Store the JWT from login/register in `localStorage`, for example `drhome_token`.
- Replace demo auth checks in `auth.js` with a token check and `/api/auth/me`.
- Add a small API helper that attaches `Authorization: Bearer <token>` to protected calls.
- For `service.html -> book.html -> confirm.html`, persist the draft request in `sessionStorage` until `confirm.html` submits it.
- Real remote push delivery still needs VAPID keys and a web-push sender. The current backend stores subscriptions and test notifications, but does not yet send Web Push messages to browsers.
