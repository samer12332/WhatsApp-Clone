# WhatsApp Clone

A simple full-stack WhatsApp-style chat application built with Node.js, Express, MongoDB, Socket.IO, and Angular.

## Tech Stack

- Backend: Node.js, Express, MongoDB, Mongoose, JWT, Socket.IO
- Frontend: Angular standalone components, RxJS, Socket.IO client, CSS

## Features

- Register and login with JWT authentication
- Restore session after refresh
- Private one-to-one chats
- Group creation and group management
- Real-time messaging with Socket.IO
- Typing status
- Unread message badges
- Group activity notices for add/remove/leave actions
- Responsive chat layout

## Project Structure

```text
.
├── backend
└── frontend
```

## Prerequisites

- Node.js 18+
- npm
- MongoDB running locally or a MongoDB Atlas connection string

## Backend Setup

1. Open the `backend` folder.
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file inside `backend` with:

```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:4200
```

4. Start the backend:

```bash
npm run dev
```

## Frontend Setup

1. Open the `frontend` folder.
2. Install dependencies:

```bash
npm install
```

3. Start the frontend:

```bash
npm start
```

4. Open:

```text
http://localhost:4200
```

## Development Workflow

Run both apps at the same time:

- Backend on `http://localhost:3000`
- Frontend on `http://localhost:4200`

## Useful Commands

Backend:

```bash
npm run dev
npm start
```

Frontend:

```bash
npm start
npm run build
npm test
```

## Manual Test Checklist

- Register a new user
- Login with an existing user
- Refresh and confirm the session stays active
- Start a private chat between two users
- Send and receive private messages in real time
- Create a group
- Add and remove group members
- Open the manage group page
- Confirm unread badges update
- Confirm typing indicator works
- Confirm member add/remove notices appear in the chat

## Notes

- `backend/.env` is ignored by git and should not be committed
- The Angular build may show a CSS budget warning for the chat stylesheet, but the app still builds successfully

## Repository

GitHub: `https://github.com/samer12332/WhatsApp-Clone`
