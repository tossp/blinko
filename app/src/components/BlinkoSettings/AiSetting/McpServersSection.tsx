import { autoSizeTextArea } from '@/lib/autoSizeTextArea';
import { Button, Card, Chip, Description, Input, Label, ListBox, Select, Spinner, Switch, TextArea, TextField, Tooltip } from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { AiSettingStore, McpServer } from '@/store/aiSettingStore';

interface McpServerFormData {
  name: string;
  description: string;
  type: 'stdio' | 'sse' | 'streamable-http';
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  isEnabled: boolean;
}

const defaultFormData: McpServerFormData = {
  name: '',
  description: '',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
  isEnabled: true,
};

const McpServerDialogContent = observer(({ server, onClose }: { server?: McpServer; onClose: () => void }) => {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
  const [formData, setFormData] = useState<McpServerFormData>(() => {
    if (server) {
      return {
        name: server.name,
        description: server.description || '',
        type: server.type as 'stdio' | 'sse' | 'streamable-http',
        command: server.command || '',
        args: Array.isArray(server.args) ? (server.args as string[]).join('\n') : '',
        url: server.url || '',
        env: server.env ? JSON.stringify(server.env, null, 2) : '',
        headers: server.headers ? JSON.stringify(server.headers, null, 2) : '',
        isEnabled: server.isEnabled,
      };
    }
    return defaultFormData;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const endpointPlaceholder = formData.type === 'sse'
    ? 'https://mcp-server.example.com/sse'
    : 'https://mcp-server.example.com/mcp';

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const data: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        isEnabled: formData.isEnabled,
      };

      if (formData.type === 'stdio') {
        data.command = formData.command.trim();
        data.args = formData.args.trim() ? formData.args.split('\n').map(s => s.trim()).filter(Boolean) : undefined;
        if (formData.env.trim()) {
          try {
            data.env = JSON.parse(formData.env);
          } catch (e) {
            console.error('Invalid env JSON');
          }
        }
      } else {
        data.url = formData.url.trim();
        if (formData.headers.trim()) {
          try {
            data.headers = JSON.parse(formData.headers);
          } catch (e) {
            console.error('Invalid headers JSON');
          }
        }
      }

      if (server) {
        await aiStore.updateMcpServer.call({ id: server.id, ...data });
      } else {
        await aiStore.createMcpServer.call(data);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <TextField value={formData.name} isRequired><Label>{t('name')}</Label><Input onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., GitHub MCP Server" /></TextField>

      <TextField value={formData.description}><Label>{t('description')}</Label><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 2,  }); }} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" rows={2} /></TextField>

      <Select onChange={(selectedValue) => setFormData({ ...formData, type: String(selectedValue ?? '') as any })} value={formData.type}><Label>{t('transport-type')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger><Select.Popover><ListBox><ListBox.Item key="stdio" id={"stdio"} textValue="stdio (Local Process)">stdio (Local Process)</ListBox.Item><ListBox.Item key="sse" id={"sse"} textValue="SSE (Server-Sent Events)">SSE (Server-Sent Events)</ListBox.Item><ListBox.Item key="streamable-http" id={"streamable-http"} textValue="Streamable HTTP">Streamable HTTP</ListBox.Item></ListBox></Select.Popover></Select>

      {formData.type === 'stdio' ? (
        <>
          <TextField value={formData.command} isRequired><Label>{t('command')}</Label><Input onChange={(e) => setFormData({ ...formData, command: e.target.value })} placeholder="e.g., npx" /><Description>{"The command to execute"}</Description></TextField>

          <TextField value={formData.args}><Label>{t('arguments')}</Label><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 3,  }); }} onChange={(e) => setFormData({ ...formData, args: e.target.value })} placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/allowed/directory" rows={3} /><Description>{"One argument per line"}</Description></TextField>

          <TextField value={formData.env}><Label>{t('environment-variables')}</Label><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 3,  }); }} onChange={(e) => setFormData({ ...formData, env: e.target.value })} placeholder='{"GITHUB_TOKEN": "your-token"}' rows={3} /><Description>{"JSON object of environment variables"}</Description></TextField>
        </>
      ) : (
        <>
          <TextField value={formData.url} isRequired><Label>{"URL"}</Label><Input onChange={(e) => setFormData({ ...formData, url: e.target.value })} placeholder={endpointPlaceholder} /><Description>{"The MCP server endpoint URL"}</Description></TextField>

          <TextField value={formData.headers}><Label>{t('http-headers')}</Label><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 3,  }); }} onChange={(e) => setFormData({ ...formData, headers: e.target.value })} placeholder='{"Authorization": "Bearer your-token"}' rows={3} /><Description>{"JSON object of HTTP headers"}</Description></TextField>
        </>
      )}

      <div className="flex items-center gap-2">
        <Switch isSelected={formData.isEnabled} onChange={(checked) => setFormData({ ...formData, isEnabled: checked })}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control><Label>{t('enabled')}</Label></Switch.Content></Switch>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="tertiary" onPress={onClose}>{t('cancel')}</Button>
        <Button onPress={handleSubmit} isDisabled={!formData.name.trim() || (formData.type === 'stdio' ? !formData.command.trim() : !formData.url.trim())} variant="primary" isPending={isSubmitting}>{isSubmitting ? <Spinner color="current" size="sm" /> : null}{server ? t('save') : t('create')}</Button>
      </div>
    </div>
  );
});

