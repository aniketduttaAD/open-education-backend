import { ConfigService } from "@nestjs/config";

export interface OpenAIConfig {
  apiKey: string;
  embeddingModel: string;
  chatModel: string;
  ttsModel: string;
  maxTokens: number;
  temperature: number;
}

export const getOpenAIConfig = (configService: ConfigService): OpenAIConfig => {
  const apiKey = configService.get<string>("OPENAI_API_KEY");
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI features");
  }

  return {
    apiKey,
    embeddingModel: "text-embedding-3-small", // Hardcoded
    chatModel: "gpt-4-turbo-preview", // Hardcoded
    ttsModel: "tts-1", // Hardcoded
    maxTokens: 4000, // Hardcoded
    temperature: 0.7, // Hardcoded
  };
};

// LangChain removed - using direct OpenAI + pgvector approach

export interface AIBuddyConfig {
  tokensPerMonth: number;
  contextWindow: number;
  responseStyle: string;
}

export const getAIBuddyConfig = (configService: ConfigService): AIBuddyConfig => ({
  tokensPerMonth: 1000, // Hardcoded
  contextWindow: 10, // Hardcoded
  responseStyle: "friendly_tutor", // Hardcoded
});

export default getOpenAIConfig;
