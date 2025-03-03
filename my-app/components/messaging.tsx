"use client";

import { useState, useEffect } from "react";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { Sidebar } from "./sidebar";
import { ConversationHeader } from "./conversation-header";
import type { User, Message, Channel, DirectMessage } from "@/lib/types";
import { useWebSocket } from "@/lib/use-websocket";
import { CreateChannelDialog } from "./create-channel-dialog";
import { CreateDirectMessageDialog } from "./create-direct-message-dialog";
import { ChannelInviteDialog } from "./channel-invite-dialog";

export function Messaging() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversation, setActiveConversation] = useState<
    Channel | DirectMessage | null
  >(null);
  const [users, setUsers] = useState<User[]>([]);

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateDM, setShowCreateDM] = useState(false);
  const [showChannelInvite, setShowChannelInvite] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const channelId = "67c4ddbd9ef42e1c0eb7c343";

  // WebSocket connection and handlers
  const { connected, sendMessage, lastMessage, connect, disconnect } =
    useWebSocket();

  // Initialize connection and fetch initial data
  useEffect(() => {
    // Connect to WebSocket server using a secure WebSocket URL
    connect("http://localhost:8080");

    // Fetch initial data
    fetchCurrentUser();
    fetchChannels();
    fetchDirectMessages();
    fetchUsers();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);

        switch (data.type) {
          case "NEW_MESSAGE":
            handleNewMessage(data.payload);
            break;
          case "CHANNEL_CREATED":
            handleChannelCreated(data.payload);
            break;
          case "DIRECT_MESSAGE_CREATED":
            handleDirectMessageCreated(data.payload);
            break;
          case "USER_STATUS_CHANGED":
            handleUserStatusChanged(data.payload);
            break;
          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    }
  }, [lastMessage]);

  // Helper function to handle API responses
  const handleApiResponse = async (response: Response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error (${response.status}): ${text}`);
    }
    return response.json();
  };

  // API calls to fetch data
  const fetchCurrentUser = async () => {
    try {
      const response = await fetch("http://localhost:8080/api/user/current");
      const data = await handleApiResponse(response);
      setCurrentUser(data);
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await fetch("/api/channels");
      const data = await handleApiResponse(response);
      setChannels(data);

      // Set first channel as active if no active conversation
      if (data.length > 0 && !activeConversation) {
        setActiveConversation(data[0]);
        fetchMessages(data[0].id, "channel");
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    }
  };

  const fetchDirectMessages = async () => {
    try {
      const response = await fetch("/api/direct-messages");
      const data = await handleApiResponse(response);
      setDirectMessages(data);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      const data = await handleApiResponse(response);
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchMessages = async (
    conversationId: string,
    type: "channel" | "direct"
  ) => {
    try {
      const endpoint =
        type === "channel"
          ? `http://localhost:8080/api/messages/channel/${channelId}`
          : `/api/direct-messages/${conversationId}/messages`;

      const response = await fetch(endpoint);
      const data = await handleApiResponse(response);
      setMessages(data);
    } catch (error) {
      console.error(
        `Error fetching messages for ${type} ${conversationId}:`,
        error
      );
    }
  };

  // WebSocket message handlers
  const handleNewMessage = (message: Message) => {
    // Check if message belongs to active conversation
    const isActiveChannel =
      activeConversation?.type === "channel" &&
      activeConversation.id === message.channelId;

    const isActiveDM =
      activeConversation?.type === "direct" &&
      activeConversation.id === message.directMessageId;

    if (isActiveChannel || isActiveDM) {
      setMessages((prev) => [...prev, message]);
    }

    // Update unread count for non-active conversations
    if (message.channelId) {
      setChannels((prev) =>
        prev.map((channel) => {
          if (channel.id === message.channelId && !isActiveChannel) {
            return { ...channel, unreadCount: channel.unreadCount + 1 };
          }
          return channel;
        })
      );
    } else if (message.directMessageId) {
      setDirectMessages((prev) =>
        prev.map((dm) => {
          if (dm.id === message.directMessageId && !isActiveDM) {
            return { ...dm, unreadCount: dm.unreadCount + 1 };
          }
          return dm;
        })
      );
    }
  };

  const handleChannelCreated = (channel: Channel) => {
    setChannels((prev) => [...prev, channel]);
  };

  const handleDirectMessageCreated = (directMessage: DirectMessage) => {
    setDirectMessages((prev) => [...prev, directMessage]);
  };

  const handleUserStatusChanged = (user: User) => {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
  };

  // User actions
  const handleSendMessage = (content: string) => {
    if (!activeConversation || !currentUser) return;

    const messageData = {
      type: "SEND_MESSAGE",
      payload: {
        content,
        senderId: currentUser.id,
        ...(activeConversation.type === "channel"
          ? { channelId: activeConversation.id }
          : { directMessageId: activeConversation.id }),
      },
    };

    sendMessage(JSON.stringify(messageData));
  };

  const handleConversationSelect = (conversation: Channel | DirectMessage) => {
    setActiveConversation(conversation);

    // Reset unread count
    if (conversation.type === "channel") {
      setChannels((prev) =>
        prev.map((channel) =>
          channel.id === conversation.id
            ? { ...channel, unreadCount: 0 }
            : channel
        )
      );
      fetchMessages(conversation.id, "channel");
    } else {
      setDirectMessages((prev) =>
        prev.map((dm) =>
          dm.id === conversation.id ? { ...dm, unreadCount: 0 } : dm
        )
      );
      fetchMessages(conversation.id, "direct");
    }
  };

  const handleCreateChannel = (name: string) => {
    const channelData = {
      type: "CREATE_CHANNEL",
      payload: {
        name,
        creatorId: currentUser?.id,
      },
    };

    sendMessage(JSON.stringify(channelData));
    setShowCreateChannel(false);
  };

  const handleCreateDirectMessage = (userId: string) => {
    const dmData = {
      type: "CREATE_DIRECT_MESSAGE",
      payload: {
        participantIds: [currentUser?.id, userId],
      },
    };

    sendMessage(JSON.stringify(dmData));
    setShowCreateDM(false);
  };

  const handleViewChannelInvite = (channel: Channel) => {
    setSelectedChannel(channel);
    setShowChannelInvite(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        channels={channels}
        directMessages={directMessages}
        activeConversation={activeConversation}
        onConversationSelect={handleConversationSelect}
        onCreateChannel={() => setShowCreateChannel(true)}
        onCreateDirectMessage={() => setShowCreateDM(true)}
        onViewChannelInvite={handleViewChannelInvite}
        currentUser={currentUser}
      />

      <div className="flex flex-col flex-1 overflow-hidden border-l">
        {activeConversation && (
          <>
            <ConversationHeader
              conversation={activeConversation}
              onViewChannelInvite={
                activeConversation.type === "channel"
                  ? () => handleViewChannelInvite(activeConversation as Channel)
                  : undefined
              }
            />
            <MessageList messages={messages} currentUser={currentUser} />
            <MessageInput onSendMessageAction={handleSendMessage} />
          </>
        )}
      </div>

      {showCreateChannel && (
        <CreateChannelDialog
          onCloseAction={() => setShowCreateChannel(false)}
          onCreateChannelAction={handleCreateChannel}
        />
      )}

      {showCreateDM && (
        <CreateDirectMessageDialog
          users={users}
          currentUserId={currentUser?.id || ""}
          onCloseAction={() => setShowCreateDM(false)}
          onCreateDirectMessageAction={handleCreateDirectMessage}
        />
      )}

      {showChannelInvite && selectedChannel && (
        <ChannelInviteDialog
          channel={selectedChannel}
          onCloseAction={() => setShowChannelInvite(false)}
        />
      )}
    </div>
  );
}
