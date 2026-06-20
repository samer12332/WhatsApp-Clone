require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./src/config/db");
const registerChatSocket = require("./src/sockets/chat.socket");

const app = express();

const authRoutes = require("./src/routes/auth.routes");
const chatRoutes = require("./src/routes/chat.routes");

const socketAuthMiddleware = require("./src/middlewares/socketAuth.middleware");

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:4200";

app.use(
    cors({
        origin: CLIENT_URL,
    }),
);

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"],
    },
});

app.set("io", io);

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

app.get("/", (req, res) => {
    res.send("WhatsApp Clone Backend is running");
});

io.use(socketAuthMiddleware);
registerChatSocket(io);

const startServer = async () => {
    await connectDB();

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
};

startServer();
