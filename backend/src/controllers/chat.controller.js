const mongoose = require("mongoose");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { conversationPopulate, messagePopulate } = require("../utils/chat");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const populateConversationDocument = async (conversation) =>
    conversation.populate(conversationPopulate);

const ensureConversationMember = (conversation, userId) =>
    conversation.members.some((member) => member._id.toString() === userId.toString());

const ensureConversationAdmin = (conversation, userId) =>
    conversation.admins.some((admin) => admin._id.toString() === userId.toString());

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

const attachUnreadCounts = async (conversations, userId) => {
    const conversationIds = conversations.map((conversation) => conversation._id);

    if (!conversationIds.length) {
        return [];
    }

    const unreadCounts = await Message.aggregate([
        {
            $match: {
                conversation: { $in: conversationIds },
                sender: { $ne: userId },
                readBy: { $ne: userId },
            },
        },
        {
            $group: {
                _id: "$conversation",
                unreadCount: { $sum: 1 },
            },
        },
    ]);

    const unreadMap = new Map(
        unreadCounts.map((item) => [item._id.toString(), item.unreadCount]),
    );

    return conversations.map((conversation) => {
        const conversationObject = conversation.toObject
            ? conversation.toObject()
            : conversation;

        return {
            ...conversationObject,
            unreadCount: unreadMap.get(conversation._id.toString()) || 0,
        };
    });
};

const emitConversationUpdate = (io, conversation) => {
    conversation.members.forEach((member) => {
        io.to(userRoom(member._id.toString())).emit("conversationUpdated", conversation);
    });
};

const createSystemMessage = async ({
    io,
    conversation,
    actorId,
    text,
}) => {
    const memberIds = conversation.members.map((member) => member._id);

    let message = await Message.create({
        conversation: conversation._id,
        sender: actorId,
        text,
        messageType: "system",
        readBy: [actorId],
        deliveredTo: memberIds,
    });

    message = await message.populate(messagePopulate);

    const updatedConversation = await Conversation.findByIdAndUpdate(
        conversation._id,
        {
            lastMessage: message._id,
            updatedAt: new Date(),
        },
        { new: true, timestamps: false },
    ).populate(conversationPopulate);

    io.to(conversationRoom(conversation._id.toString())).emit("newMessage", message);
    emitConversationUpdate(io, updatedConversation);

    return updatedConversation;
};

const getUsers = async (req, res) => {
    const users = await User.find({
        _id: { $ne: req.user._id },
    })
        .select("-password")
        .sort({ username: 1 });

    return res.status(200).json({ users });
};

const getOrCreatePrivateConversation = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!isValidObjectId(userId)) {
            return res.status(400).json({ message: "A valid user id is required" });
        }

        if (userId === req.user._id.toString()) {
            return res.status(400).json({ message: "You cannot chat with yourself" });
        }

        const otherUser = await User.findById(userId);

        if (!otherUser) {
            return res.status(404).json({ message: "User not found" });
        }

        let conversation = await Conversation.findOne({
            type: "private",
            members: {
                $all: [req.user._id, userId],
                $size: 2,
            },
        }).populate(conversationPopulate);

        if (!conversation) {
            conversation = await Conversation.create({
                type: "private",
                members: [req.user._id, userId],
                admins: [],
            });

            conversation = await populateConversationDocument(conversation);
        }

        const [conversationWithUnread] = await attachUnreadCounts(
            [conversation],
            req.user._id,
        );

        return res.status(200).json({ conversation: conversationWithUnread });
    } catch (error) {
        return res.status(500).json({
            message: "Unable to open private chat",
            error: error.message,
        });
    }
};

const createGroupConversation = async (req, res) => {
    const { name, memberIds = [] } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: "Group name is required" });
    }

    const validIds = [...new Set(memberIds.filter((id) => isValidObjectId(id)))];
    const members = [...new Set([req.user._id.toString(), ...validIds])];

    if (members.length < 2) {
        return res.status(400).json({
            message: "Select at least one other member for the group",
        });
    }

    const conversation = await Conversation.create({
        type: "group",
        name: name.trim(),
        members,
        admins: [req.user._id],
    });

    const populatedConversation = await populateConversationDocument(conversation);

    const [conversationWithUnread] = await attachUnreadCounts(
        [populatedConversation],
        req.user._id,
    );

    return res.status(201).json({ conversation: conversationWithUnread });
};

const getConversations = async (req, res) => {
    const conversations = await Conversation.find({
        members: req.user._id,
    })
        .populate(conversationPopulate)
        .sort({ updatedAt: -1 });

    const conversationsWithUnread = await attachUnreadCounts(
        conversations,
        req.user._id,
    );

    return res.status(200).json({ conversations: conversationsWithUnread });
};

const getMessages = async (req, res) => {
    const { conversationId } = req.params;

    if (!isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId).populate(
        conversationPopulate,
    );

    if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
    }

    if (!ensureConversationMember(conversation, req.user._id)) {
        return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({
        conversation: conversationId,
    })
        .populate(messagePopulate)
        .sort({ createdAt: 1 });

    return res.status(200).json({ messages });
};

