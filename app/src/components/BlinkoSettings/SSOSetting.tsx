import {
  Alert,
  Button,
  Description,
  Input,
  InputGroup,
  Label,
  ListBox,
  Select,
  Spinner,
  Table,
  TextField,
} from '@heroui/react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Item } from './Item';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseState } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';

import { Icon } from '@/components/Common/Iconify/icons';
import { DialogStore } from '@/store/module/Dialog';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { showTipsDialog } from '../Common/TipsDialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { ZOAuth2ProviderSchema } from '@shared/lib/types';
import { z } from 'zod';
import { PasswordInput } from '../Common/PasswordInput';

const OAUTH_TEMPLATES = {
  custom: {
    id: 'custom',
    name: 'Custom Provider',
    icon: '',
    isCustom: true,
  },
  github: {
    id: 'github',
    name: 'GitHub',
    icon: 'skill-icons:github-dark',
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: 'logos:google-icon',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'logos:facebook',
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    icon: 'vscode-icons:file-type-applescript',
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    icon: 'logos:spotify-icon',
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: 'logos:discord-icon',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter',
    icon: 'skill-icons:twitter',
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: 'logos:slack-icon',
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    icon: 'logos:twitch',
  },
  line: {
    id: 'line',
    name: 'LINE',
    icon: 'logos:line',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'skill-icons:instagram',
  },
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase',
    icon: 'cryptocurrency:cb',
  },
  yandex: {
    id: 'yandex',
    name: 'Yandex',
    icon: 'vscode-icons:file-type-yandex',
  },
} as const;

