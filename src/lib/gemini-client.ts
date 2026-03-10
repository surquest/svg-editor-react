/**
 * Client-side Gemini / Vertex AI integration.
 *
 * Works in two modes:
 * 1. **API Key** – calls the Gemini REST API directly with the key.
 * 2. **Google Sign-In** – calls the Vertex AI REST endpoint using
 *    an access token obtained via Google OAuth popup login.
 *
 * No server-side code required – safe for static export / GitHub Pages.
 */

export const ALLOWED_MODELS = [
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" }
];

const DEFAULT_SYSTEM_INSTRUCTION =
    'You are an SVG generation assistant. Return ONLY a single valid SVG string wrapped in <svg> tags. No markdown, no explanation, raw SVG only.';

export interface GeminiCredentials {
    mode: 'apikey' | 'oauth';
    /** Gemini API key (mode === 'apikey') */
    apiKey?: string;
    /** OAuth2 access token (mode === 'oauth') */
    accessToken?: string;
}

export interface GenerateRequest {
    prompt: string;
    systemInstruction?: string;
    model: string;
    image?: string; // data-URI
    credentials: GeminiCredentials;
}

/** Build the parts array (optional image + text prompt). */
function buildParts(prompt: string, image?: string) {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (image) {
        const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
    }
    parts.push({ text: prompt });
    return parts;
}

/** Call the public Gemini API with an API key. */
async function generateViaApiKey(
    apiKey: string,
    model: string,
    parts: ReturnType<typeof buildParts>,
    systemInstruction: string,
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: 'text/plain' },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini API returned ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** Call the Vertex AI REST endpoint using an OAuth access token. */
async function generateViaVertexAI(
    accessToken: string,
    project: string,
    location: string,
    model: string,
    parts: ReturnType<typeof buildParts>,
    systemInstruction: string,
): Promise<string> {

    const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

    const body = {
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: 'text/plain' },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Vertex AI returned ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Generate SVG content using the Gemini / Vertex AI API directly from the browser.
 * Returns the SVG string.
 */
export async function generateSvg(req: GenerateRequest): Promise<string> {
    const { prompt, systemInstruction, model, image, credentials } = req;
    const sysInstruction = systemInstruction?.trim() || DEFAULT_SYSTEM_INSTRUCTION;
    const parts = buildParts(prompt.trim(), image);

    let svgText: string;

    if (credentials.mode === 'apikey') {
        if (!credentials.apiKey) {
            throw new Error('API key is required');
        }
        svgText = await generateViaApiKey(credentials.apiKey, model, parts, sysInstruction);
    } else if (credentials.mode === 'oauth') {
        if (!credentials.accessToken) {
            throw new Error('OAuth access token is required');
        }
        
        const project = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT;
        const location = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_LOCATION || 'global';

        if (!project) {
            throw new Error('Google Cloud project ID is required in environment variables');
        }
        svgText = await generateViaVertexAI(
            credentials.accessToken,
            project,
            location,
            model,
            parts,
            sysInstruction,
        );
    } else {
        throw new Error('Unknown credentials mode');
    }

    // Strip markdown code fences if the model wraps the output
    svgText = svgText.replace(/^```(?:xml|svg|html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Validate it looks like SVG
    if (!svgText.includes('<svg')) {
        throw new Error('Model did not return valid SVG');
    }

    return svgText;
}
