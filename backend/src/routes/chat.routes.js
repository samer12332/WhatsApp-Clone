const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const {
    getUsers,
    getOrCreatePrivateConversation,
    createGroupConversation,
    getConversations,
    getMessages,
    addMembersToGroup,
    removeMemberFromGroup,
    renameGroup,
    leaveGroup,
} = require("../controllers/chat.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/users", getUsers);
router.get("/conversations", getConversations);
router.get("/conversations/:conversationId/messages", getMessages);
router.post("/conversations/private", getOrCreatePrivateConversation);
router.post("/conversations/group", createGroupConversation);
router.patch("/conversations/:conversationId/members", addMembersToGroup);
router.delete("/conversations/:conversationId/members/:memberId", removeMemberFromGroup);
router.patch("/conversations/:conversationId/name", renameGroup);
router.post("/conversations/:conversationId/leave", leaveGroup);

module.exports = router;
