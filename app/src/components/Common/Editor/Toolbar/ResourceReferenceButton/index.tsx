import { InputGroup, Popover, TextField } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';

import { observer } from 'mobx-react-lite';
import { IconButton } from '../IconButton';
import { ScrollArea } from '../../../ScrollArea';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store';
import { EditorStore } from '../../editorStore';
import { useEffect, useState } from 'react';
import { helper } from '@/lib/helper';
import { ResourceType } from '@shared/lib/types';
import { PromiseState } from '@/store/standard/PromiseState';
import { PhotoProvider } from 'react-photo-view';
import { useTranslation } from 'react-i18next';
import { ResourceItemPreview } from '@/components/BlinkoResource/ResourceItem';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';

interface Props {
  store: EditorStore;
}

export const ResourceReferenceButton = observer(({ store }: Props) => {
  const blinko = RootStore.Get(BlinkoStore);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      blinko.resourceList.resetAndCall({ folder: undefined });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchText) {
      blinko.resourceList.resetAndCall({ searchText, folder: undefined });
    }
  }, [searchText, isOpen]);

  const handleSelect = async (attachment: ResourceType) => {
    // Check if this attachment is already in the files list
    if (store.files.some((file) => file.name === attachment.name)) return;

    const extension = helper.getFileExtension(attachment.name) as string;
    const previewType = helper.getFileType(attachment.type as string, attachment.name);

    // Create a FileType object from the attachment
    console.log('attachment', attachment);
    const file: any = {
      name: attachment.name,
      size: Number(attachment.size),
      previewType,
      extension,
      uploadPromise: new PromiseState({
        function: async () => {
          return attachment.path;
        },
      }),
      preview: attachment.path,
      type: attachment.type!,
    };
    await file.uploadPromise.call();
    // Add to files array
    store.files.push(file);
    setIsOpen(false);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger tabIndex={0}>
        <div className="hover:bg-default-100 rounded-md">
          <IconButton icon="hugeicons:file-link" tooltip={t('referenceResource')} />
        </div>
      </Popover.Trigger>
      <Popover.Content placement={'bottom'} className="w-[300px] sm:w-[300px]">
        <Popover.Dialog>
          <div className="p-1 w-full">
            <TextField value={searchText} className={'mb-2'}>
              <InputGroup>
                <InputGroup.Prefix>{<Icon icon="mdi:magnify" width={20} height={20} />}</InputGroup.Prefix>
                <InputGroup.Input onChange={(e) => setSearchText(e.target.value)} placeholder={t('search')} />
              </InputGroup>
            </TextField>
            <ScrollArea
              className="h-[300px] "
              onBottom={() => {
                blinko.resourceList.callNextPage({});
              }}
            >
              <LoadingAndEmpty
                isLoading={blinko.resourceList.loading.value}
                isEmpty={blinko.resourceList.value?.length === 0}
              />
              <PhotoProvider>
                <div className="space-y-2 w-full">
                  {blinko.resourceList.value?.map((attachment) => (
                    <ResourceItemPreview
                      key={attachment.id}
                      item={attachment}
                      onClick={() => handleSelect(attachment)}
                      showExtraInfo={true}
                      showAssociationIcon={true}
                    />
                  ))}
                </div>
              </PhotoProvider>
            </ScrollArea>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
});
