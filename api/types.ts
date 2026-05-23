export interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: any): void;
  send(body: any): void;
  end(body?: any): void;
  write(chunk: any): void;
  setHeader(name: string, value: string): void;
}
