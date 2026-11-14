import {
  Button,
  Chip,
  ComboBox,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
  Tooltip,
} from '@heroui/react';
import { observer } from 'mobx-react-lite';

import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { RootStore } from '@/store';
import { AiSettingStore, AiModel, ModelCapabilities, ProviderModel } from '@/store/aiSettingStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { CAPABILITY_ICONS, CAPABILITY_LABELS, CAPABILITY_COLORS, DEFAULT_MODEL_TEMPLATES } from './constants';
import { ProviderIcon, ModelIcon } from '@/components/BlinkoSettings/AiSetting/AIIcon';
import { api } from '@/lib/trpc';

// Utility function to format test connection results
const formatTestResults = (result: any, t: (key: string) => string): string => {
  const details: string[] = [];

  if (result?.capabilities?.inference?.success) {
    const response = result.capabilities.inference.response || '';
    details.push(`Chat: ✅ ${response}`);
  }

  if (result?.capabilities?.embedding?.success) {
    const dimensions = result.capabilities.embedding.dimensions || 0;
    details.push(`Embedding: ✅ ${dimensions} dimensions`);
  }

  if (result?.capabilities?.audio?.success) {
    const message = result.capabilities.audio.message || '';
    details.push(`Audio: ✅ ${message}`);
  }

  return `${t('check-connect-success')} - ${details.join(', ')}`;
};

interface ModelDialogContentProps {
  model?: AiModel;
}