const addMembersToGroup = async (req, res) => {
    const { conversationId } = req.params;
    const { memberIds = [] } = req.body;

    if (!isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (!memberIds.length) {
        return res.status(400).json({ message: "Select at least one member" });
    }

    let conversation = await Conversation.findById(conversationId).populate(
        conversationPopulate,
    );

    if (!conversation || conversation.type !== "group") {
        return res.status(404).json({ message: "Group conversation not found" });
    }

    if (!ensureConversationAdmin(conversation, req.user._id)) {
        return res.status(403).json({ message: "Only group admins can add members" });
    }

    const validIds = [...new Set(memberIds.filter((id) => isValidObjectId(id)))];
    const usersToAdd = await User.find({
        _id: { $in: validIds },
    }).select("username");

    conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
            $addToSet: {
                members: { $each: validIds },
            },
        },
        { new: true },
    ).populate(conversationPopulate);

    const addedUsers = usersToAdd.filter((user) =>
        conversation.members.some((member) => member._id.toString() === user._id.toString()),
    );

    if (addedUsers.length) {
        const names = addedUsers.map((user) => user.username).join(", ");
        conversation = await createSystemMessage({
            io: req.app.get("io"),
            conversation,
            actorId: req.user._id,
            text: `${req.user.username} added ${names}`,
        });
    }

    const [conversationWithUnread] = await attachUnreadCounts(
        [conversation],
        req.user._id,
    );

    return res.status(200).json({ conversation: conversationWithUnread });
};

const removeMemberFromGroup = async (req, res) => {
    const { conversationId, memberId } = req.params;

    if (!isValidObjectId(conversationId) || !isValidObjectId(memberId)) {
        return res.status(400).json({ message: "Invalid request" });
    }

    let conversation = await Conversation.findById(conversationId).populate(
        conversationPopulate,
    );

    if (!conversation || conversation.type !== "group") {
        return res.status(404).json({ message: "Group conversation not found" });
    }

    if (!ensureConversationAdmin(conversation, req.user._id)) {
        return res
            .status(403)
            .json({ message: "Only group admins can remove members" });
    }

    const memberToRemove = conversation.members.find(
        (member) => member._id.toString() === memberId,
    );

    conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
            $pull: {
                members: memberId,
                admins: memberId,
            },
        },
        { new: true },
    ).populate(conversationPopulate);

    if (memberToRemove) {
        conversation = await createSystemMessage({
            io: req.app.get("io"),
            conversation,
            actorId: req.user._id,
            text: `${req.user.username} removed ${memberToRemove.username}`,
        });
    }

    const [conversationWithUnread] = await attachUnreadCounts(
        [conversation],
        req.user._id,
    );

    return res.status(200).json({ conversation: conversationWithUnread });
};

const renameGroup = async (req, res) => {
    const { conversationId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: "Group name is required" });
    }

    let conversation = await Conversation.findById(conversationId).populate(
        conversationPopulate,
    );

    if (!conversation || conversation.type !== "group") {
        return res.status(404).json({ message: "Group conversation not found" });
    }

    if (!ensureConversationAdmin(conversation, req.user._id)) {
        return res
            .status(403)
            .json({ message: "Only group admins can rename the group" });
    }

    conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
            name: name.trim(),
        },
        { new: true },
    ).populate(conversationPopulate);

    const [conversationWithUnread] = await attachUnreadCounts(
        [conversation],
        req.user._id,
    );

    return res.status(200).json({ conversation: conversationWithUnread });
};

const leaveGroup = async (req, res) => {
    const { conversationId } = req.params;

    let conversation = await Conversation.findById(conversationId).populate(
        conversationPopulate,
    );

    if (!conversation || conversation.type !== "group") {
        return res.status(404).json({ message: "Group conversation not found" });
    }

    if (!ensureConversationMember(conversation, req.user._id)) {
        return res.status(403).json({ message: "Access denied" });
    }

    const remainingMembers = conversation.members.filter(
        (member) => member._id.toString() !== req.user._id.toString(),
    );

    if (!remainingMembers.length) {
        await Message.deleteMany({ conversation: conversationId });
        await Conversation.findByIdAndDelete(conversationId);

        return res.status(200).json({
            message: "You left the group",
            deletedConversationId: conversationId,
        });
    }

    const remainingAdmins = conversation.admins.filter(
        (admin) => admin._id.toString() !== req.user._id.toString(),
    );

    const nextAdmins = remainingAdmins.length
        ? remainingAdmins.map((admin) => admin._id)
        : [remainingMembers[0]._id];

    conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
            members: remainingMembers.map((member) => member._id),
            admins: nextAdmins,
        },
        { new: true },
    ).populate(conversationPopulate);

    conversation = await createSystemMessage({
        io: req.app.get("io"),
        conversation,
        actorId: req.user._id,
        text: `${req.user.username} left the group`,
    });

    return res.status(200).json({
        message: "You left the group",
        conversation: (
            await attachUnreadCounts([conversation], req.user._id)
        )[0],
    });
};

module.exports = {
    getUsers,
    getOrCreatePrivateConversation,
    createGroupConversation,
    getConversations,
    getMessages,
    addMembersToGroup,
    removeMemberFromGroup,
    renameGroup,
    leaveGroup,
};
