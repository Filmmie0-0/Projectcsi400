// รูปแบบ error เดียวกันทุก service: { code, message }
export interface ApiError {
  status: number;
  code: string;
  message: string;
}
