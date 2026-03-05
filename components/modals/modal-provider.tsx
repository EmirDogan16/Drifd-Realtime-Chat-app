'use client';

import { CreateServerModal } from '@/components/modals/create-server-modal';
import { CreateChannelModal } from '@/components/modals/create-channel-modal';
import { InviteMembersModal } from '@/components/modals/invite-members-modal';
import { CreateCategoryModal } from '@/components/modals/create-category-modal';
import { EditCategoryModal } from '@/components/modals/edit-category-modal';
import { DeleteCategoryModal } from '@/components/modals/delete-category-modal';
import { UserSettingsModal } from '@/components/modals/user-settings-modal';
import { CreatePollModal } from '@/components/modals/create-poll-modal';
import { UploadFileModal } from '@/components/modals/upload-file-modal';
import { PollVotersModal } from '@/components/modals/poll-voters-modal';
import { ChannelSettingsModal } from '@/components/modals/channel-settings-modal';
import { TextChannelSettingsModal } from '@/components/modals/text-channel-settings-modal';
import { ServerSettingsModal } from '@/components/modals/server-settings-modal';

export function ModalProvider() {
  return (
    <>
      <CreateServerModal />
      <CreateChannelModal />
      <InviteMembersModal />
      <CreateCategoryModal />
      <EditCategoryModal />
      <DeleteCategoryModal />
      <UserSettingsModal />
      <CreatePollModal />
      <UploadFileModal />
      <PollVotersModal />
      <ChannelSettingsModal />
      <TextChannelSettingsModal />
      <ServerSettingsModal />
    </>
  );
}
