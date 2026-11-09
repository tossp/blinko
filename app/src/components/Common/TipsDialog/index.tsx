import { Button, Popover, Spinner } from '@heroui/react';
import { RootStore } from '@/store';
import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

import { DialogStandaloneStore } from '@/store/module/DialogStandalone';

const TipsDialog = observer(({ content, onConfirm, onCancel, buttonSlot }: any) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <div className="flex gap-4 items-center ">
        <div className="ml-4">{content}</div>
      </div>
      <div className="flex my-4 gap-4">
        {buttonSlot ? (
          buttonSlot
        ) : (
          <>
            <Button
              className="ml-auto"
              onPress={(e) => {
                RootStore.Get(DialogStandaloneStore).close();
                onCancel?.();
              }}
              variant="tertiary"
            >
              {t('cancel')}
            </Button>
            <Button
              onPress={async (e) => {
                onConfirm?.();
              }}
              variant="danger"
            >
              {t('confrim')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
});

export const showTipsDialog = async (props: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title: string;
  content: string;
  onConfirm?;
  onCancel?: any;
  buttonSlot?: React.ReactNode;
}) => {
  RootStore.Get(DialogStandaloneStore).setData({
    isOpen: true,
    onlyContent: false,
    size: props.size || 'md',
    title: props.title,
    content: <TipsDialog {...props} />,
  });
};

export const TipsPopover = observer(
  (props: { children: React.ReactNode; content; onConfirm; onCancel?; isLoading?: boolean }) => {
    const { t } = useTranslation();
    const { isLoading = false } = props;
    return (
      <Popover>
        <Popover.Trigger tabIndex={0}>{props.children}</Popover.Trigger>
        <Popover.Content placement={'bottom'}>
          <Popover.Arrow />
          <Popover.Dialog>
            <div className="px-1 py-2 flex flex-col">
              <div className="text-yellow-500 ">
                <div className="font-bold mb-2">{props.content}</div>
              </div>
              <div className="flex my-1 gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="ml-auto"
                  onPress={(e) => {
                    RootStore.Get(DialogStandaloneStore).close();
                    props.onCancel?.();
                  }}
                >
                  {<Icon icon="iconoir:cancel" width="20" height="20" />}
                  {t('cancel')}
                </Button>
                <Button
                  size="sm"
                  onPress={async (e) => {
                    props.onConfirm?.();
                  }}
                  variant="danger"
                  isPending={isLoading}
                >
                  {isLoading ? <Spinner color="current" size="sm" /> : null}
                  {<Icon icon="cil:check-alt" width="20" height="20" />}
                  {t('confirm')}
                </Button>
              </div>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    );
  }
);
