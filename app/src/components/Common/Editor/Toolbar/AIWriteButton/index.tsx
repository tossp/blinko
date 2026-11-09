import { Button, InputGroup, Popover, TextField } from '@heroui/react';
import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { EditorStore } from '../../editorStore';

import { ScrollArea } from '@/components/Common/ScrollArea';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store/root';
import { AiStore } from '@/store/aiStore';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';
import { SendIcon } from '@/components/Common/Icons';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { eventBus } from '@/lib/event';
import { PluginApiStore } from '@/store/plugin/pluginApiStore';

export const AIWriteButton = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const ai = RootStore.Get(AiStore);
  const scrollRef = useRef<any>(null);
  const pluginApi = RootStore.Get(PluginApiStore);

  const localStore = RootStore.Local(() => ({
    show: false,
    setShow: (show: boolean) => {
      localStore.show = show;
    },

    async handleSubmit() {
      if (!ai.writeQuestion.trim()) return;
      try {
        ai.writeStream('custom', blinko.isCreateMode ? blinko.noteContent : blinko.curSelectedNote!.content);
      } catch (error) {
        console.error('error:', error);
      }
    },
  }));

  useEffect(() => {
    scrollRef.current?.scrollToBottom();
  }, [ai.writingResponseText]);

  return (
    <Popover isOpen={localStore.show} onOpenChange={localStore.setShow}>
      <Popover.Trigger tabIndex={0}>
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            localStore.setShow(true);
          }}
        >
          <IconButton tooltip={t('ai-write')} icon="hugeicons:quill-write-01" />
        </div>
      </Popover.Trigger>
      <Popover.Content
        placement={'bottom start'}
        className="flex flex-col p-3 bg-background md:max-w-[500px] max-w-[full]"
      >
        <Popover.Dialog>
          <div className="flex flex-col gap-3 w-full">
            <div className="flex gap-2 items-center">
              <TextField value={ai.writeQuestion} className={'border-none'}>
                <InputGroup>
                  <InputGroup.Prefix>
                    {<Icon className="text-primary" icon="hugeicons:ai-beautify" width="16" height="16" />}
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    onChange={(e) => (ai.writeQuestion = e.target.value)}
                    placeholder={'Prompt...'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        localStore.handleSubmit();
                      }
                    }}
                  />
                  <InputGroup.Suffix>
                    {ai.isLoading ? (
                      <Icon icon="mingcute:loading-line" width="16" height="16" />
                    ) : (
                      <SendIcon
                        onClick={localStore.handleSubmit}
                        className="cursor-pointer primary-foreground group-hover:rotate-[-35deg] !transition-all"
                      />
                    )}
                  </InputGroup.Suffix>
                </InputGroup>
              </TextField>
            </div>

            <div className="flex flex-wrap gap-2">
              {pluginApi.customAiPrompts.map((prompt, index) => (
                <Button
                  className="bg-warning/20 text-warning"
                  key={index}
                  variant="tertiary"
                  size="sm"
                  onPress={() => {
                    ai.writeQuestion = prompt.prompt;
                    localStore.handleSubmit();
                  }}
                >
                  {prompt.icon && <Icon icon={prompt.icon} width="16" height="16" />}
                  {prompt.name}
                </Button>
              ))}
            </div>

            {ai.writingResponseText && (
              <ScrollArea
                ref={scrollRef}
                className="p-2 max-h-[400px] max-w-full w-full max-w-full"
                onBottom={() => {}}
              >
                {ai.isLoading ? (
                  <div className="text-sm">{ai.writingResponseText}</div>
                ) : (
                  <MarkdownRender content={ai.writingResponseText} />
                )}
              </ScrollArea>
            )}

            {ai.isWriting && (
              <div className="flex gap-2 items-center">
                <Button
                  className="text-success"
                  onPress={() => {
                    ai.isWriting = false;
                    if (ai.currentWriteType == 'polish') {
                      eventBus.emit('editor:replace', ai.writingResponseText);
                    } else {
                      eventBus.emit('editor:insert', ai.writingResponseText);
                    }
                    ai.writingResponseText = '';
                    localStore.setShow(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {<Icon icon="ic:sharp-check" className="green" />}
                  {t('accept')}
                </Button>

                <Button
                  className="text-danger"
                  onPress={() => {
                    ai.isWriting = false;
                    ai.writingResponseText = '';
                    localStore.setShow(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {<Icon icon="ic:sharp-close" className="red" />}
                  {t('reject')}
                </Button>

                <Button
                  className="text-warning"
                  onPress={() => {
                    ai.abortAiWrite();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {<Icon icon="mynaui:stop" className="blinko" />}
                  {t('stop')}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                className="bg-warning/20 text-warning"
                variant="tertiary"
                size="sm"
                onPress={() => {
                  ai.writeStream('expand', blinko.isCreateMode ? blinko.noteContent : blinko.curSelectedNote!.content);
                }}
              >
                {<Icon icon="proicons:text-expand" width="16" height="16" />}
                {t('ai-expand')}
              </Button>

              <Button
                className="bg-warning/20 text-warning"
                variant="tertiary"
                size="sm"
                onPress={() => {
                  ai.writeStream('polish', blinko.isCreateMode ? blinko.noteContent : blinko.curSelectedNote!.content);
                }}
              >
                {<Icon icon="lucide:scan-text" width="16" height="16" />}
                {t('ai-polish')}
              </Button>

              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => localStore.setShow(false)}
                className="ml-auto"
              >
                <Icon icon="material-symbols:close" width={16} height={16} />
              </Button>
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
});
