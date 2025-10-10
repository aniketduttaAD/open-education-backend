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
    embeddingModel: "text-embedding-3-small", 
    chatModel: "gpt-4-turbo-preview", 
    ttsModel: "tts-1", 
    maxTokens: 4000, 
    temperature: 0.7, 
  };
};

// LangChain removed - using direct OpenAI + pgvector approach

export interface AIBuddyConfig {
  tokensPerMonth: number;
  contextWindow: number;
  responseStyle: string;
}

export const getAIBuddyConfig = (configService: ConfigService): AIBuddyConfig => ({
  tokensPerMonth: 1000, 
  contextWindow: 10, 
  responseStyle: "friendly_tutor", 
});

export default getOpenAIConfig;
