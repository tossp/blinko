import {
  Button,
  Chip,
  InputGroup,
  ListBox,
  ProgressBar,
  Select,
  Switch,
  Table,
  TextField,
  Tooltip,
} from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { helper } from '@/lib/helper';
import dayjs from '@/lib/dayjs';
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from '@/lib/trpc';
import { Item } from './Item';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { _ } from '@/lib/lodash';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { downloadFromLink } from '@/lib/tauriHelper';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { PromiseState } from '@/store/standard/PromiseState';

const UpdateDebounceCall = _.debounce((v) => {
  return PromiseCall(api.config.update.mutate({ key: 'autoArchivedDays', value: Number(v) }));
}, 500);

export const TaskSetting = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const [autoArchivedDays, setAutoArchivedDays] = useState('90');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (blinko.config.value?.autoArchivedDays) {
      setAutoArchivedDays(String(blinko.config.value?.autoArchivedDays));
    }
  }, [blinko.config.value?.autoArchivedDays]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (polling) {
      timer = setInterval(() => {
        blinko.task.call();
      }, 1000);
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [polling]);

  const { t } = useTranslation();
  return (
    <CollapsibleCard icon="tabler:clock" title={t('schedule-task')}>
      {/* TODO: Temporarily disabled backup database feature
      <Item
        leftContent={<>{t('schedule-back-up')}</>}
        rightContent={
          <Switch
            thumbIcon={blinko.updateDBTask.loading.value ? <Icon icon="eos-icons:three-dots-loading" width="24" height="24" /> : null}
            isDisabled={blinko.updateDBTask.loading.value}
            isSelected={blinko.DBTask?.isRunning}
            onChange={async e => {
              setPolling(true);
              await blinko.updateDBTask.call(e.target.checked);
              setPolling(false);
            }}
          />} />
      */}
      <Item
        leftContent={<>{t('schedule-archive-blinko')}</>}
        rightContent={
          <div className="flex gap-4">
            <TextField value={autoArchivedDays} className={'w-[120px]'}>
              <InputGroup>
                <InputGroup.Input
                  onChange={(e) => {
                    setAutoArchivedDays(e.target.value);
                    UpdateDebounceCall(e.target.value);
                  }}
                  type="number"
                  min={1}
                />
                <InputGroup.Suffix>{t('days')}</InputGroup.Suffix>
              </InputGroup>
            </TextField>
            <Switch
              isDisabled={blinko.updateArchiveTask.loading.value}
              isSelected={blinko.ArchiveTask?.isRunning}
              onChange={async (e) => {
                await blinko.updateArchiveTask.call(e);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb>
                    {blinko.updateArchiveTask.loading.value ? (
                      <Icon icon="eos-icons:three-dots-loading" width="24" height="24" />
                    ) : null}
                  </Switch.Thumb>
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        }
      />
      <AITasksPanel />
    </CollapsibleCard>
  );
});

