const jwt = require("jsonwebtoken");
const User = require("../models/User");

const socketAuthMiddleware = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication token is missing"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return next(new Error("User not found"));
        }

        socket.user = user;

        next();
    } catch (error) {
        next(new Error("Authentication failed"));
    }
};

module.exports = socketAuthMiddleware;
