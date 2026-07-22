// Pure chat-channel helpers shared by the chat components. A message belongs
// to exactly one channel shape (see migration 0019_chat_branch_channels.sql).

export type ChatChannel =
  | { kind: "general" }
  | { kind: "transfer"; transferId: string }
  | { kind: "branches"; branchAId: string; branchBId: string };

export type ChatMessageRow = {
  id: string;
  transfer_id: string | null;
  branch_a_id: string | null;
  branch_b_id: string | null;
  sender_id: string;
  body: string;
  created_at: string;
};

// Each branch pair has one canonical channel: (a, b) with a < b. Standard
// lowercase UUID strings sort the same way Postgres compares uuid values,
// so this matches the migration's `branch_a_id < branch_b_id` constraint.
export function branchChannel(
  branchId: string,
  otherBranchId: string,
): ChatChannel {
  const [branchAId, branchBId] = [
    branchId.toLowerCase(),
    otherBranchId.toLowerCase(),
  ].sort();
  return { kind: "branches", branchAId, branchBId };
}

// Chat is HQ <-> branch only (Phase 6 item 4). This is the canonical way to
// open a branch's channel with head office — it's just branchChannel() with
// a clearer name at call sites, since one side must always be HQ.
export function headOfficeChannel(
  branchId: string,
  hqBranchId: string,
): ChatChannel {
  return branchChannel(branchId, hqBranchId);
}

export function messageMatchesChannel(
  message: ChatMessageRow,
  channel: ChatChannel,
): boolean {
  switch (channel.kind) {
    case "general":
      return message.transfer_id === null && message.branch_a_id === null;
    case "transfer":
      return message.transfer_id === channel.transferId;
    case "branches":
      return (
        message.branch_a_id === channel.branchAId &&
        message.branch_b_id === channel.branchBId
      );
  }
}

// Column values to store on a new message in this channel.
export function channelColumns(channel: ChatChannel): {
  transfer_id: string | null;
  branch_a_id: string | null;
  branch_b_id: string | null;
} {
  switch (channel.kind) {
    case "general":
      return { transfer_id: null, branch_a_id: null, branch_b_id: null };
    case "transfer":
      return {
        transfer_id: channel.transferId,
        branch_a_id: null,
        branch_b_id: null,
      };
    case "branches":
      return {
        transfer_id: null,
        branch_a_id: channel.branchAId,
        branch_b_id: channel.branchBId,
      };
  }
}

// Stable key for React state / realtime channel names.
export function channelKey(channel: ChatChannel): string {
  switch (channel.kind) {
    case "general":
      return "general";
    case "transfer":
      return `transfer:${channel.transferId}`;
    case "branches":
      return `branches:${channel.branchAId}:${channel.branchBId}`;
  }
}
