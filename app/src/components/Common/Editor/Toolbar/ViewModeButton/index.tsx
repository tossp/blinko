import { Button, Dropdown } from '@heroui/react';
import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import { useMediaQuery } from 'usehooks-ts';

interface Props {
  viewMode: 'wysiwyg' | 'sv' | 'ir' | 'raw';
}

export const ViewModeButton = ({ viewMode }: Props) => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const modes = [
    {
      key: 'ir',
      label: t('live-preview'),
      icon: 'tabler:eye',
    },
    {
      key: 'sv',
      label: t('split-view'),
      icon: 'tabler:layout-columns',
    },
    {
      key: 'raw',
      label: t('raw-markdown'),
      icon: 'tabler:code',
    },
    ...(isPc
      ? [
          {
            key: 'wysiwyg',
            label: t('rich-text'),
            icon: 'tabler:eye-edit',
          },
        ]
      : []),
  ];

  const getCurrentMode = () => {
    return modes.find((mode) => mode.key === viewMode) || modes[0];
  };

  const handleModeChange = (key: string) => {
    eventBus.emit('editor:setViewMode', key);
  };

  return (
    <Dropdown>
      <Button className="bg-transparent p-0 min-w-0 h-auto">
        <div className="hover:bg-default-100 rounded-md">
          <IconButton tooltip="View Mode" icon={getCurrentMode().icon} />
        </div>
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Editor view mode"
          selectedKeys={[viewMode]}
          selectionMode="single"
          onSelectionChange={(keys) => {
            const selectedKey = Array.from(keys)[0] as string;
            if (selectedKey && selectedKey !== viewMode) {
              handleModeChange(selectedKey);
            }
          }}
        >
          {modes.map((mode) => (
            <Dropdown.Item key={mode.key} id={mode.key}>
              {
                <div className="flex items-center">
                  <i className={`${mode.icon} text-lg`} />
                </div>
              }
              {mode.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