const UpdateSSOProvider = observer(({ provider }: { provider?: z.infer<typeof ZOAuth2ProviderSchema> }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const store = RootStore.Local(() => ({
    template: (provider
      ? (OAUTH_TEMPLATES[provider.id as keyof typeof OAUTH_TEMPLATES]?.id ?? 'custom')
      : 'custom') as keyof typeof OAUTH_TEMPLATES,
    id: provider?.id || '',
    name: provider?.name || '',
    icon: provider?.icon || '',
    wellKnown: provider?.wellKnown || '',
    scope: provider?.scope || '',
    authorizationUrl: provider?.authorizationUrl || '',
    tokenUrl: provider?.tokenUrl || '',
    userinfoUrl: provider?.userinfoUrl || '',
    clientId: provider?.clientId || '',
    clientSecret: provider?.clientSecret || '',
    upsertProvider: new PromiseState({
      function: async () => {
        const config = blinko.config.value || {};
        const providers = config.oauth2Providers || [];
        const newProvider = {
          id: store.id,
          name: store.name,
          icon: store.icon,
          wellKnown: store.wellKnown,
          scope: store.scope,
          authorizationUrl: store.authorizationUrl,
          tokenUrl: store.tokenUrl,
          userinfoUrl: store.userinfoUrl,
          clientId: store.clientId,
          clientSecret: store.clientSecret,
        };

        const newProviders = provider
          ? providers.map((p) => (p.id === provider.id ? newProvider : p))
          : [...providers, newProvider];

        await api.config.update.mutate({
          key: 'oauth2Providers',
          value: newProviders,
        });
        RootStore.Get(DialogStore).close();
        await blinko.config.call();
      },
    }),
  }));

  const handleTemplateChange = (templateId: string) => {
    const template = OAUTH_TEMPLATES[templateId as keyof typeof OAUTH_TEMPLATES];
    if (template) {
      store.template = templateId as keyof typeof OAUTH_TEMPLATES;
      store.id = template.id === 'custom' ? '' : template.id;
      store.name = template.id === 'custom' ? '' : template.name;
      store.icon = template.icon;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Select onChange={(selectedValue) => handleTemplateChange(String(selectedValue ?? ''))} value={store.template}>
        <Select.Trigger>
          {store.icon && <Icon icon={store.icon} width="20" height="20" />}
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {Object.entries(OAUTH_TEMPLATES).map(([key, template]) => (
              <ListBox.Item key={key} id={key} textValue={template.name}>
                {template.icon && <Icon icon={template.icon} width="20" height="20" />}
                {template.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {store.template === 'custom' && (
        <>
          <TextField value={store.id}>
            <Label>{t('provider-id')}</Label>
            <Input
              placeholder="custom-provider"
              onChange={(e) => {
                store.id = e.target.value;
              }}
            />
          </TextField>
          <TextField value={store.name}>
            <Label>{t('provider-name')}</Label>
            <Input
              placeholder="Custom Provider"
              onChange={(e) => {
                store.name = e.target.value;
              }}
            />
          </TextField>
          <TextField value={store.icon}>
            <Label>{t('provider-icon')}</Label>
            <InputGroup>
              <InputGroup.Prefix>{store.icon && <Icon icon={store.icon} width="20" height="20" />}</InputGroup.Prefix>
              <InputGroup.Input
                placeholder="logos:custom-icon"
                onChange={(e) => {
                  store.icon = e.target.value;
                }}
              />
            </InputGroup>
            <Description>
              {
                <div className="flex items-center gap-2">
                  {t('please-select-icon-from-iconify')}
                  <br />
                  <a className="text-blue-500" href="https://icon-sets.iconify.design/" target="_blank">
                    Iconify
                  </a>
                </div>
              }
            </Description>
          </TextField>
          <TextField value={store.wellKnown}>
            <Label>{t('well-known-url')}</Label>
            <Input
              placeholder="https://example.com/.well-known/openid-configuration"
              onChange={(e) => {
                store.wellKnown = e.target.value;
              }}
            />
          </TextField>
          {!store.wellKnown && (
            <>
              <TextField value={store.authorizationUrl}>
                <Label>{t('authorization-url')}</Label>
                <Input
                  placeholder="https://example.com/oauth/authorize"
                  onChange={(e) => {
                    store.authorizationUrl = e.target.value;
                  }}
                />
              </TextField>
              <TextField value={store.tokenUrl}>
                <Label>{t('token-url')}</Label>
                <Input
                  placeholder="https://example.com/oauth/token"
                  onChange={(e) => {
                    store.tokenUrl = e.target.value;
                  }}
                />
              </TextField>
              <TextField value={store.userinfoUrl}>
                <Label>{t('userinfo-url')}</Label>
                <Input
                  placeholder="https://example.com/oauth/userinfo"
                  onChange={(e) => {
                    store.userinfoUrl = e.target.value;
                  }}
                />
              </TextField>
              <TextField value={store.scope}>
                <Label>{t('scope')}</Label>
                <Input
                  placeholder="email profile"
                  onChange={(e) => {
                    store.scope = e.target.value;
                  }}
                />
              </TextField>
            </>
          )}
        </>
      )}

      <TextField value={store.clientId}>
        <Label>{t('client-id')}</Label>
        <Input
          placeholder="your-client-id"
          onChange={(e) => {
            store.clientId = e.target.value;
          }}
        />
      </TextField>
      <PasswordInput
        label={t('client-secret')}
        placeholder="your-client-secret"
        value={store.clientSecret}
        onChange={(e) => {
          store.clientSecret = e.target.value;
        }}
      />
      <Alert status={'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('redirect-url')}</Alert.Title>
          <Alert.Description>{`${window.location.origin}/api/auth/callback/${store.id || store.template}`}</Alert.Description>
        </Alert.Content>
      </Alert>
      <div className="text-xs text-default-500 mt-1">{t('please-add-this-url-to-your-oauth-provider-settings')}</div>
      <div className="flex w-full mt-2">
        <Button
          className="ml-auto"
          onPress={async () => {
            await store.upsertProvider.call();
          }}
          variant="primary"
          isPending={store.upsertProvider.loading.value}
        >
          {store.upsertProvider.loading.value ? <Spinner color="current" size="sm" /> : null}
          {t('save')}
        </Button>
      </div>
    </div>
  );
});

export const SSOSetting = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const providers = blinko.config.value?.oauth2Providers || [];

  return (
    <CollapsibleCard icon="tabler:key" title={t('sso-settings')}>
      <Item
        leftContent={<>{t('oauth2-providers')}</>}
        rightContent={
          <Button
            size="sm"
            onPress={() => {
              RootStore.Get(DialogStore).setData({
                size: '2xl',
                isOpen: true,
                title: t('add-oauth2-provider'),
                content: <UpdateSSOProvider />,
              });
            }}
            variant="primary"
          >
            {<Icon icon="tabler:plus" width="18" height="18" />}
            {t('add-provider')}
          </Button>
        }
      />

      <Item
        leftContent={
          <Table className="mb-2">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader={true}>{t('provider-id')}</Table.Column>
                  <Table.Column isRowHeader={true}>{t('provider-name')}</Table.Column>
                  <Table.Column isRowHeader={true}>{t('provider-icon')}</Table.Column>
                  <Table.Column isRowHeader={true}>{t('action')}</Table.Column>
                </Table.Header>
                <Table.Body>
                  {providers.map((provider) => (
                    <Table.Row key={provider.id}>
                      <Table.Cell>{provider.id}</Table.Cell>
                      <Table.Cell>{provider.name}</Table.Cell>
                      <Table.Cell>{provider.icon && <Icon icon={provider.icon} width="20" height="20" />}</Table.Cell>
                      <Table.Cell>
                        <div className="flex">
                          <Button
                            isIconOnly
                            variant="tertiary"
                            size="sm"
                            onPress={() => {
                              RootStore.Get(DialogStore).setData({
                                isOpen: true,
                                title: t('edit-oauth2-provider'),
                                content: <UpdateSSOProvider provider={provider} />,
                              });
                            }}
                          >
                            {<Icon icon="tabler:edit" width="18" height="18" />}
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            className="ml-2"
                            onPress={() => {
                              showTipsDialog({
                                size: 'sm',
                                title: t('confirm-to-delete'),
                                content: t('confirm-delete-provider'),
                                onConfirm: async () => {
                                  try {
                                    const newProviders = providers.filter((p) => p.id !== provider.id);
                                    await RootStore.Get(ToastPlugin).promise(
                                      api.config.update.mutate({
                                        key: 'oauth2Providers',
                                        value: newProviders,
                                      }),
                                      {
                                        loading: t('in-progress'),
                                        success: <b>{t('your-changes-have-been-saved')}</b>,
                                        error: (e) => <b>{e.message}</b>,
                                      }
                                    );
                                    await blinko.config.call();
                                    RootStore.Get(DialogStandaloneStore).close();
                                  } catch (e) {
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
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        }
      />
    </CollapsibleCard>
  );
});
