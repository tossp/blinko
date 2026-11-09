import { Alert, Button, Input, Label, ListBox, Select, Spinner, TextField } from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { RootStore } from '@/store';
import { useTranslation } from 'react-i18next';
import { DialogStore } from '@/store/module/Dialog';
import { api } from '@/lib/trpc';
import React, { useEffect, useState } from 'react';
import { PromiseCall } from '@/store/standard/PromiseState';
import { eventBus } from '@/lib/event';

export const LinkAccountModal = observer(() => {
  const { t } = useTranslation();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState<{ id: number; name: string; nickname: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const result = await api.users.nativeAccountList.query();
      setAccounts(result);
    };
    fetchAccounts();
  }, []);

  const handleLinkAccount = async () => {
    if (!selectedAccount || !password) return;
    setLoading(true);
    try {
      await PromiseCall(
        api.users.linkAccount.mutate({
          id: Number(selectedAccount),
          originalPassword: password,
        })
      );
      RootStore.Get(DialogStore).close();
      eventBus.emit('user:signout');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        placeholder={'username'}
        value={selectedAccount}
        onChange={(selectedValue) => setSelectedAccount(String(selectedValue ?? ''))}
      >
        <Label>{t('select-account')}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {accounts.map((account) => (
              <ListBox.Item key={account.id} id={String(account.id)}>
                {account.nickname}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <TextField value={password}>
        <Label>{t('password')}</Label>
        <Input type="password" placeholder={'12345678'} onChange={(e) => setPassword(e.target.value)} />
      </TextField>

      <Alert status={'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('link-account-warning')}</Alert.Title>
        </Alert.Content>
      </Alert>

      <Button onPress={handleLinkAccount} className="mt-2" variant="primary" isPending={loading}>
        {loading ? <Spinner color="current" size="sm" /> : null}
        {t('link-account')}
      </Button>
    </div>
  );
});
