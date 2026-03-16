import { create } from 'zustand';

type ModalType = 'createServer' | 'createChannel' | 'inviteMembers' | 'createCategory' | 'editCategory' | 'deleteCategory' | 'userSettings' | 'createPoll' | 'uploadFile' | 'pollVoters' | 'channelSettings' | 'textChannelSettings' | 'serverSettings' | 'forwardMessage' | null;

interface ModalData {
  serverId?: string;
  serverName?: string;
  inviteCode?: string;
  channelId?: string;
  channelName?: string;
  channelType?: 'TEXT' | 'AUDIO' | 'VIDEO';
  memberId?: string;
  pollData?: any;
  pollQuestion?: string;
  messageId?: string;
  categoryId?: string;
  categoryName?: string;
  forwardContent?: string;
  forwardFileUrl?: string | null;
  forwardAuthorName?: string;
}

interface ModalStore {
  type: ModalType;
  data: ModalData;
  isOpen: boolean;
  onOpen: (type: Exclude<ModalType, null>, data?: ModalData) => void;
  onClose: () => void;
  open: (type: Exclude<ModalType, null>) => void;
  close: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  type: null,
  data: {},
  isOpen: false,
  onOpen: (type, data = {}) => set({ isOpen: true, type, data }),
  onClose: () => set({ isOpen: false, type: null, data: {} }),
  open: (type) => set({ isOpen: true, type }),
  close: () => set({ isOpen: false, type: null }),
}));
