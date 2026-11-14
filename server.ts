import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Never collide with nginx reverse-proxy port if inherited from shell environment
const rawPort = Number(process.env.PORT);
const nginxPort = Number(process.env.NGINX_PORT);
const PORT =
  rawPort && rawPort !== nginxPort
    ? rawPort
    : Number(process.env.DEFAULT_APP_PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// API Endpoint for AI-Generated Management Insights (Section 11)
app.post('/api/ai-insights', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        available: false,
        reason: 'GEMINI_API_KEY not configured in environment. Using deterministic rule engine.',
        insights: [],
      });
    }

    const { summaryData } = req.body;
    if (!summaryData) {
      return res.status(400).json({ error: 'Missing summaryData payload' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an elite Senior Financial Risk & Recovery Analytics Director for WÜRTH Lanka.
Analyze the following aggregated returned-cheque metrics and identified anomalies for the current reporting period.

CRITICAL INSTRUCTIONS:
1. Ground your analysis STRICTLY in the provided numbers. NEVER hallucinate, invent, or estimate any financial figures, dates, or recovery outcomes.
2. Clearly distinguish between "Total Recorded Returned-Cheque Value" and "Verified Unrecovered Exposure".
3. Return exactly 3 to 4 high-impact, operational management findings formatted strictly as a JSON array of objects.

Data Summary:
${JSON.stringify(summaryData, null, 2)}

Output format must be valid JSON matching this schema:
[
  {
    "finding": "Short title describing the verified pattern detected",
    "evidence": "Exact figures, counts, percentages, and dates supporting this finding",
    "businessImpact": "Operational and financial consequence, distinguishing total returned value vs unrecovered exposure",
    "recommendedAction": "Concrete, practical recovery or credit-control intervention",
    "successMeasure": "Specific metric that must improve if this action works",
    "limitations": "Data boundaries, missing sales/portfolio denominators, or caveats"
  }
]
Return ONLY the raw JSON array without markdown code blocks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim() || '[]';
    const cleanedJson = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const insights = JSON.parse(cleanedJson);

    return res.json({
      available: true,
      insights: Array.isArray(insights) ? insights : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in /api/ai-insights:', err);
    return res.status(200).json({
      available: false,
      reason: message || 'AI generation encountered an issue. Falling back to rule-based engine.',
      insights: [],
    });
  }
});

// Vite Middleware for Dev / Static Files for Prod
async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WÜRTH Recovery Intelligence server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
