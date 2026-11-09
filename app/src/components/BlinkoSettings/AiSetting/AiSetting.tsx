import { Button, InputGroup, ListBox, Select, TextField } from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoStore } from '@/store/blinkoStore';
import { UserStore } from '@/store/user';
import ProviderCard from './ProviderCard';
import ProviderDialogContent from './ProviderDialogContent';
import { DefaultModelsSection } from './DefaultModelsSection';
import { GlobalPromptSection } from './GlobalPromptSection';
import { AiPostProcessingSection } from './AiPostProcessingSection';
import { AiToolsSection } from './AiToolsSection';
import { EmbeddingSettingsSection } from './EmbeddingSettingsSection';
import ModelDialogContent from './ModelDialogContent';
import { McpServersSection } from './McpServersSection';
import { AiSettingStore } from '@/store/aiSettingStore';
import { Copy } from '../../Common/Copy';
import { MarkdownRender } from '../../Common/MarkdownRender';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';

type McpTransportExample = 'streamable-http' | 'sse';

export default observer(function AiSetting() {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
  const blinko = RootStore.Get(BlinkoStore);
  const user = RootStore.Get(UserStore);
  const [selectedTransport, setSelectedTransport] = useState<McpTransportExample>('streamable-http');
  const streamableHttpEndpoint = getBlinkoEndpoint('/mcp');
  const sseEndpoint = getBlinkoEndpoint('/sse');
  const selectedEndpoint = selectedTransport === 'streamable-http' ? streamableHttpEndpoint : sseEndpoint;
  const mcpClientConfig = JSON.stringify(
    {
      mcpServers: {
        blinko: {
          url: selectedEndpoint,
          headers: {
            Authorization: `Bearer ${user.userInfo.value?.token || ''}`,
          },
        },
      },
    },
    null,
    2
  );

  useEffect(() => {
    blinko.config.call();
    aiStore.aiProviders.call();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <CollapsibleCard icon="hugeicons:ai-magic" title="AI Providers & Models">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              size="md"
              className="ml-auto"
              onPress={() => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: '2xl',
                  title: 'Add Provider',
                  content: <ProviderDialogContent />,
                });
              }}
              variant="primary"
            >
              {<Icon icon="iconamoon:cloud-add-light" width="20" height="20" />}
              {t('add-provider')}
            </Button>
          </div>

          {aiStore.aiProviders.value?.map((provider) => (
            <ProviderCard key={provider.id} provider={provider as any} />
          ))}
        </div>
      </CollapsibleCard>

      <DefaultModelsSection />

      <EmbeddingSettingsSection />

      <GlobalPromptSection />

      <AiPostProcessingSection />

      <AiToolsSection />

      <McpServersSection />

      <CollapsibleCard icon="hugeicons:api" title="MCP Integration">
        <div className="space-y-4">
          <div className="text-sm text-default-600 mb-4">
            {t(
              'mcp-integration-desc',
              'Model Context Protocol (MCP) integration allows AI assistants to connect to Blinko and use its tools.'
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-default-700">Streamable HTTP Endpoint URL</label>
              <TextField value={streamableHttpEndpoint} className={'mt-1'}>
                <InputGroup>
                  <InputGroup.Input readOnly />
                  <InputGroup.Suffix>{<Copy size={20} content={streamableHttpEndpoint} />}</InputGroup.Suffix>
                </InputGroup>
              </TextField>
              <p className="mt-1 text-xs text-success-600">
                {t('mcp-streamable-http-recommended', 'Recommended for modern MCP clients.')}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-default-700">Legacy SSE Endpoint URL</label>
              <TextField value={sseEndpoint} className={'mt-1'}>
                <InputGroup>
                  <InputGroup.Input readOnly />
                  <InputGroup.Suffix>{<Copy size={20} content={sseEndpoint} />}</InputGroup.Suffix>
                </InputGroup>
              </TextField>
              <p className="mt-1 text-xs text-default-500">
                {t('mcp-sse-legacy-desc', 'Use this only if your MCP client does not support Streamable HTTP yet.')}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-default-700">Authorization Token</label>
              <TextField value={user.userInfo.value?.token || ''} className={'mt-1'}>
                <InputGroup>
                  <InputGroup.Input readOnly type="password" />
                  <InputGroup.Suffix>{<Copy size={20} content={user.userInfo.value?.token ?? ''} />}</InputGroup.Suffix>
                </InputGroup>
              </TextField>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="text-sm font-medium text-default-700">MCP Client Configuration</label>
                <Select
                  aria-label={t('transport-type')}
                  onChange={(selectedValue) => setSelectedTransport(String(selectedValue ?? '') as McpTransportExample)}
                  className="w-full sm:max-w-xs"
                  value={selectedTransport}
                >
                  <Select.Trigger className={'min-h-10 h-10'}>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item key="streamable-http" id={'streamable-http'}>
                        Streamable HTTP (Recommended)
                      </ListBox.Item>
                      <ListBox.Item key="sse" id={'sse'}>
                        SSE (Legacy)
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <div className="relative">
                <Copy size={20} content={mcpClientConfig} className="absolute top-4 right-2 z-10" />
                <MarkdownRender
                  content={`\`\`\`json
${mcpClientConfig}
\`\`\``}
                />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
});
