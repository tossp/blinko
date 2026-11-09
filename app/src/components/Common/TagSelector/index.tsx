import { ComboBox, Input, ListBox } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';

import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

interface TagSelectorProps {
  selectedTag: string | null;
  onSelectionChange: (key: string) => void;
  className?: string;
}

export default function TagSelector({ selectedTag, onSelectionChange, className = 'max-w-full' }: TagSelectorProps) {
  const { t } = useTranslation();
  const blinkoStore = RootStore.Get(BlinkoStore);

  return (
    <ComboBox className={className} value={selectedTag} onChange={(key) => onSelectionChange(String(key ?? ''))}>
      <ComboBox.InputGroup>
        {selectedTag ? (
          (() => {
            const tag = blinkoStore.tagList.value?.falttenTags.find((t) => t.id === Number(selectedTag));
            return tag?.icon ? <div>{tag.icon}</div> : <Icon icon="mingcute:hashtag-line" width="20" height="20" />;
          })()
        ) : (
          <Icon icon="mingcute:hashtag-line" width="20" height="20" />
        )}
        <Input placeholder={t('select-tags')} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox items={blinkoStore.tagList.value?.falttenTags || []}>
          {(tag: any) => (
            <ListBox.Item key={tag.id} textValue={tag.name} id={String(tag.id)}>
              <div className="flex gap-2 items-center">
                {tag.icon ? <div>{tag.icon}</div> : <Icon icon="mingcute:hashtag-line" width="20" height="20" />}
                <span className="text-small">{tag.name}</span>
              </div>
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
