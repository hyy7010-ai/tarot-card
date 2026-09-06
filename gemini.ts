/**
 * Gemini 客户端（服务端专用）。
 * 惰性初始化：模块被前端 bundle 误引时不会在导入期就炸，
 * 但只要真的调用就会因为拿不到 key 而失败——这是刻意的。
 */
import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('缺少 GEMINI_API_KEY');
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}
