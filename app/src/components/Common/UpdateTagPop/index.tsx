import { Button, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import { BlinkoStore } from '@/store/blinkoStore';
import { _ } from '@/lib/lodash';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';

import { useEffect } from 'react';
import { DialogStore } from '@/store/module/Dialog';
import i18n from '@/lib/i18n';

type IProps = {
  defaultValue?: string;
  type?: 'input' | 'select';
  onSave?: (tagName: string) => Promise<any>;
};

export const UpdateTag = observer(({ onSave, defaultValue = '', type = 'input' }: IProps) => {
  const blinko = RootStore.Get(BlinkoStore);
  const store = RootStore.Local(() => ({
    tagName: '',
  }));
  useEffect(() => {
    store.tagName = defaultValue;
  }, [defaultValue]);

  return (
    <div className="flex items-center gap-2 pb-4">
      {type == 'input' ? (
        <TextField value={store.tagName}>
          <Input onChange={(e) => (store.tagName = e.target.value)} />
        </TextField>
      ) : (
        <Select className="max-w-xs" onChange={(selectedValue) => (store.tagName = String(selectedValue ?? ''))}>
          <Label>{'Select a tag'}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {(blinko.tagList.value?.pathTags as string[]).map((tag) => (
                <ListBox.Item key={tag} id={tag}>
                  {tag}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      <Button
        style={{ width: '30px' }}
        onPress={async () => {
          await onSave?.(store.tagName);
          RootStore.Get(DialogStore).close();
        }}
        variant="primary"
      >
        Save
      </Button>
    </div>
  );
});

export const ShowUpdateTagDialog = ({ onSave, defaultValue, type }: IProps) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    title: i18n.t('update-tag-name'),
    content: (
      <UpdateTag
        type={type}
        defaultValue={defaultValue}
        onSave={async (e) => {
          return await onSave?.(e);
        }}
      />
    ),
  });
};
