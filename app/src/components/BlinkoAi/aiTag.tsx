import { Button, CheckboxGroup, Label, Radio, RadioGroup } from '@heroui/react';
import React from 'react';

import { CustomCheckbox } from '../Common/CustomCheckbox';
import { useTranslation } from 'react-i18next';

interface AiTagProps {
  tags: string[];
  defaultSelected?: string[];
  onSelect: (selected: string[], isInsertBefore: boolean) => void;
  confirmText?: string;
  label?: string;
}

export const AiTag: React.FC<AiTagProps> = ({ tags, defaultSelected = [], onSelect }) => {
  const [selected, setSelected] = React.useState<string[]>(defaultSelected);
  const [isInsertBefore, setIsInsertBefore] = React.useState(false);
  const { t } = useTranslation();
  const handleConfirm = () => {
    onSelect(selected, isInsertBefore);
  };

  const handleSelectAll = () => {
    setSelected(tags);
  };

  return (
    <div className="flex flex-col gap-4">
      <CheckboxGroup className="gap-1" value={selected} onChange={setSelected}>
        {tags.map((tag) => (
          <CustomCheckbox key={tag} value={tag}>
            {tag}
          </CustomCheckbox>
        ))}
      </CheckboxGroup>
      <div className="flex mt-2 gap-2 items-center">
        <RadioGroup
          orientation="horizontal"
          className="flex-1"
          value={isInsertBefore ? 'insert-before' : 'insert-after'}
          onChange={(e) => {
            setIsInsertBefore(e === 'insert-before');
          }}
        >
          <Radio value="insert-before">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>{t('insert-before')}</Label>
            </Radio.Content>
          </Radio>
          <Radio value="insert-after">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>{t('insert-after')}</Label>
            </Radio.Content>
          </Radio>
        </RadioGroup>
        <Button variant="tertiary" onPress={handleSelectAll}>
          {t('select-all')}
        </Button>
        <Button onPress={handleConfirm} className="w-fit ml-auto" variant="primary">
          {t('confirm')}
        </Button>
      </div>
    </div>
  );
};
