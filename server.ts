import express from "express";
import path from "path";
import cors from "cors";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { getLightRenderModel } from "./lightingModel";

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const MAX_IMAGE_BYTES = Number.parseInt(process.env.MAX_IMAGE_BYTES || String(12 * 1024 * 1024), 10);
const API_RATE_LIMIT = Number.parseInt(process.env.API_RATE_LIMIT || "20", 10);
const API_RATE_WINDOW_MS = Number.parseInt(process.env.API_RATE_WINDOW_MS || "60000", 10);
const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || "";
const SERVER_HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MODELS = new Set(
  (process.env.ALLOWED_GEMINI_MODELS || DEFAULT_MODEL)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const ALLOWED_IMAGE_HOSTS = new Set(
  (process.env.ALLOWED_IMAGE_HOSTS || "images.unsplash.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ALLOWED_ORIGINS = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost,https://localhost,http://127.0.0.1,capacitor://localhost,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
if (SERVER_HOST === "127.0.0.1" || SERVER_HOST === "localhost") {
  ALLOWED_ORIGINS.add(`http://${SERVER_HOST}:${PORT}`);
}

if (process.env.TRUST_PROXY_HOPS) {
  app.set("trust proxy", Number.parseInt(process.env.TRUST_PROXY_HOPS, 10));
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(
  "/api",
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS policy."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: "24mb", strict: true }));

function readCookie(req: express.Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const key = cookie.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function tokensMatch(candidate: string | undefined): boolean {
  if (!candidate || !API_ACCESS_TOKEN) return false;
  const expected = Buffer.from(API_ACCESS_TOKEN);
  const received = Buffer.from(candidate);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function requireApiAccess(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!API_ACCESS_TOKEN && process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const authorization = req.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const desktopCookie = readCookie(req, "lumina_access_token");
  if (!tokensMatch(bearer) && !tokensMatch(desktopCookie)) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  next();
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const apiRateLimits = new Map<string, RateLimitEntry>();
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of apiRateLimits) {
    if (entry.resetAt <= now) apiRateLimits.delete(key);
  }
}, API_RATE_WINDOW_MS);
rateLimitCleanup.unref();

app.use("/api", (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const existing = apiRateLimits.get(key);
  const entry =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + API_RATE_WINDOW_MS }
      : existing;

  entry.count += 1;
  apiRateLimits.set(key, entry);
  res.setHeader("RateLimit-Limit", String(API_RATE_LIMIT));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, API_RATE_LIMIT - entry.count)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > API_RATE_LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return;
  }

  next();
});

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  fallback?: number
): number {
  const value = source[key] ?? fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${key} value.`);
  }
  return value;
}

function validateLight(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Each light source must be an object.");

  const type = typeof value.type === "string" ? value.type : "";
  const color = typeof value.color === "string" ? value.color.trim() : "";
  if (!type || type.length > 100 || !color || color.length > 64) {
    throw new Error("Invalid light type or color.");
  }
  if (value.placement !== undefined && value.placement !== "foreground" && value.placement !== "background") {
    throw new Error("Invalid light placement.");
  }

  return {
    type,
    color,
    placement: value.placement === "background" ? "background" : "foreground",
    x: readNumber(value, "x", 0, 100),
    y: readNumber(value, "y", 0, 100),
    intensity: readNumber(value, "intensity", 0, 100),
    opacity: readNumber(value, "opacity", 0, 100, 100),
    exposure: readNumber(value, "exposure", 0, 100),
    size: readNumber(value, "size", 10, 300, 100),
    shadowIntensity: readNumber(value, "shadowIntensity", 0, 100, 40),
    direction: readNumber(value, "direction", 0, 360),
    rotation: readNumber(value, "rotation", 0, 360),
    depthOfField: readNumber(value, "depthOfField", 0, 100),
    subjectIsolation: readNumber(value, "subjectIsolation", 0, 100, 0),
    rimLightIntensity: readNumber(value, "rimLightIntensity", 0, 100, 0),
    zDepth: readNumber(value, "zDepth", -100, 100, value.placement === "background" ? -40 : 20),
    coneAngle: readNumber(value, "coneAngle", 5, 120, 45),
    falloff: readNumber(value, "falloff", 0, 100, 65),
    temperature: readNumber(value, "temperature", 1800, 12000, 4200),
    length: readNumber(value, "length", 10, 300, 100),
    targetX: value.targetX !== undefined ? readNumber(value, "targetX", 0, 100) : undefined,
    targetY: value.targetY !== undefined ? readNumber(value, "targetY", 0, 100) : undefined,
    useTarget: value.useTarget === true,
    enabled: value.enabled !== false,
  };
}

const CONTROL_MAP_KEYS = ["lightMap", "colorMap", "directionMap", "depthMap", "subjectMask"] as const;

function validateControlMaps(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Control maps must be an object.");
  const result: Record<string, string> = {};
  for (const key of CONTROL_MAP_KEYS) {
    const map = value[key];
    if (typeof map !== "string") throw new Error(`Missing ${key} control map.`);
    const decoded = decodeDataImage(map);
    if (Buffer.byteLength(decoded.base64Data, "base64") > 1024 * 1024) {
      throw new Error(`${key} control map is too large.`);
    }
    result[key] = map;
  }
  return result;
}

function validateSubjectBounds(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Subject bounds must be an object.");

  const subjectLabel =
    typeof value.subjectLabel === "string" ? value.subjectLabel.trim().slice(0, 120) : "";
  const allowedDetectionModes = new Set(["auto", "portrait", "product", "animal", "vehicle"]);
  const detectionMode =
    typeof value.detectionMode === "string" && allowedDetectionModes.has(value.detectionMode)
      ? value.detectionMode
      : "auto";

  return {
    enabled: value.enabled === true,
    x: readNumber(value, "x", 0, 100),
    y: readNumber(value, "y", 0, 100),
    width: readNumber(value, "width", 5, 100),
    height: readNumber(value, "height", 5, 100),
    opacity: readNumber(value, "opacity", 0, 100),
    isolationStrength: readNumber(value, "isolationStrength", 0, 100, 0),
    edgeRefinement: readNumber(value, "edgeRefinement", 0, 100, 50),
    detectionMode,
    subjectLabel,
  };
}

function validateGenerationRequest(body: unknown): {
  image: string;
  lights: any[];
  subjectBounds?: any;
  model: string;
  controlMaps?: Record<string, string>;
  sceneHash: string;
} {
  if (!isRecord(body) || typeof body.image !== "string" || body.image.length === 0) {
    throw new Error("No image data provided.");
  }
  if (body.lights !== undefined && !Array.isArray(body.lights)) {
    throw new Error("Lights must be an array.");
  }

  const rawLights = (body.lights || []) as unknown[];
  if (rawLights.length > 12) {
    throw new Error("A maximum of 12 light sources is supported.");
  }
  const lights = rawLights.map(validateLight);
  const subjectBounds = validateSubjectBounds(body.subjectBounds);
  const controlMaps = validateControlMaps(body.controlMaps);
  const sceneHash = typeof body.sceneHash === "string" && /^lumina-[a-f0-9]{8}$/.test(body.sceneHash)
    ? body.sceneHash
    : "lumina-unversioned";

  const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(model)) {
    throw new Error("The requested image model is not allowed.");
  }

  return {
    image: body.image,
    lights,
    subjectBounds,
    model,
    controlMaps,
    sceneHash,
  };
}

function decodeDataImage(image: string): { mimeType: string; base64Data: string } {
  const matches = image.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!matches) {
    throw new Error("Invalid image format. Expected a base64 image data URI.");
  }

  const mimeType = matches[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
  }

  const base64Data = matches[2].replace(/\s/g, "");
  const decodedSize = Buffer.byteLength(base64Data, "base64");
  if (decodedSize === 0 || decodedSize > MAX_IMAGE_BYTES) {
    throw new Error(`Image must be smaller than ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }

  return { mimeType, base64Data };
}