const AITasksPanel = observer(() => {
  const { t } = useTranslation();
  const [aiTasks, setAiTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const tasks = await api.aiTask.list.query();
      setAiTasks(tasks);
    } catch (e) {
      console.error('Failed to load AI tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleToggle = async (taskId: number, enabled: boolean) => {
    await PromiseCall(api.aiTask.toggle.mutate({ id: taskId, enabled }));
    loadTasks();
  };

  const handleDelete = async (taskId: number) => {
    await PromiseCall(api.aiTask.delete.mutate({ id: taskId }));
    loadTasks();
  };

  const handleRunNow = async (taskId: number) => {
    await PromiseCall(api.aiTask.runNow.mutate({ id: taskId }));
    loadTasks();
  };

  if (loading && aiTasks.length === 0) {
    return (
      <div className="flex justify-center py-4">
        <Icon icon="eos-icons:loading" width="24" height="24" />
      </div>
    );
  }

  if (aiTasks.length === 0) {
    return (
      <div className="text-center py-4 text-desc text-sm">
        <Icon icon="mdi:robot-outline" width="32" height="32" className="mx-auto mb-2 opacity-50" />
        <p>{t('no-ai-tasks')}</p>
        <p className="text-xs mt-1">{t('ai-task-hint')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon icon="mdi:robot" width="20" height="20" />
        <span className="font-medium">{t('ai-scheduled-tasks')}</span>
        <Chip size="sm" variant={'soft'}>
          <Chip.Label>{aiTasks.length}</Chip.Label>
        </Chip>
      </div>
      <Table className="mb-2">
        <Table.ScrollContainer>
          <Table.Content aria-label="AI Scheduled Tasks">
            <Table.Header>
              <Table.Column isRowHeader={true}>{t('name-db')}</Table.Column>
              <Table.Column isRowHeader={true}>{t('schedule')}</Table.Column>
              <Table.Column isRowHeader={true}>{t('last-run')}</Table.Column>
              <Table.Column isRowHeader={true}>{t('status')}</Table.Column>
              <Table.Column isRowHeader={true}>{t('actions')}</Table.Column>
            </Table.Header>
            <Table.Body>
              {aiTasks.map((task) => (
                <Table.Row key={task.id}>
                  <Table.Cell>
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={0}>
                        <span className="cursor-help">{task.name}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Content placement="top">{task.prompt}</Tooltip.Content>
                    </Tooltip>
                  </Table.Cell>
                  <Table.Cell>
                    <code className="text-xs bg-default-100 px-2 py-1 rounded">{task.schedule}</code>
                  </Table.Cell>
                  <Table.Cell>{task.lastRun ? dayjs(task.lastRun).fromNow() : '-'}</Table.Cell>
                  <Table.Cell>
                    <div className={`${task.isEnabled ? 'text-green-500' : 'text-gray-400'} flex items-center`}>
                      <Icon icon="bi:dot" width="24" height="24" />
                      <span>{task.isEnabled ? t('enabled') : t('disabled')}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <Tooltip.Trigger tabIndex={0}>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={() => handleToggle(task.id, !task.isEnabled)}
                          >
                            <Icon icon={task.isEnabled ? 'mdi:pause' : 'mdi:play'} width="18" height="18" />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{task.isEnabled ? t('disable') : t('enable')}</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger tabIndex={0}>
                          <Button isIconOnly size="sm" variant="ghost" onPress={() => handleRunNow(task.id)}>
                            <Icon icon="mdi:lightning-bolt" width="18" height="18" />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{t('run-now')}</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger tabIndex={0}>
                          <Button
                            className="text-danger"
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={() => handleDelete(task.id)}
                          >
                            <Icon icon="mdi:delete-outline" width="18" height="18" />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{t('delete')}</Tooltip.Content>
                      </Tooltip>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
});

const TasksPanel = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  return (
    <>
      {' '}
      {blinko.task.value && (
        <Table className="mb-2">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader={true}>{t('name-db')}</Table.Column>
                <Table.Column isRowHeader={true}>{t('schedule')}</Table.Column>
                <Table.Column isRowHeader={true}>{t('last-run')}</Table.Column>
                <Table.Column isRowHeader={true}>{t('backup-file')}</Table.Column>
                <Table.Column isRowHeader={true}>{t('status')}</Table.Column>
              </Table.Header>
              <Table.Body>
                {blinko.task
                  .value!.filter((i) => i.name != 'rebuildEmbedding')
                  .map((i) => {
                    const progress = i.output?.progress;
                    return (
                      <Table.Row>
                        <Table.Cell>{t(`task-name-${i.name}`)}</Table.Cell>
                        <Table.Cell>
                          <Select
                            onChange={async (selectedValue) => {
                              await PromiseCall(
                                api.task.upsertTask.mutate({
                                  time: String(selectedValue ?? ''),
                                  type: 'update',
                                  task: i.name as any,
                                })
                              );
                              blinko.task.call();
                            }}
                            className="w-[200px]"
                            value={i.schedule}
                          >
                            <Select.Trigger>
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                {helper.cron.cornTimeList.map((item) => (
                                  <ListBox.Item key={item.value} id={item.value}>
                                    {t(item.label)}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </Table.Cell>
                        <Table.Cell>{dayjs(i?.lastRun).fromNow()}</Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            {i.output?.filePath && (
                              <>
                                {/* @ts-ignore  */}
                                {i.output?.filePath}
                                {/* @ts-ignore  */}
                                <Icon
                                  className="cursor-pointer"
                                  onClick={(e) => downloadFromLink(getBlinkoEndpoint(i?.output?.filePath))}
                                  icon="tabler:download"
                                  width="24"
                                  height="24"
                                />
                              </>
                            )}
                            {progress && !i.output?.filePath && (
                              <div className="w-full max-w-[200px]">
                                <ProgressBar
                                  size="sm"
                                  value={progress.percent}
                                  color={'accent'}
                                  className="max-w-md"
                                  aria-label={'Progress'}
                                >
                                  {true && <ProgressBar.Output />}
                                  <ProgressBar.Track>
                                    <ProgressBar.Fill />
                                  </ProgressBar.Track>
                                </ProgressBar>
                                <div className="text-xs text-gray-500">
                                  {`${(progress.processedBytes / (1024 * 1024)).toFixed(2)} MB`}
                                </div>
                              </div>
                            )}
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <div className={`${i?.isRunning ? 'text-green-500' : 'text-red-500'} flex items-center `}>
                            <Icon icon="bi:dot" width="24" height="24" />
                            <div className="min-w-[50px]">
                              {i?.isRunning ? (progress ? `${t('running')}` : t('running')) : t('stopped')}
                            </div>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}{' '}
    </>
  );
});
