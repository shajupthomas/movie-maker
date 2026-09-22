export interface PublicSettings {
  llmConfigured: boolean;
  falConfigured: boolean;
  llmFromEnvironment: boolean;
  falFromEnvironment: boolean;
  llmModel: string;
  llmBaseUrl: string;
  videoModel: string;
  imageModel: string;
  angleModel: string;
  keyHints: { llm: string; fal: string };
}
