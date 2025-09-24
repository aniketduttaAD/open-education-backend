export interface JwtPayload {
  sub: string;
  id: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
