import {
  DEFAULT_ACTIVE_MODELS,
  getApprovedModel,
  getApprovedModels,
} from '@/lib/newApiModels';
import type { PlaygroundMode } from './usePlaygroundStore';

export interface PlaygroundModelOption {
  id: string;
  displayName: string;
  family: string;
  description: string;
  recommended: boolean;
  badges: string[];
  capabilities: string[];
  duration:
    | { type: 'slider'; min: number; max: number; step: number; default: number }
    | { type: 'buttons'; options: number[]; default: number }
    | { type: 'fixed'; value: number }
    | null;
  params: {
    resolution?: { options: string[]; default: string };
    ratio?: { options: string[]; default: string };
    size?: { options: string[]; default: string };
    quality?: { options: string[]; default: string };
    seed?: boolean;
    negativePrompt?: boolean;
    promptExtend?: boolean;
    watermark?: boolean;
  };
  maxReferenceImages: number;
}

function modeCapability(mode: PlaygroundMode): 'image' | 'video' {
  return mode === 't2i' || mode === 'i2i' ? 'image' : 'video';
}

export function getModelsForMode(mode: PlaygroundMode): PlaygroundModelOption[] {
  const capability = modeCapability(mode);
  return getApprovedModels(capability)
    .filter((model) => model.capabilities.includes(mode))
    .map((model) => ({
      id: model.id,
      displayName: model.name,
      family: 'newapi',
      description: model.description,
      recommended: model.id === DEFAULT_ACTIVE_MODELS[capability],
      badges: ['New API'],
      capabilities: [...model.capabilities],
      duration: capability === 'video'
        ? { type: 'slider' as const, min: 4, max: 15, step: 1, default: 5 }
        : null,
      params: capability === 'video'
        ? {
            resolution: { options: ['720p', '1080p'], default: '720p' },
            ratio: { options: ['16:9', '9:16', '1:1'], default: '16:9' },
            seed: true,
            watermark: true,
          }
        : {
            size: {
              options: ['1536x1024', '1024x1024', '1024x1536'],
              default: '1536x1024',
            },
            quality: { options: ['auto', 'high', 'medium', 'low'], default: 'auto' },
          },
      maxReferenceImages: mode === 'i2i' ? 16 : 0,
    }));
}

export function getDefaultModelForMode(mode: PlaygroundMode): string {
  const capability = modeCapability(mode);
  const preferred = DEFAULT_ACTIVE_MODELS[capability];
  const models = getModelsForMode(mode);
  return models.some((model) => model.id === preferred) ? preferred : models[0]?.id ?? '';
}

export function getModelDisplayInfo(
  modelId: string,
): { displayName: string; family: string } | null {
  const model = getApprovedModel(modelId);
  return model ? { displayName: model.name, family: 'newapi' } : null;
}

export function getModelParams(
  modelId: string,
): PlaygroundModelOption['params'] | null {
  const model = getApprovedModel(modelId);
  if (!model) return null;
  const mode: PlaygroundMode = model.capability === 'image' ? 't2i' : 'i2v';
  return getModelsForMode(mode).find((candidate) => candidate.id === modelId)?.params ?? null;
}

export function getModelDuration(
  modelId: string,
): PlaygroundModelOption['duration'] {
  const model = getApprovedModel(modelId);
  return model?.capability === 'video'
    ? { type: 'slider', min: 4, max: 15, step: 1, default: 5 }
    : null;
}
