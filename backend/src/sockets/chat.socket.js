const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const {
    conversationPopulate,
    messagePopulate,
    userRoom,
    conversationRoom,
} = require("../utils/chat");

const isMember = (conversation, userId) =>
    conversation.members.some((member) => member._id.toString() === userId.toString());

const emitConversationUpdate = (io, conversation) => {
    conversation.members.forEach((member) => {
        io.to(userRoom(member._id.toString())).emit("conversationUpdated", conversation);
    });
};

const registerChatSocket = (io) => {
    io.on("connection", async (socket) => {
        const userId = socket.user._id.toString();

        socket.join(userRoom(userId));

        await User.findByIdAndUpdate(userId, {
            onlineStatus: true,
            lastSeen: new Date(),
        });

        io.emit("userStatusChanged", {
            userId,
            onlineStatus: true,
            lastSeen: new Date().toISOString(),
        });

        socket.on("joinConversation", async ({ conversationId }) => {
            if (!conversationId) {
                return;
            }

            const conversation = await Conversation.findById(conversationId).populate(
                conversationPopulate,
            );

            if (!conversation || !isMember(conversation, userId)) {
                return;
            }

            socket.join(conversationRoom(conversationId));
        });

        socket.on("leaveConversation", ({ conversationId }) => {
            if (!conversationId) {
                return;
            }

            socket.leave(conversationRoom(conversationId));
        });

        socket.on("typingStart", async ({ conversationId }) => {
            const conversation = await Conversation.findById(conversationId).populate(
                conversationPopulate,
            );

            if (!conversation || !isMember(conversation, userId)) {
                return;
            }

            socket.to(conversationRoom(conversationId)).emit("typingStarted", {
                conversationId,
                userId,
                username: socket.user.username,
            });
        });

        socket.on("typingStop", ({ conversationId }) => {
            socket.to(conversationRoom(conversationId)).emit("typingStopped", {
                conversationId,
                userId,
            });
        });

        socket.on("sendMessage", async ({ conversationId, text }) => {
            const trimmedText = text?.trim();

            if (!conversationId || !trimmedText) {
                return;
            }

            let conversation = await Conversation.findById(conversationId).populate(
                conversationPopulate,
            );

            if (!conversation || !isMember(conversation, userId)) {
                return;
            }

            const memberIds = conversation.members.map((member) => member._id);

            let message = await Message.create({
                conversation: conversationId,
                sender: userId,
                text: trimmedText,
                messageType: "text",
                readBy: [userId],
                deliveredTo: memberIds,
            });

            message = await message.populate(messagePopulate);

            conversation = await Conversation.findByIdAndUpdate(
                conversationId,
                {
                    lastMessage: message._id,
                    updatedAt: new Date(),
                },
                { new: true, timestamps: false },
            ).populate(conversationPopulate);

            io.to(conversationRoom(conversationId)).emit("newMessage", message);
            emitConversationUpdate(io, conversation);
            io.to(conversationRoom(conversationId)).emit("typingStopped", {
                conversationId,
                userId,
            });
        });

        socket.on("markMessageRead", async ({ conversationId, messageId }) => {
            if (!conversationId || !messageId) {
                return;
            }

            const conversation = await Conversation.findById(conversationId).populate(
                conversationPopulate,
            );

            if (!conversation || !isMember(conversation, userId)) {
                return;
            }

            await Message.findByIdAndUpdate(messageId, {
                $addToSet: {
                    readBy: userId,
                },
            });

            io.to(conversationRoom(conversationId)).emit("messageRead", {
                conversationId,
                messageId,
                userId,
            });
        });

        socket.on("disconnect", async () => {
            const lastSeen = new Date();

            await User.findByIdAndUpdate(userId, {
                onlineStatus: false,
                lastSeen,
            });

            io.emit("userStatusChanged", {
                userId,
                onlineStatus: false,
                lastSeen: lastSeen.toISOString(),
            });
        });
    });
};

module.exports = registerChatSocket;
