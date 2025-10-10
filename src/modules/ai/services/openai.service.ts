import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs-extra';

/**
 * OpenAI service for content generation, embeddings, and TTS
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generateTopicMarkdown(params: {
    sectionTitle: string;
    subtopicTitle: string;
    roadmapJson: string;
    prevSummary: string;
    nextSummary: string;
  }): Promise<string> {
    const prompt = [
      'Role: You are an expert educator writing a comprehensive, approachable subtopic guide in Markdown.',
      'Return ONLY Markdown. No YAML frontmatter. No extra commentary.',
      '',
      `Section: ${params.sectionTitle}`,
      `Subtopic: ${params.subtopicTitle}`,
      `Roadmap context: ${params.roadmapJson}`,
      `Previous summary: ${params.prevSummary}`,
      `Next summary: ${params.nextSummary}`,
      '',
      '# {{title}}\n\n## Previously on\n- ...\n\n## Deep dive\n...\n\n## Best practices and pitfalls\n- ...\n\n## Up next\n- ...\n\n## Practice\n- Task 1\n- Task 2',
    ].join('\n');
    return this.generateText(prompt);
  }

  async generateTranscriptFromMarkdown(subtopicTitle: string, sectionTitle: string, markdownContent: string): Promise<string> {
    const prompt = [
      'Role: You are a lecturer producing a clear, engaging, timestamped transcript covering the subtopic content below. Output plain text. No Markdown.',
      `Title: ${subtopicTitle}`,
      `Section: ${sectionTitle}`,
      'Markdown content (source of truth):',
      markdownContent,
      '',
      'Output format example:\n00:00 Title and overview...\n01:30 Previously on: ...\n03:10 Deep dive: ...',
    ].join('\n');
    return this.generateText(prompt, { maxTokens: 3000, temperature: 0.4 });
  }
  /**
   * Generate text content using GPT-4
   */
  async generateText(
    prompt: string,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    } = {},
  ): Promise<string> {
    this.logger.log('Generating text content with OpenAI');

    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

      if (options.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await this.openai.chat.completions.create({
        model: options.model || 'gpt-4-turbo-preview', 
        messages,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content generated');
      }

      this.logger.log('Text content generated successfully');
      return content;
    } catch (error) {
      this.logger.error('Failed to generate text content:', error);
      throw error;
    }
  }

  /**
   * Generate course roadmap
   */
  async generateCourseRoadmap(
    courseTitle: string,
    courseDescription: string,
    level: string = 'beginner',
  ): Promise<{ topics: Array<{ title: string; description: string; order: number }> }> {
    this.logger.log(`Generating course roadmap for: ${courseTitle}`);

    const systemPrompt = `You are an expert course designer. Create a comprehensive learning roadmap for the given course.
    Return the response as a JSON object with a "topics" array. Each topic should have:
    - title: Clear, specific topic title
    - description: Detailed description of what will be covered
    - order: Sequential order number (1, 2, 3, etc.)
    
    Make sure the topics are:
    1. Logically sequenced
    2. Appropriate for ${level} level
    3. Comprehensive but not overwhelming
    4. Practical and actionable`;

    const userPrompt = `Create a learning roadmap for this course:
    
    Title: ${courseTitle}
    Description: ${courseDescription}
    Level: ${level}
    
    Please provide 8-12 well-structured topics that will help students master this subject.`;

    const response = await this.generateText(userPrompt, {
      systemPrompt,
      maxTokens: 3000,
      temperature: 0.6,
    });

    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse roadmap response:', error);
      throw new Error('Invalid roadmap format generated');
    }
  }

  /**
   * Generate course content for a topic
   */
  async generateTopicContent(
    topicTitle: string,
    topicDescription: string,
    courseContext: string,
  ): Promise<{
    slides: Array<{ title: string; content: string; order: number }>;
    transcript: string;
  }> {
    this.logger.log(`Generating content for topic: ${topicTitle}`);

    const systemPrompt = `You are an expert educator creating engaging course content. Generate educational slides and a transcript for the given topic.
    
    Return the response as a JSON object with:
    - slides: Array of slide objects with title, content (markdown format), and order
    - transcript: Natural-sounding transcript for narration
    
    Guidelines:
    1. Create 5-15 slides depending on topic complexity
    2. Each slide should focus on one key concept
    3. Use clear, engaging language
    4. Include examples and practical applications
    5. Make content accessible and well-structured
    6. Transcript should be conversational and natural`;

    const userPrompt = `Create educational content for this topic:
    
    Topic: ${topicTitle}
    Description: ${topicDescription}
    Course Context: ${courseContext}
    
    Generate comprehensive slides and a natural transcript for this topic.`;

    const response = await this.generateText(userPrompt, {
      systemPrompt,
      maxTokens: 4000,
      temperature: 0.7,
    });

    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse content response:', error);
      throw new Error('Invalid content format generated');
    }
  }

  /**
   * Generate quiz questions
   */
  async generateQuizQuestions(
    topicTitle: string,
    content: string,
    difficulty: string = 'intermediate',
    questionCount: number = 5,
  ): Promise<{
    questions: Array<{
      question: string;
      options: string[];
      correct_answer: number;
      explanation: string;
    }>;
  }> {
    this.logger.log(`Generating quiz questions for topic: ${topicTitle}`);

    const systemPrompt = `You are an expert quiz creator. Generate high-quality quiz questions based on the provided content.
    
    Return the response as a JSON object with a "questions" array. Each question should have:
    - question: Clear, well-formulated question
    - options: Array of 4 multiple choice options
    - correct_answer: Index of correct answer (0-3)
    - explanation: Brief explanation of why the answer is correct
    
    Guidelines:
    1. Questions should test understanding, not just memorization
    2. Make options plausible but clearly distinguishable
    3. Vary question types (conceptual, application, analysis)
    4. Ensure questions are appropriate for ${difficulty} level
    5. Provide clear, educational explanations`;

    const userPrompt = `Create ${questionCount} quiz questions for this topic:
    
    Topic: ${topicTitle}
    Content: ${content}
    Difficulty: ${difficulty}
    
    Generate diverse, high-quality questions that test student understanding.`;

    const response = await this.generateText(userPrompt, {
      systemPrompt,
      maxTokens: 3000,
      temperature: 0.5,
    });

    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse quiz response:', error);
      throw new Error('Invalid quiz format generated');
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    this.logger.log('Generating embeddings for text');

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', 
        input: text,
      });

      const embeddings = response.data[0]?.embedding;
      if (!embeddings) {
        throw new Error('No embeddings generated');
      }

      this.logger.log('Embeddings generated successfully');
      return embeddings;
    } catch (error) {
      this.logger.error('Failed to generate embeddings:', error);
      throw error;
    }
  }

  /**
   * Generate text-to-speech audio
   */
  async generateTTS(
    text: string,
    options: {
      voice?: string;
      speed?: number;
    } = {},
  ): Promise<Buffer> {
    this.logger.log('Generating TTS audio');

    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: (options.voice as any) || 'alloy',
        input: text,
        speed: options.speed || 1.0,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      this.logger.log('TTS audio generated successfully');
      return buffer;
    } catch (error) {
      this.logger.error('Failed to generate TTS audio:', error);
      throw error;
    }
  }

  /**
   * Generate text-to-speech audio and save to file
   */
  async generateTTSAndSave(
    text: string,
    outputPath: string,
    options: {
      voice?: string;
      speed?: number;
    } = {},
  ): Promise<void> {
    this.logger.log('Generating TTS audio and saving to file');

    try {
      const buffer = await this.generateTTS(text, options);
      await fs.writeFile(outputPath, buffer);
      this.logger.log(`TTS audio saved to: ${outputPath}`);
    } catch (error) {
      this.logger.error('Failed to generate and save TTS audio:', error);
      throw error;
    }
  }

  /**
   * Chat with AI Buddy (course-specific)
   */
  async chatWithAIBuddy(
    message: string,
    courseContext: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
  ): Promise<{
    response: string;
    tokensUsed: number;
    sources?: string[];
  }> {
    this.logger.log('Processing AI Buddy chat request');

    const systemPrompt = `You are an AI teaching assistant for this specific course. You help students understand course concepts, answer questions, and provide guidance.

    Course Context: ${courseContext}
    
    Guidelines:
    1. Stay focused on the course content and related concepts
    2. Provide clear, educational explanations
    3. Use examples from the course when relevant
    4. Encourage learning and critical thinking
    5. If asked about topics outside the course, politely redirect to course content
    6. Be helpful, encouraging, and professional`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview', 
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      const tokensUsed = response.usage?.total_tokens || 0;

      if (!content) {
        throw new Error('No response generated');
      }

      this.logger.log('AI Buddy response generated successfully');
      return {
        response: content,
        tokensUsed,
      };
    } catch (error) {
      this.logger.error('Failed to generate AI Buddy response:', error);
      throw error;
    }
  }
}
