import { autoSizeTextArea } from '@/lib/autoSizeTextArea';
import { Button, ListBox, Select, Switch, TextArea, TextField, Tooltip } from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { Item, ItemWithTooltip } from '../Item';
import { useMediaQuery } from 'usehooks-ts';

export const AiPostProcessingSection = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const isPc = useMediaQuery('(min-width: 768px)');

  const [isUseAiPostProcessing, setIsUseAiPostProcessing] = useState(false);
  const [aiPostProcessingMode, setAiPostProcessingMode] = useState('comment');
  const [aiCommentPrompt, setAiCommentPrompt] = useState('');
  const [aiTagsPrompt, setAiTagsPrompt] = useState('');
  const [aiSmartEditPrompt, setAiSmartEditPrompt] = useState('');
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');

  useEffect(() => {
    blinko.config.call();
  }, []);

  useEffect(() => {
    if (blinko.config.value) {
      setIsUseAiPostProcessing(blinko.config.value.isUseAiPostProcessing || false);
      setAiPostProcessingMode(blinko.config.value.aiPostProcessingMode || 'comment');
      setAiCommentPrompt(blinko.config.value.aiCommentPrompt || '');
      setAiTagsPrompt(blinko.config.value.aiTagsPrompt || '');
      setAiSmartEditPrompt(blinko.config.value.aiSmartEditPrompt || '');
      setAiCustomPrompt(blinko.config.value.aiCustomPrompt || '');
    }
  }, [blinko.config.value]);

  const updateConfig = (key: string, value: any) => {
    PromiseCall(api.config.update.mutate({ key, value }), { autoAlert: false }).then(() => {
      blinko.config.call();
    });
  };

  return (
    <CollapsibleCard icon="hugeicons:ai-innovation-01" title="AI Post Processing">
      <Item
        leftContent={
          <ItemWithTooltip
            content={<>{t('enable-ai-post-processing')}</>}
            toolTipContent={
              <div className="w-[300px] flex flex-col gap-2">
                <div>{t('automatically-process-notes-after-creation-or-update')}</div>
                <div>{t('can-generate-summaries-tags-or-perform-analysis')}</div>
              </div>
            }
          />
        }
        rightContent={
          <Switch
            isSelected={isUseAiPostProcessing}
            onChange={(e) => {
              const checked = e;
              setIsUseAiPostProcessing(checked);
              updateConfig('isUseAiPostProcessing', checked);
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb></Switch.Thumb>
              </Switch.Control>
            </Switch.Content>
          </Switch>
        }
      />

      {isUseAiPostProcessing && (
        <>
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <div>{t('ai-post-processing-mode')}</div>
                <div className="text-[12px] text-default-400">{t('choose-what-to-do-with-ai-results')}</div>
              </div>
            }
            rightContent={
              <Select
                className={['w-[200px]', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
                value={aiPostProcessingMode}
                onChange={(selectedValue) => {
                  const value = selectedValue as string;
                  setAiPostProcessingMode(value);
                  updateConfig('aiPostProcessingMode', value);
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="comment" id={'comment'} textValue={t('add-as-comment')}>
                      {<Icon icon="tabler:message" />}
                      {t('add-as-comment')}
                    </ListBox.Item>
                    <ListBox.Item key="tags" id={'tags'} textValue={t('auto-add-tags')}>
                      {<Icon icon="tabler:tags" />}
                      {t('auto-add-tags')}
                    </ListBox.Item>
                    <ListBox.Item key="smartEdit" id={'smartEdit'} textValue={t('smart-edit')}>
                      {<Icon icon="tabler:robot" />}
                      {t('smart-edit')}
                    </ListBox.Item>
                    <ListBox.Item key="both" id={'both'} textValue={t('both')}>
                      {<Icon icon="tabler:analyze" />}
                      {t('both')}
                    </ListBox.Item>
                    <ListBox.Item key="custom" id={'custom'} textValue={t('custom')}>
                      {<Icon icon="tabler:code" />}
                      {t('custom')}
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            }
          />

          {(aiPostProcessingMode === 'comment' || aiPostProcessingMode === 'both') && (
            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {t('ai-post-processing-prompt')}
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={0}>
                        <Icon icon="proicons:info" width="18" height="18" />
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {
                          <div className="w-[300px] flex flex-col gap-2">
                            <div>{t('define-custom-prompt-for-ai-to-process-notes')}</div>
                          </div>
                        }
                      </Tooltip.Content>
                    </Tooltip>
                  </div>
                  <div className="text-[12px] text-default-400">{t('prompt-used-for-post-processing-notes')}</div>
                </div>
              }
              rightContent={
                <TextField
                  value={
                    aiCommentPrompt ||
                    t('analyze-the-following-note-content-and-suggest-appropriate-tags-and-provide-a-brief-summary')
                  }
                  className={['w-full', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
                >
                  <TextArea ref={(element) => element ? autoSizeTextArea(element) : undefined}
                    onBlur={(e) => {
                      updateConfig('aiCommentPrompt', e.target.value);
                    }}
                    onChange={(e) => {
                      setAiCommentPrompt(e.target.value);
                    }}
                    placeholder={t('enter-custom-prompt-for-post-processing')}
                  />
                </TextField>
              }
            />
          )}

          {(aiPostProcessingMode === 'tags' || aiPostProcessingMode === 'both') && (
            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">{t('tags-prompt')}</div>
                  <div className="text-[12px] text-default-400">
                    {t(
                      'greater-than-prompt-used-for-auto-generating-tags-if-set-empty-the-default-prompt-will-be-used'
                    )}
                  </div>
                </div>
              }
              rightContent={
                <TextField
                  value={
                    aiTagsPrompt ||
                    `You are a precise label classification expert, and you will generate precisely matched content labels based on the content. Rules:
      1. **Core Selection Principle**: Select 5 to 8 tags from the existing tag list that are most relevant to the content theme. Carefully compare the key information, technical types, application scenarios, and other elements of the content to ensure that the selected tags accurately reflect the main idea of the content.
      2. **Language Matching Strategy**: If the language of the existing tags does not match the language of the content, give priority to using the language of the existing tags to maintain the consistency of the language style of the tag system.
      3. **Tag Structure Requirements**: When using existing tags, it is necessary to construct a parent-child hierarchical structure. For example, place programming language tags under parent tags such as #Code or #Programming, like #Code/JavaScript, #Programming/Python. When adding new tags, try to classify them under appropriate existing parent tags as well.
      4. **New Tag Generation Rules**: If there are no tags in the existing list that match the content, create new tags based on the key technologies, business fields, functional features, etc. of the content. The language of the new tags should be consistent with that of the content.
      5. **Response Format Specification**: Only return tags separated by commas. There should be no spaces between tags, and no formatting or code blocks should be used. Each tag should start with #, such as #JavaScript.
      6. **Example**: For JavaScript content related to web development, a reference response could be #Programming/Languages, #Web/Development, #Code/JavaScript, #Front-End Development/Frameworks (if applicable), #Browser Compatibility. It is strictly prohibited to respond in formats such as code blocks, JSON, or Markdown. Just provide the tags directly.
         `
                  }
                  className={['w-full md:w-[400px]', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
                >
                  <TextArea ref={(element) => element ? autoSizeTextArea(element) : undefined}
                    onBlur={(e) => {
                      updateConfig('aiTagsPrompt', e.target.value);
                    }}
                    onChange={(e) => {
                      setAiTagsPrompt(e.target.value);
                    }}
                    placeholder="Enter custom prompt for auto-generating tags"
                  />
                </TextField>
              }
            />
          )}

          {aiPostProcessingMode === 'smartEdit' && (
            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {t('smart-edit-prompt')}
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={0}>
                        <Icon icon="proicons:info" width="18" height="18" />
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {
                          <div className="w-[300px] flex flex-col gap-2">
                            <div>{t('define-instructions-for-ai-to-edit-your-notes')}</div>
                          </div>
                        }
                      </Tooltip.Content>
                    </Tooltip>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      className={['bg-warning text-warning-foreground', 'ml-2'].filter(Boolean).join(' ')}
                      variant="primary"
                    >
                      {t('function-call-required')}
                    </Button>
                  </div>
                </div>
              }
              rightContent={
                <TextField
                  value={aiSmartEditPrompt}
                  className={['w-full', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
                >
                  <TextArea ref={(element) => element ? autoSizeTextArea(element) : undefined}
                    onBlur={(e) => {
                      updateConfig('aiSmartEditPrompt', e.target.value);
                    }}
                    onChange={(e) => {
                      if (!aiSmartEditPrompt) {
                        setAiSmartEditPrompt(e.target.value);
                      } else {
                        setAiSmartEditPrompt(e.target.value);
                      }
                    }}
                  />
                </TextField>
              }
            />
          )}

          {aiPostProcessingMode === 'custom' && (
            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div>{t('custom-ai-prompt')}</div>
                  <div className="text-[12px] text-default-400">
                    {t('available-variables')}:
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="ml-2"
                      onPress={() => {
                        setAiCustomPrompt((prev) => (prev || '') + ' {tags}');
                      }}
                    >
                      {'{tags}'}
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="ml-2"
                      onPress={() => {
                        setAiCustomPrompt((prev) => (prev || '') + ' {note}');
                      }}
                    >
                      {'{note}'}
                    </Button>
                  </div>
                </div>
              }
              rightContent={
                <TextField
                  value={
                    aiCustomPrompt ||
                    'Analyze the note content and provide feedback. Use the available tools to implement your suggestions. Available tags: {tags}'
                  }
                  className={['w-full md:w-[400px]', 'rounded-' + 'lg'].filter(Boolean).join(' ')}
                >
                  <TextArea
                    ref={(element) => {
                      if (element) return autoSizeTextArea(element, { minRows: 4, maxRows: 8 });
                    }}
                    id="custom-ai-prompt"
                    onChange={(e) => {
                      setAiCustomPrompt(e.target.value);
                    }}
                    onBlur={(e) => {
                      updateConfig('aiCustomPrompt', e.target.value);
                    }}
                    placeholder={t('enter-custom-prompt')}
                    rows={4}
                  />
                </TextField>
              }
            />
          )}
        </>
      )}
    </CollapsibleCard>
  );
});
