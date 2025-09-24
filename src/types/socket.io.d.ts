declare module 'socket.io' {
  export interface Server {
    to(room: string): any;
    emit(event: string, data: any): void;
  }
  
  export interface Socket {
    id: string;
    handshake: {
      headers: any;
    };
    join(room: string): Promise<void>;
    leave(room: string): Promise<void>;
    emit(event: string, data: any): void;
    disconnect(): void;
  }
  
  export class Server {
    constructor();
  }
}