const ToolsListDialog = observer(({ server, tools, onClose }: { server: McpServer; tools: Array<{ name: string; description?: string }>; onClose: () => void }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="text-sm text-default-600">
        {t('mcp-server-tools', `Tools available from ${server.name}:`).replace('{{serverName}}', server.name)}
      </div>

      <div className="max-h-96 overflow-y-auto">
        <div className="space-y-2">
          {tools.map((tool, index) => (
            <Card key={index} className="bg-default-50"><Card.Content className="p-3"><div className="font-medium text-default-900">{tool.name}</div>{tool.description && (
                  <div className="text-sm text-default-500 mt-1">{tool.description}</div>
                )}</Card.Content></Card>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="tertiary" onPress={onClose}>{t('close', 'Close')}</Button>
      </div>
    </div>
  );
});

const McpServerCard = observer(({ server }: { server: McpServer }) => {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; toolCount?: number; tools?: Array<{ name: string; description?: string }>; error?: string } | null>(null);

  const connectionStatus = aiStore.mcpConnectionStatus.value?.find(s => s.serverId === server.id);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await aiStore.testMcpConnection.call(server.id);
      setTestResult(result as any);
    } catch (error: any) {
      setTestResult({ success: false, error: error?.message || 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleViewTools = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await aiStore.testMcpConnection.call(server.id);
      if (result.success && result.tools && result.tools.length > 0) {
        RootStore.Get(DialogStore).setData({
          isOpen: true,
          size: 'lg',
          title: t('view-tools', `Tools from ${server.name}`).replace('{{serverName}}', server.name),
          content: <ToolsListDialog server={server} tools={result.tools} onClose={() => RootStore.Get(DialogStore).close()} />,
        });
      } else {
        setTestResult(result as any);
      }
    } catch (error: any) {
      setTestResult({ success: false, error: error?.message || 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleEdit = () => {
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'lg',
      title: t('edit-mcp-server'),
      content: <McpServerDialogContent server={server} onClose={() => RootStore.Get(DialogStore).close()} />,
    });
  };

  const handleDelete = async () => {
    if (confirm(t('confirm-delete-mcp-server'))) {
      await aiStore.deleteMcpServer.call(server.id);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    await aiStore.toggleMcpServer.call(server.id, enabled);
  };

  return (
    <Card className="bg-default-50"><Card.Content className="p-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="font-medium text-default-900 truncate">{server.name}</h4>
              <Chip size="sm" variant={"soft"} color="accent"><Chip.Label>{server.type}</Chip.Label></Chip>
              {connectionStatus?.isConnected && connectionStatus.toolCount > 0 && (
                <Button size="sm" variant="tertiary" className={["bg-success/20 text-success", "h-6 min-w-0 px-2"].filter(Boolean).join(' ')} onPress={handleViewTools}><Icon icon="mdi:connection" className="mr-1" width="14" /><span className="hidden sm:inline">{connectionStatus.toolCount} tools</span><span className="sm:hidden">{connectionStatus.toolCount}</span></Button>
              )}
            </div>
            {server.description && (
              <p className="text-sm text-default-500 truncate">{server.description}</p>
            )}
            <div className="text-xs text-default-400 mt-1 break-all">
              {server.type === 'stdio' ? (
                <span className="font-mono">{server.command} {Array.isArray(server.args) ? (server.args as string[]).join(' ') : ''}</span>
              ) : (
                <span className="font-mono">{server.url}</span>
              )}
            </div>
            {testResult && (
              <div className={`text-sm mt-2 ${testResult.success ? 'text-success' : 'text-danger'}`}>
                {testResult.success ? (
                  <span>✓ Connected - {testResult.toolCount} tools available</span>
                ) : (
                  <span>✗ {testResult.error}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
            <Switch size="sm" isSelected={server.isEnabled} onChange={handleToggle}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>
            <Tooltip><Tooltip.Trigger tabIndex={0}><Button isIconOnly size="sm" variant="tertiary" onPress={handleTest} isPending={isTesting}>{isTesting ? <Spinner color="current" size="sm" /> : null}<Icon icon="mdi:connection" width="18" /></Button></Tooltip.Trigger><Tooltip.Content>{t('test-connection')}</Tooltip.Content></Tooltip>
            <Tooltip><Tooltip.Trigger tabIndex={0}><Button isIconOnly size="sm" variant="tertiary" onPress={handleEdit}><Icon icon="mdi:pencil" width="18" /></Button></Tooltip.Trigger><Tooltip.Content>{t('edit')}</Tooltip.Content></Tooltip>
            <Tooltip><Tooltip.Trigger tabIndex={0}><Button isIconOnly size="sm" variant="danger-soft" onPress={handleDelete}><Icon icon="mdi:delete" width="18" /></Button></Tooltip.Trigger><Tooltip.Content>{t('delete')}</Tooltip.Content></Tooltip>
          </div>
        </div></Card.Content></Card>
  );
});

// Parse mcp.json format (Cursor MCP config format)
function parseMcpJson(jsonContent: string): Array<{
  name: string;
  type: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}> {
  try {
    const config = JSON.parse(jsonContent);
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Invalid mcp.json format: missing mcpServers');
    }

    const servers: ReturnType<typeof parseMcpJson> = [];
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const config = serverConfig as any;

      if (config.command || config.args) {
        // stdio transport
        servers.push({
          name,
          type: 'stdio' as const,
          command: config.command || 'npx',
          args: config.args || [],
          env: config.env || undefined,
        });
      } else if (config.url) {
        // SSE or Streamable HTTP transport
        // Try to detect by URL or default to streamable-http
        const url = config.url;
        const isSSE = url.includes('/sse') || url.endsWith('sse');
        servers.push({
          name,
          type: isSSE ? 'sse' : ('streamable-http' as const),
          url,
          headers: config.headers || undefined,
        });
      } else {
        throw new Error(`Invalid server config for ${name}: must have either command/args or url`);
      }
    }
    return servers;
  } catch (error: any) {
    throw new Error(`Failed to parse mcp.json: ${error.message}`);
  }
}

const ImportMcpJsonDialog = observer(({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
  const [jsonContent, setJsonContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!jsonContent.trim()) {
      setError(t('please-paste-json', 'Please paste mcp.json content'));
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const servers = parseMcpJson(jsonContent);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const server of servers) {
        try {
          await aiStore.createMcpServer.call({
            name: server.name,
            type: server.type,
            command: server.command,
            args: server.args,
            url: server.url,
            headers: server.headers,
            env: server.env,
            isEnabled: true,
          });
          successCount++;
        } catch (error: any) {
          console.error(`Failed to create server ${server.name}:`, error);
          errorCount++;
          errors.push(`${server.name}: ${error?.message || 'Unknown error'}`);
        }
      }

      if (successCount > 0) {
        await aiStore.mcpServers.call();
        if (errorCount > 0) {
          setError(`Successfully imported ${successCount} server(s), ${errorCount} failed:\n${errors.join('\n')}`);
        } else {
          onClose();
        }
      } else {
        setError(`Failed to import: ${errors.join('\n')}`);
      }
    } catch (error: any) {
      setError(`Failed to parse mcp.json: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-default-600">
        {t('paste-mcp-json-desc', 'Paste your mcp.json content here. It will automatically convert and create MCP servers.')}
      </div>

      <TextField value={jsonContent} className={"font-mono text-sm"}><Label>{t('mcp-json-content', 'mcp.json Content')}</Label><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 10,  }); }} onChange={(e) => {
          setJsonContent(e.target.value);
          setError(null);
        }} placeholder={`{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-xxx"]\n    }\n  }\n}`} rows={10} /></TextField>

      {error && (
        <div className="text-sm text-danger bg-danger-50 p-3 rounded">
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="tertiary" onPress={onClose} isDisabled={isImporting}>{t('cancel')}</Button>
        <Button onPress={handleImport} isDisabled={!jsonContent.trim()} variant="primary" isPending={isImporting}>{isImporting ? <Spinner color="current" size="sm" /> : null}{t('import', 'Import')}</Button>
      </div>
    </div>
  );
});

export const McpServersSection = observer(() => {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);

  useEffect(() => {
    aiStore.mcpServers.call();
    aiStore.mcpConnectionStatus.call();
  }, []);

  const handleAddServer = () => {
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'lg',
      title: t('add-mcp-server'),
      content: <McpServerDialogContent onClose={() => RootStore.Get(DialogStore).close()} />,
    });
  };

  const handleImportJson = () => {
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'lg',
      title: t('import-mcp-json', 'Import mcp.json'),
      content: <ImportMcpJsonDialog onClose={() => RootStore.Get(DialogStore).close()} />,
    });
  };

  return (
    <CollapsibleCard icon="simple-icons:mcp" title={t('mcp-client-servers')}>
      <div className="space-y-4">
        <div className="text-sm text-default-600 mb-4">
          {t('mcp-client-servers-desc', 'Configure external MCP servers that the AI can connect to and use their tools. These tools will be available during AI conversations.')}
        </div>

        <div className="flex justify-end items-center gap-2 flex-wrap">
          <Button size="md" variant="tertiary" onPress={handleAddServer} className="flex-shrink-0">{<Icon icon="mdi:plus" width="20" height="20" />}<span className="hidden sm:inline">{t('add-mcp-server')}</span><span className="sm:hidden">{t('add', 'Add')}</span></Button>
          <Button size="md" onPress={handleImportJson} className="flex-shrink-0" variant="primary">{<Icon icon="mdi:content-paste" width="20" height="20" />}<span className="hidden sm:inline">{t('import-mcp-json', 'Import mcp.json')}</span><span className="sm:hidden">{t('import', 'Import')}</span></Button>
        </div>

        <div className="space-y-3">
          {aiStore.mcpServers.value?.map(server => (
            <McpServerCard key={server.id} server={server as McpServer} />
          ))}

          {(!aiStore.mcpServers.value || aiStore.mcpServers.value.length === 0) && (
            <div className="text-center py-8 text-default-400">
              <Icon icon="simple-icons:mcp" width="48" className="mx-auto mb-2 opacity-50" />
              <p>{t('no-mcp-servers', 'No MCP servers configured')}</p>
              <p className="text-sm mt-1">{t('import-mcp-json-hint', 'Click "Import mcp.json" to paste your MCP configuration, or manually add servers')}</p>
            </div>
          )}
        </div>

      </div>
    </CollapsibleCard>
  );
});
