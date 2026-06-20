import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService, AuthUser } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { UserService } from '../../services/user.service';
import {
  ChatMessage,
  ChatUser,
  Conversation,
  MessageReadEvent,
  UserStatusEvent,
} from '../../models/chat.models';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat implements OnInit, OnDestroy {
  @Input() currentUser: AuthUser | null = null;
  @Output() logoutClicked = new EventEmitter<void>();
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  searchTerm = '';
  messageText = '';
  groupName = '';
  renameGroupName = '';
  statusMessage = '';
  errorMessage = '';
  typingText = '';

  users: ChatUser[] = [];
  conversations: Conversation[] = [];
  messages: ChatMessage[] = [];
  selectedConversation: Conversation | null = null;

  showUserPicker = false;
  showGroupCreator = false;
  showGroupDetails = false;
  mobileConversationView = false;
  openingPrivateChatUserId: string | null = null;

  selectedGroupMemberIds = new Set<string>();
  selectedAdditionalMemberIds = new Set<string>();

  private readonly subscriptions = new Subscription();
  private typingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeConversationRoomId: string | null = null;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private userService: UserService,
    private socketService: SocketService,
  ) {}

  ngOnInit(): void {
    this.currentUser ??= this.authService.getUser();
    this.socketService.connect();
    this.bindSocketEvents();
    this.loadSidebarData();
  }

  get filteredConversations(): Conversation[] {
    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.conversations;
    }

    return this.conversations.filter((conversation) => {
      const name = this.getConversationName(conversation).toLowerCase();
      const preview = this.getConversationPreview(conversation).toLowerCase();
      return name.includes(search) || preview.includes(search);
    });
  }

  get filteredUsers(): ChatUser[] {
    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.users;
    }

    return this.users.filter((user) =>
      `${user.username} ${user.email}`.toLowerCase().includes(search),
    );
  }

  get availableMembersToAdd(): ChatUser[] {
    if (!this.selectedConversation) {
      return [];
    }

    const currentMemberIds = new Set(this.selectedConversation.members.map((member) => member._id));
    return this.users.filter((user) => !currentMemberIds.has(user._id));
  }

  get isCurrentUserAdmin(): boolean {
    if (!this.selectedConversation || !this.currentUser) {
      return false;
    }

    return this.selectedConversation.admins.some((admin) => admin._id === this.currentUser?.id);
  }

  toggleUserPicker(): void {
    this.showUserPicker = !this.showUserPicker;
    this.showGroupCreator = false;
    this.errorMessage = '';
  }

  toggleGroupCreator(): void {
    this.showGroupCreator = !this.showGroupCreator;
    this.showUserPicker = false;
    this.errorMessage = '';
  }

  toggleGroupDetails(): void {
    this.showGroupDetails = !this.showGroupDetails;
    this.errorMessage = '';
  }

  openGroupManagement(): void {
    this.showGroupDetails = true;
    this.errorMessage = '';
    this.statusMessage = '';
  }

  closeGroupManagement(): void {
    this.showGroupDetails = false;
    this.errorMessage = '';
  }

  toggleGroupMember(userId: string): void {
    if (this.selectedGroupMemberIds.has(userId)) {
      this.selectedGroupMemberIds.delete(userId);
    } else {
      this.selectedGroupMemberIds.add(userId);
    }
  }

  toggleAdditionalMember(userId: string): void {
    if (this.selectedAdditionalMemberIds.has(userId)) {
      this.selectedAdditionalMemberIds.delete(userId);
    } else {
      this.selectedAdditionalMemberIds.add(userId);
    }
  }

  startPrivateChat(user: ChatUser): void {
    this.errorMessage = '';
    this.statusMessage = '';

    const existingConversation = this.conversations.find(
      (conversation) =>
        conversation.type === 'private' &&
        conversation.members.some((member) => member._id === user._id),
    );

    if (existingConversation) {
      this.showUserPicker = false;
      this.selectConversation(existingConversation);
      return;
    }

    this.openingPrivateChatUserId = user._id;

    this.subscriptions.add(
      this.chatService.getOrCreatePrivateConversation(user._id).subscribe({
        next: (conversation) => {
          this.openingPrivateChatUserId = null;
          this.upsertConversation(conversation);
          this.showUserPicker = false;
          this.statusMessage = `Chat ready with ${user.username}`;
          this.selectConversation(conversation);
        },
        error: (error) => {
          this.openingPrivateChatUserId = null;
          this.errorMessage = error.error?.message || 'Unable to open private chat';
        },
      }),
    );
  }

  createGroup(): void {
    this.errorMessage = '';

    if (!this.groupName.trim()) {
      this.errorMessage = 'Group name is required';
      return;
    }

    if (!this.selectedGroupMemberIds.size) {
      this.errorMessage = 'Select at least one member';
      return;
    }

    this.subscriptions.add(
      this.chatService
        .createGroupConversation(this.groupName.trim(), [...this.selectedGroupMemberIds])
        .subscribe({
          next: (conversation) => {
            this.upsertConversation(conversation);
            this.groupName = '';
            this.selectedGroupMemberIds.clear();
            this.showGroupCreator = false;
            this.statusMessage = 'Group created successfully';
            this.selectConversation(conversation);
          },
          error: (error) => {
            this.errorMessage = error.error?.message || 'Unable to create group';
          },
        }),
    );
  }

  selectConversation(conversation: Conversation): void {
    this.statusMessage = '';
    this.errorMessage = '';
    this.messageText = '';
    this.typingText = '';
    this.showGroupDetails = false;
    this.renameGroupName = conversation.name;

    if (this.activeConversationRoomId && this.activeConversationRoomId !== conversation._id) {
      this.socketService.leaveConversation(this.activeConversationRoomId);
    }

    this.activeConversationRoomId = conversation._id;
    this.selectedConversation = {
      ...conversation,
      unreadCount: 0,
    };
    this.mobileConversationView = true;
    this.socketService.joinConversation(conversation._id);
    this.upsertConversation(this.selectedConversation);

    this.subscriptions.add(
      this.chatService.getMessages(conversation._id).subscribe({
        next: (messages) => {
          this.messages = messages;
          this.markVisibleMessagesAsRead();
          this.scrollMessagesToBottom();
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Unable to load messages';
        },
      }),
    );
  }

  sendMessage(): void {
    const trimmedMessage = this.messageText.trim();

    if (!this.selectedConversation) {
      this.errorMessage = 'Select a conversation first';
      return;
    }

    if (!trimmedMessage) {
      this.errorMessage = 'Message cannot be empty';
      return;
    }

    this.socketService.sendMessage(this.selectedConversation._id, trimmedMessage);
    this.messageText = '';
    this.stopTyping();
  }

  handleComposerChange(): void {
    if (!this.selectedConversation) {
      return;
    }

    if (!this.messageText.trim()) {
      this.stopTyping();
      return;
    }

    this.socketService.startTyping(this.selectedConversation._id);

    if (this.typingTimeoutId) {
      clearTimeout(this.typingTimeoutId);
    }

    this.typingTimeoutId = setTimeout(() => {
      this.stopTyping();
    }, 1200);
  }

  renameSelectedGroup(): void {
    if (!this.selectedConversation) {
      return;
    }

    if (!this.renameGroupName.trim()) {
      this.errorMessage = 'Group name is required';
      return;
    }

    this.subscriptions.add(
      this.chatService.renameGroup(this.selectedConversation._id, this.renameGroupName.trim()).subscribe({
        next: (conversation) => {
          this.statusMessage = 'Group renamed';
          this.upsertConversation(conversation);
          this.selectedConversation = conversation;
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Unable to rename group';
        },
      }),
    );
  }

  addSelectedMembers(): void {
    if (!this.selectedConversation || !this.selectedAdditionalMemberIds.size) {
      return;
    }

    this.subscriptions.add(
      this.chatService
        .addMembers(this.selectedConversation._id, [...this.selectedAdditionalMemberIds])
        .subscribe({
          next: (conversation) => {
            this.selectedAdditionalMemberIds.clear();
            this.statusMessage = 'Members added';
            this.upsertConversation(conversation);
            this.selectedConversation = conversation;
          },
          error: (error) => {
            this.errorMessage = error.error?.message || 'Unable to add members';
          },
        }),
    );
  }

  removeMember(memberId: string): void {
    if (!this.selectedConversation) {
      return;
    }

    this.subscriptions.add(
      this.chatService.removeMember(this.selectedConversation._id, memberId).subscribe({
        next: (conversation) => {
          this.statusMessage = 'Member removed';
          this.upsertConversation(conversation);
          this.selectedConversation = conversation;
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Unable to remove member';
        },
      }),
    );
  }

  leaveCurrentGroup(): void {
    if (!this.selectedConversation) {
      return;
    }

    const conversationId = this.selectedConversation._id;

    this.subscriptions.add(
      this.chatService.leaveGroup(conversationId).subscribe({
        next: () => {
          this.removeConversation(conversationId);
          this.selectedConversation = null;
          this.messages = [];
          this.showGroupDetails = false;
          this.mobileConversationView = false;
          this.statusMessage = 'You left the group';
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Unable to leave group';
        },
      }),
    );
  }

  backToSidebar(): void {
    if (this.showGroupDetails) {
      this.closeGroupManagement();
      return;
    }

    this.mobileConversationView = false;
  }

  logout(): void {
    this.socketService.disconnect();
    this.logoutClicked.emit();
  }

  getConversationName(conversation: Conversation): string {
    if (conversation.type === 'group') {
      return conversation.name;
    }

    return this.getOtherParticipant(conversation)?.username || 'Direct chat';
  }

  getConversationPreview(conversation: Conversation): string {
    if (!conversation.lastMessage) {
      return conversation.type === 'group' ? 'Group created' : 'Start the conversation';
    }

    if (conversation.lastMessage.messageType === 'system') {
      return conversation.lastMessage.text;
    }

    const prefix =
      conversation.lastMessage.sender._id === this.currentUser?.id
        ? 'You: '
        : `${conversation.lastMessage.sender.username}: `;

    return `${prefix}${conversation.lastMessage.text}`;
  }

  getConversationTimestamp(conversation: Conversation): string {
    return this.formatTime(conversation.lastMessage?.createdAt || conversation.updatedAt);
  }

  getConversationUnreadCount(conversation: Conversation): number {
    return conversation.unreadCount ?? 0;
  }

  hasUnreadMessages(conversation: Conversation): boolean {
    return this.getConversationUnreadCount(conversation) > 0;
  }

  getMemberSubtitle(conversation: Conversation): string {
    if (conversation.type === 'group') {
      return `${conversation.members.length} members`;
    }

    const otherParticipant = this.getOtherParticipant(conversation);

    if (!otherParticipant) {
      return '';
    }

    if (otherParticipant.onlineStatus) {
      return 'Online';
    }

    if (otherParticipant.lastSeen) {
      return `Last seen ${this.formatLastSeen(otherParticipant.lastSeen)}`;
    }

    return 'Offline';
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.sender._id === this.currentUser?.id;
  }

  isSystemMessage(message: ChatMessage): boolean {
    return message.messageType === 'system';
  }

  getAvatarLetter(label: string): string {
    return label.slice(0, 1).toUpperCase();
  }

  getWelcomeMessage(): string {
    return this.currentUser?.username ? `Welcome back, ${this.currentUser.username}` : 'Welcome back';
  }

  formatMessageTime(value: string): string {
    return this.formatTime(value);
  }

  ngOnDestroy(): void {
    this.stopTyping();
    if (this.activeConversationRoomId) {
      this.socketService.leaveConversation(this.activeConversationRoomId);
    }
    this.subscriptions.unsubscribe();
    this.socketService.disconnect();
  }

  private loadSidebarData(): void {
    this.subscriptions.add(
      this.userService.getUsers().subscribe({
        next: (users) => {
          this.users = users;
        },
        error: () => {
          this.errorMessage = 'Unable to load users';
        },
      }),
    );

    this.subscriptions.add(
      this.chatService.getConversations().subscribe({
        next: (conversations) => {
          this.conversations = this.sortConversations(conversations);
        },
        error: () => {
          this.errorMessage = 'Unable to load conversations';
        },
      }),
    );
  }

  private bindSocketEvents(): void {
    this.subscriptions.add(
      this.socketService.newMessage$.subscribe((message) => {
        if (message.conversation === this.selectedConversation?._id && !this.hasMessage(message._id)) {
          this.messages = [...this.messages, message];
          this.markMessageAsReadIfNeeded(message);
          this.scrollMessagesToBottom();
          return;
        }

        if (message.sender._id !== this.currentUser?.id) {
          this.incrementUnreadCount(message.conversation);
        }
      }),
    );

    this.subscriptions.add(
      this.socketService.conversationUpdated$.subscribe((conversation) => {
        this.upsertConversation(conversation, true);

        if (this.selectedConversation?._id === conversation._id) {
          this.selectedConversation = {
            ...conversation,
            unreadCount: 0,
          };
          this.renameGroupName = conversation.name;
        }
      }),
    );

    this.subscriptions.add(
      this.socketService.typingStarted$.subscribe((event) => {
        if (
          event.conversationId === this.selectedConversation?._id &&
          event.userId !== this.currentUser?.id
        ) {
          this.typingText = `${event.username || 'Someone'} is typing...`;
        }
      }),
    );

    this.subscriptions.add(
      this.socketService.typingStopped$.subscribe((event) => {
        if (event.conversationId === this.selectedConversation?._id) {
          this.typingText = '';
        }
      }),
    );

    this.subscriptions.add(
      this.socketService.userStatus$.subscribe((event) => {
        this.applyUserStatus(event);
      }),
    );

    this.subscriptions.add(
      this.socketService.messageRead$.subscribe((event) => {
        this.applyReadReceipt(event);
      }),
    );

    this.subscriptions.add(
      this.socketService.connectionError$.subscribe((message) => {
        this.errorMessage = message || 'Socket connection failed';
      }),
    );
  }

  private upsertConversation(
    conversation: Conversation,
    isIncomingSocketUpdate = false,
  ): void {
    const existingIndex = this.conversations.findIndex((item) => item._id === conversation._id);
    const normalizedConversation = this.normalizeConversation(
      conversation,
      isIncomingSocketUpdate,
    );

    if (existingIndex === -1) {
      this.conversations = this.sortConversations([normalizedConversation, ...this.conversations]);
      return;
    }

    const nextConversations = [...this.conversations];
    nextConversations[existingIndex] = normalizedConversation;
    this.conversations = this.sortConversations(nextConversations);
  }

  private removeConversation(conversationId: string): void {
    this.conversations = this.conversations.filter((conversation) => conversation._id !== conversationId);
  }

  private sortConversations(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((first, second) => {
      const firstDate = first.lastMessage?.createdAt || first.updatedAt;
      const secondDate = second.lastMessage?.createdAt || second.updatedAt;
      return new Date(secondDate).getTime() - new Date(firstDate).getTime();
    });
  }

  private getOtherParticipant(conversation: Conversation): ChatUser | undefined {
    return conversation.members.find((member) => member._id !== this.currentUser?.id);
  }

  private stopTyping(): void {
    if (this.typingTimeoutId) {
      clearTimeout(this.typingTimeoutId);
      this.typingTimeoutId = null;
    }

    if (this.selectedConversation) {
      this.socketService.stopTyping(this.selectedConversation._id);
    }
  }

  private hasMessage(messageId: string): boolean {
    return this.messages.some((message) => message._id === messageId);
  }

  private markVisibleMessagesAsRead(): void {
    this.messages.forEach((message) => this.markMessageAsReadIfNeeded(message));
  }

  private markMessageAsReadIfNeeded(message: ChatMessage): void {
    if (message.sender._id === this.currentUser?.id || !this.selectedConversation) {
      return;
    }

    const alreadyRead = message.readBy.some((user) => user._id === this.currentUser?.id);

    if (!alreadyRead) {
      this.socketService.markMessageRead(this.selectedConversation._id, message._id);
    }
  }

  private incrementUnreadCount(conversationId: string): void {
    this.conversations = this.conversations.map((conversation) =>
      conversation._id === conversationId
        ? {
            ...conversation,
            unreadCount: this.getConversationUnreadCount(conversation) + 1,
          }
        : conversation,
    );
  }

  private applyUserStatus(event: UserStatusEvent): void {
    this.users = this.users.map((user) =>
      user._id === event.userId
        ? { ...user, onlineStatus: event.onlineStatus, lastSeen: event.lastSeen }
        : user,
    );

    this.conversations = this.conversations.map((conversation) => ({
      ...conversation,
      members: conversation.members.map((member) =>
        member._id === event.userId
          ? { ...member, onlineStatus: event.onlineStatus, lastSeen: event.lastSeen }
          : member,
      ),
      admins: conversation.admins.map((admin) =>
        admin._id === event.userId
          ? { ...admin, onlineStatus: event.onlineStatus, lastSeen: event.lastSeen }
          : admin,
      ),
    }));

    if (this.selectedConversation) {
      const updatedConversation = this.conversations.find(
        (conversation) => conversation._id === this.selectedConversation?._id,
      );

      if (updatedConversation) {
        this.selectedConversation = updatedConversation;
      }
    }
  }

  private applyReadReceipt(event: MessageReadEvent): void {
    if (event.conversationId !== this.selectedConversation?._id) {
      return;
    }

    this.messages = this.messages.map((message) => {
      if (message._id !== event.messageId) {
        return message;
      }

      const alreadyRead = message.readBy.some((user) => user._id === event.userId);

      if (alreadyRead) {
        return message;
      }

      return {
        ...message,
        readBy: [
          ...message.readBy,
          {
            _id: event.userId,
            username: 'Seen',
            email: '',
          },
        ],
      };
    });
  }

  private formatTime(value?: string): string {
    if (!value) {
      return '';
    }

    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatLastSeen(value: string): string {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private normalizeConversation(
    conversation: Conversation,
    isIncomingSocketUpdate = false,
  ): Conversation {
    const existingConversation = this.conversations.find((item) => item._id === conversation._id);
    const isSelectedConversation = this.selectedConversation?._id === conversation._id;
    const hasNewLastMessage =
      !!conversation.lastMessage &&
      conversation.lastMessage._id !== existingConversation?.lastMessage?._id;
    const isIncomingUnreadMessage =
      isIncomingSocketUpdate &&
      hasNewLastMessage &&
      conversation.lastMessage?.sender._id !== this.currentUser?.id &&
      !isSelectedConversation;

    const unreadCount =
      isSelectedConversation
        ? 0
        : isIncomingUnreadMessage
          ? (existingConversation?.unreadCount ?? 0) + 1
        : (conversation.unreadCount ?? existingConversation?.unreadCount ?? 0);

    return {
      ...conversation,
      unreadCount,
    };
  }

  private scrollMessagesToBottom(): void {
    setTimeout(() => {
      const container = this.messagesContainer?.nativeElement;

      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }
}