export default observer(function ModelDialogContent({ model }: ModelDialogContentProps) {
  const { t } = useTranslation();
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [editingModel, setEditingModel] = useState<Partial<AiModel>>(() => {
    if (model) {
      return { ...model };
    }
    return {
      id: 0,
      providerId: aiSettingStore.aiProviders.value?.[0]?.id || 0,
      title: '',
      modelKey: '',
      capabilities: {
        inference: true,
        tools: false,
        image: false,
        imageGeneration: false,
        video: false,
        audio: false,
        embedding: false,
        rerank: false,
      },
      config: {
        embeddingDimensions: 0,
      },
      sortOrder: 0,
    };
  });

  const selectedProvider = aiSettingStore.aiProviders.value?.find((p) => p.id === editingModel.providerId);

  const getProviderModels = (): ProviderModel[] => {
    if (!selectedProvider) return [];
    return aiSettingStore.getProviderModels(selectedProvider.id);
  };

  const fetchProviderModels = async () => {
    if (!selectedProvider) return;

    try {
      await aiSettingStore.fetchProviderModels.call(selectedProvider as any);
    } catch (error) {
      console.error('Failed to fetch provider models:', error);
    }
  };

  const handleModelSelect = (modelKey: string) => {
    const providerModels = getProviderModels();
    const providerModel = providerModels.find((m) => m.id === modelKey);
    const defaultTemplate = DEFAULT_MODEL_TEMPLATES.find((t) =>
      modelKey.toLowerCase().includes(t.modelKey.toLowerCase())
    );

    if (providerModel) {
      // Use provider model data, but enhance with template capabilities if available
      const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(modelKey);
      const config = defaultTemplate?.config || {};

      setEditingModel((prev) => ({
        ...prev,
        modelKey: providerModel.id,
        title: providerModel.name,
        capabilities: capabilities as ModelCapabilities,
        config: {
          ...prev.config,
          ...config,
        },
      }));
    } else {
      // Fallback for manual input
      const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(modelKey);
      const title = defaultTemplate?.title || modelKey;
      const config = defaultTemplate?.config || {};

      setEditingModel((prev) => ({
        ...prev,
        modelKey,
        title,
        capabilities: capabilities as ModelCapabilities,
        config: {
          ...prev.config,
          ...config,
        },
      }));
    }
  };

  const getAllAvailableModels = () => {
    const providerModels = getProviderModels();
    return providerModels.map((m) => ({ id: m.id, name: m.name, source: 'provider' as const }));
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!editingModel.providerId) {
      newErrors.providerId = 'Please select a provider';
    }

    if (!editingModel.title?.trim()) {
      newErrors.title = 'Model name is required';
    }

    if (!editingModel.modelKey?.trim()) {
      newErrors.modelKey = 'Model key is required';
    }

    const hasCapabilities =
      editingModel.capabilities && Object.values(editingModel.capabilities).some((cap) => cap === true);
    if (!hasCapabilities) {
      newErrors.capabilities = 'Please select at least one capability';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const testModelConnection = async () => {
    if (!editingModel.modelKey || !selectedProvider || !editingModel.capabilities) return;

    try {
      RootStore.Get(ToastPlugin).promise(
        api.ai.testConnect.mutate({
          providerId: selectedProvider.id,
          modelKey: editingModel.modelKey,
          capabilities: editingModel.capabilities,
        }),
        {
          loading: t('loading'),
          success: (result: any) => {
            console.log(result);
            return formatTestResults(result, t);
          },
          error: (error: any) => {
            return `${t('check-connect-error')}: ${error.message}`;
          },
        }
      );
    } catch (error) {
      console.error('Test connection failed:', error);
    }
  };

  const handleSaveModel = async () => {
    if (!editingModel) return;

    if (!validateForm()) {
      return;
    }

    if (editingModel.id) {
      await aiSettingStore.updateModel.call(editingModel as any);
    } else {
      await aiSettingStore.createModel.call(editingModel as any);
    }
    RootStore.Get(DialogStore).close();
  };

  return (
    <div className="space-y-6">
      <Select
        placeholder={'Select provider'}
        isInvalid={!!errors.providerId}
        value={editingModel.providerId ? String(editingModel.providerId) : null}
        onChange={(selectedValue) => {
          const value = selectedValue;
          setEditingModel((prev) => ({ ...prev, providerId: Number(value) }));
          // Clear error message
          if (errors.providerId) {
            setErrors((prev) => ({ ...prev, providerId: '' }));
          }
        }}
      >
        <Label>{'Provider'}</Label>
        <Select.Trigger className={'bg-secondbackground'}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {(aiSettingStore.aiProviders.value || []).map((provider) => (
              <ListBox.Item key={String(provider.id)} id={String(provider.id)} textValue={provider.title}>
                {<ProviderIcon provider={provider.provider} className="w-4 h-4" />}
                {provider.title}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <FieldError>{errors.providerId}</FieldError>
      </Select>

      <TextField
        value={editingModel.title || ''}
        isInvalid={!!errors.title}
        onChange={(value) => {
          setEditingModel((prev) => ({ ...prev, title: value }));
          // Clear error message
          if (errors.title) {
            setErrors((prev) => ({ ...prev, title: '' }));
          }
        }}
      >
        <Label>{t('model-name')}</Label>
        <Input placeholder="Enter display name" />
        <FieldError>{errors.title}</FieldError>
      </TextField>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-semibold text-default-600">{t('model-selection')}</p>
          <Button
            className="text-primary"
            size="sm"
            variant="ghost"
            onPress={fetchProviderModels}
            isDisabled={!selectedProvider}
          >
            {aiSettingStore.fetchProviderModels.loading.value ? (
              <Icon icon="line-md:loading-twotone-loop" width="14" height="14" className="animate-spin" />
            ) : (
              <Icon icon="famicons:sync" width="14" height="14" />
            )}
            {t('refresh-model-list')}
          </Button>
        </div>
        <ComboBox
          value={editingModel.modelKey || null}
          inputValue={editingModel.modelKey || ''}
          onInputChange={(value) => {
            // Find matching template for the input value
            const defaultTemplate = DEFAULT_MODEL_TEMPLATES.find((t) =>
              value.toLowerCase().includes(t.modelKey.toLowerCase())
            );

            const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(value);
            const config = defaultTemplate?.config || {};

            setEditingModel((prev) => ({
              ...prev,
              modelKey: value,
              capabilities: capabilities,
              config: config,
            }));

            // Clear error message
            if (errors.modelKey) {
              setErrors((prev) => ({ ...prev, modelKey: '' }));
            }
          }}
          allowsCustomValue
          isInvalid={!!errors.modelKey}
          onChange={(key) => {
            if (key) {
              handleModelSelect(String(key));
              // Clear error message
              if (errors.modelKey) {
                setErrors((prev) => ({ ...prev, modelKey: '' }));
              }
            }
          }}
        >
          <Label>{'Model'}</Label>
          <ComboBox.InputGroup>
            <Input placeholder={'Select or enter model'} />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {getAllAvailableModels().map((model) => (
                <ListBox.Item key={model.id} id={model.id} textValue={model.id}>
                  {<ModelIcon modelName={model.id} className="w-4 h-4" />}
                  {model.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
          <FieldError>{errors.modelKey}</FieldError>
        </ComboBox>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-default-600">{t('model-capabilities')}</p>
          <p className="text-xs text-default-500 mt-1 flex items-center">
            <Icon icon="hugeicons:alert-circle" width="12" height="12" className="inline mr-1 text-warning" />
            <div>{t('model-cap-desc')}</div>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-4 bg-default-50 rounded-lg">
          {Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
            const isSelected = editingModel.capabilities?.[key as keyof ModelCapabilities] || false;
            return (
              <Chip
                key={key}
                size="sm"
                variant={isSelected ? 'primary' : 'secondary'}
                color={isSelected ? CAPABILITY_COLORS[key as keyof ModelCapabilities] : 'default'}
                className={`cursor-pointer transition-all hover:scale-105 ${
                  isSelected ? 'text-white' : 'hover:border-primary'
                }`}
                onClick={() => {
                  setEditingModel((prev) => ({
                    ...prev,
                    capabilities: {
                      ...prev.capabilities,
                      [key]: !isSelected,
                    },
                  }));
                  // Clear error message
                  if (errors.capabilities) {
                    setErrors((prev) => ({ ...prev, capabilities: '' }));
                  }
                }}
              >
                {CAPABILITY_ICONS[key as keyof ModelCapabilities]}
                <Chip.Label>{label}</Chip.Label>
              </Chip>
            );
          })}
        </div>
        {errors.capabilities && <p className="text-sm text-danger">{errors.capabilities}</p>}

        {/* Audio capability warning */}
        {editingModel.capabilities?.audio && (
          <div className="mt-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
            <p className="text-sm text-warning-700">
              <Icon icon="hugeicons:alert-circle" width="14" height="14" className="inline mr-2" />
              Currently only OpenAI-compatible audio models are supported.
            </p>
          </div>
        )}
      </div>

      {/* Embedding Dimensions - Only show for embedding models */}
      {editingModel.capabilities?.embedding && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon icon="hugeicons:search-list-02" width="16" height="16" />
            <p className="text-sm font-semibold text-default-600">Embedding Dimensions</p>
            <Tooltip>
              <Tooltip.Trigger tabIndex={0}>
                <Icon icon="proicons:info" width="14" height="14" />
              </Tooltip.Trigger>
              <Tooltip.Content>
                {'Specify the dimensions for this embedding model. Leave 0 for auto-detection.'}
              </Tooltip.Content>
            </Tooltip>
          </div>
          <TextField value={String(editingModel.config?.embeddingDimensions || 0)}>
            <Label>{'Dimensions'}</Label>
            <Input
              type="number"
              placeholder="0 (auto-detect)"
              onChange={(e) => {
                const dimensions = parseInt(e.target.value) || 0;
                setEditingModel((prev) => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    embeddingDimensions: dimensions,
                  },
                }));
              }}
            />
            <Description>{'Common values: 384, 512, 768, 1024, 1536, 3072. Set to 0 for auto-detection.'}</Description>
          </TextField>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-6 border-t border-default-200">
        <Button
          className="text-primary"
          variant="ghost"
          onPress={testModelConnection}
          isDisabled={!editingModel.modelKey || !selectedProvider}
        >
          {<Icon icon="hugeicons:connect" width="16" height="16" />}
          {t('test-connection')}
        </Button>
        <div className="flex gap-2">
          <Button variant="tertiary" onPress={() => RootStore.Get(DialogStore).close()}>
            Cancel
          </Button>
          <Button onPress={handleSaveModel} variant="primary">
            {editingModel.id ? t('update') : t('create')}
          </Button>
        </div>
      </div>
    </div>
  );
});
