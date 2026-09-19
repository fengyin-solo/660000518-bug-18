export const BASE_URL = 'http://localhost:8080/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    const data = JSON.parse(text);
    // 后端 GlobalExceptionHandler / join 接口统一返回 { success, message }
    if (data && typeof data.message === 'string' && data.message) {
      return data.message;
    }
    return fallback;
  } catch {
    return fallback;
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
    // 保留原始网络错误信息（mock 回退逻辑依赖 Failed to fetch 等关键字）
    throw networkError instanceof Error ? networkError : new Error('网络请求失败');
  }

  if (!response.ok) {
    const message = await readErrorMessage(response, `请求失败 (HTTP ${response.status})`);
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
