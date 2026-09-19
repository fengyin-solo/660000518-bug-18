export const BASE_URL = 'http://localhost:8080/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.body !== undefined && options.body !== null) {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${url}`, config);
  } catch (networkError) {
    // 网络层失败（后端未启动 / CORS / 断网），保留原始错误以触发 mock 降级
    throw new Error('Failed to fetch');
  }

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) {
        message = errorBody.message;
      }
    } catch {
      // 响应体不是 JSON，使用默认消息
    }
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
