declare module '@nestjs/websockets' {
  export * from '@nestjs/common';
  export * from '@nestjs/core';
  
  export function WebSocketGateway(options?: any): any;
  export function WebSocketServer(): any;
  export function SubscribeMessage(event: string): any;
  export function MessageBody(): any;
  export function ConnectedSocket(): any;
  
  export interface OnGatewayConnection {
    handleConnection(client: any): void;
  }
  
  export interface OnGatewayDisconnect {
    handleDisconnect(client: any): void;
  }
  
  export interface OnGatewayInit {
    afterInit(server: any): void;
  }
}