async function downloadAllowedImage(image: string): Promise<{ mimeType: string; base64Data: string }> {
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    throw new Error("Invalid image URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new Error("Remote image host is not allowed.");
  }

  const imgRes = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "image/jpeg,image/png,image/webp" },
  });
  if (!imgRes.ok || !imgRes.body) {
    throw new Error("Failed to fetch the remote image.");
  }

  const mimeType = (imgRes.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Remote URL did not return a supported image.");
  }

  const contentLength = Number.parseInt(imgRes.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Remote image is too large.");
  }

  const reader = imgRes.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("Remote image is too large.");
    }
    chunks.push(Buffer.from(value));
  }

  if (totalBytes === 0) {
    throw new Error("Remote image was empty.");
  }

  return {
    mimeType,
    base64Data: Buffer.concat(chunks).toString("base64"),
  };
}

// Helper to construct prompt
function constructPrompt(lights: any[], subjectBounds?: any, sceneHash = "lumina-unversioned", hasControlMaps = false): string {
  if (lights.length === 0) {
    return "Enhance the lighting of this photograph to be more dramatic, clean, and professional. Please make the ambient lighting photorealistic, balancing light levels and adding beautiful highlights and shadows.";
  }

  const lightDescriptions = lights.map((light, index) => {
    const optics = getLightRenderModel(light);
    const placementDesc = light.placement === "background"
      ? "Render this light BEHIND the main foreground subject (creating a background illumination layer, beautiful backlight silhouette, or corona glow, ensuring the light does NOT cast directly onto the front/face of the main isolated subject)."
      : "Render this light in the FOREGROUND (overlaying and illuminating the entire scene, including casting direct light and highlights onto the foreground subject's front surfaces).";

    const isolationDesc = light.subjectIsolation && light.subjectIsolation > 0
      ? `Apply precise Subject Isolation at a strength of ${light.subjectIsolation}%. This means the main foreground subject should be cleanly separated and isolated from the background lighting effect. The background behind the subject should receive the full force of this light and shadow, while the subject remains sharp, layered on top, and unaffected by the background's direct light color bleed.`
      : "No special isolation; blend the light continuously across all depth layers.";

    const rimDesc = light.rimLightIntensity && light.rimLightIntensity > 0
      ? `Add a gorgeous, glowing RIM LIGHT (edge silhouette glow) around the borders of the isolated subject at an intensity of ${light.rimLightIntensity}%. The rim light should match the color of this light source (${light.color || "Neutral White"}), wrapping elegantly around the hair, shoulders, or physical contours of the subject to separate them dramatically from the background.`
      : "No explicit rim lighting contour.";

    const targetDesc = light.useTarget && light.targetX !== undefined && light.targetY !== undefined
      ? `\n    - Targeted Look-At Focus Coordinate: directly aimed at X: ${Math.round(light.targetX)}%, Y: ${Math.round(light.targetY)}% on the canvas.`
      : "";

    return `  - Light Source ${index + 1}:
    - Type: ${light.type}.
    - Color/Hue description: ${light.color || "Neutral White"}. The light should cast illumination matching this specific color hue.
    - Optical anchor (MUST match exactly): centered at X: ${Math.round(light.x)}% from the left edge and Y: ${Math.round(light.y)}% from the top edge of the image canvas.${targetDesc}
    - Layer Placement depth: ${light.placement || "foreground"}. ${placementDesc}
    - Subject Isolation Strength: ${light.subjectIsolation !== undefined ? light.subjectIsolation : 0} out of 100. ${isolationDesc}
    - Silhouette Rim Light Intensity: ${light.rimLightIntensity !== undefined ? light.rimLightIntensity : 0} out of 100. ${rimDesc}
    - Effective luminous strength: ${Math.round(optics.intensity * optics.opacity * 100)} out of 100 after opacity; raw intensity is ${light.intensity}.
    - Global Blend Opacity: ${light.opacity !== undefined ? light.opacity : 100}% (where lower percentages mean the lighting effect is extremely subtle, and 100% means fully applied).
    - Exposure: ${light.exposure} out of 100 (where 100 is extremely bright and glowing).
    - Illuminated footprint: radius approximately ${Math.round(optics.footprintRadiusPct)}% of image width around the optical anchor (size control ${light.size || 100}%). Keep the brightest core within roughly ${Math.round(optics.coreRadiusPct)}% of image width.
    - Shadow Casting Intensity: ${light.shadowIntensity !== undefined ? light.shadowIntensity : 40} out of 100 (where higher values mean much deeper, darker, and more dramatic high-contrast shadows should be cast in unlit regions and in opposite directions away from the light source).
    - Direction/orientation: ${Math.round(optics.angle)} degrees clockwise in image space (0° = pointing straight DOWN towards bottom of image, 90° = pointing RIGHT, 180° = pointing UP towards top, 270° = pointing LEFT). Cast light beams and shadows along this exact axis.
    - Edge softness / optical diffusion: ${Math.round(optics.softness * 100)} out of 100. Preserve a smooth inverse-distance falloff from the bright core to the stated footprint edge.
    - Physical emitter: Z depth ${light.zDepth}, cone ${light.coneAngle} degrees, falloff ${light.falloff}/100, color temperature ${light.temperature}K, emitter length ${light.length}%.`;
  }).join('\n');

  let isolationContext = "";
  if (subjectBounds && subjectBounds.enabled) {
    const labelDesc = subjectBounds.subjectLabel && subjectBounds.subjectLabel.trim() !== ""
      ? `\n- **Target Subject Semantic Description**: "${subjectBounds.subjectLabel.trim()}". Focus your segmentation model precisely on identifying this specific object/person. Do not bleed background light, shadows, or colors onto this subject.`
      : "\n- **Target Subject Semantic Description**: Automatically segment and identify the primary foreground subject/object centered inside the focus area boundary.";

    const categoryDesc = subjectBounds.detectionMode && subjectBounds.detectionMode !== 'auto'
      ? `\n- **Subject Segmentation Class**: ${subjectBounds.detectionMode.toUpperCase()}. Adapt the segmentation algorithm for this class (e.g., utilize clean hair-strand matting for 'portrait', sharp crisp vector outline matting for 'product' or 'vehicle', or fine-grained texture masking for 'animal').`
      : "";

    const edgeRefineDesc = subjectBounds.edgeRefinement !== undefined
      ? `\n- **Edge Alpha-Matting Crispness & Threshold**: ${subjectBounds.edgeRefinement}%. A lower value means soft feathered blend boundaries. A higher value means pixel-perfect razor-sharp edges and silhouettes (ideal for high-contrast backlit cutouts).`
      : "";

    const depthStrengthDesc = subjectBounds.isolationStrength !== undefined
      ? `\n- **Depth-Layer Layer Separation Power**: ${subjectBounds.isolationStrength} out of 100. Higher values demand absolute zero color-spill of background light sources onto the front-facing surfaces of the subject, enforcing a strict stereoscopic depth plane.`
      : "";

    isolationContext = `
The user has enabled an advanced **Subject Identification, Contour Detection & Depth Isolation Mask** to guide your visual rendering:
- **Mask Center Point**: X: ${Math.round(subjectBounds.x)}% from left, Y: ${Math.round(subjectBounds.y)}% from top.
- **Mask Boundary Dimensions**: Width: ${Math.round(subjectBounds.width)}%, Height: ${Math.round(subjectBounds.height)}% of the image canvas.${labelDesc}${categoryDesc}${edgeRefineDesc}${depthStrengthDesc}

Strict Layering & Edge-Following Rules for the Generator:
1. **True Contour Identification**: Do NOT approximate the subject using simple ovals or rectangular geometry. You must perform detailed, edge-aware pixel analysis to locate the true, organic physical boundaries of the subject (detecting skin, clothing, hair, fur, product outlines, or vehicle borders) within the specified mask area.
2. **High-Frequency Detail Separation**: Execute precise edge-preserving alpha-matting. Isolate fine-grained details like individual stray hairs, delicate fur, leaves, clothing fibers, or glass transparency, separating them seamlessly from the background layer.
3. **Absolute Depth-Plane Segmentation**: For any light sources set to 'background' placement, render their light paths entirely behind the isolated subject. The background should be dramatically backlit, but the subject's front surfaces must be perfectly masked out with zero color-spill or light-bleed from these background sources.
4. **Organic Silhouette Rim-Lighting**: For background lights with active Rim Light intensity, cast a gorgeous, realistic light wrap (halo/rim lighting) that tightly conforms to the true physical contour of the subject's silhouette. The glow should trace the exact hair, shoulder, or outer edge profiles with the light source's true color hue, fading smoothly as it wraps around to the front.
`;
  }

  return `
As an expert cinematic photo editor, visual effects compositor, and lighting director, your task is to realistically re-render and edit this photograph based on the user's specified light sources and layering settings.
Deterministic scene identifier: ${sceneHash}. Treat identical scene identifiers and source pixels as the same lighting setup.
The user has placed interactive light source markers on the canvas. You must synthesize these light sources into the image, casting realistic illumination, highlights, volumetric rays, or lens effects onto the objects, faces, and backgrounds.

Pay special attention to standard optical properties and subject layering:
- **Depth and Subject Isolation**: Carefully isolate the primary subject from the background. Background-placed lights must go behind the subject, casting light onto the rear environment, wall, or sky while outlining the subject. Foreground-placed lights must illuminate the subject from the front or side.
- Soft or sharp shadows cast in the opposite direction of the light sources.
- Highlights, rim-lighting, and reflections on glossy, metallic, hair, or physical edge surfaces matching the respective light colors.
- Ambient light bouncing and volumetric scattering based on the intensity and depth of field.
- **Preview parity is mandatory**: preserve every light's normalized anchor, footprint radius, orientation, hue, layer placement, and relative strength exactly as specified. Do not invent, delete, merge, or relocate light sources. Treat the marker coordinates as image-space coordinates, not suggestions.
- The edited photo MUST remain completely photorealistic, high quality, and professional without any added watermarks, text, or distorted shapes.
- **ABSOLUTELY ZERO TEXT OR STAT OVERLAYS**: Do NOT render any text, stats, numbers, coordinate labels, watermark text, HUD overlays, or badges onto the image pixels. Return ONLY the clean, photorealistic edited photograph.
${hasControlMaps ? `- Five guide images follow the source in this exact order: LIGHT INTENSITY, LIGHT COLOR, LIGHT DIRECTION/Z, SCENE DEPTH, SUBJECT MASK. They are normalized image-space control maps, not aesthetic references. Obey their pixel locations, preserve the source composition, and do not copy guide-map colors as visible artifacts.` : ""}
${isolationContext}

Light Source Instructions:
${lightDescriptions}

Please process the image and return the newly lit, high-quality, clean edited version without any text or stat overlays.
`;
}

