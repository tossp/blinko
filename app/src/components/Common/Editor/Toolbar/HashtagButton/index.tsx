import { Input, Popover, TextField } from '@heroui/react';
import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { EditorStore } from '../../editorStore';
import { useMediaQuery } from 'usehooks-ts';

import { ScrollArea } from '@/components/Common/ScrollArea';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store/root';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';

interface Props {
  store: EditorStore;
  content: string;
}

export const HashtagButton = observer(({ store, content }: Props) => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore);
  const localStore = RootStore.Local(() => ({
    show: false,
    setShow: (show: boolean) => {
      localStore.show = show;
    },
    isSearchMode: true,
    searchText: '',
    selectedIndex: 0,
    get tagList() {
      if (!localStore.searchText) {
        return blinko.tagList?.value?.pathTags;
      }
      return blinko.tagList?.value?.pathTags.filter((i) =>
        i.toLowerCase().includes(localStore.searchText.toLowerCase().replace('#', ''))
      );
    },
  }));

  useEffect(() => {
    localStore.searchText = '';
  }, []);

  return (
    <Popover isOpen={localStore.show} onOpenChange={localStore.setShow}>
      <Popover.Trigger tabIndex={0}>
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            localStore.setShow(true);
          }}
        >
          <IconButton tooltip={t('insert-hashtag')} icon="mingcute:hashtag-line" />
        </div>
      </Popover.Trigger>
      <Popover.Content placement={'bottom'} className="flex flex-col max-w-[300px] p-2">
        <Popover.Dialog>
          <ScrollArea className={'max-h-[300px]'} onBottom={() => {}}>
            <TextField value={localStore.searchText} className={'mb-2'}>
              <Input
                placeholder={t('search-tags')}
                autoFocus
                onChange={(e) => {
                  localStore.searchText = e.target.value;
                }}
              />
            </TextField>

            {localStore.tagList?.map((i, index) => (
              <div
                key={i}
                data-index={index}
                className={`cursor-pointer hover:bg-hover !transition-all px-2 py-1 rounded-lg
            ${index === localStore.selectedIndex ? 'bg-hover' : ''}`}
                onClick={(e) => {
                  localStore.setShow(false);
                  store.vditor?.insertValue(`#${i}&nbsp;`, true);
                  store.onChange?.(store.vditor?.getValue() ?? '');
                  setTimeout(() => {
                    store.focus();
                  }, 300);
                }}
              >
                #{i}
              </div>
            ))}
            {localStore.tagList?.length == 0 && (
              <div className="text-ignore font-bold text-sm">{t('no-tag-found')}</div>
            )}
          </ScrollArea>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
});
