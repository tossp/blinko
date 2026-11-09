import { Button, InputGroup, Label, Link, TextField } from '@heroui/react';
import { follows } from '@shared/lib/prismaZodType';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { PromiseCall, PromiseState } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';

import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../BlinkoCard/commentButton';
import { useEffect } from 'react';
import { LoadingAndEmpty } from '../Common/LoadingAndEmpty';
import { ScrollArea } from '../Common/ScrollArea';

export const BlinkoSiteUser = observer(
  ({
    item,
    showFollow = true,
    onConfirm,
    tags,
  }: {
    item: {
      id: any;
      siteName?: string;
      siteUrl: string;
      siteAvatar?: string;
    };
    showFollow: boolean;
    onConfirm: () => void;
    tags?: string[];
  }) => {
    const { t } = useTranslation();
    return (
      <div className="flex items-center gap-1 mt-2 w-full">
        <UserAvatar
          key={item.id}
          guestName={item.siteName ?? item.siteUrl}
          account={{
            image: item.siteAvatar ?? '',
          }}
          size={35}
        />
        <div className="flex flex-col gap-1">
          <div>{item.siteName}</div>
          <Link href={item.siteUrl} target="_blank" className="text-blue-500 text-xs">
            {item.siteUrl}
          </Link>
          <div className="flex items-center gap-1">
            {tags?.map((tag) => (
              <div className="blinko-tag !text-xs mt-2">{tag}</div>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          className={['ml-auto', 'rounded-' + 'full'].filter(Boolean).join(' ')}
          onPress={() => {
            onConfirm();
          }}
          variant="primary"
        >
          {!showFollow ? t('unfollow') : t('follow')}
        </Button>
      </div>
    );
  }
);

export const BlinkoFollowDialog = observer(({ onConfirm }: { onConfirm: () => void }) => {
  const { t } = useTranslation();
  const store = RootStore.Local(() => ({
    siteUrl: '',
    siteList: new PromiseState({
      function: async (refresh = false) => {
        const data = await api.public.hubSiteList.query({
          refresh: refresh,
        });
        return data;
      },
    }),
  }));
  useEffect(() => {
    store.siteList.call();
  }, []);
  return (
    <div>
      <TextField value={store.siteUrl}>
        <Label>{t('site-url')}</Label>
        <InputGroup>
          <InputGroup.Input onChange={(e) => (store.siteUrl = e.target.value)} placeholder={'https://www.blinko.com'} />
          <InputGroup.Suffix>
            {
              <div className="flex items-center gap-2">
                <Button
                  className={['w-[100px]', 'rounded-' + 'full'].filter(Boolean).join(' ')}
                  onPress={async () => {
                    await PromiseCall(
                      api.follows.follow.mutate({ siteUrl: store.siteUrl, mySiteUrl: window.location.origin })
                    );
                    onConfirm();
                    RootStore.Get(DialogStore).close();
                  }}
                  size="sm"
                  variant="primary"
                >
                  {<Icon icon="fluent:people-add-32-regular" className="w-4 h-4" />}
                  {t('follow')}
                </Button>
                <Button
                  variant="tertiary"
                  isIconOnly
                  onPress={async () => {
                    store.siteList.call(true);
                  }}
                  size="sm"
                  className={['', 'rounded-' + 'full'].filter(Boolean).join(' ')}
                >
                  {<Icon icon="ion:refresh" className="w-4 h-4" />}
                </Button>
              </div>
            }
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <LoadingAndEmpty isLoading={store.siteList.loading.value} isEmpty={store.siteList.value?.length == 0} />

      <ScrollArea
        onBottom={() => {}}
        className="flex flex-col items-center gap-2 text-ignore text-bold mx-auto mt-4 max-h-[400px]"
      >
        {store.siteList.value?.map((item) => (
          <BlinkoSiteUser
            item={{
              id: item.url,
              siteName: item.title,
              siteUrl: item.url,
              siteAvatar: item.image ?? '',
            }}
            tags={item.tags}
            showFollow={true}
            onConfirm={() => {
              PromiseCall(api.follows.follow.mutate({ siteUrl: item.url, mySiteUrl: window.location.origin }));
              onConfirm();
              RootStore.Get(DialogStore).close();
            }}
          />
        ))}
      </ScrollArea>
    </div>
  );
});

export const BlinkoFollowingDialog = observer(
  ({ data, onConfirm, isFollowing = false }: { data: follows[]; onConfirm: () => void; isFollowing: boolean }) => {
    const { t } = useTranslation();
    return (
      <ScrollArea className="w-full gap-2" onBottom={() => {}}>
        {data.map((item) => (
          <BlinkoSiteUser
            key={item.id}
            item={{
              id: item.id,
              siteName: item.siteName ?? item.siteUrl,
              siteUrl: item.siteUrl,
              siteAvatar: item.siteAvatar ?? '',
            }}
            showFollow={!isFollowing}
            onConfirm={() => {
              if (isFollowing) {
                PromiseCall(
                  api.follows.unfollow.mutate({ siteUrl: item.siteUrl, mySiteUrl: window.location.origin })
                ).then(() => {
                  onConfirm();
                  RootStore.Get(DialogStore).close();
                });
              } else {
                PromiseCall(
                  api.follows.follow.mutate({ siteUrl: item.siteUrl, mySiteUrl: window.location.origin })
                ).then(() => {
                  onConfirm();
                  RootStore.Get(DialogStore).close();
                });
              }
            }}
          />
        ))}
      </ScrollArea>
    );
  }
);