// API endpoint for image lighting generation
app.post("/api/edit-image", requireApiAccess, async (req, res) => {
  try {
    const { image, lights, subjectBounds, model, controlMaps, sceneHash } = validateGenerationRequest(req.body);
    const { mimeType, base64Data } = image.startsWith("https://")
      ? await downloadAllowedImage(image)
      : decodeDataImage(image);
    const activeLights = (lights || []).filter((l: any) => l.enabled !== false);
    const prompt = constructPrompt(activeLights, subjectBounds, sceneHash, Boolean(controlMaps));
    const parts: any[] = [{ inlineData: { data: base64Data, mimeType } }];
    if (controlMaps) {
      for (const key of CONTROL_MAP_KEYS) {
        const decoded = decodeDataImage(controlMaps[key]);
        parts.push({ text: `CONTROL MAP: ${key}` });
        parts.push({ inlineData: { data: decoded.base64Data, mimeType: decoded.mimeType } });
      }
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts,
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      return res.status(500).json({ error: "Model failed to return any content candidates." });
    }

    let editedImageUrl: string | null = null;
    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        editedImageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!editedImageUrl) {
      const textResponse = candidate.content.parts.find(p => p.text)?.text;
      return res.status(500).json({
        error: textResponse || "No image returned by the AI model. Try adjusting light parameters."
      });
    }

    return res.json({
      editedImage: editedImageUrl,
      metadata: {
        sceneHash,
        renderId: `${sceneHash}-${model}`,
        generatedAt: new Date().toISOString(),
        model,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/edit-image:", error);
    const isClientError =
      error instanceof Error &&
      /^(No image|Lights|A maximum|Subject bounds|Each light|Invalid |The requested|Unsupported image|Image must|Remote image|Failed to fetch)/.test(
        error.message
      );
    return res.status(isClientError ? 400 : 500).json({
      error: isClientError
        ? error.message
        : "Image generation failed. Please try again later.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "lumina-light-studio" });
});

// Vite middleware for development or serving static files for production
async function startServer() {
  if (process.env.NODE_ENV === "production" && API_ACCESS_TOKEN.length < 32) {
    throw new Error("API_ACCESS_TOKEN is required in production and must contain at least 32 characters.");
  }
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.WEB_DIST_PATH || path.join(process.cwd(), "dist", "web");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(
    (
      error: Error & { type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (error.message === "Origin is not allowed by CORS policy.") {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error.type === "entity.too.large") {
        res.status(413).json({ error: "Request body is too large." });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Request body contains invalid JSON." });
        return;
      }

      console.error("Unhandled server error:", error);
      res.status(500).json({ error: "Unexpected server error." });
    }
  );

  app.listen(PORT, SERVER_HOST, () => {
    console.log(`Server running on http://${SERVER_HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exitCode = 1;
});
