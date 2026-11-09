import { Button, Chip, Input, Label, Spinner, Table, TextField } from '@heroui/react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Item } from './Item';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall, PromiseState } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';

import { useEffect } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';
import { DialogStore } from '@/store/module/Dialog';
import { PasswordInput } from '../Common/PasswordInput';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { showTipsDialog } from '../Common/TipsDialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';

const UpdateUserInfo = observer(
  ({
    id,
    name,
    password,
    nickname,
    loginType,
  }: {
    id?: number;
    name: string;
    password: string;
    nickname?: string;
    loginType?: string;
  }) => {
    const { t } = useTranslation();
    const blinko = RootStore.Get(BlinkoStore);
    const store = RootStore.Local(() => ({
      username: name,
      password,
      nickname: nickname || name,
      upsertUser: new PromiseState({
        function: async () => {
          const upsertItem: { name: string; password: string; nickname?: string; id?: number } = {
            name: store.username,
            password: store.password,
            nickname: store.nickname,
          };
          if (id) upsertItem.id = id;
          await PromiseCall(api.users.upsertUserByAdmin.mutate(upsertItem));
          RootStore.Get(DialogStore).close();
          blinko.userList.call();
        },
      }),
    }));

    const isOauth = loginType === 'oauth';

    return (
      <>
        <TextField value={store.username} isDisabled={isOauth}>
          <Label>{t('username')}</Label>
          <Input
            placeholder={t('username')}
            onChange={(e) => {
              store.username = e.target.value;
            }}
          />
        </TextField>
        <TextField value={store.nickname} className={'mt-2'}>
          <Label>{t('nickname')}</Label>
          <Input
            placeholder={t('nickname')}
            onChange={(e) => {
              store.nickname = e.target.value;
            }}
          />
        </TextField>
        <PasswordInput
          placeholder={t('password')}
          label={t('password')}
          value={store.password}
          onChange={(e) => {
            store.password = e.target.value;
          }}
        />
        <div className="flex w-full mt-2">
          <Button
            className="ml-auto"
            onPress={async (e) => {
              await store.upsertUser.call();
            }}
            variant="primary"
            isPending={store.upsertUser.loading.value}
          >
            {store.upsertUser.loading.value ? <Spinner color="current" size="sm" /> : null}
            {t('save')}
          </Button>
        </div>
      </>
    );
  }
);

export const UserSetting = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  useEffect(() => {
    blinko.userList.call();
  }, []);

  return (
    <CollapsibleCard icon="tabler:user-cog" title={t('user-list')}>
      <Item
        leftContent={<>{t('user-list')}</>}
        rightContent={
          <Button
            size="sm"
            onPress={(e) => {
              RootStore.Get(DialogStore).setData({
                isOpen: true,
                title: t('create-user'),
                content: <UpdateUserInfo name="" password="" />,
              });
            }}
            variant="primary"
          >
            {<Icon icon="humbleicons:user-add" width="18" height="18" />}
            {t('create-user')}
          </Button>
        }
      />

      <Item
        leftContent={
          blinko.userList.value ? (
            <Table className="mb-2 max-h-[300px] overflow-y-auto">
              <Table.ScrollContainer>
                <Table.Content>
                  <Table.Header>
                    <Table.Column isRowHeader={true}>{t('name-db')}</Table.Column>
                    <Table.Column isRowHeader={true}>{t('nickname')}</Table.Column>
                    <Table.Column isRowHeader={true}>{t('role')}</Table.Column>
                    <Table.Column isRowHeader={true}>{t('login-type')}</Table.Column>
                    <Table.Column isRowHeader={true}>{t('action')}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {blinko.userList.value!.map((i) => {
                      return (
                        <Table.Row>
                          <Table.Cell>{i.name}</Table.Cell>
                          <Table.Cell>{i.nickname}</Table.Cell>
                          <Table.Cell>
                            <Chip size="sm" color="warning" variant={'secondary'}>
                              <Chip.Label>{i.role}</Chip.Label>
                            </Chip>
                          </Table.Cell>
                          <Table.Cell>{i.loginType == 'oauth' ? 'oauth' : t('password')}</Table.Cell>
                          <Table.Cell>
                            <div className="flex">
                              <Button
                                isIconOnly
                                variant="tertiary"
                                size="sm"
                                onPress={(e) => {
                                  RootStore.Get(DialogStore).setData({
                                    isOpen: true,
                                    title: t('edit-user'),
                                    content: (
                                      <UpdateUserInfo
                                        id={i.id}
                                        name={i.name}
                                        password={i.password}
                                        nickname={i.nickname}
                                        loginType={i.loginType}
                                      />
                                    ),
                                  });
                                }}
                              >
                                {<Icon icon="tabler:edit" width="18" height="18" />}
                              </Button>
                              <Button
                                isIconOnly
                                size="sm"
                                className="ml-2"
                                onPress={(e) => {
                                  showTipsDialog({
                                    size: 'sm',
                                    title: t('confirm-to-delete'),
                                    content: t('after-deletion-all-user-data-will-be-cleared-and-unrecoverable'),
                                    onConfirm: async () => {
                                      try {
                                        await RootStore.Get(ToastPlugin).promise(
                                          api.users.deleteUser.mutate({ id: i.id }),
                                          {
                                            loading: t('in-progress'),
                                            success: <b>{t('your-changes-have-been-saved')}</b>,
                                            error: (e) => {
                                              return <b>{e.message}</b>;
                                            },
                                          }
                                        );
                                        blinko.userList.call();
                                        RootStore.Get(DialogStandaloneStore).close();
                                      } catch (e) {
                                        // RootStore.Get(ToastPlugin).error(e.message)
                                        RootStore.Get(DialogStandaloneStore).close();
                                      }
                                    },
                                  });
                                }}
                                variant="danger"
                              >
                                {<Icon icon="tabler:trash" width="18" height="18" />}
                              </Button>
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          ) : null
        }
      />
    </CollapsibleCard>
  );
});
