import { Button, Card, ListBox, Popover, RangeCalendar, Select } from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { RootStore } from '@/store';
import { PromiseCall } from '@/store/standard/PromiseState';
import dayjs from '@/lib/dayjs';
import { api } from '@/lib/trpc';
import { Item } from './Item';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { today, getLocalTimeZone } from '@internationalized/date';
import { helper } from '@/lib/helper';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '@/components/Common/CollapsibleCard';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { downloadFromLink } from '@/lib/tauriHelper';

export const ExportSetting = observer(() => {
  const { t } = useTranslation();
  const [exportFormat, setExportFormat] = useState('markdown');

  const [dateRange, setDateRange] = useState<{
    start: any;
    end: any;
  }>({
    start: null,
    end: null,
  });
  const [focusedValue, setFocusedValue] = useState(today(getLocalTimeZone()));

  const now = today(getLocalTimeZone());

  const formatOptions = [
    { label: 'Markdown', value: 'markdown' },
    { label: 'JSON', value: 'json' },
    { label: 'CSV', value: 'csv' },
  ];

  const handleExport = async () => {
    RootStore.Get(ToastPlugin).loading(t('exporting'), { id: 'exporting' });
    const exportParams: any = {
      baseURL: window.location.origin,
      format: exportFormat as 'markdown' | 'csv' | 'json',
    };

    if (dateRange.start && dateRange.end) {
      exportParams.startDate = new Date(dateRange.start.toString());
      exportParams.endDate = new Date(dateRange.end.toString());
    }
    try {
      const res = await PromiseCall(api.task.exportMarkdown.mutate(exportParams));
      RootStore.Get(ToastPlugin).dismiss('exporting');
      if (res?.downloadUrl) {
        downloadFromLink(getBlinkoEndpoint(res.downloadUrl));
      }
    } catch (error) {
      RootStore.Get(ToastPlugin).error(error.message);
    }
  };

  return (
    <CollapsibleCard icon="tabler:file-export" title={t('export')}>
      <Card className={['flex flex-col p-4 bg-background', 'shadow-' + 'none'].filter(Boolean).join(' ')}>
        <Item
          leftContent={<>{t('export-format')}</>}
          rightContent={
            <Select
              onChange={(selectedValue) => setExportFormat(String(selectedValue ?? ''))}
              className="w-[200px]"
              value={exportFormat}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {formatOptions.map((item) => (
                    <ListBox.Item key={item.value} id={item.value} textValue={t(item.label)}>
                      {t(item.label)}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          }
        />
        <Item
          leftContent={<>{t('time-range')}</>}
          rightContent={
            <Popover>
              <Popover.Trigger tabIndex={0}>
                <Button variant="tertiary">
                  {dateRange.start && dateRange.end
                    ? `${dayjs(new Date(dateRange.start.toString())).format('YYYY-MM-DD')} ~ ${dayjs(new Date(dateRange.end.toString())).format('YYYY-MM-DD')}`
                    : t('all')}
                </Button>
              </Popover.Trigger>
              <Popover.Content
                placement={'bottom'}
                className={[['p-0 bg-transparent border-none shadow-none']].flat().filter(Boolean).join(' ')}
              >
                <Popover.Dialog>
                  <div className="flex flex-col gap-2">
                    <RangeCalendar
                      className="bg-background"
                      value={dateRange.start && dateRange.end ? dateRange : undefined}
                      onChange={setDateRange}
                      focusedValue={focusedValue}
                      onFocusChange={setFocusedValue}
                    >
                      <RangeCalendar.Header>
                        <RangeCalendar.NavButton slot="previous" />
                        <RangeCalendar.Heading />
                        <RangeCalendar.NavButton slot="next" />
                      </RangeCalendar.Header>
                      <RangeCalendar.Grid>
                        <RangeCalendar.GridHeader>
                          {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                        </RangeCalendar.GridHeader>
                        <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
                      </RangeCalendar.Grid>
                    </RangeCalendar>
                  </div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          }
        />
        <div className="flex justify-end">
          <Button className="mt-4" onPress={handleExport} variant="primary">
            {<Icon icon="system-uicons:arrow-top-right" width="24" height="24" />}
            {t('export')}
          </Button>
        </div>
      </Card>
    </CollapsibleCard>
  );
});
