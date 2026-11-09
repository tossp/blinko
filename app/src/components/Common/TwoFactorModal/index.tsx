import { Button, InputOTP, Spinner } from '@heroui/react';

import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';

interface TwoFactorModalProps {
  onConfirm: (code: string) => void;
  isLoading: boolean;
}

export function TwoFactorModal({ onConfirm, isLoading }: TwoFactorModalProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10">
      <Icon icon="hugeicons:authorized" width="30" height="30" />
      <p className="text-xl font-bold">{t('enter-code-shown-on-authenticator-app')}</p>
      <div className="text-desc text-xs text-center">
        {t('open-your-third-party-authentication-app-and-enter-the-codeshown-on-screen')}
      </div>
      <InputOTP
        className={['mt-2', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
        onComplete={(e) => {
          onConfirm(e);
        }}
        maxLength={6}
      >
        <InputOTP.Group>
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTP.Slot key={index} index={index} />
          ))}
        </InputOTP.Group>
      </InputOTP>
      <Button className="mt-4" variant="primary" isPending={isLoading}>
        {isLoading ? <Spinner color="current" size="sm" /> : null}
        {t('sign-in')}
      </Button>
    </div>
  );
}

export const ShowTwoFactorModal = (onConfirm: (code: string) => void, isLoading: boolean) => {
  console.log('ShowTwoFactorModal', onConfirm, isLoading);
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: 'lg',
    content: <TwoFactorModal onConfirm={onConfirm} isLoading={isLoading} />,
  });
};
