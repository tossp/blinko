import { Button, Dropdown } from '@heroui/react';

import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';

interface LanguageSwitcherProps {
  value?: string;
  onChange?: (value: string) => void;
}

const LanguageSwitcher = ({ value, onChange }: LanguageSwitcherProps = {}) => {
  const baseStore = RootStore.Get(BaseStore);
  const { i18n } = useTranslation();

  function onSelectChange(nextLocale: string) {
    baseStore.changeLanugage(i18n, nextLocale);
    onChange?.(nextLocale);
  }

  const currentLocale = value || baseStore.locale.value;

  return (
    <Dropdown>
      <Button variant="tertiary">
        {<Icon icon="hugeicons:global" width="24" height="24" />}
        {baseStore.locales.find((i) => i.value === currentLocale)?.label}
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu className="p-2 space-y-1">
          {baseStore.locales.map((locale) => (
            <Dropdown.Item
              key={locale.value}
              className="flex items-center justify-between cursor-pointer"
              id={locale.value}
              onAction={() => {
                onSelectChange(locale.value);
              }}
            >
              <div className="flex items-center justify-between">
                {' '}
                {locale.label}
                {currentLocale === locale.value && <Icon icon="mingcute:check-fill" width="18" height="18" />}
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};

export default LanguageSwitcher;
