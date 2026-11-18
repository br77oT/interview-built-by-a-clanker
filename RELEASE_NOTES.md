# Release notes: `codebase-analyzer/fixes-1-mwmgjniy`

Branched from `main` at `325f5e5`.

## ⚠️ Breaking changes and upgrade steps

- **The API needs a `JWT_SECRET` to start.** Copy `apps/api/.env.example` to `apps/api/.env` and set a value of at least 32 characters:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  A variable exported in your shell takes precedence over the file.
- **Authentication is always on.** The `ENFORCE_AUTH` flag is gone. Cart, favorites, checkout and `/auth/me` now need a valid token.
- **Tokens expire after 1 hour.**
- **Passwords from before this release can't be verified.** Passwords are now hashed with scrypt, and older hashes don't match. Users are stored in memory, so in practice this only matters if that changes.
- **Checkout can return 409.** If some items in the cart are no longer available, the API removes them and returns 409 instead of placing a partial order.

## Security

- Removed the switch that skipped authentication by default. A request that fails auth now stops at the 401 and never reaches the route handler.
- Removed the hard-coded JWT secret.
- Replaced the weak 32-bit password hash with salted scrypt and a constant-time comparison.
- Users can no longer delete each other's cart items.
- Signing out now deletes the token from browser storage and clears cached cart and favorites, so the next user doesn't see the previous user's data.
- `/auth/me` returns 401 instead of 404 when the account no longer exists, so the client drops the token.

## Bug fixes

**API**

- The `minPrice` filter returned the wrong personas because its comparison was reversed.
- A non-numeric price filter, such as `?minPrice=abc`, emptied the list. It's now ignored.
- Checkout didn't empty the cart afterwards, and silently left out unavailable items.
- `POST /favorites` crashed when the request had no body. It now returns 400.
- The login response was missing `username`, so it didn't match register.
- Cross-origin requests blocked `DELETE`.

**Web**

- Prices were shown multiplied by 100.
- Changing search filters didn't reload the persona list.
- A price filter of 0 was dropped.
- The favorite button did the opposite of what you clicked.
- Signed-out visitors triggered failing favorites requests.
- The navbar cart badge didn't update after cart changes.
- Cart quantity could be set below 1, and failed cart updates showed no error.
- Several partial-star ratings on one page broke each other's display.
- Empty (204) responses caused errors in the API client.
- The favorite button now has an accessible name.

## Developer experience

- `pnpm test` runs both test suites:
  - **API:** 37 tests (node:test).
  - **Web:** 16 tests (Vitest). They render the real app in jsdom against the real API in-process, so no server needs to be running.
- To confirm the tests catch the bugs, each fixed bug was put back one at a time. Every one made at least one test fail.
- The API server setup is now in `buildApp()` (`apps/api/src/app.ts`), so tests can run against it without starting a server.
- Turbo now passes `JWT_SECRET` through to the dev and test tasks.

## Known issues (not addressed)

- `apps/web` typecheck fails on one error (TS4023) in the generated `routeTree.gen.ts`. It fails the same way on `main`.
- The API listens on `0.0.0.0`, so other machines on the network can reach it.
- The token is still stored in `localStorage`.
- Response and error formats are inconsistent across endpoints.
- Password hashing blocks the server for a moment on each login and register.
