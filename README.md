# RasoiHub

RasoiHub is a full-stack restaurant booking app with a static frontend served by an Express backend and data stored in MongoDB.

## Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Auth: JWT + bcrypt

## Local setup

1. Install dependencies:

```bash
npm run build
```

2. Copy `.env.example` to `.env` and update the values.

3. Start the app:

```bash
npm start
```

4. Open [http://localhost:5000](http://localhost:5000).

## Environment variables

- `PORT`: Port for the web server.
- `MONGO_URI`: MongoDB connection string.
- `MONGO_DB_NAME`: Database name used by the application. Default is `rasoihub`.
- `JWT_SECRET`: Secret used to sign login tokens.
- `CLIENT_ORIGIN`: Optional comma-separated list of allowed origins for cross-origin requests.
- `NODE_ENV`: Use `production` on Render.

## Render deployment

### Option 1: Blueprint deploy with `render.yaml`

1. Push this repo to GitHub.
2. In Render, choose `New +` -> `Blueprint`.
3. Select the GitHub repository.
4. Render will load `render.yaml`.
5. Add the `MONGO_URI`, `MONGO_DB_NAME`, `JWT_SECRET`, and `CLIENT_ORIGIN` environment values when prompted.

### Option 2: Manual web service

Use these settings:

- Runtime: `Node`
- Build Command: `npm run build`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Set these environment variables:

- `NODE_ENV=production`
- `MONGO_URI=<your mongodb atlas uri>`
- `MONGO_DB_NAME=rasoihub`
- `JWT_SECRET=<long random secret>`
- `CLIENT_ORIGIN=https://your-render-domain.onrender.com`

## MongoDB Atlas setup

1. Create a free cluster in MongoDB Atlas.
2. Create a database user with read/write access.
3. In `Network Access`, allow Render to connect.
   If you are just getting started, Atlas commonly uses `0.0.0.0/0` for development access, but tighten this later if you can.
4. Copy the connection string and replace `<password>` and database name:

```text
mongodb+srv://<username>:<password>@<cluster-url>/rasoihub?retryWrites=true&w=majority&appName=RasoiHub
```

5. Add that string to Render as `MONGO_URI`.
6. Set `MONGO_DB_NAME=rasoihub` in Render.

## Production notes

- The app now requires `MONGO_URI` and `JWT_SECRET` in production.
- The app targets the `rasoihub` database in production via `MONGO_DB_NAME`.
- Static frontend files are served by the same Node service, so no separate frontend hosting is required.
- Users can now update their profile, change their password, create bookings, edit bookings, and delete bookings against MongoDB-backed APIs.

## API health check

- `GET /api/health`

Returns the app environment and Mongo connection state.
