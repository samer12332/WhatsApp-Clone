const conversationPopulate = [
    {
        path: "members",
        select: "username email avatar onlineStatus lastSeen",
    },
    {
        path: "admins",
        select: "username email avatar onlineStatus lastSeen",
    },
    {
        path: "lastMessage",
        populate: {
            path: "sender",
            select: "username email avatar",
        },
    },
];

const messagePopulate = [
    {
        path: "sender",
        select: "username email avatar onlineStatus lastSeen",
    },
    {
        path: "readBy",
        select: "username email avatar",
    },
    {
        path: "deliveredTo",
        select: "username email avatar",
    },
];

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

module.exports = {
    conversationPopulate,
    messagePopulate,
    userRoom,
    conversationRoom,
};
