import { createClient, type RedisClientType } from 'redis';

export interface RedisWrapperOptions {
  url: string;
}

export class RedisWrapper {
  private static client: RedisClientType<any, any, any> | null = null;

  static async getClient(options: RedisWrapperOptions): Promise<RedisClientType<any, any, any>> {
    if (this.client) return this.client;
    const client = createClient({ url: options.url });
    client.on('error', (err) => console.error('Redis Client Error', err));
    await client.connect();
    this.client = client;
    return client;
  }

  static async setEx(key: string, ttlSeconds: number, value: unknown): Promise<void> {
    if (!this.client) throw new Error('Redis client not initialized');
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.setEx(key, ttlSeconds, payload);
  }

  static async getJson<T = any>(key: string): Promise<T | null> {
    if (!this.client) throw new Error('Redis client not initialized');
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null as any;
    }
  }
}


